import chalk from 'chalk';
import type { Listing, SearchFilters } from './types.js';

const fmtBRL = (n: number | undefined): string =>
  n && n > 0
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '—';

export function printTerminal(listings: Listing[]): void {
  if (listings.length === 0) {
    console.log(chalk.yellow('\nNenhum imóvel passou nos filtros.\n'));
    return;
  }

  console.log(
    chalk.bold(`\n📍 ${listings.length} imóvel(is) encontrado(s) (ordenados por score):\n`)
  );

  listings.forEach((l, i) => {
    const score = l.score ?? 0;
    const scoreColor = score >= 75 ? chalk.green : score >= 55 ? chalk.yellow : chalk.gray;

    console.log(
      `${chalk.bold.cyan(`#${i + 1}`)} ${scoreColor(`[${score}]`)} ${chalk.bold(l.title)}`
    );

    const specs: string[] = [];
    if (l.bedrooms) specs.push(`${l.bedrooms} qto`);
    if (l.suites) specs.push(`${l.suites} suíte`);
    if (l.bathrooms) specs.push(`${l.bathrooms} banh`);
    if (l.parkingSpaces) specs.push(`${l.parkingSpaces} vaga`);
    if (l.area) specs.push(`${l.area}m²`);
    if (specs.length) console.log(`   ${chalk.gray(specs.join(' · '))}`);

    let priceLine = `   ${chalk.bold(fmtBRL(l.price))}`;
    if (l.condoFee) priceLine += chalk.gray(`  + cond. ${fmtBRL(l.condoFee)}`);
    if (l.iptu) priceLine += chalk.gray(`  + IPTU ${fmtBRL(l.iptu)}`);
    if (l.totalMonthly && l.totalMonthly !== l.price)
      priceLine += chalk.gray(`  = ${fmtBRL(l.totalMonthly)}/mês`);
    console.log(priceLine);

    if (l.pricePerSqm) console.log(chalk.gray(`   R$${l.pricePerSqm}/m²`));
    if (l.neighborhood) console.log(`   ${chalk.gray(`📍 ${l.neighborhood}`)}`);
    if (l.scoreReasons?.length) {
      console.log(`   ${chalk.dim(`✓ ${l.scoreReasons.join(', ')}`)}`);
    }
    console.log(`   ${chalk.blue.underline(l.url)}`);
    console.log();
  });
}

export function toJson(listings: Listing[]): string {
  return JSON.stringify(listings, null, 2);
}

