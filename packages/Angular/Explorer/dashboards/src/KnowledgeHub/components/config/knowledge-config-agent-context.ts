/**
 * @fileoverview Pure, framework-agnostic helpers for the Knowledge Hub
 * **Configuration** resource component's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component supplies a plain snapshot
 * of its current state and these helpers shape it into the key-value
 * `AgentContext` object that flows to the async chat agent and the realtime
 * co-agent via `NavigationService.SetAgentContext`, plus the tolerant id→name
 * resolvers the client-tool handlers use.
 *
 * 🔒 SAFETY: these helpers only PROJECT state and RESOLVE references. They
 * perform no mutation and have no side effects.
 */

import { boundNameList, AGENT_CONTEXT_NAME_LIST_CAP } from '../../../shared/agent-tool-validation';

/** A config section descriptor — the salient slice the agent needs to navigate. */
export interface ConfigSectionCandidate {
    ID: string;
    Label: string;
    Description?: string;
}

/** A search-scope descriptor — id + name is all the agent needs to refer to one. */
export interface ConfigScopeCandidate {
    ID: string;
    Name: string;
}

/** A vector-index descriptor for the published index name list. */
export interface ConfigIndexCandidate {
    ID: string;
    Name: string;
}

/**
 * The plain, component-supplied snapshot used to build the Config agent context.
 * Mirrors the salient slice of the component's state — the active section, the
 * full section list, setup completeness, the vector-DB / index / embedding /
 * FTS landscape, the search-scope set + active scope, and the analytics /
 * permissions sub-section load state.
 */
export interface KnowledgeConfigAgentContextInput {
    /** The active section id (e.g. 'pipeline', 'vectordb', 'search-scopes'). */
    ActiveSection: string;
    /** Human label for the active section. */
    ActiveSectionLabel: string;
    /** All sections the agent can switch to. */
    Sections: ConfigSectionCandidate[];
    /** Whether the surface is mid-load. */
    IsLoading: boolean;
    /** Whether there are unsaved configuration edits. */
    HasUnsavedChanges: boolean;
    /** Whether the vector setup (provider + index + embedding model) is complete. */
    VectorSetupComplete: boolean;
    /** Of the 3 setup steps (provider/embedding/index), how many are done. */
    SetupStepsCompleted: number;
    /** Count of configured vector-DB providers. */
    VectorDBProviderCount: number;
    /** Display names of the configured vector-DB providers. */
    VectorDBProviderNames: string[];
    /** Count of configured vector indexes. */
    VectorIndexCount: number;
    /** Configured vector indexes (id + name) — drives the index name list + DeleteIndex resolution. */
    VectorIndexes: ConfigIndexCandidate[];
    /** The selected embedding model name, or '' when none. */
    EmbeddingModelName: string;
    /** Count of available embedding models. */
    EmbeddingModelCount: number;
    /** Count of full-text-searchable entities discovered. */
    FTSEntityCount: number;
    /** Count of FTS entities currently enabled. */
    EnabledFTSCount: number;
    /** The FTS filter text currently applied. */
    FTSFilterText: string;
    /** All search scopes the user can manage (id + name). */
    SearchScopes: ConfigScopeCandidate[];
    /** The active search-scope id, or null. */
    ActiveScopeID: string | null;
    /** Resolved name of the active search scope, or null. */
    ActiveScopeName: string | null;
    /** Which sub-tab of the selected scope is open. */
    ActiveScopeTab: string;
    /** Whether the create-index inline form is open. */
    ShowCreateIndexForm: boolean;
    /** Whether the search-analytics sub-section has loaded its rollup. */
    AnalyticsLoaded: boolean;
    /** Total search runs in the analytics window (only meaningful when loaded). */
    AnalyticsTotalRuns: number;
    /** Whether the permissions-audit sub-section has loaded. */
    PermissionsLoaded: boolean;
    /** Count of permission rows in the audit (only meaningful when loaded). */
    PermissionsRowCount: number;
}

/**
 * Resolve a section reference the way the agent expresses it — by section id
 * (exact, case-insensitive), then by label (exact, case-insensitive), then by a
 * case-insensitive *contains* match on id or label. Pure + deterministic over
 * the supplied section list.
 *
 * @returns the matched section, or null on a miss.
 */
