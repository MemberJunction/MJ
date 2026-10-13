/**
 * Rewrite GitHub-flavored theme-swap `<picture>` blocks into a pair of `<img>`
 * tags the SITE's theme toggle can actually control.
 *
 * Repo READMEs swap light/dark artwork the only way GitHub supports it:
 *
 *   <picture>
 *     <source media="(prefers-color-scheme: dark)"  srcset="…_dark.png">
 *     <source media="(prefers-color-scheme: light)" srcset="…png">
 *     <img alt="MemberJunction" src="…png" width="420">
 *   </picture>
 *
 * That is correct on github.com and WRONG here. `prefers-color-scheme` reports
 * the OS setting, while Starlight themes off `data-theme` on `:root` — so a
 * reader on a dark-mode Mac who flips the site to light keeps the dark-ink
 * artwork, and vice versa. CSS cannot fix it after the fact: `<source>`
 * selection happens in the media-query engine, not the cascade.
 *
 * So we emit BOTH images and let `.mjd-themed-img--on-{light,dark}` in
 * custom.css show one per `data-theme`. Same doctrine as LandingFooter.astro.
 *
 * Pure string work on the raw-HTML MDAST node: remark keeps HTML blocks opaque,
 * which is already the documented exception in rewrite.mjs. Runs BEFORE the
 * link rewriter so the `src` values it emits get URL-rewritten by that one
 * existing code path rather than a second copy of it here.
 */
import { visit } from 'unist-util-visit';

const PICTURE = /<picture\b[^>]*>([\s\S]*?)<\/picture>/gi;
const SOURCE = /<source\b([^>]*?)\/?>/gi;
const IMG = /<img\b([^>]*?)\/?>/i;

/** MDAST transform: replace every theme-swap `<picture>` in every html node. */
export function rewriteThemePictures(tree) {
  visit(tree, 'html', (node) => {
    node.value = rewriteThemePictureHtml(node.value);
  });
}

/**
 * Replace theme-swap `<picture>` blocks in a raw HTML string. A `<picture>`
 * with no prefers-color-scheme `<source>` (art direction by viewport width,
 * say, or a plain format fallback) is left exactly as authored.
 */
export function rewriteThemePictureHtml(html) {
  return html.replace(PICTURE, (whole, inner) => {
    const img = inner.match(IMG);
    if (!img) return whole;

    const attrs = parseAttrs(img[1]);
    const fallback = attrs.src;
    const themed = themeSources(inner);
    const light = themed.light ?? fallback;
    const dark = themed.dark ?? fallback;
    if (themed.light === undefined && themed.dark === undefined) return whole;
    if (light === undefined || dark === undefined) return whole;

    // Carry through presentational attributes so layout/CLS behavior is
    // unchanged; alt is duplicated onto the visible copy only.
    const carried = ['width', 'height', 'style']
      .filter((name) => attrs[name] !== undefined)
      .map((name) => ` ${name}="${attrs[name]}"`)
      .join('');
    const alt = attrs.alt ?? '';

    return [
      `<img class="mjd-themed-img mjd-themed-img--on-light" src="${light}" alt="${alt}"${carried}>`,
      `<img class="mjd-themed-img mjd-themed-img--on-dark" src="${dark}" alt="" aria-hidden="true"${carried}>`,
    ].join('');
  });
}

/** Collect the light/dark srcset URLs from a `<picture>`'s `<source>` tags. */
function themeSources(inner) {
  const found = {};
  for (const [, raw] of inner.matchAll(SOURCE)) {
    const attrs = parseAttrs(raw);
    const scheme = /prefers-color-scheme\s*:\s*(dark|light)/i.exec(attrs.media ?? '');
    if (!scheme || !attrs.srcset) continue;
    // srcset may carry density descriptors ("x.png 2x"); the site only ever
    // needs the first candidate's URL.
    found[scheme[1].toLowerCase()] ??= attrs.srcset.split(',')[0].trim().split(/\s+/)[0];
  }
  return found;
}

/** Parse `name="value"` / `name='value'` pairs out of a tag's attribute text. */
function parseAttrs(raw) {
  const attrs = {};
  for (const [, name, , value] of raw.matchAll(/([a-zA-Z-]+)=("|')([^"']*)\2/g)) {
    attrs[name.toLowerCase()] = value;
  }
  return attrs;
}
