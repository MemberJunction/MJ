/**
 * @fileoverview {@link WebsiteCrawl} — the website crawl behind `AutotagWebsite.Discover`: breadth-first over
 * in-scope links, optionally seeded from the site's sitemaps, and resumable across runs.
 *
 * **A page is reported only once it has been fetched and found alive.** A link is a candidate, not an item: the
 * crawl fetches it, and a page that answers with a lasting client error (a 4xx other than 408, 425 and 429) is
 * remembered as dead and never reported, so a site's broken links do not become items that fail in Extract. A
 * Cloudflare challenge (`cf-mitigated`) is not dead, nor is a server error or no answer at all: those are tried
 * once more at the end of the queue and then reported, for Extract (and its retry schedule) to decide. A page
 * that is not HTML (a PDF, a Word file) is reported without its links being read. An address the SSRF guard refuses
 * is dropped like a dead one: never retried, never reported. A page that redirects out of the crawl's scope (another
 * site, another path, an excluded URL) is neither reported nor read for links.
 *
 * **Politely.** Every fetch to a host goes through that host's rate limiter (network-utils `RateLimiter`); a host that
 * answers 429 (or 503 with `Retry-After`) is slowed, and the fetch is retried after the longer of what it asks and an
 * exponential backoff (`WithRetry`), no wait (nor the host's pause) longer than `MaxBackoffMs`. Only a real answer
 * (2xx or 3xx, not a challenge) lets the host's pace recover. A page still limited after its retries goes to the back
 * of the queue once rather than losing its links. With `Concurrency` above 1, that many pages are fetched at a time.
 *
 * The crawl keeps its frontier (pages still to read, with their depth) and every URL it has seen. When the walk's
 * deadline arrives it stops between pages and hands that state back as a resume token; the next walk picks up
 * exactly there. How a page or a sitemap is fetched is the caller's: plain HTTP, or a page renderer for sites
 * built by script (see `BasePageRenderer`), with the source's session applied by the caller.
 *
 * Scope and depth: a link is in scope when it is under the root URL (the same site, and the root's path or below it,
 * segment by segment: see `CrawlScope.UnderRoot`) and matches the pattern (and the {@link CrawlScopeOptions} lists,
 * when set); the start page is depth 0, every page up to `MaxDepth` has its links read, and the pages one level deeper
 * are fetched (to know they are alive) but their links are not read. A page that duplicates one already found (see
 * `DedupCanonical`, `DedupRedirects`) is not reported, its links are not read and it does not count toward `MaxPages`.
 *
 * Sitemaps: those the source lists are read wherever they are; those robots.txt or a sitemap index names are read
 * only on the start page's own site. A sitemap answering as an HTML page (a soft 404) is ignored. Reading them stops
 * at the deadline like reading pages, and carries on in the next part.
 *
 * @module @memberjunction/content-autotagging
 */

import { gunzipSync, gzipSync } from 'node:zlib';
import * as cheerio from 'cheerio';
import { IsHtmlContentType } from '@memberjunction/content-pipeline-base';
import { AbortableDelay } from '@memberjunction/ai';
import { ParseRetryAfterValue, RateLimiter, RetryConfig, WithRetry } from '@memberjunction/network-utils';
import { CrawlScope, CrawlScopeOptions, NormalizeCrawlURL } from './CrawlScope';

/** A page as the crawl needs it. */
export interface CrawlPage {
    /** The page's HTML; empty for a page that is not HTML or answered with an error. */
    Html: string;
    /** Where the page ended up after redirects; its links resolve against it. */
    FinalURL: string;
    /** 0 when there was no response. Only a 2xx HTML page has its links read. */
    Status: number;
    /** The server's `Content-Type`. Set and not HTML: the page is reported but its links are not read. Unset: HTML. */
    ContentType?: string;
    /** Response headers, lower-cased keys (`retry-after`, `cf-mitigated`, `last-modified`), when the caller has them. */
    Headers?: Readonly<Record<string, string>>;
    /** The address was refused before any request (the SSRF guard): it is dropped, never retried or reported. */
    Blocked?: boolean;
}

/** Whether an answer is the host asking the crawl to slow down: a 429, or a 503 with a readable `Retry-After`. */
export function IsRateLimitedAnswer(page: CrawlPage): boolean {
    return page.Status === 429 || (page.Status === 503 && ParseRetryAfterValue(page.Headers?.['retry-after']) !== undefined);
}

