/**
 * @fileoverview {@link WebsiteCrawlFetchers} — how `AutotagWebsite.Discover`'s crawl reads pages and sitemaps.
 *
 * A page is fetched over HTTP (through the SSRF guard, with the source's session for its own origins), or through
 * the source's page renderer, as the source's render policy decides (`BasePageRenderPolicy`, selected by
 * `PageRenderMode`; Extract asks the same policy). A policy that probes first is told what a HEAD says the address
 * is; one that does not is shown the plain fetch's answer, a refusal included, and may render instead.
 *
 * A plain page is read as a stream: a file that is not HTML is not downloaded at all (its body is cancelled once
 * the headers say what it is), and an HTML page is read up to the source's `MaxResponseBytes`. A sitemap or
 * robots.txt is not held to `MaxResponseBytes` (a page limit) but to {@link MAX_SITEMAP_BYTES}, the sitemap
 * protocol's own limit.
 *
 * @module @memberjunction/content-autotagging
 */

import { LogStatus } from '@memberjunction/core';
import { CharsetOfContentType, HttpGet, HttpHead } from '@memberjunction/network-utils';
import {
    AccessArtifact,
    BasePageRenderer,
    BasePageRenderPolicy,
    IsHtmlContentType,
    PageRenderOptions,
} from '@memberjunction/content-pipeline-base';
import { CrawlFetchers, CrawlPage } from './WebsiteCrawl';

/** The most bytes of a sitemap or robots.txt read: the sitemap protocol's own limit for one uncompressed file. */
export const MAX_SITEMAP_BYTES = 50 * 1024 * 1024; // 50 MB (sitemaps.org)
/**
 * How long a page's body may take to arrive once its headers have. A streamed body is read after `HttpGet` returns,
 * outside its own timeout, so a server that trickles a page would otherwise hold the walk forever.
 */
export const PAGE_BODY_TIMEOUT_MS = 30_000; // HttpRequest's own default timeout, for the body as for the headers

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
    /** When a page is rendered rather than fetched plainly (the source's `PageRenderMode`). */
    RenderPolicy: BasePageRenderPolicy;
    /** `Tuning.EmptyPageTextChars`, for a policy that renders empty pages. */
    EmptyPageTextChars?: number;
    RenderOptions?: PageRenderOptions;
    RenderTimeoutMs?: number;
    /** The session to hand the renderer for a URL (null when it does not belong there), and the origins it may go to. */
    RenderAccess: (url: string) => { Access: AccessArtifact | null; AccessOrigins: readonly string[] };
    /** The `User-Agent` plain requests send. */
    UserAgent: string;
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
            const policy = this.settings.RenderPolicy;
            if (!policy.ProbesFirst) {
                const plain = await this.plainPage(url);
                const renders = policy.RendersAfterPlainFetch(plain, { EmptyPageTextChars: this.settings.EmptyPageTextChars });
                return renders ? await this.render(url, this.settings.Renderer, plain) : plain;
            }
            const head = await this.head(url);
            if (head && !policy.RendersAfterProbe(head.ContentType)) {
                return head;
            }
            return await this.render(url, this.settings.Renderer, head);
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
        return { ...page, Html: await ReadStreamText(response.Data, contentType, this.settings.MaxResponseBytes, this.settings.Signal) };
    }

    /**
     * What a HEAD says the address is (its status, type and headers, no body), or null when the server did not answer
     * HEAD; the policy then decides as for an address of no known type.
     */
    private async head(url: string): Promise<CrawlPage | null> {
        try {
            const response = await HttpHead(url, { ThrowOnError: false, UserAgent: this.settings.UserAgent, ...this.settings.HttpOptions(url) });
            if (!response.Ok) {
                return null;
            }
            return { Html: '', FinalURL: response.Url || url, Status: response.Status, ContentType: response.Headers['content-type'], Headers: response.Headers };
        } catch {
            return null;
        }
    }

    /**
     * The page through the renderer. A rendered page has no response headers, so the `Last-Modified` of the HEAD or
     * plain fetch that came first (when it answered) is kept: the walk's `Since` filters a rendered page as a plain one.
     */
    private async render(url: string, renderer: BasePageRenderer, before: CrawlPage | null): Promise<CrawlPage> {
        const { Access, AccessOrigins } = this.settings.RenderAccess(url);
        const rendered = await renderer.Render({
            URL: url,
            Access,
            AccessOrigins,
            TimeoutMs: this.settings.RenderTimeoutMs,
            Options: this.settings.RenderOptions,
            Signal: this.settings.Signal,
        });
        const lastModified = before && before.Status >= 200 && before.Status < 300 ? before.Headers?.['last-modified'] : undefined;
        return {
            Html: rendered.Html,
            FinalURL: rendered.FinalURL,
            Status: rendered.Status,
            ContentType: 'text/html',
            ...(lastModified ? { Headers: { 'last-modified': lastModified } } : {}),
        };
    }
}

/**
 * A response stream as text, decoded by its charset, reading at most `maxBytes` (what is past them is not read:
 * enough of a page for its links). Unset: all of it. The read is abandoned (and throws) when `signal` aborts or the
 * body takes longer than `timeoutMs`.
 */
export async function ReadStreamText(
    stream: ReadableStream<Uint8Array> | null,
    contentType: string | undefined,
    maxBytes?: number,
    signal?: AbortSignal,
    timeoutMs: number = PAGE_BODY_TIMEOUT_MS,
): Promise<string> {
    if (!stream) {
        return '';
    }
    const reader = stream.getReader();
    let stopped: string | null = null;
    const stop = (reason: string) => {
        stopped ??= reason;
        void reader.cancel(reason).catch(() => undefined);
    };
    const timer = setTimeout(() => stop(`the page's body took longer than ${timeoutMs} ms`), timeoutMs);
    const onAbort = () => stop('the walk was cancelled');
    if (signal?.aborted) {
        onAbort();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    const parts: Uint8Array[] = [];
    let total = 0;
    try {
        while (!stopped) {
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
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
    if (stopped) {
        throw new Error(stopped);
    }
    return new TextDecoder(CharsetOfContentType(contentType) ?? 'utf-8', { fatal: false }).decode(Buffer.concat(parts));
}
