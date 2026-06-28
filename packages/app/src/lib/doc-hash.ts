import { MANAGED_ARTIFACT_SCOPES, type SkillScope } from '@inkeep/open-knowledge-core';

function isSkillScope(value: string): value is SkillScope {
  return (MANAGED_ARTIFACT_SCOPES as readonly string[]).includes(value);
}

/** Parse a docName from a `#/<path>?<query>` hash. Returns null if the hash
 * is empty, malformed, or not in the `#/` namespace.
 *
 * Browsers percent-encode spaces and non-ASCII characters in
 * `window.location.hash`. This helper decodes per-segment so the returned
 * docName matches the server's on-disk name (e.g. `My Notes/Ideas — 2026`). */
export function docNameFromHash(hash: string): string | null {
  if (hash.startsWith(ASSET_HASH_PREFIX)) return null;
  if (hash.startsWith(SKILL_FILE_HASH_PREFIX)) return null;
  if (!hash.startsWith('#/')) return null;
  const rest = hash.slice(2);
  const delimiter = firstRouteDelimiterIndex(rest);
  const encoded = delimiter >= 0 ? rest.slice(0, delimiter) : rest;
  if (!encoded) return null;
  try {
    return encoded.split('/').map(decodeURIComponent).join('/');
  } catch {
    return encoded;
  }
}

export function anchorFromHash(hash: string): string | null {
  if (hash.startsWith(ASSET_HASH_PREFIX)) return null;
  if (!hash.startsWith('#/')) return null;

  const rest = hash.slice(2);
  const fragment = rest.indexOf('#');
  if (fragment < 0) return null;
  const encoded = rest.slice(fragment + 1);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export function hashFromDocName(docName: string, anchor?: string | null): string {
  const base = `#/${docName}`;
  return anchor ? `${base}#${encodeURIComponent(anchor)}` : base;
}

export function replaceHashWithoutNavigation(hash: string): void {
  if (window.location.hash === hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, '', `${pathname}${search}${hash}`);
}

export function filePathToDocName(filePath: string): string {
  if (filePath.endsWith('.mdx')) return filePath.slice(0, -4);
  if (filePath.endsWith('.md')) return filePath.slice(0, -3);
  return filePath;
}

export function hashFromFolderPath(folderPath: string, anchor?: string | null): string {
  const normalized = folderPath.replace(/^\/+|\/+$/g, '');
  const base = normalized ? `#/${normalized}/` : '#/';
  return anchor ? `${base}#${encodeURIComponent(anchor)}` : base;
}

export function encodeShareTargetForHash(
  kind: 'doc' | 'folder',
  path: string,
  branch?: string | null,
): string {
  if (kind === 'folder') return hashFromFolderPath(path);
  const base = `#/${encodeURIComponent(path)}`;
  if (branch === undefined || branch === null || branch === '') return base;
  return `${base}?branch=${encodeURIComponent(branch)}`;
}

export function isContentRootHash(hash: string): boolean {
  if (hash === '#/') return true;
  if (!hash.startsWith('#/')) return false;
  const rest = hash.slice(2);
  return rest.length > 0 && rest[0] === '?';
}

const ASSET_HASH_PREFIX = '#/__asset__/';

function firstRouteDelimiterIndex(rest: string): number {
  const qmark = rest.indexOf('?');
  const fragment = rest.indexOf('#');
  if (qmark < 0) return fragment;
  if (fragment < 0) return qmark;
  return Math.min(qmark, fragment);
}

export function assetPathFromHash(hash: string): string | null {
  if (!hash.startsWith(ASSET_HASH_PREFIX)) return null;
  const encoded = hash.slice(ASSET_HASH_PREFIX.length);
  if (!encoded) return null;
  const end = firstRouteDelimiterIndex(encoded);
  const pathPart = end < 0 ? encoded : encoded.slice(0, end);
  try {
    return pathPart.split('/').map(decodeURIComponent).join('/');
  } catch {
    return pathPart;
  }
}

/**
 * The viewer fragment carried after an asset path, e.g. the `page=12` in
 * `#/__asset__/notes/report.pdf#page=12`. Returned as-is (decoded) for
 * `parsePdfAnchor`; `null` when the hash isn't an asset hash or has no fragment.
 */
export function assetAnchorFromHash(hash: string): string | null {
  if (!hash.startsWith(ASSET_HASH_PREFIX)) return null;
  const encoded = hash.slice(ASSET_HASH_PREFIX.length);
  const fragment = encoded.indexOf('#');
  if (fragment < 0) return null;
  const anchor = encoded.slice(fragment + 1);
  if (!anchor) return null;
  try {
    return decodeURIComponent(anchor);
  } catch {
    return anchor;
  }
}

/** Build an asset hash with an optional viewer anchor (e.g. `page=12`). */
export function hashFromAssetPathWithAnchor(assetPath: string, anchor?: string | null): string {
  const base = hashFromAssetPath(assetPath);
  return anchor ? `${base}#${encodeURIComponent(anchor)}` : base;
}

export function hashFromAssetPath(assetPath: string): string {
  return `${ASSET_HASH_PREFIX}${assetPath.split('/').map(encodeURIComponent).join('/')}`;
}

const SKILL_FILE_HASH_PREFIX = '#/__skill-file__/';

export interface SkillFileHashTarget {
  scope: SkillScope;
  name: string;
  path: string;
}

export function hashFromSkillFile(target: SkillFileHashTarget): string {
  const head = [target.scope, target.name].map(encodeURIComponent).join('/');
  const tail = target.path.split('/').map(encodeURIComponent).join('/');
  return `${SKILL_FILE_HASH_PREFIX}${head}/${tail}`;
}

export function skillFileFromHash(hash: string): SkillFileHashTarget | null {
  if (!hash.startsWith(SKILL_FILE_HASH_PREFIX)) return null;
  const encoded = hash.slice(SKILL_FILE_HASH_PREFIX.length);
  if (!encoded) return null;
  let segments: string[];
  try {
    segments = encoded.split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
  if (segments.length < 3) return null;
  const [scope, name, ...rest] = segments;
  const path = rest.join('/');
  if (!scope || !name || !path || !isSkillScope(scope)) return null;
  return { scope, name, path };
}
