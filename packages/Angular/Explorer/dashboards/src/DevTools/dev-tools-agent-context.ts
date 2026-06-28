/**
 * @fileoverview Pure, framework-agnostic helpers that shape each DevTools
 * inspector's runtime state into the flat key/value `AgentContext` object that
 * flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. Each component supplies a plain snapshot
 * of its current state and the matching helper returns the context object.
 *
 * 🔒 SAFETY BOUNDARY (read carefully — per-inspector classification):
 *
 * - Event Monitor / Class Registry / Lazy Module Status / Layout Inspector are
 *   SAFE developer diagnostics: their context reports counts + the user's own
 *   filter/search/sort/selection state. No secret-bearing values are exposed.
 *
 * - App State Inspector and Settings Explorer are METADATA-ONLY: the context
 *   reports ONLY counts (state size, key/setting counts, search term). It NEVER
 *   includes the underlying state VALUES or setting VALUES, which may contain
 *   auth tokens, API URLs, credentials, or other secrets. The matching helpers
 *   below accept counts, never raw values, by construction.
 *
 * - GraphQL Console has NO helper here and is intentionally NOT wired (arbitrary
 *   query execution is an injection risk). See its component for the rationale.
 */

// ============================================================================
// Event Monitor (SAFE diagnostic)
// ============================================================================

/** Component-supplied snapshot of the Event Monitor's salient state. */
export interface EventMonitorAgentContextInput {
    /** Total events captured since the monitor started (includes dropped/paused). */
    EventCount: number;
    /** Events captured in the last ~1 second (live rate). */
    EventsPerSecond: number;
    /** Whether capture is currently paused. */
    Paused: boolean;
    /** Active free-text filter (empty string = none). */
    TextFilter: string;
    /** Active event-type filter (empty string = all types). */
    TypeFilter: string;
    /** Active component-name filter (empty string = all components). */
    ComponentFilter: string;
    /** Active event-code filter (empty string = all codes). */
    CodeFilter: string;
    /** Current sort field. */
    SortField: string;
    /** Current sort direction. */
    SortDirection: string;
}

/** Build the agent-visible context for the Event Monitor inspector. */
export function buildEventMonitorAgentContext(input: EventMonitorAgentContextInput): Record<string, unknown> {
    const hasActiveFilters =
        input.TextFilter.length > 0 ||
        input.TypeFilter.length > 0 ||
        input.ComponentFilter.length > 0 ||
        input.CodeFilter.length > 0;
    return {
        EventCount: input.EventCount,
        EventsPerSecond: input.EventsPerSecond,
        Paused: input.Paused,
        TextFilter: input.TextFilter,
        TypeFilter: input.TypeFilter,
        ComponentFilter: input.ComponentFilter,
        CodeFilter: input.CodeFilter,
        HasActiveFilters: hasActiveFilters,
        SortField: input.SortField,
        SortDirection: input.SortDirection,
    };
}

// ============================================================================
// Class Registry (SAFE diagnostic)
// ============================================================================

/** Component-supplied snapshot of the Class Registry browser's salient state. */
export interface ClassRegistryAgentContextInput {
    /** Total `@RegisterClass` registrations tracked by the ClassFactory. */
    TotalClassCount: number;
    /** Number of distinct base classes. */
    BaseClassCount: number;
    /** Number of base classes that have priority/override conflicts. */
    OverrideCount: number;
    /** Active search term (empty string = none). */
    SearchTerm: string;
    /**
     * Active base-class filter, if the user/agent narrowed to one base class.
     * (The registry's only filter mechanism is the search box, which matches base
     * class name / subclass / key — so this is the search term when it resolves to
     * an exact base-class match, else empty.)
     */
    FilterByBase: string;
}

/** Build the agent-visible context for the Class Registry inspector. */
export function buildClassRegistryAgentContext(input: ClassRegistryAgentContextInput): Record<string, unknown> {
    return {
        TotalClassCount: input.TotalClassCount,
        BaseClassCount: input.BaseClassCount,
        OverrideCount: input.OverrideCount,
        SearchTerm: input.SearchTerm,
        FilterByBase: input.FilterByBase,
        HasActiveSearch: input.SearchTerm.trim().length > 0,
    };
}

// ============================================================================
// Lazy Module Status (SAFE diagnostic)
// ============================================================================

