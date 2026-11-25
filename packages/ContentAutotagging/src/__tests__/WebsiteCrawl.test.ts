/**
 * @fileoverview The website crawl behind Discover (5.9): scope and depth, sitemap seeding, and walks in parts.
 *
 * The crawl reads the web only through the fetchers it is given, so an in-memory site stands in for one here.
 * A walk stopped at its deadline hands back its frontier and what it has seen; carried on from that token it
 * finds exactly what one uninterrupted walk finds, with nothing reported twice.
 */
import { describe, expect, it } from 'vitest';
import { CrawlFetchers, CrawlOptions, CrawlPage, DecodeCrawlState, EncodeCrawlState, ParseSitemap, WebsiteCrawl } from '../Websites/generic/WebsiteCrawl';
import { CrawlScope, IsCalendarURL } from '../Websites/generic/CrawlScope';

const ROOT = 'https://site.test/docs';

/** A site as `path: [links]`, every page under /docs linking where it says. */
const SITE: Record<string, string[]> = {
    '/docs/start': ['/docs/a', '/docs/b', '/docs/a#section', 'https://elsewhere.test/x', '/blog/post', '/docs/skip.pdf'],
    '/docs/a': ['/docs/a1', '/docs/start'],
    '/docs/b': ['/docs/b1', '/docs/missing'],
    '/docs/a1': ['/docs/a2'],
    '/docs/b1': [],
    '/docs/a2': ['/docs/a3'],
    '/docs/a3': [],
};

function page(links: string[]): string {
    return `<html><body>${links.map((l) => `<a href="${l}">x</a>`).join('')}</body></html>`;
}

function fetchers(text: Record<string, string> = {}, reads: string[] = []): CrawlFetchers {
    return {
        Page: async (url: string) => {
            reads.push(url);
            const path = new URL(url).pathname;
            return SITE[path] ? { Html: page(SITE[path]), FinalURL: url, Status: 200 } : { Html: 'gone', FinalURL: url, Status: 404 };
        },
        Text: async (url: string) => text[url] ?? null,
    };
}

function options(overrides: Partial<CrawlOptions> = {}): CrawlOptions {
    return {
        SeedURL: `${ROOT}/start`,
        RootURL: ROOT,
        Pattern: /^(?!.*\.pdf$)/,
        MaxDepth: 1,
        FollowLinks: true,
        SiblingFanOut: false,
        UseSitemaps: false,
        DelayMs: 0,
        Signal: new AbortController().signal,
        ...overrides,
    };
}

/** Drain a crawl: what it found, and the token it returned (if any). */
async function drain(crawl: WebsiteCrawl, token?: string | null): Promise<{ found: string[]; token?: string }> {
    const run = crawl.Run(token);
    const found: string[] = [];
    for (;;) {
        const next = await run.next();
        if (next.done) {
            return { found, token: (next.value as { ResumeToken?: string }).ResumeToken };
        }
        found.push((next.value as { URL: string }).URL);
    }
}

const at = (path: string) => `https://site.test${path}`;

