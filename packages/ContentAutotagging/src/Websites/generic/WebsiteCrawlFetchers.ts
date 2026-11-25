/**
 * @fileoverview {@link WebsiteCrawlFetchers} — how `AutotagWebsite.Discover`'s crawl reads pages and sitemaps.
 *
 * A page is fetched over HTTP (through the SSRF guard, with the source's session for its own origins), or through
 * the source's page renderer. A renderer is never handed a document file: in `Always` render mode a HEAD asks first
 * what the address is, and only a known document type (`IsDocumentContentType`: PDF, Word, ...) is fetched plainly;
 * in `WhenEmpty` mode the page is fetched plainly and rendered only when that finds an empty, script-only page, or
 * when the site refused the plain fetch (`RendersAfterRefusal`: a 403 to clients that are not browsers).
 *
 * A plain page is read as a stream: a file that is not HTML is not downloaded at all (its body is cancelled once
 * the headers say what it is), and an HTML page is read up to the source's `MaxResponseBytes`. A sitemap or
 * robots.txt is not held to `MaxResponseBytes` (a page limit) but to {@link MAX_SITEMAP_BYTES}, the sitemap
 * protocol's own limit.
 *
 * @module @memberjunction/content-autotagging
 */

import { LogStatus } from '@memberjunction/core';
import { HttpGet, HttpHead } from '@memberjunction/network-utils';
import {
    AccessArtifact,
    BasePageRenderer,
    IsDocumentContentType,
    IsHtmlContentType,
    LooksLikeEmptyPage,
    PageRenderMode,
    PageRenderOptions,
    RendersAfterRefusal,
} from '@memberjunction/content-pipeline-base';
import { CrawlFetchers, CrawlPage } from './WebsiteCrawl';

/** The most bytes of a sitemap or robots.txt read: the sitemap protocol's own limit for one uncompressed file. */
export const MAX_SITEMAP_BYTES = 50 * 1024 * 1024; // 50 MB (sitemaps.org)

/** The HTTP options a request to one URL gets: the SSRF guard, the signal, and the session when it belongs there. */
export interface CrawlHttpOptions {
    ValidateUrl?: boolean;
    StripHeadersOnCrossOriginRedirect?: boolean;
    Signal?: AbortSignal;
    Headers?: Record<string, string>;
    Query?: Record<string, string>;
}

/** What the fetchers need to know about the source and the walk. */
export interface WebsiteCrawlFetcherSettings {
    /** The HTTP options for a URL (the session only for its own origins). */
    HttpOptions: (url: string) => CrawlHttpOptions;
    /** The source's renderer, or null for plain HTTP. */
    Renderer: BasePageRenderer | null;
    RenderMode: PageRenderMode;
    RenderOptions?: PageRenderOptions;
    RenderTimeoutMs?: number;
    /** The session to hand the renderer for a URL (null when it does not belong there), and the origins it may go to. */
    RenderAccess: (url: string) => { Access: AccessArtifact | null; AccessOrigins: readonly string[] };
    /** The `User-Agent` plain requests send. Unset: the runtime's own. */
    UserAgent?: string;
    /** The most bytes of a page or sitemap read. Unset: no limit. */
    MaxResponseBytes?: number;
    Signal: AbortSignal;
}

/** The crawl's fetchers for one walk. */
export class WebsiteCrawlFetchers implements CrawlFetchers {
    constructor(private readonly settings: WebsiteCrawlFetcherSettings) {}

