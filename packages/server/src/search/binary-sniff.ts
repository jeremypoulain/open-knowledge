/**
 * Decide whether a file should be full-text indexed, and how.
 *
 * Three buckets: `text` (read as-is), `document` (PDF/Office — run an
 * extractor), or `skip` (binary / unsupported / too large).
 */

export type FileClass = 'text' | 'document' | 'skip';

/** OOXML / PDF documents we can extract text from (see `extract.ts`). */
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'pptx']);

/**
 * Extensions we always treat as binary even if they momentarily sniff as text
 * (e.g. an empty file). Keeps obvious media/archives out of the corpus and
 * documents *why* legacy Office formats are excluded.
 */
const BINARY_EXTENSIONS = new Set([
  // images / media
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'svg',
  'mp3',
  'mp4',
  'wav',
  'mov',
  'avi',
  'mkv',
  'webm',
  'flac',
  'ogg',
  // archives / binaries
  'zip',
  'tar',
  'gz',
  'bz2',
  '7z',
  'rar',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'wasm',
  'class',
  'o',
  'a',
  // fonts
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  // legacy OLE Office (pre-2007) — needs LibreOffice/antiword conversion, out of scope
  'doc',
  'xls',
  'ppt',
]);

/** Default max bytes to read for a plain-text file. Larger files are skipped. */
export const DEFAULT_MAX_TEXT_BYTES = 5_000_000;

function extensionOf(docName: string): string {
  const base = docName.slice(docName.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * A NUL byte in the first chunk is a strong signal the content is binary.
 * UTF-16 text also contains NULs, but we don't index UTF-16 source files.
 */
export function looksBinary(head: Buffer): boolean {
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) return true;
  }
  return false;
}

/** Classify a file by extension alone (cheap, no IO). */
export function classifyByExtension(docName: string): FileClass {
  const ext = extensionOf(docName);
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  if (BINARY_EXTENSIONS.has(ext)) return 'skip';
  // Everything else is treated as candidate text; a NUL-byte sniff at read time
  // catches mislabeled / extension-less binaries.
  return 'text';
}