describe('the crawl', () => {
    it('finds in-scope pages breadth-first, reading links down to MaxDepth', async () => {
        const reads: string[] = [];
        const { found, token } = await drain(new WebsiteCrawl(options(), fetchers({}, reads)));

        // /docs/missing answers 404: fetched, found dead, never reported.
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b'), at('/docs/a1'), at('/docs/b1')]);
        // Depth 0 and 1 have their links read; the depth-2 pages are fetched (to know they are alive), not read.
        expect(reads).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b'), at('/docs/a1'), at('/docs/b1'), at('/docs/missing')]);
        expect(token).toBeUndefined();
    });

    it('leaves out other sites, other paths, fragments of found pages and what the pattern refuses', async () => {
        const { found } = await drain(new WebsiteCrawl(options({ MaxDepth: 0 }), fetchers()));
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
    });

    it("reads no page's links when following links is off (the start page is still fetched, to know it is alive)", async () => {
        const reads: string[] = [];
        const { found } = await drain(new WebsiteCrawl(options({ FollowLinks: false }), fetchers({}, reads)));
        expect(found).toEqual([at('/docs/start')]);
        expect(reads).toEqual([at('/docs/start')]);
    });

    it("takes the start page's sibling paths when asked, without following them", async () => {
        const reads: string[] = [];
        const { found } = await drain(new WebsiteCrawl(options({ MaxDepth: 0, SiblingFanOut: true, RootURL: `${ROOT}/a` }), fetchers({}, reads)));
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
        // The sibling paths are fetched to know they are alive, but their links are not followed.
        expect(reads).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
    });

    it('with CheckLeafPages off, reports the pages whose links it will not read unfetched, dead ones included', async () => {
        const reads: string[] = [];
        const { found } = await drain(new WebsiteCrawl(options({ MaxDepth: 0, CheckLeafPages: false }), fetchers({}, reads)));
        // start is read for its links; a and b (one level past MaxDepth) are reported as found, never fetched.
        expect(reads).toEqual([at('/docs/start')]);
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
    });

    it('by default fetches those pages to know they are alive, so a dead one is not reported', async () => {
        const reads: string[] = [];
        const { found } = await drain(new WebsiteCrawl(options({ MaxDepth: 1 }), fetchers({}, reads)));
        expect(reads).toContain(at('/docs/missing'));
        expect(found).not.toContain(at('/docs/missing'));
    });

    it('reads the links of at most MaxPages pages, and still checks and reports the pages they linked to', async () => {
        const reads: string[] = [];
        const { found } = await drain(new WebsiteCrawl(options({ MaxDepth: 5, MaxPages: 2 }), fetchers({}, reads)));
        // start and a have their links read (2 pages); b and a1, already found, are fetched and reported, unread.
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b'), at('/docs/a1')]);
        expect(reads).not.toContain(at('/docs/b1'));
        expect(reads).not.toContain(at('/docs/a2'));
    });
});

describe('sitemaps', () => {
    const robots = 'User-agent: *\nSitemap: https://site.test/sitemap-index.xml\n';
    const index = '<sitemapindex><sitemap><loc>https://site.test/sitemap-docs.xml</loc></sitemap></sitemapindex>';
    const docs =
        '<urlset>' +
        '<url><loc>https://site.test/docs/b1</loc><lastmod>2026-05-01</lastmod></url>' +
        '<url><loc>https://site.test/docs/a2</loc><lastmod>2025-01-01</lastmod></url>' +
        '<url><loc>https://site.test/blog/post</loc></url>' +
        '</urlset>';
    const text = {
        'https://site.test/robots.txt': robots,
        'https://site.test/sitemap-index.xml': index,
        'https://site.test/sitemap-docs.xml': docs,
    };

    it('parses a sitemap and a sitemap index', () => {
        expect(ParseSitemap(index).Sitemaps).toEqual(['https://site.test/sitemap-docs.xml']);
        expect(ParseSitemap(docs).Pages[0]).toEqual({ URL: 'https://site.test/docs/b1', LastModified: new Date('2026-05-01') });
    });

    it("seeds the crawl from the sitemaps robots.txt names, following an index, in scope only", async () => {
        const { found } = await drain(new WebsiteCrawl(options({ UseSitemaps: true, MaxDepth: 0 }), fetchers(text)));
        expect(found.slice(0, 3)).toEqual([at('/docs/start'), at('/docs/b1'), at('/docs/a2')]);
        expect(found).not.toContain(at('/blog/post'));
    });

    it('does not report a sitemap page unchanged since the last walk, but still follows its links', async () => {
        const { found } = await drain(new WebsiteCrawl(options({ UseSitemaps: true, Since: new Date('2026-01-01') }), fetchers(text)));
        expect(found).toContain(at('/docs/b1'));
        expect(found).not.toContain(at('/docs/a2'));
        expect(found).toContain(at('/docs/a3')); // a2's own link
    });

    it('reads the sitemaps it is given instead of robots.txt', async () => {
        const { found } = await drain(new WebsiteCrawl(options({ UseSitemaps: true, SitemapURLs: ['https://site.test/sitemap-docs.xml'], FollowLinks: false }), fetchers(text)));
        expect(found).toEqual([at('/docs/start'), at('/docs/b1'), at('/docs/a2')]);
    });
});

