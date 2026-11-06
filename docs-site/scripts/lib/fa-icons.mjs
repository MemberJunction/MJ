/**
 * Font Awesome class -> inline SVG data, resolved at build time.
 *
 * Open App manifests name their icon the way MJ Explorer renders it: a Font
 * Awesome 6 class list ("fa-solid fa-cart-shopping"). The docs site loads no
 * icon font, so ingest turns each class list into the glyph's path data and the
 * page ships plain <svg> — no font download, nothing at runtime. The icon
 * packages are pinned to the Font Awesome version MJ itself ships
 * (@fortawesome/fontawesome-free 6.7.2), so an icon that renders in Explorer
 * resolves here.
 */
import { fab } from '@fortawesome/free-brands-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fas } from '@fortawesome/free-solid-svg-icons';

const STYLE_ALIASES = new Map([
  ['fa-solid', 'solid'],
  ['fas', 'solid'],
  ['fa-regular', 'regular'],
  ['far', 'regular'],
  ['fa-brands', 'brands'],
  ['fab', 'brands'],
]);

/** Classes that modify an icon rather than name it (size, width, animation, rotation, stacking). */
const MODIFIER = /^fa-(?:fw|lg|xs|sm|xl|2xs|2xl|\d+x|spin|spin-pulse|spin-reverse|pulse|beat|beat-fade|bounce|fade|flip|shake|border|inverse|li|ul|stack|stack-1x|stack-2x|rotate-\d+|rotate-by|flip-horizontal|flip-vertical|flip-both|pull-left|pull-right|sharp|duotone|thin|light|classic)$/;

let indexes;

/** name (and every alias) -> icon definition, one index per style. */
function buildIndexes() {
  const index = (pack) => {
    const map = new Map();
    for (const definition of Object.values(pack)) {
      map.set(definition.iconName, definition);
      for (const alias of definition.icon[2] ?? []) {
        if (typeof alias === 'string') map.set(alias, definition);
      }
    }
    return map;
  };
  return { solid: index(fas), regular: index(far), brands: index(fab) };
}

/**
 * @param {string | null | undefined} iconClass e.g. "fa-solid fa-file-invoice-dollar", "fa-robot", "fas fa-cheese"
 * @returns {{ viewBox: string, path: string } | null} null when the class names no known Free icon
 */
export function resolveFontAwesome(iconClass) {
  if (!iconClass) return null;
  indexes ??= buildIndexes();
  const tokens = iconClass.trim().split(/\s+/);
  const style = tokens.map((t) => STYLE_ALIASES.get(t)).find(Boolean) ?? 'solid';
  const name = tokens.find((t) => t.startsWith('fa-') && !STYLE_ALIASES.has(t) && !MODIFIER.test(t))?.slice(3);
  if (!name) return null;
  // The declared style first; a bare "fa-robot" (no style) is solid in FA 6, but fall through the others too.
  const order = [style, ...['solid', 'regular', 'brands'].filter((s) => s !== style)];
  for (const candidate of order) {
    const definition = indexes[candidate].get(name);
    if (!definition) continue;
    const [width, height, , , pathData] = definition.icon;
    return { viewBox: `0 0 ${width} ${height}`, path: Array.isArray(pathData) ? pathData.join(' ') : pathData };
  }
  return null;
}
