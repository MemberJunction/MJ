/**
 * @fileoverview Shared text extraction utilities for various content formats.
 *
 * Provides a unified interface for extracting plain text from HTML, plain text,
 * and other content types. Used by both the vectorization and autotagging pipelines.
 *
 * @module @memberjunction/ai-vectors
 */

/**
 * Shared text extraction utilities.
 *
 * Provides static methods for extracting clean text from various content formats.
 * These utilities are intentionally dependency-light — they use regex-based extraction
 * rather than heavy DOM parsing libraries, making them suitable for server-side use
 * without browser dependencies.
 */
export class TextExtractor {
    /**
     * Extract readable text from HTML content.
     * Strips tags, decodes entities, normalizes whitespace.
     */
    public static ExtractFromHTML(html: string): string {
        if (!html || html.trim().length === 0) return '';

        let text = html;

        // Remove script and style elements entirely
        text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // Replace block-level elements with newlines
        text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote|pre)>/gi, '\n');
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<(p|div|h[1-6]|li|tr|blockquote|pre)[^>]*>/gi, '\n');

        // Remove remaining HTML tags
        text = text.replace(/<[^>]+>/g, ' ');

        // Decode common HTML entities
        text = TextExtractor.decodeHTMLEntities(text);

        // Normalize whitespace
        text = TextExtractor.normalizeWhitespace(text);

        return text.trim();
    }

    /**
     * Extract and normalize plain text.
     * Trims, normalizes whitespace, and removes control characters.
     */
    public static ExtractFromPlainText(text: string): string {
        if (!text || text.trim().length === 0) return '';

        // Remove control characters except newlines and tabs
        let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        cleaned = TextExtractor.normalizeWhitespace(cleaned);
        return cleaned.trim();
    }

    /**
     * Detect content type from a MIME type string and extract text accordingly.
     *
     * Currently supports:
     * - text/html → ExtractFromHTML
     * - text/plain → ExtractFromPlainText
     * - text/* → ExtractFromPlainText (fallback)
     *
     * For binary formats (PDF, DOCX, etc.), callers should use dedicated libraries
     * (pdf-parse, officeparser) and then pass the extracted text through ExtractFromPlainText.
     */
    public static ExtractByMimeType(content: string, mimeType: string): string {
        if (!content) return '';

        const normalizedMime = mimeType.toLowerCase().trim();

        if (normalizedMime.includes('html')) {
            return TextExtractor.ExtractFromHTML(content);
        }

        // All other text types
        return TextExtractor.ExtractFromPlainText(content);
    }

    /**
     * Truncate text to a maximum token count (estimated).
     * Truncates at the last whitespace boundary before the limit.
     */
    public static TruncateToTokenLimit(text: string, maxTokens: number): string {
        if (!text) return '';

        const estimatedChars = maxTokens * 4; // rough estimate: ~4 chars per token
        if (text.length <= estimatedChars) return text;

        const truncated = text.slice(0, estimatedChars);
        const lastSpace = truncated.lastIndexOf(' ');
        return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
    }

    // ─────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────

    private static decodeHTMLEntities(text: string): string {
        const entityMap: Record<string, string> = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&apos;': "'",
            '&nbsp;': ' ',
            '&mdash;': '—',
            '&ndash;': '–',
            '&hellip;': '…',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™',
        };

        let decoded = text;
        for (const [entity, char] of Object.entries(entityMap)) {
            decoded = decoded.split(entity).join(char);
        }

        // Decode numeric entities (decimal and hex)
        decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
        decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

        return decoded;
    }

    private static normalizeWhitespace(text: string): string {
        // Collapse multiple spaces to single space
        let normalized = text.replace(/[ \t]+/g, ' ');
        // Collapse 3+ newlines to 2
        normalized = normalized.replace(/\n{3,}/g, '\n\n');
        // Remove spaces at beginning of lines
        normalized = normalized.replace(/\n /g, '\n');
        return normalized;
    }
}
