import { describe, expect, test } from 'bun:test';
import { mergeSuggestedTags, normalizeFrontmatterTags } from './suggest-tags';

describe('normalizeFrontmatterTags', () => {
  test('normalizes strings, strips #, and drops invalid entries', () => {
    expect(normalizeFrontmatterTags(['#docs', 'roadmap', 'bad tag', '#docs'])).toEqual([
      'docs',
      'roadmap',
    ]);
  });

  test('accepts a legacy scalar tag value', () => {
    expect(normalizeFrontmatterTags('planning')).toEqual(['planning']);
  });
});

describe('mergeSuggestedTags', () => {
  test('preserves existing tags and appends valid suggestions without duplicates', () => {
    expect(mergeSuggestedTags(['docs', 'planning'], ['#planning', 'ai', 'bad tag'])).toEqual([
      'docs',
      'planning',
      'ai',
    ]);
  });
});
