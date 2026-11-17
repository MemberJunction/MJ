/**
 * @fileoverview The website crawl behind Discover (5.9): scope and depth, sitemap seeding, and walks in parts.
 *
 * The crawl reads the web only through the fetchers it is given, so an in-memory site stands in for one here.
 * A walk stopped at its deadline hands back its frontier and what it has seen; carried on from that token it
 * finds exactly what one uninterrupted walk finds, with nothing reported twice.
 */
import { describe, expect, it } from 'vitest';
import { CrawlFetchers, CrawlOptions, DecodeCrawlState, ParseSitemap, WebsiteCrawl } from '../Websites/generic/WebsiteCrawl';

const ROOT = 'https://site.test/docs';

/** A site as `path: [links]`, every page under /docs linking where it says. */
const SITE: Record<string, string[]> = {
    '/docs/start': ['/docs/a', '/docs/b', '/docs/a#section', 'https://elsewhere.test/x', '/blog/post', '/docs/skip.pdf'],
    '/docs/a': ['/docs/a1', '/docs/start'],
    '/docs/b': ['/docs/b1', '/docs/missing'],
    '/docs/a1': ['/docs/a2'],
    '/docs/b1': [],
    '/docs/a2': ['/docs/a3'],
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

        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b'), at('/docs/a1'), at('/docs/b1'), at('/docs/missing')]);
        // Depth 0 and 1 are read; the depth-2 pages are found but not read.
        expect(reads).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
        expect(token).toBeUndefined();
    });

    it('leaves out other sites, other paths, fragments of found pages and what the pattern refuses', async () => {
        const { found } = await drain(new WebsiteCrawl(options({ MaxDepth: 0 }), fetchers()));
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
    });

    it('reads no page when following links is off', async () => {
        const reads: string[] = [];
        const { found } = await drain(new WebsiteCrawl(options({ FollowLinks: false }), fetchers({}, reads)));
        expect(found).toEqual([at('/docs/start')]);
        expect(reads).toEqual([]);
    });

    it("takes the start page's sibling paths when asked, without following them", async () => {
        const reads: string[] = [];
        const { found } = await drain(new WebsiteCrawl(options({ MaxDepth: 0, SiblingFanOut: true, RootURL: `${ROOT}/a` }), fetchers({}, reads)));
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
        expect(reads).toEqual([at('/docs/start')]);
    });

    it('stops reading pages at MaxPages', async () => {
        const reads: string[] = [];
        await drain(new WebsiteCrawl(options({ MaxDepth: 5, MaxPages: 2 }), fetchers({}, reads)));
        expect(reads).toHaveLength(2);
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
        expect(found).toEqual([at('/docs/start'), at('/docs/a'), at('/docs/b')]);
        expect(state.Read).toBe(1);
        expect(state.Queue).toEqual([
            [at('/docs/a'), 1],
            [at('/docs/b'), 1],
        ]);
        expect(state.Seen).toEqual(found);
    });

    it('refuses a token it did not write', () => {
        expect(() => DecodeCrawlState('bm90IGEgdG9rZW4=')).toThrow();
    });
});
