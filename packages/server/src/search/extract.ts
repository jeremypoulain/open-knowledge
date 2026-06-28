/**
 * Extractor registry: the single seam that turns a file on disk into indexable
 * text segments. Plain text is read as-is; PDF/Office documents are routed to
 * their format extractor; binary/unsupported files yield nothing.
 */
import { open, readFile, stat } from 'node:fs/promises';
import { classifyByExtension, DEFAULT_MAX_TEXT_BYTES, looksBinary } from './binary-sniff.ts';
import { extractOoxml } from './extract-ooxml.ts';
import { extractPdf } from './extract-pdf.ts';
import type { Segment } from './types.ts';

const SNIFF_BYTES = 8192;

function documentExt(docName: string): 'pdf' | 'docx' | 'xlsx' | 'pptx' | null {
  const base = docName.slice(docName.lastIndexOf('/') + 1);
  const ext = base.slice(base.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'pdf' || ext === 'docx' || ext === 'xlsx' || ext === 'pptx' ? ext : null;
}

/** Read the first chunk of a file to sniff for binary content. */
async function sniffHead(absPath: string): Promise<Buffer> {
  const handle = await open(absPath, 'r');
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buf, 0, SNIFF_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Extract indexable segments from a file. Returns `[]` for anything that
 * shouldn't be indexed (binary, oversized, unreadable, or empty). Never throws
 * for content reasons — extraction failures are logged and treated as "skip".
 */
export async function extractSegments(
  absPath: string,
  docName: string,
  opts: { maxTextBytes?: number; onWarn?: (msg: string) => void } = {},
): Promise<Segment[]> {
  const fileClass = classifyByExtension(docName);
  if (fileClass === 'skip') return [];

  try {
    if (fileClass === 'document') {
      const ext = documentExt(docName);
      if (!ext) return [];
      const buffer = await readFile(absPath);
      return ext === 'pdf' ? await extractPdf(buffer) : await extractOoxml(ext, buffer);
    }

    // text
    const maxBytes = opts.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES;
    const { size } = await stat(absPath);
    if (size > maxBytes) return [];
    if (looksBinary(await sniffHead(absPath))) return [];
    const text = (await readFile(absPath, 'utf-8')).trim();
    return text ? [{ text }] : [];
  } catch (err) {
    opts.onWarn?.(`[full-search] extract failed for ${docName}: ${String(err)}`);
    return [];
  }
}
