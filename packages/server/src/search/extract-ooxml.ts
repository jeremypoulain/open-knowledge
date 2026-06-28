/**
 * Text extraction from modern Office Open XML documents (`.docx`, `.xlsx`,
 * `.pptx`). These are ZIP archives of XML parts, so we unzip in-memory and pull
 * the human text out of the relevant parts. Fidelity is intentionally "good
 * enough for search" — we want tokens, not layout.
 *
 * Granularity (see the plan §2a):
 *   - PPTX → one segment per slide  (locator { slide })
 *   - XLSX → one segment per sheet  (locator { sheet })
 *   - DOCX → one segment for the whole document (no reliable page boundaries)
 */
import yauzl from 'yauzl';
import type { Segment } from './types.ts';

/** Read every entry of a ZIP buffer into a name→content map. */
export function unzipToMap(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('unzip failed'));
      const out = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(out));
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('read entry failed'));
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('error', reject);
          stream.on('end', () => {
            out.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

/** Pull the text of all `<tag ...>…</tag>` runs, decoded and space-joined. */
function collectTagText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const parts: string[] = [];
  for (const m of xml.matchAll(re)) {
    const text = decodeXml(m[1]).trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function slideNumber(fileName: string): number | null {
  const m = fileName.match(/ppt\/slides\/slide(\d+)\.xml$/);
  return m ? Number.parseInt(m[1], 10) : null;
}

export function extractPptx(parts: Map<string, Buffer>): Segment[] {
  const slides: Array<{ n: number; text: string }> = [];
  for (const [name, buf] of parts) {
    const n = slideNumber(name);
    if (n === null) continue;
    const text = normalizeWhitespace(collectTagText(buf.toString('utf-8'), 'a:t'));
    if (text) slides.push({ n, text });
  }
  slides.sort((a, b) => a.n - b.n);
  return slides.map((s) => ({ text: s.text, locator: { kind: 'slide', slide: s.n } }));
}

export function extractDocx(parts: Map<string, Buffer>): Segment[] {
  const doc = parts.get('word/document.xml');
  if (!doc) return [];
  const text = normalizeWhitespace(collectTagText(doc.toString('utf-8'), 'w:t'));
  return text ? [{ text }] : [];
}

/** Map workbook sheet names to their worksheet part paths, in workbook order. */
function resolveSheetParts(parts: Map<string, Buffer>): Array<{ name: string; part: string }> {
  const workbook = parts.get('xl/workbook.xml')?.toString('utf-8');
  const rels = parts.get('xl/_rels/workbook.xml.rels')?.toString('utf-8');
  if (!workbook || !rels) return [];

  const ridToTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) ridToTarget.set(id, target.replace(/^\//, '').replace(/^xl\//, ''));
  }

  const sheets: Array<{ name: string; part: string }> = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = m[0].match(/\bname="([^"]+)"/)?.[1];
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1];
    if (!name || !rid) continue;
    const target = ridToTarget.get(rid);
    if (!target) continue;
    sheets.push({ name: decodeXml(name), part: `xl/${target}` });
  }
  return sheets;
}

function sharedStrings(parts: Map<string, Buffer>): string[] {
  const xml = parts.get('xl/sharedStrings.xml')?.toString('utf-8');
  if (!xml) return [];
  const out: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    out.push(normalizeWhitespace(collectTagText(si[1], 't')));
  }
  return out;
}

function sheetText(xml: string, strings: string[]): string {
  const parts: string[] = [];
  for (const c of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = c[1];
    const inner = c[2];
    const type = attrs.match(/\bt="([^"]+)"/)?.[1];
    if (type === 's') {
      const idx = Number.parseInt(inner.match(/<v>(\d+)<\/v>/)?.[1] ?? '', 10);
      if (!Number.isNaN(idx) && strings[idx]) parts.push(strings[idx]);
    } else if (type === 'inlineStr') {
      const text = collectTagText(inner, 't');
      if (text) parts.push(decodeXml(text));
    } else {
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v) parts.push(decodeXml(v));
    }
  }
  return normalizeWhitespace(parts.join(' '));
}

export function extractXlsx(parts: Map<string, Buffer>): Segment[] {
  const strings = sharedStrings(parts);
  const segments: Segment[] = [];
  for (const { name, part } of resolveSheetParts(parts)) {
    const xml = parts.get(part)?.toString('utf-8');
    if (!xml) continue;
    const text = sheetText(xml, strings);
    if (text) segments.push({ text, locator: { kind: 'sheet', sheet: name } });
  }
  return segments;
}

/** Extract segments from an OOXML buffer based on its extension. */
export async function extractOoxml(
  ext: 'docx' | 'xlsx' | 'pptx',
  buffer: Buffer,
): Promise<Segment[]> {
  const parts = await unzipToMap(buffer);
  if (ext === 'pptx') return extractPptx(parts);
  if (ext === 'xlsx') return extractXlsx(parts);
  return extractDocx(parts);
}
