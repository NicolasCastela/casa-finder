import type { Listing, PropertyType, ScoreBreakdown, SearchFilters, SortBy } from './types.js';
import { slugify } from './parse.js';

/**
 * Mapeia slug de PropertyType (CLI) → set de valores `tipo` exatos da API.
 * Espelha TIPO_MAP de infoimoveis.ts mas é local pra evitar dependência circular
 * (filter não deve importar de infoimoveis).
 */
const TIPO_PREFERENCE_MAP: Record<PropertyType, string[]> = {
  casa: ['Casa-Térrea', 'Casa-Térrea-Condomínio', 'Sobrado', 'Sobrado-Condomínio'],
  'casa-terrea': ['Casa-Térrea'],
  'casa-condominio': ['Casa-Térrea-Condomínio', 'Sobrado-Condomínio'],
  apartamento: ['Apartamento'],
  sobrado: ['Sobrado', 'Sobrado-Condomínio'],
  kitnet: ['Kitnet', 'Apart Hotel / Flat / Loft'],
  sitio: ['Sítio'],
  chacara: ['Chácara'],
  terreno: ['Terreno', 'Terreno-Condomínio'],
  'imovel-comercial': [
    'Imóvel Comercial',
    'Sala / Salão / Loja',
    'Casa Comercial',
    'Galpão / Depósito',
  ],
};

/**
 * Aplica filtros pós-fetch (a API ignora vários params silenciosamente).
 * Retorna apenas listings que passam em TODOS os critérios definidos.
 */
export function applyFilters(listings: Listing[], filters: SearchFilters): Listing[] {
  return listings.filter((l) => {
    if (filters.priceMin && l.price && l.price < filters.priceMin) return false;
    if (filters.priceMax && l.price && l.price > filters.priceMax) return false;

    if (filters.areaMin && l.area && l.area < filters.areaMin) return false;
    if (filters.areaMax && l.area && l.area > filters.areaMax) return false;

    if (filters.bedroomsMin && (l.bedrooms ?? 0) < filters.bedroomsMin) return false;
    if (filters.parkingMin && (l.parkingSpaces ?? 0) < filters.parkingMin) return false;

    if (filters.neighborhoods?.length && l.neighborhood) {
      const target = slugify(l.neighborhood);
      const wanted = filters.neighborhoods.map(slugify);
      if (!wanted.some((w) => target.includes(w))) return false;
    }

    if (filters.excludeNeighborhoods?.length && l.neighborhood) {
      const target = slugify(l.neighborhood);
      const blocked = filters.excludeNeighborhoods.map(slugify);
      if (blocked.some((b) => target.includes(b))) return false;
    }

    if (filters.keyword) {
      const haystack = `${l.title} ${l.description ?? ''}`.toLowerCase();
      if (!haystack.includes(filters.keyword.toLowerCase())) return false;
    }

    return true;
  });
}

/**
 * Score v2 — 0 a 100, com breakdown explícito por categoria.
 *
 * Pesos (max possível):
 *   preco        30  — quão abaixo do teto está o custo total mensal
 *   precoM2      15  — R$/m² relativo à mediana do conjunto
 *   layout       20  — quartos/vagas/suítes além do mínimo pedido
 *   bairro       20  — match na lista de bairros preferidos
 *   area         10  — área generosa vs mínimo
 *   amenidades   10  — features positivas (quintal, suíte, churrasqueira...)
 *   completude    5  — foto, descrição rica, características listadas
 *   penalidades   0 ou negativo
 *
 * Score final = clamp(0, 100, soma).
 */

const POSITIVE_KEYWORDS = [
  { kw: /quintal|área externa|area externa|jardim/i, label: 'quintal/jardim', pts: 3 },
  { kw: /churrasqu/i, label: 'churrasqueira', pts: 2 },
  { kw: /piscina/i, label: 'piscina', pts: 1 },
  { kw: /mobiliad/i, label: 'mobiliado', pts: 1 },
  { kw: /pet|aceita animal|animais/i, label: 'aceita pet', pts: 2 },
  { kw: /condom[ií]nio fechado|portaria 24/i, label: 'condomínio fechado', pts: 1 },
  { kw: /reformad|novo|novinho/i, label: 'reformado/novo', pts: 1 },
  { kw: /escola|colégio/i, label: 'escola próx.', pts: 1 },
  { kw: /mercado|supermercado/i, label: 'mercado próx.', pts: 1 },
];

