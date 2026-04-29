import chalk from 'chalk';
import type { Listing, ScoreBreakdown, SearchFilters } from './types.js';

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

// =====================================================================
// HTML report v3 — premium polish
// =====================================================================

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

function slug(s: string | undefined | null): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function detectFeatures(l: Listing): string[] {
  const found = new Set<string>();
  const haystack = [l.title, l.description, l.features?.join(' '), l.nearby?.join(' ')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (l.suites && l.suites > 0) found.add('suite');
  if (/su[ií]te/i.test(haystack)) found.add('suite');
  if (/quintal|jardim|área externa|area externa/i.test(haystack)) found.add('quintal');
  if (/churrasqu/i.test(haystack)) found.add('churrasqueira');
  if (/piscina/i.test(haystack)) found.add('piscina');
  if (/mobiliad/i.test(haystack)) found.add('mobiliado');
  if (/pet|aceita animal|animais/i.test(haystack)) found.add('pet');
  if (/condom[ií]nio fechado|portaria 24/i.test(haystack)) found.add('condominio-fechado');
  if (/garagem cobert|coberta/i.test(haystack)) found.add('garagem-coberta');
  if (/closet/i.test(haystack)) found.add('closet');
  if (/lavabo/i.test(haystack)) found.add('lavabo');
  if (/escrit[óo]rio|home office/i.test(haystack)) found.add('escritorio');
  return Array.from(found);
}

const FEATURE_LABELS: Record<string, string> = {
  suite: 'Suíte',
  quintal: 'Quintal/jardim',
  churrasqueira: 'Churrasqueira',
  piscina: 'Piscina',
  mobiliado: 'Mobiliado',
  pet: 'Aceita pet',
  'condominio-fechado': 'Cond. fechado',
  'garagem-coberta': 'Garagem coberta',
  closet: 'Closet',
  lavabo: 'Lavabo',
  escritorio: 'Escritório',
};

/** Renderiza barra horizontal stacked com segmentos coloridos por categoria do score */
function renderScoreBar(b: ScoreBreakdown | undefined): string {
  if (!b) return '';
  const segments: { key: string; value: number; label: string }[] = [
    { key: 'preco', value: b.preco, label: 'Preço' },
    { key: 'precom2', value: Math.max(0, b.precoM2), label: 'R$/m²' },
    { key: 'layout', value: b.layout, label: 'Layout' },
    { key: 'bairro', value: b.bairro, label: 'Bairro' },
    { key: 'area', value: b.area, label: 'Área' },
    { key: 'amenidades', value: b.amenidades, label: 'Amenid.' },
    { key: 'completude', value: b.completude, label: 'Info' },
    { key: 'preferencia', value: b.preferencia, label: 'Pref' },
  ];
  const tooltipText = segments
    .filter((s) => s.value > 0)
    .map((s) => `${s.label} ${s.value}`)
    .concat(b.penalidades < 0 ? [`Penal ${b.penalidades}`] : [])
    .join(' · ');
  const html = segments
    .filter((s) => s.value > 0)
    .map(
      (s) =>
        `<div class="sb-seg sb-${s.key}" style="flex-basis: ${s.value}%" title="${esc(s.label)}: ${s.value} pts"></div>`
    )
    .join('');
  return `<div class="score-bar" title="${esc(tooltipText)}" aria-label="Composição do score: ${esc(tooltipText)}">${html}</div>`;
}

/** SVG inline icons — small, optimized */
const ICONS: Record<string, string> = {
  bed: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9V20"/><path d="M22 20V11a2 2 0 0 0-2-2H6"/><path d="M2 15h20"/><path d="M6 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>',
  bath: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5 1.5 1.5 0 0 0-1.5 1.5V12"/><line x1="10" x2="8" y1="5" y2="7"/><line x1="2" x2="22" y1="12" y2="12"/><line x1="7" x2="7" y1="19" y2="21"/><line x1="17" x2="17" y1="19" y2="21"/><path d="M5 16v-1a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/></svg>',
  car: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

/** Renders a single card */
function renderCard(l: Listing, idx: number, showTypeBadge: boolean): string {
  const score = l.score ?? 0;
  const photos = l.photos && l.photos.length > 0
    ? l.photos
    : l.thumbnailUrl
    ? [l.thumbnailUrl]
    : [];
  const mainPhoto = photos[0];
  const features = detectFeatures(l);

  const breakdown = l.scoreBreakdown;
  const breakdownStr = breakdown
    ? `Preço ${breakdown.preco} · R$/m² ${breakdown.precoM2} · Layout ${breakdown.layout} · Bairro ${breakdown.bairro} · Área ${breakdown.area} · Amenid. ${breakdown.amenidades} · Info ${breakdown.completude} · Pref ${breakdown.preferencia} · Penal ${breakdown.penalidades}`
    : '';

  const specsHtml: string[] = [];
  if (l.bedrooms) specsHtml.push(`<span class="spec">${ICONS.bed}<span>${l.bedrooms}</span></span>`);
  if (l.bathrooms) specsHtml.push(`<span class="spec">${ICONS.bath}<span>${l.bathrooms}</span></span>`);
  if (l.parkingSpaces) specsHtml.push(`<span class="spec">${ICONS.car}<span>${l.parkingSpaces}</span></span>`);
  if (l.area) specsHtml.push(`<span class="spec">${ICONS.ruler}<span>${l.area}m²</span></span>`);
  if (l.suites && l.suites > 0)
    specsHtml.push(`<span class="spec spec-accent" title="suíte(s)">★ ${l.suites}</span>`);

  const totalMonthly = l.totalMonthly ?? l.price;
  const hasExtras = (l.condoFee && l.condoFee > 0) || (l.iptu && l.iptu > 0);

  const typeBadgeHtml =
    showTypeBadge && l.apiType ? `<div class="badge type-badge">${esc(l.apiType)}</div>` : '';

  const photosJson = JSON.stringify(photos);
  const featuresStr = features.join(' ');
  const neighborhoodSlug = slug(l.neighborhood);

  return `
<article class="card ${scoreClass(score)}"
  data-id="${esc(l.id)}"
  data-score="${score}"
  data-price="${totalMonthly}"
  data-area="${l.area ?? 0}"
  data-ppsm="${l.pricePerSqm ?? 0}"
  data-neighborhood="${esc(l.neighborhood ?? '')}"
  data-neighborhood-slug="${esc(neighborhoodSlug)}"
  data-features="${esc(featuresStr)}"
  data-lat="${l.latitude ?? ''}"
  data-lng="${l.longitude ?? ''}"
  data-photos='${esc(photosJson)}'
  tabindex="0">
  <div class="carousel">
    ${
      mainPhoto
        ? `<img class="carousel-img" loading="lazy" src="${esc(mainPhoto)}" alt="" data-idx="0" decoding="async">`
        : '<div class="no-photo"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><div>sem foto</div></div>'
    }
    ${
      photos.length > 1
        ? `<button class="carousel-btn carousel-prev" aria-label="foto anterior">‹</button>
    <button class="carousel-btn carousel-next" aria-label="próxima foto">›</button>
    <div class="carousel-counter"><span class="cur">1</span> / ${photos.length}</div>`
        : ''
    }
    <div class="card-rank">#${idx + 1}</div>
    <div class="badge new-badge" aria-label="novo desde última visita">NOVO</div>
    <div class="badge score-badge" aria-label="Score ${score}">${score}</div>
    ${typeBadgeHtml}
    <label class="compare-toggle" title="Adicionar à comparação">
      <input type="checkbox" class="compare-cb">
      <span class="compare-box" aria-hidden="true"></span>
    </label>
    <div class="note-indicator hidden" title="tem nota">📝</div>
    <div class="photo-overlay">
      <div class="overlay-price">
        <strong class="numeric">${esc(fmtBRL(totalMonthly))}</strong>
        <span class="overlay-label">${hasExtras ? '/mês total' : '/mês'}</span>
      </div>
      ${l.pricePerSqm ? `<div class="overlay-ppsm numeric">R$${l.pricePerSqm}/m²</div>` : ''}
    </div>
  </div>
  <div class="card-body">
    <h3 class="card-title">${esc(l.title)}</h3>
    ${renderScoreBar(breakdown)}
    <div class="specs-row">${specsHtml.join('')}</div>
    ${
      hasExtras
        ? `<div class="cost-line numeric">
        ${esc(fmtBRL(l.price))} de aluguel${l.condoFee ? ` + ${esc(fmtBRL(l.condoFee))} cond.` : ''}${l.iptu ? ` + ${esc(fmtBRL(l.iptu))} IPTU` : ''}
      </div>`
        : ''
    }
    <div class="meta-row">
      ${l.neighborhood ? `<button class="hood-pill" data-filter-hood="${esc(neighborhoodSlug)}" title="filtrar por este bairro">${ICONS.pin} <span>${esc(l.neighborhood)}</span></button>` : ''}
      ${l.address ? `<span class="address">${esc(l.address)}</span>` : ''}
    </div>
    ${
      features.length > 0
        ? `<div class="feature-chips">${features
            .map((f) => `<button class="chip" data-feat="${esc(f)}">${esc(FEATURE_LABELS[f] ?? f)}</button>`)
            .join('')}</div>`
        : ''
    }
    ${
      l.scoreReasons && l.scoreReasons.length
        ? `<div class="reasons">${ICONS.check} <span>${esc(l.scoreReasons.join(' · '))}</span></div>`
        : ''
    }
    <div class="actions">
      <button class="btn-mark btn-mark-liked" data-mark="liked" title="Gostei (s)" aria-label="Marcar como gostei">⭐</button>
      <button class="btn-mark btn-mark-maybe" data-mark="maybe" title="Talvez (m)" aria-label="Marcar como talvez">❓</button>
      <button class="btn-mark btn-mark-hidden" data-mark="hidden" title="Esconder (n)" aria-label="Esconder">❌</button>
      <button class="btn-icon btn-note-toggle" title="Adicionar nota" aria-label="Adicionar nota">📝</button>
      <span class="actions-spacer"></span>
      <a class="btn-icon btn-open" href="${esc(l.url)}" target="_blank" rel="noopener" title="Abrir anúncio (Enter)" aria-label="Abrir anúncio">↗</a>
      ${
        l.latitude && l.longitude
          ? `<a class="btn-icon btn-map" href="https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}" target="_blank" rel="noopener" title="Google Maps" aria-label="Abrir no Google Maps">🗺</a>`
          : ''
      }
    </div>
    <div class="note-area hidden">
      <textarea placeholder="suas anotações sobre este imóvel..." rows="3" aria-label="Nota sobre o imóvel"></textarea>
    </div>
    <details class="more">
      <summary>+ detalhes completos</summary>
      ${l.description ? `<p class="desc">${esc(l.description)}</p>` : ''}
      ${l.features && l.features.length ? `<div class="full-features"><strong>Características:</strong> ${l.features.map(esc).join(' · ')}</div>` : ''}
      ${l.nearby && l.nearby.length ? `<div class="nearby"><strong>Próximo:</strong> ${l.nearby.map(esc).join(' · ')}</div>` : ''}
      ${l.agency ? `<div class="agency">Anunciante: ${esc(l.agency)}</div>` : ''}
      ${breakdownStr ? `<div class="breakdown numeric">${esc(breakdownStr)}</div>` : ''}
    </details>
  </div>
</article>`;
}

const STYLES = `
* { box-sizing: border-box; }
:root {
  /* Backgrounds */
  --bg-0: #0a0d12;
  --bg-1: #11151b;
  --bg-2: #161a21;
  --bg-3: #1d2229;
  --bg-4: #252a32;

  /* Borders */
  --border-1: #252a32;
  --border-2: #363c46;
  --border-strong: #4a525d;

  /* Text */
  --text-1: #f0f3f7;
  --text-2: #c0c8d2;
  --text-3: #8e96a1;
  --text-4: #5d6571;

  /* Accent */
  --accent: #5b8def;
  --accent-hover: #7aa3f5;
  --accent-glow: rgba(91, 141, 239, 0.25);
  --accent-soft: rgba(91, 141, 239, 0.12);

  /* Score colors */
  --great: #34d399;
  --good: #a3e635;
  --ok: #fbbf24;
  --low: #71717a;

  /* Mark colors */
  --gold: #fbbf24;
  --maybe: #c084fc;
  --danger: #ef4444;

  /* Score breakdown segment colors */
  --seg-preco: #3b82f6;
  --seg-precom2: #06b6d4;
  --seg-layout: #10b981;
  --seg-bairro: #eab308;
  --seg-area: #f97316;
  --seg-amenidades: #a855f7;
  --seg-completude: #ec4899;
  --seg-preferencia: #f59e0b;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 0 3px var(--accent-glow);

  /* Animation */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --d-fast: 150ms;
  --d: 200ms;
  --d-slow: 350ms;

  /* Spacing scale */
  --gap-1: 4px;
  --gap-2: 8px;
  --gap-3: 12px;
  --gap-4: 16px;
  --gap-6: 24px;

  /* Radii */
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 14px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg-0);
  color: var(--text-1);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI Variable Display",
    "Segoe UI",
    Roboto,
    "Helvetica Neue",
    Arial,
    sans-serif;
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
.numeric, .price, h2, h3 {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
}

/* Focus rings */
:focus { outline: none; }
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible {
  box-shadow: var(--shadow-glow);
}

/* Layout */
.app {
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: auto auto 1fr;
  grid-template-areas: "header header" "filters filters" "sidebar main";
  min-height: 100vh;
}

/* Topbar */
header.topbar {
  grid-area: header;
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(10, 13, 18, 0.85);
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border-bottom: 1px solid var(--border-1);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: var(--gap-4);
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
}
.brand-logo {
  width: 28px; height: 28px;
  background: linear-gradient(135deg, var(--accent), #7c3aed);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 2px 8px var(--accent-glow);
}
.brand-text h1 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.brand-text .subtitle { color: var(--text-3); font-size: 11px; }
.grow { flex: 1; }

.tabs {
  display: flex;
  gap: 2px;
  background: var(--bg-2);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-1);
}
.tab {
  padding: 5px 12px;
  background: transparent;
  color: var(--text-3);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all var(--d-fast) var(--ease-out);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tab.active {
  background: var(--bg-4);
  color: var(--text-1);
  box-shadow: var(--shadow-sm);
}
.tab:not(.active):hover { color: var(--text-1); background: var(--bg-3); }

.btn-help {
  width: 32px; height: 32px;
  background: var(--bg-2);
  color: var(--text-3);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all var(--d-fast) var(--ease-out);
}
.btn-help:hover { color: var(--text-1); border-color: var(--border-2); }

/* Active filter pills bar */
.active-filters {
  grid-area: filters;
  position: sticky;
  top: 56px;
  z-index: 50;
  background: rgba(17, 21, 27, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-1);
  padding: 8px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 40px;
  font-size: 11px;
}
.active-filters:empty { display: none; }
.active-filters .label {
  color: var(--text-4);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 10px;
  background: var(--accent-soft);
  border: 1px solid rgba(91, 141, 239, 0.35);
  border-radius: 14px;
  font-size: 11px;
  color: var(--text-1);
  animation: pillIn 200ms var(--ease-spring);
}
@keyframes pillIn {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}
.filter-pill button {
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 0 5px;
  font-size: 14px;
  line-height: 1;
  border-radius: 50%;
  transition: all var(--d-fast);
}
.filter-pill button:hover { color: var(--danger); background: rgba(239, 68, 68, 0.15); }
.clear-all {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all var(--d-fast);
}
.clear-all:hover { color: var(--text-1); background: var(--bg-3); }

/* Sidebar */
aside.sidebar {
  grid-area: sidebar;
  background: var(--bg-1);
  border-right: 1px solid var(--border-1);
  padding: 16px;
  overflow-y: auto;
  height: calc(100vh - 96px);
  position: sticky;
  top: 96px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-2) transparent;
}
aside.sidebar::-webkit-scrollbar { width: 6px; }
aside.sidebar::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 3px; }
.sb-section {
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-1);
}
.sb-section:last-child { border: none; }
.sb-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-4);
  margin: 0 0 8px;
  letter-spacing: 0.06em;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sb-label .count-pill {
  background: var(--bg-3);
  color: var(--text-3);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 9px;
}

.search-box { position: relative; }
.search-box svg {
  position: absolute;
  left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--text-3);
  pointer-events: none;
}
.search-input {
  width: 100%;
  padding: 8px 30px 8px 32px;
  background: var(--bg-2);
  color: var(--text-1);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  font-size: 12px;
  transition: all var(--d-fast);
}
.search-input::placeholder { color: var(--text-4); }
.search-input:focus { border-color: var(--accent); background: var(--bg-3); }
.search-clear {
  position: absolute;
  right: 6px; top: 50%; transform: translateY(-50%);
  width: 20px; height: 20px;
  background: transparent;
  color: var(--text-3);
  border: none;
  cursor: pointer;
  border-radius: 50%;
  font-size: 14px;
  display: none;
  align-items: center;
  justify-content: center;
}
.search-clear.visible { display: flex; }
.search-clear:hover { background: var(--bg-3); color: var(--text-1); }

.sort-buttons { display: flex; flex-wrap: wrap; gap: 4px; }
.sort-buttons button {
  flex: 1 1 calc(50% - 2px);
  min-width: 0;
  padding: 6px 8px;
  background: var(--bg-2);
  color: var(--text-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all var(--d-fast);
}
.sort-buttons button:hover { background: var(--bg-3); color: var(--text-1); }
.sort-buttons button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  box-shadow: 0 0 0 2px var(--accent-glow);
}

/* Stats segmented bar */
.stats-bar {
  margin-top: 8px;
}
.stats-track {
  display: flex;
  height: 8px;
  background: var(--bg-3);
  border-radius: 4px;
  overflow: hidden;
}
.stats-seg {
  height: 100%;
  transition: flex-basis var(--d-slow) var(--ease-out);
}
.stats-seg.liked { background: var(--gold); }
.stats-seg.maybe { background: var(--maybe); }
.stats-seg.hidden-seg { background: var(--text-4); }
.stats-seg.unmarked { background: var(--bg-4); }
.stats-legend {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 8px;
  margin-top: 10px;
  font-size: 11px;
}
.stats-legend > div {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  cursor: pointer;
  padding: 3px 5px;
  border-radius: 4px;
  transition: background var(--d-fast);
}
.stats-legend > div:hover { background: var(--bg-3); color: var(--text-1); }
.stats-legend .dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.stats-legend .dot.liked { background: var(--gold); }
.stats-legend .dot.maybe { background: var(--maybe); }
.stats-legend .dot.hidden-seg { background: var(--text-4); }
.stats-legend .dot.unmarked { background: var(--bg-4); border: 1px solid var(--border-2); }
.stats-legend .num {
  margin-left: auto;
  color: var(--text-1);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Mark filter radio chips */
.mark-radio-group { display: flex; flex-wrap: wrap; gap: 4px; }
.mark-radio {
  flex: 1 1 calc(50% - 2px);
  padding: 6px 8px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
  color: var(--text-2);
  text-align: center;
  transition: all var(--d-fast);
}
.mark-radio:hover { background: var(--bg-3); color: var(--text-1); }
.mark-radio.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.show-hidden-row {
  display: flex; align-items: center; gap: 6px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-3);
  cursor: pointer;
}

/* Range slider */
.range-row { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-3); }
.range-row input[type="range"] { flex: 1; accent-color: var(--accent); height: 4px; }
.range-value {
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
  font-weight: 600;
  min-width: 28px;
  text-align: right;
}

/* Checkbox lists */
.checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 4px;
}
.checkbox-list label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-2);
  transition: background var(--d-fast);
}
.checkbox-list label:hover { background: var(--bg-3); color: var(--text-1); }
.checkbox-list label .name { flex: 1; }
.checkbox-list label .count {
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
}
.checkbox-list input[type="checkbox"] { accent-color: var(--accent); }

.btn-reset {
  width: 100%;
  padding: 8px;
  background: transparent;
  color: var(--text-3);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 11px;
  transition: all var(--d-fast);
}
.btn-reset:hover { background: var(--bg-3); color: var(--text-1); border-color: var(--border-2); }

/* Main content */
main.content {
  grid-area: main;
  position: relative;
}
.app.view-cards .map-view { display: none; }
.app.view-map .cards-view { display: none; }

.cards-view { padding: 16px 20px; }

.results-bar {
  display: flex;
  align-items: center;
  gap: var(--gap-3);
  margin-bottom: 16px;
  padding: 8px 14px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius);
  font-size: 12px;
}
.results-bar .count {
  color: var(--text-1);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.results-bar .density-toggle {
  display: flex;
  background: var(--bg-3);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 1px;
}
.density-toggle button {
  background: transparent;
  border: none;
  color: var(--text-3);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all var(--d-fast);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.density-toggle button.active {
  background: var(--bg-4);
  color: var(--text-1);
}
.density-toggle button:not(.active):hover { color: var(--text-1); }
.density-toggle svg { display: block; }
.btn-shortcut {
  background: var(--bg-3);
  color: var(--text-3);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  padding: 4px 10px;
  cursor: pointer;
  font-size: 11px;
  transition: all var(--d-fast);
}
.btn-shortcut:hover { color: var(--text-1); border-color: var(--border-2); }

/* Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 18px;
}
.grid > .card { animation: cardIn 350ms var(--ease-out) backwards; }
@keyframes cardIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.grid.density-compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 1200px;
  margin: 0 auto;
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-3);
  grid-column: 1 / -1;
}
.empty-state svg { color: var(--text-4); margin-bottom: 16px; }
.empty-state h3 { margin: 0 0 6px; color: var(--text-1); font-size: 16px; }
.empty-state p { margin: 0 0 16px; font-size: 13px; }
.empty-state button {
  padding: 8px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}
.empty-state button:hover { background: var(--accent-hover); }

/* CARD */
.card {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition:
    transform var(--d) var(--ease-out),
    border-color var(--d) var(--ease-out),
    box-shadow var(--d) var(--ease-out);
  outline: none;
  position: relative;
}
.card:hover {
  transform: translateY(-3px);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
}
.card:focus-visible, .card.focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow), var(--shadow-md);
}
.card.liked { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.card.liked:hover { box-shadow: 0 0 0 1px var(--gold), var(--shadow-md); }
.card.maybe { border-color: var(--maybe); }
.card.hidden { opacity: 0.3; }
.card.is-new::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: var(--radius-lg);
  border: 2px solid var(--accent);
  opacity: 0;
  pointer-events: none;
  animation: pulseNew 2.5s ease-out infinite;
}
@keyframes pulseNew {
  0%, 100% { opacity: 0; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.005); }
}
.card.compare-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent), var(--shadow-md);
}

/* Carousel */
.carousel {
  position: relative;
  aspect-ratio: 16/10;
  background: #000;
  overflow: hidden;
  cursor: zoom-in;
}
.carousel img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity var(--d-fast), transform 600ms var(--ease-out);
}
.card:hover .carousel img { transform: scale(1.03); }
.no-photo {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 6px;
  color: var(--text-4);
  background: linear-gradient(135deg, var(--bg-3), var(--bg-2));
  font-size: 11px;
}

.carousel-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--d-fast), background var(--d-fast), transform var(--d-fast);
  backdrop-filter: blur(8px);
}
.carousel:hover .carousel-btn { opacity: 1; }
.carousel-btn:hover { background: rgba(0, 0, 0, 0.85); transform: translateY(-50%) scale(1.05); }
.carousel-prev { left: 8px; }
.carousel-next { right: 8px; }
.carousel-counter {
  position: absolute;
  bottom: 8px; right: 8px;
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border-radius: 10px;
  font-size: 10px;
  backdrop-filter: blur(4px);
  font-variant-numeric: tabular-nums;
}

/* Photo overlay (bottom gradient with price) */
.photo-overlay {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 28px 12px 10px;
  background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 60%, transparent);
  color: #fff;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}
.overlay-price strong {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  display: block;
  line-height: 1.1;
}
.overlay-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.02em;
}
.overlay-ppsm {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 11px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Badges */
.badge {
  position: absolute;
  padding: 4px 10px;
  border-radius: 14px;
  font-weight: 700;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  letter-spacing: -0.01em;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.score-badge {
  top: 10px;
  right: 10px;
  font-size: 14px;
  min-width: 32px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.score-great .score-badge { background: var(--great); color: #052e1c; }
.score-good .score-badge { background: var(--good); color: #1a2e05; }
.score-ok .score-badge { background: var(--ok); color: #422006; }
.score-low .score-badge { background: var(--low); color: #fff; }

.card-rank {
  position: absolute;
  bottom: 10px; left: 10px;
  padding: 2px 7px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.65);
  color: rgba(255, 255, 255, 0.85);
  font-variant-numeric: tabular-nums;
  z-index: 2;
}

.new-badge {
  display: none;
  top: 10px;
  left: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  padding: 3px 8px;
  letter-spacing: 0.08em;
  animation: badgePulse 2s ease-in-out infinite;
}
.card.is-new .new-badge { display: block; }
@keyframes badgePulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--accent-glow); }
  50% { box-shadow: 0 0 0 8px transparent; }
}

.type-badge {
  top: 42px;
  right: 10px;
  font-size: 9px;
  padding: 3px 8px;
  background: rgba(91, 141, 239, 0.85);
  color: #0a0d12;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.note-indicator {
  bottom: 10px; right: 10px;
  font-size: 14px;
  padding: 3px 6px;
}

/* Compare checkbox in card */
.compare-toggle {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--d-fast);
}
.card:hover .compare-toggle, .card.compare-selected .compare-toggle { opacity: 1; }
.compare-toggle input { position: absolute; opacity: 0; pointer-events: none; }
.compare-box {
  display: block;
  width: 22px; height: 22px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  border-radius: var(--radius-sm);
  transition: all var(--d-fast);
  position: relative;
}
.compare-box::after {
  content: '';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  background-size: 14px;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity var(--d-fast);
}
.compare-toggle input:checked + .compare-box { background: var(--accent); border-color: var(--accent); }
.compare-toggle input:checked + .compare-box::after { opacity: 1; }
.compare-toggle:hover .compare-box { border-color: rgba(255, 255, 255, 0.9); }

/* Card body */
.card-body {
  padding: 14px 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-1);
  letter-spacing: -0.005em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Score breakdown bar */
.score-bar {
  display: flex;
  height: 4px;
  background: var(--bg-4);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
  transition: height var(--d-fast);
  cursor: help;
}
.score-bar:hover { height: 6px; }
.sb-seg { height: 100%; transition: opacity var(--d-fast); }
.score-bar:hover .sb-seg { opacity: 0.7; }
.score-bar:hover .sb-seg:hover { opacity: 1; }
.sb-preco { background: var(--seg-preco); }
.sb-precom2 { background: var(--seg-precom2); }
.sb-layout { background: var(--seg-layout); }
.sb-bairro { background: var(--seg-bairro); }
.sb-area { background: var(--seg-area); }
.sb-amenidades { background: var(--seg-amenidades); }
.sb-completude { background: var(--seg-completude); }
.sb-preferencia { background: var(--seg-preferencia); }

/* Specs row */
.specs-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: var(--text-2);
  margin-top: 2px;
}
.spec {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;
}
.spec svg { color: var(--text-3); }
.spec-accent { color: var(--gold); font-weight: 600; }

.cost-line {
  font-size: 11px;
  color: var(--text-3);
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  font-size: 11px;
  color: var(--text-3);
}
.hood-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-3);
  color: var(--text-1);
  border: 1px solid var(--border-1);
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all var(--d-fast);
}
.hood-pill:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  transform: translateY(-1px);
}
.address {
  color: var(--text-4);
  font-size: 11px;
}

.feature-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  font-size: 10px;
  padding: 2px 8px;
  background: rgba(132, 204, 22, 0.12);
  color: #a3e635;
  border: 1px solid rgba(132, 204, 22, 0.25);
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--d-fast);
  font-weight: 500;
}
.chip:hover {
  background: rgba(132, 204, 22, 0.25);
  border-color: rgba(132, 204, 22, 0.5);
  transform: translateY(-1px);
}

.reasons {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
  color: var(--great);
  line-height: 1.45;
}
.reasons svg { flex-shrink: 0; margin-top: 2px; }

/* Actions */
.actions {
  display: flex;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-1);
}
.actions-spacer { flex: 1; }
.btn-mark, .btn-icon {
  width: 32px; height: 32px;
  background: var(--bg-3);
  color: var(--text-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--d-fast);
  text-decoration: none;
  flex: 0 0 auto;
}
.btn-mark:hover, .btn-icon:hover {
  background: var(--bg-4);
  border-color: var(--border-2);
  color: var(--text-1);
  transform: translateY(-1px);
}
.btn-mark:active { transform: scale(0.95); }
.btn-mark.active.btn-mark-liked {
  background: rgba(251, 191, 36, 0.2);
  border-color: var(--gold);
  color: var(--gold);
}
.btn-mark.active.btn-mark-maybe {
  background: rgba(192, 132, 252, 0.2);
  border-color: var(--maybe);
  color: var(--maybe);
}
.btn-mark.active.btn-mark-hidden {
  background: rgba(239, 68, 68, 0.2);
  border-color: var(--danger);
  color: var(--danger);
}

.note-area { margin-top: 6px; }
.note-area textarea {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-0);
  color: var(--text-1);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12px;
  resize: vertical;
  min-height: 60px;
  transition: all var(--d-fast);
}
.note-area textarea:focus { border-color: var(--accent); }

.more {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 4px;
}
.more summary {
  cursor: pointer;
  user-select: none;
  padding: 6px 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 4px;
}
.more summary::-webkit-details-marker { display: none; }
.more summary::before {
  content: '›';
  display: inline-block;
  transition: transform var(--d-fast);
}
.more[open] summary::before { transform: rotate(90deg); }
.more summary:hover { color: var(--accent); }
.desc {
  line-height: 1.55;
  color: var(--text-2);
  margin: 8px 0;
  font-size: 11px;
}
.full-features, .nearby, .agency, .breakdown {
  margin: 6px 0;
  line-height: 1.5;
  font-size: 11px;
}
.breakdown { color: var(--text-4); }

/* COMPACT density mode */
.density-compact .card {
  flex-direction: row;
  align-items: stretch;
  height: auto;
  min-height: 90px;
}
.density-compact .carousel {
  width: 140px;
  flex-shrink: 0;
  aspect-ratio: 4/3;
  cursor: zoom-in;
}
.density-compact .carousel-btn,
.density-compact .carousel-counter,
.density-compact .new-badge,
.density-compact .compare-toggle,
.density-compact .photo-overlay { display: none; }
.density-compact .score-badge { font-size: 11px; padding: 3px 7px; }
.density-compact .type-badge { display: none; }
.density-compact .card-rank { font-size: 9px; bottom: 6px; left: 6px; padding: 1px 5px; }
.density-compact .card-body {
  padding: 10px 14px;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.density-compact .card-title {
  font-size: 13px;
  flex: 1;
  min-width: 200px;
  -webkit-line-clamp: 1;
}
.density-compact .score-bar { display: none; }
.density-compact .specs-row { font-size: 11px; gap: 10px; }
.density-compact .cost-line { display: none; }
.density-compact .meta-row { font-size: 10px; }
.density-compact .feature-chips,
.density-compact .reasons,
.density-compact .more,
.density-compact .note-area { display: none; }
.density-compact .actions {
  border: none;
  padding: 0;
  margin: 0;
}
.density-compact .actions .btn-mark,
.density-compact .actions .btn-icon {
  width: 28px; height: 28px;
  font-size: 12px;
}
.density-compact .address { display: none; }

/* MAP */
.map-view {
  height: calc(100vh - 96px);
  position: relative;
  background: var(--bg-1);
}
#map {
  width: 100%; height: 100%;
}
.leaflet-popup-content-wrapper {
  background: var(--bg-2);
  color: var(--text-1);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-1);
}
.leaflet-popup-content { margin: 12px; }
.leaflet-popup-tip { background: var(--bg-2); }
.leaflet-popup-close-button { color: var(--text-3) !important; }
.leaflet-control-zoom a {
  background: var(--bg-2) !important;
  color: var(--text-1) !important;
  border-color: var(--border-2) !important;
}
.map-popup { font-family: inherit; font-size: 12px; min-width: 220px; }
.map-popup img {
  width: 100%;
  aspect-ratio: 16/10;
  object-fit: cover;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}
.map-popup h4 {
  margin: 4px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  letter-spacing: -0.005em;
}
.map-popup .price {
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.map-popup .location { color: var(--text-3); font-size: 11px; margin: 4px 0; }
.map-popup button {
  margin-top: 8px;
  width: 100%;
  padding: 7px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all var(--d-fast);
}
.map-popup button:hover { background: var(--accent-hover); }

/* Teardrop pin */
.map-pin-teardrop {
  width: 32px;
  height: 40px;
  position: relative;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.5));
}
.map-pin-teardrop::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--pin-color, var(--accent));
  clip-path: path('M16 0C7.16 0 0 7.16 0 16c0 11 16 24 16 24s16-13 16-24C32 7.16 24.84 0 16 0z');
  border: 2px solid #0a0d12;
}
.map-pin-teardrop .pin-num {
  position: absolute;
  top: 8px; left: 0; right: 0;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #0a0d12;
  font-variant-numeric: tabular-nums;
}
.map-pin-teardrop.score-low .pin-num { color: #fff; }

/* Lightbox */
.lightbox {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.96);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 200ms var(--ease-out);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.lightbox img {
  max-width: 95vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}
.lightbox-close, .lightbox-prev, .lightbox-next {
  position: absolute;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  font-size: 22px;
  padding: 12px 18px;
  border-radius: var(--radius);
  backdrop-filter: blur(8px);
  transition: all var(--d-fast);
}
.lightbox-close:hover, .lightbox-prev:hover, .lightbox-next:hover {
  background: rgba(0, 0, 0, 0.9);
  border-color: rgba(255, 255, 255, 0.3);
}
.lightbox-close { top: 20px; right: 20px; }
.lightbox-prev { left: 20px; top: 50%; transform: translateY(-50%); }
.lightbox-next { right: 20px; top: 50%; transform: translateY(-50%); }
.lightbox-counter {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  padding: 6px 14px;
  border-radius: var(--radius);
  font-size: 12px;
  backdrop-filter: blur(8px);
  font-variant-numeric: tabular-nums;
}

/* Compare FAB */
.compare-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 90;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 28px;
  padding: 12px 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: var(--shadow-lg), 0 0 0 6px var(--accent-glow);
  transition: all var(--d) var(--ease-spring);
  animation: fabIn 250ms var(--ease-spring);
}
@keyframes fabIn {
  from { opacity: 0; transform: translateY(20px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.compare-fab:hover { background: var(--accent-hover); transform: translateY(-2px); }
.compare-fab .fab-count {
  background: rgba(255, 255, 255, 0.25);
  padding: 2px 8px;
  border-radius: 12px;
  font-variant-numeric: tabular-nums;
}
.compare-fab.hidden { display: none; }

/* Compare modal */
.compare-modal {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 200ms;
  padding: 20px;
}
.compare-modal .panel {
  background: var(--bg-1);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 1100px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}
.compare-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-1);
}
.compare-header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.compare-header button {
  background: transparent;
  color: var(--text-3);
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
}
.compare-header button:hover { color: var(--text-1); }
.compare-grid {
  display: flex;
  overflow-x: auto;
  padding: 16px;
  gap: 12px;
}
.compare-card {
  flex: 0 0 320px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.compare-card img {
  width: 100%;
  aspect-ratio: 16/10;
  object-fit: cover;
}
.compare-card .body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.compare-card h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.compare-stat {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-1);
}
.compare-stat:last-child { border: none; }
.compare-stat .lbl { color: var(--text-3); }
.compare-stat .val { color: var(--text-1); font-weight: 600; font-variant-numeric: tabular-nums; }
.compare-stat .val.best { color: var(--great); }
.compare-stat .val.worst { color: var(--text-4); }
.compare-actions {
  display: flex;
  gap: 6px;
  padding: 0 12px 12px;
}
.compare-actions a {
  flex: 1;
  text-align: center;
  padding: 7px;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}
.compare-actions a:hover { background: var(--accent-hover); }

/* Help overlay */
.help-overlay {
  position: fixed; inset: 0; z-index: 1001;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 200ms;
}
.help-overlay .panel {
  background: var(--bg-1);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  padding: 24px;
  max-width: 540px;
  width: 100%;
  box-shadow: var(--shadow-lg);
}
.help-overlay h3 { margin: 0 0 16px; font-size: 16px; font-weight: 600; }
.help-overlay .help-section { margin-bottom: 16px; }
.help-overlay .help-section h4 {
  margin: 0 0 8px;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-3);
  letter-spacing: 0.05em;
}
.help-overlay table { width: 100%; border-collapse: collapse; }
.help-overlay td { padding: 5px 0; font-size: 12px; }
.help-overlay td:first-child { color: var(--text-3); width: 100px; }
.help-overlay kbd {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 4px;
  padding: 2px 7px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  margin: 0 2px;
  box-shadow: 0 1px 0 var(--border-2);
}

/* Responsive */
@media (max-width: 900px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-areas: "header" "filters" "main";
  }
  aside.sidebar {
    position: fixed;
    left: 0; top: 96px;
    width: 280px;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform var(--d) var(--ease-out);
    height: calc(100vh - 96px);
    box-shadow: var(--shadow-lg);
  }
  aside.sidebar.open { transform: translateX(0); }
  .menu-toggle { display: inline-flex !important; }
  .grid { grid-template-columns: 1fr; }
}
.menu-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  background: var(--bg-2);
  color: var(--text-1);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 16px;
}

.hidden { display: none !important; }
`;

const SCRIPTS = `
(function() {
  'use strict';
  var MARKS_KEY = 'casa-finder-marks';
  var NOTES_KEY = 'casa-finder-notes';
  var KNOWN_KEY = 'casa-finder-known-ids';
  var marks = {};
  var notes = {};
  try { marks = JSON.parse(localStorage.getItem(MARKS_KEY) || '{}'); } catch(e) {}
  try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch(e) {}

  var grid = document.getElementById('grid');
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
  var resultsCount = document.getElementById('results-count');
  var statsTrack = document.getElementById('stats-track');
  var statsLegendNums = {
    liked: document.querySelector('#legend-liked .num'),
    maybe: document.querySelector('#legend-maybe .num'),
    'hidden-seg': document.querySelector('#legend-hidden .num'),
    unmarked: document.querySelector('#legend-unmarked .num'),
  };

  // ---------- "Novo desde última visita" ----------
  (function detectNew() {
    var raw = localStorage.getItem(KNOWN_KEY);
    if (raw === null) {
      // first ever load — silently populate
      localStorage.setItem(KNOWN_KEY, JSON.stringify(cards.map(function(c) { return c.dataset.id; })));
      return;
    }
    var known;
    try { known = new Set(JSON.parse(raw)); } catch(e) { known = new Set(); }
    cards.forEach(function(c) {
      if (!known.has(c.dataset.id)) c.classList.add('is-new');
    });
    // Update known set after delay so badges have time to be seen
    setTimeout(function() {
      localStorage.setItem(KNOWN_KEY, JSON.stringify(cards.map(function(c) { return c.dataset.id; })));
    }, 12000);
  })();

  // ---------- Marks ----------
  function applyMark(card, mark) {
    card.classList.remove('liked', 'maybe', 'hidden');
    if (mark) card.classList.add(mark);
    var btns = card.querySelectorAll('.btn-mark');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.mark === mark);
    }
  }
  function setMark(id, mark) {
    if (mark) marks[id] = mark; else delete marks[id];
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
    updateStats();
    updateActiveFilters();
  }

  // ---------- Notes ----------
  function applyNote(card, note) {
    var ta = card.querySelector('.note-area textarea');
    if (ta) ta.value = note || '';
    var ind = card.querySelector('.note-indicator');
    if (ind) ind.classList.toggle('hidden', !note);
  }
  function setNote(id, text) {
    text = (text || '').trim();
    if (text) notes[id] = text; else delete notes[id];
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }

  // ---------- Carousel ----------
  function getPhotos(card) {
    try { return JSON.parse(card.dataset.photos || '[]'); } catch(e) { return []; }
  }
  function setCarouselIdx(card, idx) {
    var photos = getPhotos(card);
    if (photos.length === 0) return;
    idx = ((idx % photos.length) + photos.length) % photos.length;
    var img = card.querySelector('.carousel-img');
    if (img) {
      img.src = photos[idx];
      img.dataset.idx = String(idx);
    }
    var counter = card.querySelector('.carousel-counter .cur');
    if (counter) counter.textContent = String(idx + 1);
  }

  // ---------- Lightbox ----------
  var lb = document.getElementById('lightbox');
  var lbImg = lb.querySelector('img');
  var lbCounter = lb.querySelector('.lightbox-counter');
  var lbState = { card: null, photos: [], idx: 0 };
  function openLightbox(card, idx) {
    lbState.card = card;
    lbState.photos = getPhotos(card);
    if (lbState.photos.length === 0) return;
    lbState.idx = idx || 0;
    renderLightbox();
    lb.classList.remove('hidden');
  }
  function renderLightbox() {
    lbImg.src = lbState.photos[lbState.idx];
    lbCounter.textContent = (lbState.idx + 1) + ' / ' + lbState.photos.length;
  }
  function closeLightbox() { lb.classList.add('hidden'); }
  function lbNext() { lbState.idx = (lbState.idx + 1) % lbState.photos.length; renderLightbox(); }
  function lbPrev() { lbState.idx = (lbState.idx - 1 + lbState.photos.length) % lbState.photos.length; renderLightbox(); }
  lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lb.querySelector('.lightbox-next').addEventListener('click', lbNext);
  lb.querySelector('.lightbox-prev').addEventListener('click', lbPrev);
  lb.addEventListener('click', function(e) { if (e.target === lb) closeLightbox(); });

  // ---------- Compare mode ----------
  var compared = new Set();
  var compareFab = document.getElementById('compare-fab');
  var compareModal = document.getElementById('compare-modal');

  function updateCompareUi() {
    if (compared.size === 0) {
      compareFab.classList.add('hidden');
    } else {
      compareFab.classList.remove('hidden');
      compareFab.querySelector('.fab-count').textContent = compared.size;
    }
    cards.forEach(function(c) {
      var sel = compared.has(c.dataset.id);
      c.classList.toggle('compare-selected', sel);
      var cb = c.querySelector('.compare-cb');
      if (cb) cb.checked = sel;
    });
  }

  function toggleCompare(id) {
    if (compared.has(id)) compared.delete(id);
    else if (compared.size < 3) compared.add(id);
    else {
      // pulse effect on FAB to indicate limit
      compareFab.style.animation = 'none';
      setTimeout(function() { compareFab.style.animation = ''; }, 50);
    }
    updateCompareUi();
  }

  function fmtBRL(n) {
    if (!n || n === '0') return '—';
    return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function openCompareModal() {
    if (compared.size === 0) return;
    var ids = Array.from(compared);
    var entries = ids.map(function(id) {
      return cards.find(function(c) { return c.dataset.id === id; });
    }).filter(Boolean);

    // Compute best/worst per metric
    var metrics = {
      score: { vals: entries.map(function(c) { return parseFloat(c.dataset.score) || 0; }), bigger: true },
      price: { vals: entries.map(function(c) { return parseFloat(c.dataset.price) || 0; }), bigger: false },
      area: { vals: entries.map(function(c) { return parseFloat(c.dataset.area) || 0; }), bigger: true },
      ppsm: { vals: entries.map(function(c) { return parseFloat(c.dataset.ppsm) || 0; }), bigger: false },
    };
    function bestIdx(metric) {
      var v = metrics[metric].vals;
      var bigger = metrics[metric].bigger;
      var best = bigger ? -Infinity : Infinity;
      var bestIdx = -1;
      for (var i = 0; i < v.length; i++) {
        if (v[i] === 0) continue;
        if (bigger ? v[i] > best : v[i] < best) { best = v[i]; bestIdx = i; }
      }
      return bestIdx;
    }
    var bestScore = bestIdx('score');
    var bestPrice = bestIdx('price');
    var bestArea = bestIdx('area');
    var bestPpsm = bestIdx('ppsm');

    var html = '';
    entries.forEach(function(c, i) {
      var photos = getPhotos(c);
      var img = photos[0] || '';
      var title = c.querySelector('.card-title').textContent;
      var hood = c.dataset.neighborhood || '';
      var url = (c.querySelector('.btn-open') || {}).href || '#';
      var price = c.dataset.price;
      var area = c.dataset.area;
      var score = c.dataset.score;
      var ppsm = c.dataset.ppsm;
      var beds = (c.querySelector('.spec') || {}).textContent || '';

      html += '<div class="compare-card">';
      if (img) html += '<img src="' + img + '" alt="">';
      html += '<div class="body">';
      html += '<h3>' + title + '</h3>';
      html += '<div class="compare-stat"><span class="lbl">Score</span><span class="val ' + (i === bestScore ? 'best' : '') + '">' + score + '</span></div>';
      html += '<div class="compare-stat"><span class="lbl">Custo total</span><span class="val ' + (i === bestPrice ? 'best' : '') + '">' + fmtBRL(price) + '/mês</span></div>';
      if (parseFloat(area) > 0) html += '<div class="compare-stat"><span class="lbl">Área</span><span class="val ' + (i === bestArea ? 'best' : '') + '">' + area + ' m²</span></div>';
      if (parseFloat(ppsm) > 0) html += '<div class="compare-stat"><span class="lbl">R$/m²</span><span class="val ' + (i === bestPpsm ? 'best' : '') + '">R$' + ppsm + '</span></div>';
      html += '<div class="compare-stat"><span class="lbl">Bairro</span><span class="val">' + hood + '</span></div>';
      html += '</div>';
      html += '<div class="compare-actions"><a href="' + url + '" target="_blank" rel="noopener">Abrir anúncio ↗</a></div>';
      html += '</div>';
    });
    document.getElementById('compare-grid').innerHTML = html;
    compareModal.classList.remove('hidden');
  }

  compareFab.addEventListener('click', openCompareModal);
  compareModal.querySelector('.btn-close-compare').addEventListener('click', function() {
    compareModal.classList.add('hidden');
  });
  compareModal.addEventListener('click', function(e) {
    if (e.target === compareModal) compareModal.classList.add('hidden');
  });

  // ---------- Card events ----------
  cards.forEach(function(card) {
    var id = card.dataset.id;
    applyMark(card, marks[id]);
    applyNote(card, notes[id]);

    // Mark buttons
    card.querySelectorAll('.btn-mark').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        var mark = btn.dataset.mark;
        var newMark = marks[id] === mark ? null : mark;
        setMark(id, newMark);
        applyMark(card, newMark);
        applyFilters();
      });
    });

    // Carousel
    var prev = card.querySelector('.carousel-prev');
    var next = card.querySelector('.carousel-next');
    if (prev) prev.addEventListener('click', function(e) {
      e.stopPropagation();
      var img = card.querySelector('.carousel-img');
      var idx = parseInt(img.dataset.idx || '0', 10);
      setCarouselIdx(card, idx - 1);
    });
    if (next) next.addEventListener('click', function(e) {
      e.stopPropagation();
      var img = card.querySelector('.carousel-img');
      var idx = parseInt(img.dataset.idx || '0', 10);
      setCarouselIdx(card, idx + 1);
    });

    // Lightbox on photo click
    var carousel = card.querySelector('.carousel');
    if (carousel) carousel.addEventListener('click', function(e) {
      if (e.target.closest('.carousel-btn') || e.target.closest('.compare-toggle')) return;
      var img = card.querySelector('.carousel-img');
      if (!img) return;
      var idx = parseInt(img.dataset.idx || '0', 10);
      openLightbox(card, idx);
    });

    // Compare checkbox
    var compareCb = card.querySelector('.compare-cb');
    if (compareCb) {
      compareCb.addEventListener('click', function(e) { e.stopPropagation(); });
      compareCb.addEventListener('change', function() {
        toggleCompare(id);
      });
    }

    // Note toggle
    var noteToggle = card.querySelector('.btn-note-toggle');
    var noteArea = card.querySelector('.note-area');
    if (noteToggle && noteArea) {
      noteToggle.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        noteArea.classList.toggle('hidden');
        if (!noteArea.classList.contains('hidden')) {
          var ta = noteArea.querySelector('textarea');
          if (ta) ta.focus();
        }
      });
      var ta = noteArea.querySelector('textarea');
      if (ta) {
        ta.addEventListener('blur', function() {
          setNote(id, ta.value);
          applyNote(card, ta.value);
        });
      }
    }

    // Hood pill quick-filter
    var hoodPill = card.querySelector('.hood-pill');
    if (hoodPill) hoodPill.addEventListener('click', function(e) {
      e.stopPropagation();
      var slug = hoodPill.dataset.filterHood;
      document.querySelectorAll('input[name="hood"]').forEach(function(cb) {
        cb.checked = cb.value === slug;
      });
      applyFilters();
    });

    // Chip click → toggle feature filter
    card.querySelectorAll('.chip').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var feat = chip.dataset.feat;
        var cb = document.querySelector('input[name="feat"][value="' + feat + '"]');
        if (cb) { cb.checked = !cb.checked; applyFilters(); }
      });
    });
  });

  // ---------- Sort ----------
  function sortBy(key) {
    var arr = cards.slice();
    if (key === 'neighborhood') {
      arr.sort(function(a, b) {
        var an = (a.dataset.neighborhood || '').toLocaleLowerCase('pt-BR');
        var bn = (b.dataset.neighborhood || '').toLocaleLowerCase('pt-BR');
        var cmp = an.localeCompare(bn, 'pt-BR');
        if (cmp !== 0) return cmp;
        return (parseFloat(b.dataset.score) || 0) - (parseFloat(a.dataset.score) || 0);
      });
    } else {
      var sign = (key === 'score' || key === 'area') ? -1 : 1;
      arr.sort(function(a, b) {
        var av = parseFloat(a.dataset[key]) || 0;
        var bv = parseFloat(b.dataset[key]) || 0;
        if (av === 0 && bv !== 0) return 1;
        if (bv === 0 && av !== 0) return -1;
        return (av - bv) * sign;
      });
    }
    arr.forEach(function(c) { grid.appendChild(c); });
  }
  document.querySelectorAll('[data-sort]').forEach(function(b) {
    b.addEventListener('click', function() {
      document.querySelectorAll('[data-sort]').forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      sortBy(b.dataset.sort);
    });
  });

  // ---------- Density toggle ----------
  document.querySelectorAll('[data-density]').forEach(function(b) {
    b.addEventListener('click', function() {
      var d = b.dataset.density;
      document.querySelectorAll('[data-density]').forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
      grid.classList.toggle('density-compact', d === 'compact');
      grid.classList.toggle('density-cards', d === 'cards');
    });
  });

  // ---------- Filters ----------
  var searchInput = document.getElementById('search');
  var searchClear = document.getElementById('search-clear');
  var minScoreInput = document.getElementById('min-score');
  var minScoreLabel = document.getElementById('min-score-label');
  var activeFilters = document.getElementById('active-filters');

  function getFilterState() {
    return {
      q: (searchInput.value || '').toLowerCase().trim(),
      minScore: parseInt(minScoreInput.value, 10),
      hoods: Array.prototype.slice.call(document.querySelectorAll('input[name="hood"]:checked')).map(function(cb) { return cb.value; }),
      feats: Array.prototype.slice.call(document.querySelectorAll('input[name="feat"]:checked')).map(function(cb) { return cb.value; }),
      mark: (document.querySelector('input[name="mark-filter"]:checked') || {}).value || 'all',
      showHidden: document.getElementById('show-hidden').checked,
    };
  }

  function applyFilters() {
    var f = getFilterState();
    searchClear.classList.toggle('visible', !!f.q);
    var visible = 0;
    cards.forEach(function(c) {
      var id = c.dataset.id;
      var score = parseInt(c.dataset.score, 10) || 0;
      var hoodSlug = c.dataset.neighborhoodSlug || '';
      var features = (c.dataset.features || '').split(' ').filter(Boolean);
      var mark = marks[id];

      var pass = true;
      if (score < f.minScore) pass = false;
      if (pass && f.hoods.length > 0 && f.hoods.indexOf(hoodSlug) === -1) pass = false;
      if (pass && f.feats.length > 0) {
        for (var i = 0; i < f.feats.length; i++) {
          if (features.indexOf(f.feats[i]) === -1) { pass = false; break; }
        }
      }
      if (pass && f.q) {
        var titleEl = c.querySelector('.card-title');
        var descEl = c.querySelector('.desc');
        var hay = ((titleEl ? titleEl.textContent : '') + ' ' + (descEl ? descEl.textContent : '') + ' ' + (c.dataset.neighborhood || '')).toLowerCase();
        if (hay.indexOf(f.q) === -1) pass = false;
      }
      if (pass && f.mark !== 'all') {
        if (f.mark === 'unmarked' && mark) pass = false;
        else if (f.mark !== 'unmarked' && mark !== f.mark) pass = false;
      }
      if (pass && mark === 'hidden' && !f.showHidden && f.mark !== 'hidden') pass = false;

      c.style.display = pass ? '' : 'none';
      if (pass) visible++;
    });
    if (resultsCount) resultsCount.textContent = visible.toLocaleString('pt-BR') + ' visíveis';
    var emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = visible === 0 ? '' : 'none';
    updateActiveFilters();
  }

  function updateActiveFilters() {
    var f = getFilterState();
    var pills = [];
    if (f.q) pills.push({ label: '🔍 "' + f.q + '"', remove: function() { searchInput.value = ''; } });
    if (f.minScore > 0) pills.push({ label: '📊 score ≥ ' + f.minScore, remove: function() { minScoreInput.value = '0'; minScoreLabel.textContent = '0'; } });
    f.hoods.forEach(function(h) {
      var label = (document.querySelector('input[name="hood"][value="' + h + '"]') || {}).dataset.label || h;
      pills.push({ label: '📍 ' + label, remove: function() { var cb = document.querySelector('input[name="hood"][value="' + h + '"]'); if (cb) cb.checked = false; } });
    });
    f.feats.forEach(function(fe) {
      var label = (document.querySelector('input[name="feat"][value="' + fe + '"]') || {}).dataset.label || fe;
      pills.push({ label: '✓ ' + label, remove: function() { var cb = document.querySelector('input[name="feat"][value="' + fe + '"]'); if (cb) cb.checked = false; } });
    });
    if (f.mark !== 'all') {
      var labels = { liked: '⭐ favoritos', maybe: '❓ talvez', hidden: '❌ ocultos', unmarked: '— não marcados' };
      pills.push({ label: 'mark: ' + labels[f.mark], remove: function() { var r = document.querySelector('input[name="mark-filter"][value="all"]'); if (r) { r.checked = true; r.dispatchEvent(new Event('change')); } } });
    }
    if (f.showHidden) pills.push({ label: '👁 mostrando ocultos', remove: function() { document.getElementById('show-hidden').checked = false; } });

    if (pills.length === 0) {
      activeFilters.innerHTML = '';
      return;
    }
    activeFilters.innerHTML = '<span class="label">filtros ativos:</span>';
    pills.forEach(function(p, i) {
      var pill = document.createElement('span');
      pill.className = 'filter-pill';
      pill.innerHTML = '<span>' + p.label + '</span><button aria-label="remover">×</button>';
      pill.querySelector('button').addEventListener('click', function() {
        p.remove();
        applyFilters();
      });
      activeFilters.appendChild(pill);
    });
    var clear = document.createElement('button');
    clear.className = 'clear-all';
    clear.textContent = 'limpar tudo';
    clear.addEventListener('click', function() { document.getElementById('btn-reset').click(); });
    activeFilters.appendChild(clear);
  }

  searchInput.addEventListener('input', applyFilters);
  searchClear.addEventListener('click', function() { searchInput.value = ''; applyFilters(); searchInput.focus(); });
  minScoreInput.addEventListener('input', function() {
    minScoreLabel.textContent = minScoreInput.value;
    applyFilters();
  });
  document.querySelectorAll('input[name="hood"], input[name="feat"], input[name="mark-filter"], #show-hidden').forEach(function(el) {
    el.addEventListener('change', applyFilters);
  });
  document.querySelectorAll('.mark-radio input').forEach(function(input) {
    input.addEventListener('change', function() {
      document.querySelectorAll('.mark-radio').forEach(function(l) { l.classList.remove('active'); });
      if (input.checked) input.parentElement.classList.add('active');
    });
  });
  var initialChecked = document.querySelector('.mark-radio input:checked');
  if (initialChecked) initialChecked.parentElement.classList.add('active');

  // Stats legend click → filter
  document.querySelectorAll('.stats-legend > div').forEach(function(d) {
    d.addEventListener('click', function() {
      var which = d.dataset.filter;
      var radio = document.querySelector('input[name="mark-filter"][value="' + which + '"]');
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
        applyFilters();
      }
    });
  });

  document.getElementById('btn-reset').addEventListener('click', function() {
    searchInput.value = '';
    minScoreInput.value = '0';
    minScoreLabel.textContent = '0';
    document.querySelectorAll('input[name="hood"], input[name="feat"]').forEach(function(cb) { cb.checked = false; });
    var allRadio = document.querySelector('input[name="mark-filter"][value="all"]');
    if (allRadio) { allRadio.checked = true; allRadio.dispatchEvent(new Event('change')); }
    document.getElementById('show-hidden').checked = false;
    applyFilters();
  });

  // ---------- Stats ----------
  function updateStats() {
    var counts = { liked: 0, maybe: 0, 'hidden-seg': 0, unmarked: 0 };
    cards.forEach(function(c) {
      var m = marks[c.dataset.id];
      if (m === 'liked') counts.liked++;
      else if (m === 'maybe') counts.maybe++;
      else if (m === 'hidden') counts['hidden-seg']++;
      else counts.unmarked++;
    });
    var total = cards.length || 1;
    if (statsTrack) {
      var segs = statsTrack.querySelectorAll('.stats-seg');
      var keys = ['liked', 'maybe', 'hidden-seg', 'unmarked'];
      keys.forEach(function(k, i) {
        if (segs[i]) segs[i].style.flexBasis = ((counts[k] / total) * 100) + '%';
      });
    }
    Object.keys(statsLegendNums).forEach(function(k) {
      if (statsLegendNums[k]) statsLegendNums[k].textContent = counts[k];
    });
  }

  // ---------- Tabs (Cards / Map) ----------
  var app = document.getElementById('app');
  var mapInited = false;
  function setView(view) {
    app.classList.remove('view-cards', 'view-map');
    app.classList.add('view-' + view);
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.toggle('active', t.dataset.view === view); });
    if (view === 'map' && !mapInited) initMap();
    if (view === 'map' && window._casaMap) setTimeout(function() { window._casaMap.invalidateSize(); }, 100);
    location.hash = view;
  }
  document.querySelectorAll('.tab').forEach(function(t) {
    t.addEventListener('click', function() { setView(t.dataset.view); });
  });

  // ---------- Map (Leaflet) ----------
  function initMap() {
    if (typeof L === 'undefined') return;
    var pins = cards.filter(function(c) { return c.dataset.lat && c.dataset.lng; }).map(function(c) {
      return {
        id: c.dataset.id,
        lat: parseFloat(c.dataset.lat),
        lng: parseFloat(c.dataset.lng),
        score: parseInt(c.dataset.score, 10) || 0,
        title: c.querySelector('.card-title').textContent,
        neighborhood: c.dataset.neighborhood,
        price: c.dataset.price,
        photo: (c.querySelector('.carousel-img') || {}).src || '',
      };
    });
    if (pins.length === 0) {
      document.getElementById('map').innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-3);text-align:center;padding:40px;gap:16px;"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg><div><strong style="color:var(--text-1);font-size:14px;">Nenhum imóvel com coordenadas</strong><br>Tente <code>--refresh</code> pra atualizar com lat/lng</div></div>';
      return;
    }
    var map = L.map('map');
    window._casaMap = map;

    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap, © CARTO',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    var bounds = [];
    pins.forEach(function(p) {
      var cls = p.score >= 80 ? 'score-great' : p.score >= 65 ? 'score-good' : p.score >= 50 ? 'score-ok' : 'score-low';
      var color = p.score >= 80 ? '#34d399' : p.score >= 65 ? '#a3e635' : p.score >= 50 ? '#fbbf24' : '#71717a';
      var icon = L.divIcon({
        html: '<div class="map-pin-teardrop ' + cls + '" style="--pin-color:' + color + '"><div class="pin-num">' + p.score + '</div></div>',
        className: '',
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -36],
      });
      var marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
      var priceFmt = p.price ? Number(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '';
      var html = '<div class="map-popup">' +
        (p.photo ? '<img src="' + p.photo + '" alt="">' : '') +
        '<h4>' + p.title + '</h4>' +
        '<div class="location">📍 ' + (p.neighborhood || '') + '</div>' +
        '<div class="price">' + priceFmt + '/mês · score ' + p.score + '</div>' +
        '<button data-card-id="' + p.id + '">Ver no card →</button>' +
        '</div>';
      marker.bindPopup(html);
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });

    document.getElementById('map').addEventListener('click', function(e) {
      if (e.target.tagName === 'BUTTON' && e.target.dataset.cardId) {
        var id = e.target.dataset.cardId;
        setView('cards');
        var card = grid.querySelector('[data-id="' + id + '"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('focused');
          setTimeout(function() { card.classList.remove('focused'); }, 2000);
        }
      }
    });
  }

  // ---------- Keyboard shortcuts ----------
  var focusedIdx = -1;
  function getVisibleCards() {
    return cards.filter(function(c) { return c.style.display !== 'none'; });
  }
  function focusCard(idx) {
    var v = getVisibleCards();
    if (v.length === 0) return;
    idx = Math.max(0, Math.min(idx, v.length - 1));
    focusedIdx = idx;
    cards.forEach(function(c) { c.classList.remove('focused'); });
    var target = v[idx];
    target.classList.add('focused');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function getFocusedCard() {
    var v = getVisibleCards();
    if (focusedIdx < 0 || focusedIdx >= v.length) return null;
    return v[focusedIdx];
  }

  var help = document.getElementById('help');
  document.addEventListener('keydown', function(e) {
    // Lightbox
    if (!lb.classList.contains('hidden')) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') lbNext();
      if (e.key === 'ArrowLeft') lbPrev();
      return;
    }
    // Compare modal
    if (!compareModal.classList.contains('hidden')) {
      if (e.key === 'Escape') compareModal.classList.add('hidden');
      return;
    }
    // Don't intercept while typing
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === '/') { e.preventDefault(); searchInput.focus(); return; }
    if (e.key === '?') { help.classList.toggle('hidden'); return; }
    if (e.key === 'Escape') { help.classList.add('hidden'); return; }
    if (e.key === 'j') { focusCard(focusedIdx + 1); return; }
    if (e.key === 'k') { focusCard(Math.max(0, focusedIdx - 1)); return; }
    if (e.key === 'g') {
      var handler = function(e2) {
        document.removeEventListener('keydown', handler);
        if (e2.key === 'm') setView('map');
        else if (e2.key === 'c') setView('cards');
      };
      document.addEventListener('keydown', handler, { once: true });
      return;
    }
    if (e.key === 'C' && e.shiftKey) { openCompareModal(); return; }
    var card = getFocusedCard();
    if (!card) return;
    var id = card.dataset.id;
    if (e.key === 's') { var nm = marks[id] === 'liked' ? null : 'liked'; setMark(id, nm); applyMark(card, nm); applyFilters(); }
    if (e.key === 'm') { var nm2 = marks[id] === 'maybe' ? null : 'maybe'; setMark(id, nm2); applyMark(card, nm2); applyFilters(); }
    if (e.key === 'n') { var nm3 = marks[id] === 'hidden' ? null : 'hidden'; setMark(id, nm3); applyMark(card, nm3); applyFilters(); }
    if (e.key === 'c' && !e.shiftKey) { toggleCompare(id); }
    if (e.key === 'Enter') {
      var openBtn = card.querySelector('.btn-open');
      if (openBtn) window.open(openBtn.href, '_blank');
    }
  });
  document.querySelectorAll('.help-overlay').forEach(function(el) {
    el.addEventListener('click', function(e) { if (e.target === el) el.classList.add('hidden'); });
  });

  // Mobile menu toggle
  var menuToggle = document.querySelector('.menu-toggle');
  var sidebar = document.querySelector('aside.sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', function() { sidebar.classList.toggle('open'); });
  }

  // Init
  updateStats();
  applyFilters();
  if (location.hash === '#map') setView('map');
  else setView('cards');
})();
`;

export function toHtml(listings: Listing[], filters: SearchFilters): string {
  const generatedAt = new Date().toLocaleString('pt-BR');
  const filterSummary = [
    `${filters.transaction} · ${filters.propertyType} · ${filters.city}/${filters.state.toUpperCase()}`,
    filters.priceMin || filters.priceMax
      ? `R$${filters.priceMin ?? '0'}–${filters.priceMax ?? '∞'}`
      : '',
    filters.bedroomsMin ? `${filters.bedroomsMin}+ qto` : '',
    filters.parkingMin ? `${filters.parkingMin}+ vg` : '',
    filters.areaMin ? `${filters.areaMin}m²+` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const distinctTypes = new Set(listings.map((l) => l.apiType).filter(Boolean));
  const showTypeBadge = distinctTypes.size > 1;

  const hoodCounts: Record<string, { label: string; count: number }> = {};
  const featCounts: Record<string, number> = {};
  for (const l of listings) {
    if (l.neighborhood) {
      const s = slug(l.neighborhood);
      if (s) {
        if (!hoodCounts[s]) hoodCounts[s] = { label: l.neighborhood, count: 0 };
        hoodCounts[s]!.count++;
      }
    }
    for (const f of detectFeatures(l)) {
      featCounts[f] = (featCounts[f] || 0) + 1;
    }
  }
  const sortedHoods = Object.entries(hoodCounts).sort((a, b) =>
    a[1].label.localeCompare(b[1].label, 'pt-BR')
  );
  const sortedFeats = Object.entries(featCounts).sort((a, b) => b[1] - a[1]);

  const cardsHtml = listings.map((l, i) => renderCard(l, i, showTypeBadge)).join('');

  const hoodsHtml = sortedHoods
    .map(
      ([s, info]) =>
        `<label><input type="checkbox" name="hood" value="${esc(s)}" data-label="${esc(info.label)}"> <span class="name">${esc(info.label)}</span> <span class="count">${info.count}</span></label>`
    )
    .join('');

  const featsHtml = sortedFeats
    .map(
      ([f, count]) =>
        `<label><input type="checkbox" name="feat" value="${esc(f)}" data-label="${esc(FEATURE_LABELS[f] ?? f)}"> <span class="name">${esc(FEATURE_LABELS[f] ?? f)}</span> <span class="count">${count}</span></label>`
    )
    .join('');

  const emptyStateSvg = `<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="m8 8 6 6"/><path d="m14 8-6 6"/></svg>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>casa-finder · ${esc(filterSummary)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<style>${STYLES}</style>
</head>
<body>
<div class="app view-cards" id="app">

<header class="topbar" role="banner">
  <button class="menu-toggle" aria-label="abrir filtros">☰</button>
  <div class="brand">
    <div class="brand-logo" aria-hidden="true">cf</div>
    <div class="brand-text">
      <h1>casa-finder</h1>
      <div class="subtitle">${esc(filterSummary)} · ${listings.length} imóveis · ${esc(generatedAt)}</div>
    </div>
  </div>
  <div class="grow"></div>
  <nav class="tabs" role="tablist" aria-label="Visualização">
    <button class="tab active" data-view="cards" role="tab" aria-selected="true">📋 Cards</button>
    <button class="tab" data-view="map" role="tab" aria-selected="false">🗺 Mapa</button>
  </nav>
  <button class="btn-help" id="btn-help" onclick="document.getElementById('help').classList.toggle('hidden')" title="Atalhos de teclado (?)" aria-label="Atalhos de teclado">?</button>
</header>

<div class="active-filters" id="active-filters" aria-live="polite"></div>

<aside class="sidebar" role="complementary">
  <div class="sb-section">
    <div class="sb-label">Buscar</div>
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="text" class="search-input" id="search" placeholder="título, descrição, bairro..." aria-label="Buscar imóveis" />
      <button class="search-clear" id="search-clear" aria-label="limpar busca">✕</button>
    </div>
  </div>

  <div class="sb-section">
    <div class="sb-label">Ordenar por</div>
    <div class="sort-buttons">
      <button data-sort="score" class="active">Score</button>
      <button data-sort="neighborhood">Bairro</button>
      <button data-sort="price">Preço</button>
      <button data-sort="ppsm">R$/m²</button>
      <button data-sort="area">Área</button>
    </div>
  </div>

  <div class="sb-section">
    <div class="sb-label">Triagem</div>
    <div class="stats-bar">
      <div class="stats-track" id="stats-track" aria-label="Distribuição de marcações">
        <div class="stats-seg liked" style="flex-basis: 0%"></div>
        <div class="stats-seg maybe" style="flex-basis: 0%"></div>
        <div class="stats-seg hidden-seg" style="flex-basis: 0%"></div>
        <div class="stats-seg unmarked" style="flex-basis: 100%"></div>
      </div>
      <div class="stats-legend">
        <div data-filter="liked" id="legend-liked"><span class="dot liked"></span> ⭐ favoritos <span class="num">0</span></div>
        <div data-filter="maybe" id="legend-maybe"><span class="dot maybe"></span> ❓ talvez <span class="num">0</span></div>
        <div data-filter="hidden" id="legend-hidden"><span class="dot hidden-seg"></span> ❌ ocultos <span class="num">0</span></div>
        <div data-filter="unmarked" id="legend-unmarked"><span class="dot unmarked"></span> — sem marca <span class="num">0</span></div>
      </div>
    </div>
  </div>

  <div class="sb-section">
    <div class="sb-label">Filtrar por marcação</div>
    <div class="mark-radio-group">
      <label class="mark-radio active"><input type="radio" name="mark-filter" value="all" checked hidden> Tudo</label>
      <label class="mark-radio"><input type="radio" name="mark-filter" value="liked" hidden> ⭐</label>
      <label class="mark-radio"><input type="radio" name="mark-filter" value="maybe" hidden> ❓</label>
      <label class="mark-radio"><input type="radio" name="mark-filter" value="unmarked" hidden> sem marca</label>
    </div>
    <label class="show-hidden-row">
      <input type="checkbox" id="show-hidden"> mostrar ocultos (❌)
    </label>
  </div>

  <div class="sb-section">
    <div class="sb-label">Score mínimo</div>
    <div class="range-row">
      <input type="range" id="min-score" min="0" max="100" value="0" step="1" aria-label="Score mínimo">
      <span class="range-value">≥ <span id="min-score-label">0</span></span>
    </div>
  </div>

  <div class="sb-section">
    <div class="sb-label">Bairro <span class="count-pill">${sortedHoods.length}</span></div>
    <div class="checkbox-list">${hoodsHtml || '<div style="color:var(--text-4);font-size:11px;">nenhum bairro</div>'}</div>
  </div>

  <div class="sb-section">
    <div class="sb-label">Características <span class="count-pill">${sortedFeats.length}</span></div>
    <div class="checkbox-list">${featsHtml || '<div style="color:var(--text-4);font-size:11px;">nenhuma característica detectada</div>'}</div>
  </div>

  <button class="btn-reset" id="btn-reset">Resetar filtros</button>
</aside>

<main class="content" role="main">
  <div class="cards-view">
    <div class="results-bar">
      <span class="count" id="results-count">${listings.length} visíveis</span>
      <span class="grow"></span>
      <div class="density-toggle" role="group" aria-label="Densidade da lista">
        <button data-density="cards" class="active" title="Cards">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          Cards
        </button>
        <button data-density="compact" title="Lista compacta">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          Lista
        </button>
      </div>
      <button class="btn-shortcut" onclick="document.getElementById('help').classList.remove('hidden')">⌨ atalhos</button>
    </div>

    <div class="grid density-cards" id="grid">${cardsHtml}</div>

    <div class="empty-state" id="empty-state" style="display:none;">
      ${emptyStateSvg}
      <h3>Nenhum imóvel passou nos filtros</h3>
      <p>Tente afrouxar os critérios — começa pelo score mínimo ou desmarca alguns bairros.</p>
      <button onclick="document.getElementById('btn-reset').click()">Resetar filtros</button>
    </div>
  </div>

  <div class="map-view">
    <div id="map"></div>
  </div>
</main>

</div>

<button class="compare-fab hidden" id="compare-fab" aria-label="Comparar imóveis selecionados">
  <span>⚖ Comparar</span>
  <span class="fab-count">0</span>
</button>

<div class="lightbox hidden" id="lightbox" role="dialog" aria-label="visualizador de fotos">
  <img src="" alt="">
  <button class="lightbox-close" aria-label="fechar (Esc)">✕</button>
  <button class="lightbox-prev" aria-label="anterior (←)">‹</button>
  <button class="lightbox-next" aria-label="próxima (→)">›</button>
  <div class="lightbox-counter">1 / 1</div>
</div>

<div class="compare-modal hidden" id="compare-modal" role="dialog" aria-label="comparar imóveis">
  <div class="panel">
    <div class="compare-header">
      <h2>Comparar imóveis</h2>
      <button class="btn-close-compare" aria-label="fechar">✕</button>
    </div>
    <div class="compare-grid" id="compare-grid"></div>
  </div>
</div>

<div class="help-overlay hidden" id="help" role="dialog" aria-label="atalhos de teclado">
  <div class="panel">
    <h3>⌨ Atalhos de teclado</h3>
    <div class="help-section">
      <h4>Navegação</h4>
      <table>
        <tr><td><kbd>j</kbd> / <kbd>k</kbd></td><td>próximo / anterior card</td></tr>
        <tr><td><kbd>Enter</kbd></td><td>abrir anúncio do card focado</td></tr>
        <tr><td><kbd>/</kbd></td><td>focar busca</td></tr>
        <tr><td><kbd>g</kbd> <kbd>m</kbd></td><td>ir pra mapa</td></tr>
        <tr><td><kbd>g</kbd> <kbd>c</kbd></td><td>voltar pra cards</td></tr>
      </table>
    </div>
    <div class="help-section">
      <h4>Triagem</h4>
      <table>
        <tr><td><kbd>s</kbd></td><td>marcar ⭐ (gostei)</td></tr>
        <tr><td><kbd>m</kbd></td><td>marcar ❓ (talvez)</td></tr>
        <tr><td><kbd>n</kbd></td><td>marcar ❌ (esconder)</td></tr>
        <tr><td><kbd>c</kbd></td><td>adicionar à comparação (até 3)</td></tr>
        <tr><td><kbd>Shift</kbd>+<kbd>C</kbd></td><td>abrir modal de comparação</td></tr>
      </table>
    </div>
    <div class="help-section">
      <h4>Outros</h4>
      <table>
        <tr><td><kbd>?</kbd></td><td>esta ajuda</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>fechar overlay/lightbox</td></tr>
        <tr><td colspan="2" style="padding-top:8px;color:var(--text-4);">Lightbox: <kbd>←</kbd> <kbd>→</kbd> navegam fotos</td></tr>
      </table>
    </div>
  </div>
</div>

<script>${SCRIPTS}</script>
</body>
</html>`;
}
