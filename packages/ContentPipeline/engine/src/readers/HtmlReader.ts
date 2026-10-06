/**
 * @fileoverview {@link HtmlReader} — HTML to text, through MJ's own extractor.
 *
 * The extraction is `TextExtractor` from `@memberjunction/ai-vectors-core`, not a second
 * implementation: it already strips scripts, styles and markup, decodes entities and normalises
 * whitespace, and it is what the rest of MJ uses to turn HTML into something embeddable. A reader
 * that re-derived any of that would drift from it the first time either side was improved.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { TextExtractor } from '@memberjunction/ai-vectors';
import { BaseContentReader, ReadRequest, ReadResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const HTML_READER = 'Html';

@RegisterClass(BaseContentReader, HTML_READER)
export class HtmlReader extends BaseContentReader {
    public readonly Key = HTML_READER;
    public readonly SupportedFileTypes = ['html', 'htm', 'xhtml'];

    public async Read(request: ReadRequest): Promise<ReadResult> {
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
     * The document's own `<title>`.
     *
     * Bounded and non-greedy, and matched against the head of the document only, so a page with an
     * unterminated tag cannot make this scan the whole body repeatedly.
     */
    private titleOf(html: string): string | null {
        const match = /<title[^>]*>([^<]{0,300})/i.exec(html.slice(0, 8192));
        const title = match?.[1]?.trim();
        return title && title.length > 0 ? title : null;
    }
}
