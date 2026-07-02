/**
 * @fileoverview Pure helpers for the System Diagnostics dashboard's AI-agent
 * integration.
 *
 * 🚨 SAFETY BOUNDARY — READ-ONLY DIAGNOSTIC METRICS ONLY 🚨
 * System Diagnostics is a monitoring surface. These helpers shape the
 * component's current read-only diagnostic state (navigation, aggregate metrics,
 * and bounded *names* of engines / redundantly-loaded entities / slow operations
 * / telemetry categories) into the key-value context object that flows to the
 * agent via `NavigationService.SetAgentContext`. They are framework-agnostic so
 * the shape can be unit-tested in isolation — including an explicit assertion
 * that no secret-bearing key (token / password / credential / connection string)
 * can ever appear.
 *
 * What flows out: section/perf-tab navigation, telemetry on/off + source,
 * category filter, slow-query threshold, aggregate metrics (engine count, memory
 * bytes, redundant-load count, cache hit/miss/size, event/pattern/insight
 * counts), and BOUNDED diagnostic NAMES (engine class names, redundantly-loaded
 * entity names, slow-operation labels, telemetry category breakdown). These are
 * runtime *shape* metrics — class names, entity names, op names, durations.
 * What NEVER flows out: raw telemetry payloads / filter SQL bodies, cache entry
 * VALUES, query results, or any secret. No such value is passed INTO this helper.
 */

import { boundNameList } from '../shared/agent-tool-validation';

/** The four top-level sections the diagnostics dashboard exposes. */
export const VALID_DIAGNOSTICS_SECTIONS = ['engines', 'redundant', 'performance', 'cache'] as const;
/** Union of the valid diagnostics section ids. */
export type DiagnosticsSection = (typeof VALID_DIAGNOSTICS_SECTIONS)[number];

/** The five performance sub-tabs. */
export const VALID_PERF_TABS = ['monitor', 'overview', 'events', 'patterns', 'insights'] as const;
/** Union of the valid performance sub-tab ids. */
export type PerfTab = (typeof VALID_PERF_TABS)[number];

/** The telemetry category filter values (including the "all" sentinel). */
export const VALID_TELEMETRY_CATEGORIES = ['all', 'RunView', 'RunQuery', 'Engine', 'AI', 'Cache'] as const;
/** Union of the valid telemetry category-filter values. */
export type TelemetryCategoryFilter = (typeof VALID_TELEMETRY_CATEGORIES)[number];

/** Type-guard for a diagnostics section string. */
export function isValidDiagnosticsSection(section: unknown): section is DiagnosticsSection {
    return typeof section === 'string' && (VALID_DIAGNOSTICS_SECTIONS as readonly string[]).includes(section);
}

/** Type-guard for a performance sub-tab string. */
export function isValidPerfTab(tab: unknown): tab is PerfTab {
    return typeof tab === 'string' && (VALID_PERF_TABS as readonly string[]).includes(tab);
}

/** One read-only telemetry-category breakdown row. */
export interface DiagnosticsCategoryBreakdown {
    Name: string;
    Events: number;
    AvgMs: number;
}

/** One read-only slow-operation summary (op/entity name + duration only). */
export interface DiagnosticsSlowOpSummary {
    Label: string;
    Category: string;
    ElapsedMs: number;
}

/**
 * The plain, component-supplied snapshot used to build the diagnostics context.
 * By construction this carries ONLY read-only navigation + diagnostic metrics +
 * shape names — there is no field for a cache value, telemetry payload, or
 * secret, so none can be published.
 */
export interface SystemDiagnosticsAgentContextInput {
    // ---- Navigation ----
    ActiveSection: DiagnosticsSection;
    PerfTab: PerfTab;
    TelemetrySource: 'client' | 'server';
    TelemetryEnabled: boolean;
    ServerTelemetryEnabled: boolean;
    /**
     * Active telemetry category filter. Typed as `string` (not the narrower
     * {@link TelemetryCategoryFilter}) because the component's runtime filter
     * union includes categories the agent's `FilterTelemetryByCategory` tool does
     * not expose (e.g. Network / Coalesce / Custom). It is published as-is; the
     * tool itself validates agent input against {@link VALID_TELEMETRY_CATEGORIES}.
     */
    CategoryFilter: string;
    SlowQueryThresholdMs: number;

