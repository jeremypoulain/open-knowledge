import { isValidFrontmatterTagValue } from '@inkeep/open-knowledge-core';

export function normalizeFrontmatterTags(value: unknown): string[] {
  if (typeof value === 'string') {
    return isValidFrontmatterTagValue(value)
      ? [value.startsWith('#') ? value.slice(1) : value]
      : [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.startsWith('#') ? item.slice(1) : item;
    if (!isValidFrontmatterTagValue(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function mergeSuggestedTags(
  existing: readonly string[],
  suggested: readonly string[],
): string[] {
  return normalizeFrontmatterTags([...existing, ...suggested]);
}
