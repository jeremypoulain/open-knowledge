import { describe, expect, test } from 'bun:test';
import {
  AI_PROVIDER_ID_VALUES,
  AI_PROVIDERS,
  AI_VISIBLE_PROVIDERS,
  getAiProvider,
  isAiProviderId,
} from './providers.ts';

describe('AI_PROVIDERS registry', () => {
  test('ids match the enum tuple exactly', () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual([...AI_PROVIDER_ID_VALUES]);
  });

  test('every provider has a distinct id, a model, and a valid type', () => {
    const ids = new Set<string>();
    for (const p of AI_PROVIDERS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.defaultModel.length).toBeGreaterThan(0);
      expect(['openai-compat', 'anthropic', 'ollama-native']).toContain(p.type);
    }
  });

  test('anthropic is the only anthropic-type provider', () => {
    expect(AI_PROVIDERS.filter((p) => p.type === 'anthropic').map((p) => p.id)).toEqual([
      'anthropic',
    ]);
  });

  test('ollama-local does not require a key and has no secrets field', () => {
    const ollama = getAiProvider('ollama-local');
    expect(ollama.keyRequired).toBe(false);
    expect(ollama.secretsField).toBeUndefined();
  });

  test('openai reuses the shared OPENAI_API_KEY secrets field', () => {
    expect(getAiProvider('openai').secretsField).toBe('OPENAI_API_KEY');
  });

  test('visible providers are a non-empty subset of all providers', () => {
    expect(AI_VISIBLE_PROVIDERS.length).toBeGreaterThan(0);
    expect(AI_VISIBLE_PROVIDERS.length).toBeLessThanOrEqual(AI_PROVIDERS.length);
    for (const v of AI_VISIBLE_PROVIDERS) {
      expect(v.visible).not.toBe(false);
    }
  });

  test('isAiProviderId guards arbitrary input', () => {
    expect(isAiProviderId('anthropic')).toBe(true);
    expect(isAiProviderId('ollama-local')).toBe(true);
    expect(isAiProviderId('not-a-provider')).toBe(false);
    expect(isAiProviderId(undefined)).toBe(false);
  });
});
