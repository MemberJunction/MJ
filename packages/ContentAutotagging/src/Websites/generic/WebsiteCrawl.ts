/**
 * @fileoverview {@link WebsiteCrawl} — the website crawl behind `AutotagWebsite.Discover`: breadth-first over
 * in-scope links, optionally seeded from the site's sitemaps, and resumable across runs.
 *
 * The crawl keeps its frontier (pages still to read, with their depth) and every URL it has seen. When the walk's
 * deadline arrives it stops between pages and hands that state back as a resume token; the next walk picks up
 * exactly there. How a page or a sitemap is fetched is the caller's: plain HTTP, or a page renderer for sites
 * built by script (see `BasePageRenderer`), with the source's session applied by the caller.
 *
 * Scope and depth follow the crawler it replaces for Discover: a link is in scope when it starts with the root
 * URL and matches the pattern; the start page is depth 0 and every page up to `MaxDepth` has its links read.
 *
 * @module @memberjunction/content-autotagging
 */

import { gunzipSync, gzipSync } from 'node:zlib';
import * as cheerio from 'cheerio';

/** A page as the crawl needs it. */
export interface CrawlPage {
    Html: string;
    /** Where the page ended up after redirects; its links resolve against it. */
    FinalURL: string;
    /** 0 when there was no response. Only a 200 page has its links read. */
    Status: number;
}

/** How the crawl reads the web. Both return null when the address cannot be read. */
export interface CrawlFetchers {
    /** A page whose links the crawl reads. */
    Page(url: string): Promise<CrawlPage | null>;
    /** A plain-text resource: robots.txt or a sitemap. */
    Text(url: string): Promise<string | null>;
}

export interface CrawlOptions {
    SeedURL: string;
    /** A link is in scope when it starts with this. */
    RootURL: string;
    /** ...and matches this. */
    Pattern: RegExp;
    /** The deepest page whose links are read; the start page is 0. */
    MaxDepth: number;
    /** False reads no page's links: only the start page (and sitemap pages) are found. */
    FollowLinks: boolean;
    /** Also take the start page's links one level up (its sibling paths), without following them. */
    SiblingFanOut: boolean;
    /** Seed from the site's sitemaps: those listed, else robots.txt's and /sitemap.xml. */
    UseSitemaps: boolean;
    SitemapURLs?: readonly string[];
    /** The most pages whose links one whole walk reads (across its parts). Unset: no limit. */
    MaxPages?: number | null;
    /** Pause after each page read, to be polite to the site. */
    DelayMs: number;
    /** A sitemap page last modified at or before this is not reported (its links are still followed). */
    Since?: Date | null;
    /** Stop between pages at this time and return a resume token. */
    Deadline?: Date | null;
    Signal: AbortSignal;
}

/** One page the crawl found. */
export interface CrawlFound {
    URL: string;
    /** The sitemap's `lastmod`, when the page came from one. */
    LastModified?: Date;
}

/** What a crawl that stopped early hands back, and gets again to carry on. */
interface CrawlState {
    v: 1;
    /** Pages still to read, with their depth. */
    Queue: [string, number][];
    /** Every URL found so far, so nothing is reported twice across the walk's parts. */
    Seen: string[];
    /** How many pages have had their links read. */
    Read: number;
    SitemapsDone: boolean;
}

/** The most sitemap files one walk reads (an index can point at many). */
const MAX_SITEMAPS = 50;

export class WebsiteCrawl {
    constructor(
        private readonly options: CrawlOptions,
        private readonly fetchers: CrawlFetchers,
    ) {}

