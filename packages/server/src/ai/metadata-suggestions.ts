import { parseTagSuggestions } from './tag-suggestions.ts';

export interface MetadataSuggestion {
  title: string | null;
  description: string | null;
  tags: string[];
}

/** Collapses whitespace, strips surrounding quotes, and caps the length so a
 *  chatty model can't write an essay into a single-line frontmatter field. */
function cleanScalar(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  let text = value.replace(/\s+/g, ' ').trim();
  if (text.length >= 2 && /^["'].*["']$/.test(text)) {
    text = text.slice(1, -1).trim();
  }
  if (text === '') return null;
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() : text;
}

/** Extracts a `{ title, description, tags }` suggestion from a model response.
 *  Tolerates a leading ```json fence and surrounding prose. Each field is
 *  independently optional — a missing or malformed field becomes null / []
 *  rather than failing the whole parse. */
export function parseMetadataSuggestions(raw: string): MetadataSuggestion {
  const empty: MetadataSuggestion = { title: null, description: null, tags: [] };
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? (fenced[1] ?? raw) : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return empty;
  }
  if (typeof parsed !== 'object' || parsed === null) return empty;
  const obj = parsed as Record<string, unknown>;
  return {
    title: cleanScalar(obj.title, 120),
    description: cleanScalar(obj.description, 500),
    // Reuse the tag parser/validator by handing it the serialized array.
    tags: Array.isArray(obj.tags) ? parseTagSuggestions(JSON.stringify(obj.tags)) : [],
  };
}
