import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// The pure parsing/scoring module has no framework imports at all, so it needs
// no mocks. The action does — but only for the decorator and the loggers.
// ---------------------------------------------------------------------------
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            return (this as unknown as { InternalRunAction(p: unknown): Promise<unknown> }).InternalRunAction(params);
        }
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/actions-base', () => ({}));

import {
    RELEVANCE_WEIGHTS,
    computeRecencyScore,
    computeRelevanceScore,
    filterByAge,
    filterRelevant,
    parseFeedArticles,
    parseFeedDate,
    scoreAndRankArticles,
    stripHtml,
    type FeedArticle,
} from '../custom/web/rss-feed-parsing';
import { ReadRSSFeedAction } from '../custom/web/rss-feed-read.action';

const NOW = new Date('2026-08-05T12:00:00Z');

/** An article at a given age in days, with whatever fields the test cares about. */
function article(overrides: Partial<FeedArticle> & { ageDays?: number } = {}): FeedArticle {
    const { ageDays, ...rest } = overrides;
    return {
        title: 'A title',
        link: 'https://example.org/a',
        description: '',
        publishedAt: ageDays === undefined ? NOW.toISOString() : new Date(NOW.getTime() - ageDays * 86400000).toISOString(),
        categories: [],
        feedName: 'Example',
        ...rest,
    };
}

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Channel Title</title>
    <item>
      <title>Membership dues are rising</title>
      <link>https://example.org/dues</link>
      <description>&lt;p&gt;Associations raised &amp;amp; restructured dues.&lt;/p&gt;</description>
      <pubDate>Tue, 04 Aug 2026 09:00:00 GMT</pubDate>
      <category>Membership</category>
      <category>Finance</category>
    </item>
    <item>
      <title><![CDATA[Retention playbooks]]></title>
      <guid isPermaLink="true">https://example.org/retention</guid>
      <description><![CDATA[<b>Retention</b> tactics that worked]]></description>
      <pubDate>Mon, 03 Aug 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Channel</title>
  <entry>
    <title>Board governance changes</title>
    <link rel="alternate" href="https://example.net/governance"/>
    <summary>New rules for nonprofit boards</summary>
    <published>2026-08-04T10:00:00Z</published>
    <category term="Governance"/>
  </entry>
