import { BaseSingleton } from '@memberjunction/global';
import { UserInfo, Metadata, RunView, RunViewParams, LogError, IMetadataProvider } from '@memberjunction/core';

/**
 * Scope filter applied to every analytics aggregation. All fields are optional;
 * an empty / undefined scope means "all classify data the context user can see".
 *
 * Source / content-type filters constrain the underlying `MJ: Content Items`
 * (those columns live on the item, not the tag). The date range constrains the
 * `MJ: Content Item Tags.__mj_CreatedAt` (when the tag was applied).
 */
export interface ClassifyAnalyticsScope {
    /** Restrict to items from these content sources (OR-ed). */
    ContentSourceIDs?: string[];
    /** Restrict to items of these content types (OR-ed). */
    ContentTypeIDs?: string[];
    /** Only count tags created at/after this date (inclusive). */
    StartDate?: Date;
    /** Only count tags created at/before this date (inclusive). */
    EndDate?: Date;
}

/**
 * A single tag and the number of content-item-tag rows that carry it within scope.
 */
export interface TagDistributionEntry {
    /** The tag text (free-text label as applied to the item). */
    Tag: string;
    /** Number of content-item-tag rows with this tag in scope. */
    Count: number;
}

/**
 * A single time bucket with the count of tags applied within it.
 */
export interface ItemsOverTimeBucket {
    /** ISO date string for the start of the bucket (UTC, truncated to the granularity). */
    BucketStart: string;
    /** Number of tags applied within this bucket. */
    Count: number;
}

/** Granularity for the items-over-time aggregation. */
export type TimeBucketGranularity = 'day' | 'week' | 'month';

/**
 * A single weight/confidence histogram bin.
 */
export interface WeightHistogramBin {
    /** Inclusive lower bound of the bin (0.0-1.0). */
    RangeStart: number;
    /** Exclusive upper bound of the bin (except the final bin, which is inclusive). */
    RangeEnd: number;
    /** Number of tags whose Weight falls in [RangeStart, RangeEnd). */
    Count: number;
}

/**
 * Coverage summary: how many in-scope content items have at least one tag vs none.
 */
export interface CoverageSummary {
    /** Total content items in scope. */
    TotalItems: number;
    /** Items that have at least one tag. */
    TaggedItems: number;
    /** Items with zero tags. */
    UntaggedItems: number;
    /** TaggedItems / TotalItems, 0 when there are no items. */
    CoverageRatio: number;
}

/**
 * High-level KPIs over the classify dataset within scope.
 */
export interface ClassifyKPIs {
    /** Total content items in scope. */
    TotalItems: number;
    /** Total content-item-tag rows in scope. */
    TotalTags: number;
    /** Average tags per item (TotalTags / TotalItems), 0 when no items. */
    AvgTagsPerItem: number;
    /** Number of distinct tag labels in scope. */
    DistinctTags: number;
}

/**
 * Lightweight projection of a ContentItemTag row (simple RunView mode).
 */
interface ContentItemTagRow {
    ItemID: string;
    Tag: string;
    Weight: number | null;
    __mj_CreatedAt: string;
}

/**
 * Lightweight projection of a ContentItem row (simple RunView mode).
 */
interface ContentItemIDRow {
    ID: string;
}

/**
 * Framework-agnostic (server + client safe) analytics engine for the Knowledge
 * Hub classify pipeline. Aggregates `MJ: Content Item Tags` / `MJ: Content Items`
 * into display-ready summaries so agents and UI can share the same numbers.
 *
 * Every method:
 *   - accepts an optional {@link ClassifyAnalyticsScope}, `contextUser`, and `provider`,
 *   - batches reads with RunView/RunViews using `ResultType: 'simple'` + narrow Fields,
 *   - never queries per-item inside a loop,
 *   - returns plain typed result objects (no BaseEntity instances).
 *
 * @example
 * ```typescript
 * const kpis = await ClassifyAnalyticsEngine.Instance.GetKPIs(
 *   { ContentSourceIDs: [sourceID], StartDate: lastMonth }, contextUser);
 * ```
 */