describe('a walk in parts', () => {
    it('stops at its deadline with a token, and carried on finds exactly what one walk finds, nothing twice', async () => {
        const whole = await drain(new WebsiteCrawl(options({ MaxDepth: 3 }), fetchers()));

        const parts: string[] = [];
        let token: string | undefined | null = null;
        let walks = 0;
        do {
            // A deadline already passed: each part reads exactly one page, then hands back its token.
            const crawl = new WebsiteCrawl(options({ MaxDepth: 3, Deadline: new Date(0) }), fetchers());
            const part = await drain(crawl, token);
            parts.push(...part.found);
            token = part.token;
            walks++;
        } while (token && walks < 20);

        expect(walks).toBeGreaterThan(1);
        expect(token).toBeUndefined();
        expect(parts).toEqual(whole.found);
        expect(new Set(parts).size).toBe(parts.length);
    });

    it('keeps the frontier and what was seen in the token', async () => {
        const { found, token } = await drain(new WebsiteCrawl(options({ Deadline: new Date(0) }), fetchers()));
        const state = DecodeCrawlState(token!);
        // Only the page read so far is reported; its links wait in the frontier, unreported until fetched.
        expect(found).toEqual([at('/docs/start')]);
        expect(state.v).toBe(2);
        expect(state.Read).toBe(1);
        expect(state.Queue).toEqual([
            [at('/docs/a'), 1, 0, 0],
            [at('/docs/b'), 1, 0, 0],
        ]);
        expect(state.Seen).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
    });

    it('refuses a token it did not write', () => {
        expect(() => DecodeCrawlState('bm90IGEgdG9rZW4=')).toThrow();
    });

    it("refuses an earlier crawler's version-1 token, so the walk starts again", () => {
        const v1 = EncodeCrawlState({ v: 1, Queue: [[at('/docs/a'), 1]], Seen: [at('/docs/start')], Read: 1, SitemapsDone: false } as unknown as ReturnType<typeof DecodeCrawlState>);
        expect(() => DecodeCrawlState(v1)).toThrow(/version 1/);
    });
});

/** A site as `url: answer`, for the crawl's live/dead/polite behaviour. An answer is a page or a function of the attempt. */
type Answer = Partial<CrawlPage> & { Links?: string[] };

function siteFetchers(answers: Record<string, Answer | ((attempt: number) => Answer)>, reads: string[] = []): CrawlFetchers {
    const attempts = new Map<string, number>();
    return {
        Page: async (url: string) => {
            reads.push(url);
            const attempt = attempts.get(url) ?? 0;
            attempts.set(url, attempt + 1);
            const spec = answers[url];
            const answer = typeof spec === 'function' ? spec(attempt) : spec;
            if (!answer) {
                return { Html: 'gone', FinalURL: url, Status: 404 };
            }
            return {
                Html: answer.Html ?? page(answer.Links ?? []),
                FinalURL: answer.FinalURL ?? url,
                Status: answer.Status ?? 200,
                ContentType: answer.ContentType,
                Headers: answer.Headers,
            };
        },
        Text: async () => null,
    };
}

/** A sleep that records what it was asked to wait and moves a fake clock on by it, returning at once. */
function fakeTime(waits: number[] = []): Pick<CrawlOptions, 'Sleep' | 'Now'> {
    let clock = 1_000_000;
    return {
        Sleep: async (ms: number) => {
            waits.push(ms);
            clock += ms;
        },
        Now: () => clock,
    };
}

