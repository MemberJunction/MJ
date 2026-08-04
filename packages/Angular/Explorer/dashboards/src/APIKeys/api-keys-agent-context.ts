/**
 * @fileoverview Pure helpers for the API Keys dashboard's AI-agent integration.
 *
 * 🚨 SAFETY BOUNDARY — METADATA-ONLY, NEVER SECRET / KEY MATERIAL 🚨
 * API Keys is a SECURITY-SENSITIVE admin surface. These helpers shape the
 * component's current NON-SENSITIVE state (active tab, status filter, aggregate
 * counts, and bounded *display* names — key Labels, Application names, Scope
 * category names) into the key-value context object that flows to the async chat
 * agent and the realtime co-agent via `NavigationService.SetAgentContext`. They
 * are intentionally free of Angular / component dependencies so the resulting
 * context shape can be unit-tested in isolation — including an explicit assertion
 * that no secret-bearing key (the hashed key, key prefix, token, secret value)
 * can ever appear.
 *
 * What flows out: tab/view/filter navigation state, aggregate counts, a health
 * score, and BOUNDED human-readable display NAMES (key Labels, Application names,
 * Scope category names, top-used key Labels) + selected key id+Label.
 * What NEVER flows out: the API key's hashed value (`Hash`), its `KeyPrefix`
 * (part of the key material), the raw/cleartext key/token returned at creation,
 * or any other reveal-able secret. None of those values are ever passed INTO this
 * helper, so they cannot leak through its output. A key's `Label` is a
 * user-chosen friendly name (e.g. "CI pipeline") — it is NOT the key itself.
 */

import { boundNameList } from '../shared/agent-tool-validation';

/** The four tabs the API Keys dashboard exposes. */
export const VALID_API_KEYS_TABS = ['keys', 'applications', 'scopes', 'usage'] as const;
/** Union of the valid API Keys tab ids. */
export type APIKeysTab = (typeof VALID_API_KEYS_TABS)[number];

/** The status filters the key list supports. */
export const VALID_API_KEYS_FILTERS = ['all', 'active', 'revoked', 'expiring', 'expired', 'never-used'] as const;
/** Union of the valid API Keys status filters. */
export type APIKeysFilter = (typeof VALID_API_KEYS_FILTERS)[number];

/**
 * Type-guard / validator for an API Keys tab string. Keeps the
 * `SwitchAPIKeysTab` client tool tolerant of arbitrary agent input.
 */
export function isValidAPIKeysTab(tab: unknown): tab is APIKeysTab {
    return typeof tab === 'string' && (VALID_API_KEYS_TABS as readonly string[]).includes(tab);
}

/**
 * Type-guard / validator for an API Keys status-filter string. Keeps the
 * `FilterAPIKeysByStatus` client tool tolerant of arbitrary agent input.
 */
export function isValidAPIKeysFilter(filter: unknown): filter is APIKeysFilter {
    return typeof filter === 'string' && (VALID_API_KEYS_FILTERS as readonly string[]).includes(filter);
}

/**
 * The plain, component-supplied snapshot used to build the agent context. By
 * construction this carries ONLY non-sensitive navigation/metadata + display
 * names — there is no field here for a key hash, prefix, token, or secret value,
 * so none can be published.
 */
export interface APIKeysAgentContextInput {
    /** Active main tab (keys/applications/scopes/usage). */
    MainTab: APIKeysTab;
    /** Active inner view of the Keys tab (overview vs list). */
    CurrentView: 'overview' | 'list';
    /** Active status filter on the key list. */
    ListFilter: APIKeysFilter;
    /** Whether the dashboard is currently loading. */
    IsLoading: boolean;

    // ---- Aggregate counts (counts only — never the keys themselves) ----
    TotalKeys: number;
    ActiveKeys: number;
    RevokedKeys: number;
    ExpiringSoonCount: number;
    ExpiredKeys: number;
    NeverUsedKeys: number;
    ApplicationCount: number;
    ScopeCount: number;
    /** 0-100 security health score derived from the counts above. */
    HealthScore: number;

    // ---- Bounded display NAMES (friendly labels, never key material) ----
    /** Friendly Labels of the keys (e.g. "CI pipeline") — never the key value. */
    KeyLabels: readonly string[];
    /** Friendly Labels of the most-recently-used active keys. */
    TopUsedKeyLabels: readonly string[];
    /** Registered API Application names. */
    ApplicationNames: readonly string[];
    /** Distinct scope category names. */
    ScopeCategoryNames: readonly string[];

    // ---- Selection (id + friendly Label; never key material) ----
    /** The selected key's ID, or null when nothing is selected. */
    SelectedKeyId: string | null;
    /** The selected key's friendly Label, or null. */
    SelectedKeyLabel: string | null;
}

/**
 * Build the agent-visible context object for the API Keys dashboard.
 *
 * Returns a flat key-value object of NON-SENSITIVE metadata only: navigation
 * state, aggregate counts, a health score, and BOUNDED friendly display names.
 * Name lists are capped (via {@link boundNameList}) with a companion total-count
 * + truncation flag so the agent knows the true size without flooding the note.
 * Keeping this a pure function (no `this`) makes the shape unit-testable and lets
 * the test assert no secret-bearing key can ever appear.
 */
export function buildAPIKeysAgentContext(input: APIKeysAgentContextInput): Record<string, unknown> {
    const keyLabels = boundNameList(input.KeyLabels);
    const appNames = boundNameList(input.ApplicationNames);
    const scopeCategories = boundNameList(input.ScopeCategoryNames);

    return {
        // Navigation
        MainTab: input.MainTab,
        CurrentView: input.CurrentView,
        ListFilter: input.ListFilter,
        IsLoading: input.IsLoading,

        // Counts
        TotalKeys: input.TotalKeys,
        ActiveKeys: input.ActiveKeys,
        RevokedKeys: input.RevokedKeys,
        ExpiringSoonCount: input.ExpiringSoonCount,
        ExpiredKeys: input.ExpiredKeys,
        NeverUsedKeys: input.NeverUsedKeys,
        ApplicationCount: input.ApplicationCount,
        ScopeCount: input.ScopeCount,
        HealthScore: input.HealthScore,

        // Bounded display names (friendly labels, NEVER key material)
        VisibleKeyLabels: keyLabels,
        VisibleKeyLabelsTruncated: keyLabels.length < input.KeyLabels.length,
        TopUsedKeyLabels: boundNameList(input.TopUsedKeyLabels),
        ApplicationNames: appNames,
        ApplicationNamesTruncated: appNames.length < input.ApplicationNames.length,
        ScopeCategoryNames: scopeCategories,

        // Selection (id + friendly label only)
        SelectedKeyId: input.SelectedKeyId,
        SelectedKeyLabel: input.SelectedKeyLabel,
    };
}
