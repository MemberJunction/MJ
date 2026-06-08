import { BaseSingleton } from '@memberjunction/global';
import { UserInfo, RunView, LogError, IMetadataProvider } from '@memberjunction/core';
import { TagCoOccurrenceEngine } from './TagCoOccurrenceEngine';

/**
 * Scope filter applied when building a tag cloud. All fields are optional; an
 * empty / undefined scope means "all classify data the context user can see".
 *
 * Source / content-type filters constrain the underlying `MJ: Content Items`
 * (those columns live on the item, not the tag). The date range constrains the
 * `MJ: Content Item Tags.__mj_CreatedAt` (when the tag was applied). The tag-root
 * filter constrains which tags are eligible by their resolved tag IDs.
 *
 * Mirrors {@link ClassifyAnalyticsScope}'s style so the two engines share the
 * same scoping vocabulary on the Knowledge Hub "Visualize" surface.
 */
export interface TagCloudScope {
    /** Restrict to items from these content sources (OR-ed). */
    ContentSourceIDs?: string[];
    /** Restrict to items of these content types (OR-ed). */
    ContentTypeIDs?: string[];
    /** Only count tags created at/after this date (inclusive). */
    StartDate?: Date;
    /** Only count tags created at/before this date (inclusive). */
    EndDate?: Date;
    /**
     * Restrict the cloud to tags that are (transitively) under one of these tag
     * roots. Resolved against `MJ: Tags` (ID or ParentID chain). When omitted,
     * all tags in scope are eligible.
     */
    TagRootIDs?: string[];
}

/**
 * Options that shape the weighting / pruning of the produced cloud.
 */
export interface TagCloudOptions {
    /**
     * Cap on the number of items returned (top-N by weight). Applied after
     * min-weight filtering. When omitted or <= 0, all qualifying items return.
     */
    Limit?: number;
    /**
     * Minimum normalized weight (0.0 - 1.0) an item must reach to be included.
     * Defaults to 0 (no threshold). Items below this are dropped.
     */
    MinWeight?: number;
    /**
     * When true, blend co-occurrence "connectedness" (from
     * {@link TagCoOccurrenceEngine}) into the weight so well-connected tags are
     * boosted relative to a pure-frequency weighting. Defaults to false
     * (frequency-only). See {@link TagCloudEngine.GetTagCloud} for the formula.
     */
    IncludeCoOccurrence?: boolean;
    /**
     * Blend factor in [0, 1] for co-occurrence when `IncludeCoOccurrence` is
     * true: `weight = (1 - f) * freqNorm + f * coOccNorm`. Defaults to 0.5.
     * Ignored when `IncludeCoOccurrence` is false.
     */
    CoOccurrenceBlend?: number;
}

/**
 * A single weighted entry in a tag cloud.
 *
 * Maps 1:1 to the `WordCloudItem` interface consumed by
 * `@memberjunction/ng-word-cloud` (`packages/Angular/Generic/word-cloud`):
 *   - {@link Text}     → `WordCloudItem.Text`
 *   - {@link Weight}   → `WordCloudItem.Weight` (normalized 0.0 - 1.0)
 *   - {@link Count}    → carried in `WordCloudItem.Metadata.Count` by the UI
 *
 * Defined locally (rather than imported) so this server-safe engine never takes
 * a dependency on the Angular package. The Angular layer constructs
 * `WordCloudItem`s from these plain objects.
 */
export interface TagCloudItem {
    /** Display text / label of the tag. Maps to `WordCloudItem.Text`. */
    Text: string;
    /**
     * Normalized weight in [0, 1] driving font size in the cloud.
     * Maps to `WordCloudItem.Weight`.
     */
    Weight: number;
    /**
     * Raw frequency: number of content-item-tag rows carrying this tag in scope.
     * Optional pass-through (the UI may surface it via `WordCloudItem.Metadata`).
     */
    Count: number;
}

/**
 * Lightweight projection of a ContentItemTag row (simple RunView mode).
 */
interface ContentItemTagRow {
    ItemID: string;
    Tag: string;
    TagID: string | null;
}

/**
 * Lightweight projection of a ContentItem row (simple RunView mode).
 */