</feed>`;

// =====================================================================
// Parsing
// =====================================================================

describe('parseFeedArticles — RSS 2.0', () => {
    it('extracts every item field', () => {
        const articles = parseFeedArticles(RSS_FEED, 'Example');
        expect(articles).toHaveLength(2);
        expect(articles[0]).toEqual({
            title: 'Membership dues are rising',
            link: 'https://example.org/dues',
            description: 'Associations raised & restructured dues.',
            publishedAt: '2026-08-04T09:00:00.000Z',
            categories: ['Membership', 'Finance'],
            feedName: 'Example',
        });
    });

    it('reads CDATA titles and descriptions', () => {
        const articles = parseFeedArticles(RSS_FEED, 'Example');
        expect(articles[1].title).toBe('Retention playbooks');
        expect(articles[1].description).toBe('Retention tactics that worked');
    });

    it('falls back to a permalink guid when there is no link', () => {
        const articles = parseFeedArticles(RSS_FEED, 'Example');
        expect(articles[1].link).toBe('https://example.org/retention');
    });

    it('does not pick up a non-permalink guid as the link', () => {
        // An opaque guid is not a URL; emitting it would produce a dead link.
        const xml = `<rss><channel><item><title>T</title><guid isPermaLink="false">abc-123</guid></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F')[0].link).toBe('');
    });

    it('ignores the channel-level title', () => {
        // The channel <title> sits outside every <item>, so item parsing must not see it.
        expect(parseFeedArticles(RSS_FEED, 'Example').map(a => a.title)).not.toContain('Channel Title');
    });

    it('skips an item with no title, since there is nothing to rank', () => {
        const xml = `<rss><channel><item><link>https://x.test/a</link></item><item><title>Kept</title></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F').map(a => a.title)).toEqual(['Kept']);
    });

    it('reads content:encoded when there is no description', () => {
        const xml = `<rss><channel><item><title>T</title><content:encoded><![CDATA[<p>Body text</p>]]></content:encoded></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F')[0].description).toBe('Body text');
    });

    it('truncates a description that inlines a whole article body', () => {
        const xml = `<rss><channel><item><title>T</title><description>${'x'.repeat(900)}</description></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F')[0].description).toHaveLength(500);
    });

    it('reads dc:date as a last resort', () => {
        const xml = `<rss><channel><item><title>T</title><dc:date>2026-08-01T00:00:00Z</dc:date></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F')[0].publishedAt).toBe('2026-08-01T00:00:00.000Z');
    });

    it('keeps an undated item rather than dropping it silently', () => {
        // Dropping it here would make it invisible; filterByAge decides its fate,
        // and reports the count when it does.
        const xml = `<rss><channel><item><title>No date</title></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F')[0].publishedAt).toBeNull();
    });

    it('keeps an item with an unparseable date, as undated', () => {
        const xml = `<rss><channel><item><title>T</title><pubDate>last Thursday</pubDate></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F')[0].publishedAt).toBeNull();
    });

    it('parses every item when one carries content a strict parser would reject', () => {
        // The reason for regex parsing over a strict XML parser: a bare ampersand or a
        // stray character costs that item's text, not the whole document. (An item whose
        // own tag is never closed is a different matter — the lazy block match swallows
        // whatever follows it, so graceful degradation covers bad content, not bad tags.)
        const xml =
            `<rss><channel>` +
            `<item><title>Broken & unescaped</title></item>` +
            `<item><title>Second</title></item>` +
            `</channel></rss>`;
        expect(parseFeedArticles(xml, 'F').map(a => a.title)).toEqual(['Broken & unescaped', 'Second']);
    });

    it('returns nothing for an empty or non-feed document instead of throwing', () => {
        expect(parseFeedArticles('', 'F')).toEqual([]);
        expect(parseFeedArticles('<html><body>not a feed</body></html>', 'F')).toEqual([]);
    });

    it('does not match a tag that merely starts with the name it was asked for', () => {
        const xml = `<rss><channel><item><titleAlternate>Wrong</titleAlternate><title>Right</title></item></channel></rss>`;
        expect(parseFeedArticles(xml, 'F')[0].title).toBe('Right');
    });
});

describe('parseFeedArticles — Atom', () => {
    it('reads entries, href links, summaries and term categories', () => {
        const articles = parseFeedArticles(ATOM_FEED, 'Atom');
        expect(articles).toHaveLength(1);
        expect(articles[0]).toEqual({
            title: 'Board governance changes',
            link: 'https://example.net/governance',
            description: 'New rules for nonprofit boards',
            publishedAt: '2026-08-04T10:00:00.000Z',
            categories: ['Governance'],
            feedName: 'Atom',
        });
    });

    it('prefers published over updated', () => {
        const xml = `<feed><entry><title>T</title><published>2026-08-01T00:00:00Z</published><updated>2026-08-04T00:00:00Z</updated></entry></feed>`;
        expect(parseFeedArticles(xml, 'F')[0].publishedAt).toBe('2026-08-01T00:00:00.000Z');
    });

    it('uses updated when there is no published', () => {
        const xml = `<feed><entry><title>T</title><updated>2026-08-04T00:00:00Z</updated></entry></feed>`;
        expect(parseFeedArticles(xml, 'F')[0].publishedAt).toBe('2026-08-04T00:00:00.000Z');
    });

    it('reads a hybrid document that carries both items and entries', () => {
        const xml = `<feed><item><title>From item</title></item><entry><title>From entry</title></entry></feed>`;
        expect(parseFeedArticles(xml, 'F').map(a => a.title)).toEqual(['From item', 'From entry']);
    });
});

