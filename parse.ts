export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parseia preços brasileiros: "R$ 2.500,00" -> 2500
 * Robusto a "Sob consulta", "Consulte", strings vazias.
 */
export function parseBrlPrice(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d,]/g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/**
 * Extrai primeiro número inteiro de uma string.
 * "120 m²" -> 120, "3 quartos" -> 3
 */
export function parseIntFromText(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Parseia área que pode ter decimal: "120,50 m²" -> 120.5
 */
export function parseAreaFromText(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;
  const value = Number(match[1]!.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

export function compactText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim();
}