    /**
     * Crawl, yielding each page as it is found. Returns `{ ResumeToken }` when it stopped at the deadline with
     * pages still to read, and nothing when it is finished (or stopped by the signal, or hit `MaxPages`). Each
     * part reads at least one page before it stops for the deadline, so a walk always moves on.
     */
    public async *Run(resumeToken?: string | null): AsyncGenerator<CrawlFound, { ResumeToken?: string }, undefined> {
        const seed = NormalizeURL(this.options.SeedURL);
        const state = resumeToken ? DecodeCrawlState(resumeToken) : this.freshState(seed);
        const seen = new Set(state.Seen);
        if (!resumeToken) {
            yield { URL: seed };
        }
        if (this.options.UseSitemaps && !state.SitemapsDone) {
            yield* this.seedFromSitemaps(state, seen);
            state.SitemapsDone = true;
        }
        let readThisPart = 0;
        while (state.Queue.length > 0) {
            if (this.options.Signal.aborted) {
                return {};
            }
            // Each part reads at least one page, so a walk whose budget is smaller than one page still moves on.
            if (readThisPart > 0 && this.options.Deadline && Date.now() >= this.options.Deadline.getTime()) {
                return { ResumeToken: EncodeCrawlState({ ...state, Seen: [...seen] }) };
            }
            if (this.options.MaxPages && state.Read >= this.options.MaxPages) {
                return {};
            }
            const [url, depth] = state.Queue.shift()!;
            if (!this.options.FollowLinks || depth > this.options.MaxDepth) {
                continue;
            }
            const page = await this.fetchers.Page(url);
            state.Read++;
            readThisPart++;
            if (page && page.Status === 200) {
                for (const link of this.linksOf(page, depth === 0 && this.options.SiblingFanOut)) {
                    if (seen.has(link.URL)) {
                        continue;
                    }
                    seen.add(link.URL);
                    yield { URL: link.URL };
                    if (link.Follow) {
                        state.Queue.push([link.URL, depth + 1]);
                    }
                }
            }
            if (this.options.DelayMs > 0 && state.Queue.length > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.options.DelayMs));
            }
        }
        return {};
    }

    private freshState(seed: string): CrawlState {
        return { v: 1, Queue: [[seed, 0]], Seen: [seed], Read: 0, SitemapsDone: false };
    }

    /** The page's in-scope links; with `siblings`, also its links one level up, which are reported but not followed. */
    private linksOf(page: CrawlPage, siblings: boolean): { URL: string; Follow: boolean }[] {
        const $ = cheerio.load(page.Html);
        const self = NormalizeURL(page.FinalURL);
        const siblingRoot = siblings ? SiblingRoot(this.options.SeedURL) : null;
        const links: { URL: string; Follow: boolean }[] = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            let url: string;
            try {
                url = NormalizeURL(new URL(href!, page.FinalURL).href);
            } catch {
                return;
            }
            if (url === self || !/^https?:/i.test(url) || !this.options.Pattern.test(url)) {
                return;
            }
            if (url.startsWith(this.options.RootURL)) {
                links.push({ URL: url, Follow: true });
            } else if (siblingRoot && url.startsWith(siblingRoot)) {
                links.push({ URL: url, Follow: false });
            }
        });
        return links;
    }

    /** Report each in-scope page the site's sitemaps list (and queue it, so its links are followed too). */
    private async *seedFromSitemaps(state: CrawlState, seen: Set<string>): AsyncGenerator<CrawlFound, void, undefined> {
        const pending = [...(this.options.SitemapURLs?.length ? this.options.SitemapURLs : await this.discoverSitemaps())];
        const read = new Set<string>();
        while (pending.length > 0 && read.size < MAX_SITEMAPS && !this.options.Signal.aborted) {
            const sitemapURL = pending.shift()!;
            if (read.has(sitemapURL)) {
                continue;
            }
            read.add(sitemapURL);
            const xml = await this.fetchers.Text(sitemapURL);
            if (!xml) {
                continue;
            }
            const parsed = ParseSitemap(xml);
            pending.push(...parsed.Sitemaps);
            for (const entry of parsed.Pages) {
                const url = NormalizeURL(entry.URL);
                if (seen.has(url) || !url.startsWith(this.options.RootURL) || !this.options.Pattern.test(url)) {
                    continue;
                }
                seen.add(url);
                state.Queue.push([url, 1]);
                const unchanged = this.options.Since && entry.LastModified && entry.LastModified.getTime() <= this.options.Since.getTime();
                if (!unchanged) {
                    yield { URL: url, LastModified: entry.LastModified };
                }
            }
        }
    }

    /** The sitemaps robots.txt names, else the conventional /sitemap.xml. */
    private async discoverSitemaps(): Promise<string[]> {
        const origin = new URL(this.options.SeedURL).origin;
        const robots = await this.fetchers.Text(`${origin}/robots.txt`);
        const listed = (robots ?? '')
            .split(/\r?\n/)
            .map((line) => /^\s*sitemap\s*:\s*(\S+)/i.exec(line)?.[1])
            .filter((url): url is string => !!url);
        return listed.length > 0 ? listed : [`${origin}/sitemap.xml`];
    }
}

/** The pages and nested sitemaps a sitemap (or sitemap index) lists. */
export function ParseSitemap(xml: string): { Pages: { URL: string; LastModified?: Date }[]; Sitemaps: string[] } {
    const $ = cheerio.load(xml, { xmlMode: true });
    const sitemaps = $('sitemapindex > sitemap > loc')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((u: string) => u.length > 0);
    const pages = $('urlset > url')
        .map((_, el) => {
            const loc = $(el).find('loc').first().text().trim();
            const lastmod = $(el).find('lastmod').first().text().trim();
            const parsed = lastmod ? new Date(lastmod) : undefined;
            return { URL: loc, LastModified: parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined };
        })
        .get()
        .filter((p: { URL: string }) => p.URL.length > 0);
    return { Pages: pages, Sitemaps: sitemaps };
}

/**
 * A URL as a dedup key: no fragment, no trailing slash on the path (except the root), query parameters sorted.
 * Path case is kept: paths are case-sensitive.
 */
export function NormalizeURL(href: string): string {
    try {
        const u = new URL(href);
        u.hash = '';
        if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
            u.pathname = u.pathname.slice(0, -1);
        }
        u.searchParams.sort();
        return u.href;
    } catch {
        return href;
    }
}

/** The start page's parent path: its sibling paths start with this. */
function SiblingRoot(url: string): string {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter((s) => s);
    segments.pop();
    return `${parsed.origin}/${segments.join('/')}`;
}

/** The crawl's state as a compact token (gzip, base64). */
export function EncodeCrawlState(state: CrawlState): string {
    return gzipSync(Buffer.from(JSON.stringify(state), 'utf8')).toString('base64');
}

/** A token back to the crawl's state. @throws When it is not one this crawl wrote. */
export function DecodeCrawlState(token: string): CrawlState {
    const state = JSON.parse(gunzipSync(Buffer.from(token, 'base64')).toString('utf8')) as CrawlState;
    if (state?.v !== 1 || !Array.isArray(state.Queue) || !Array.isArray(state.Seen)) {
        throw new Error('the website crawl resume token is not one this crawler wrote');
    }
    return state;
}
