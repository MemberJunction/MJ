/**
 * What Font Awesome icons this page can actually draw, and in which style.
 *
 * Read from the loaded stylesheet rather than from a list shipped here, so the catalogue
 * is whatever the host really loaded — Free, Pro, or a pinned older version. A list in
 * source would drift from it silently and offer icons that render as blank squares.
 *
 * Knowing the NAME is not enough. Font Awesome splits its icons across several fonts, and
 * the stylesheet gives every icon the same kind of rule whichever font holds it — so a
 * name drawn in the wrong style renders as a missing-glyph box. Which font has a given
 * glyph is not written down anywhere in the CSS, so it is measured: a glyph the font does
 * not have falls back and measures exactly as it does with no Font Awesome at all.
 */

/**
 * The style prefix to assume for a bare icon name.
 *
 * Solid, because it is the one style Font Awesome Free carries in full — `fa-regular`
 * exists there for only a few dozen icons, so defaulting to it would silently produce
 * blanks for most names.
 */
export const DEFAULT_ICON_STYLE = 'fa-solid';

/**
 * The styles the picker offers, widest set first so a solid icon is reported as solid.
 *
 * Brands is deliberately absent. Those icons are company logos — Angular, Apple, Amazon
 * Pay — and a section header or a rail label is not a place for one; offering six hundred
 * of them buries the icons that do belong behind names nobody is searching for.
 *
 * Excluded from what is OFFERED, not from what renders: `fa-brands` stays a style
 * {@link NormalizeIconClass} leaves alone, so a brands class already stored, or typed by
 * hand, still draws.
 */
export const ICON_STYLES: readonly string[] = ['fa-solid', 'fa-regular'];

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

/** One icon the page can draw, with the style that actually draws it. */
export interface FontAwesomeIcon {
    /** The bare name, e.g. `chart-column`. */
    Name: string;
    /** The style class that has the glyph, e.g. `fa-solid`. */
    Style: string;
}

/** An icon name and the character its stylesheet rule assigns it. */
export interface IconGlyphRule {
    Name: string;
    /** The character from the rule's `content`, which is what gets measured. */
    Glyph: string;
}

/** How one style renders, as the browser resolves it. */
export interface IconStyleFont {
    Style: string;
    FontFamily: string;
    FontWeight: string;
}

/**
 * A small, dependable set for when the stylesheet cannot be read.
 *
 * Solid-only, and chosen to cover the things a form panel is usually about rather than to
 * be exhaustive: a user who needs something else can still type its name.
 */
export const FALLBACK_ICONS: readonly FontAwesomeIcon[] = [
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
].map((Name) => ({ Name, Style: DEFAULT_ICON_STYLE }));

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
 * Icon names and glyphs the loaded stylesheets define.
 *
 * A rule qualifies when it styles `.fa-<name>` with `::before` content, which is how Font
 * Awesome attaches a glyph — the sizing and animation helpers share the prefix but set no
 * content, so this tells the two apart without a list to maintain.
 */
export function ScanLoadedIconRules(doc: Document): IconGlyphRule[] {
    const found = new Map<string, string>();
    for (const sheet of Array.from(doc.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
            rules = sheet.cssRules;
        } catch {
            // Served without CORS headers, so its rules are not readable from script.
            continue;
        }
        if (!rules) continue;
        for (const rule of Array.from(rules)) collectFromRule(rule, found);
    }
    return [...found.entries()]
        .map(([Name, Glyph]) => ({ Name, Glyph }))
        .sort((a, b) => a.Name.localeCompare(b.Name));
}

function collectFromRule(rule: CSSRule, found: Map<string, string>): void {
    const style = rule as CSSStyleRule;
    const selector = typeof style.selectorText === 'string' ? style.selectorText : '';
    if (!selector || (!selector.includes('::before') && !selector.includes(':before'))) return;
    const content = style.style?.getPropertyValue('content');
    if (!content) return;
    const glyph = GlyphFromContent(content);
    if (!glyph) return;
    for (const part of selector.split(',')) {
        const match = part.trim().match(/^\.(fa-[a-z0-9-]+)::?before$/);
        if (!match) continue;
        const cls = match[1];
        if (NON_ICON_CLASSES.has(cls)) continue;
        found.set(cls.slice(3), glyph);
    }
}