/** Whether an answer is the host holding the crawl off: rate-limiting it ({@link IsRateLimitedAnswer}) or challenging it (`cf-mitigated`). */
export function IsHoldingOff(page: CrawlPage): boolean {
    return IsRateLimitedAnswer(page) || !!page.Headers?.['cf-mitigated'];
}

/** How the crawl reads the web. Both return null when the address cannot be read at all. */
export interface CrawlFetchers {
    /** A page: fetched to know it is alive, and its links read when it is HTML. */
    Page(url: string): Promise<CrawlPage | null>;
    /**
     * A plain-text resource: robots.txt or a sitemap. A {@link CrawlPage} (its `Html` the text) lets the crawl see
     * the status, so a rate-limited sitemap is retried, and the content type, so an HTML page is not taken for a
     * sitemap; a bare string is taken as a 200 of no stated type.
     */
    Text(url: string): Promise<CrawlPage | string | null>;
}

export interface CrawlOptions extends CrawlScopeOptions {
    SeedURL: string;
    /** A link is in scope when it is under this: the same site, and this path or below it (see `CrawlScope.UnderRoot`). */
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
    /**
     * The most pages whose links one whole walk reads (across its parts). The pages already found when it is reached
     * are still fetched and reported; dead pages, files, duplicates and retries do not count. Unset, or 0 or less: no
     * limit.
     */
    MaxPages?: number | null;
    /** Pause after each batch of pages, to be polite to the site. */
    DelayMs: number;
    /** How many pages are fetched at a time. Default 1. */
    Concurrency?: number;
    /**
     * Fetch a page whose links will not be read (one level past `MaxDepth`, a sibling path, any page past `MaxPages`)
     * to know it is alive before reporting it. Default true: a dead link never becomes an item. `false` reports such
     * pages unfetched, as found, which saves the crawl one request per page (Extract fetches each one anyway) at the
     * cost of dead links becoming items that fail in Extract. Decided page by page, whatever `Concurrency` is; a page
     * reported unfetched counts toward the walk's deadline like a fetched one, and one a sitemap dates at or before
     * `Since` is not reported.
     */
    CheckLeafPages?: boolean;
    /** How a host that rate-limits the crawl is backed off and paced (`Website.RateLimit`). */
    Politeness?: CrawlRateLimitOptions;
    /** A page last modified at or before this (its sitemap `lastmod`, or its `Last-Modified`) is not reported; its links are still followed. */
    Since?: Date | null;
    /** Stop between pages at this time and return a resume token. */
    Deadline?: Date | null;
    Signal: AbortSignal;
    /** How the crawl waits (backoff, pacing, the delay). Default: a timer the signal cuts short. Tests pass a fake. */
    Sleep?: (ms: number) => Promise<void>;
    /** The clock the rate limiter paces by (epoch ms); tests pass a fake that {@link Sleep} advances. */
    Now?: () => number;
}

/** One page the crawl found. */
export interface CrawlFound {
    URL: string;
    /** The sitemap's `lastmod`, or the page's `Last-Modified`, when known. */
    LastModified?: Date;
}

/** A page still to read: its URL, depth, {@link QueueFlags} and the sitemap's `lastmod` (epoch ms, 0 when none). */
type QueueEntry = [url: string, depth: number, flags: number, lastModified: number];

/** Bits of a {@link QueueEntry}'s flags. */
const QueueFlags = {
    /** Fetched (to know it is alive) but its links are not read: a sibling path. */
    NoLinks: 1,
    /** Not reported: a sitemap page unchanged since the last walk. Its links are still read. */
    Silent: 2,
    /** Already put back once after a failure; the next failure is final. */
    Retried: 4,
} as const;

/** What a crawl that stopped early hands back, and gets again to carry on. */
interface CrawlState {
    v: 2;
    /** Pages still to read. */
    Queue: QueueEntry[];
    /** Every URL (identity) found so far, so nothing is fetched or reported twice across the walk's parts. */
    Seen: string[];
    /** How many pages have had their links read (what `MaxPages` limits). */
    Read: number;
    SitemapsDone: boolean;
    /** Identities reported (with their canonical and redirect aliases), kept only when dedup is on. */
    Identities?: string[];
    /** Distinct query strings followed per path, kept only with a `LoopLimit`. */
    QueryCounts?: Record<string, number>;
    /** The sitemaps still to read and those read, while a walk stopped part-way through reading them. */
    Sitemaps?: { Pending: string[]; Read: string[] };
}

/** The token version this crawler writes; a token of any other version restarts the walk. */
const CRAWL_STATE_VERSION = 2;

