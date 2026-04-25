import type { SearchFilters, Listing, PropertyType, Transaction } from './types.js';
import { fetchHtml } from './fetcher.js';
import { readCache, writeCache } from './cache.js';

/** Estatísticas de cache de uma fase de fetch — usado pelo orquestrador no log */
export interface FetchStats {
  cached: number;
  fresh: number;
}

/**
 * O site infoimoveis.com.br renderiza listings client-side via React.
 * O HTML servido (Next.js shell) NÃO contém os imóveis — eles vêm de
 * apiw.infoimoveis.com.br como JSON. Bater direto na API é muito mais
 * estável que parsear HTML.
 *
 * Endpoints:
 *   GET /imoveis            — listagem paginada com filtros (campos resumidos)
 *   GET /imoveis/{id}       — detalhe (descrição completa, IPTU, características,
 *                             múltiplas fotos, coordenadas, anunciante)
 *
 * Filtros server-side aceitos: cidade (slug), estado (UF), finalidade
 * (Aluguel|Venda), tipo (enum exato), valor_min, valor_max, page, limit.
 *
 * Filtros server-side NÃO honrados (mesmo aceitando o param sem erro):
 * dormitorios_min, area_min, garagem_min — esses são aplicados client-side.
 */

const API_BASE = 'https://apiw.infoimoveis.com.br';
const SITE_BASE = 'https://www.infoimoveis.com.br';
const IMG_BASE = 'https://static.infoimoveis.com.br/redim/800/stored/imoveis';
const PAGE_SIZE = 20;

const TRANSACTION_MAP: Record<Transaction, string> = {
  aluguel: 'Aluguel',
  venda: 'Venda',
};

/**
 * Slug do CLI → valores `tipo` exatos da API. Múltiplos = uma request por valor
 * (a API rejeita `tipo[]=A&tipo[]=B` com erro de validação).
 */
