/**
 * RSS and Atom feed parsing and keyword scoring — pure functions.
 *
 * No HTTP, no logging, no clock of its own: every function that needs the current
 * time takes it as a parameter. That is deliberate. A single feed read filters by
 * age and then scores by recency, and if those two steps read `Date.now()`
 * independently they can disagree — an article can pass the age filter and then
 * score as out-of-window, producing a result the caller cannot explain. One
 * injected `now` also makes every threshold here testable without faking timers.
 *
 * Parsing is by regex rather than by an XML parser. That is a deliberate trade:
 * feeds in the wild are frequently not well-formed, and a strict parser fails the
 * whole document over one unescaped ampersand in one item. The regex approach
 * degrades per item instead. The cost is that deeply nested or namespace-heavy
 * markup is not understood; both are rare in the item-level fields extracted here.
 */

/** One article from a feed, normalized across RSS 2.0 and Atom. */
export interface FeedArticle {
    title: string;
    link: string;
    /** Plain text — HTML tags stripped and entities decoded. */
    description: string;
    /**
     * ISO 8601 publication date, or null when the feed did not carry a parseable
     * one. Null is preserved rather than defaulted to "now", because a
     * fabricated date would make an undated item the freshest thing in the batch.
     */
    publishedAt: string | null;
    categories: string[];
    /** Which feed this came from, so a merged result set stays attributable. */
    feedName: string;
}

/** An article with its keyword-relevance and recency scores. */
export interface ScoredFeedArticle {
    article: FeedArticle;
    /** Weighted sum of keyword hits: title 3, category 2, description 1, per keyword. */
    relevanceScore: number;
    /** 1.0 for something published now, decaying to 0.1 at the edge of the window; 0 for undated. */
    recencyScore: number;
    /** `relevanceScore * 10 + recencyScore * 5` — relevance dominates, recency breaks ties. */
    totalScore: number;
    matchedKeywords: string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Weights behind {@link computeRelevanceScore}, exported so callers can explain a score. */
export const RELEVANCE_WEIGHTS = { title: 3, category: 2, description: 1 } as const;

/** How long a description is kept. Feeds sometimes inline a whole article body. */
const MAX_DESCRIPTION_LENGTH = 500;

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Extract one tag's text, handling CDATA.
 *
 * The name is matched only when followed by whitespace, `/` or `>`, so asking for
 * `link` does not match `<linkGroup>` — and, more importantly for Atom, asking for
 * `title` does not match a namespaced sibling that merely starts with it.
 */
function extractTag(xml: string, tagName: string): string {
    const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}\\s*>`);
    return pattern.exec(xml)?.[1]?.trim() ?? '';
}

/** Every occurrence of a tag's text, in document order. */
function extractAllTags(xml: string, tagName: string): string[] {
    const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}\\s*>`, 'g');
    const results: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
        const value = decodeEntities(match[1]?.trim() ?? '');
        if (value) results.push(value);
    }
    return results;
}