const FEATURE_BONUS = [
  { kw: /su[ií]te/i, pts: 1 },
  { kw: /churrasqueira/i, pts: 1 },
  { kw: /piscina/i, pts: 1 },
  { kw: /quintal|jardim/i, pts: 2 },
  { kw: /mobiliad|semi.?mobiliad/i, pts: 1 },
  { kw: /closet/i, pts: 1 },
  { kw: /lavabo/i, pts: 1 },
  { kw: /portaria 24h?/i, pts: 1 },
];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function quartiles(values: number[]): { q1: number; q3: number } {
  if (values.length < 4) return { q1: 0, q3: Infinity };
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
  const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
  return { q1, q3 };
}

export function scoreListings(listings: Listing[], filters: SearchFilters): Listing[] {
  // Estatísticas do conjunto pra scoring relativo
  const ppsm = listings
    .map((l) => l.pricePerSqm)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const ppsmMedian = median(ppsm);
  const { q1: ppsmQ1, q3: ppsmQ3 } = quartiles(ppsm);

  const preferredTipos = filters.typePreference
    ? new Set(TIPO_PREFERENCE_MAP[filters.typePreference] ?? [])
    : null;

  return listings.map((l) => {
    const breakdown: ScoreBreakdown = {
      preco: 0,
      precoM2: 0,
      layout: 0,
      bairro: 0,
      area: 0,
      amenidades: 0,
      completude: 0,
      preferencia: 0,
      penalidades: 0,
    };
    const reasons: string[] = [];

    // 1) PREÇO (max 30) — usa totalMonthly se enriquecido, senão price puro
    const totalCost = l.totalMonthly ?? l.price;
    if (filters.priceMax && totalCost > 0) {
      const ratio = totalCost / filters.priceMax;
      if (ratio < 0.55) {
        breakdown.preco = 30;
        reasons.push('preço bem abaixo do teto');
      } else if (ratio < 0.7) {
        breakdown.preco = 24;
        reasons.push('preço confortável');
      } else if (ratio < 0.85) {
        breakdown.preco = 16;
      } else if (ratio < 0.95) {
        breakdown.preco = 8;
      } else if (ratio < 1.0) {
        breakdown.preco = 3;
      } else {
        breakdown.preco = 0;
      }
    } else if (l.price > 0) {
      breakdown.preco = 12; // sem teto definido, score neutro
    }

    // 2) PREÇO/M² relativo (max 15) — só rankeia se houver dados suficientes
    if (l.pricePerSqm && ppsm.length >= 4) {
      if (l.pricePerSqm <= ppsmQ1) {
        breakdown.precoM2 = 15;
        reasons.push(`R$/m² ótimo (R$${l.pricePerSqm}/m²)`);
      } else if (l.pricePerSqm <= ppsmMedian) {
        breakdown.precoM2 = 9;
      } else if (l.pricePerSqm <= ppsmQ3) {
        breakdown.precoM2 = 3;
      } else {
        breakdown.precoM2 = -3;
        reasons.push(`R$/m² caro (R$${l.pricePerSqm}/m²)`);
      }
    }

    // 3) LAYOUT (max 20) — extras acima do mínimo
    let layout = 0;
    if (filters.bedroomsMin && l.bedrooms && l.bedrooms > filters.bedroomsMin) {
      const extra = Math.min(l.bedrooms - filters.bedroomsMin, 3);
      layout += extra * 4;
      reasons.push(`+${extra} quarto(s) extra`);
    }
    if (filters.parkingMin && l.parkingSpaces && l.parkingSpaces > filters.parkingMin) {
      layout += Math.min(l.parkingSpaces - filters.parkingMin, 2) * 3;
    }
    if (l.suites && l.suites > 0) {
      layout += Math.min(l.suites, 3) * 2;
      reasons.push(`${l.suites} suíte${l.suites > 1 ? 's' : ''}`);
    }
    breakdown.layout = Math.min(layout, 20);

    // 4) BAIRRO (max 20) — match na whitelist, peso pela posição
    if (filters.neighborhoods?.length && l.neighborhood) {
      const target = slugify(l.neighborhood);
      const idx = filters.neighborhoods.findIndex((n) => target.includes(slugify(n)));
      if (idx >= 0) {
        const bonus = Math.max(20 - idx * 3, 5);
        breakdown.bairro = bonus;
        reasons.push(`bairro preferido #${idx + 1}`);
      }
    }

    // 5) ÁREA (max 10)
    if (filters.areaMin && l.area) {
      const ratio = l.area / filters.areaMin;
      if (ratio >= 1.5) {
        breakdown.area = 10;
        reasons.push('área bem acima do mínimo');
      } else if (ratio >= 1.25) {
        breakdown.area = 6;
      } else if (ratio >= 1.1) {
        breakdown.area = 3;
      }
    } else if (l.area && l.area >= 120) {
      breakdown.area = 5;
    }

    // 6) AMENIDADES (max 10) — keywords em descrição + features
    let amenidades = 0;
    const haystack = [l.title, l.description, l.features?.join(' '), l.nearby?.join(' ')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matched: string[] = [];
    for (const { kw, label, pts } of POSITIVE_KEYWORDS) {
      if (kw.test(haystack) && !matched.includes(label)) {
        amenidades += pts;
        matched.push(label);
      }
    }
    if (l.features) {
      for (const f of l.features) {
        for (const { kw, pts } of FEATURE_BONUS) {
          if (kw.test(f)) {
            amenidades += pts;
            break; // 1 bônus por feature
          }
        }
      }
    }
    breakdown.amenidades = Math.min(amenidades, 10);
    if (matched.length > 0) {
      reasons.push(matched.slice(0, 2).join(', '));
    }

    // 7) COMPLETUDE (max 5)
    let completude = 0;
    if (l.photos && l.photos.length > 0) completude += 2;
    else if (l.thumbnailUrl) completude += 1;
    if (l.description && l.description.length > 200) completude += 2;
    if (l.features && l.features.length >= 5) completude += 1;
    breakdown.completude = Math.min(completude, 5);

    // 8) PREFERÊNCIA DE TIPO (max 8) — bônus pra quem bate com --prefer
    if (preferredTipos && l.apiType && preferredTipos.has(l.apiType)) {
      breakdown.preferencia = 8;
      reasons.push(`tipo preferido (${l.apiType})`);
    }

    // 9) PENALIDADES
    let pen = 0;
    if (l.price === 0) {
      pen -= 25;
      reasons.push('preço "sob consulta"');
    }
    if (!l.thumbnailUrl && (!l.photos || l.photos.length === 0)) pen -= 8;
    if (!l.area) pen -= 6;
    if (!l.bedrooms) pen -= 4;
    // Custo extra (cond+IPTU) muito alto vs aluguel
    if (l.price > 0 && (l.condoFee || l.iptu)) {
      const extra = (l.condoFee ?? 0) + (l.iptu ?? 0);
      if (extra > l.price * 0.4) {
        pen -= 8;
        reasons.push('cond+IPTU pesado');
      }
    }
    breakdown.penalidades = pen;

    const total =
      breakdown.preco +
      breakdown.precoM2 +
      breakdown.layout +
      breakdown.bairro +
      breakdown.area +
      breakdown.amenidades +
      breakdown.completude +
      breakdown.preferencia +
      breakdown.penalidades;

    return {
      ...l,
      score: Math.max(0, Math.min(100, Math.round(total))),
      scoreBreakdown: breakdown,
      scoreReasons: reasons.slice(0, 5),
    };
  });
}

/**
 * Ordena por uma chave primária (score | neighborhood | price | area | ppsm).
 * Score é desempate secundário em todas as ordenações que não são por score —
 * dentro do mesmo bairro, o melhor score vem primeiro.
 */
export function sortListings(listings: Listing[], sortBy: SortBy = 'score'): Listing[] {
  const arr = [...listings];

  if (sortBy === 'neighborhood') {
    arr.sort((a, b) => {
      const an = (a.neighborhood ?? '').toLocaleLowerCase('pt-BR');
      const bn = (b.neighborhood ?? '').toLocaleLowerCase('pt-BR');
      const cmp = an.localeCompare(bn, 'pt-BR');
      if (cmp !== 0) return cmp;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    return arr;
  }

  if (sortBy === 'price') {
    arr.sort((a, b) => {
      const aCost = a.totalMonthly ?? a.price ?? Infinity;
      const bCost = b.totalMonthly ?? b.price ?? Infinity;
      if (aCost !== bCost) return aCost - bCost;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    return arr;
  }

  if (sortBy === 'area') {
    arr.sort((a, b) => {
      const cmp = (b.area ?? 0) - (a.area ?? 0);
      if (cmp !== 0) return cmp;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    return arr;
  }

  if (sortBy === 'ppsm') {
    arr.sort((a, b) => {
      const ap = a.pricePerSqm ?? Infinity;
      const bp = b.pricePerSqm ?? Infinity;
      if (ap !== bp) return ap - bp;
      return (b.score ?? 0) - (a.score ?? 0);
    });
    return arr;
  }

  // default: score desc, tiebreak por totalMonthly ascendente
  arr.sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const aCost = a.totalMonthly ?? a.price ?? Infinity;
    const bCost = b.totalMonthly ?? b.price ?? Infinity;
    return aCost - bCost;
  });
  return arr;
}

/** @deprecated Use sortListings(listings, 'score'). Mantido pra retrocompat. */
export function sortByScore(listings: Listing[]): Listing[] {
  return sortListings(listings, 'score');
}

export function deduplicate(listings: Listing[]): Listing[] {
  const seen = new Set<string>();
  return listings.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}