    /** A page, through the renderer when the source has one and the address is HTML; otherwise plainly. */
    public async Page(url: string): Promise<CrawlPage | null> {
        try {
            if (!this.settings.Renderer) {
                return await this.plainPage(url);
            }
            if (this.settings.RenderMode === 'WhenEmpty') {
                const plain = await this.plainPage(url);
                const empty = plain.Status >= 200 && plain.Status < 300 && IsHtmlContentType(plain.ContentType) && LooksLikeEmptyPage(plain.Html);
                return empty || RendersAfterRefusal(plain.Status) ? await this.render(url, this.settings.Renderer) : plain;
            }
            const file = await this.nonHtmlByHead(url);
            return file ?? (await this.render(url, this.settings.Renderer));
        } catch (error) {
            LogStatus(`AutotagWebsite: could not read ${url}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /** A sitemap or robots.txt, with its status and headers so a rate-limited answer is retried. */
    public async Text(url: string): Promise<CrawlPage | null> {
        try {
            const response = await HttpGet<string>(url, {
                ResponseType: 'text',
                ThrowOnError: false,
                UserAgent: this.settings.UserAgent,
                MaxResponseBytes: MAX_SITEMAP_BYTES,
                ...this.settings.HttpOptions(url),
            });
            return {
                Html: typeof response.Data === 'string' ? response.Data : '',
                FinalURL: response.Url || url,
                Status: response.Status,
                ContentType: response.Headers['content-type'],
                Headers: response.Headers,
            };
        } catch (error) {
            LogStatus(`AutotagWebsite: could not read ${url}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * A plain GET read as a stream: the headers decide whether the body is read at all. A file that is not HTML,
     * or an error answer, is returned without its body.
     */
    private async plainPage(url: string): Promise<CrawlPage> {
        const response = await HttpGet<ReadableStream<Uint8Array> | null>(url, {
            ResponseType: 'stream',
            ThrowOnError: false,
            UserAgent: this.settings.UserAgent,
            ...this.settings.HttpOptions(url),
        });
        const contentType = response.Headers['content-type'];
        const page = { FinalURL: response.Url || url, Status: response.Status, ContentType: contentType, Headers: response.Headers };
        if (!response.Ok || !IsHtmlContentType(contentType)) {
            await response.Data?.cancel().catch(() => undefined);
            return { ...page, Html: '' };
        }
        return { ...page, Html: await ReadStreamText(response.Data, contentType, this.settings.MaxResponseBytes) };
    }

    /**
     * What a HEAD says, when it says the address is a document file; null otherwise (HTML, a type servers also send for
     * pages, or no answer), and the page is rendered.
     */
    private async nonHtmlByHead(url: string): Promise<CrawlPage | null> {
        try {
            const response = await HttpHead(url, { ThrowOnError: false, UserAgent: this.settings.UserAgent, ...this.settings.HttpOptions(url) });
            const contentType = response.Headers['content-type'];
            if (response.Ok && IsDocumentContentType(contentType)) {
                return { Html: '', FinalURL: response.Url || url, Status: response.Status, ContentType: contentType, Headers: response.Headers };
            }
        } catch {
            // A server that refuses HEAD is rendered, as before.
        }
        return null;
    }

    private async render(url: string, renderer: BasePageRenderer): Promise<CrawlPage> {
        const { Access, AccessOrigins } = this.settings.RenderAccess(url);
        const rendered = await renderer.Render({
            URL: url,
            Access,
            AccessOrigins,
            TimeoutMs: this.settings.RenderTimeoutMs,
            Options: this.settings.RenderOptions,
            Signal: this.settings.Signal,
        });
        return { Html: rendered.Html, FinalURL: rendered.FinalURL, Status: rendered.Status, ContentType: 'text/html' };
    }
}

/**
 * A response stream as text, decoded by its charset, reading at most `maxBytes` (what is past them is not read:
 * enough of a page for its links). Unset: all of it.
 */
export async function ReadStreamText(stream: ReadableStream<Uint8Array> | null, contentType: string | undefined, maxBytes?: number): Promise<string> {
    if (!stream) {
        return '';
    }
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        const room = maxBytes === undefined ? value.byteLength : Math.max(0, maxBytes - total);
        parts.push(room < value.byteLength ? value.subarray(0, room) : value);
        total += Math.min(room, value.byteLength);
        if (maxBytes !== undefined && total >= maxBytes) {
            await reader.cancel().catch(() => undefined);
            break;
        }
    }
    return new TextDecoder(CharsetOf(contentType), { fatal: false }).decode(Buffer.concat(parts));
}

/** The charset a `Content-Type` names when `TextDecoder` knows it; else utf-8. */
function CharsetOf(contentType: string | undefined): string {
    const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType ?? '')?.[1];
    if (charset) {
        try {
            new TextDecoder(charset);
            return charset;
        } catch {
            // An unknown label reads as utf-8.
        }
    }
    return 'utf-8';
}