/** The most sitemap files one walk reads (an index can point at many). */
const MAX_SITEMAPS = 50;

/** What fetching one page came to. */
type PageOutcome =
    | { Kind: 'Alive'; Page: CrawlPage }
    | { Kind: 'Dead'; Status: number }
    | { Kind: 'Retry'; Reason: string }
    | { Kind: 'Unknown'; Reason: string };

/** What a live HTML page holds for the crawl. */
export interface ParsedPage {
    Links: { URL: string; Follow: boolean }[];
    Canonical: string | null;
}

/**
 * How the crawl backs off and paces a host that rate-limits it (`Website.RateLimit`). Every field is optional. The
 * pacing is network-utils' `RateLimiter`, one bucket per host; the retries are its `WithRetry`.
 */
export interface CrawlRateLimitOptions {
    /** How many times a rate-limited fetch is retried. Default 3. */
    MaxRetries?: number;
    /** The first backoff wait, in ms; it doubles with each retry (with jitter). Default 2000. */
    BackoffMs?: number;
    /** The longest any one wait may be, in ms. Default 60000. */
    MaxBackoffMs?: number;
    /** The most requests a second to one host; a host that rate-limits the crawl is halved, then recovers. Default 10. */
    RequestsPerSecond?: number;
    /** The slowest a rate-limited host is paced, in requests a second. Default 0.5. */
    MinRequestsPerSecond?: number;
}

/** Retries of a rate-limited fetch when the source sets none: enough to ride out a typical CDN window. */
const DEFAULT_CRAWL_MAX_RETRIES = 3;
/** First backoff when the source sets none, in ms: 2s, doubled per retry (2s, 4s, 8s). */
const DEFAULT_CRAWL_BACKOFF_MS = 2_000;
/** Cap on any one wait when the source sets none, in ms: a minute; longer than that and the walk's deadline is the better judge. */
const DEFAULT_CRAWL_MAX_BACKOFF_MS = 60_000;
/** Jitter added to each backoff, as a fraction of it, so parallel fetches do not retry in step. */
const CRAWL_BACKOFF_JITTER = 0.5;
/** Per-host ceiling when the source sets none, in requests a second: far above a polite crawl's pace, so an unlimited host is not slowed in practice. */
const DEFAULT_CRAWL_REQUESTS_PER_SECOND = 10;
/** The slowest a rate-limited host is paced when the source sets none: one request every two seconds. */
const DEFAULT_CRAWL_MIN_REQUESTS_PER_SECOND = 0.5;

/** Thrown inside a fetch attempt when the host asked the crawl to slow down, so `WithRetry` retries it. */
class RateLimitedAnswer extends Error {
    constructor(
        public readonly Status: number,
        public readonly RetryAfterMs: number | undefined,
    ) {
        super(`rate-limited (${Status})`);
    }
}

export class WebsiteCrawl {
    private readonly scope: CrawlScope;
    private readonly limiter: RateLimiter;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly seedKey: string;

    /**
     * A subclass changes what one page is and which pages are visited ({@link CreateScope}), how a host is paced
     * ({@link CreateRateLimiter}) or how a page's links are read ({@link ParsePage}); the walk itself is the same.
     */
    constructor(
        protected readonly options: CrawlOptions,
        protected readonly fetchers: CrawlFetchers,
    ) {
        this.sleep = options.Sleep ?? ((ms) => AbortableDelay(ms, options.Signal));
        this.scope = this.CreateScope(options);
        this.limiter = this.CreateRateLimiter(options, this.sleep);
        this.seedKey = this.scope.Key(this.scope.Clean(options.SeedURL));
    }

    /** What one page is and which pages are visited. Called from the constructor: an override must not read its own fields. */
    protected CreateScope(options: CrawlOptions): CrawlScope {
        return new CrawlScope(options);
    }

    /** How each host is paced: one bucket per host. Called from the constructor, like {@link CreateScope}. */
    protected CreateRateLimiter(options: CrawlOptions, sleep: (ms: number) => Promise<void>): RateLimiter {
        return new RateLimiter({
            TokensPerSec: options.Politeness?.RequestsPerSecond ?? DEFAULT_CRAWL_REQUESTS_PER_SECOND,
            MinTokensPerSec: options.Politeness?.MinRequestsPerSecond ?? DEFAULT_CRAWL_MIN_REQUESTS_PER_SECOND,
            now: options.Now,
            sleep,
        });
    }

