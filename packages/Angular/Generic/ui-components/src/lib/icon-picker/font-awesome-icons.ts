/**
 * What Font Awesome icons this page can actually draw.
 *
 * Read from the loaded stylesheet rather than from a list shipped here, so the catalogue
 * is whatever the host really loaded — Free, Pro, or a pinned older version. A list in
 * source would drift from it silently and offer icons that render as blank squares.
 *
 * The scan can fail: a stylesheet served without CORS headers throws on `cssRules`, and a
 * host may load Font Awesome by some means this cannot see. {@link FALLBACK_ICON_NAMES}
 * covers that, so the picker always has something to show.
 */

/**
 * The style prefix to assume for a bare icon name.
 *
 * Solid, because it is the one style Font Awesome Free carries in full — `fa-regular`
 * exists there for only a few dozen icons, so defaulting to it would silently produce
 * blanks for most names.
 */
export const DEFAULT_ICON_STYLE = 'fa-solid';

/** Style prefixes an icon value may already carry, so normalization leaves it alone. */
const STYLE_PREFIXES = ['fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa-thin', 'fa-duotone', 'fas', 'far', 'fab', 'fal', 'fat', 'fad', 'fa'];

/**
 * Class names that start with `fa-` but are not icons: sizing, animation and layout
 * helpers. They carry no glyph, so offering them gives the user an empty square.
 */
const NON_ICON_CLASSES = new Set([
    'fa-spin', 'fa-pulse', 'fa-spin-pulse', 'fa-spin-reverse', 'fa-beat', 'fa-fade',
    'fa-beat-fade', 'fa-bounce', 'fa-flip', 'fa-shake', 'fa-fw', 'fa-border', 'fa-inverse',
    'fa-pull-left', 'fa-pull-right', 'fa-rotate-90', 'fa-rotate-180', 'fa-rotate-270',
    'fa-rotate-by', 'fa-flip-horizontal', 'fa-flip-vertical', 'fa-flip-both', 'fa-stack',
    'fa-stack-1x', 'fa-stack-2x', 'fa-layers', 'fa-layers-text', 'fa-layers-counter',
    'fa-sr-only', 'fa-sr-only-focusable', 'fa-li', 'fa-ul', 'fa-xs', 'fa-sm', 'fa-lg',
    'fa-xl', 'fa-2xl', 'fa-1x', 'fa-2x', 'fa-3x', 'fa-4x', 'fa-5x', 'fa-6x', 'fa-7x',
    'fa-8x', 'fa-9x', 'fa-10x', 'fa-2xs', 'fa-swap-opacity', 'fa-width-auto',
]);

/**
 * A small, dependable set for when the stylesheet cannot be read.
 *
 * Chosen to cover the things a form panel is usually about rather than to be exhaustive:
 * a user who needs something else can still type its name.
 */
export const FALLBACK_ICON_NAMES: readonly string[] = [
    'address-card', 'bell', 'bolt', 'book', 'bookmark', 'box', 'briefcase', 'building',
    'bullseye', 'calendar', 'calendar-check', 'certificate', 'chart-bar', 'chart-column',
    'chart-line', 'chart-pie', 'check', 'circle-check', 'circle-info', 'clipboard',
    'clipboard-list', 'clock', 'cloud', 'code', 'comment', 'comments', 'compass',
    'credit-card', 'database', 'diagram-project', 'dollar-sign', 'envelope', 'eye',
    'file', 'file-lines', 'filter', 'flag', 'folder', 'gauge', 'gear', 'globe',
    'graduation-cap', 'grip-vertical', 'heart', 'house', 'id-badge', 'id-card', 'image',
    'inbox', 'key', 'layer-group', 'lightbulb', 'link', 'list', 'list-check', 'location-dot',
    'lock', 'magnifying-glass', 'map', 'medal', 'message', 'money-bill', 'note-sticky',
    'paperclip', 'pen', 'people-group', 'percent', 'phone', 'puzzle-piece', 'receipt',
    'rocket', 'ruler', 'screwdriver-wrench', 'shield', 'sitemap', 'sliders', 'star',
    'table', 'table-cells', 'tag', 'tags', 'thumbtack', 'ticket', 'timeline', 'trophy',
    'truck', 'user', 'user-group', 'users', 'wand-magic-sparkles', 'warehouse', 'wrench',
];

/** Whether this value already names a Font Awesome style. */
function hasStylePrefix(value: string): boolean {
    const classes = value.split(/\s+/).filter((c) => c.length > 0);
    return classes.some((c) => STYLE_PREFIXES.includes(c));
}

/**
 * An icon value the browser can actually draw.
 *
 * Font Awesome needs a style class as well as a name: `fa-chart-column` alone matches the
 * base `.fa-chart-column` rule, which sets a glyph but no font family, so nothing renders.
 * A value that already names a style is returned untouched, including the older one-class
 * `fa fa-folder` form that the generated forms still use.
 *
 * @param style the style to assume for a bare name. Defaults to {@link DEFAULT_ICON_STYLE}.
 */
export function NormalizeIconClass(value: string | null | undefined, style: string = DEFAULT_ICON_STYLE): string {
    const trimmed = (value ?? '').trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) return '';
    if (hasStylePrefix(trimmed)) return trimmed;
    // A bare name without the fa- prefix is still meant as an icon name.
    const named = trimmed.startsWith('fa-') ? trimmed : `fa-${trimmed}`;
    return `${style} ${named}`;
}

/** The icon name inside a class string, without its style or `fa-` prefix. */
export function IconNameOf(value: string | null | undefined): string {
    const classes = (value ?? '').trim().split(/\s+/).filter((c) => c.length > 0);
    const name = classes.find((c) => c.startsWith('fa-') && !STYLE_PREFIXES.includes(c) && !NON_ICON_CLASSES.has(c));
    return name ? name.slice(3) : '';
}

/**
 * Icon names the loaded stylesheets define, or an empty list when none can be read.
 *
 * A rule qualifies when it styles `.fa-<name>` with `::before` content, which is how Font
 * Awesome attaches a glyph — the sizing and animation helpers share the prefix but set no
 * content, so this tells the two apart without a list to maintain.
 */
export function ScanLoadedIconNames(doc: Document): string[] {
    const found = new Set<string>();
    for (const sheet of Array.from(doc.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
            rules = sheet.cssRules;
        } catch {
            // Served without CORS headers, so its rules are not readable from script.
            continue;
        }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
            collectFromRule(rule, found);
        }
    }
    return [...found].sort();
}

function collectFromRule(rule: CSSRule, found: Set<string>): void {
    const style = rule as CSSStyleRule;
    const selector = typeof style.selectorText === 'string' ? style.selectorText : '';
    if (!selector || !selector.includes('::before') && !selector.includes(':before')) return;
    if (!style.style?.getPropertyValue('content')) return;
    for (const part of selector.split(',')) {
        const match = part.trim().match(/^\.(fa-[a-z0-9-]+)::?before$/);
        if (!match) continue;
        const cls = match[1];
        if (NON_ICON_CLASSES.has(cls)) continue;
        found.add(cls.slice(3));
    }
}

/** Icon names matching a search, most-relevant first. An empty search returns them all. */
export function FilterIconNames(names: readonly string[], search: string, limit = 240): string[] {
    const needle = search.trim().toLowerCase().replace(/^fa-/, '');
    if (needle.length === 0) return names.slice(0, limit);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of names) {
        if (name.startsWith(needle)) starts.push(name);
        else if (name.includes(needle)) contains.push(name);
    }
    return [...starts, ...contains].slice(0, limit);
}
