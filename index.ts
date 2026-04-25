#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { fetchPage, fetchDetail, mergeDetail, type FetchStats } from './infoimoveis.js';
import {
  applyFilters,
  scoreListings,
  sortListings,
  deduplicate,
} from './filter.js';
import { printTerminal, toJson, toCsv, toHtml } from './format.js';
import {
  loadState,
  saveState,
  recordSeen,
  resetState,
  addBlocked,
  removeBlocked,
  clearBlocked,
  listBlocked,
  STATE_FILE,
} from './state.js';
import { clearCache, cacheStats } from './cache.js';
import type { SearchFilters, PropertyType, Transaction, SortBy, Listing } from './types.js';

const program = new Command();

program
  .name('casa-finder')
  .description('Busca imóveis no InfoImóveis com filtros, scoring, cache e relatório HTML')
  .version('0.3.0');

program
  .option('-t, --transaction <type>', 'aluguel | venda', 'aluguel')
  .option(
    '-p, --property <type>',
    'casa | casa-terrea | casa-condominio | apartamento | sobrado | kitnet | sitio | chacara | terreno | imovel-comercial',
    'casa'
  )
  .option('--state <uf>', 'UF (sigla minúscula)', 'ms')
  .option('--city <slug>', 'cidade (slug, ex: campo-grande)', 'campo-grande')
  .option('--price-min <n>', 'preço mínimo em R$', (v) => Number(v))
  .option('--price-max <n>', 'preço máximo em R$', (v) => Number(v))
  .option('--area-min <n>', 'área mínima em m²', (v) => Number(v))
  .option('--area-max <n>', 'área máxima em m²', (v) => Number(v))
  .option('--bedrooms-min <n>', 'quartos mínimos', (v) => Number(v))
  .option('--parking-min <n>', 'vagas mínimas', (v) => Number(v))
  .option('--keyword <text>', 'palavra-chave no título/descrição')
  .option(
    '--neighborhoods <list>',
    'whitelist de bairros (filtra) — em ordem de preferência (CSV)',
    (v: string) => v.split(',').map((s) => s.trim())
  )
  .option(
    '--exclude-neighborhoods <list>',
    'blacklist ad-hoc de bairros (CSV) — soma com a persistida',
    (v: string) => v.split(',').map((s) => s.trim())
  )
  .option('--prefer <type>', 'tipo preferido (bônus no score, não filtra)')
  .option('--sort-by <key>', 'score | neighborhood | price | area | ppsm', 'score')
  .option('--max-pages <n>', 'páginas a buscar', (v) => Number(v), 5)
  .option('--no-enrich', 'pula fetch de detalhe (rápido, score raso)')
  .option('--only-new', 'mostra apenas imóveis não vistos em runs anteriores')
  .option('--reset-seen', 'limpa o histórico de imóveis vistos antes de rodar')
  .option('--refresh', 'ignora o cache e refaz todas as requests à API')
  .option('--block <neighborhood>', 'adiciona bairro à blacklist persistida e sai')
  .option('--unblock <neighborhood>', 'remove bairro da blacklist persistida e sai')
  .option('--blocked-list', 'lista bairros bloqueados e sai')
  .option('--blocked-clear', 'limpa toda a blacklist persistida e sai')
  .option('--cache-clear', 'apaga o cache local e sai')
  .option('--format <fmt>', 'terminal | json | csv | html', 'terminal')
  .option('--output <file>', 'salvar resultado em arquivo')
  .option('--limit <n>', 'limitar quantidade de resultados', (v) => Number(v))
  .action(async (opts) => {
    // ---------- Comandos curtos (saem antes de buscar) ----------
    if (opts.cacheClear) {
      const { removed, bytes } = clearCache();
      console.log(chalk.green(`✓ cache limpo: ${removed} arquivos (${(bytes / 1024).toFixed(0)}KB)`));
      return;
    }

    if (opts.block) {
      const next = addBlocked(loadState(), opts.block);
      saveState(next);
      console.log(chalk.green(`✓ bloqueado: "${opts.block}"`));
      console.log(chalk.gray(`  blacklist atual: ${listBlocked(next).join(', ') || '(vazia)'}`));
      return;
    }

    if (opts.unblock) {
      const next = removeBlocked(loadState(), opts.unblock);
      saveState(next);
      console.log(chalk.green(`✓ desbloqueado: "${opts.unblock}"`));
      console.log(chalk.gray(`  blacklist atual: ${listBlocked(next).join(', ') || '(vazia)'}`));
      return;
    }

    if (opts.blockedClear) {
      saveState(clearBlocked(loadState()));
      console.log(chalk.green('✓ blacklist persistida zerada'));
      return;
    }

    if (opts.blockedList) {
      const blocked = listBlocked(loadState());
      if (blocked.length === 0) {
        console.log(chalk.gray('(nenhum bairro bloqueado)'));
      } else {
        console.log(chalk.bold(`${blocked.length} bairro(s) bloqueado(s):`));
        blocked.forEach((b) => console.log(`  · ${b}`));
      }
      return;
    }

    if (opts.resetSeen) {
      resetState();
      console.log(chalk.gray('✓ histórico de vistos zerado'));
    }

    // ---------- Validações de entrada ----------
    const validSorts: SortBy[] = ['score', 'neighborhood', 'price', 'area', 'ppsm'];
    if (!validSorts.includes(opts.sortBy)) {
      console.error(chalk.red(`✗ --sort-by inválido: "${opts.sortBy}". Use: ${validSorts.join(', ')}`));
      process.exit(1);
    }

    const state = loadState();

    // Mescla blacklist persistida com a ad-hoc (union, sem duplicar)
    const persistedExcluded = state.excludedNeighborhoods ?? [];
    const adhocExcluded = (opts.excludeNeighborhoods as string[] | undefined) ?? [];
    const allExcluded = Array.from(new Set([...persistedExcluded, ...adhocExcluded]));

    const filters: SearchFilters = {
      transaction: opts.transaction as Transaction,
      propertyType: opts.property as PropertyType,
      state: opts.state,
      city: opts.city,
      priceMin: opts.priceMin,
      priceMax: opts.priceMax,
      areaMin: opts.areaMin,
      areaMax: opts.areaMax,
      bedroomsMin: opts.bedroomsMin,
      parkingMin: opts.parkingMin,
      keyword: opts.keyword,
      neighborhoods: opts.neighborhoods,
      excludeNeighborhoods: allExcluded.length > 0 ? allExcluded : undefined,
      maxPages: opts.maxPages,
      typePreference: opts.prefer as PropertyType | undefined,
      sortBy: opts.sortBy as SortBy,
    };

    console.log(chalk.bold(`\n🔍 ${filters.propertyType} para ${filters.transaction} em ${filters.city}/${filters.state.toUpperCase()}`));
    if (filters.priceMin || filters.priceMax) {
      console.log(chalk.gray(`   R$${filters.priceMin ?? 0}–${filters.priceMax ?? '∞'}/mês`));
    }
    if (persistedExcluded.length > 0) {
      console.log(chalk.gray(`   🚫 ${persistedExcluded.length} bairro(s) bloqueado(s): ${persistedExcluded.join(', ')}`));
    }
    if (filters.typePreference) {
      console.log(chalk.gray(`   ⭐ preferência: ${filters.typePreference}`));
    }
    if (opts.refresh) {
      console.log(chalk.yellow(`   🔄 refresh ativo — cache ignorado`));
    }
    console.log();

    // ---------- Fase 1: listagem paginada ----------
    const allListings: Listing[] = [];
    const errors: string[] = [];
    const listStats: FetchStats = { cached: 0, fresh: 0 };

    for (let page = 1; page <= (filters.maxPages ?? 5); page++) {
      const spinner = ora(`Buscando página ${page}...`).start();
      try {
        const { listings, hasNextPage } = await fetchPage(filters, page, {
          refresh: !!opts.refresh,
          stats: listStats,
        });
        allListings.push(...listings);
        spinner.succeed(`Página ${page}: ${listings.length} imóveis`);
        if (!hasNextPage) {
          spinner.info('Última página alcançada');
          break;
        }
      } catch (err) {
        const msg = (err as Error).message;
        spinner.fail(`Página ${page}: ${msg}`);
        errors.push(`Página ${page}: ${msg}`);
        if (page === 1) break;
      }
    }
    console.log(chalk.dim(`📦 listagem: ${listStats.cached} cache hits / ${listStats.fresh} fresh`));

    let listings = deduplicate(allListings);
    listings = applyFilters(listings, filters);

    // ---------- Fase 2: filtra "já vistos" se solicitado ----------
    if (opts.onlyNew) {
      const seenSet = new Set(state.seen);
      const before = listings.length;
      listings = listings.filter((l) => !seenSet.has(l.id));
      console.log(
        chalk.gray(
          `   ${before - listings.length} já vistos foram filtrados (${listings.length} novos)`
        )
      );
    }

    // ---------- Fase 3: enrichment (detalhe por imóvel) ----------
    if (opts.enrich !== false && listings.length > 0) {
      console.log(chalk.gray(`\nEnriquecendo ${listings.length} imóveis com detalhes...`));
      const detailStats: FetchStats = { cached: 0, fresh: 0 };
      const spinner = ora('').start();
      const enriched: Listing[] = [];
      for (let i = 0; i < listings.length; i++) {
        const l = listings[i]!;
        spinner.text = `[${i + 1}/${listings.length}] ${l.title.slice(0, 50)}`;
        try {
          const detail = await fetchDetail(l.id, {
            refresh: !!opts.refresh,
            stats: detailStats,
          });
          enriched.push(detail ? mergeDetail(l, detail) : l);
        } catch (err) {
          enriched.push(l);
          errors.push(`Detalhe ${l.id}: ${(err as Error).message}`);
        }
      }
      spinner.succeed(`Detalhes carregados (${enriched.filter((l) => l.enriched).length}/${enriched.length})`);
      console.log(chalk.dim(`📦 detalhes: ${detailStats.cached} cache hits / ${detailStats.fresh} fresh`));
      listings = enriched;
    }

    // ---------- Fase 4: score + sort ----------
    listings = scoreListings(listings, filters);
    listings = sortListings(listings, filters.sortBy ?? 'score');

    // Log de preferência aplicada
    if (filters.typePreference) {
      const matched = listings.filter((l) => (l.scoreBreakdown?.preferencia ?? 0) > 0).length;
      console.log(chalk.dim(`⭐ preferência por ${filters.typePreference}: bônus em ${matched}/${listings.length} imóveis`));
    }

    const final = opts.limit ? listings.slice(0, opts.limit) : listings;

    console.log(
      chalk.dim(
        `\n${allListings.length} brutos · ${listings.length} após filtros · ${final.length} exibidos`
      )
    );

    // ---------- Fase 5: persistir vistos ----------
    const newState = recordSeen(state, listings.map((l) => l.id));
    saveState(newState);
    if (!opts.onlyNew) {
      const cs = cacheStats();
      console.log(chalk.dim(`(${newState.seen.length} no histórico · cache: ${cs.count} arquivos / ${(cs.bytes / 1024).toFixed(0)}KB · ${STATE_FILE})\n`));
    }

    // ---------- Fase 6: output ----------
    if (opts.format === 'json') {
      const json = toJson(final);
      if (opts.output) {
        writeFileSync(opts.output, json);
        console.log(chalk.green(`✓ ${final.length} imóveis salvos em ${opts.output}`));
      } else {
        console.log(json);
      }
    } else if (opts.format === 'csv') {
      const csv = toCsv(final);
      if (opts.output) {
        writeFileSync(opts.output, csv);
        console.log(chalk.green(`✓ ${final.length} imóveis salvos em ${opts.output}`));
      } else {
        console.log(csv);
      }
    } else if (opts.format === 'html') {
      const html = toHtml(final, filters);
      const outputPath = opts.output ?? 'casas.html';
      writeFileSync(outputPath, html);
      console.log(chalk.green(`✓ Relatório HTML em ${outputPath}`));
      console.log(chalk.gray(`  Abre no navegador: file://${process.cwd().replace(/\\/g, '/')}/${outputPath}`));
    } else {
      printTerminal(final);
    }

    if (errors.length) {
      console.log(chalk.yellow(`\n⚠ ${errors.length} aviso(s):`));
      errors.slice(0, 5).forEach((e) => console.log(chalk.yellow(`  · ${e}`)));
      if (errors.length > 5) console.log(chalk.yellow(`  ... e mais ${errors.length - 5}`));
    }
  });

program.parseAsync().catch((err) => {
  console.error(chalk.red(`\n✗ Erro fatal: ${(err as Error).message}\n`));
  process.exit(1);
});
