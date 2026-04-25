/**
 * Fetcher via curl (system binary, disponível por padrão no Windows 10+, macOS, Linux).
 *
 * Por que não fetch nativo do Node: o undici (HTTP client do Node) tem TLS/HTTP
 * fingerprint distinto de um browser real. Sites com Cloudflare/Akamai detectam
 * isso e devolvem 403 antes de qualquer header chegar. Curl passa porque o
 * fingerprint dele é largamente whitelisted (muito legítimo).
 *
 * Mantém:
 * - User-Agent + headers de Chrome real
 * - Delay entre requests + jitter (não martelar o servidor)
 * - Retry com backoff exponencial
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CHROME_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

const STATUS_MARKER = '\n__INFO_STATUS__';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface FetchOptions {
  /** Delay mínimo antes da request, default 2000ms */
  delayMs?: number;
  /** Tentativas em caso de erro, default 2 */
  retries?: number;
  /** Headers extras (ex: Referer pra navegação entre páginas) */
  extraHeaders?: Record<string, string>;
  /** Timeout por request em segundos, default 30 */
  timeoutSec?: number;
}

async function curlGet(
  url: string,
  headers: Record<string, string>,
  timeoutSec: number
): Promise<{ status: number; body: string }> {
  const args: string[] = [
    '--silent',
    '--show-error',
    '--location',
    '--compressed',
    '--max-time',
    String(timeoutSec),
    '--write-out',
    `${STATUS_MARKER}%{http_code}`,
  ];

  for (const [k, v] of Object.entries(headers)) {
    args.push('-H', `${k}: ${v}`);
  }
  args.push(url);

  const { stdout } = await execFileAsync('curl', args, {
    maxBuffer: 20 * 1024 * 1024, // 20 MB - páginas de listagem podem ser grandes
    encoding: 'utf8',
  });

  const idx = stdout.lastIndexOf(STATUS_MARKER);
  if (idx === -1) {
    return { status: 0, body: stdout };
  }
  const body = stdout.slice(0, idx);
  const status = Number(stdout.slice(idx + STATUS_MARKER.length).trim()) || 0;
  return { status, body };
}

export async function fetchHtml(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const { delayMs = 2000, retries = 2, extraHeaders = {}, timeoutSec = 30 } = options;

  // jitter aleatório pra não ter padrão fixo
  const jitter = Math.floor(Math.random() * 1500);
  await sleep(delayMs + jitter);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { status, body } = await curlGet(
        url,
        { ...CHROME_HEADERS, ...extraHeaders },
        timeoutSec
      );

      if (status === 403 || status === 429) {
        throw new Error(
          `HTTP ${status} (provavelmente bloqueio anti-bot — tenta aumentar delayMs ou trocar UA)`
        );
      }
      if (status < 200 || status >= 400) {
        throw new Error(`HTTP ${status}`);
      }

      return body;
    } catch (err) {
      lastError = err as Error;
      // Se curl não estiver instalado, falha imediato sem retry
      if (lastError.message.includes('ENOENT')) {
        throw new Error(
          'curl não encontrado no PATH. Instala curl ou usa outro fetcher.'
        );
      }
      if (attempt < retries) {
        // backoff: 4s, 8s, 16s...
        await sleep(4000 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new Error(`fetch failed: ${url}`);
}
