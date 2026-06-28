import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AI_PROVIDERS, type AiProviderId, getAiProvider } from '@inkeep/open-knowledge-core';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { EMBEDDINGS_API_KEY_ENV } from '../embeddings/embedder.ts';
import { secretsFilePath } from '../embeddings/secrets-store.ts';
import { tracedMkdirSync, tracedUnlinkSync, tracedWriteFileSync } from '../fs-traced.ts';

/** The embeddings file field that the OpenAI provider reuses. Kept in sync
 *  with embeddings so one stored key serves both embeddings and chat. */
const OPENAI_SHARED_FIELD = 'OPENAI_API_KEY';

export interface AiKeyDescription {
  present: boolean;
  hint: string | null;
  source: 'file' | 'env' | null;
}

export type AiKeyDescriptions = Record<string, AiKeyDescription>;

function hintFor(key: string): string | null {
  return key.length >= 8 ? key.slice(-4) : null;
}

/**
 * Multi-provider AI secrets store. Writes to the same `~/.ok/secrets.yml`
 * (mode 0o600, atomic write, perms-tightening) as embeddings — one
 * self-documenting field per provider. The OpenAI provider shares the
 * embeddings `OPENAI_API_KEY` field so a single stored key serves both.
 */
export class AiSecretsStore {
  private readonly secretsFile: string;

  constructor(secretsFile?: string) {
    this.secretsFile = secretsFile ?? secretsFilePath();
  }

  static filePath(homedirOverride?: string): string {
    return join(homedirOverride ?? homedir(), '.ok', 'secrets.yml');
  }

  private tightenPermsIfLoose(): void {
    let mode: number;
    try {
      mode = statSync(this.secretsFile).mode & 0o777;
    } catch {
      return;
    }
    if ((mode & 0o077) === 0) return;
    try {
      chmodSync(this.secretsFile, 0o600);
      process.stderr.write(
        `[ai] ${this.secretsFile} was readable beyond your user account ` +
          `(mode ${mode.toString(8)}); tightened to 600. It stores API keys.\n`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      process.stderr.write(
        `[ai] ${this.secretsFile} is readable beyond your user account ` +
          `(mode ${mode.toString(8)}) and could not be tightened (${msg}); your API key ` +
          `remains exposed — run: chmod 600 ${this.secretsFile}\n`,
      );
    }
  }

  private read(): Record<string, unknown> {
    if (!existsSync(this.secretsFile)) return {};
    this.tightenPermsIfLoose();
    try {
      return (yamlParse(readFileSync(this.secretsFile, 'utf-8')) ?? {}) as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      process.stderr.write(
        `[ai] Failed to parse ${this.secretsFile}: ${msg}. Starting with empty secrets.\n`,
      );
      return {};
    }
  }

  private write(data: Record<string, unknown>): void {
    const dir = dirname(this.secretsFile);
    if (!existsSync(dir)) tracedMkdirSync(dir, { recursive: true, mode: 0o700 });
    tracedWriteFileSync(this.secretsFile, yamlStringify(data), { mode: 0o600 });
    chmodSync(this.secretsFile, 0o600);
  }

  /** File field name for a provider. The OpenAI provider reuses the shared
   *  embeddings `OPENAI_API_KEY` field. */
  private fieldFor(provider: AiProviderId): string {
    return getAiProvider(provider).secretsField ?? OPENAI_SHARED_FIELD;
  }

  /** Stored key from the file, or null. Does not consult env vars. */
  getStoredKey(provider: AiProviderId): string | null {
    const data = this.read();
    const value = data[this.fieldFor(provider)];
    return typeof value === 'string' && value !== '' ? value : null;
  }

  /** Resolved key (file first, then the per-provider env fallback), or null. */
  async getKey(provider: AiProviderId): Promise<string | null> {
    const stored = this.getStoredKey(provider);
    if (stored) return stored;
    return envKeyFor(provider);
  }

  async setKey(provider: AiProviderId, key: string): Promise<void> {
    const data = this.read();
    data[this.fieldFor(provider)] = key;
    this.write(data);
  }

  async clearKey(provider: AiProviderId): Promise<void> {
    const field = this.fieldFor(provider);
    const data = this.read();
    if (field in data) {
      delete data[field];
      if (Object.keys(data).length === 0) {
        try {
          tracedUnlinkSync(this.secretsFile);
        } catch {}
      } else {
        this.write(data);
      }
    }
  }

  /** Describes every provider's key state without exposing the key itself. */
  async describeKeys(): Promise<AiKeyDescriptions> {
    const data = this.read();
    const out: AiKeyDescriptions = {};
    for (const def of AI_PROVIDERS) {
      const field = def.secretsField ?? OPENAI_SHARED_FIELD;
      const fileValue = data[field];
      const fileKey = typeof fileValue === 'string' && fileValue !== '' ? fileValue : null;
      const envKey = envKeyFor(def.id);
      const resolved = fileKey ?? envKey;
      out[def.id] = {
        present: resolved !== null,
        hint: resolved !== null ? hintFor(resolved) : null,
        source: fileKey ? 'file' : envKey ? 'env' : null,
      };
    }
    return out;
  }
}

/** Per-provider env fallback. The OpenAI provider additionally honors the
 *  embeddings env var, since it shares the same stored key. */
function envKeyFor(provider: AiProviderId): string | null {
  const def = getAiProvider(provider);
  const primary = process.env[def.envVar];
  if (typeof primary === 'string' && primary !== '') return primary;
  if (provider === 'openai') {
    const embeddings = process.env[EMBEDDINGS_API_KEY_ENV];
    if (typeof embeddings === 'string' && embeddings !== '') return embeddings;
  }
  return null;
}

export function createAiSecretsStore(secretsFile?: string): AiSecretsStore {
  return new AiSecretsStore(secretsFile);
}
