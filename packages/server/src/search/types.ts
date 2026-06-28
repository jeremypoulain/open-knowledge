/**
 * Shared types for the BM25 full-content search engine.
 *
 * This engine is a *second*, opt-in search path that indexes the full body of
 * every non-binary file under the workspace (including text extracted from
 * PDF/Office documents) via the external `bm25-turbo` CLI. It is entirely
 * separate from the Orama lexical + semantic search in `api-extension.ts`.
 */

/**
 * Where inside a document a segment came from. Plain text / markdown files have
 * no locator (the whole file is one segment). Paginated/structured documents
 * carry a locator so a search hit can name — and, for PDFs, navigate to — the
 * exact page/slide/sheet/section.
 */
export type Locator =
  | { kind: 'line'; line: number }
  | { kind: 'page'; page: number }
  | { kind: 'slide'; slide: number }
  | { kind: 'sheet'; sheet: string }
  | { kind: 'section'; section: string };

/** One indexable unit of text plus its location within the source file. */
export interface Segment {
  text: string;
  locator?: Locator;
}

/** A manifest row — one per corpus line — mapping a BM25 doc id back to a file. */
export interface ManifestEntry {
  /** Workspace-relative doc name (the file index key). */
  path: string;
  locator?: Locator;
}

/** A single full-content search result, shaped to match the `/api/search` rows. */
export interface FullContentSearchResult {
  kind: 'file';
  path: string;
  title: string;
  score: number;
  snippet?: string;
  locator?: Locator;
}

/** Lifecycle/health of the BM25 index, surfaced to the settings UI and omnibar. */
export interface FullContentSearchStatus {
  /** The `search.fullContent.enabled` project-local setting. */
  enabled: boolean;
  /** Whether the `bm25-turbo` CLI was found on PATH. */
  installed: boolean;
  /** An index exists on disk and can be queried. */
  ready: boolean;
  /** A (re)build is currently running. */
  indexing: boolean;
  /** Files changed since the last successful build — index is stale. */
  dirty: boolean;
  /** Number of indexed corpus documents (segments), if known. */
  docCount: number | null;
  /** Epoch ms of the last successful build, if any. */
  lastIndexedAt: number | null;
}
