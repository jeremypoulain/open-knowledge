import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yazl from 'yazl';
import type { FileIndexEntry } from '../file-watcher.ts';
import { buildSnippet, createFullContentSearchService } from './bm25-full-search.ts';

describe('buildSnippet', () => {
  test('centers an ellipsized window on the first hit', () => {
    const text = `${'a '.repeat(60)}TARGET ${'b '.repeat(60)}`;
    const snip = buildSnippet(text, 'target');
    expect(snip).toContain('TARGET');
    expect(snip?.startsWith('…')).toBe(true);
    expect(snip?.endsWith('…')).toBe(true);
  });
  test('returns undefined when nothing matches', () => {
    expect(buildSnippet('hello world', 'absent')).toBeUndefined();
  });
});

function zipBuffer(files: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const [name, content] of Object.entries(files)) {
      zip.addBuffer(Buffer.from(content, 'utf-8'), name);
    }
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}

function fileEntry(canonicalPath: string): FileIndexEntry {
  return {
    canonicalPath,
    modified: '2026-01-01T00:00:00.000Z',
    size: 1234,
    inode: 1,
    aliases: [],
    kind: 'file',
  };
}

describe('createFullContentSearchService (fake bm25-turbo CLI)', () => {
  let dir: string;
  let prevBin: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ok-bm25-'));
    // A fake CLI: --version succeeds, index writes a stub, search echoes $FAKE_HITS.
    const fakeBin = join(dir, 'fake-bm25-turbo.mjs');
    await writeFile(
      fakeBin,
      [
        '#!/usr/bin/env node',
        'import { writeFileSync } from "node:fs";',
        'const a = process.argv.slice(2);',
        'if (a[0] === "--version") { console.log("fake 0.0.0"); process.exit(0); }',
        'if (a[0] === "index") { writeFileSync(a[a.indexOf("--output") + 1], "X"); process.exit(0); }',
        'if (a[0] === "search") { console.log(process.env.FAKE_HITS || "[]"); process.exit(0); }',
        'process.exit(1);',
      ].join('\n'),
      { mode: 0o755 },
    );
    prevBin = process.env.OK_BM25_TURBO_BIN;
    // The script is executable with a `#!/usr/bin/env node` shebang, so execFile
    // can run it directly as the "binary".
    process.env.OK_BM25_TURBO_BIN = fakeBin;
  });

  afterAll(async () => {
    if (prevBin === undefined) delete process.env.OK_BM25_TURBO_BIN;
    else process.env.OK_BM25_TURBO_BIN = prevBin;
    await rm(dir, { recursive: true, force: true });
  });

  test('collapses same-file slide hits to the best-scoring page with locator + snippet', async () => {
    // A real 2-slide PPTX on disk → 2 segments for one path.
    const deckPath = join(dir, 'deck.pptx');
    await writeFile(
      deckPath,
      await zipBuffer({
        'ppt/slides/slide1.xml': '<a:t>Intro overview</a:t>',
        'ppt/slides/slide2.xml': '<a:t>Q3 budget approval pending</a:t>',
      }),
    );

    const index = new Map<string, FileIndexEntry>([['deck.pptx', fileEntry(deckPath)]]);
    let generation = 1;
    // segment ids: 0 → slide1, 1 → slide2. Return both; slide2 scores higher.
    process.env.FAKE_HITS = '[{"id":1,"score":9.0},{"id":0,"score":2.0}]';

    const service = createFullContentSearchService({
      isEnabled: () => true,
      indexDir: join(dir, 'idx'),
      getAllFilesIndex: () => index,
      getFileIndexGeneration: () => generation,
    });

    const results = await service.search('budget', 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: 'file',
      path: 'deck.pptx',
      title: 'deck.pptx — slide 2',
      locator: { kind: 'slide', slide: 2 },
    });
    expect(results[0].snippet).toContain('budget');

    const status = await service.status();
    expect(status).toMatchObject({ enabled: true, installed: true, ready: true, docCount: 2 });
    expect(status.dirty).toBe(false);

    // Advancing the file-index generation marks the index dirty.
    generation = 2;
    expect((await service.status()).dirty).toBe(true);
  });

  test('reuses a persisted index across a restart without rebuilding', async () => {
    const notePath = join(dir, 'note.md');
    await writeFile(notePath, 'quarterly budget figures and notes');
    const indexDir = join(dir, 'persist-idx');
    const index = new Map<string, FileIndexEntry>([['note.md', fileEntry(notePath)]]);
    process.env.FAKE_HITS = '[{"id":0,"score":5.0}]';

    const first = createFullContentSearchService({
      isEnabled: () => true,
      indexDir,
      getAllFilesIndex: () => index,
      getFileIndexGeneration: () => 1,
    });
    expect(await first.search('budget', 10)).toHaveLength(1);
    const firstStatus = await first.status();
    expect(firstStatus.lastIndexedAt).toBeGreaterThan(0);

    // A brand-new service over the same dir simulates a process restart.
    const restarted = createFullContentSearchService({
      isEnabled: () => true,
      indexDir,
      getAllFilesIndex: () => index,
      getFileIndexGeneration: () => 1,
    });
    const status = await restarted.status();
    expect(status).toMatchObject({ ready: true, docCount: 1, dirty: false });
    // The last-indexed timestamp survives the restart (no rebuild happened).
    expect(status.lastIndexedAt).toBe(firstStatus.lastIndexedAt);

    const results = await restarted.search('budget', 10);
    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe('note.md');
  });

  test('marks a persisted index dirty when a file changed while offline', async () => {
    const notePath = join(dir, 'note2.md');
    await writeFile(notePath, 'alpha bravo charlie');
    const indexDir = join(dir, 'persist-idx-2');
    process.env.FAKE_HITS = '[{"id":0,"score":5.0}]';

    const before = createFullContentSearchService({
      isEnabled: () => true,
      indexDir,
      getAllFilesIndex: () => new Map([['note2.md', fileEntry(notePath)]]),
      getFileIndexGeneration: () => 1,
    });
    await before.search('alpha', 10);

    // Restart with a different fingerprint for the same path (edited while down).
    const changed: FileIndexEntry = { ...fileEntry(notePath), size: 9999 };
    const after = createFullContentSearchService({
      isEnabled: () => true,
      indexDir,
      getAllFilesIndex: () => new Map([['note2.md', changed]]),
      getFileIndexGeneration: () => 1,
    });
    const status = await after.status();
    expect(status).toMatchObject({ ready: true, dirty: true });
  });
});
