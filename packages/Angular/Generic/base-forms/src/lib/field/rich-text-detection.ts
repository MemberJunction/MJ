/**
 * Lightweight, client-side detection of the likely format of a long-text field value.
 *
 * Used by {@link MjFormFieldComponent} ONLY when a field's `ExtendedType` is null — when
 * `ExtendedType` is explicitly set (e.g. 'Markdown', 'HTML', 'Code'), the form field honors
 * that directly and never calls this function.
 *
 * The detection is intentionally conservative: it requires reasonably strong signals before
 * classifying content as Markdown or HTML, so that plain notes (which may contain the odd
 * `<` or `*`) keep rendering as plain text. Markdown is treated as the safe superset — if a
 * value shows Markdown signals it is classified as `'markdown'` even when it also contains
 * inline HTML, because the Markdown renderer handles embedded HTML.
 */
export type RichTextFormat = 'markdown' | 'html' | 'plain';

/**
 * Only inspect the leading slice of very large values — detection signals, if present, appear
 * early, and this keeps the regex work bounded regardless of field size.
 */
const MAX_SCAN_LENGTH = 8000;

/**
 * Structural / inline HTML tags that, when present in sufficient number, indicate real HTML
 * markup rather than an incidental angle bracket.
 */
const HTML_TAG_REGEX =
    /<\/?(?:p|div|span|br|hr|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|a|img|strong|em|b|i|u|blockquote|pre|code|section|article|header|footer|nav|figure|figcaption|small|sub|sup|mark|dl|dt|dd)\b[^>]*>/gi;

/** Markdown signals that are strong on their own (a single match is enough to classify). */
const STRONG_MARKDOWN_PATTERNS: RegExp[] = [
    /^#{1,6}\s+\S/m,                 // ATX heading:  "# Title"
    /^```/m,                          // fenced code block
    /^~~~/m,                          // alternative fenced code block
    /\[[^\]]+\]\([^)]+\)/,            // link:  [text](url)
    /!\[[^\]]*\]\([^)]+\)/,           // image: ![alt](url)
    /^\s*\|.+\|\s*$[\r\n]+^\s*\|?[\s:]*-{2,}/m, // table header + delimiter row
];

/** Weaker Markdown signals — need at least two distinct ones to classify as Markdown. */
const WEAK_MARKDOWN_PATTERNS: RegExp[] = [
    /^\s*[-*+]\s+\S/m,                // unordered list item
    /^\s*\d+\.\s+\S/m,                // ordered list item
    /\*\*[^*\s][^*]*\*\*/,            // **bold**
    /(?:^|\s)__[^_\s][^_]*__(?:\s|$)/,// __bold__
    /(?:^|\s)`[^`\s][^`]*`/,          // `inline code`
    /^>\s+\S/m,                       // > blockquote
    /^\s*([-*_])(?:\s*\1){2,}\s*$/m,  // thematic break: ---, ***, ___
];

/**
 * Classify a value's likely rich-text format. Returns `'plain'` for empty / whitespace-only
 * input and for anything that doesn't meet the Markdown or HTML thresholds.
 */
export function detectRichTextFormat(value: string | null | undefined): RichTextFormat {
    if (!value) return 'plain';

    const sample = value.length > MAX_SCAN_LENGTH ? value.slice(0, MAX_SCAN_LENGTH) : value;
    if (sample.trim().length === 0) return 'plain';

    // Markdown wins when present — its renderer also handles embedded HTML.
    if (hasMarkdownSignals(sample)) return 'markdown';

    // Otherwise, treat as HTML only when there are at least two real tags.
    if (countHtmlTags(sample) >= 2) return 'html';

    return 'plain';
}

/** True when the sample shows a strong Markdown signal, or two or more weak signals. */
function hasMarkdownSignals(sample: string): boolean {
    if (STRONG_MARKDOWN_PATTERNS.some((re) => re.test(sample))) return true;

    let weak = 0;
    for (const re of WEAK_MARKDOWN_PATTERNS) {
        if (re.test(sample)) {
            weak++;
            if (weak >= 2) return true;
        }
    }
    return false;
}

/** Count HTML-like tag matches (capped — we only care whether there are at least two). */
function countHtmlTags(sample: string): number {
    HTML_TAG_REGEX.lastIndex = 0;
    let count = 0;
    while (HTML_TAG_REGEX.exec(sample) !== null) {
        count++;
        if (count >= 2) break;
    }
    return count;
}
