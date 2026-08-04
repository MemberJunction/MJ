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
 *   filter/search/sort/selection state, plus BOUNDED lists of NON-secret names
 *   (event types, class names, module labels, layout sections). No secret-bearing
 *   VALUES are exposed.
 *
 * - App State Inspector and Settings Explorer are METADATA-ONLY: the context
 *   reports counts (state size, key/setting counts, search term) and — for
 *   Settings / App State — the bounded list of KEY NAMES (e.g. "mj.formBuilder.…",
 *   "search.showFilterPanel", "Email", "Roles"). Setting/state keys are
 *   identifiers, not secrets. The context NEVER includes the underlying state
 *   VALUES or setting VALUES, which may contain auth tokens, API URLs,
 *   credentials, or other secrets. The matching helpers below accept counts +
 *   key names, never raw values, by construction. No value-returning tools are
 *   registered on either surface.
 *
 * - GraphQL Console has NO helper here and is intentionally NOT wired (arbitrary
 *   query execution is an injection risk). See its component for the rationale.
 */

/**
 * Upper bound on how many names a DevTools surface publishes in a name-list
 * context field (event types, class names, module labels, setting keys, …).
 * Mirrors the Admin `AGENT_CONTEXT_NAME_LIST_CAP`. Kept LOCAL to DevTools so this
 * file has no cross-package coupling. When the underlying list is larger, the
 * surface publishes a companion total-count field so the agent still knows the
 * true size.
 */
export const DEV_TOOLS_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to at most {@link DEV_TOOLS_NAME_LIST_CAP} entries.
 * Pure + deterministic so the published context shape stays unit-testable.
 * Never mutates the input. The caller owns de-duplication / ordering.
 */
export function boundDevToolsNames(names: readonly string[]): string[] {
    return names.slice(0, DEV_TOOLS_NAME_LIST_CAP);
}

// ============================================================================
// Event Monitor (SAFE diagnostic)
// ============================================================================

/** A bounded, secret-free summary of one captured event for the agent context. */
export interface EventSummary {
    /** The event type (e.g. 'Save', 'NavigateToResource'). */
    Type: string;
    /** The component name that emitted it, or '(no component)'. */
    Component: string;
    /** A short, redacted one-line summary of the payload shape (NOT raw values). */
    Summary: string;
}

/** Component-supplied snapshot of the Event Monitor's salient state. */
export interface EventMonitorAgentContextInput {
    /** Total events captured since the monitor started (includes dropped/paused). */
    EventCount: number;
    /** Events currently held in the in-memory buffer (after the ring-buffer cap). */
    BufferedCount: number;
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
    /** Number of events visible after the active filters. */
    FilteredCount: number;
    /** Distinct event TYPE names seen so far (bounded by the helper). */
    KnownTypes: string[];
    /** Distinct emitting COMPONENT names seen so far (bounded by the helper). */
    KnownComponents: string[];
    /** Distinct event CODE names seen so far (bounded by the helper). */
    KnownCodes: string[];
    /**
     * The most-recent visible events (already filtered/sorted by the component),
     * as secret-free summaries. Bounded by the helper. Lets the agent answer
     * "what just happened?" without re-reading raw payloads.
     */
    RecentEvents: EventSummary[];
}

/** Build the agent-visible context for the Event Monitor inspector. */
export function buildEventMonitorAgentContext(input: EventMonitorAgentContextInput): Record<string, unknown> {
    const hasActiveFilters =
        input.TextFilter.length > 0 ||
        input.TypeFilter.length > 0 ||
        input.ComponentFilter.length > 0 ||
        input.CodeFilter.length > 0;

    const context: Record<string, unknown> = {
        EventCount: input.EventCount,
        BufferedCount: input.BufferedCount,
        FilteredCount: input.FilteredCount,
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

    addBoundedNameField(context, 'KnownEventTypes', 'KnownEventTypeCount', input.KnownTypes);
    addBoundedNameField(context, 'KnownComponents', 'KnownComponentCount', input.KnownComponents);
    addBoundedNameField(context, 'KnownEventCodes', 'KnownEventCodeCount', input.KnownCodes);

    if (input.RecentEvents.length > 0) {
        context['RecentEvents'] = input.RecentEvents.slice(0, DEV_TOOLS_NAME_LIST_CAP);
    }

    return context;
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
    /** Number of base-class GROUPS visible after the active search. */
    VisibleGroupCount: number;
    /**
     * Names of the base classes currently visible (after search). Bounded by the
     * helper — lets the agent see/name the registry landscape. Empty when search
     * matches nothing.
     */
    VisibleBaseClassNames: string[];
}

/** Build the agent-visible context for the Class Registry inspector. */
export function buildClassRegistryAgentContext(input: ClassRegistryAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        TotalClassCount: input.TotalClassCount,
        BaseClassCount: input.BaseClassCount,
        OverrideCount: input.OverrideCount,
        SearchTerm: input.SearchTerm,
        FilterByBase: input.FilterByBase,
        HasActiveSearch: input.SearchTerm.trim().length > 0,
        VisibleGroupCount: input.VisibleGroupCount,
    };
    addBoundedNameField(context, 'VisibleBaseClasses', 'VisibleBaseClassCount', input.VisibleBaseClassNames);
    return context;
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
    /** Active free-text search narrowing chunks by label/key (empty = none). */
    SearchQuery: string;
    /** Number of chunks visible after the active filter + search. */
    VisibleModuleCount: number;
    /** Friendly labels of the chunks currently visible (bounded by the helper). */
    VisibleModuleNames: string[];
}