    /**
     * Crawl, yielding each live page as it is read. Returns `{ ResumeToken }` when it stopped at the deadline with
     * pages still to read, and nothing when it is finished (or stopped by the signal). Each
     * part reads at least one page before it stops for the deadline, so a walk always moves on.
     */
    public async *Run(resumeToken?: string | null): AsyncGenerator<CrawlFound, { ResumeToken?: string }, undefined> {
        const seed = this.scope.Clean(this.options.SeedURL);
        const state = resumeToken ? DecodeCrawlState(resumeToken) : this.freshState(seed);
        const seen = new Set(state.Seen);
        const identities = new Set(state.Identities ?? []);
        if (this.options.UseSitemaps && !state.SitemapsDone) {
            if (!(await this.seedFromSitemaps(state, seen))) {
                return this.options.Signal.aborted ? {} : { ResumeToken: EncodeCrawlState(this.snapshot(state, seen, identities)) };
            }
            state.SitemapsDone = true;
            delete state.Sitemaps;
        }
        let readThisPart = 0;
        while (state.Queue.length > 0) {
            if (this.options.Signal.aborted) {
                return {};
            }
            // Each part reads at least one page, so a walk whose budget is smaller than one page still moves on.
            if (readThisPart > 0 && this.pastDeadline()) {
                return { ResumeToken: EncodeCrawlState(this.snapshot(state, seen, identities)) };
            }
            const batch = state.Queue.splice(0, this.concurrency());
            const outcomes = await this.fetchBatch(batch, state);
            if (this.options.Signal.aborted) {
                return {}; // what was in flight when the walk was stopped is not reported
            }
            readThisPart += batch.length;
            for (const entry of batch) {
                const outcome = outcomes.get(entry);
                yield* outcome ? this.settle(entry, outcome, state, seen, identities) : this.reportUnchecked(entry, identities);
            }
            if (outcomes.size > 0 && this.options.DelayMs > 0 && state.Queue.length > 0) {
                await this.sleep(this.options.DelayMs).catch(() => undefined); // a stopped walk ends at the loop's check
            }
        }
        return {};
    }

    /**
     * Fetch a batch's pages at once, each entry decided on its own: with `CheckLeafPages` off, a page whose links will
     * not be read is not fetched (it has no outcome, and is reported unchecked).
     */
    private async fetchBatch(batch: QueueEntry[], state: CrawlState): Promise<Map<QueueEntry, PageOutcome>> {
        const fetched = batch.filter(([, depth, flags]) => this.options.CheckLeafPages !== false || this.readsLinks(depth, flags, state));
        const outcomes = await Promise.all(fetched.map(([url]) => this.fetchPage(url)));
        return new Map(fetched.map((entry, i) => [entry, outcomes[i]]));
    }

    /**
     * A page whose links will not be read, reported as found, unfetched, for Extract to read (and fail, when it is
     * dead). One its sitemap dates at or before `Since` is not reported.
     */
    private *reportUnchecked(entry: QueueEntry, identities: Set<string>): Generator<CrawlFound, void, undefined> {
        const [url, , flags, lastModified] = entry;
        const modified = lastModified ? new Date(lastModified) : undefined;
        yield* this.report(url, url, null, this.isUnchanged(modified) ? flags | QueueFlags.Silent : flags, modified, identities);
    }

    /** Whether a page last modified at `modified` is unchanged since the walk's `Since`. */
    private isUnchanged(modified: Date | undefined): boolean {
        return !!(this.options.Since && modified && modified.getTime() <= this.options.Since.getTime());
    }

    private pastDeadline(): boolean {
        return !!this.options.Deadline && Date.now() >= this.options.Deadline.getTime();
    }

    private freshState(seed: string): CrawlState {
        return { v: CRAWL_STATE_VERSION, Queue: [[seed, 0, 0, 0]], Seen: [this.scope.Key(seed)], Read: 0, SitemapsDone: false };
    }

    private snapshot(state: CrawlState, seen: Set<string>, identities: Set<string>): CrawlState {
        return {
            ...state,
            Seen: [...seen],
            ...(identities.size > 0 ? { Identities: [...identities] } : {}),
        };
    }

    private concurrency(): number {
        const n = this.options.Concurrency;
        return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    }