export function toCsv(listings: Listing[]): string {
  const headers = [
    'score',
    'title',
    'price',
    'condoFee',
    'iptu',
    'totalMonthly',
    'pricePerSqm',
    'bedrooms',
    'suites',
    'bathrooms',
    'parkingSpaces',
    'area',
    'neighborhood',
    'address',
    'url',
  ];

  const escape = (v: string | number | undefined): string => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = listings.map((l) =>
    [
      l.score,
      l.title,
      l.price,
      l.condoFee,
      l.iptu,
      l.totalMonthly,
      l.pricePerSqm,
      l.bedrooms,
      l.suites,
      l.bathrooms,
      l.parkingSpaces,
      l.area,
      l.neighborhood,
      l.address,
      l.url,
    ]
      .map(escape)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

// ---------- HTML report ----------

function esc(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scoreClass(score: number): string {
  if (score >= 80) return 'score-great';
  if (score >= 65) return 'score-good';
  if (score >= 50) return 'score-ok';
  return 'score-low';
}

function renderCard(l: Listing, idx: number, showTypeBadge: boolean): string {
  const score = l.score ?? 0;
  const photos = l.photos && l.photos.length > 0 ? l.photos : l.thumbnailUrl ? [l.thumbnailUrl] : [];
  const mainPhoto = photos[0];
  const breakdown = l.scoreBreakdown;
  const breakdownStr = breakdown
    ? `Preço ${breakdown.preco} · R$/m² ${breakdown.precoM2} · Layout ${breakdown.layout} · Bairro ${breakdown.bairro} · Área ${breakdown.area} · Amenidades ${breakdown.amenidades} · Info ${breakdown.completude} · Pref ${breakdown.preferencia} · Penal ${breakdown.penalidades}`
    : '';

  const specs: string[] = [];
  if (l.bedrooms) specs.push(`${l.bedrooms} qto`);
  if (l.suites) specs.push(`${l.suites} suíte`);
  if (l.bathrooms) specs.push(`${l.bathrooms} banh`);
  if (l.parkingSpaces) specs.push(`${l.parkingSpaces} vaga`);
  if (l.area) specs.push(`${l.area}m²`);

  const costLine: string[] = [`<strong>${esc(fmtBRL(l.price))}</strong>`];
  if (l.condoFee) costLine.push(`+ cond. ${esc(fmtBRL(l.condoFee))}`);
  if (l.iptu) costLine.push(`+ IPTU ${esc(fmtBRL(l.iptu))}`);
  if (l.totalMonthly && l.totalMonthly !== l.price)
    costLine.push(`<strong>= ${esc(fmtBRL(l.totalMonthly))}/mês</strong>`);

  const photosHtml = photos
    .map(
      (p, i) =>
        `<img loading="lazy" src="${esc(p)}" alt="foto ${i + 1}" class="thumb">`
    )
    .join('');

  const neighborhoodAttr = (l.neighborhood ?? '').toLocaleLowerCase('pt-BR');
  const typeBadgeHtml =
    showTypeBadge && l.apiType
      ? `<div class="badge type-badge">${esc(l.apiType)}</div>`
      : '';

  return `
<article class="card ${scoreClass(score)}" data-id="${esc(l.id)}" data-score="${score}" data-price="${l.totalMonthly ?? l.price}" data-area="${l.area ?? 0}" data-ppsm="${l.pricePerSqm ?? 0}" data-neighborhood="${esc(neighborhoodAttr)}">
  <div class="card-photo">
    ${mainPhoto ? `<img loading="lazy" src="${esc(mainPhoto)}" alt="">` : '<div class="no-photo">sem foto</div>'}
    <div class="badge score-badge">${score}</div>
    <div class="badge rank">#${idx + 1}</div>
    ${typeBadgeHtml}
    <div class="actions">
      <button class="btn-mark" data-mark="liked" title="Gostei">⭐</button>
      <button class="btn-mark" data-mark="maybe" title="Talvez">❓</button>
      <button class="btn-mark" data-mark="hidden" title="Esconder">❌</button>
    </div>
  </div>
  <div class="card-body">
    <h2>${esc(l.title)}</h2>
    <div class="specs">${specs.map(esc).join(' · ')}</div>
    <div class="cost">${costLine.join(' ')}</div>
    ${l.pricePerSqm ? `<div class="ppsm">R$${l.pricePerSqm}/m² aluguel</div>` : ''}
    ${l.neighborhood ? `<div class="hood">📍 ${esc(l.neighborhood)}${l.address ? ' — ' + esc(l.address) : ''}</div>` : ''}
    ${l.scoreReasons && l.scoreReasons.length ? `<div class="reasons">✓ ${esc(l.scoreReasons.join(' · '))}</div>` : ''}
    <details class="more">
      <summary>Mais detalhes</summary>
      ${l.description ? `<p class="desc">${esc(l.description)}</p>` : ''}
      ${l.features && l.features.length ? `<div class="features"><strong>Características:</strong> ${l.features.map(esc).join(' · ')}</div>` : ''}
      ${l.nearby && l.nearby.length ? `<div class="nearby"><strong>Próximo:</strong> ${l.nearby.map(esc).join(' · ')}</div>` : ''}
      ${photos.length > 1 ? `<div class="gallery">${photosHtml}</div>` : ''}
      ${l.agency ? `<div class="agency">Anunciante: ${esc(l.agency)}</div>` : ''}
      ${breakdownStr ? `<div class="breakdown">Score: ${esc(breakdownStr)}</div>` : ''}
    </details>
    <div class="card-footer">
      <a class="btn-open" href="${esc(l.url)}" target="_blank" rel="noopener">Abrir anúncio ↗</a>
      ${l.latitude && l.longitude ? `<a class="btn-map" href="https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}" target="_blank" rel="noopener">Mapa</a>` : ''}
    </div>
  </div>
</article>`;
}

export function toHtml(listings: Listing[], filters: SearchFilters): string {
  const generatedAt = new Date().toLocaleString('pt-BR');
  const filterSummary = [
    `${filters.transaction} de ${filters.propertyType} em ${filters.city}/${filters.state.toUpperCase()}`,
    filters.priceMin || filters.priceMax
      ? `R$${filters.priceMin ?? '0'}–${filters.priceMax ?? '∞'}`
      : '',
    filters.bedroomsMin ? `${filters.bedroomsMin}+ quartos` : '',
    filters.parkingMin ? `${filters.parkingMin}+ vagas` : '',
    filters.areaMin ? `${filters.areaMin}m²+` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // Mostra o badge de tipo apenas quando há mistura no resultado
  const distinctTypes = new Set(listings.map((l) => l.apiType).filter(Boolean));
  const showTypeBadge = distinctTypes.size > 1;

  const cardsHtml = listings.map((l, i) => renderCard(l, i, showTypeBadge)).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>casa-finder · ${esc(filterSummary)}</title>
<style>
  :root {
    --bg: #0f1419;
    --card: #1a1f26;
    --card-hover: #232a33;
    --border: #2c333d;
    --text: #e6e6e6;
    --text-dim: #8a96a4;
    --accent: #4ea1ff;
    --great: #2dd4bf;
    --good: #84cc16;
    --ok: #fbbf24;
    --low: #6b7280;
    --gold: #fbbf24;
    --maybe: #a78bfa;
    --hide: #475569;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
  }
  header {
    position: sticky; top: 0; z-index: 10;
    background: rgba(15,20,25,0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
  }
  header h1 { margin: 0 0 4px; font-size: 18px; }
  header .meta { color: var(--text-dim); font-size: 12px; }
  header .toolbar { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .toolbar button {
    background: var(--card); color: var(--text); border: 1px solid var(--border);
    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  .toolbar button:hover { background: var(--card-hover); }
  .toolbar button.active { background: var(--accent); border-color: var(--accent); color: #0f1419; }
  .type-badge { top: 48px; right: 12px; background: rgba(78, 161, 255, 0.85); color: #0f1419; font-size: 11px; }
  .toolbar .count { color: var(--text-dim); margin-left: auto; font-size: 12px; }
  main {
    padding: 24px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 20px;
    max-width: 1800px;
    margin: 0 auto;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.15s, border-color 0.15s;
  }
  .card:hover { transform: translateY(-2px); border-color: var(--accent); }
  .card.liked { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
  .card.maybe { border-color: var(--maybe); }
  .card.hidden { opacity: 0.25; }
  .card-photo {
    position: relative;
    aspect-ratio: 4/3;
    background: #000;
    overflow: hidden;
  }
  .card-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .no-photo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-dim); }
  .badge {
    position: absolute;
    padding: 4px 10px;
    border-radius: 16px;
    font-weight: 700;
    font-size: 13px;
    background: rgba(0,0,0,0.7);
  }
  .score-badge { top: 12px; right: 12px; font-size: 16px; }
  .rank { top: 12px; left: 12px; color: var(--text-dim); font-size: 11px; }
  .score-great .score-badge { background: var(--great); color: #0f1419; }
  .score-good .score-badge { background: var(--good); color: #0f1419; }
  .score-ok .score-badge { background: var(--ok); color: #0f1419; }
  .score-low .score-badge { background: var(--low); color: #fff; }
  .actions {
    position: absolute; bottom: 8px; right: 8px;
    display: flex; gap: 4px;
  }
  .actions button {
    width: 32px; height: 32px;
    background: rgba(0,0,0,0.7);
    border: none; border-radius: 50%;
    cursor: pointer; font-size: 14px;
    color: white;
  }
  .actions button:hover { background: rgba(0,0,0,0.95); transform: scale(1.1); }
  .actions button.active { background: var(--accent); }
  .card-body { padding: 14px 16px; flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .card-body h2 { font-size: 15px; margin: 0; line-height: 1.3; font-weight: 600; }
  .specs { color: var(--text-dim); font-size: 12px; }
  .cost { font-size: 14px; }
  .cost strong { color: var(--accent); }
  .ppsm { color: var(--text-dim); font-size: 11px; }
  .hood { color: var(--text-dim); font-size: 12px; }
  .reasons { color: var(--great); font-size: 12px; }
  .more { font-size: 12px; color: var(--text-dim); margin-top: auto; }
  .more summary { cursor: pointer; user-select: none; padding: 4px 0; }
  .more summary:hover { color: var(--accent); }
  .desc { line-height: 1.5; color: var(--text); margin: 8px 0; }
  .features, .nearby, .agency, .breakdown { margin: 6px 0; line-height: 1.5; }
  .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 8px 0; }
  .gallery .thumb { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 4px; }
  .card-footer { display: flex; gap: 8px; margin-top: 8px; }
  .btn-open, .btn-map {
    flex: 1; text-align: center; padding: 8px;
    background: var(--accent); color: #0f1419;
    text-decoration: none; border-radius: 6px;
    font-weight: 600; font-size: 13px;
  }
  .btn-map { background: var(--card-hover); color: var(--text); border: 1px solid var(--border); }
  .btn-open:hover { background: #6cb3ff; }
  .empty { text-align: center; padding: 60px; color: var(--text-dim); }
</style>
</head>
<body>
<header>
  <h1>casa-finder · ${esc(filterSummary)}</h1>
  <div class="meta">${listings.length} imóveis · gerado em ${esc(generatedAt)}</div>
  <div class="toolbar">
    <button data-sort="score" class="active">Score</button>
    <button data-sort="neighborhood">Bairro</button>
    <button data-sort="price">Preço total</button>
    <button data-sort="ppsm">R$/m²</button>
    <button data-sort="area">Área</button>
    <span class="count" id="visible-count"></span>
    <button data-filter="liked">⭐ Só favoritos</button>
    <button data-filter="maybe">❓ Talvez</button>
    <button data-filter="unmarked">Não marcados</button>
    <button data-filter="show-hidden">Mostrar ocultos</button>
    <button data-filter="all" class="active">Tudo</button>
  </div>
</header>
<main id="grid">
${cardsHtml || '<div class="empty">Nenhum imóvel passou nos filtros.</div>'}
</main>
<script>
(function() {
  const STORAGE = 'casa-finder-marks';
  let marks = {};
  try { marks = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch {}

  const grid = document.getElementById('grid');
  const cards = Array.from(grid.querySelectorAll('.card'));

  function applyMark(card, mark) {
    card.classList.remove('liked', 'maybe', 'hidden');
    if (mark) card.classList.add(mark);
    card.querySelectorAll('.btn-mark').forEach(b => {
      b.classList.toggle('active', b.dataset.mark === mark);
    });
  }
  function setMark(id, mark) {
    if (mark) marks[id] = mark; else delete marks[id];
    localStorage.setItem(STORAGE, JSON.stringify(marks));
  }

  // Restore marks
  cards.forEach(c => applyMark(c, marks[c.dataset.id]));

  // Mark buttons
  cards.forEach(card => {
    card.querySelectorAll('.btn-mark').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const id = card.dataset.id;
        const mark = btn.dataset.mark;
        const newMark = marks[id] === mark ? null : mark;
        setMark(id, newMark);
        applyMark(card, newMark);
      });
    });
  });

  // Sort
  function sortBy(key) {
    if (key === 'neighborhood') {
      const sorted = [...cards].sort((a, b) => {
        const an = a.dataset.neighborhood || '';
        const bn = b.dataset.neighborhood || '';
        const cmp = an.localeCompare(bn, 'pt-BR');
        if (cmp !== 0) return cmp;
        return (parseFloat(b.dataset.score) || 0) - (parseFloat(a.dataset.score) || 0);
      });
      sorted.forEach(c => grid.appendChild(c));
      return;
    }
    const sign = key === 'score' || key === 'area' ? -1 : 1;
    const sorted = [...cards].sort((a, b) => {
      const av = parseFloat(a.dataset[key]) || 0;
      const bv = parseFloat(b.dataset[key]) || 0;
      if (av === 0 && bv !== 0) return 1;
      if (bv === 0 && av !== 0) return -1;
      return (av - bv) * sign;
    });
    sorted.forEach(c => grid.appendChild(c));
  }
  document.querySelectorAll('[data-sort]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      sortBy(b.dataset.sort);
    });
  });

  // Filter
  let showHidden = false;
  function applyFilter(filter) {
    let visible = 0;
    cards.forEach(c => {
      const id = c.dataset.id;
      const mark = marks[id];
      let show = true;
      if (filter === 'liked') show = mark === 'liked';
      else if (filter === 'maybe') show = mark === 'maybe';
      else if (filter === 'unmarked') show = !mark;
      else if (filter === 'all') show = mark !== 'hidden' || showHidden;
      else show = true;
      if (mark === 'hidden' && !showHidden && filter !== 'liked' && filter !== 'maybe') show = false;
      c.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    document.getElementById('visible-count').textContent = visible + ' visíveis';
  }
  document.querySelectorAll('[data-filter]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.filter === 'show-hidden') {
        showHidden = !showHidden;
        b.classList.toggle('active', showHidden);
        applyFilter('all');
        return;
      }
      document.querySelectorAll('[data-filter]:not([data-filter="show-hidden"])').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      applyFilter(b.dataset.filter);
    });
  });
  applyFilter('all');
})();
</script>
</body>
</html>`;
}