/** Component-supplied snapshot of the Lazy Module Status inspector's state. */
export interface LazyModuleStatusAgentContextInput {
    /** Whether the lazy registry is available in this build. */
    Available: boolean;
    /** Total lazy chunks (modules) discovered. */
    TotalModules: number;
    /** Chunks already loaded into the running app. */
    LoadedModules: number;
    /** Current chunk filter ('all' | 'loaded' | 'not-loaded'). */
    Filter: string;
}

/** Build the agent-visible context for the Lazy Module Status inspector. */
export function buildLazyModuleStatusAgentContext(input: LazyModuleStatusAgentContextInput): Record<string, unknown> {
    const pendingModules = Math.max(0, input.TotalModules - input.LoadedModules);
    return {
        Available: input.Available,
        TotalModules: input.TotalModules,
        LoadedModules: input.LoadedModules,
        PendingModules: pendingModules,
        Filter: input.Filter,
    };
}

// ============================================================================
// Layout Inspector (SAFE diagnostic)
// ============================================================================

/** Component-supplied snapshot of the Layout Inspector's state. */
export interface LayoutInspectorAgentContextInput {
    /** The currently selected layout section ('workspace' | 'golden'). */
    SelectedSection: string;
    /** Human-friendly label of the selected section. */
    SelectedSectionLabel: string;
    /** Number of layout sections available to inspect. */
    SectionCount: number;
}

/** Build the agent-visible context for the Layout Inspector. */
export function buildLayoutInspectorAgentContext(input: LayoutInspectorAgentContextInput): Record<string, unknown> {
    return {
        SelectedElement: input.SelectedSection,
        SelectedSectionLabel: input.SelectedSectionLabel,
        ElementCount: input.SectionCount,
    };
}

// ============================================================================
// App State Inspector (METADATA-ONLY — counts only, never values)
// ============================================================================

/**
 * Component-supplied snapshot of the App State Inspector — METADATA ONLY.
 * 🔒 Accepts only counts. The underlying state VALUES (which may include auth
 * tokens, provider URLs, user PII) are deliberately NOT part of this shape and
 * MUST NOT be passed into agent context.
 */
export interface AppStateInspectorAgentContextInput {
    /** Character length of the currently-rendered section JSON (size proxy). */
    StateSize: number;
    /** Number of top-level keys in the currently-rendered section (no values). */
    KeyCount: number;
    /** The active section id (e.g. 'user', 'provider') — a label, not a value. */
    ActiveSection: string;
}

/**
 * Build the agent-visible context for the App State Inspector.
 * 🔒 METADATA-ONLY: emits StateSize + KeyCount + the section label. NEVER the
 * state values themselves.
 */
export function buildAppStateInspectorAgentContext(input: AppStateInspectorAgentContextInput): Record<string, unknown> {
    return {
        StateSize: input.StateSize,
        KeyCount: input.KeyCount,
        ActiveSection: input.ActiveSection,
    };
}

// ============================================================================
// Settings Explorer (METADATA-ONLY — counts only, never values)
// ============================================================================

/**
 * Component-supplied snapshot of the Settings Explorer — METADATA ONLY.
 * 🔒 Accepts only counts + the search term. Setting VALUES (which may include
 * credentials / API keys) are deliberately NOT part of this shape and MUST NOT
 * be passed into agent context.
 */
export interface SettingsExplorerAgentContextInput {
    /** Number of settings visible in the current scope. */
    SettingCount: number;
    /** Number of user-scope settings. */
    UserSettingCount: number;
    /** Number of instance-scope settings. */
    InstanceSettingCount: number;
    /** The active scope ('user' | 'instance') — a label, not a value. */
    Scope: string;
    /** Active search term — the search QUERY, never a setting value. */
    SearchTerm: string;
}

/**
 * Build the agent-visible context for the Settings Explorer.
 * 🔒 METADATA-ONLY: emits counts + scope + the search term. NEVER setting values.
 */
export function buildSettingsExplorerAgentContext(input: SettingsExplorerAgentContextInput): Record<string, unknown> {
    return {
        SettingCount: input.SettingCount,
        UserSettingCount: input.UserSettingCount,
        InstanceSettingCount: input.InstanceSettingCount,
        Scope: input.Scope,
        SearchTerm: input.SearchTerm,
    };
}