    /** What one page came to: what it reports, what it queues, and whether it goes back for another try. */
    private *settle(
        entry: QueueEntry,
        outcome: PageOutcome,
        state: CrawlState,
        seen: Set<string>,
        identities: Set<string>,
    ): Generator<CrawlFound, void, undefined> {
        const [url, depth, flags, lastModified] = entry;
        if (outcome.Kind === 'Dead') {
            return;
        }
        if (outcome.Kind === 'Retry' || outcome.Kind === 'Unknown') {
            if (!(flags & QueueFlags.Retried)) {
                // Once more at the back of the queue, so a page limited or down for a moment keeps its links.
                state.Queue.push([url, depth, flags | QueueFlags.Retried, lastModified]);
                return;
            }
            // Not known dead: reported, for Extract (and its retry schedule) to decide.
            yield* this.report(url, url, null, flags, lastModified ? new Date(lastModified) : undefined, identities);
            return;
        }
        const page = outcome.Page;
        const finalURL = this.scope.Clean(page.FinalURL || url);
        // A link that redirects out of the crawl (another site, an excluded page) is neither reported nor read. The
        // start page is the source's own address, wherever it lands.
        if (depth > 0 && finalURL !== url && !this.mayLandOn(finalURL)) {
            return;
        }
        if (this.scope.DedupRedirects && finalURL !== url) {
            seen.add(this.scope.Key(finalURL));
        }
        const html = IsHtmlContentType(page.ContentType);
        const parsed = html ? this.ParsePage(page, depth === 0 && this.options.SiblingFanOut) : null;
        const modified = lastModified ? new Date(lastModified) : this.lastModifiedOf(page);
        const reportFlags = this.isUnchanged(modified) ? flags | QueueFlags.Silent : flags;
        const duplicate = yield* this.report(url, finalURL, parsed?.Canonical ?? null, reportFlags, modified, identities);
        // A duplicate's links are the page it duplicates; it is not read, and does not count toward MaxPages.
        if (!duplicate && parsed && this.readsLinks(depth, flags, state)) {
            state.Read++;
            this.enqueueLinks(parsed, depth, state, seen);
        }
    }

    /** Whether a page may be where a link ended up after its redirects: in scope, matching the pattern, and visited. */
    private mayLandOn(finalURL: string): boolean {
        return this.options.Pattern.test(finalURL) && this.scope.MayVisit(finalURL) && (this.scope.UnderRoot(finalURL, this.options.RootURL) || this.underSiblingRoot(finalURL));
    }

    /** Whether a URL is one of the start page's sibling paths, when the crawl takes them. */
    private underSiblingRoot(url: string): boolean {
        return this.options.SiblingFanOut && this.scope.UnderRoot(url, SiblingRoot(this.options.SeedURL));
    }

    /**
     * Report a page, unless it is a duplicate of one already found, silent, or out of the results. Returns whether it
     * was a duplicate. A silent or excluded page's identities are still kept, so a page whose canonical names it (on an
     * incremental walk, where it is silent) is known for a duplicate.
     */
    private *report(
        url: string,
        finalURL: string,
        canonical: string | null,
        flags: number,
        lastModified: Date | undefined,
        identities: Set<string>,
    ): Generator<CrawlFound, boolean, undefined> {
        if (this.scope.Dedups && !this.claimIdentity(url, finalURL, canonical, identities)) {
            return true;
        }
        if (flags & QueueFlags.Silent || !this.scope.MayReport(url)) {
            return false;
        }
        yield lastModified ? { URL: url, LastModified: lastModified } : { URL: url };
        return false;
    }

    /** Record a page's identities (itself, its redirect target, its canonical); false when one was already found. */
    private claimIdentity(url: string, finalURL: string, canonical: string | null, identities: Set<string>): boolean {
        const own = this.scope.Key(url);
        const aliases: string[] = [];
        if (this.scope.DedupRedirects && finalURL !== url) {
            aliases.push(this.scope.Key(finalURL));
        }
        if (this.scope.DedupCanonical && canonical) {
            const key = this.scope.Key(canonical);
            // A template that names the home page as every page's canonical would make every page a duplicate.
            if (!(key === this.seedKey && own !== this.seedKey)) {
                aliases.push(key);
            }
        }
        if ([own, ...aliases].some((k) => identities.has(k))) {
            return false;
        }
        identities.add(own);
        aliases.forEach((k) => identities.add(k));
        return true;
    }

    /**
     * Whether a live page has its links read: following links, within `MaxDepth`, not a sibling path, and while the
     * walk has read the links of fewer than `MaxPages` pages. Past `MaxPages` the pages already queued are still
     * fetched and reported (as the links of the pages read were reported before), but no new links are taken.
     */
    private readsLinks(depth: number, flags: number, state: CrawlState): boolean {
        const maxPages = this.options.MaxPages;
        // 0 or less is no limit, as unset is (a limit of no pages would read nothing past the start page's own fetch).
        const underLimit = typeof maxPages !== 'number' || !Number.isFinite(maxPages) || maxPages <= 0 || state.Read < maxPages;
        return this.options.FollowLinks && depth <= this.options.MaxDepth && !(flags & QueueFlags.NoLinks) && underLimit;
    }

