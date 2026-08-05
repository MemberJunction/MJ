import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import {
    FeedArticle,
    ScoredFeedArticle,
    filterByAge,
    filterRelevant,
    parseFeedArticles,
    scoreAndRankArticles,
} from "./rss-feed-parsing";

/** One feed to read. `Name` is what a merged result set is attributed to. */
export interface RSSFeedInput {
    name: string;
    url: string;
}

/** Per-feed outcome, reported whether the feed succeeded or not. */
export interface RSSFeedStatus {
    name: string;
    url: string;
    success: boolean;
    articleCount: number;
    error: string | null;
}

/**
 * Action that reads one or more RSS or Atom feeds and returns their articles,
 * optionally scored and ranked against a keyword list.
 *
 * Feeds are fetched concurrently and a failing feed does not fail the action: its
 * error is reported in `FeedStatuses` while the other feeds still return their
 * articles. A feed being unreachable is the normal case at any scale — one dead
 * URL in a list of twenty should not cost the caller the other nineteen.
 *
 * No credential. These are public HTTP endpoints.
 *
 * Scoring is a keyword-relevance weight (title 3, category 2, description 1)
 * plus a recency decay across the time window, combined as
 * `relevance * 10 + recency * 5` so relevance dominates and recency breaks ties.
 * The numeric scores come back on every article rather than being bucketed into
 * labels, because what counts as "high" depends on the caller's corpus, not on
 * this action's batch.
 *
 * @example
 * ```typescript
 * // Just read a feed
 * await runAction({
 *   ActionName: 'Read RSS Feed',
 *   Params: [{ Name: 'FeedURLs', Value: 'https://example.org/news/feed.xml' }]
 * });
 *
 * // Several named feeds, ranked against keywords, last 7 days
 * await runAction({
 *   ActionName: 'Read RSS Feed',
 *   Params: [
 *     { Name: 'Feeds', Value: [
 *         { name: 'Associations Now', url: 'https://associationsnow.com/feed/' },
 *         { name: 'NonprofitPRO',     url: 'https://www.nonprofitpro.com/feed/' }
 *     ]},
 *     { Name: 'Keywords', Value: ['membership', 'dues', 'retention'] },
 *     { Name: 'MaxAgeDays', Value: 7 },
 *     { Name: 'MaxResults', Value: 25 }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Read RSS Feed")
export class ReadRSSFeedAction extends BaseAction {
    private static readonly DEFAULT_MAX_AGE_DAYS = 7;
    private static readonly DEFAULT_MAX_RESULTS = 25;
    private static readonly FETCH_TIMEOUT_MS = 15000;
    /** Bounded so one enormous feed cannot exhaust memory. */
    private static readonly MAX_FEED_BYTES = 10 * 1024 * 1024;
    private static readonly USER_AGENT = 'MemberJunction-CoreActions/1.0';

    /**
     * Executes the feed read.
     *
     * @param params - The action parameters containing:
     *   - Feeds: Array of `{ name, url }` (or a JSON string of one). Either this
     *     or FeedURLs is required
     *   - FeedURLs: Array or comma-separated string of URLs, named after their host
     *   - Keywords: Array or comma-separated string. Optional — with none supplied,
     *     articles come back ranked purely by recency
     *   - MaxAgeDays: Age window, default 7. News has a short shelf life
     *   - MaxResults: Cap on returned articles, default 25
     *   - IncludeUndated: Keep articles the feed gave no parseable date (default
     *     false). They cannot be age-filtered, so this is an explicit choice
     *   - RequireAllFeeds: Fail the action if any feed failed (default false)
     *
     * @returns Ranked articles, plus a per-feed status list
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const feedsResult = this.resolveFeeds(params);
        if (feedsResult.error !== null) {
            return feedsResult.error;
        }
        const feeds = feedsResult.feeds;

        const keywords = this.getStringArrayParam(params, 'keywords');
        const maxAgeDays = Math.max(this.getNumericParam(params, 'maxagedays', ReadRSSFeedAction.DEFAULT_MAX_AGE_DAYS), 0);
        const maxResults = Math.max(Math.floor(this.getNumericParam(params, 'maxresults', ReadRSSFeedAction.DEFAULT_MAX_RESULTS)), 1);
        const includeUndated = this.getBooleanParam(params, 'includeundated', false);
        const requireAllFeeds = this.getBooleanParam(params, 'requireallfeeds', false);

        // One clock for the whole run: the age filter and the recency score must
        // agree, or an article can pass the filter and then score as out-of-window.
        const now = this.Now();

        const settled = await Promise.allSettled(feeds.map(feed => this.fetchAndParse(feed)));

        const statuses: RSSFeedStatus[] = [];
        const allArticles: FeedArticle[] = [];
        for (let i = 0; i < settled.length; i++) {
            const outcome = settled[i];
            const feed = feeds[i];
            if (outcome.status === 'fulfilled') {
                allArticles.push(...outcome.value);
                statuses.push({ name: feed.name, url: feed.url, success: true, articleCount: outcome.value.length, error: null });
            } else {
                const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
                LogError(`ReadRSSFeed: failed to read '${feed.name}' (${feed.url}): ${message}`);
                statuses.push({ name: feed.name, url: feed.url, success: false, articleCount: 0, error: message });
            }
        }

        const failedFeeds = statuses.filter(s => !s.success);
        if (requireAllFeeds && failedFeeds.length > 0) {
            return {
                Success: false,
                Message:
                    `${failedFeeds.length} of ${feeds.length} feed(s) failed and RequireAllFeeds is set: ` +
                    failedFeeds.map(f => `${f.name} (${f.error})`).join('; '),
                ResultCode: 'FEED_FETCH_FAILED',
            };
        }

        const aged = filterByAge(allArticles, maxAgeDays, now, includeUndated);
        const ranked = scoreAndRankArticles(aged.kept, keywords, maxAgeDays, now);
        const relevant = filterRelevant(ranked, keywords);
        const top = relevant.slice(0, maxResults);

        LogStatus(
            `ReadRSSFeed: ${allArticles.length} article(s) from ${statuses.filter(s => s.success).length}/${feeds.length} feed(s); ` +
            `${aged.kept.length} within ${maxAgeDays} day(s), ${relevant.length} relevant, returning ${top.length}.`
        );

        this.addOutputParam(params, 'Articles', top.map(this.toOutputArticle));
        this.addOutputParam(params, 'ArticleCount', top.length);
        this.addOutputParam(params, 'FeedStatuses', statuses);
        this.addOutputParam(params, 'TotalFetched', allArticles.length);
        this.addOutputParam(params, 'FilteredOutTooOld', aged.tooOldCount);
        this.addOutputParam(params, 'UndatedCount', aged.undatedCount);
        this.addOutputParam(params, 'FailedFeedCount', failedFeeds.length);

        // Every count that shaped the answer is stated, so an empty or short result
        // set is explainable without re-running anything. An empty result is a real
        // answer — a quiet week is not a failure.
        const message =
            `Read ${allArticles.length} article(s) from ${statuses.filter(s => s.success).length} of ${feeds.length} feed(s); ` +
            `returning ${top.length}` +
            (aged.tooOldCount > 0 ? `, ${aged.tooOldCount} older than ${maxAgeDays} day(s)` : '') +
            (aged.undatedCount > 0 ? `, ${aged.undatedCount} undated (${includeUndated ? 'kept' : 'excluded'})` : '') +
            (keywords.length > 0 ? `, ${ranked.length - relevant.length} matched no keyword and were not fresh enough` : '') +
            (failedFeeds.length > 0 ? `, ${failedFeeds.length} feed(s) failed` : '') +
            '.';

        return { Success: true, Message: message, ResultCode: 'SUCCESS' };
    }

    /** The current time. Overridable so tests can pin the clock. */
    protected Now(): Date {
        return new Date();
    }

    /** Fetch, with a timeout and a size bound. Overridable for tests. */
    protected async FetchFeed(url: string): Promise<string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ReadRSSFeedAction.FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': ReadRSSFeedAction.USER_AGENT,
                    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
                },
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
            }
            const text = await response.text();
            if (text.length > ReadRSSFeedAction.MAX_FEED_BYTES) {
                throw new Error(
                    `feed body is ${text.length} bytes, above the ${ReadRSSFeedAction.MAX_FEED_BYTES}-byte limit`
                );
            }
            return text;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async fetchAndParse(feed: RSSFeedInput): Promise<FeedArticle[]> {
        const xml = await this.FetchFeed(feed.url);
        return parseFeedArticles(xml, feed.name);
    }

    /**
     * Resolve `Feeds` or `FeedURLs` into a validated list.
     *
     * A URL that is not http(s) is rejected rather than attempted: `file://` and
     * friends would turn a feed-reading action into a local-file reader, which is
     * not what any caller of this means.
     */
    private resolveFeeds(params: RunActionParams): { feeds: RSSFeedInput[]; error: null } | { feeds: never[]; error: ActionResultSimple } {
        const feeds: RSSFeedInput[] = [];

        const rawFeeds = this.getParamValue(params, 'feeds');
        if (rawFeeds !== undefined && rawFeeds !== null && rawFeeds !== '') {
            let parsed: unknown = rawFeeds;
            if (typeof parsed === 'string') {
                try {
                    parsed = JSON.parse(parsed);
                } catch (error) {
                    return {
                        feeds: [],
                        error: this.createErrorResult(
                            `Feeds could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}. ` +
                            `Supply an array of { name, url }, or use FeedURLs for a plain list of URLs.`,
                            'INVALID_FEEDS'
                        ),
                    };
                }
            }
            if (!Array.isArray(parsed)) {
                return {
                    feeds: [],
                    error: this.createErrorResult('Feeds must be an array of { name, url } objects', 'INVALID_FEEDS'),
                };
            }
            for (const entry of parsed) {
                if (!entry || typeof entry !== 'object') {
                    return { feeds: [], error: this.createErrorResult('Each Feeds entry must be an object with a url', 'INVALID_FEEDS') };
                }
                const record = entry as Record<string, unknown>;
                const url = typeof record.url === 'string' ? record.url.trim() : '';
                if (!url) {
                    return { feeds: [], error: this.createErrorResult('Each Feeds entry requires a url', 'INVALID_FEEDS') };
                }
                const name = typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : this.nameFromUrl(url);
                feeds.push({ name, url });
            }
        }

        for (const url of this.getStringArrayParam(params, 'feedurls')) {
            feeds.push({ name: this.nameFromUrl(url), url });
        }

        if (feeds.length === 0) {
            return {
                feeds: [],
                error: this.createErrorResult(
                    'Supply at least one feed through Feeds ([{ name, url }]) or FeedURLs (a list of URLs)',
                    'MISSING_FEEDS'
                ),
            };
        }

        const invalid = feeds.filter(f => !this.isHttpUrl(f.url));
        if (invalid.length > 0) {
            return {
                feeds: [],
                error: this.createErrorResult(
                    `Only http and https feed URLs are supported. Rejected: ${invalid.map(f => f.url).join(', ')}`,
                    'INVALID_FEED_URL'
                ),
            };
        }

        // De-duplicate by URL. The same feed listed twice would double every
        // article and distort the ranking, since scores are per article.
        const seen = new Set<string>();
        return { feeds: feeds.filter(f => (seen.has(f.url) ? false : (seen.add(f.url), true))), error: null };
    }

    private isHttpUrl(url: string): boolean {
        try {
            const protocol = new URL(url).protocol;
            return protocol === 'http:' || protocol === 'https:';
        } catch {
            return false;
        }
    }

    /** Fall back to the host as a feed's display name. */
    private nameFromUrl(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    }

    /** Flatten a scored article for output — scores at the top level, not nested. */
    private toOutputArticle(scored: ScoredFeedArticle) {
        return {
            title: scored.article.title,
            link: scored.article.link,
            description: scored.article.description,
            publishedAt: scored.article.publishedAt,
            categories: scored.article.categories,
            feedName: scored.article.feedName,
            relevanceScore: scored.relevanceScore,
            recencyScore: Number(scored.recencyScore.toFixed(4)),
            totalScore: Number(scored.totalScore.toFixed(4)),
            matchedKeywords: scored.matchedKeywords,
        };
    }

    private getParamValue(params: RunActionParams, paramName: string): unknown {
        return params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase())?.Value;
    }

    private getStringArrayParam(params: RunActionParams, paramName: string): string[] {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null) return [];
        const raw = Array.isArray(value) ? value.map(v => String(v)) : String(value).split(',');
        return raw.map(v => v.trim()).filter(v => v.length > 0);
    }

    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null || value === '') return defaultValue;
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    private getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean): boolean {
        const value = this.getParamValue(params, paramName);
        if (value === undefined || value === null || value === '') return defaultValue;
        if (typeof value === 'boolean') return value;
        return String(value).trim().toLowerCase() === 'true';
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }

    private createErrorResult(message: string, code: string): ActionResultSimple {
        return { Success: false, Message: message, ResultCode: code };
    }
}

export function LoadReadRSSFeedAction(): void {
    // Referenced by consumers to keep this registration from being tree-shaken.
}