/** Build the agent-visible context for the Lazy Module Status inspector. */
export function buildLazyModuleStatusAgentContext(input: LazyModuleStatusAgentContextInput): Record<string, unknown> {
    const pendingModules = Math.max(0, input.TotalModules - input.LoadedModules);
    const context: Record<string, unknown> = {
        Available: input.Available,
        TotalModules: input.TotalModules,
        LoadedModules: input.LoadedModules,
        PendingModules: pendingModules,
        Filter: input.Filter,
        SearchQuery: input.SearchQuery,
        HasActiveSearch: input.SearchQuery.trim().length > 0,
        VisibleModuleCount: input.VisibleModuleCount,
    };
    addBoundedNameField(context, 'VisibleModules', 'VisibleModulesTotal', input.VisibleModuleNames);
    return context;
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
    /** The ids of all inspectable sections (the agent's "elements"). */
    SectionIds: string[];
    /** Character length of the currently-rendered section JSON (size proxy). */
    SnapshotSize: number;
}

/** Build the agent-visible context for the Layout Inspector. */
export function buildLayoutInspectorAgentContext(input: LayoutInspectorAgentContextInput): Record<string, unknown> {
    return {
        SelectedElement: input.SelectedSection,
        SelectedSectionLabel: input.SelectedSectionLabel,
        ElementCount: input.SectionCount,
        AvailableSections: boundDevToolsNames(input.SectionIds),
        SnapshotSize: input.SnapshotSize,
    };
}

// ============================================================================
// App State Inspector (METADATA-ONLY — counts/labels/key-names only, never values)
// ============================================================================

/**
 * Component-supplied snapshot of the App State Inspector — METADATA ONLY.
 * 🔒 Accepts only counts + the section label + top-level KEY NAMES. The
 * underlying state VALUES (which may include auth tokens, provider URLs, user
 * PII) are deliberately NOT part of this shape and MUST NOT be passed into agent
 * context. Key NAMES (e.g. "Email", "Roles", "EntitiesCount") are structural
 * field identifiers, not secrets.
 */
export interface AppStateInspectorAgentContextInput {
    /** Character length of the currently-rendered section JSON (size proxy). */
    StateSize: number;
    /** Number of top-level keys in the currently-rendered section (no values). */
    KeyCount: number;
    /** The active section id (e.g. 'user', 'provider') — a label, not a value. */
    ActiveSection: string;
    /** Human-friendly label of the active section. */
    ActiveSectionLabel: string;
    /** The ids of all inspectable sections (labels, not values). */
    SectionIds: string[];
    /**
     * Top-level KEY NAMES of the active section's data (structural identifiers
     * only — never their values). Bounded by the helper.
     */
    TopLevelKeys: string[];
}

/**
 * Build the agent-visible context for the App State Inspector.
 * 🔒 METADATA-ONLY: emits StateSize + KeyCount + section label/ids + top-level
 * KEY NAMES. NEVER the state values themselves.
 */
export function buildAppStateInspectorAgentContext(input: AppStateInspectorAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        StateSize: input.StateSize,
        KeyCount: input.KeyCount,
        ActiveSection: input.ActiveSection,
        ActiveSectionLabel: input.ActiveSectionLabel,
        AvailableSections: boundDevToolsNames(input.SectionIds),
    };
    addBoundedNameField(context, 'TopLevelKeys', 'TopLevelKeyTotal', input.TopLevelKeys);
    return context;
}

// ============================================================================
// Settings Explorer (METADATA-ONLY — counts/keys only, never values)
// ============================================================================

/**
 * Component-supplied snapshot of the Settings Explorer — METADATA ONLY.
 * 🔒 Accepts only counts + the search term + setting KEY NAMES. Setting VALUES
 * (which may include credentials / API keys) are deliberately NOT part of this
 * shape and MUST NOT be passed into agent context. Setting KEYS (e.g.
 * "mj.formBuilder.cockpitPrefs.v1") are identifiers, not secrets.
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
    /** Number of settings visible in the current scope AFTER the search filter. */
    FilteredCount: number;
    /**
     * The setting KEY NAMES visible in the current scope after the search filter
     * (identifiers only — never their values). Bounded by the helper.
     */
    SettingKeys: string[];
}

/**
 * Build the agent-visible context for the Settings Explorer.
 * 🔒 METADATA-ONLY: emits counts + scope + the search term + setting KEY NAMES.
 * NEVER setting values.
 */
export function buildSettingsExplorerAgentContext(input: SettingsExplorerAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        SettingCount: input.SettingCount,
        UserSettingCount: input.UserSettingCount,
        InstanceSettingCount: input.InstanceSettingCount,
        Scope: input.Scope,
        SearchTerm: input.SearchTerm,
        HasActiveSearch: input.SearchTerm.trim().length > 0,
        FilteredCount: input.FilteredCount,
    };
    addBoundedNameField(context, 'SettingKeys', 'SettingKeyTotal', input.SettingKeys);
    return context;
}

// ============================================================================
// Shared internals
// ============================================================================

/**
 * Attach a bounded name list to the context under `listKey`, plus a companion
 * total-count under `countKey` ONLY when the list is truncated. Mutates the
 * passed context object (the builders own it locally). No-op for an empty list.
 */
function addBoundedNameField(
    context: Record<string, unknown>,
    listKey: string,
    countKey: string,
    names: readonly string[],
): void {
    if (names.length === 0) {
        return;
    }
    context[listKey] = boundDevToolsNames(names);
    if (names.length > DEV_TOOLS_NAME_LIST_CAP) {
        context[countKey] = names.length;
    }
}
