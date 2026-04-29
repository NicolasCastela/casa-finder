import type { SearchFilters, Listing, Transaction } from './types.js';
import { fetchHtml } from './fetcher.js';
import { readCache, writeCache } from './cache.js';

/**
 * Adapter pro OLX Imóveis (olx.com.br).
 *
 * Estratégia: a página `/imoveis/aluguel/casas/estado-{uf}/{cidade}-e-regiao` é
 * uma shell Next.js que injeta `__NEXT_DATA__` com a lista completa de ads
 * já server-rendered. Sem necessidade de bater em API REST/GraphQL — basta
 * parsear o JSON do <script>.
 *
 * Filtros server-side: `ps` (price min), `pe` (price max), `?o=N` (página).
 * URL inclui "regiao" → pode trazer cidades vizinhas; filtramos client-side
 * pra match exato de city slug.
 *
 * Os ads já vêm com photos, properties (rooms/area/garage), location e
 * features descritivas — não precisa de detail enrichment como InfoImóveis.
 */

const SITE_BASE = 'https://www.olx.com.br';
const HTTP_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const TRANSACTION_PATH: Record<Transaction, string> = {
  aluguel: 'aluguel',
  venda: 'venda',
};

interface OlxImage {
  original?: string;
  originalWebp?: string;
}

interface OlxProperty {
  name: string;
  label?: string;
  value: string;
}

interface OlxAd {
  listId: number;
  subject: string;
  priceValue: string;
  professionalAd: boolean;
  url: string;
  friendlyUrl: string;
  date: number;
  origListTime: number;
  imageCount?: number;
  images?: OlxImage[];
  location?: string;
  locationDetails?: { municipality?: string; neighbourhood?: string; uf?: string; ddd?: string };
  properties?: OlxProperty[];
  category?: string;
  user?: unknown;
}

interface OlxNextData {
  props?: {
    pageProps?: {
      ads?: OlxAd[];
      totalOfAds?: number;
      pageIndex?: number;
      pageSize?: number;
    };
  };
}

export interface FetchStats {
  cached: number;
  fresh: number;
}

export interface FetchOptions {
  refresh?: boolean;
  stats?: FetchStats;
}

function buildSearchUrl(filters: SearchFilters, page: number): string {
  const path = `/imoveis/${TRANSACTION_PATH[filters.transaction]}/casas/estado-${filters.state.toLowerCase()}/${filters.city.toLowerCase()}-e-regiao`;
  const params = new URLSearchParams();
  if (filters.priceMin) params.set('ps', String(filters.priceMin));
  if (filters.priceMax) params.set('pe', String(filters.priceMax));
  if (page > 1) params.set('o', String(page));
  const qs = params.toString();
  return `${SITE_BASE}${path}${qs ? '?' + qs : ''}`;
}

function parseBrlPrice(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function parseSize(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function getProp(ad: OlxAd, name: string): string | undefined {
  return ad.properties?.find((p) => p.name === name)?.value;
}

function mapAd(ad: OlxAd, filters: SearchFilters): Listing | null {
  // OLX trabalha em "região" — filtra pra match exato da cidade
  const city = ad.locationDetails?.municipality?.toLowerCase() ?? '';
  const wantedCity = filters.city.toLowerCase().replace(/-/g, ' ');
  if (city && wantedCity && !city.includes(wantedCity) && !wantedCity.includes(city)) {
    return null;
  }

  const price = parseBrlPrice(ad.priceValue);
  const area = parseSize(getProp(ad, 'size'));
  const condoFee = parseBrlPrice(getProp(ad, 'condominio'));
  const iptu = parseBrlPrice(getProp(ad, 'iptu'));
  const rooms = Number(getProp(ad, 'rooms')) || undefined;
  const bathrooms = Number(getProp(ad, 'bathrooms')) || undefined;
  const garage = Number(getProp(ad, 'garage_spaces')) || undefined;
  const realEstateType = getProp(ad, 'real_estate_type');

  const features: string[] = [];
  const reFeatures = getProp(ad, 're_features');
  const reComplexFeatures = getProp(ad, 're_complex_features');
  if (reFeatures) features.push(...reFeatures.split(',').map((s) => s.trim()).filter(Boolean));
  if (reComplexFeatures)
    features.push(...reComplexFeatures.split(',').map((s) => s.trim()).filter(Boolean));

  const totalMonthly = price > 0 ? price + (condoFee || 0) + (iptu || 0) : undefined;

  const photos = (ad.images ?? [])
    .map((i) => i.original)
    .filter((u): u is string => Boolean(u));

  return {
    id: `olx-${ad.listId}`,
    source: 'olx',
    title: ad.subject || 'Sem título',
    apiType: realEstateType,
    price,
    condoFee: condoFee || undefined,
    iptu: iptu || undefined,
    totalMonthly,
    pricePerSqm: price > 0 && area && area > 0 ? Math.round(price / area) : undefined,
    bedrooms: rooms,
    bathrooms,
    parkingSpaces: garage,
    area,
    neighborhood: ad.locationDetails?.neighbourhood,
    city: ad.locationDetails?.municipality ?? '',
    state: (ad.locationDetails?.uf ?? '').toUpperCase(),
    url: ad.url || ad.friendlyUrl,
    thumbnailUrl: photos[0],
    photos,
    features,
    enriched: true, // OLX já entrega tudo no listing — sem detail extra
  };
}

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

async function fetchListBody(url: string, opts: FetchOptions): Promise<string> {
  if (!opts.refresh) {
    const cached = readCache('list-olx', url);
    if (cached) {
      if (opts.stats) opts.stats.cached++;
      return cached;
    }
  }
  const body = await fetchHtml(url, { extraHeaders: HTTP_HEADERS });
  writeCache('list-olx', url, body);
  if (opts.stats) opts.stats.fresh++;
  return body;
}

/**
 * Busca todas as páginas de OLX pra esses filtros.
 * Para quando: página vazia, página retorna 0 novos, ou totalOfAds atingido.
 */
export async function fetchAllListings(
  filters: SearchFilters,
  opts: FetchOptions = {}
): Promise<Listing[]> {
  const all: Listing[] = [];
  const seen = new Set<string>();
  const maxPages = 20; // safety: OLX rarely tem mais que isso pra uma busca

  for (let page = 1; page <= maxPages; page++) {
    const url = buildSearchUrl(filters, page);
    let body: string;
    try {
      body = await fetchListBody(url, opts);
    } catch {
      break;
    }

    const m = body.match(NEXT_DATA_RE);
    if (!m) break;

    let data: OlxNextData;
    try {
      data = JSON.parse(m[1]!);
    } catch {
      break;
    }

    const ads = data.props?.pageProps?.ads ?? [];
    if (ads.length === 0) break;

    let addedThisPage = 0;
    for (const ad of ads) {
      const l = mapAd(ad, filters);
      if (!l) continue;
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      all.push(l);
      addedThisPage++;
    }

    if (addedThisPage === 0) break;

    const total = data.props?.pageProps?.totalOfAds ?? 0;
    if (total > 0 && all.length >= total) break;
  }

  return all;
}
