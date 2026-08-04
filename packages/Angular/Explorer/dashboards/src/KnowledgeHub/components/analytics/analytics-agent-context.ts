/**
 * @fileoverview Pure, framework-agnostic helpers for the Knowledge Hub
 * "Analytics" resource's AI-agent integration.
 *
 * These functions are free of Angular / component dependencies so they can be
 * unit-tested in isolation. The component
 * ({@link AnalyticsResourceComponent}) supplies a plain snapshot of its current
 * state (active tab, filters, and the per-tab aggregate values it has computed)
 * and these helpers shape it into the key-value `AgentContext` object that flows
 * to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`. They also resolve agent-supplied
 * references (a source by name, a tab id) the way a user refers to them.
 *
 * 🚨 SAFETY: these helpers only SHAPE read-only aggregate state and RESOLVE
 * references — no mutation, no side effects. Nothing here exposes raw record
 * bodies; only the aggregate metrics, filters, and salient display names the
 * surface already shows on screen.
 */

/** The analytics navigation tabs the surface exposes. */
export const ANALYTICS_TABS = ['overview', 'tags', 'sources', 'pipeline', 'quality', 'cost'] as const;

/** An Analytics tab id. */
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

/** Type-guard for an Analytics tab id; keeps the switch tool tolerant of bad input. */
export function isValidAnalyticsTab(tab: unknown): tab is AnalyticsTab {
    return typeof tab === 'string' && (ANALYTICS_TABS as readonly string[]).includes(tab);
}

/** The date-range filter labels the surface offers. */
export const ANALYTICS_DATE_RANGES = ['7D', '30D', '90D', 'YTD', 'All'] as const;

/** An Analytics date-range label. */
export type AnalyticsDateRange = (typeof ANALYTICS_DATE_RANGES)[number];

/** Type-guard for a date-range label; keeps the date-range tool tolerant. */
export function isValidAnalyticsDateRange(range: unknown): range is AnalyticsDateRange {
    return typeof range === 'string' && (ANALYTICS_DATE_RANGES as readonly string[]).includes(range);
}

/** Upper bound on how many list entries we publish in any one context field. */
export const ANALYTICS_CONTEXT_LIST_CAP = 25;

/** Cap an array to {@link ANALYTICS_CONTEXT_LIST_CAP} entries. Pure; never mutates input. */
export function capAnalyticsList<T>(items: readonly T[]): T[] {
    return items.slice(0, ANALYTICS_CONTEXT_LIST_CAP);
}

/**
 * Resolve an agent-supplied name reference (case-insensitive) against a list of
 * available names. Tries exact match first, then first case-insensitive
 * *contains* match. Pure + deterministic; returns the matched name or null.
 *
 * @param input - whatever the agent passed (a source name, an entity-filter label)
 * @param names - the names available on the surface
 */
export function resolveAnalyticsName(input: string, names: readonly string[]): string | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const exact = names.find(n => n.toLowerCase() === needle);
    if (exact) {
        return exact;
    }
    return names.find(n => n.toLowerCase().includes(needle)) ?? null;
}

/**
 * A "no match" tolerant error for a name lookup. Lists the available names
 * (bounded) so the agent can retry. Never throws.
 */
export function buildAnalyticsNotFoundError(
    input: string,
    availableNames: readonly string[],
    noun: string,
): { Success: false; ErrorMessage: string } {
    const sample = capAnalyticsList(availableNames);
    const listed = sample.length > 0 ? sample.join(', ') : '(none available)';
    const more = availableNames.length > sample.length ? `, … (${availableNames.length} total)` : '';
    return {
        Success: false,
        ErrorMessage: `No ${noun} matches "${input}". Available ${noun}s: ${listed}${more}.`,
    };
}

/** A KPI summary (label + value) shown on the overview tab. */
export interface AnalyticsKPI {
    Label: string;
    Value: string;
    Delta: string;
}

/** A top-tag summary the tags tab shows (name, usage, avg weight, top entity). */
export interface AnalyticsTopTag {
    Name: string;
    UsageCount: number;
    AvgWeight: number;
    TopEntity: string;
}

/** A source-comparison summary the sources tab shows. */
export interface AnalyticsSourceSummary {
    Name: string;
    Items: number;
    AvgWeight: number;
    Status: string;
}

/** A co-occurring tag-pair summary the tags tab shows. */
export interface AnalyticsCoOccurrencePair {
    TagAName: string;
    TagBName: string;
    Count: number;
}

/** A cost-KPI summary the cost tab shows. */
export interface AnalyticsCostKPI {
    Label: string;
    Value: string;
}

/**
 * The plain, component-supplied snapshot used to build the Analytics agent
 * context. Mirrors the salient slice of the component's state: the active tab,
 * the date-range + entity filters, whether data is loading / a drill-down is
 * open, the always-on KPI strip, and the active tab's deep slice.
 */
