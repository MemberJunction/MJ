/**
 * @fileoverview Makes archify's SVG self-contained.
 *
 * archify styles its SVG from the page template's CSS: shapes carry semantic classes such as
 * `c-backend` or `t-primary`, and their colors come from theme variables declared on the page. An SVG
 * lifted out of that page (into a report, the Query Builder Plan tab, or markdown) therefore renders
 * with default black fills and invisible arrows. This copies the rules the SVG actually uses into a
 * `<style>` inside it, scoped to the SVG's own id so they cannot restyle the host page, with one fixed
 * theme's variables resolved to literal values.
 *
 * @module @memberjunction/ai-diagrams
 */

interface CssRule {
    Selectors: string[];
    Body: string;
}

/** Parsed template CSS, cached per template so the ~300 KB of CSS is parsed once. */
const parsedTemplates = new Map<string, CssRule[]>();

/** Theme variables per template and preset. */
const resolvedThemes = new Map<string, Map<string, string>>();

const SIMPLE_CLASS_SELECTOR = /^(?:svg\s+)?((?:\.[\w-]+)+)$/;
const VAR_REFERENCE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g;

/**
 * Returns `svg` with an id and a scoped `<style>` that carries its own colors, strokes and fonts.
 *
 * @param svg - the `<svg>` archify rendered
 * @param templateHtml - the page template it was rendered into, whose CSS defines its classes
 * @param svgId - id for the SVG root; every copied selector is scoped to it
 * @param preset - archify's `meta.visual_preset` (`classic` when the spec names none)
 */
export function MakeStandaloneSvg(svg: string, templateHtml: string, svgId: string, preset = 'classic'): string {
    const rules = parseTemplateCss(templateHtml);
    const themeKey = `${templateHtml.length}:${preset}`;
    let variables = resolvedThemes.get(themeKey);
    if (!variables) {
        variables = resolveLightTheme(rules, preset);
        resolvedThemes.set(themeKey, variables);
    }
    const style = scopedRules(rules, usedClasses(svg), svgId, variables);
    // Trimmed so the SVG starts with `<svg`: a markdown ```svg fence only renders when it does.
    const withStyle = svg.trim().replace(/<svg\b([^>]*)>/, (_open, attributes: string) => {
        const withoutId = attributes.replace(/\sid="[^"]*"/, '');
        return `<svg id="${svgId}"${withoutId}><style>${style}</style>`;
    });
    return withBackground(withStyle, variables.get('--bg') ?? '#ffffff');
}

/**
 * archify draws on the page's background and its SVG has none of its own, so a light-theme diagram on a
 * dark host card (MJ's dark mode) loses its text. A solid rect behind everything keeps it readable. It
 * goes after `<title>`/`<desc>` so those stay the first children for assistive technology.
 */
function withBackground(svg: string, color: string): string {
    const viewBox = /<svg\b[^>]*\sviewBox="([-\d.\s]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number);
    if (!viewBox || viewBox.length !== 4 || viewBox.some((n) => Number.isNaN(n))) {
        return svg;
    }
    const [x, y, width, height] = viewBox;
    const rect = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}"/>`;
    const anchor = svg.indexOf('</desc>');
    if (anchor !== -1) {
        const at = anchor + '</desc>'.length;
        return svg.slice(0, at) + rect + svg.slice(at);
    }
    return svg.replace(/<\/style>/, () => `</style>${rect}`);
}

function parseTemplateCss(templateHtml: string): CssRule[] {
    const cacheKey = String(templateHtml.length);
    const cached = parsedTemplates.get(cacheKey);
    if (cached) {
        return cached;
    }
    const css = Array.from(templateHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g), (m) => m[1])
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = Array.from(stripAtBlocks(css).matchAll(/([^{}]+)\{([^{}]*)\}/g), (m) => ({
        Selectors: m[1].split(',').map((s) => s.trim()).filter((s) => s.length > 0),
        Body: m[2],
    }));
    parsedTemplates.set(cacheKey, rules);
    return rules;
}

