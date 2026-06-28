/** Event bus so the Suggest-filename popover (in the editor toolbar) can ask
 *  the FileTree to rename a document. The rename itself must run through the
 *  tree's pipeline so wiki-links update and the sidebar / active tab follow —
 *  the popover only knows the doc name and the new base name. */
const AI_RENAME_DOC_EVENT = 'open-knowledge:ai-rename-doc';

export interface AiRenameDocRequest {
  /** The document's logical name (no extension), e.g. `docs/page`. */
  readonly docName: string;
  /** The new base file name (no directory, no extension), e.g. `getting-started`. */
  readonly newBaseName: string;
}

export function emitAiRenameDoc(request: AiRenameDocRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AiRenameDocRequest>(AI_RENAME_DOC_EVENT, { detail: request }),
  );
}

export function subscribeToAiRenameDoc(
  onRequest: (request: AiRenameDocRequest) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AiRenameDocRequest>).detail;
    if (!detail?.docName || !detail.newBaseName) return;
    onRequest(detail);
  };
  window.addEventListener(AI_RENAME_DOC_EVENT, listener);
  return () => window.removeEventListener(AI_RENAME_DOC_EVENT, listener);
}
