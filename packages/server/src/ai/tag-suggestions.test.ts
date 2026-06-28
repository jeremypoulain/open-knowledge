import { describe, expect, test } from 'bun:test';
import { parseTagSuggestions } from './tag-suggestions.ts';

describe('parseTagSuggestions', () => {
  test('parses a bare JSON array', () => {
    expect(parseTagSuggestions('["ai", "notes", "research"]')).toEqual(['ai', 'notes', 'research']);
  });

  test('parses a fenced json block with surrounding prose', () => {
    const raw = 'Here are tags:\n```json\n["alpha", "beta"]\n```\nThanks!';
    expect(parseTagSuggestions(raw)).toEqual(['alpha', 'beta']);
  });

  test('strips a leading # and de-duplicates', () => {
    expect(parseTagSuggestions('["#go", "go", "rust"]')).toEqual(['go', 'rust']);
  });

  test('drops invalid values (keeps the grammar)', () => {
    expect(parseTagSuggestions('["ok-tag", "bad tag!", "also-ok"]')).toEqual(['ok-tag', 'also-ok']);
  });

  test('returns [] when no JSON array is present', () => {
    expect(parseTagSuggestions('the model rambled with no array')).toEqual([]);
  });

  test('caps the result at 12 entries', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    const out = parseTagSuggestions(JSON.stringify(many));
    expect(out.length).toBe(12);
  });
});