export interface AnalyticsAgentContextInput {
    /** The active analytics tab. */
    ActiveTab: AnalyticsTab;
    /** The active date-range filter label. */
    DateRange: string;
    /** The active entity-filter label. */
    EntityFilter: string;
    /** The entity-filter labels the surface offers. */
    EntityFilterOptions: string[];
    /** Whether the surface is still loading its raw data. */
    IsLoading: boolean;
    /** The open drill-down target key, or null when none. */
    DrillDownTarget: string | null;
    /** Always-on KPI strip (label/value/delta). Component supplies all; helper bounds. */
    KPIs: AnalyticsKPI[];
    /** Pipeline status text shown in the sidebar. */
    PipelineStatusText: string;
    /** Whether the pipeline status is OK (vs error). */
    PipelineStatusOk: boolean;
    /** Tags-tab: the top tags. Component supplies all; helper bounds. */
    TopTags: AnalyticsTopTag[];
    /** Tags-tab: co-occurring tag pairs. */
    CoOccurrencePairs: AnalyticsCoOccurrencePair[];
    /** Tags-tab: when co-occurrence was last computed (relative), or null. */
    CoOccurrenceLastComputed: string | null;
    /** Sources-tab: the source comparison rows. */
    SourceComparison: AnalyticsSourceSummary[];
    /** Sources-tab: the currently selected source name. */
    SelectedSourceName: string;
    /** Quality-tab: the quality score (0-100). */
    QualityScore: number;
    /** Quality-tab: confidence stats (label/value pairs). */
    ConfidenceStats: { Label: string; Value: string }[];
    /** Cost-tab: the cost KPIs. */
    CostKPIs: AnalyticsCostKPI[];
}

/** Build the always-on KPI / filter slice shared across every tab. */
function buildCommonSlice(input: AnalyticsAgentContextInput): Record<string, unknown> {
    return {
        ActiveTab: input.ActiveTab,
        DateRange: input.DateRange,
        EntityFilter: input.EntityFilter,
        AvailableEntityFilters: capAnalyticsList(input.EntityFilterOptions),
        IsLoading: input.IsLoading,
        DrillDownOpen: input.DrillDownTarget != null,
        DrillDownTarget: input.DrillDownTarget,
        KPIs: capAnalyticsList(input.KPIs.map(k => ({ Label: k.Label, Value: k.Value, Delta: k.Delta }))),
        PipelineStatusText: input.PipelineStatusText,
        PipelineStatusOk: input.PipelineStatusOk,
    };
}

/** Build the tags-tab deep slice. */
function buildTagsSlice(input: AnalyticsAgentContextInput): Record<string, unknown> {
    const slice: Record<string, unknown> = {
        TopTags: capAnalyticsList(input.TopTags),
        TopTagCount: input.TopTags.length,
    };
    if (input.CoOccurrencePairs.length > 0) {
        slice['CoOccurrencePairs'] = capAnalyticsList(input.CoOccurrencePairs);
        slice['CoOccurrenceLastComputed'] = input.CoOccurrenceLastComputed;
    }
    return slice;
}

/** Build the sources-tab deep slice. */
function buildSourcesSlice(input: AnalyticsAgentContextInput): Record<string, unknown> {
    return {
        SourceComparison: capAnalyticsList(input.SourceComparison),
        SourceCount: input.SourceComparison.length,
        SelectedSourceName: input.SelectedSourceName || null,
        AvailableSourceNames: capAnalyticsList(input.SourceComparison.map(s => s.Name)),
    };
}

/** Build the quality-tab deep slice. */
function buildQualitySlice(input: AnalyticsAgentContextInput): Record<string, unknown> {
    return {
        QualityScore: input.QualityScore,
        ConfidenceStats: capAnalyticsList(input.ConfidenceStats),
    };
}

/** Build the cost-tab deep slice. */
function buildCostSlice(input: AnalyticsAgentContextInput): Record<string, unknown> {
    return {
        CostKPIs: capAnalyticsList(input.CostKPIs),
    };
}

/**
 * Build the agent-visible context object for the Analytics surface. The active
 * tab decides which deep slice is merged onto the always-on common slice
 * (mode-scoped context). Pure function (no `this`) so it's unit-testable.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildAnalyticsAgentContext(input: AnalyticsAgentContextInput): Record<string, unknown> {
    const context = buildCommonSlice(input);

    switch (input.ActiveTab) {
        case 'tags':
            return { ...context, ...buildTagsSlice(input) };
        case 'sources':
            return { ...context, ...buildSourcesSlice(input) };
        case 'quality':
            return { ...context, ...buildQualitySlice(input) };
        case 'cost':
            return { ...context, ...buildCostSlice(input) };
        case 'overview':
        case 'pipeline':
        default:
            return context;
    }
}
