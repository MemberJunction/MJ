/**
 * @fileoverview {@link HtmlExtractor} — HTML to text, through MJ's own extractor.
 *
 * The extraction is `TextExtractor` from `@memberjunction/ai-vectors-core`, not a second
 * implementation: it already strips scripts, styles and markup, decodes entities and normalises
 * whitespace, and it is what the rest of MJ uses to turn HTML into something embeddable. A extractor
 * that re-derived any of that would drift from it the first time either side was improved.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { TextExtractor } from '@memberjunction/ai-vectors';
import { BaseContentExtractor, ExtractRequest, ExtractResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const HTML_EXTRACTOR = 'Html';

@RegisterClass(BaseContentExtractor, HTML_EXTRACTOR)
export class HtmlExtractor extends BaseContentExtractor {
    public readonly Key = HTML_EXTRACTOR;
    public readonly SupportedFileTypes = ['html', 'htm', 'xhtml'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const html = new TextDecoder('utf-8', { fatal: false }).decode(request.Content);
        const text = TextExtractor.ExtractFromHTML(html);
        if (text.trim().length === 0) {
            // An HTML document that yields no text is a real outcome — a page that is all script, or
            // a redirect stub. Reporting no blocks is honest; a block of empty string would read as
            // a successful extraction downstream.
            return { Blocks: [] };
        }
        const title = this.titleOf(html);
        return {
            Blocks: [
                {
                    Text: text,
                    ...(title ? { Title: title } : {}),
                },
            ],
        };
    }

    /**
     * The document's own `<title>`, located via linear scan over the original string (avoiding
     * `.toLowerCase()` length changes on characters like `İ` U+0130 and polynomial regex
     * backtracking), bounded to 300 raw characters before the next `<`, and clamped to 250
     * characters to fit `MJ: Content Items.Name` (`nvarchar(250)`).
     */
    private titleOf(html: string): string | null {
        const openStart = this.indexOfTitleTag(html);
        if (openStart < 0) {
            return null;
        }
        const openEnd = html.indexOf('>', openStart + 6);
        if (openEnd < 0) {
            return null;
        }
        const maxEnd = Math.min(html.length, openEnd + 1 + 300);
        const nextTag = html.indexOf('<', openEnd + 1);
        const rawEnd = nextTag >= 0 && nextTag < maxEnd ? nextTag : maxEnd;
        const raw = html.slice(openEnd + 1, rawEnd);
        const title = TextExtractor.ExtractFromHTML(raw).trim().slice(0, 250).trim();
        return title.length > 0 ? title : null;
    }

    /** Find `<title` (followed by `>` or whitespace) in `html` without allocating a lowercased copy. */
    private indexOfTitleTag(html: string): number {
        const limit = html.length - 6;
        for (let i = 0; i <= limit; i++) {
            if (html.charCodeAt(i) !== 60) {
                continue;
            }
            if (
                (html.charCodeAt(i + 1) | 32) === 116 && // 't'
                (html.charCodeAt(i + 2) | 32) === 105 && // 'i'
                (html.charCodeAt(i + 3) | 32) === 116 && // 't'
                (html.charCodeAt(i + 4) | 32) === 108 && // 'l'
                (html.charCodeAt(i + 5) | 32) === 101    // 'e'
            ) {
                const next = html.charCodeAt(i + 6);
                if (next === 62 || next === 32 || next === 9 || next === 10 || next === 13 || next === 47) {
                    return i;
                }
            }
        }
        return -1;
    }
}
