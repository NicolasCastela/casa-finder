import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersistedState } from './types.js';

/**
 * Estado persistido entre runs — armazena IDs já vistos pra suportar
 * `--only-new` (não revisitar imóveis já triados em runs anteriores).
 *
 * Arquivo fica em ./state.json ao lado do script (mesma pasta que package.json),
 * facilita backup manual e versionamento se quiser.
 */

const STATE_FILE = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  return `${here}/state.json`;
})();

export function loadState(): PersistedState {
  if (!existsSync(STATE_FILE)) return { seen: [], excludedNeighborhoods: [] };
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
      excludedNeighborhoods: Array.isArray(parsed.excludedNeighborhoods)
        ? parsed.excludedNeighborhoods
        : [],
      lastRunAt: parsed.lastRunAt,
    };
  } catch {
    return { seen: [], excludedNeighborhoods: [] };
  }
}

export function saveState(state: PersistedState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(
    STATE_FILE,
    JSON.stringify(
      { ...state, lastRunAt: new Date().toISOString() },
      null,
      2
    )
  );
}

export function resetState(): void {
  saveState({ seen: [], excludedNeighborhoods: [] });
}

/** Mescla IDs novos no estado existente, mantendo unicidade. */
export function recordSeen(state: PersistedState, ids: string[]): PersistedState {
  const set = new Set(state.seen);
  for (const id of ids) set.add(id);
  return { ...state, seen: Array.from(set) };
}

/** Adiciona um bairro à blocklist. Idempotente — não duplica. */
export function addBlocked(state: PersistedState, neighborhood: string): PersistedState {
  const trimmed = neighborhood.trim();
  if (!trimmed) return state;
  const current = state.excludedNeighborhoods ?? [];
  if (current.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return state;
  return { ...state, excludedNeighborhoods: [...current, trimmed] };
}

/** Remove um bairro da blocklist (case-insensitive). */
export function removeBlocked(state: PersistedState, neighborhood: string): PersistedState {
  const trimmed = neighborhood.trim().toLowerCase();
  const current = state.excludedNeighborhoods ?? [];
  return {
    ...state,
    excludedNeighborhoods: current.filter((n) => n.toLowerCase() !== trimmed),
  };
}

export function clearBlocked(state: PersistedState): PersistedState {
  return { ...state, excludedNeighborhoods: [] };
}

export function listBlocked(state: PersistedState): string[] {
  return state.excludedNeighborhoods ?? [];
}

export { STATE_FILE };