export class ClassifyAnalyticsEngine extends BaseSingleton<ClassifyAnalyticsEngine> {
    // Constructor must be public to satisfy BaseSingleton.getInstance() constraint
    public constructor() {
        super();
    }

    public static get Instance(): ClassifyAnalyticsEngine {
        return ClassifyAnalyticsEngine.getInstance<ClassifyAnalyticsEngine>();
    }

    private static readonly CONTENT_ITEM_TAGS_ENTITY = 'MJ: Content Item Tags';
    private static readonly CONTENT_ITEMS_ENTITY = 'MJ: Content Items';
    /** Default number of bins for the weight histogram (0-0.1, 0.1-0.2, ...). */
    private static readonly DEFAULT_HISTOGRAM_BINS = 10;

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Tag distribution: a descending list of (tag -> count) within scope.
     *
     * @param scope - Optional source / content-type / date-range filter.
     * @param contextUser - User context for server-side data operations.
     * @param provider - Optional metadata provider for multi-provider contexts.
     * @param limit - Optional cap on the number of distinct tags returned (top-N by count).
     */
    public async GetTagDistribution(
        scope?: ClassifyAnalyticsScope,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
        limit?: number
    ): Promise<TagDistributionEntry[]> {
        const rows = await this.loadScopedTagRows(['Tag'], scope, contextUser, provider);
        if (rows == null) return [];

        const counts = new Map<string, number>();
        for (const row of rows) {
            const tag = (row.Tag ?? '').trim();
            if (tag.length === 0) continue;
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }

        const result: TagDistributionEntry[] = Array.from(counts.entries())
            .map(([Tag, Count]) => ({ Tag, Count }))
            .sort((a, b) => b.Count - a.Count);

        return limit != null && limit > 0 ? result.slice(0, limit) : result;
    }