/**
 * The character a `content` value names.
 *
 * Font Awesome writes it as a CSS escape — `content: "\f007"` — which reaches script with
 * the quotes and the escape intact. A value naming anything else (a keyword, a counter,
 * a var it could not resolve) yields nothing, so it is skipped rather than measured.
 */
export function GlyphFromContent(content: string): string {
    const body = content.trim().replace(/^["']|["']$/g, '');
    const escaped = body.match(/^\\([0-9a-fA-F]{1,6})$/);
    if (escaped) return String.fromCodePoint(parseInt(escaped[1], 16));
    return body.length === 1 || [...body].length === 1 ? body : '';
}

/**
 * How each style renders, as the browser resolves it on this page.
 *
 * Probed rather than assumed: the font family carries the major version in its name
 * (`Font Awesome 6 Free`), and a host on another version, or on a kit, names it something
 * else. A style whose family does not resolve is left out — it is not loaded.
 */
export function ProbeIconStyleFonts(doc: Document, styles: readonly string[] = ICON_STYLES): IconStyleFont[] {
    const out: IconStyleFont[] = [];
    const host = doc.body ?? doc.documentElement;
    if (!host) return out;
    for (const style of styles) {
        const probe = doc.createElement('i');
        probe.className = style;
        probe.setAttribute('aria-hidden', 'true');
        probe.style.position = 'absolute';
        probe.style.left = '-99999px';
        host.appendChild(probe);
        try {
            const computed = doc.defaultView?.getComputedStyle(probe);
            const family = (computed?.fontFamily ?? '').trim();
            if (family && /font\s*awesome/i.test(family)) {
                out.push({ Style: style, FontFamily: family, FontWeight: (computed?.fontWeight ?? '400').trim() });
            }
        } finally {
            host.removeChild(probe);
        }
    }
    return out;
}

/**
 * Whether a font has a glyph, decided by measuring it.
 *
 * Implemented by the caller so this module stays free of canvas and testable without one.
 * Returns true when `glyph` renders from `font` rather than falling back.
 */
export type GlyphPresenceTest = (glyph: string, font: IconStyleFont) => boolean;

/**
 * Each icon paired with the style that actually draws it.
 *
 * The stylesheet says which icons exist but not which font holds each one, and drawing a
 * brands icon as solid produces a missing-glyph box — which is what a user sees as "half
 * the icons are broken". Styles are tried in order, so an icon present in several is
 * reported under the first, and an icon no loaded font has is dropped rather than offered
 * as a blank square.
 */
export function ResolveIconStyles(
    rules: readonly IconGlyphRule[],
    fonts: readonly IconStyleFont[],
    hasGlyph: GlyphPresenceTest,
): FontAwesomeIcon[] {
    if (fonts.length === 0) return [];
    const out: FontAwesomeIcon[] = [];
    for (const rule of rules) {
        const font = fonts.find((f) => hasGlyph(rule.Glyph, f));
        if (font) out.push({ Name: rule.Name, Style: font.Style });
    }
    return out;
}

/** Icons matching a search, most-relevant first. An empty search returns them all. */
export function FilterIcons(icons: readonly FontAwesomeIcon[], search: string, limit = 240): FontAwesomeIcon[] {
    const needle = search.trim().toLowerCase().replace(/^fa-/, '');
    if (needle.length === 0) return icons.slice(0, limit);
    const starts: FontAwesomeIcon[] = [];
    const contains: FontAwesomeIcon[] = [];
    for (const icon of icons) {
        if (icon.Name.startsWith(needle)) starts.push(icon);
        else if (icon.Name.includes(needle)) contains.push(icon);
    }
    return [...starts, ...contains].slice(0, limit);
}
