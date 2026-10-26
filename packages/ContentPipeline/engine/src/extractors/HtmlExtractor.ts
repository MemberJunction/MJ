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
     * The document's own `<title>`, located via linear `indexOf` scan so an unterminated `<title`
     * tag cannot trigger polynomial regex backtracking.
     */
    private titleOf(html: string): string | null {
        const lower = html.toLowerCase();
        const openStart = lower.indexOf('<title');
        if (openStart < 0) {
            return null;
        }
        const openEnd = lower.indexOf('>', openStart + 6);
        if (openEnd < 0) {
            return null;
        }
        const closeStart = lower.indexOf('</title>', openEnd + 1);
        const raw = html.slice(openEnd + 1, closeStart >= 0 ? closeStart : openEnd + 301);
        const title = TextExtractor.ExtractFromHTML(raw).trim();
        return title.length > 0 ? title : null;
    }
}