export function resolveConfigSection<T extends ConfigSectionCandidate>(
    input: string,
    sections: readonly T[],
): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) return null;
    const byID = sections.find(s => s.ID.toLowerCase() === needle);
    if (byID) return byID;
    const byLabel = sections.find(s => s.Label.toLowerCase() === needle);
    if (byLabel) return byLabel;
    return sections.find(s =>
        s.ID.toLowerCase().includes(needle) || s.Label.toLowerCase().includes(needle),
    ) ?? null;
}

/**
 * Resolve a search-scope or index reference by id (exact) → name (exact) →
 * name contains, all case-insensitive. Pure + deterministic.
 *
 * @returns the matched candidate, or null on a miss.
 */
export function resolveByIDOrName<T extends { ID: string; Name: string }>(
    input: string,
    candidates: readonly T[],
): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) return null;
    const byID = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byID) return byID;
    const byName = candidates.find(c => c.Name.toLowerCase() === needle);
    if (byName) return byName;
    return candidates.find(c => c.Name.toLowerCase().includes(needle)) ?? null;
}

/**
 * Build a tolerant "not found" error message that lists a bounded sample of the
 * available names so the agent can correct itself.
 */
export function buildConfigNotFoundError(
    input: string,
    kind: string,
    available: readonly string[],
): string {
    const sample = boundNameList(available, 10).join(', ');
    const more = available.length > 10 ? ` (+${available.length - 10} more)` : '';
    return `No ${kind} matches "${input}". Available ${kind}s: ${sample}${more}.`;
}

/**
 * Build the agent-visible context object for the Knowledge Hub Configuration
 * surface. Bounded name lists (cap 25) with companion `*Count` fields when
 * truncated keep the streamed note small even when an install has many scopes
 * or indexes. Sub-section detail (analytics / permissions) is only surfaced when
 * that sub-section has actually loaded its data, so the agent never reads stale
 * or fabricated zeros.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing.
 */
export function buildKnowledgeConfigAgentContext(
    input: KnowledgeConfigAgentContextInput,
): Record<string, unknown> {
    const scopeNames = input.SearchScopes.map(s => s.Name);
    const indexNames = input.VectorIndexes.map(i => i.Name);

    const ctx: Record<string, unknown> = {
        ActiveSection: input.ActiveSection,
        ActiveSectionLabel: input.ActiveSectionLabel,
        SectionCount: input.Sections.length,
        AvailableSections: boundNameList(input.Sections.map(s => s.ID)),
        IsLoading: input.IsLoading,
        HasUnsavedChanges: input.HasUnsavedChanges,

        // Setup landscape
        VectorSetupComplete: input.VectorSetupComplete,
        SetupStepsCompleted: input.SetupStepsCompleted,
        VectorDBProviderCount: input.VectorDBProviderCount,
        VectorDBProviderNames: boundNameList(input.VectorDBProviderNames),
        VectorIndexCount: input.VectorIndexCount,
        VectorIndexNames: boundNameList(indexNames),
        EmbeddingModelName: input.EmbeddingModelName,
        EmbeddingModelCount: input.EmbeddingModelCount,

        // Full-text search landscape
        FTSEntityCount: input.FTSEntityCount,
        EnabledFTSCount: input.EnabledFTSCount,
        FTSFilterText: input.FTSFilterText,

        // Search-scope landscape
        SearchScopeCount: input.SearchScopes.length,
        SearchScopeNames: boundNameList(scopeNames),
        ActiveScopeID: input.ActiveScopeID,
        ActiveScopeName: input.ActiveScopeName,
        ActiveScopeTab: input.ActiveScopeTab,

        ShowCreateIndexForm: input.ShowCreateIndexForm,
    };

    if (input.SearchScopes.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        ctx['SearchScopeNamesTruncated'] = true;
    }
    if (indexNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        ctx['VectorIndexNamesTruncated'] = true;
    }

    // Analytics sub-section — only surface its metrics once it has loaded.
    if (input.AnalyticsLoaded) {
        ctx['AnalyticsLoaded'] = true;
        ctx['AnalyticsTotalRuns'] = input.AnalyticsTotalRuns;
    }
    // Permissions-audit sub-section — same gating.
    if (input.PermissionsLoaded) {
        ctx['PermissionsLoaded'] = true;
        ctx['PermissionsRowCount'] = input.PermissionsRowCount;
    }

    return ctx;
}