interface ContentItemIDRow {
    ID: string;
}

/**
 * Lightweight projection of a Tag row (simple RunView mode).
 */
interface TagRow {
    ID: string;
    ParentID: string | null;
}

/**
 * Framework-agnostic (server + client safe) engine that produces weighted
 * tag-cloud items for the Knowledge Hub "Visualize" surface's tag-cloud mode.
 *
 * Frequency is sourced by aggregating `MJ: Content Item Tags` within a scope;
 * optional co-occurrence "connectedness" is blended in via
 * {@link TagCoOccurrenceEngine} (reused, not reimplemented). Output items are
 * plain objects that map 1:1 to `@memberjunction/ng-word-cloud`'s `WordCloudItem`.
 *
 * Like {@link ClassifyAnalyticsEngine}, every method accepts an optional
 * {@link TagCloudScope}, `contextUser`, and `provider`, batches reads with
 * RunView using `ResultType: 'simple'` + narrow Fields, never queries per-item
 * inside a loop, and returns plain typed objects (no BaseEntity instances).
 *
 * @example
 * ```typescript
 * const cloud = await TagCloudEngine.Instance.GetTagCloud(
 *   { ContentSourceIDs: [sourceID] },
 *   { Limit: 50, MinWeight: 0.1, IncludeCoOccurrence: true },
 *   contextUser);
 * ```
 */
export class TagCloudEngine extends BaseSingleton<TagCloudEngine> {
    // Constructor must be public to satisfy BaseSingleton.getInstance() constraint
    public constructor() {
        super();
    }

    public static get Instance(): TagCloudEngine {
        return TagCloudEngine.getInstance<TagCloudEngine>();
    }

