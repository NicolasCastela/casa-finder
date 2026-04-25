import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * Cache simples em disco. Sem TTL automático — invalidação só via --refresh
 * ou --cache-clear. Esse é o tradeoff explícito da spec: user no controle.
 *
 * Estrutura:
 *   cache/
 *     <namespace>-<hash16>.json    (ex: list-a1b2c3d4e5f6789a.json)
 *
 * Cada entry contém { url, body, savedAt } — body é o texto bruto da API.
 */

const CACHE_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'cache');
})();

interface CacheEntry {
  url: string;
  body: string;
  savedAt: string;
}

function ensureDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

/** Hash curto de 16 chars do URL — suficiente pro volume típico (centenas) */
export function cacheKey(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function pathFor(namespace: string, key: string): string {
  return join(CACHE_DIR, `${namespace}-${key}.json`);
}

export function readCache(namespace: string, url: string): string | null {
  const file = pathFor(namespace, cacheKey(url));
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf8');
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.body;
  } catch {
    return null;
  }
}

export function writeCache(namespace: string, url: string, body: string): void {
  ensureDir();
  const file = pathFor(namespace, cacheKey(url));
  const entry: CacheEntry = {
    url,
    body,
    savedAt: new Date().toISOString(),
  };
  writeFileSync(file, JSON.stringify(entry));
}

export function clearCache(): { removed: number; bytes: number } {
  if (!existsSync(CACHE_DIR)) return { removed: 0, bytes: 0 };
  let removed = 0;
  let bytes = 0;
  for (const f of readdirSync(CACHE_DIR)) {
    if (!f.endsWith('.json')) continue;
    const full = join(CACHE_DIR, f);
    bytes += statSync(full).size;
    rmSync(full);
    removed++;
  }
  return { removed, bytes };
}

export function cacheStats(): { count: number; bytes: number } {
  if (!existsSync(CACHE_DIR)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  for (const f of readdirSync(CACHE_DIR)) {
    if (!f.endsWith('.json')) continue;
    bytes += statSync(join(CACHE_DIR, f)).size;
    count++;
  }
  return { count, bytes };
}

export { CACHE_DIR };