    /** Queue a page's new links one level deeper; they are fetched in turn (and read, while within `MaxDepth`). */
    private enqueueLinks(parsed: ParsedPage, depth: number, state: CrawlState, seen: Set<string>): void {
        for (const link of parsed.Links) {
            const key = this.scope.Key(link.URL);
            if (seen.has(key) || !this.scope.MayVisit(link.URL) || !this.withinLoopLimit(link.URL, state)) {
                continue;
            }
            seen.add(key);
            state.Queue.push([link.URL, depth + 1, link.Follow ? 0 : QueueFlags.NoLinks, 0]);
        }
    }

    /** Count a new query string on its path; past `LoopLimit` distinct ones, the path is a generated listing. */
    private withinLoopLimit(url: string, state: CrawlState): boolean {
        const limit = this.scope.LoopLimit;
        const queryAt = url.indexOf('?');
        if (limit === null || queryAt < 0) {
            return true;
        }
        const path = this.scope.Key(url.slice(0, queryAt));
        const counts = (state.QueryCounts ??= {});
        const count = (counts[path] ?? 0) + 1;
        if (count > limit) {
            return false;
        }
        counts[path] = count;
        return true;
    }

    /** Fetch a page politely (see `politely`), then classify it. */
    private async fetchPage(url: string): Promise<PageOutcome> {
        const page = await this.politely(url, () => this.fetchers.Page(url));
        if (page === 'limited') {
            return { Kind: 'Retry', Reason: 'still rate-limited after its retries' };
        }
        return page ? this.classify(page) : { Kind: 'Unknown', Reason: 'no response' };
    }

    /**
     * One fetch through the host's rate limiter, a rate-limited answer (429, or 503 with `Retry-After`) retried after
     * the longer of what the host asks and the backoff, the host slowed meanwhile. Returns the answer, `'limited'` when
     * it is still limited after the retries, or null when there was no answer (or the walk was stopped).
     */
    private async politely(url: string, fetch: () => Promise<CrawlPage | null>): Promise<CrawlPage | null | 'limited'> {
        const host = this.hostOf(url);
        const maxBackoffMs = this.retryConfig().MaxBackoffMs;
        try {
            return await WithRetry(
                async () => {
                    await this.limiter.Acquire(host);
                    const answer = await fetch();
                    if (answer && IsRateLimitedAnswer(answer)) {
                        throw new RateLimitedAnswer(answer.Status, ParseRetryAfterValue(answer.Headers?.['retry-after']));
                    }
                    if (answer && IsRealAnswer(answer)) {
                        this.limiter.ReportSuccess(host); // a timeout, a server error or a challenge is no sign the host has recovered
                    }
                    return answer;
                },
                this.retryConfig(),
                (error) => error instanceof RateLimitedAnswer && !this.options.Signal.aborted,
                (_attempt, error) => this.limiter.ReportThrottle(host, CappedWait((error as RateLimitedAnswer).RetryAfterMs, maxBackoffMs)),
                {
                    // Never sooner than the backoff, even when Retry-After says 0: the burst is what got the crawl limited.
                    DelayForError: (error, _attempt, backoffMs) => Math.min(maxBackoffMs, Math.max((error as RateLimitedAnswer).RetryAfterMs ?? 0, backoffMs)),
                    Sleep: this.sleep,
                },
            );
        } catch (error) {
            if (error instanceof RateLimitedAnswer) {
                this.limiter.ReportThrottle(host, CappedWait(error.RetryAfterMs, maxBackoffMs));
                return 'limited';
            }
            if (this.options.Signal.aborted) {
                return null;
            }
            throw error;
        }
    }

    /** `Website.RateLimit` as `WithRetry`'s configuration. */
    private retryConfig(): RetryConfig {
        const limits = this.options.Politeness ?? {};
        return {
            MaxAttempts: NonNegative(limits.MaxRetries, DEFAULT_CRAWL_MAX_RETRIES) + 1,
            InitialBackoffMs: NonNegative(limits.BackoffMs, DEFAULT_CRAWL_BACKOFF_MS),
            MaxBackoffMs: NonNegative(limits.MaxBackoffMs, DEFAULT_CRAWL_MAX_BACKOFF_MS),
            JitterFraction: CRAWL_BACKOFF_JITTER,
        };
    }