describe('dead links are not items', () => {
    it('reports only pages fetched alive; a lasting client error is dead, a challenge is not', async () => {
        const reads: string[] = [];
        const { found } = await drain(
            new WebsiteCrawl(
                options({ ...fakeTime() }),
                siteFetchers(
                    {
                        [at('/docs/start')]: { Links: ['/docs/gone', '/docs/forbidden', '/docs/challenged', '/docs/ok'] },
                        [at('/docs/gone')]: { Status: 410 },
                        [at('/docs/forbidden')]: { Status: 403 },
                        [at('/docs/challenged')]: { Status: 403, Headers: { 'cf-mitigated': 'challenge' } },
                        [at('/docs/ok')]: {},
                    },
                    reads,
                ),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/ok'), at('/docs/challenged')]);
        // A dead page is fetched once; a challenged one is tried again at the back of the queue, then reported.
        expect(reads.filter((r) => r === at('/docs/gone'))).toHaveLength(1);
        expect(reads.filter((r) => r === at('/docs/challenged'))).toHaveLength(2);
    });

    it('tries a server error once more, keeping its links when it recovers', async () => {
        const { found } = await drain(
            new WebsiteCrawl(
                options({ ...fakeTime() }),
                siteFetchers({
                    [at('/docs/start')]: { Links: ['/docs/flaky'] },
                    [at('/docs/flaky')]: (attempt) => (attempt === 0 ? { Status: 502 } : { Links: ['/docs/child'] }),
                    [at('/docs/child')]: {},
                }),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/flaky'), at('/docs/child')]);
    });

    it('reports a file that is not HTML without reading it for links', async () => {
        const { found } = await drain(
            new WebsiteCrawl(
                options({ Pattern: /.*/, ...fakeTime() }),
                siteFetchers({
                    [at('/docs/start')]: { Links: ['/docs/guide.pdf'] },
                    [at('/docs/guide.pdf')]: { ContentType: 'application/pdf', Html: '<a href="/docs/never">x</a>' },
                }),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/guide.pdf')]);
    });

    it("does not report a page unchanged since the last walk by its Last-Modified, and says when it changed", async () => {
        const crawl = new WebsiteCrawl(
            options({ Since: new Date('2026-01-01'), ...fakeTime() }),
            siteFetchers({
                [at('/docs/start')]: { Links: ['/docs/old', '/docs/new'], Headers: { 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' } },
                [at('/docs/old')]: { Headers: { 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' } },
                [at('/docs/new')]: { Headers: { 'last-modified': 'Fri, 01 May 2026 00:00:00 GMT' } },
            }),
        );
        const run = crawl.Run();
        const found: { URL: string; LastModified?: Date }[] = [];
        for (let next = await run.next(); !next.done; next = await run.next()) {
            found.push(next.value);
        }
        // The start page is unchanged too, but its links were still read.
        expect(found).toEqual([{ URL: at('/docs/new'), LastModified: new Date('2026-05-01') }]);
    });
});

describe('politeness', () => {
    it('backs off a 429 as long as Retry-After asks, retries, and keeps the links', async () => {
        const waits: number[] = [];
        const { found } = await drain(
            new WebsiteCrawl(
                options({ ...fakeTime(waits), Politeness: { BackoffMs: 10 } }),
                siteFetchers({
                    [at('/docs/start')]: (attempt) => (attempt === 0 ? { Status: 429, Headers: { 'retry-after': '3' } } : { Links: ['/docs/a'] }),
                    [at('/docs/a')]: {},
                }),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/a')]);
        expect(Math.max(...waits)).toBeGreaterThanOrEqual(3000);
    });

    it('retries a 503 only when it carries Retry-After', async () => {
        const reads: string[] = [];
        await drain(
            new WebsiteCrawl(
                options({ ...fakeTime(), Politeness: { BackoffMs: 1 } }),
                siteFetchers(
                    {
                        [at('/docs/start')]: { Links: ['/docs/paused', '/docs/blocked'] },
                        [at('/docs/paused')]: (attempt) => (attempt === 0 ? { Status: 503, Headers: { 'retry-after': '1' } } : {}),
                        [at('/docs/blocked')]: { Status: 503 },
                    },
                    reads,
                ),
            ),
        );
        // paused: retried at once by the politeness; blocked: not retried there, only put back once at the end.
        expect(reads).toEqual([at('/docs/start'), at('/docs/paused'), at('/docs/paused'), at('/docs/blocked'), at('/docs/blocked')]);
    });

    it('puts a page still limited after its retries at the back of the queue rather than losing it', async () => {
        const reads: string[] = [];
        const { found } = await drain(
            new WebsiteCrawl(
                options({ ...fakeTime(), Politeness: { MaxRetries: 1, BackoffMs: 1 } }),
                siteFetchers(
                    {
                        [at('/docs/start')]: { Links: ['/docs/busy', '/docs/b'] },
                        [at('/docs/busy')]: (attempt) => (attempt < 2 ? { Status: 429 } : { Links: ['/docs/deep'] }),
                        [at('/docs/b')]: {},
                        [at('/docs/deep')]: {},
                    },
                    reads,
                ),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/b'), at('/docs/busy'), at('/docs/deep')]);
    });

    it("holds the whole host back after a 429, not just the page that got it (the shared rate limiter)", async () => {
        const waits: number[] = [];
        await drain(
            new WebsiteCrawl(
                options({ ...fakeTime(waits), Politeness: { BackoffMs: 1 } }),
                siteFetchers({
                    [at('/docs/start')]: { Links: ['/docs/a', '/docs/b'] },
                    [at('/docs/a')]: (attempt) => (attempt === 0 ? { Status: 429, Headers: { 'retry-after': '5' } } : {}),
                    [at('/docs/b')]: {},
                }),
            ),
        );
        // The retry of a waits out the 5 s; the host's bucket was frozen for it, so nothing reached the host sooner.
        expect(waits.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThanOrEqual(5000);
    });

    it('fetches up to Concurrency pages at a time and finds the same pages', async () => {
        let inFlight = 0;
        let peak = 0;
        const base = fetchers();
        const parallel: CrawlFetchers = {
            ...base,
            Page: async (url) => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                await new Promise((r) => setTimeout(r, 5));
                inFlight--;
                return base.Page(url);
            },
        };
        const serial = await drain(new WebsiteCrawl(options({ MaxDepth: 3 }), fetchers()));
        const together = await drain(new WebsiteCrawl(options({ MaxDepth: 3, Concurrency: 3 }), parallel));
        expect(peak).toBeGreaterThan(1);
        expect(peak).toBeLessThanOrEqual(3);
        expect(together.found).toEqual(serial.found);
    });
});

describe('URL normalization', () => {
    it('strips tracking parameters, and treats www/apex and http/https as one site', async () => {
        const { found } = await drain(
            new WebsiteCrawl(
                options({ StripTrackingParams: true, MergeWwwAndScheme: true, ...fakeTime() }),
                siteFetchers({
                    [at('/docs/start')]: {
                        Links: ['/docs/a?utm_source=x&id=1', '/docs/a?id=1&gclid=2', 'http://www.site.test/docs/a?id=1', 'https://www.site.test/docs/b'],
                    },
                    [at('/docs/a?id=1')]: {},
                    'https://www.site.test/docs/b': {},
                }),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/a?id=1'), 'https://www.site.test/docs/b']);
    });

    it('strips a configured list of parameters (a trailing * is a prefix)', () => {
        const scope = new CrawlScope({ StripQueryParams: ['ref', 'trk_*'] });
        expect(scope.Clean('https://x.test/p?ref=a&trk_id=1&keep=2')).toBe('https://x.test/p?keep=2');
    });

    it('does not report a page whose canonical names a page already reported', async () => {
        const { found } = await drain(
            new WebsiteCrawl(
                options({ DedupCanonical: true, ...fakeTime() }),
                siteFetchers({
                    [at('/docs/start')]: { Links: ['/docs/a', '/docs/a-print', '/docs/b'] },
                    [at('/docs/a')]: {},
                    [at('/docs/a-print')]: { Html: '<link rel="canonical" href="/docs/a">' },
                    // A template naming the start page as every page's canonical does not make b a duplicate.
                    [at('/docs/b')]: { Html: '<link rel="canonical" href="/docs/start">' },
                }),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
    });

    it('does not report two links that redirect to one page twice, nor read the target again', async () => {
        const reads: string[] = [];
        const { found } = await drain(
            new WebsiteCrawl(
                options({ DedupRedirects: true, MaxDepth: 2, ...fakeTime() }),
                siteFetchers(
                    {
                        [at('/docs/start')]: { Links: ['/docs/old', '/docs/older'] },
                        [at('/docs/old')]: { FinalURL: at('/docs/new'), Links: ['/docs/new'] },
                        [at('/docs/older')]: { FinalURL: at('/docs/new') },
                        [at('/docs/new')]: {},
                    },
                    reads,
                ),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/old')]);
        expect(reads).not.toContain(at('/docs/new'));
    });
});

describe('crawl traps and lists', () => {
    it('stops following a path past LoopLimit distinct query strings', async () => {
        const links = ['/docs/list?page=1', '/docs/list?page=2', '/docs/list?page=3', '/docs/list?page=4'];
        const answers: Record<string, Answer> = { [at('/docs/start')]: { Links: links } };
        links.forEach((l) => (answers[at(l)] = {}));
        const { found } = await drain(new WebsiteCrawl(options({ LoopLimit: 2, ...fakeTime() }), siteFetchers(answers)));
        expect(found).toEqual([at('/docs/start'), at('/docs/list?page=1'), at('/docs/list?page=2')]);
    });

    it('skips calendar paths when asked', async () => {
        const { found } = await drain(
            new WebsiteCrawl(
                options({ SkipCalendarPaths: true, ...fakeTime() }),
                siteFetchers({
                    [at('/docs/start')]: { Links: ['/docs/events/2026/05/01/', '/docs/events/2026-05-02', '/docs/a'] },
                    [at('/docs/a')]: {},
                }),
            ),
        );
        expect(found).toEqual([at('/docs/start'), at('/docs/a')]);
        expect(IsCalendarURL('https://x.test/cal/01-05-2026/')).toBe(true);
        expect(IsCalendarURL('https://x.test/docs/v2026')).toBe(false);
    });

    it('visits only included pages and none excluded; the start page is visited for its links but not reported when excluded', async () => {
        const { found } = await drain(
            new WebsiteCrawl(
                options({ IncludePatterns: ['/docs/a', 're:/docs/b\\d$'], ExcludePatterns: ['/docs/start', '/docs/a2'], MaxDepth: 3, ...fakeTime() }),
                siteFetchers({
                    [at('/docs/start')]: { Links: ['/docs/a', '/docs/b1', '/docs/b', '/docs/c'] },
                    [at('/docs/a')]: { Links: ['/docs/a1', '/docs/a2'] },
                    [at('/docs/a1')]: {},
                    [at('/docs/a2')]: {},
                    [at('/docs/b1')]: {},
                }),
            ),
        );
        expect(found).toEqual([at('/docs/a'), at('/docs/b1'), at('/docs/a1')]);
    });

    it('refuses an invalid re: pattern, naming it', () => {
        expect(() => new CrawlScope({ ExcludePatterns: ['re:('] })).toThrow(/re:\(/);
    });
});
