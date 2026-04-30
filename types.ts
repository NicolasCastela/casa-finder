export type Transaction = 'aluguel' | 'venda';

export type PropertyType =
  | 'casa'
  | 'casa-terrea'
  | 'casa-condominio'
  | 'apartamento'
  | 'sobrado'
  | 'kitnet'
  | 'sitio'
  | 'chacara'
  | 'terreno'
  | 'imovel-comercial';

export type SortBy = 'score' | 'neighborhood' | 'price' | 'area' | 'ppsm';

export interface SearchFilters {
  transaction: Transaction;
  propertyType: PropertyType;
  state: string;
  city: string;
  priceMin?: number;
  priceMax?: number;
  /** Custo total mensal máximo (rent + cond + IPTU/12) — aplicado pós-enrichment */
  totalMax?: number;
  areaMin?: number;
  areaMax?: number;
  bedroomsMin?: number;
  parkingMin?: number;
  keyword?: string;
  neighborhoods?: string[];
  excludeNeighborhoods?: string[];
  maxPages?: number;
  /** Slug de PropertyType que ganha bônus no score (não filtra) */
  typePreference?: PropertyType;
  /** Critério de ordenação final */
  sortBy?: SortBy;
}

export interface ScoreBreakdown {
  preco: number;
  precoM2: number;
  layout: number;
  bairro: number;
  area: number;
  amenidades: number;
  completude: number;
  preferencia: number;
  penalidades: number;
}

export type SourceId = 'infoimoveis' | 'olx';

export interface Listing {
  id: string;
  /** Site de onde veio o listing (`infoimoveis` | `olx` | ...) */
  source?: SourceId;
  title: string;
  /** Tipo bruto da API ("Casa-Térrea", "Sobrado-Condomínio"...) — usado pra preferência */
  apiType?: string;
  /** Aluguel/venda em R$. 0 = "sob consulta" */
  price: number;
  /** Condomínio mensal em R$ (se conhecido) */
  condoFee?: number;
  /** IPTU mensal em R$ (se conhecido — alguns vêm anuais, normalizamos) */
  iptu?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  suites?: number;
  parkingSpaces?: number;
  neighborhood?: string;
  city: string;
  state: string;
  url: string;
  thumbnailUrl?: string;
  /** Múltiplas fotos (vem do detail enrichment) */
  photos?: string[];
  /** Endereço completo (rua + número, sem bairro) */
  address?: string;
  /** Descrição rica (campo `informacoes` da API) */
  description?: string;
  /** Características do imóvel ("Churrasqueira", "Suíte", "Quintal"...) */
  features?: string[];
  /** Infraestrutura próxima ("Supermercado", "Escola"...) */
  nearby?: string[];
  /** Imobiliária/anunciante */
  agency?: string;
  latitude?: number;
  longitude?: number;
  /** Custo mensal total (aluguel + cond + IPTU/12). Calculado, não vem da API. */
  totalMonthly?: number;
  /** R$ por m² do aluguel — calculado */
  pricePerSqm?: number;
  /** Indica se o detail enrichment já foi aplicado */
  enriched?: boolean;
  score?: number;
  scoreBreakdown?: ScoreBreakdown;
  scoreReasons?: string[];
}

export interface PersistedState {
  seen: string[];
  /** Bairros que o user nunca quer ver — persistido entre runs, soma com --exclude-neighborhoods */
  excludedNeighborhoods?: string[];
  lastRunAt?: string;
}