/** Removes `@media`, `@supports` and `@keyframes` blocks: their rules are conditional or animation-only. */
function stripAtBlocks(css: string): string {
    let out = '';
    let index = 0;
    while (index < css.length) {
        const at = css.indexOf('@', index);
        if (at === -1) {
            return out + css.slice(index);
        }
        out += css.slice(index, at);
        const open = css.indexOf('{', at);
        if (open === -1) {
            return out;
        }
        let depth = 1;
        let cursor = open + 1;
        while (cursor < css.length && depth > 0) {
            if (css[cursor] === '{') depth++;
            else if (css[cursor] === '}') depth--;
            cursor++;
        }
        index = cursor;
    }
    return out;
}

/**
 * The light theme's custom properties, in cascade order: blocks for `:root` or the light theme first,
 * then the higher-specificity blocks for this preset's light theme.
 */
function resolveLightTheme(rules: CssRule[], preset: string): Map<string, string> {
    const base = new Set([':root', '[data-theme="light"]']);
    const presetLight = `[data-preset="${preset}"][data-theme="light"]`;
    const variables = new Map<string, string>();
    const collect = (matches: (rule: CssRule) => boolean) => {
        for (const rule of rules.filter(matches)) {
            for (const declaration of rule.Body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
                variables.set(declaration[1], declaration[2].trim());
            }
        }
    };
    collect((rule) => rule.Selectors.some((s) => base.has(s)));
    collect((rule) => rule.Selectors.includes(presetLight));
    return variables;
}

function usedClasses(svg: string): Set<string> {
    const classes = new Set<string>();
    for (const match of svg.matchAll(/\bclass="([^"]+)"/g)) {
        for (const name of match[1].split(/\s+/)) {
            if (name) classes.add(name);
        }
    }
    return classes;
}

/** Copies the root `svg` rules and every simple class rule whose classes the SVG uses, scoped to `#svgId`. */
function scopedRules(rules: CssRule[], classes: Set<string>, svgId: string, variables: Map<string, string>): string {
    const out: string[] = [];
    for (const rule of rules) {
        const selectors = rule.Selectors.flatMap((selector) => scopeSelector(selector, classes, svgId));
        const body = selectors.length > 0 ? markdownSafe(resolveVariables(rule.Body, variables, 0)) : '';
        if (body) {
            out.push(`${selectors.join(',')}{${body}}`);
        }
    }
    return out.join('');
}

/**
 * MJ's markdown renderer runs smartypants over the SVG's text content, `<style>` included: straight
 * quotes become curly, `--` becomes a dash and `...` an ellipsis, which breaks the CSS. So declarations
 * keep none of those: font names lose their quotes (unquoted family names are valid CSS), and any
 * custom property or declaration that still needs one is dropped.
 */
function markdownSafe(body: string): string {
    return body.split(';')
        .map((declaration) => declaration.trim())
        .filter((declaration) => declaration.length > 0 && !declaration.startsWith('--'))
        .map((declaration) => declaration.replace(/^([\w-]+)\s*:\s*/, '$1:'))
        .map((declaration) => /^font-family:/i.test(declaration) ? declaration.replace(/['"]/g, '') : declaration)
        .filter((declaration) => !/['"]|--|\.\.\./.test(declaration))
        .join(';');
}

function scopeSelector(selector: string, classes: Set<string>, svgId: string): string[] {
    if (selector === 'svg') {
        return [`#${svgId}`];
    }
    const match = SIMPLE_CLASS_SELECTOR.exec(selector);
    if (!match) {
        return [];
    }
    const compound = match[1];
    const names = compound.split('.').filter((name) => name.length > 0);
    return names.every((name) => classes.has(name)) ? [`#${svgId} ${compound}`] : [];
}

function resolveVariables(value: string, variables: Map<string, string>, depth: number): string {
    if (depth > 8) {
        return value;
    }
    const resolved = value.replace(VAR_REFERENCE, (_whole, name: string, fallback: string | undefined) =>
        variables.get(name) ?? fallback ?? 'initial');
    return resolved.includes('var(') ? resolveVariables(resolved, variables, depth + 1) : resolved;
}
