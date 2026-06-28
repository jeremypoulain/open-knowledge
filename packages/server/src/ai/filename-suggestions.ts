/** Coerces an arbitrary model string into a safe kebab-case base file name
 *  (no directory, no extension), or null when nothing usable remains. */
export function sanitizeFilenameBase(value: unknown, maxLen = 60): string | null {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (text.length >= 2 && /^["'].*["']$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  // Drop any path segments and a trailing extension a chatty model may add.
  text = text.split(/[/\\]/).pop() ?? text;
  text = text.replace(/\.(md|mdx|markdown|txt)$/i, '');
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks left by normalization (e.g. accents).
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') return null;
  return slug.length > maxLen ? slug.slice(0, maxLen).replace(/-+$/g, '') : slug;
}

/** Extracts a base file name from a model response. Tolerates a leading
 *  ```json fence, surrounding prose, or a bare string instead of an object. */
export function parseFilenameSuggestion(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? (fenced[1] ?? raw) : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        return sanitizeFilenameBase(parsed.filename);
      }
    } catch {
      // Fall through to treating the whole response as a bare name.
    }
  }
  return sanitizeFilenameBase(candidate);
}
