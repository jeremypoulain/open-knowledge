import { FRONTMATTER_TAG_VALUE_RE } from '@inkeep/open-knowledge-core';

/** Extracts a de-duplicated, validated list of tag suggestions from a model
 *  response. Tolerates a leading ```json fence and surrounding prose, and
 *  caps the result so a chatty model can't flood the frontmatter. */
export function parseTagSuggestions(raw: string): string[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? (fenced[1] ?? raw) : raw;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  let parsed: unknown;
  if (start !== -1 && end !== -1 && end > start) {
    try {
      parsed = JSON.parse(candidate.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const stripped = item.startsWith('#') ? item.slice(1) : item;
    if (FRONTMATTER_TAG_VALUE_RE.test(stripped) && !seen.has(stripped)) {
      seen.add(stripped);
      out.push(stripped);
    }
    if (out.length >= 12) break;
  }
  return out;
}
