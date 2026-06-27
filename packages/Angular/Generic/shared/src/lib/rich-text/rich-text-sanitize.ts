import DOMPurify from 'dompurify';

/**
 * Sanitize untrusted HTML for safe rich-text rendering.
 *
 * Use this instead of relying on Angular's built-in `[innerHTML]` sanitizer
 * (which strips ALL SVG and inline styles). Configured for the HTML + SVG
 * profiles, DOMPurify keeps safe structural HTML **and** inline vector graphics
 * (`<svg>`, `<path>`, gradients, `<text>`, …) and inline `style`, while removing
 * the dangerous vectors: `<script>`, `on*` event handlers, `javascript:`/`data:`
 * script URLs, `<foreignObject>`, and friends.
 *
 * Because DOMPurify has already neutralized the markup, a caller may then bind
 * the result via `DomSanitizer.bypassSecurityTrustHtml(...)` — the documented
 * safe pattern (sanitize first, then bypass Angular's redundant re-sanitize).
 * The {@link MJSafeRichHtmlPipe} pipe does exactly that; prefer it in templates.
 *
 * Safe for untrusted input by design, so it suits both explicitly-typed HTML
 * fields and content that was only heuristically detected as HTML.
 *
 * @param raw the raw HTML string (null/undefined → '')
 * @returns a sanitized HTML string safe to render
 */
export function PurifyRichTextHtml(raw: string | null | undefined): string {
    return DOMPurify.sanitize(raw ?? '', {
        USE_PROFILES: { html: true, svg: true, svgFilters: true },
    });
}
