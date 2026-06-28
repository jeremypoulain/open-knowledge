import { describe, expect, test } from 'bun:test';
import { parseBm25Hits, resolveBm25BinCandidates } from './bm25-cli.ts';

describe('parseBm25Hits', () => {
  test('parses a plain array of {id,score}', () => {
    expect(parseBm25Hits('[{"id":3,"score":9.5},{"id":0,"score":4.0}]')).toEqual([
      { id: 3, score: 9.5 },
      { id: 0, score: 4.0 },
    ]);
  });

  test('accepts a {results:[...]} envelope and alternate field names', () => {
    const out = parseBm25Hits('{"results":[{"doc_id":"2","bm25":1.25}]}');
    expect(out).toEqual([{ id: 2, score: 1.25 }]);
  });

  test('parses the table format used by bm25-turbo 0.2.0 defaults', () => {
    const out = parseBm25Hits(`
+------+--------+----------+
| Rank | Doc ID | Score    |
+==========================+
| 1    | 3109   | 6.134777 |
|------+--------+----------|
| 2    | 3106   | 5.780746 |
+------+--------+----------+
    `);
    expect(out).toEqual([
      { id: 3109, score: 6.134777 },
      { id: 3106, score: 5.780746 },
    ]);
  });

  test('drops malformed rows and tolerates empty / non-JSON output', () => {
    expect(parseBm25Hits('')).toEqual([]);
    expect(parseBm25Hits('not json')).toEqual([]);
    expect(parseBm25Hits('[{"id":-1,"score":1},{"id":5}]')).toEqual([]);
  });
});

describe('resolveBm25BinCandidates', () => {
  test('prefers an explicit OK_BM25_TURBO_BIN override', () => {
    expect(
      resolveBm25BinCandidates(
        { OK_BM25_TURBO_BIN: '/custom/bin/bm25-turbo' } as NodeJS.ProcessEnv,
        '/home/tester',
      ),
    ).toEqual(['/custom/bin/bm25-turbo']);
  });

  test('falls back to ~/.cargo/bin/bm25-turbo after PATH lookup', () => {
    expect(resolveBm25BinCandidates({}, '/home/tester')).toEqual([
      'bm25-turbo',
      '/home/tester/.cargo/bin/bm25-turbo',
    ]);
  });
});