const TIPO_MAP: Record<PropertyType, string[]> = {
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

interface ApiListSummary {
  id: number;
  titulo: string;
  endereco?: string;
  valor: number;
  finalidade: string;
  tipo: string;
  cidade: string;
  bairro?: string;
  estado: string;
  dormitorios?: number;
  banheiros?: number;
  garagem?: number;
  area_total?: string;
  area_construida?: string;
  imagem_principal?: string | null;
}

interface ApiImage {
  imagem: string;
  legenda?: string;
}

interface ApiDetail extends ApiListSummary {
  informacoes?: string;
  observacoes?: string;
  iptu?: string;
  imagens?: ApiImage[];
  caracteristicas?: string[];
  infraestrutura?: string[];
  anunciante?: { nome?: string };
  latitude?: string;
  longitude?: string;
}

interface ApiListResponse {
  success: boolean;
  message: string;
  data?: ApiListSummary[];
  pagination?: { page: number; limit: number; total: number; pages: number };
}

interface ApiDetailResponse {
  success: boolean;
  message: string;
  data?: ApiDetail;
}

const API_HEADERS: Record<string, string> = {
  Origin: SITE_BASE,
  Referer: `${SITE_BASE}/`,
  Accept: 'application/json, text/plain, */*',
};

/** "65,00" / "1.250,50" → 65 / 1250.5 */
function parseAreaPtBr(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const v = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** "R$ 88,28" / "1.250,50" → 88.28 / 1250.5 */
function parseBrlPtBr(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const cleaned = s.replace(/[^\d.,]/g, '');
  if (!cleaned) return undefined;
  // PT-BR usa . como milhar e , como decimal
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const v = Number(normalized);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

function parseCoord(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

/** Conta quantas suítes a partir das `caracteristicas` ("1 Suíte(s)" / "2 Suítes") */
function extractSuites(caracteristicas: string[] | undefined): number | undefined {
  if (!caracteristicas) return undefined;
  for (const c of caracteristicas) {
    const m = c.match(/(\d+)\s*Su[ií]te/i);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/**
 * Tenta extrair valor de condomínio das observações/descrição.
 * Padrões observados: "condomínio R$ 350", "cond. de R$ 200", etc.
 */
function extractCondoFee(detail: ApiDetail): number | undefined {
  const haystack = [detail.informacoes, detail.observacoes].filter(Boolean).join(' ');
  if (!haystack) return undefined;
  const m =
    haystack.match(/cond(?:om[ií]nio)?[^.]{0,30}?R?\$?\s*([\d.,]+)/i) ?? null;
  if (!m) return undefined;
  return parseBrlPtBr(m[1]);
}

function mapSummary(api: ApiListSummary): Listing {
  // Prioriza área construída (espaço interno) sobre área total (que pode incluir
  // terreno grande em casas) — é o que importa pra decisão de aluguel residencial.
  const area = parseAreaPtBr(api.area_construida) ?? parseAreaPtBr(api.area_total);
  const price = api.valor || 0;
  return {
    id: String(api.id),
    title: api.titulo || 'Sem título',
    apiType: api.tipo,
    price,
    bedrooms: api.dormitorios || undefined,
    bathrooms: api.banheiros || undefined,
    parkingSpaces: api.garagem || undefined,
    area,
    pricePerSqm: price > 0 && area && area > 0 ? Math.round(price / area) : undefined,
    neighborhood: api.bairro || undefined,
    city: api.cidade || '',
    state: api.estado || '',
    url: `${SITE_BASE}/${api.id}`,
    thumbnailUrl: api.imagem_principal ? `${IMG_BASE}/${api.imagem_principal}` : undefined,
    address: api.endereco || undefined,
  };
}

/**
 * Aplica os campos do detail por cima de um Listing já mapeado do summary.
 * Mantém imutabilidade — retorna nova instância.
 */
export function mergeDetail(listing: Listing, detail: ApiDetail): Listing {
  const photos = detail.imagens?.map((i) => `${IMG_BASE}/${i.imagem}`) ?? [];
  const iptu = parseBrlPtBr(detail.iptu);
  const condoFee = extractCondoFee(detail);

  // IPTU vem geralmente como valor mensal já. Se vier > 12x do aluguel, é anual.
  const iptuMonthly =
    iptu && listing.price > 0 && iptu > listing.price * 0.5 ? iptu / 12 : iptu;

  const totalMonthly =
    listing.price + (condoFee ?? 0) + (iptuMonthly ?? 0);

  return {
    ...listing,
    suites: extractSuites(detail.caracteristicas),
    photos: photos.length > 0 ? photos : listing.thumbnailUrl ? [listing.thumbnailUrl] : [],
    thumbnailUrl: photos[0] ?? listing.thumbnailUrl,
    description: detail.informacoes || listing.description,
    features: detail.caracteristicas,
    nearby: detail.infraestrutura,
    agency: detail.anunciante?.nome,
    latitude: parseCoord(detail.latitude),
    longitude: parseCoord(detail.longitude),
    iptu: iptuMonthly,
    condoFee,
    totalMonthly: listing.price > 0 ? Math.round(totalMonthly) : undefined,
    address: detail.endereco || listing.address,
    enriched: true,
  };
}

function buildSearchUrl(filters: SearchFilters, tipo: string, page: number): string {
  const params = new URLSearchParams();
  params.set('cidade', filters.city);
  if (filters.state) params.set('estado', filters.state.toUpperCase());
  params.set('finalidade', TRANSACTION_MAP[filters.transaction]);
  params.set('tipo', tipo);
  if (filters.priceMin) params.set('valor_min', String(filters.priceMin));
  if (filters.priceMax) params.set('valor_max', String(filters.priceMax));
  params.set('page', String(page));
  params.set('limit', String(PAGE_SIZE));
  return `${API_BASE}/imoveis?${params.toString()}`;
}

export interface FetchPageOptions {
  /** Se true, ignora o cache e força refetch */
  refresh?: boolean;
  /** Stats acumulados de cache hits/misses (mutado pela função) */
  stats?: FetchStats;
}

async function fetchListBody(url: string, opts: FetchPageOptions): Promise<string> {
  if (!opts.refresh) {
    const cached = readCache('list', url);
    if (cached) {
      if (opts.stats) opts.stats.cached++;
      return cached;
    }
  }
  const body = await fetchHtml(url, { extraHeaders: API_HEADERS });
  writeCache('list', url, body);
  if (opts.stats) opts.stats.fresh++;
  return body;
}

/** Granularidade mínima do bisect — mais fino que isso geralmente é overkill */
const MIN_PRICE_STEP = 50;

/**
 * Fatiamento por bisecção. A API do InfoImóveis retorna no máximo 20 imóveis
 * por request, independente de `page` e `limit` — ambos parâmetros são
 * ignorados silenciosamente. Pra extrair tudo, dividimos a faixa de preço
 * em sub-faixas até cada uma caber em ≤20 retornados.
 *
 * Cada sub-faixa vira uma URL distinta e portanto entry independente no cache.
 */
async function fetchSlice(
  filters: SearchFilters,
  tipo: string,
  opts: FetchPageOptions,
  lo: number,
  hi: number,
  seen: Set<string>,
  out: Listing[]
): Promise<void> {
  if (hi <= lo) return;
  const sliceFilters: SearchFilters = { ...filters, priceMin: lo, priceMax: hi };
  const url = buildSearchUrl(sliceFilters, tipo, 1);
  const body = await fetchListBody(url, opts);

  let json: ApiListResponse;
  try {
    json = JSON.parse(body);
  } catch {
    return;
  }
  if (!json.success || !json.data) return;

  for (const api of json.data) {
    const id = String(api.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(mapSummary(api));
  }

  const total = json.pagination?.total ?? json.data.length;
  // Se a API diz que tem mais que retornou, bisecciona
  if (total > json.data.length && hi - lo > MIN_PRICE_STEP) {
    const mid = Math.floor((lo + hi) / 2);
    await fetchSlice(filters, tipo, opts, lo, mid, seen, out);
    await fetchSlice(filters, tipo, opts, mid + 1, hi, seen, out);
  }
}

async function fetchAllForType(
  filters: SearchFilters,
  tipo: string,
  opts: FetchPageOptions
): Promise<Listing[]> {
  const seen = new Set<string>();
  const out: Listing[] = [];

  // Sem range de preço: pega o que a API der numa única request (20)
  if (filters.priceMin == null || filters.priceMax == null) {
    const url = buildSearchUrl(filters, tipo, 1);
    const body = await fetchListBody(url, opts);
    let json: ApiListResponse;
    try {
      json = JSON.parse(body);
    } catch {
      return out;
    }
    if (json.success && json.data) {
      for (const api of json.data) {
        const id = String(api.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(mapSummary(api));
      }
    }
    return out;
  }

  await fetchSlice(filters, tipo, opts, filters.priceMin, filters.priceMax, seen, out);
  return out;
}

export async function fetchPage(
  filters: SearchFilters,
  page: number,
  opts: FetchPageOptions = {}
): Promise<{ listings: Listing[]; hasNextPage: boolean }> {
  // A API não pagina de fato — toda a "exaustão" é feita via bisect interno.
  // O loop de pages no orquestrador chama esta função uma única vez.
  if (page > 1) return { listings: [], hasNextPage: false };

  const tipos = TIPO_MAP[filters.propertyType];
  if (!tipos || tipos.length === 0) {
    throw new Error(`Tipo de imóvel desconhecido: "${filters.propertyType}"`);
  }

  const all: Listing[] = [];
  const seen = new Set<string>();

  for (const tipo of tipos) {
    const forType = await fetchAllForType(filters, tipo, opts);
    for (const l of forType) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      all.push(l);
    }
  }

  return { listings: all, hasNextPage: false };
}

export interface FetchDetailOptions {
  refresh?: boolean;
  stats?: FetchStats;
}

/** Fetch detalhe de um único imóvel por ID. Retorna o ApiDetail bruto. */
export async function fetchDetail(
  id: string,
  opts: FetchDetailOptions = {}
): Promise<ApiDetail | null> {
  const url = `${API_BASE}/imoveis/${id}`;
  let body: string;
  if (!opts.refresh) {
    const cached = readCache('detail', url);
    if (cached) {
      if (opts.stats) opts.stats.cached++;
      body = cached;
    } else {
      body = await fetchHtml(url, { extraHeaders: API_HEADERS, delayMs: 1200 });
      writeCache('detail', url, body);
      if (opts.stats) opts.stats.fresh++;
    }
  } else {
    body = await fetchHtml(url, { extraHeaders: API_HEADERS, delayMs: 1200 });
    writeCache('detail', url, body);
    if (opts.stats) opts.stats.fresh++;
  }

  let json: ApiDetailResponse;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json.success || !json.data) return null;
  return json.data;
}
