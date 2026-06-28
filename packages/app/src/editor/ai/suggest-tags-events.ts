/** Tiny event bus so a global keyboard shortcut (⌥⌘ T) can open the
 *  Suggest tags popover for the active document, the same way the
 *  `edit-with-ai` shortcut opens the Ask AI composer. */
const SUGGEST_TAGS_EVENT = 'ok:suggest-tags';

export function emitSuggestTags(docName: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUGGEST_TAGS_EVENT, { detail: { docName } }));
}

export function onSuggestTags(cb: (docName: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent<{ docName: string | null }>).detail;
    cb(detail?.docName ?? null);
  };
  window.addEventListener(SUGGEST_TAGS_EVENT, handler);
  return () => window.removeEventListener(SUGGEST_TAGS_EVENT, handler);
}
