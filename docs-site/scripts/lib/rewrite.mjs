/**
 * The link rewriter — the load-bearing detail of the whole docs build
 * (see plans/mj-documentation/plan.md §10a).
 *
 * Repo markdown links point at sibling repo files. On the deployed site those
 * must become one of:
 *   1. a RELATIVE site URL, when the target is also rendered on the site;
 *   2. a GitHub blob/tree URL pinned to the build's commit SHA, when the
 *      target exists in the repo but is not rendered (source files, CLAUDE.md
 *      internal docs, SQL, …);
 *   3. untouched (+ a collected warning) when the target cannot be resolved.
 * Relative images become raw.githubusercontent.com URLs pinned to the SHA.
 *
 * Implemented on the MDAST (remark), never regex over raw markdown — with the
 * one documented exception of raw HTML blocks, where we rewrite src/srcset/
 * href attribute values because MDAST treats HTML as an opaque string.
 *
 * All filesystem access is injected via `fileKind(repoPath) -> 'file'|'dir'|null`
 * so this module stays pure and unit-testable.
 */
import { visit } from 'unist-util-visit';
import { relativeSiteLink, resolveRepoPath, splitAnchor } from './site-map.mjs';

const GITHUB_REPO = 'MemberJunction/MJ';

export function createLinkRewriter(ctx) {
  assertContext(ctx);
  return (tree) => {
    visit(tree, ['link', 'definition'], (node) => {
      node.url = rewriteLinkTarget(node.url, ctx);
    });
    visit(tree, 'image', (node) => {
      node.url = rewriteImageTarget(node.url, ctx);
    });
    visit(tree, 'html', (node) => {
      node.value = rewriteHtmlValue(node.value, ctx);
    });
  };
}

/** True for URLs we must never touch: absolute, protocol-relative, anchors. */
export function isExternalOrAnchor(url) {
  return url === '' || url.startsWith('#') || url.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
}

export function rewriteLinkTarget(url, ctx) {
  if (isExternalOrAnchor(url)) return url;
  const { file, anchor } = splitAnchor(url);
  if (file === '') return url;
  const repoPath = resolveRepoPath(ctx.srcRepoPath, file);
  if (repoPath === null) return warned(ctx, url, 'escapes the repository');

  const targetSlug = ctx.siteMap.get(repoPath);
  if (targetSlug !== undefined) return relativeSiteLink(ctx.currentSlug, targetSlug, anchor);

  const kind = ctx.fileKind(repoPath);
  if (kind === 'file') return githubUrl('blob', ctx.sha, repoPath, anchor);
  if (kind === 'dir') return githubUrl('tree', ctx.sha, repoPath, '');
  return warned(ctx, url, 'target not found in repository');
}

export function rewriteImageTarget(url, ctx) {
  if (isExternalOrAnchor(url)) return url;
  const repoPath = resolveRepoPath(ctx.srcRepoPath, splitAnchor(url).file);
  if (repoPath === null || ctx.fileKind(repoPath) !== 'file') {
    return warned(ctx, url, 'image not found in repository');
  }
  return rawUrl(ctx.sha, repoPath);
}

/**
 * Rewrite src="…", srcset="…", and href="…" attribute values inside a raw
 * HTML block. srcset may hold comma-separated "url [descriptor]" entries.
 */
export function rewriteHtmlValue(value, ctx) {
  return value.replace(/(src|srcset|href)=("|')([^"']*)\2/g, (_match, attr, quote, target) => {
    const rewritten = attr === 'href' ? rewriteLinkTarget(target, ctx) : rewriteSrcset(target, ctx);
    return `${attr}=${quote}${rewritten}${quote}`;
  });
}

function rewriteSrcset(value, ctx) {
  return value
    .split(',')
    .map((entry) => {
      const [url, ...descriptor] = entry.trim().split(/\s+/);
      return [rewriteImageTarget(url, ctx), ...descriptor].join(' ');
    })
    .join(', ');
}

function githubUrl(kind, sha, repoPath, anchor) {
  const hash = anchor ? `#${anchor}` : '';
  return `https://github.com/${GITHUB_REPO}/${kind}/${sha}/${encodeRepoPath(repoPath)}${hash}`;
}

function rawUrl(sha, repoPath) {
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/${sha}/${encodeRepoPath(repoPath)}`;
}

function encodeRepoPath(repoPath) {
  return repoPath.split('/').map(encodeURIComponent).join('/');
}

function warned(ctx, url, reason) {
  ctx.warn(`${ctx.srcRepoPath}: link "${url}" ${reason}; left unchanged`);
  return url;
}

function assertContext(ctx) {
  for (const key of ['srcRepoPath', 'currentSlug', 'siteMap', 'sha', 'fileKind', 'warn']) {
    if (ctx[key] === undefined) throw new Error(`link rewriter context missing "${key}"`);
  }
}