describe('stripHtml and entity decoding', () => {
    it('strips tags and collapses whitespace', () => {
        expect(stripHtml('<p>One</p>\n\n  <p>Two</p>')).toBe('One Two');
    });

    it('decodes named and numeric entities', () => {
        expect(stripHtml('&quot;q&quot; &#39;a&#39; &#x27;b&#x27; &nbsp;end')).toBe('"q" \'a\' \'b\' end');
    });

    it('strips markup that arrived escaped, which is how most feeds send it', () => {
        // Decoding after stripping would leave a literal "<p>" in the output for
        // every RSS description in the wild.
        expect(stripHtml('&lt;p&gt;Body &lt;b&gt;text&lt;/b&gt;&lt;/p&gt;')).toBe('Body text');
    });

    it('finishes decoding an ampersand that was escaped twice', () => {
        // Source rendering as "&" arrives as &amp;amp; through an escaped-HTML
        // description; one decode pass would leave a visible "&amp;".
        expect(stripHtml('Raised &amp;amp; restructured')).toBe('Raised & restructured');
    });

    it('drops an out-of-range numeric entity rather than throwing', () => {
        expect(stripHtml('before &#1114112; after')).toBe('before after');
    });
});

describe('parseFeedDate', () => {
    it('accepts RFC 822 and ISO 8601', () => {
        expect(parseFeedDate('Tue, 04 Aug 2026 09:00:00 GMT')).toBe('2026-08-04T09:00:00.000Z');
        expect(parseFeedDate('2026-08-04T09:00:00Z')).toBe('2026-08-04T09:00:00.000Z');
    });

    it('returns null for missing or unparseable input', () => {
        expect(parseFeedDate('')).toBeNull();
        expect(parseFeedDate('sometime')).toBeNull();
    });
});

// =====================================================================
// Age filtering
// =====================================================================

describe('filterByAge', () => {
    it('keeps in-window articles and counts what it dropped', () => {
        const result = filterByAge([article({ ageDays: 1 }), article({ ageDays: 30 })], 7, NOW, false);
        expect(result.kept).toHaveLength(1);
        expect(result.tooOldCount).toBe(1);
    });

    it('counts undated articles whether or not they are kept', () => {
        const articles = [article({ ageDays: 1 }), article({ publishedAt: null })];
        expect(filterByAge(articles, 7, NOW, false)).toMatchObject({ undatedCount: 1 });
        expect(filterByAge(articles, 7, NOW, false).kept).toHaveLength(1);
        expect(filterByAge(articles, 7, NOW, true).kept).toHaveLength(2);
    });

    it('keeps a future-dated article rather than deleting the newest item over clock skew', () => {
        expect(filterByAge([article({ ageDays: -1 })], 7, NOW, false).kept).toHaveLength(1);
    });

    it('keeps an article exactly at the window edge', () => {
        expect(filterByAge([article({ ageDays: 7 })], 7, NOW, false).kept).toHaveLength(1);
    });
});

// =====================================================================
// Scoring
// =====================================================================

describe('computeRelevanceScore', () => {
    it('weights title above category above description', () => {
        expect(computeRelevanceScore(article({ title: 'dues rising' }), ['dues']).score).toBe(RELEVANCE_WEIGHTS.title);
        expect(computeRelevanceScore(article({ categories: ['Dues'] }), ['dues']).score).toBe(RELEVANCE_WEIGHTS.category);
        expect(computeRelevanceScore(article({ description: 'about dues' }), ['dues']).score).toBe(RELEVANCE_WEIGHTS.description);
    });

    it('sums all three placements for one keyword', () => {
        const a = article({ title: 'Dues', categories: ['dues'], description: 'dues' });
        expect(computeRelevanceScore(a, ['dues']).score).toBe(
            RELEVANCE_WEIGHTS.title + RELEVANCE_WEIGHTS.category + RELEVANCE_WEIGHTS.description,
        );
    });

    it('matches case-insensitively and reports which keywords hit', () => {
        const a = article({ title: 'DUES and Retention' });
        const result = computeRelevanceScore(a, ['dues', 'retention', 'sponsorship']);
        expect(result.matched).toEqual(['dues', 'retention']);
        expect(result.score).toBe(RELEVANCE_WEIGHTS.title * 2);
    });

    it('scores zero against no keywords, rather than treating everything as a match', () => {
        expect(computeRelevanceScore(article({ title: 'anything' }), [])).toEqual({ score: 0, matched: [] });
    });

    it('ignores blank keywords instead of matching every article on the empty string', () => {
        expect(computeRelevanceScore(article({ title: 'anything' }), ['', '  ']).score).toBe(0);
    });
});

