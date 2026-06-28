/**
 * Per-page text extraction from PDFs via pdfjs-dist (legacy build, for Node).
 *
 * One segment per page with a `{ page }` locator, so a search hit can deep-link
 * straight to the page in the in-app PDF viewer (`<path>#page=N`).
 */
import type { Segment } from './types.ts';

// pdfjs is loaded lazily so the dependency is only paid when a PDF is indexed.
type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export async function extractPdf(buffer: Buffer): Promise<Segment[]> {
  const pdfjs = await loadPdfjs();
  // A copy: pdfjs transfers/detaches the underlying ArrayBuffer.
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({
    data,
    disableFontFace: true,
    // No worker in Node; run on the main thread.
    useWorkerFetch: false,
  }).promise;

  const segments: Segment[] = [];
  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const pageObj = await doc.getPage(page);
      const content = await pageObj.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pageObj.cleanup();
      if (text) segments.push({ text, locator: { kind: 'page', page } });
    }
  } finally {
    await doc.destroy();
  }
  return segments;
}
