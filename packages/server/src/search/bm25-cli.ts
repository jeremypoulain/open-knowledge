/**
 * Thin wrapper around the external `bm25-turbo` CLI. This is the ONLY module
 * that shells out to the binary — keeping the AGPL-licensed tool at arm's
 * length (separate process, never linked into our bundle) and isolating the
 * blast radius if its CLI surface changes.
 */
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolved at call time so tests (and env overrides) take effect. */
const cargoFallbackBin = (homeDir: string): string => join(homeDir, '.cargo', 'bin', 'bm25-turbo');
const VERSION_TIMEOUT_MS = 3_000;
const INDEX_TIMEOUT_MS = 10 * 60_000;
const SEARCH_TIMEOUT_MS = 15_000;
const SEARCH_MAX_BUFFER = 16 * 1024 * 1024;

export type Bm25Failure = 'not-installed' | 'timeout' | 'spawn-error';

export class Bm25CliError extends Error {
  constructor(
    readonly reason: Bm25Failure,
    message: string,
  ) {
    super(message);
    this.name = 'Bm25CliError';
  }
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

export function resolveBm25BinCandidates(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = homedir(),
): string[] {
  const override = env.OK_BM25_TURBO_BIN;
  if (override) return [override];
  return ['bm25-turbo', cargoFallbackBin(homeDir)];
}

function execBin(
  bin: string,
  args: string[],
  timeoutMs: number,
  maxBuffer?: number,
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, ...(maxBuffer ? { maxBuffer } : {}), windowsHide: true },
      (err, stdout, stderr) => {
        if (!err) return resolve({ stdout: String(stdout), stderr: String(stderr) });
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return reject(new Bm25CliError('not-installed', `${bin} not found on PATH`));
        }
        if ((err as { killed?: boolean }).killed) {
          return reject(new Bm25CliError('timeout', `${bin} ${args[0]} timed out`));
        }
        reject(new Bm25CliError('spawn-error', String(stderr || err.message)));
      },
    );
  });
}

async function run(args: string[], timeoutMs: number, maxBuffer?: number): Promise<ExecResult> {
  const bins = resolveBm25BinCandidates();
  let lastError: unknown;
  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i] as string;
    try {
      return await execBin(bin, args, timeoutMs, maxBuffer);
    } catch (err) {
      lastError = err;
      const canFallback =
        i < bins.length - 1 && err instanceof Bm25CliError && err.reason === 'not-installed';
      if (canFallback) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/** Whether the `bm25-turbo` binary is available on PATH. */
export async function isBm25Installed(): Promise<boolean> {
  try {
    await run(['--version'], VERSION_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

/** Build an index from a JSONL corpus (`{ "text": ... }` per line). */
export async function buildBm25Index(corpusPath: string, indexPath: string): Promise<void> {
  await run(
    ['index', '--input', corpusPath, '--output', indexPath, '--field', 'text'],
    INDEX_TIMEOUT_MS,
  );
}

export interface Bm25Hit {
  /** Zero-based corpus line index, used to resolve the document via the manifest. */
  id: number;
  score: number;
}

/**
 * Query an index. The CLI prints JSON; field names vary across versions, so we
 * normalize defensively (`id` / `doc_id` / `index`, `score` / `bm25`).
 */
export async function searchBm25Index(
  indexPath: string,
  query: string,
  k: number,
): Promise<Bm25Hit[]> {
  const { stdout } = await run(
    ['search', '--index', indexPath, '--query', query, '-k', String(k), '--format', 'json'],
    SEARCH_TIMEOUT_MS,
    SEARCH_MAX_BUFFER,
  );
  return parseBm25Hits(stdout);
}

/** Parse `bm25-turbo search` stdout into normalized hits. Exported for tests. */
export function parseBm25Hits(stdout: string): Bm25Hit[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return parseBm25TableHits(trimmed);
  }
  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { results?: unknown[] }).results)
      ? (parsed as { results: unknown[] }).results
      : [];
  const hits: Bm25Hit[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const rawId = r.id ?? r.doc_id ?? r.docId ?? r.index;
    const rawScore = r.score ?? r.bm25 ?? r.bm25_score;
    const id = typeof rawId === 'number' ? rawId : Number.parseInt(String(rawId), 10);
    const score = typeof rawScore === 'number' ? rawScore : Number.parseFloat(String(rawScore));
    if (Number.isInteger(id) && id >= 0 && !Number.isNaN(score)) hits.push({ id, score });
  }
  return hits;
}

function parseBm25TableHits(stdout: string): Bm25Hit[] {
  const hits: Bm25Hit[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length !== 3) continue;
    if (cells[0] === 'Rank' || cells[0].startsWith('+')) continue;
    const id = Number.parseInt(cells[1] ?? '', 10);
    const score = Number.parseFloat(cells[2] ?? '');
    if (Number.isInteger(id) && id >= 0 && !Number.isNaN(score)) {
      hits.push({ id, score });
    }
  }
  return hits;
}
