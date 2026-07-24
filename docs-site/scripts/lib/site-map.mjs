/**
 * Pure slug + URL math for the docs site. No I/O in this module.
 *
 * The site uses Astro's default "directory" build format, so every page URL
 * ends with a trailing slash. All cross-page links are emitted RELATIVE so the
 * site works unchanged under any deploy base path (/MJ/ on github.io today,
 * / after the docs.memberjunction.org CNAME flip).
 */
import path from 'node:path';

const GUIDE_SUFFIXES = [/_GUIDE$/i, /_BEST_PRACTICES$/i];

/** 'CACHING_AND_PUBSUB_GUIDE.md' -> 'caching-and-pubsub' */
export function guideSlug(filename) {
  let stem = filename.replace(/\.md$/i, '');
  for (const suffix of GUIDE_SUFFIXES) {
    if (stem.replace(suffix, '') !== '') stem = stem.replace(suffix, '');
  }
  return stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const ACRONYMS = new Map(
  ['ai', 'api', 'ui', 'ux', 'uuid', 'rag', 'sql', 'db', 'mj', 'esm', 'mcp', 'a2a'].map((a) => [a, a.toUpperCase()])
);

/** 'caching-and-pubsub' -> 'Caching And Pubsub' (sidebar fallback label) */
export function labelFromSlug(slug) {
  const last = slug.split('/').at(-1);
  return last
    .split('-')
    .map((w) => ACRONYMS.get(w) ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** 'packages/AI/Providers/OpenAI' -> 'packages/ai/providers/openai' */
export function packageSlug(dirRelPath) {
  return dirRelPath.split('/').map((seg) => seg.toLowerCase()).join('/');
}

/**
 * Relative URL from one site slug to another (both without leading/trailing
 * slashes). Returns a path ending in '/', or '#anchor'-only for self-links.
 */
export function relativeSiteLink(fromSlug, toSlug, anchor = '') {
  const hash = anchor ? `#${anchor}` : '';
  if (fromSlug === toSlug) return hash || './';
  const fromDir = `/${fromSlug}/`;
  const toDir = `/${toSlug}/`;
  const rel = path.posix.relative(fromDir, toDir);
  return `${rel}/${hash}`;
}

/** Split 'a/b.md#section' into { file: 'a/b.md', anchor: 'section' } */
export function splitAnchor(url) {
  const idx = url.indexOf('#');
  if (idx === -1) return { file: url, anchor: '' };
  return { file: url.slice(0, idx), anchor: url.slice(idx + 1) };
}

/**
 * Resolve a link target found in `srcRepoPath` (a repo-relative file path)
 * to a repo-relative path. Returns null if the target escapes the repo.
 */
export function resolveRepoPath(srcRepoPath, target) {
  const decoded = safeDecode(target);
  const base = decoded.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(srcRepoPath), decoded);
  const normalized = path.posix.normalize(base);
  if (normalized === '..' || normalized.startsWith('../')) return null;
  return normalized.replace(/\/+$/, '');
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
