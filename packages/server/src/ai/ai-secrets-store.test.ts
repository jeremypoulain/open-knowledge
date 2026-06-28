import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiSecretsStore } from './ai-secrets-store.ts';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ok-ai-secrets-'));
  file = join(dir, 'secrets.yml');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('AiSecretsStore', () => {
  test('round-trips a key per provider and masks it in describeKeys', async () => {
    const store = new AiSecretsStore(file);
    await store.setKey('anthropic', 'sk-ant-1234567890');
    expect(await store.getKey('anthropic')).toBe('sk-ant-1234567890');

    const desc = await store.describeKeys();
    expect(desc.anthropic.present).toBe(true);
    expect(desc.anthropic.hint).toBe('7890');
    expect(desc.anthropic.source).toBe('file');
    // The full key is never surfaced.
    expect(JSON.stringify(desc)).not.toContain('sk-ant');
  });

  test('clearKey removes the key', async () => {
    const store = new AiSecretsStore(file);
    await store.setKey('mistral', 'mistral-secret-key');
    await store.clearKey('mistral');
    expect(await store.getKey('mistral')).toBeNull();
    const desc = await store.describeKeys();
    expect(desc.mistral.present).toBe(false);
  });

  test('falls back to the per-provider env var', async () => {
    Bun.env.OK_AI_GROQ_KEY = 'groq-env-secret-value';
    try {
      const store = new AiSecretsStore(file);
      expect(await store.getKey('groq')).toBe('groq-env-secret-value');
      const desc = await store.describeKeys();
      expect(desc.groq.present).toBe(true);
      expect(desc.groq.source).toBe('env');
      expect(desc.groq.hint).toBe('alue');
    } finally {
      delete Bun.env.OK_AI_GROQ_KEY;
    }
  });

  test('openai writes to the shared OPENAI_API_KEY field', async () => {
    const store = new AiSecretsStore(file);
    await store.setKey('openai', 'sk-openai-shared-key');
    const raw = readFileSync(file, 'utf-8');
    expect(raw).toContain('OPENAI_API_KEY: sk-openai-shared-key');
  });

  test('secrets file is created with owner-only permissions', async () => {
    const store = new AiSecretsStore(file);
    await store.setKey('anthropic', 'sk-ant-xyz');
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test('tightens loose permissions on read', async () => {
    writeFileSync(file, 'OPENAI_API_KEY: leak\n', { mode: 0o644 });
    const store = new AiSecretsStore(file);
    store.getStoredKey('openai');
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