    private static readonly CONTENT_ITEM_TAGS_ENTITY = 'MJ: Content Item Tags';
    private static readonly CONTENT_ITEMS_ENTITY = 'MJ: Content Items';
    private static readonly TAGS_ENTITY = 'MJ: Tags';
    /** Default blend factor for co-occurrence when enabled. */
    private static readonly DEFAULT_COOCCURRENCE_BLEND = 0.5;

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Produce weighted tag-cloud items for a scope.
     *
     * Weighting:
     *   - Frequency-only (default): each tag's raw count is min-max normalized
     *     across the in-scope set into [0, 1].
     *   - With `IncludeCoOccurrence`: the per-tag co-occurrence total (sum of
     *     counts with all partners) is also min-max normalized, and the final
     *     weight is `(1 - blend) * freqNorm + blend * coOccNorm`.
     *
     * Pruning: `MinWeight` drops low-weight items; `Limit` keeps the top-N by
     * weight (then alphabetical for stable ordering on ties).
     *
     * @param scope - Optional source / content-type / date-range / tag-root filter.
     * @param options - Optional limit / threshold / co-occurrence blending.
     * @param contextUser - User context for server-side data operations.
     * @param provider - Optional metadata provider for multi-provider contexts.
     */
    public async GetTagCloud(
        scope?: TagCloudScope,
        options?: TagCloudOptions,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<TagCloudItem[]> {
        const rows = await this.loadScopedTagRows(scope, contextUser, provider);
        if (rows == null) return [];

        const eligibleTagIDs = await this.resolveTagRootFilter(scope, contextUser, provider);
        if (eligibleTagIDs === null) return []; // tag-root scope resolved to nothing

        const counts = this.accumulateCounts(rows, eligibleTagIDs);
        if (counts.size === 0) return [];

        const coOcc = options?.IncludeCoOccurrence
            ? await this.loadCoOccurrenceTotals(counts, rows, contextUser)
            : null;

        const items = this.buildWeightedItems(counts, coOcc, options);
        return this.pruneAndLimit(items, options);
    }

    // ========================================================================
    // Aggregation
    // ========================================================================

    /**
     * Tally per-tag frequency from the loaded tag rows, restricted (when a
     * tag-root filter is active) to the eligible tag-ID set. Tags are keyed by
     * their trimmed text; the first-seen TagID is retained for co-occurrence.
     */
    private accumulateCounts(
        rows: ContentItemTagRow[],
        eligibleTagIDs: Set<string> | undefined
    ): Map<string, { Count: number; TagID: string | null }> {
        const counts = new Map<string, { Count: number; TagID: string | null }>();
        for (const row of rows) {
            const tag = (row.Tag ?? '').trim();
            if (tag.length === 0) continue;

            const tagID = row.TagID ? row.TagID.toUpperCase() : null;
            // When a tag-root filter is active, only tags with a resolvable,
            // in-set TagID qualify (free-text tags without an ID are excluded).
            if (eligibleTagIDs) {
                if (!tagID || !eligibleTagIDs.has(tagID)) continue;
            }

            const existing = counts.get(tag);
            if (existing) {
                existing.Count++;
                if (!existing.TagID && tagID) existing.TagID = tagID;
            } else {
                counts.set(tag, { Count: 1, TagID: tagID });
            }
        }
        return counts;
    }

    /**
     * Sum co-occurrence counts per in-scope tag using {@link TagCoOccurrenceEngine}.
     * Keyed by tag text so it lines up with the frequency map. Tags without a
     * resolvable TagID contribute 0 (they cannot participate in co-occurrence).
     */
    private async loadCoOccurrenceTotals(
        counts: Map<string, { Count: number; TagID: string | null }>,
        _rows: ContentItemTagRow[],
        contextUser: UserInfo | undefined
    ): Promise<Map<string, number>> {
        const totals = new Map<string, number>();
        if (!contextUser) return totals;

        const engine = TagCoOccurrenceEngine.Instance;
        // Resolve per-tag co-occurrence sums. Each lookup is by tag ID; tags
        // sharing an ID are de-duped so we never query the same tag twice.
        const idToTexts = new Map<string, string[]>();
        for (const [text, info] of counts.entries()) {
            if (!info.TagID) {
                totals.set(text, 0);
                continue;
            }
            const list = idToTexts.get(info.TagID);
            if (list) list.push(text);
            else idToTexts.set(info.TagID, [text]);
        }

        for (const [tagID, texts] of idToTexts.entries()) {
            const related = await engine.GetCoOccurrencesForTag(tagID, contextUser);
            const sum = related.reduce((acc, r) => acc + r.Count, 0);
            for (const text of texts) totals.set(text, sum);
        }
        return totals;
    }

    /**
     * Convert accumulated counts (and optional co-occurrence totals) into
     * normalized, weighted items. Weights are min-max normalized into [0, 1];
     * a single distinct value normalizes to 1.0.
     */
    private buildWeightedItems(
        counts: Map<string, { Count: number; TagID: string | null }>,
        coOcc: Map<string, number> | null,
        options: TagCloudOptions | undefined
    ): TagCloudItem[] {
        const countValues = Array.from(counts.values()).map(v => v.Count);
        const freqNorm = this.makeNormalizer(countValues);

        const blend = coOcc ? this.resolveBlend(options) : 0;
        const coOccNorm = coOcc ? this.makeNormalizer(Array.from(coOcc.values())) : null;

        const items: TagCloudItem[] = [];
        for (const [text, info] of counts.entries()) {
            const fNorm = freqNorm(info.Count);
            let weight = fNorm;
            if (coOcc && coOccNorm) {
                const cNorm = coOccNorm(coOcc.get(text) ?? 0);
                weight = (1 - blend) * fNorm + blend * cNorm;
            }
            items.push({ Text: text, Weight: weight, Count: info.Count });
        }
        return items;
    }

    /**
     * Apply the min-weight threshold and top-N limit. Sorted by weight
     * descending, then alphabetically for deterministic tie-breaking.
     */
    private pruneAndLimit(items: TagCloudItem[], options: TagCloudOptions | undefined): TagCloudItem[] {
        const minWeight = options?.MinWeight ?? 0;
        const filtered = minWeight > 0 ? items.filter(i => i.Weight >= minWeight) : items;

        filtered.sort((a, b) => (b.Weight - a.Weight) || a.Text.localeCompare(b.Text));

        const limit = options?.Limit;
        return limit != null && limit > 0 ? filtered.slice(0, limit) : filtered;
    }

    /**
     * Build a min-max normalizer mapping a raw value into [0, 1] across the
     * supplied population. When all values are equal (or empty), every value
     * maps to 1.0 (a flat cloud rather than all-zero).
     */
    private makeNormalizer(values: number[]): (value: number) => number {
        if (values.length === 0) return () => 1;
        let min = values[0];
        let max = values[0];
        for (const v of values) {
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const range = max - min;
        if (range <= 0) return () => 1;
        return (value: number) => (value - min) / range;
    }

    /** Clamp the configured co-occurrence blend into [0, 1]. */
    private resolveBlend(options: TagCloudOptions | undefined): number {
        const raw = options?.CoOccurrenceBlend ?? TagCloudEngine.DEFAULT_COOCCURRENCE_BLEND;
        return Math.max(0, Math.min(1, raw));
    }

    // ========================================================================
    // Scope resolution / loading helpers
    // ========================================================================

    /**
     * Load ContentItemTag rows (Tag + TagID) narrowed to scope. Returns null on
     * a hard failure, or [] when the source/content-type scope resolves to no
     * items. Mirrors ClassifyAnalyticsEngine's two-step item-resolve approach.
     */
    private async loadScopedTagRows(
        scope: TagCloudScope | undefined,
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

        const result = await rv.RunView<ContentItemTagRow>({
            EntityName: TagCloudEngine.CONTENT_ITEM_TAGS_ENTITY,
            ExtraFilter: filter,
            Fields: ['ItemID', 'Tag', 'TagID'],
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCloudEngine.loadScopedTagRows: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results;
    }

    /**
     * Resolve the set of tag IDs eligible under the scope's tag-root filter.
     * Returns:
     *   - undefined when no tag-root filter is set (all tags eligible),
     *   - null when the filter is set but resolves to no tags (caller short-circuits),
     *   - a Set of uppercased tag IDs (roots + their transitive descendants).
     */
    private async resolveTagRootFilter(
        scope: TagCloudScope | undefined,
        contextUser: UserInfo | undefined,
        provider: IMetadataProvider | undefined
    ): Promise<Set<string> | undefined | null> {
        const roots = scope?.TagRootIDs;
        if (!roots || roots.length === 0) return undefined;

        const rv = this.runViewFor(provider);
        const result = await rv.RunView<TagRow>({
            EntityName: TagCloudEngine.TAGS_ENTITY,
            ExtraFilter: '',
            Fields: ['ID', 'ParentID'],
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCloudEngine.resolveTagRootFilter: ${result.ErrorMessage}`);
            return null;
        }

        const eligible = this.collectDescendantTagIDs(result.Results, roots);
        return eligible.size > 0 ? eligible : null;
    }

    /**
     * Given the full tag list and a set of root IDs, return the roots plus all
     * transitive descendants (by ParentID chain) as an uppercased ID set.
     */
    private collectDescendantTagIDs(tags: TagRow[], roots: string[]): Set<string> {
        const childrenByParent = new Map<string, string[]>();
        for (const t of tags) {
            const parent = t.ParentID ? t.ParentID.toUpperCase() : null;
            if (!parent) continue;
            const list = childrenByParent.get(parent);
            if (list) list.push(t.ID.toUpperCase());
            else childrenByParent.set(parent, [t.ID.toUpperCase()]);
        }

        const eligible = new Set<string>();
        const stack = roots.map(r => r.toUpperCase());
        while (stack.length > 0) {
            const id = stack.pop() as string;
            if (eligible.has(id)) continue;
            eligible.add(id);
            const children = childrenByParent.get(id);
            if (children) stack.push(...children);
        }
        return eligible;
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
            EntityName: TagCloudEngine.CONTENT_ITEMS_ENTITY,
            ExtraFilter: itemFilter,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            LogError(`TagCloudEngine.resolveScopedItemIDs: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results.map(r => r.ID);
    }

    // ========================================================================
    // Filter builders
    // ========================================================================

    /** Build the `ContentItem`-level filter (source + content-type). Empty when no item scope. */
    private buildContentItemFilter(scope?: TagCloudScope): string {
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
    private buildTagDateFilter(scope?: TagCloudScope): string {
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

    /** Format a Date for a SQL string literal (UTC ISO). */
    private toSqlDate(d: Date): string {
        return d.toISOString();
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
