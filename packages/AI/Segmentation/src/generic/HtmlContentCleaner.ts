/**
 * @fileoverview Selector-driven HTML cleaner.
 *
 * @module @memberjunction/ai-segmentation
 */

import * as cheerio from 'cheerio';
import { RegisterClass } from '@memberjunction/global';
import { BaseContentCleaner, ContentCleaningOptions, ContentCleaningParams } from './BaseContentCleaner';

/** Registration key for {@link HtmlContentCleaner}. */
export const HTML_CONTENT_CLEANER_KEY = 'Html';

/**
 * Elements removed before extraction unless the caller overrides `ExcludeSelectors`.
 * These carry no document content on essentially any site.
 */
export const DEFAULT_HTML_EXCLUDE_SELECTORS = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    '[aria-hidden="true"]',
    '.hidden',
];

/** Options specific to {@link HtmlContentCleaner}. */
export interface HtmlContentCleaningOptions extends ContentCleaningOptions {
    /**
     * Replace the built-in exclusion list rather than adding to it. Default: false
     * (caller selectors are appended to {@link DEFAULT_HTML_EXCLUDE_SELECTORS}).
     */
    ReplaceDefaultExcludes?: boolean;
    /** Keep `alt` text from images as content. Default: false. */
    IncludeImageAltText?: boolean;
}

/**
 * Extracts readable text from HTML using CSS selectors.
 *
 * Real-world source pages are mostly not content: navigation, sidebars, cookie banners,
 * share widgets, related-article rails, and advertising typically outweigh the article
 * itself. Stripping tags alone keeps all of that text, and because chrome repeats across
 * every page of a site it produces many near-identical chunks that crowd out real answers
 * at retrieval time.
 *
 * The high-leverage control is `IncludeSelectors` — naming the one element that holds the
 * content (`.article-body`, `main`, `#post`) discards everything else without having to
 * enumerate what to drop. `ExcludeSelectors` then handles whatever survives inside it.
 *
 * Both are per-source configuration because the right selector is a property of the site's
 * template, not of MemberJunction. A sensible default exclusion list handles sources that
 * haven't been tuned yet.
 */
@RegisterClass(BaseContentCleaner, HTML_CONTENT_CLEANER_KEY)
export class HtmlContentCleaner extends BaseContentCleaner {
    public get Key(): string {
        return HTML_CONTENT_CLEANER_KEY;
    }

    protected CleanCore(params: ContentCleaningParams<HtmlContentCleaningOptions>): string {
        const options = params.Options;
        const $ = cheerio.load(params.Content);

        this.removeExcluded($, options);
        const scope = this.resolveScope($, options);
        this.promoteImageAltText($, scope, options);

        return this.extractText($, scope);
    }

    /** Drop excluded elements from the document. */
    private removeExcluded(
        $: cheerio.CheerioAPI,
        options?: HtmlContentCleaningOptions,
    ): void {
        const selectors = options?.ReplaceDefaultExcludes
            ? options?.ExcludeSelectors ?? []
            : [...DEFAULT_HTML_EXCLUDE_SELECTORS, ...(options?.ExcludeSelectors ?? [])];

        for (const selector of selectors) {
            try {
                $(selector).remove();
            } catch {
                // An invalid selector shouldn't fail the whole clean — skip it and continue,
                // since the rest of the rules are still worth applying.
            }
        }
    }

    /**
     * Narrow to the included selectors when supplied, else the body.
     * Returns a selection whose text is the document's content.
     */
    private resolveScope(
        $: cheerio.CheerioAPI,
        options?: HtmlContentCleaningOptions,
    ): cheerio.Cheerio<never> {
        const includes = options?.IncludeSelectors ?? [];
        for (const selector of includes) {
            try {
                const matched = $(selector);
                if (matched.length > 0) {
                    return matched as unknown as cheerio.Cheerio<never>;
                }
            } catch {
                // Ignore an invalid include selector and try the next one.
            }
        }
        const body = $('body');
        const scope = body.length > 0 ? body : $.root();
        return scope as unknown as cheerio.Cheerio<never>;
    }

    /** Append image alt text so meaningful figures aren't lost, when requested. */
    private promoteImageAltText(
        $: cheerio.CheerioAPI,
        scope: cheerio.Cheerio<never>,
        options?: HtmlContentCleaningOptions,
    ): void {
        if (!options?.IncludeImageAltText) {
            return;
        }
        $(scope).find('img').each((_i, el) => {
            const alt = $(el).attr('alt');
            if (alt && alt.trim().length > 0) {
                $(el).replaceWith(`<p>${alt.trim()}</p>`);
            }
        });
    }

    /**
     * Extract text, inserting newlines at block boundaries.
     *
     * cheerio's `.text()` concatenates without separators, so `<p>a</p><p>b</p>` becomes
     * "ab" — which destroys the paragraph breaks segmenters depend on for boundaries.
     */
    private extractText($: cheerio.CheerioAPI, scope: cheerio.Cheerio<never>): string {
        $(scope).find('p, div, section, article, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre').each((_i, el) => {
            $(el).append('\n\n');
        });
        $(scope).find('br').replaceWith('\n');

        return $(scope).text();
    }
}
