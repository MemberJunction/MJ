/**
 * @fileoverview The Html extractor: a page decoded by the charset it was served (or declared) with, and its title
 * read from a selector when the source names one.
 */
import { describe, expect, it } from 'vitest';
import { ExtractRequest } from '@memberjunction/content-pipeline-base';
import { HtmlCharset, HtmlExtractor } from '../extractors/HtmlExtractor.js';

/** "café" in windows-1252: é is the single byte 0xE9, not valid UTF-8 on its own. */
function cp1252Page(head: string): Uint8Array {
    const before = new TextEncoder().encode(`<html><head>${head}<title>Menu</title></head><body><h1>Caf`);
    const after = new TextEncoder().encode('</h1><p>Open daily.</p></body></html>');
    return new Uint8Array([...before, 0xe9, ...after]);
}

function request(content: Uint8Array, extra: Partial<ExtractRequest> = {}): ExtractRequest {
    return { Content: content, FileType: 'html', URL: 'https://site.test/menu', Parameters: {}, Signal: new AbortController().signal, ReportProgress: () => {}, ...extra };
}

describe('HtmlExtractor', () => {
    it("decodes by the served Content-Type's charset", async () => {
        const result = await new HtmlExtractor().Extract(request(cp1252Page(''), { ContentType: 'text/html; charset=windows-1252' }));
        expect(result.Blocks[0].Text).toContain('<h1>Café</h1>');
    });

    it("decodes by the page's own meta charset when the server says none", async () => {
        const result = await new HtmlExtractor().Extract(request(cp1252Page('<meta charset="windows-1252">')));
        expect(result.Blocks[0].Text).toContain('Café');
        expect(HtmlCharset(cp1252Page('<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">'))).toBe('windows-1252');
    });

    it('reads UTF-8 when nothing says otherwise, and passes over a label it does not know', () => {
        expect(HtmlCharset(new TextEncoder().encode('<html>'), 'text/html')).toBe('utf-8');
        expect(HtmlCharset(new TextEncoder().encode('<html>'), 'text/html; charset=not-a-charset')).toBe('utf-8');
    });

    it('takes the title from the TitleSelector, else the <title>', async () => {
        const page = new TextEncoder().encode('<html><head><title>Site name</title></head><body><h1 class="t"> Real\n title </h1><p>Body text.</p></body></html>');
        expect((await new HtmlExtractor().Extract(request(page, { Options: { TitleSelector: 'h1.t' } }))).Blocks[0].Title).toBe('Real title');
        expect((await new HtmlExtractor().Extract(request(page, { Options: { TitleSelector: '.missing' } }))).Blocks[0].Title).toBe('Site name');
        expect((await new HtmlExtractor().Extract(request(page))).Blocks[0].Title).toBe('Site name');
    });

    it('lets a byte-order mark outrank every label', () => {
        const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('<html><head><meta charset="windows-1252"></head></html>')]);
        expect(HtmlCharset(bom, 'text/html; charset=ISO-8859-1')).toBe('utf-8');
    });

    it('reports a TitleSelector that is not valid CSS, and uses the <title>', async () => {
        const page = new TextEncoder().encode('<html><head><title>Site name</title></head><body><p>Body text.</p></body></html>');
        const progress: string[] = [];
        const result = await new HtmlExtractor().Extract(request(page, { Options: { TitleSelector: 'h1[' }, ReportProgress: (m: string) => progress.push(m) }));
        expect(result.Blocks[0].Title).toBe('Site name');
        expect(progress.some((m) => /not a valid CSS selector/.test(m))).toBe(true);
    });
});
