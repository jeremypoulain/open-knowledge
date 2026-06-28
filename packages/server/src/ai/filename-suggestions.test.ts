import { describe, expect, test } from 'bun:test';
import { parseFilenameSuggestion, sanitizeFilenameBase } from './filename-suggestions.ts';

describe('sanitizeFilenameBase', () => {
  test('lowercases and kebab-cases', () => {
    expect(sanitizeFilenameBase('Getting Started Guide')).toBe('getting-started-guide');
  });

  test('strips a directory and extension', () => {
    expect(sanitizeFilenameBase('docs/My File.md')).toBe('my-file');
  });

  test('strips surrounding quotes and accents', () => {
    expect(sanitizeFilenameBase('"Café Menu"')).toBe('cafe-menu');
  });

  test('collapses runs of separators and trims hyphens', () => {
    expect(sanitizeFilenameBase('  --weird__name!!  ')).toBe('weird-name');
  });

  test('caps the length without a trailing hyphen', () => {
    const out = sanitizeFilenameBase(`${'a'.repeat(40)} ${'b'.repeat(40)}`, 10);
    expect(out).toBe('aaaaaaaaaa');
  });

  test('returns null when nothing usable remains', () => {
    expect(sanitizeFilenameBase('!!!')).toBeNull();
    expect(sanitizeFilenameBase(123)).toBeNull();
  });
});

describe('parseFilenameSuggestion', () => {
  test('parses a bare JSON object', () => {
    expect(parseFilenameSuggestion('{"filename": "How To Deploy"}')).toBe('how-to-deploy');
  });

  test('parses a fenced json block with surrounding prose', () => {
    const raw = 'Sure:\n```json\n{"filename": "release-notes"}\n```\nDone';
    expect(parseFilenameSuggestion(raw)).toBe('release-notes');
  });

  test('falls back to a bare string response', () => {
    expect(parseFilenameSuggestion('Quarterly Report')).toBe('quarterly-report');
  });

  test('returns null when nothing usable remains', () => {
    expect(parseFilenameSuggestion('{"filename": ""}')).toBeNull();
  });
});
