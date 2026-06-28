import { describe, expect, test } from 'bun:test';
import { parseMetadataSuggestions } from './metadata-suggestions.ts';

describe('parseMetadataSuggestions', () => {
  test('parses a bare JSON object', () => {
    const out = parseMetadataSuggestions(
      '{"title": "Edmonds Bottomfish Opener", "description": "Opening day for bottomfish.", "tags": ["fishing", "edmonds"]}',
    );
    expect(out).toEqual({
      title: 'Edmonds Bottomfish Opener',
      description: 'Opening day for bottomfish.',
      tags: ['fishing', 'edmonds'],
    });
  });

  test('parses a fenced json block with surrounding prose', () => {
    const raw = 'Here:\n```json\n{"title": "X", "description": "Y", "tags": ["a"]}\n```\nDone';
    expect(parseMetadataSuggestions(raw)).toEqual({ title: 'X', description: 'Y', tags: ['a'] });
  });

  test('collapses whitespace and strips surrounding quotes in scalars', () => {
    const out = parseMetadataSuggestions('{"title": "\\"My   Title\\"", "tags": []}');
    expect(out.title).toBe('My Title');
  });

  test('tolerates missing fields independently', () => {
    expect(parseMetadataSuggestions('{"tags": ["only-tags"]}')).toEqual({
      title: null,
      description: null,
      tags: ['only-tags'],
    });
  });

  test('drops invalid tags but keeps valid scalars', () => {
    const out = parseMetadataSuggestions(
      '{"title": "T", "tags": ["ok-tag", "bad tag!", "also-ok"]}',
    );
    expect(out.title).toBe('T');
    expect(out.tags).toEqual(['ok-tag', 'also-ok']);
  });

  test('returns empty suggestion when no JSON object is present', () => {
    expect(parseMetadataSuggestions('the model rambled with no object')).toEqual({
      title: null,
      description: null,
      tags: [],
    });
  });

  test('coerces non-string scalars to null', () => {
    const out = parseMetadataSuggestions('{"title": 42, "description": ["x"], "tags": []}');
    expect(out.title).toBeNull();
    expect(out.description).toBeNull();
  });
});
