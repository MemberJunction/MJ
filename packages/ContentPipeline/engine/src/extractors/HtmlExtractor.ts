/**
 * @fileoverview {@link HtmlExtractor} — an HTML page, stored as it was served.
 *
 * Extract stores what it read; the Segment stage cleans it. Cleaning HTML well needs the markup:
 * the selectors that keep the article (`.article-body`) and drop the navigation, footer and cookie
 * banner work on elements, and once the page is plain text there are none. So the item's text is the
 * page's markup, and Segment's cleaner (the `Html` cleaner by default, with the source's
 * `CleaningOptions`) turns it into text before splitting. A wrong selector is then fixed by running
 * Segment again, without fetching the page again.
 *
 * `TextExtractor` from `@memberjunction/ai-vectors` is still used to decide whether the page holds any
 * text at all, and to read the title.
 *
 * The bytes are decoded by the charset the page was served with (`ExtractRequest.ContentType`), else the one its
 * own `<meta charset>` (or `http-equiv` Content-Type) declares, else UTF-8, so a `windows-1252` page keeps its
 * accented letters. `ExtractorOptions.Html.TitleSelector` names the element whose text is the title, for a site
 * whose `<title>` is the site's name on every page; without a match the `<title>` is used as before.
 *
 * @module @memberjunction/content-pipeline
 */

import * as cheerio from 'cheerio';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { CharsetOfContentType, KnownCharset } from '@memberjunction/network-utils';
import { TextExtractor } from '@memberjunction/ai-vectors';
import { BaseContentExtractor, ExtractRequest, ExtractResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const HTML_EXTRACTOR = 'Html';

/** How far into a page to look for its `<meta charset>`; the HTML standard's prescan reads the first 1024 bytes. */
const CHARSET_PRESCAN_BYTES = 1024;
/** The longest title kept, to fit `MJ: Content Items.Name` (`nvarchar(250)`). */
const MAX_TITLE_CHARS = 250;

@RegisterClass(BaseContentExtractor, HTML_EXTRACTOR)
export class HtmlExtractor extends BaseContentExtractor {
    public readonly Key = HTML_EXTRACTOR;
    public readonly SupportedFileTypes = ['html', 'htm', 'xhtml'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const html = new TextDecoder(HtmlCharset(request.Content, request.ContentType), { fatal: false }).decode(request.Content);
        if (TextExtractor.ExtractFromHTML(html).trim().length === 0) {
            // An HTML document that yields no text is a real outcome — a page that is all script, or
            // a redirect stub. Reporting no blocks is honest; a block of empty string would read as
            // a successful extraction downstream.
            return { Blocks: [] };
        }
        const titleSelector = request.Options?.TitleSelector;
        const title = (typeof titleSelector === 'string' && titleSelector.trim() ? this.selectedTitle(html, titleSelector.trim(), request) : null) ?? this.titleOf(html);
        return {
            Blocks: [
                {
                    Text: html,
                    ...(title ? { Title: title } : {}),
                },
            ],
        };
    }

    /**
     * The text of the first element `selector` matches, or null when none does: the page's `<title>` is then used. A
     * selector that is not valid CSS is reported (it never matches anything, so the setting would do nothing unseen).
     */
    private selectedTitle(html: string, selector: string, request: ExtractRequest): string | null {
        try {
            const $ = cheerio.load(html);
            const text = $(selector).first().text().replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS).trim();
            return text.length > 0 ? text : null;
        } catch (error) {
            const message = `ExtractorOptions.Html.TitleSelector '${selector}' is not a valid CSS selector: ${error instanceof Error ? error.message : String(error)}`;
            LogError(`HtmlExtractor: ${message}`);
            request.ReportProgress(message);
            return null;
        }
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

/**
 * The charset to decode an HTML page with: its byte-order mark's, else the served `Content-Type`'s, else the page's own `<meta charset>` or
 * `<meta http-equiv="Content-Type" content="...; charset=...">` within its first bytes, else UTF-8. A label
 * `TextDecoder` does not know is passed over.
 */
export function HtmlCharset(content: Uint8Array, contentType?: string): string {
    // A byte-order mark outranks every label (the HTML standard's encoding sniffing).
    if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
        return 'utf-8';
    }
    if ((content[0] === 0xfe && content[1] === 0xff) || (content[0] === 0xff && content[1] === 0xfe)) {
        return content[0] === 0xfe ? 'utf-16be' : 'utf-16le';
    }
    const fromHeader = CharsetOfContentType(contentType);
    if (fromHeader) {
        return fromHeader;
    }
    const head = new TextDecoder('latin1').decode(content.subarray(0, CHARSET_PRESCAN_BYTES));
    return MetaDeclaredCharset(head) ?? 'utf-8';
}

/** One attribute of a tag: its name, and its value (quoted or not). Each part is a disjoint character class, so linear. */
const TAG_ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/**
 * The charset a page's own `<meta>` declares within `head` (the HTML standard's prescan, simplified): comments are
 * skipped, only a `<meta>` tag's `charset` attribute or an `http-equiv="Content-Type"` meta's `content` counts (not
 * `charset=` inside another attribute's text), and a declared UTF-16 means UTF-8: a page whose ASCII prescan could
 * read the declaration is not UTF-16 (real UTF-16 is found by its byte-order mark). One pass over `head`.
 */
export function MetaDeclaredCharset(head: string): string | null {
    const lower = head.toLowerCase();
    let i = 0;
    while (i < lower.length) {
        const tag = lower.indexOf('<', i);
        if (tag < 0) {
            return null;
        }
        if (lower.startsWith('<!--', tag)) {
            const end = lower.indexOf('-->', tag + 4);
            if (end < 0) {
                return null;
            }
            i = end + 3;
            continue;
        }
        const close = lower.indexOf('>', tag);
        if (close < 0) {
            return null;
        }
        i = close + 1;
        if (lower.startsWith('<meta', tag) && /[\s/]/.test(lower.charAt(tag + 5))) {
            const declared = metaCharset(head.slice(tag + 5, close));
            if (declared) {
                return declared;
            }
        }
    }
    return null;
}

/** The charset one `<meta>` tag's attributes declare, as the decoder should use it; null when it declares none it knows. */
function metaCharset(attributes: string): string | null {
    const values = new Map<string, string>();
    for (const match of attributes.matchAll(TAG_ATTRIBUTE)) {
        const name = match[1].toLowerCase();
        if (!values.has(name)) {
            values.set(name, match[2] ?? match[3] ?? match[4] ?? '');
        }
    }
    const label = values.get('charset')
        ?? (values.get('http-equiv')?.trim().toLowerCase() === 'content-type' ? charsetLabelOf(values.get('content')) : undefined);
    const known = KnownCharset(label);
    if (known === 'utf-16le' || known === 'utf-16be') {
        return 'utf-8';
    }
    return known === 'x-user-defined' ? 'windows-1252' : known;
}

/** The raw `charset=` label in a `Content-Type` value, known to the decoder or not. */
function charsetLabelOf(contentType: string | undefined): string | undefined {
    return /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType ?? '')?.[1];
}
