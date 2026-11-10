/**
 * Link safety for the test harness's lightweight markdown renderer.
 *
 * The renderer marks its output as trusted HTML, so Angular does NOT strip dangerous `href`
 * values from it. Model output is untrusted — a prompt-injected response can contain
 * `[click me](javascript:...)` — so every link target is checked here before it becomes an anchor.
 */

/** Schemes a rendered markdown link may use. Everything else is shown as plain text. */
const SAFE_LINK_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto']);

/** ASCII control characters, space and DEL — none of which belong in a link target. */
// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = /[\u0000- \u007f]/g;

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Returns the link target to use in an `href`, or `null` when the target must not become a link.
 *
 * Control characters and whitespace are removed BEFORE the scheme is read, because browsers do
 * the same when they parse a URL: `java\tscript:alert(1)` and `\u0001javascript:alert(1)` both
 * run as `javascript:`. Checking the raw text would read those as scheme-less relative links.
 *
 * @param rawUrl - the link target as written in the markdown (HTML-escaped or not)
 */
export function GetSafeMarkdownLinkTarget(rawUrl: string): string | null {
    const cleaned = (rawUrl ?? '').replace(CONTROL_OR_SPACE, '');
    if (cleaned.length === 0) {
        return null;
    }
    const schemeMatch = SCHEME_PATTERN.exec(cleaned);
    if (schemeMatch && !SAFE_LINK_SCHEMES.has(schemeMatch[1].toLowerCase())) {
        return null;
    }
    return cleaned;
}

/**
 * Renders one markdown link as HTML: an anchor for a safe target, the bare link text otherwise.
 *
 * Both arguments must already be HTML-escaped (the renderer escapes the whole message first);
 * that is what keeps a `"` in the target from closing the `href` attribute.
 */
export function RenderSafeMarkdownLink(escapedText: string, escapedUrl: string): string {
    const target = GetSafeMarkdownLinkTarget(escapedUrl);
    return target === null
        ? escapedText
        : `<a href="${target}" target="_blank" rel="noopener noreferrer" class="markdown-link">${escapedText}</a>`;
}