    /**
     * Items-over-time: tag counts bucketed by the chosen granularity (tag
     * application date = ContentItemTag.__mj_CreatedAt). Returns buckets in
     * ascending chronological order; empty intervals are omitted.
     *
     * @param granularity - 'day' | 'week' | 'month' (default 'day').
     * @param scope - Optional source / content-type / date-range filter.
     * @param contextUser - User context for server-side data operations.
     * @param provider - Optional metadata provider for multi-provider contexts.
     */
    public async GetItemsOverTime(
        granularity: TimeBucketGranularity = 'day',
        scope?: ClassifyAnalyticsScope,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<ItemsOverTimeBucket[]> {
        const rows = await this.loadScopedTagRows(['__mj_CreatedAt'], scope, contextUser, provider);
        if (rows == null) return [];

        const counts = new Map<string, number>();
        for (const row of rows) {
            const createdAt = this.parseDate(row.__mj_CreatedAt);
            if (!createdAt) continue;
            const key = this.bucketKey(createdAt, granularity);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        return Array.from(counts.entries())
            .map(([BucketStart, Count]) => ({ BucketStart, Count }))
            .sort((a, b) => a.BucketStart.localeCompare(b.BucketStart));
    }

    /**
     * Confidence / weight histogram: distribution of ContentItemTag.Weight
     * across `binCount` equal-width bins spanning [0, 1].
     *
     * @param binCount - Number of bins (default 10). Clamped to >= 1.
     * @param scope - Optional source / content-type / date-range filter.
     * @param contextUser - User context for server-side data operations.
     * @param provider - Optional metadata provider for multi-provider contexts.
     */
    public async GetWeightHistogram(
        binCount: number = ClassifyAnalyticsEngine.DEFAULT_HISTOGRAM_BINS,
        scope?: ClassifyAnalyticsScope,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<WeightHistogramBin[]> {
        const bins = Math.max(1, Math.floor(binCount));
        const rows = await this.loadScopedTagRows(['Weight'], scope, contextUser, provider);

        const histogram: WeightHistogramBin[] = [];
        for (let i = 0; i < bins; i++) {
            histogram.push({
                RangeStart: i / bins,
                RangeEnd: (i + 1) / bins,
                Count: 0,
            });
        }
        if (rows == null) return histogram;

        for (const row of rows) {
            const weight = typeof row.Weight === 'number' ? row.Weight : null;
            if (weight == null || Number.isNaN(weight)) continue;
            const clamped = Math.max(0, Math.min(1, weight));
            // Final bin is inclusive of 1.0; others are [start, end).
            let idx = Math.floor(clamped * bins);
            if (idx >= bins) idx = bins - 1;
            histogram[idx].Count++;
        }

        return histogram;
    }

    /**
     * Coverage: how many in-scope content items have at least one tag vs none.
     * Note: the date-range portion of scope is intentionally NOT applied here —
     * coverage is a property of items vs. their tags, not of when a tag was
     * applied. Source / content-type scoping IS applied.
     *
     * @param scope - Optional source / content-type filter (date range ignored).
     * @param contextUser - User context for server-side data operations.
     * @param provider - Optional metadata provider for multi-provider contexts.
     */
    public async GetCoverage(
        scope?: ClassifyAnalyticsScope,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<CoverageSummary> {
        const rv = this.runViewFor(provider);

        // Two independent reads — batch them with RunViews.
        const itemFilter = this.buildContentItemFilter(scope);
        const tagFilter = this.buildTagDateFilter(scope); // date filter only; item scope applied post-join

        const [itemResult, tagResult] = await rv.RunViews([
            {
                EntityName: ClassifyAnalyticsEngine.CONTENT_ITEMS_ENTITY,
                ExtraFilter: itemFilter,
                Fields: ['ID'],
                ResultType: 'simple',
            } as RunViewParams,
            {
                EntityName: ClassifyAnalyticsEngine.CONTENT_ITEM_TAGS_ENTITY,
                ExtraFilter: tagFilter,
                Fields: ['ItemID'],
                ResultType: 'simple',
            } as RunViewParams,
        ], contextUser);

        if (!itemResult.Success) {
            LogError(`ClassifyAnalyticsEngine.GetCoverage: failed to load content items: ${itemResult.ErrorMessage}`);
            return { TotalItems: 0, TaggedItems: 0, UntaggedItems: 0, CoverageRatio: 0 };
        }

        const itemIDs = (itemResult.Results as ContentItemIDRow[]).map(r => r.ID.toUpperCase());
        const itemIDSet = new Set(itemIDs);
        const totalItems = itemIDSet.size;

        const taggedItemIDs = new Set<string>();
        if (tagResult.Success) {
            for (const t of tagResult.Results as { ItemID: string }[]) {
                const id = (t.ItemID ?? '').toUpperCase();
                // Only count items that are in scope (handles source/content-type scope).
                if (itemIDSet.has(id)) taggedItemIDs.add(id);
            }
        } else {
            LogError(`ClassifyAnalyticsEngine.GetCoverage: failed to load tags: ${tagResult.ErrorMessage}`);
        }

        const taggedItems = taggedItemIDs.size;
        const untaggedItems = Math.max(0, totalItems - taggedItems);
        return {
            TotalItems: totalItems,
            TaggedItems: taggedItems,
            UntaggedItems: untaggedItems,
            CoverageRatio: totalItems > 0 ? taggedItems / totalItems : 0,
        };
    }

    /**
     * KPIs summary: total items, total tags, average tags/item, distinct tags.
     *
     * @param scope - Optional source / content-type / date-range filter.
     *   (Source/content-type apply to items + tags; date range applies to tags.)
     * @param contextUser - User context for server-side data operations.
     * @param provider - Optional metadata provider for multi-provider contexts.
     */
    public async GetKPIs(
        scope?: ClassifyAnalyticsScope,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<ClassifyKPIs> {
        const rv = this.runViewFor(provider);
        const itemFilter = this.buildContentItemFilter(scope);
        const tagDateFilter = this.buildTagDateFilter(scope);

        const [itemResult, tagResult] = await rv.RunViews([
            {
                EntityName: ClassifyAnalyticsEngine.CONTENT_ITEMS_ENTITY,
                ExtraFilter: itemFilter,
                Fields: ['ID'],
                ResultType: 'simple',
            } as RunViewParams,
            {
                EntityName: ClassifyAnalyticsEngine.CONTENT_ITEM_TAGS_ENTITY,
                ExtraFilter: tagDateFilter,
                Fields: ['ItemID', 'Tag'],
                ResultType: 'simple',
            } as RunViewParams,
        ], contextUser);

        if (!itemResult.Success) {
            LogError(`ClassifyAnalyticsEngine.GetKPIs: failed to load content items: ${itemResult.ErrorMessage}`);
            return { TotalItems: 0, TotalTags: 0, AvgTagsPerItem: 0, DistinctTags: 0 };
        }

        const itemIDSet = new Set((itemResult.Results as ContentItemIDRow[]).map(r => r.ID.toUpperCase()));
        const totalItems = itemIDSet.size;

        let totalTags = 0;
        const distinct = new Set<string>();
        if (tagResult.Success) {
            for (const t of tagResult.Results as { ItemID: string; Tag: string }[]) {
                // Apply source/content-type scope by intersecting against in-scope items.
                if (!itemIDSet.has((t.ItemID ?? '').toUpperCase())) continue;
                totalTags++;
                const tag = (t.Tag ?? '').trim();
                if (tag.length > 0) distinct.add(tag.toLowerCase());
            }
        } else {
            LogError(`ClassifyAnalyticsEngine.GetKPIs: failed to load tags: ${tagResult.ErrorMessage}`);
        }

        return {
            TotalItems: totalItems,
            TotalTags: totalTags,
            AvgTagsPerItem: totalItems > 0 ? totalTags / totalItems : 0,
            DistinctTags: distinct.size,
        };
    }

    // ========================================================================
    // Scope resolution / loading helpers
    // ========================================================================

    /**
     * Load ContentItemTag rows narrowed to the requested fields and scope.
     * Returns null on a hard failure (so callers can short-circuit), or [] when
     * the scope resolves to no items.
     *
     * When the scope includes source/content-type filters, we first resolve the
     * matching ContentItem IDs (one RunView), then constrain the tag query with
     * `ItemID IN (...)`. The date range is applied directly on the tag rows.
     */
    private async loadScopedTagRows(
        extraFields: Array<keyof ContentItemTagRow>,
        scope: ClassifyAnalyticsScope | undefined,
        contextUser: UserInfo | undefined,
        provider: IMetadataProvider | undefined
    ): Promise<ContentItemTagRow[] | null> {
        const rv = this.runViewFor(provider);

        const itemScopeFilter = this.buildContentItemFilter(scope);
        let itemIDFilter = '';
        if (itemScopeFilter.length > 0) {
            const itemIDs = await this.resolveScopedItemIDs(itemScopeFilter, contextUser, provider);
            if (itemIDs == null) return null;
            if (itemIDs.length === 0) return [];
            itemIDFilter = this.buildItemIDInFilter(itemIDs);
        }

        const dateFilter = this.buildTagDateFilter(scope);
        const filter = this.combineFilters([itemIDFilter, dateFilter]);

        // Always request the join key + caller's fields; de-dupe.
        const fieldSet = new Set<string>(['ItemID', ...extraFields.map(f => String(f))]);

        const result = await rv.RunView<ContentItemTagRow>({
            EntityName: ClassifyAnalyticsEngine.CONTENT_ITEM_TAGS_ENTITY,
            ExtraFilter: filter,
            Fields: Array.from(fieldSet),
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            LogError(`ClassifyAnalyticsEngine.loadScopedTagRows: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results;
    }

    /**
     * Resolve the set of ContentItem IDs matching a source/content-type filter.
     * Returns null on failure.
     */
    private async resolveScopedItemIDs(
        itemFilter: string,
        contextUser: UserInfo | undefined,
        provider: IMetadataProvider | undefined
    ): Promise<string[] | null> {
        const rv = this.runViewFor(provider);
        const result = await rv.RunView<ContentItemIDRow>({
            EntityName: ClassifyAnalyticsEngine.CONTENT_ITEMS_ENTITY,
            ExtraFilter: itemFilter,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            LogError(`ClassifyAnalyticsEngine.resolveScopedItemIDs: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results.map(r => r.ID);
    }

    // ========================================================================
    // Filter builders
    // ========================================================================

    /** Build the `ContentItem`-level filter (source + content-type). Empty when no item scope. */
    private buildContentItemFilter(scope?: ClassifyAnalyticsScope): string {
        const clauses: string[] = [];
        if (scope?.ContentSourceIDs && scope.ContentSourceIDs.length > 0) {
            clauses.push(`ContentSourceID IN (${this.quoteIDs(scope.ContentSourceIDs)})`);
        }
        if (scope?.ContentTypeIDs && scope.ContentTypeIDs.length > 0) {
            clauses.push(`ContentTypeID IN (${this.quoteIDs(scope.ContentTypeIDs)})`);
        }
        return clauses.join(' AND ');
    }

    /** Build the `ContentItemTag`-level date-range filter. Empty when no date scope. */
    private buildTagDateFilter(scope?: ClassifyAnalyticsScope): string {
        const clauses: string[] = [];
        if (scope?.StartDate) {
            clauses.push(`__mj_CreatedAt >= '${this.toSqlDate(scope.StartDate)}'`);
        }
        if (scope?.EndDate) {
            clauses.push(`__mj_CreatedAt <= '${this.toSqlDate(scope.EndDate)}'`);
        }
        return clauses.join(' AND ');
    }

    /** Build an `ItemID IN (...)` filter from a list of resolved item IDs. */
    private buildItemIDInFilter(itemIDs: string[]): string {
        return `ItemID IN (${this.quoteIDs(itemIDs)})`;
    }

    /** Combine non-empty filter fragments with AND. */
    private combineFilters(parts: string[]): string {
        const nonEmpty = parts.filter(p => p && p.length > 0);
        return nonEmpty.length > 0 ? nonEmpty.map(p => `(${p})`).join(' AND ') : '';
    }

    /** Quote and comma-join a list of UUIDs for an IN clause. Strips single quotes defensively. */
    private quoteIDs(ids: string[]): string {
        return ids.map(id => `'${String(id).replace(/'/g, '')}'`).join(', ');
    }

    /** Format a Date for a SQL string literal (UTC ISO, no timezone suffix issues). */
    private toSqlDate(d: Date): string {
        return d.toISOString();
    }

    // ========================================================================
    // Time bucketing
    // ========================================================================

    /** Parse a date value defensively from a simple RunView projection. */
    private parseDate(value: string | null | undefined): Date | null {
        if (!value) return null;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    /** Compute the ISO bucket key (start of period, UTC) for a date at the given granularity. */
    private bucketKey(d: Date, granularity: TimeBucketGranularity): string {
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth();
        const day = d.getUTCDate();

        if (granularity === 'month') {
            return new Date(Date.UTC(year, month, 1)).toISOString();
        }
        if (granularity === 'week') {
            // Truncate to the most recent Monday (UTC).
            const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
            const diffToMonday = (dayOfWeek + 6) % 7;
            const monday = new Date(Date.UTC(year, month, day - diffToMonday));
            return monday.toISOString();
        }
        // day
        return new Date(Date.UTC(year, month, day)).toISOString();
    }

    // ========================================================================
    // Provider plumbing
    // ========================================================================

    /**
     * Build a RunView bound to the supplied provider, or the global default.
     * Per CLAUDE.md, prefer the explicitly-passed provider in multi-provider
     * contexts; fall back to the process-global default only when none given.
     */
    private runViewFor(provider?: IMetadataProvider): RunView {
        if (provider) {
            return RunView.FromMetadataProvider(provider);
        }
        return new RunView();
    }
}