describe('computeRecencyScore', () => {
    it('scores 1 for something published now and clamps future dates to 1', () => {
        expect(computeRecencyScore(NOW.toISOString(), 7, NOW)).toBe(1);
        expect(computeRecencyScore(new Date(NOW.getTime() + 86400000).toISOString(), 7, NOW)).toBe(1);
    });

    it('decays across the window, never below 0.1 while still in it', () => {
        expect(computeRecencyScore(new Date(NOW.getTime() - 3.5 * 86400000).toISOString(), 7, NOW)).toBeCloseTo(0.5, 5);
        expect(computeRecencyScore(new Date(NOW.getTime() - 7 * 86400000).toISOString(), 7, NOW)).toBe(0.1);
    });

    it('scores 0 out of window, for an undated article, and for a zero window', () => {
        expect(computeRecencyScore(new Date(NOW.getTime() - 8 * 86400000).toISOString(), 7, NOW)).toBe(0);
        expect(computeRecencyScore(null, 7, NOW)).toBe(0);
        expect(computeRecencyScore(NOW.toISOString(), 0, NOW)).toBe(0);
    });
});

describe('scoreAndRankArticles', () => {
    it('lets relevance dominate recency', () => {
        // A week-old article about the topic beats a brand-new article about nothing.
        const relevant = article({ title: 'dues', ageDays: 6 });
        const fresh = article({ title: 'unrelated', ageDays: 0 });
        const ranked = scoreAndRankArticles([fresh, relevant], ['dues'], 7, NOW);
        expect(ranked[0].article.title).toBe('dues');
    });

    it('breaks relevance ties on recency', () => {
        const older = article({ title: 'dues one', ageDays: 5 });
        const newer = article({ title: 'dues two', ageDays: 1 });
        const ranked = scoreAndRankArticles([older, newer], ['dues'], 7, NOW);
        expect(ranked.map(r => r.article.title)).toEqual(['dues two', 'dues one']);
    });

    it('ranks purely by recency when no keywords are supplied', () => {
        const ranked = scoreAndRankArticles([article({ title: 'old', ageDays: 5 }), article({ title: 'new', ageDays: 1 })], [], 7, NOW);
        expect(ranked.map(r => r.article.title)).toEqual(['new', 'old']);
        expect(ranked.every(r => r.relevanceScore === 0)).toBe(true);
    });

    it('keeps feed order among fully tied articles, so a re-read ranks identically', () => {
        const a = article({ title: 'dues a', ageDays: 2 });
        const b = article({ title: 'dues b', ageDays: 2 });
        expect(scoreAndRankArticles([a, b], ['dues'], 7, NOW).map(r => r.article.title)).toEqual(['dues a', 'dues b']);
    });
});

describe('filterRelevant', () => {
    it('drops articles that matched nothing and are not fresh', () => {
        const scored = scoreAndRankArticles([article({ title: 'unrelated', ageDays: 5 })], ['dues'], 7, NOW);
        expect(filterRelevant(scored, ['dues'])).toHaveLength(0);
    });

    it('keeps a very fresh article that matched nothing, since a keyword list is never complete', () => {
        const scored = scoreAndRankArticles([article({ title: 'unrelated', ageDays: 0 })], ['dues'], 7, NOW);
        expect(filterRelevant(scored, ['dues'])).toHaveLength(1);
    });

    it('keeps everything when no keywords were supplied', () => {
        const scored = scoreAndRankArticles([article({ title: 'unrelated', ageDays: 6 })], [], 7, NOW);
        expect(filterRelevant(scored, [])).toHaveLength(1);
    });
});

// =====================================================================
// The action
// =====================================================================

/** A ReadRSSFeedAction with a pinned clock and a canned fetch. */
class TestReadRSSFeedAction extends ReadRSSFeedAction {
    public Requested: string[] = [];
    constructor(private readonly bodies: Record<string, string | Error>) {
        super();
    }
    protected override Now(): Date {
        return NOW;
    }
    protected override async FetchFeed(url: string): Promise<string> {
        this.Requested.push(url);
        const body = this.bodies[url];
        if (body === undefined) throw new Error(`no canned body for ${url}`);
        if (body instanceof Error) throw body;
        return body;
    }
}