    /** Alive (2xx), dead (a lasting client error, or refused by the SSRF guard), or not known (a challenge, a server error, a timeout). */
    private classify(page: CrawlPage): PageOutcome {
        const status = page.Status;
        if (page.Blocked) {
            return { Kind: 'Dead', Status: status };
        }
        if (page.Headers?.['cf-mitigated']) {
            return { Kind: 'Unknown', Reason: `a bot challenge (cf-mitigated: ${page.Headers['cf-mitigated']})` };
        }
        if (status >= 200 && status < 300) {
            return { Kind: 'Alive', Page: page };
        }
        if (status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429) {
            return { Kind: 'Dead', Status: status };
        }
        return { Kind: 'Unknown', Reason: `status ${status}` };
    }

    private hostOf(url: string): string {
        try {
            return new URL(url).host;
        } catch {
            return url;
        }
    }

    /** The page's `Last-Modified`, when it sent a readable one. */
    private lastModifiedOf(page: CrawlPage): Date | undefined {
        const header = page.Headers?.['last-modified'];
        const parsed = header ? new Date(header) : undefined;
        return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
    }

    /**
     * The page's in-scope links (with its sibling paths, unfollowed, for the start page when asked) and its canonical.
     * A subclass reads links its own way (links a script builds, a form's action) and may call this for the rest.
     */
    protected ParsePage(page: CrawlPage, siblings: boolean): ParsedPage {
        const $ = cheerio.load(page.Html);
        const base = page.FinalURL;
        const self = this.scope.Key(this.scope.Clean(base));
        const links: { URL: string; Follow: boolean }[] = [];
        $('a[href]').each((_, element) => {
            const url = this.Resolve($(element).attr('href'), base);
            if (!url || this.scope.Key(url) === self || !/^https?:/i.test(url) || !this.options.Pattern.test(url)) {
                return;
            }
            if (this.scope.UnderRoot(url, this.options.RootURL)) {
                links.push({ URL: url, Follow: true });
            } else if (siblings && this.underSiblingRoot(url)) {
                links.push({ URL: url, Follow: false });
            }
        });
        const canonicalHref = $('link[rel]')
            .filter((_, el) => ($(el).attr('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical'))
            .first()
            .attr('href');
        return { Links: links, Canonical: this.Resolve(canonicalHref, base) };
    }

    /** An href resolved against the page and cleaned, or null when it is not a URL. */
    protected Resolve(href: string | undefined, base: string): string | null {
        if (!href) {
            return null;
        }
        try {
            return this.scope.Clean(new URL(href, base).href);
        } catch {
            return null;
        }
    }

    /**
     * Queue each in-scope page the site's sitemaps list; each is fetched and reported like any other page. Returns
     * false when it stopped before reading them all (the signal, or the deadline once it has read one): what is left
     * is in the state, for the next part.
     */
    private async seedFromSitemaps(state: CrawlState, seen: Set<string>): Promise<boolean> {
        const progress = (state.Sitemaps ??= { Pending: await this.firstSitemaps(), Read: [] });
        let readThisPart = 0;
        while (progress.Pending.length > 0 && progress.Read.length < MAX_SITEMAPS) {
            if (this.options.Signal.aborted || (readThisPart > 0 && this.pastDeadline())) {
                return false;
            }
            const sitemapURL = progress.Pending.shift()!;
            if (progress.Read.includes(sitemapURL)) {
                continue;
            }
            progress.Read.push(sitemapURL);
            readThisPart++;
            const xml = await this.readText(sitemapURL, IsSitemapContentType);
            if (!xml) {
                continue;
            }
            const parsed = ParseSitemap(xml);
            progress.Pending.push(...this.sameSiteSitemaps(parsed.Sitemaps));
            for (const entry of parsed.Pages) {
                this.enqueueSitemapPage(entry, state, seen);
            }
        }
        return !this.options.Signal.aborted;
    }

    /** The sitemaps to start from: those the source lists (wherever they are), else those the site names. */
    private async firstSitemaps(): Promise<string[]> {
        const listed = this.options.SitemapURLs?.filter((u) => typeof u === 'string' && u.trim().length > 0) ?? [];
        return listed.length > 0 ? listed.map((u) => NormalizeCrawlURL(u.trim())) : this.discoverSitemaps();
    }

    /** The sitemap URLs a site named that are on the start page's own site, normalized (no fragment). */
    private sameSiteSitemaps(urls: readonly string[]): string[] {
        const site = `${new URL(this.options.SeedURL).origin}/`;
        return urls.map((u) => NormalizeCrawlURL(u)).filter((u) => this.scope.UnderRoot(u, site));
    }

    private enqueueSitemapPage(entry: { URL: string; LastModified?: Date }, state: CrawlState, seen: Set<string>): void {
        const url = this.scope.Clean(entry.URL);
        const key = this.scope.Key(url);
        if (seen.has(key) || !this.scope.UnderRoot(url, this.options.RootURL) || !this.options.Pattern.test(url) || !this.scope.MayVisit(url)) {
            return;
        }
        if (!this.withinLoopLimit(url, state)) {
            return;
        }
        seen.add(key);
        state.Queue.push([url, 1, this.isUnchanged(entry.LastModified) ? QueueFlags.Silent : 0, entry.LastModified?.getTime() ?? 0]);
    }

    /**
     * A text resource, politely: a rate-limited answer is retried like a page. Null unless it answered 200 with a
     * content type `accepts` takes.
     */
    private async readText(url: string, accepts: (contentType: string | undefined) => boolean): Promise<string | null> {
        const answer = await this.politely(url, async () => {
            const text = await this.fetchers.Text(url);
            return typeof text === 'string' ? { Html: text, FinalURL: url, Status: 200 } : text;
        });
        if (!answer || answer === 'limited' || answer.Blocked || answer.Status !== 200) {
            return null;
        }
        return accepts(answer.ContentType) ? answer.Html : null;
    }

    /** The sitemaps robots.txt names on the start page's own site, else the conventional /sitemap.xml. */
    private async discoverSitemaps(): Promise<string[]> {
        const origin = new URL(this.options.SeedURL).origin;
        const robots = await this.readText(`${origin}/robots.txt`, (type) => !IsHtmlType(type));
        const listed = (robots ?? '')
            .split(/\r?\n/)
            .map((line) => /^\s*sitemap\s*:\s*(\S+)/i.exec(line)?.[1])
            .filter((url): url is string => !!url);
        const sameSite = this.sameSiteSitemaps(listed);
        return sameSite.length > 0 ? sameSite : [`${origin}/sitemap.xml`];
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
    return NormalizeCrawlURL(href);
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

/**
 * A token back to the crawl's state.
 * @throws When it is not one this crawl wrote, including a token from an earlier version of the crawler (whose
 *   queue held pages already reported unread); the caller starts the walk again.
 */
export function DecodeCrawlState(token: string): CrawlState {
    const state = JSON.parse(gunzipSync(Buffer.from(token, 'base64')).toString('utf8')) as CrawlState;
    if (!state || typeof state !== 'object' || !Array.isArray(state.Queue) || !Array.isArray(state.Seen)) {
        throw new Error('the website crawl resume token is not one this crawler wrote');
    }
    if (state.v !== CRAWL_STATE_VERSION) {
        throw new Error(`the website crawl resume token is version ${String(state.v)}, written by an earlier crawler; this one writes version ${CRAWL_STATE_VERSION}`);
    }
    return state;
}

/** Whether an answer is the host really answering (2xx or 3xx, not a challenge or a refusal): what lets its pace recover. */
function IsRealAnswer(page: CrawlPage): boolean {
    return !page.Blocked && page.Status >= 200 && page.Status < 400 && !page.Headers?.['cf-mitigated'];
}

/** A host's requested wait, no longer than `maxMs`; undefined when it asked none. */
function CappedWait(ms: number | undefined, maxMs: number): number | undefined {
    return ms === undefined ? undefined : Math.min(ms, maxMs);
}

/** The media type of a `Content-Type`, lower-cased, without its parameters; '' when unset. */
function MediaType(contentType: string | undefined): string {
    return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

/** Whether a `Content-Type` names an HTML page (an unset one does not). */
function IsHtmlType(contentType: string | undefined): boolean {
    const type = MediaType(contentType);
    return type === 'text/html' || type === 'application/xhtml+xml';
}

/** Whether a `Content-Type` may be a sitemap: unset, XML of any kind (not XHTML), or plain text. */
function IsSitemapContentType(contentType: string | undefined): boolean {
    const type = MediaType(contentType);
    return type.length === 0 || type === 'text/plain' || (!IsHtmlType(type) && (type.endsWith('/xml') || type.endsWith('+xml')));
}

/** A non-negative number, else `fallback`. */
function NonNegative(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}