/** One attribute off the first matching tag, e.g. Atom's `<link href="…"/>`. */
function extractAttribute(xml: string, tagName: string, attribute: string): string {
    const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?\\s${attribute}\\s*=\\s*["']([^"']*)["']`);
    return pattern.exec(xml)?.[1]?.trim() ?? '';
}

/** Decode the entities that actually appear in feed text. */
function decodeEntities(text: string): string {
    return text
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        // `&amp;` is decoded last so `&amp;lt;` yields the literal text `&lt;`
        // rather than being decoded twice into `<`.
        .replace(/&amp;/g, '&');
}

function safeCodePoint(code: number): string {
    // An out-of-range numeric entity throws from fromCodePoint; dropping it is
    // better than failing the whole item over one bad character reference.
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/**
 * Reduce feed text to plain text: decode, strip markup, decode again, collapse.
 *
 * Decoding runs *before* stripping because RSS descriptions overwhelmingly carry
 * their HTML escaped — `&lt;p&gt;text&lt;/p&gt;` rather than `<p>text</p>`. Strip
 * first and those tags survive as literal `<p>` in the output, which is what a
 * consumer then has to clean up itself.
 *
 * The second decode pass exists for that same escaped-HTML case: source that
 * renders as `&amp;` arrives as `&amp;amp;`, so one pass leaves a visible `&amp;`
 * where the reader expects `&`. Running it again after the tags are gone finishes
 * the job. Text that was never double-escaped has no entities left by then, so the
 * extra pass is a no-op on it.
 */
export function stripHtml(text: string): string {
    const unescaped = decodeEntities(text);
    const withoutTags = unescaped.replace(/<[^>]*>/g, '');
    return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

/**
 * Parse a feed document into articles. Handles RSS 2.0 (`<item>`) and Atom
 * (`<entry>`); a document containing both has both read, since some publishers
 * serve a hybrid.
 *
 * Items with no title are skipped — there is nothing to show or score. Items with
 * no parseable date are kept with `publishedAt: null`, which is what lets the
 * caller report them rather than wonder where they went. Age filtering is a
 * separate step ({@link filterByAge}) precisely so that decision stays visible.
 */
export function parseFeedArticles(xml: string, feedName: string): FeedArticle[] {
    const articles: FeedArticle[] = [];
    const blockPattern = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/g;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(xml)) !== null) {
        const itemXml = match[2];

        const title = stripHtml(extractTag(itemXml, 'title'));
        if (!title) continue;

        // RSS puts the URL in <link>text</link>; Atom puts it in <link href="…"/>,
        // which leaves the text extraction empty.
        const link =
            decodeEntities(extractTag(itemXml, 'link')) ||
            extractAttribute(itemXml, 'link', 'href') ||
            extractPermalinkGuid(itemXml);

        // RSS: description or content:encoded. Atom: summary or content.
        const rawDescription =
            extractTag(itemXml, 'description') ||
            extractTag(itemXml, 'content:encoded') ||
            extractTag(itemXml, 'summary') ||
            extractTag(itemXml, 'content');

        // RSS: pubDate (RFC 822), sometimes dc:date. Atom: published, else updated.
        const rawDate =
            extractTag(itemXml, 'pubDate') ||
            extractTag(itemXml, 'published') ||
            extractTag(itemXml, 'updated') ||
            extractTag(itemXml, 'dc:date');

        // Atom categories are an attribute, not element text.
        const categories = extractAllTags(itemXml, 'category');
        if (categories.length === 0) {
            const term = extractAttribute(itemXml, 'category', 'term');
            if (term) categories.push(term);
        }

        articles.push({
            title,
            link,
            description: stripHtml(rawDescription).slice(0, MAX_DESCRIPTION_LENGTH),
            publishedAt: parseFeedDate(rawDate),
            categories,
            feedName,
        });
    }

    return articles;
}

/** Some feeds carry the canonical URL as a permalink `<guid>` and no `<link>`. */
function extractPermalinkGuid(xml: string): string {
    const match = xml.match(/<guid[^>]*isPermaLink\s*=\s*["']true["'][^>]*>([\s\S]*?)<\/guid\s*>/);
    return decodeEntities(match?.[1]?.trim() ?? '');
}

/** A feed date as ISO 8601, or null when it is missing or unparseable. */
export function parseFeedDate(raw: string): string | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// ─── Age filtering ────────────────────────────────────────────────────────────

/** The outcome of an age filter, keeping what it dropped countable. */
export interface AgeFilterResult {
    kept: FeedArticle[];
    /** Dropped for being older than the window. */
    tooOldCount: number;
    /** Undated articles, kept or dropped per `includeUndated`. */
    undatedCount: number;
}

/**
 * Keep articles published within `maxAgeDays` of `now`.
 *
 * Undated articles cannot be age-filtered, so `includeUndated` decides them
 * explicitly rather than having them silently vanish — which is what happens when
 * an undated item is compared against a cutoff. Both counts come back so the
 * caller can say how many articles a quiet result set actually hid.
 *
 * A future-dated article is kept: publishers do post-date, and a clock skew of a
 * few minutes should not delete the newest item in the feed.
 */
export function filterByAge(
    articles: FeedArticle[],
    maxAgeDays: number,
    now: Date,
    includeUndated: boolean,
): AgeFilterResult {
    const cutoff = now.getTime() - maxAgeDays * MS_PER_DAY;
    const kept: FeedArticle[] = [];
    let tooOldCount = 0;
    let undatedCount = 0;

    for (const article of articles) {
        if (article.publishedAt === null) {
            undatedCount++;
            if (includeUndated) kept.push(article);
            continue;
        }
        if (new Date(article.publishedAt).getTime() < cutoff) {
            tooOldCount++;
            continue;
        }
        kept.push(article);
    }

    return { kept, tooOldCount, undatedCount };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score keyword relevance. A hit in the title counts 3, in a category 2, in the
 * description 1, and one keyword can hit all three.
 *
 * Matching is case-insensitive substring, which is what makes it useful on feed
 * text — but it means 'AI' matches 'said'. Prefer multi-word keywords when that
 * matters; the alternative, word-boundary matching, would miss 'AI-driven' and
 * plurals, which costs more in practice.
 */
export function computeRelevanceScore(article: FeedArticle, keywords: string[]): { score: number; matched: string[] } {
    const title = article.title.toLowerCase();
    const description = article.description.toLowerCase();
    const categories = article.categories.map(c => c.toLowerCase()).join(' ');

    let score = 0;
    const matched: string[] = [];

    for (const keyword of keywords) {
        const needle = keyword.trim().toLowerCase();
        if (needle.length === 0) continue;

        let keywordScore = 0;
        if (title.includes(needle)) keywordScore += RELEVANCE_WEIGHTS.title;
        if (categories.includes(needle)) keywordScore += RELEVANCE_WEIGHTS.category;
        if (description.includes(needle)) keywordScore += RELEVANCE_WEIGHTS.description;

        if (keywordScore > 0) {
            score += keywordScore;
            matched.push(keyword);
        }
    }

    return { score, matched };
}

/**
 * Recency as a 0-1 decay across the window: 1.0 for something published at `now`,
 * floored at 0.1 at the far edge so an in-window article never scores as though it
 * were out of window. Undated and out-of-window both score 0.
 */
export function computeRecencyScore(publishedAt: string | null, timeWindowDays: number, now: Date): number {
    if (publishedAt === null || timeWindowDays <= 0) return 0;
    const ageDays = (now.getTime() - new Date(publishedAt).getTime()) / MS_PER_DAY;
    if (ageDays > timeWindowDays) return 0;
    // Future-dated articles clamp to the maximum rather than exceeding it.
    if (ageDays <= 0) return 1;
    return Math.max(0.1, 1 - ageDays / timeWindowDays);
}

/**
 * Score every article and rank them, highest total first.
 *
 * With no keywords, relevance is 0 for everything and the ranking is pure
 * recency — which is the right behaviour for "just show me what is new" rather
 * than an error.
 */
export function scoreAndRankArticles(
    articles: FeedArticle[],
    keywords: string[],
    timeWindowDays: number,
    now: Date,
): ScoredFeedArticle[] {
    const scored = articles.map((article): ScoredFeedArticle => {
        const { score: relevanceScore, matched } = computeRelevanceScore(article, keywords);
        const recencyScore = computeRecencyScore(article.publishedAt, timeWindowDays, now);
        return {
            article,
            relevanceScore,
            recencyScore,
            totalScore: relevanceScore * 10 + recencyScore * 5,
            matchedKeywords: matched,
        };
    });

    // Stable within equal scores: sort is stable in every supported runtime, so
    // ties keep feed order and a re-read of an unchanged feed ranks identically.
    return scored.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Drop articles that matched nothing and are not fresh enough to be interesting
 * on their own.
 *
 * The recency escape hatch exists because a keyword list is always incomplete: an
 * article published in the last quarter of the window is worth surfacing even
 * though none of the supplied keywords appeared in it. With no keywords supplied,
 * everything is relevant by definition and nothing is dropped.
 */
export function filterRelevant(scored: ScoredFeedArticle[], keywords: string[], recencyFloor = 0.75): ScoredFeedArticle[] {
    if (keywords.length === 0) return scored;
    return scored.filter(s => s.relevanceScore > 0 || s.recencyScore >= recencyFloor);
}