interface ActionParams {
    Params: Array<{ Name: string; Value: unknown; Type: string }>;
}

async function runFeedAction(inputs: Record<string, unknown>, bodies: Record<string, string | Error>) {
    const params: ActionParams = {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
    };
    const action = new TestReadRSSFeedAction(bodies);
    const result = (await action.Run(params as never)) as { Success: boolean; Message: string; ResultCode: string };
    return { result, params, action };
}

function output(params: ActionParams, name: string): unknown {
    return params.Params.find(p => p.Name === name)?.Value;
}

const URL_A = 'https://example.org/feed.xml';
const URL_B = 'https://example.net/atom.xml';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ReadRSSFeedAction', () => {
    it('reads a single feed given only a URL, naming it after the host', async () => {
        const { result, params } = await runFeedAction({ FeedURLs: URL_A }, { [URL_A]: RSS_FEED });
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(output(params, 'ArticleCount')).toBe(2);
        expect((output(params, 'FeedStatuses') as Array<{ name: string }>)[0].name).toBe('example.org');
    });

    it('requires at least one feed', async () => {
        const { result } = await runFeedAction({}, {});
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_FEEDS');
    });

    it('accepts named feeds as an array or as a JSON string', async () => {
        const asArray = await runFeedAction({ Feeds: [{ name: 'Named', url: URL_A }] }, { [URL_A]: RSS_FEED });
        expect((output(asArray.params, 'FeedStatuses') as Array<{ name: string }>)[0].name).toBe('Named');

        const asJson = await runFeedAction({ Feeds: JSON.stringify([{ name: 'Named', url: URL_A }]) }, { [URL_A]: RSS_FEED });
        expect((output(asJson.params, 'FeedStatuses') as Array<{ name: string }>)[0].name).toBe('Named');
    });

    it('reports a malformed Feeds value instead of reading nothing', async () => {
        expect((await runFeedAction({ Feeds: '[{bad json' }, {})).result.ResultCode).toBe('INVALID_FEEDS');
        expect((await runFeedAction({ Feeds: [{ name: 'No URL' }] }, {})).result.ResultCode).toBe('INVALID_FEEDS');
    });

    it('refuses a non-http URL, so this cannot become a local file reader', async () => {
        const { result } = await runFeedAction({ FeedURLs: 'file:///etc/passwd' }, {});
        expect(result.ResultCode).toBe('INVALID_FEED_URL');
    });

    it('de-duplicates a feed listed twice, which would otherwise double every article', async () => {
        const { params, action } = await runFeedAction({ FeedURLs: `${URL_A}, ${URL_A}` }, { [URL_A]: RSS_FEED });
        expect(action.Requested).toEqual([URL_A]);
        expect(output(params, 'ArticleCount')).toBe(2);
    });

    it('merges several feeds and attributes each article to its own feed', async () => {
        const { params } = await runFeedAction(
            { Feeds: [{ name: 'RSS One', url: URL_A }, { name: 'Atom Two', url: URL_B }] },
            { [URL_A]: RSS_FEED, [URL_B]: ATOM_FEED },
        );
        const feedNames = (output(params, 'Articles') as Array<{ feedName: string }>).map(a => a.feedName);
        expect(new Set(feedNames)).toEqual(new Set(['RSS One', 'Atom Two']));
    });

    it('keeps a failing feed from costing the caller the working ones', async () => {
        const { result, params } = await runFeedAction(
            { Feeds: [{ name: 'Good', url: URL_A }, { name: 'Dead', url: URL_B }] },
            { [URL_A]: RSS_FEED, [URL_B]: new Error('HTTP 503') },
        );
        expect(result.Success).toBe(true);
        expect(output(params, 'FailedFeedCount')).toBe(1);
        const statuses = output(params, 'FeedStatuses') as Array<{ name: string; success: boolean; error: string | null }>;
        expect(statuses.find(s => s.name === 'Dead')).toMatchObject({ success: false, error: 'HTTP 503' });
        expect(output(params, 'ArticleCount')).toBe(2);
        expect(result.Message).toMatch(/1 feed\(s\) failed/);
    });

    it('fails the whole action on any feed failure only when asked to', async () => {
        const { result } = await runFeedAction(
            { Feeds: [{ name: 'Good', url: URL_A }, { name: 'Dead', url: URL_B }], RequireAllFeeds: true },
            { [URL_A]: RSS_FEED, [URL_B]: new Error('HTTP 503') },
        );
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('FEED_FETCH_FAILED');
        expect(result.Message).toMatch(/Dead \(HTTP 503\)/);
    });

    it('applies the age window and says how many articles it excluded', async () => {
        // Against the fixed clock the two RSS items are 1.125 and 2.125 days old, so a
        // 2-day window keeps the newer one and excludes the other.
        const { result, params } = await runFeedAction({ FeedURLs: URL_A, MaxAgeDays: 2 }, { [URL_A]: RSS_FEED });
        expect(output(params, 'ArticleCount')).toBe(1);
        expect(output(params, 'FilteredOutTooOld')).toBe(1);
        expect(result.Message).toMatch(/1 older than 2 day\(s\)/);
    });

    it('excludes undated articles by default and reports that it did', async () => {
        const undated = `<rss><channel><item><title>No date here</title></item></channel></rss>`;
        const excluded = await runFeedAction({ FeedURLs: URL_A }, { [URL_A]: undated });
        expect(output(excluded.params, 'ArticleCount')).toBe(0);
        expect(output(excluded.params, 'UndatedCount')).toBe(1);
        expect(excluded.result.Message).toMatch(/1 undated \(excluded\)/);

        const included = await runFeedAction({ FeedURLs: URL_A, IncludeUndated: true }, { [URL_A]: undated });
        expect(output(included.params, 'ArticleCount')).toBe(1);
        expect(included.result.Message).toMatch(/1 undated \(kept\)/);
    });

    it('ranks by keyword relevance and returns the scores that produced the order', async () => {
        const { params } = await runFeedAction({ FeedURLs: URL_A, Keywords: 'retention' }, { [URL_A]: RSS_FEED });
        const articles = output(params, 'Articles') as Array<{ title: string; matchedKeywords: string[]; relevanceScore: number; totalScore: number }>;
        expect(articles[0].title).toBe('Retention playbooks');
        expect(articles[0].matchedKeywords).toEqual(['retention']);
        expect(articles[0].relevanceScore).toBeGreaterThan(0);
        expect(articles[0].totalScore).toBeGreaterThan(0);
    });

    it('does not bucket scores into labels, since "high" depends on the caller not the batch', async () => {
        const { params } = await runFeedAction({ FeedURLs: URL_A, Keywords: 'dues' }, { [URL_A]: RSS_FEED });
        const first = (output(params, 'Articles') as Array<Record<string, unknown>>)[0];
        expect(first).not.toHaveProperty('strength');
        expect(typeof first.recencyScore).toBe('number');
    });

    it('caps the returned articles and still reports the total it read', async () => {
        const { params } = await runFeedAction({ FeedURLs: URL_A, MaxResults: 1 }, { [URL_A]: RSS_FEED });
        expect(output(params, 'ArticleCount')).toBe(1);
        expect(output(params, 'TotalFetched')).toBe(2);
    });

    it('succeeds with an empty result set — a quiet week is an answer, not a failure', async () => {
        const { result, params } = await runFeedAction(
            { FeedURLs: URL_A, Keywords: 'sponsorship', MaxAgeDays: 1 },
            { [URL_A]: RSS_FEED },
        );
        expect(result.Success).toBe(true);
        expect(output(params, 'ArticleCount')).toBe(0);
        expect(result.Message).toMatch(/returning 0/);
    });

    it('succeeds on a document that is not a feed at all, reporting zero articles', async () => {
        const { result, params } = await runFeedAction({ FeedURLs: URL_A }, { [URL_A]: '<html><body>Not a feed</body></html>' });
        expect(result.Success).toBe(true);
        expect(output(params, 'TotalFetched')).toBe(0);
    });
});