    // ---- Engine metrics ----
    EngineCount: number;
    LoadedEngineCount: number;
    TotalMemoryBytes: number;
    TotalMemoryDisplay: string;
    EngineNames: readonly string[];

    // ---- Redundant loading ----
    RedundantLoadCount: number;
    RedundantEntityNames: readonly string[];

    // ---- Telemetry ----
    TotalEvents: number;
    TotalPatterns: number;
    TotalInsights: number;
    ActiveEvents: number;
    SlowQueryCount: number;
    SlowOperations: readonly DiagnosticsSlowOpSummary[];
    CategoryBreakdown: readonly DiagnosticsCategoryBreakdown[];

    // ---- Cache (counts + sizes only; never entry values) ----
    CacheInitialized: boolean;
    CacheTotalEntries: number;
    CacheTotalSizeBytes: number;
    CacheHits: number;
    CacheMisses: number;
    CacheHitRate: number;
    CacheDatasetCount: number;
    CacheRunViewCount: number;
    CacheRunQueryCount: number;
}

/**
 * Build the agent-visible context object for the System Diagnostics dashboard.
 *
 * Returns a flat key-value object of read-only diagnostic metrics + bounded
 * shape names only. Name lists are capped (via {@link boundNameList}) with a
 * companion truncation flag. Pure (no `this`) so the shape is unit-testable and
 * the test can assert no secret-bearing key can ever appear.
 */
export function buildSystemDiagnosticsAgentContext(input: SystemDiagnosticsAgentContextInput): Record<string, unknown> {
    const engineNames = boundNameList(input.EngineNames);
    const redundantNames = boundNameList(input.RedundantEntityNames);

    return {
        // Navigation
        ActiveSection: input.ActiveSection,
        PerfTab: input.PerfTab,
        TelemetrySource: input.TelemetrySource,
        TelemetryEnabled: input.TelemetryEnabled,
        ServerTelemetryEnabled: input.ServerTelemetryEnabled,
        CategoryFilter: input.CategoryFilter,
        SlowQueryThresholdMs: input.SlowQueryThresholdMs,

        // Engines
        EngineCount: input.EngineCount,
        LoadedEngineCount: input.LoadedEngineCount,
        TotalMemoryBytes: input.TotalMemoryBytes,
        TotalMemoryDisplay: input.TotalMemoryDisplay,
        EngineNames: engineNames,
        EngineNamesTruncated: engineNames.length < input.EngineNames.length,

        // Redundant loading
        RedundantLoadCount: input.RedundantLoadCount,
        RedundantEntityNames: redundantNames,
        RedundantEntityNamesTruncated: redundantNames.length < input.RedundantEntityNames.length,

        // Telemetry aggregates
        TotalEvents: input.TotalEvents,
        TotalPatterns: input.TotalPatterns,
        TotalInsights: input.TotalInsights,
        ActiveEvents: input.ActiveEvents,
        SlowQueryCount: input.SlowQueryCount,
        SlowOperations: input.SlowOperations.slice(0, 10).map(o => ({
            Label: o.Label,
            Category: o.Category,
            ElapsedMs: o.ElapsedMs,
        })),
        CategoryBreakdown: input.CategoryBreakdown.map(c => ({
            Name: c.Name,
            Events: c.Events,
            AvgMs: c.AvgMs,
        })),

        // Cache (counts + sizes only)
        CacheInitialized: input.CacheInitialized,
        CacheTotalEntries: input.CacheTotalEntries,
        CacheTotalSizeBytes: input.CacheTotalSizeBytes,
        CacheHits: input.CacheHits,
        CacheMisses: input.CacheMisses,
        CacheHitRate: input.CacheHitRate,
        CacheDatasetCount: input.CacheDatasetCount,
        CacheRunViewCount: input.CacheRunViewCount,
        CacheRunQueryCount: input.CacheRunQueryCount,
    };
}
