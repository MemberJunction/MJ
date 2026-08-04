/**
 * @fileoverview Pure helpers for the MCP dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link MCPDashboardComponent}) supplies a plain snapshot of its current state
 * and these helpers shape it into the flat key-value `AgentContext` object that
 * flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 *
 * The shape is now DEEP (Data-Explorer depth): per active tab the helper publishes
 * the tab's counts, selected-item id+name, bounded visible NAMES (cap 25 with a
 * companion total-count when truncated), search/filter state, and the tools view
 * mode — so the agent can SEE the server / connection / tool / log names and the
 * one that's selected, then act via the mode-scoped client tools.
 *
 * 🚨 SAFETY BOUNDARY — NO SECRETS, EVER 🚨
 * MCP is a credential-bearing surface: servers carry OAuth client secrets,
 * connections carry bearer tokens, and there are dedicated OAuth token / client
 * registration / credential entities in scope. The context built here exposes
 * ONLY aggregate counts, navigation state, the user's own search/filter terms,
 * and user-facing DISPLAY names — never a server URL, command, bearer token,
 * OAuth client secret, hashed/encrypted credential, or any tool input/output
 * payload. If you add a field to one of the *ContextInput interfaces, verify it
 * carries no secret/credential value before doing so.
 */

import type { MCPDashboardTab, ToolsViewMode } from './mcp-dashboard.component';

/** The four MCP dashboard tabs. */
export const MCP_TABS: readonly MCPDashboardTab[] = ['servers', 'connections', 'tools', 'logs'] as const;

/** The two tools-view modes. */
export const MCP_TOOLS_VIEW_MODES: readonly ToolsViewMode[] = ['card', 'list'] as const;

/**
 * The sortable columns of the execution-logs table, mirrored here so the
 * `SortLogs` client tool has a single Angular-free source of truth for its
 * tolerant {@link validateEnumParam} guard. Must stay in sync with the
 * component's `LogsSortColumn` union.
 */
export const MCP_LOG_SORT_COLUMNS = ['status', 'server', 'tool', 'connection', 'started', 'duration', 'error'] as const;

/** One of the sortable execution-log columns. */
export type MCPLogSortColumn = (typeof MCP_LOG_SORT_COLUMNS)[number];

/**
 * Upper bound on how many display names we publish in a name-list context field
 * (VisibleServerNames, VisibleToolNames, …). Keeping the streamed note bounded
 * avoids flooding the co-agent with hundreds of names; when the underlying list
 * is larger we surface a companion total-count field so the agent still knows
 * the true size.
 */
export const MCP_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Type-guard / validator for an MCP tab string. Keeps the `SwitchMCPTab`
 * client tool tolerant of arbitrary agent input — only the four known tabs are
 * accepted.
 */
export function isValidMCPTab(tab: unknown): tab is MCPDashboardTab {
    return typeof tab === 'string' && (MCP_TABS as readonly string[]).includes(tab);
}

/**
 * Type-guard / validator for a tools-view-mode string. Keeps the
 * `SetToolsViewMode` client tool tolerant of arbitrary agent input.
 */
export function isValidToolsViewMode(mode: unknown): mode is ToolsViewMode {
    return typeof mode === 'string' && (MCP_TOOLS_VIEW_MODES as readonly string[]).includes(mode);
}

/**
 * Cap an array of names to {@link MCP_AGENT_CONTEXT_NAME_LIST_CAP} entries.
 * Pure + deterministic so the context shape stays unit-testable. Never throws.
 *
 * @param names - the full list of names (the caller owns de-duplication / ordering)
 * @returns the first N names; a new array (never mutates the input)
 */
export function capMCPNames(names: readonly string[]): string[] {
    return names.slice(0, MCP_AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * A minimal id-and-name descriptor, supplied by the component so the pure
 * resolver can match an agent-supplied reference against what the user sees.
 * Mirrors the salient slice of any MCP server / connection / tool / log row.
 */
export interface MCPNamedItem {
    ID: string;
    Name: string;
}

/**
 * Resolve an agent-supplied reference to one of the available items, the way a
 * user names things. The agent may pass an exact ID, an exact name, or a partial
 * name — so we try, in order:
 *   1. exact ID match (case-insensitive, to tolerate SQL-Server-upper vs PG-lower UUID casing)
 *   2. exact name match (case-insensitive, whitespace-trimmed)
 *   3. first case-insensitive *contains* match on the name
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable
 * in isolation. Returns the matched item, or null on a miss.
 *
 * @param input - whatever the agent passed (an ID or a display name)
 * @param candidates - the items available on this surface
 */
export function resolveMCPItem<T extends MCPNamedItem>(input: string, candidates: readonly T[]): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    const byName = candidates.find(c => c.Name.trim().toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    return candidates.find(c => c.Name.toLowerCase().includes(needle)) ?? null;
}

/**
 * Build a tolerant "not found" error message that samples a few of the available
 * names, so the agent can correct itself. Pure + deterministic.
 *
 * @param input - the agent-supplied reference that didn't resolve
 * @param candidates - the available items (their names are sampled)
 * @param noun - the kind of thing (e.g. "server", "tool") for the message
 */
export function buildMCPNotFoundError(input: string, candidates: readonly MCPNamedItem[], noun: string): string {
    const sample = candidates.slice(0, 6).map(c => c.Name).join(', ');
    return `No ${noun} matching "${input}" is available. Available ${noun}s include: ${sample || '(none)'}.`;
}

// ============================================================================
// Top-level snapshot — counts + tab + view mode (always published)
// ============================================================================

/**
 * The plain, component-supplied snapshot used to build the top-level MCP agent
 * context. Mirrors the always-on metrics slice plus the active tab and the
 * tools view mode.
 *
 * 🚨 Every field here is a count, a navigation flag, or the user's own search
 * term. NONE of them carry a secret, credential, token, URL, command, or tool
 * payload. Keep it that way.
 */
export interface MCPAgentContextInput {
    /** The currently active tab (servers/connections/tools/logs). */
    ActiveTab: MCPDashboardTab;
    /** Total number of MCP servers. */
    ServerCount: number;
    /** Number of servers whose Status is 'Active'. */
    ActiveServerCount: number;
    /** Total number of MCP server connections. */
    ConnectionCount: number;
    /** Total number of discovered MCP tools. */
    ToolCount: number;
    /** Count of tool executions in the recent (7-day) window currently loaded. */
    RecentExecutionCount: number;
    /** Count of recent executions whose Status is 'Error'. */
    FailedExecutionCount: number;
    /** The user's current free-text search term (their own input — not a secret). */
    CurrentSearchTerm: string;
    /** The tools-tab view mode (card/list). */
    ToolsViewMode: ToolsViewMode;
}

/**
 * Build the always-on (top-level) slice of the MCP agent context.
 *
 * Kept a pure function (no `this`) so the context shape is unit-testable and
 * decoupled from change-detection timing. Returns a flat key-value object.
 *
 * @param input - the component's current top-level state snapshot (counts + nav state only)
 * @returns a flat, secret-free key-value object
 */
export function buildMCPAgentContext(input: MCPAgentContextInput): Record<string, unknown> {
    return {
        ActiveTab: input.ActiveTab,
        ServerCount: input.ServerCount,
        ActiveServerCount: input.ActiveServerCount,
        ConnectionCount: input.ConnectionCount,
        ToolCount: input.ToolCount,
        RecentExecutionCount: input.RecentExecutionCount,
        FailedExecutionCount: input.FailedExecutionCount,
        CurrentSearchTerm: input.CurrentSearchTerm,
        ToolsViewMode: input.ToolsViewMode,
    };
}

// ============================================================================
// Per-tab DEEP context slices
// ============================================================================

/**
 * Append a bounded name list under `key` plus, when the list was truncated, a
 * companion `<key>Count` reporting the true total. Mutates `target` in place and
 * returns it for chaining. Pure aside from the in-place write the caller asked for.
 */
function withBoundedNames(
    target: Record<string, unknown>,
    key: string,
    names: readonly string[],
): Record<string, unknown> {
    if (names.length === 0) {
        return target;
    }
    target[key] = capMCPNames(names);
    if (names.length > MCP_AGENT_CONTEXT_NAME_LIST_CAP) {
        target[`${key}Count`] = names.length;
    }
    return target;
}

/** Component-supplied snapshot for the Servers-tab deep context. */
export interface MCPServersContextInput {
    /** Total servers loaded (unfiltered). */
    ServerCount: number;
    /** Servers visible after the current search/status filter. */
    FilteredServerCount: number;
    /** Servers whose Status is 'Active'. */
    ActiveServerCount: number;
    /** The active server-status filter ('all' or a specific status). */
    ServerStatusFilter: string;
    /** Display names of the currently visible (filtered) servers, in list order. */
    VisibleServerNames: string[];
    /** ID of the expanded/selected server, or null. */
    SelectedServerId: string | null;
    /** Display name of the expanded/selected server, or null. */
    SelectedServerName: string | null;
}

/** Build the Servers-tab deep context slice. */
export function buildMCPServersContext(input: MCPServersContextInput): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
        Surface: 'servers',
        ServerCount: input.ServerCount,
        FilteredServerCount: input.FilteredServerCount,
        ActiveServerCount: input.ActiveServerCount,
        ServerStatusFilter: input.ServerStatusFilter,
        SelectedServerId: input.SelectedServerId,
        SelectedServerName: input.SelectedServerName,
    };
    return withBoundedNames(ctx, 'VisibleServerNames', input.VisibleServerNames);
}

/** Component-supplied snapshot for the Connections-tab deep context. */
export interface MCPConnectionsContextInput {
    /** Total connections loaded (unfiltered). */
    ConnectionCount: number;
    /** Connections visible after the current search/status filter. */
    FilteredConnectionCount: number;
    /** The active connection-status filter ('all' or a specific status). */
    ConnectionStatusFilter: string;
    /** Display names of the currently visible (filtered) connections, in list order. */
    VisibleConnectionNames: string[];
    /** ID of the expanded/selected connection, or null. */
    SelectedConnectionId: string | null;
    /** Display name of the expanded/selected connection, or null. */
    SelectedConnectionName: string | null;
}

/** Build the Connections-tab deep context slice. */
export function buildMCPConnectionsContext(input: MCPConnectionsContextInput): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
        Surface: 'connections',
        ConnectionCount: input.ConnectionCount,
        FilteredConnectionCount: input.FilteredConnectionCount,
        ConnectionStatusFilter: input.ConnectionStatusFilter,
        SelectedConnectionId: input.SelectedConnectionId,
        SelectedConnectionName: input.SelectedConnectionName,
    };
    return withBoundedNames(ctx, 'VisibleConnectionNames', input.VisibleConnectionNames);
}

/** Component-supplied snapshot for the Tools-tab deep context. */
export interface MCPToolsContextInput {
    /** Total tools loaded (unfiltered). */
    ToolCount: number;
    /** Tools visible after the current search/server/category/favorites/recent filters. */
    FilteredToolCount: number;
    /** The tools view mode (card/list). */
    ToolsViewMode: ToolsViewMode;
    /** The active tool-status filter ('all' or a specific status). */
    ToolStatusFilter: string;
    /** The active server filter on the Tools tab ('all' or a server ID). */
    ServerFilter: string;
    /** Resolved display name for the active server filter, or null when 'all'/unresolved. */
    ServerFilterName: string | null;
    /** The active category filter on the Tools tab ('all' or a category prefix). */
    CategoryFilter: string;
    /** Whether the Tools tab is restricted to favorited tools. */
    FavoritesOnly: boolean;
    /** Whether the Tools tab is restricted to tools seen in recent executions. */
    RecentOnly: boolean;
    /** Count of tools the current user has favorited. */
    FavoriteToolCount: number;
    /** Display names of the currently visible (filtered) tools, in list order. */
    VisibleToolNames: string[];
    /** Names of the servers available to filter by, in list order. */
    AvailableServerNames: string[];
    /** Category prefixes available to filter by, in list order. */
    AvailableCategoryNames: string[];
    /** ID of the expanded/selected tool, or null. */
    SelectedToolId: string | null;
    /** Display name of the expanded/selected tool, or null. */
    SelectedToolName: string | null;
}

/** Build the Tools-tab deep context slice. */
export function buildMCPToolsContext(input: MCPToolsContextInput): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
        Surface: 'tools',
        ToolCount: input.ToolCount,
        FilteredToolCount: input.FilteredToolCount,
        ToolsViewMode: input.ToolsViewMode,
        ToolStatusFilter: input.ToolStatusFilter,
        ServerFilter: input.ServerFilter,
        ServerFilterName: input.ServerFilterName,
        CategoryFilter: input.CategoryFilter,
        FavoritesOnly: input.FavoritesOnly,
        RecentOnly: input.RecentOnly,
        FavoriteToolCount: input.FavoriteToolCount,
        SelectedToolId: input.SelectedToolId,
        SelectedToolName: input.SelectedToolName,
    };
    withBoundedNames(ctx, 'VisibleToolNames', input.VisibleToolNames);
    withBoundedNames(ctx, 'AvailableServerNames', input.AvailableServerNames);
    withBoundedNames(ctx, 'AvailableCategoryNames', input.AvailableCategoryNames);
    return ctx;
}

/** Component-supplied snapshot for the Logs-tab deep context. */
export interface MCPLogsContextInput {
    /** Count of execution logs loaded in the recent window (unfiltered). */
    ExecutionCount: number;
    /** Logs visible after the current search/status filter. */
    FilteredExecutionCount: number;
    /** Count of failed (Status='Error') executions in the loaded window. */
    FailedExecutionCount: number;
    /** The active log-status filter ('all' or a specific status). */
    LogStatusFilter: string;
    /** The column the logs table is sorted by. */
    SortColumn: string;
    /** Sort direction. */
    SortDirection: 'asc' | 'desc';
    /**
     * Display labels of the currently visible logs, in table order — each a
     * non-secret summary like "github_search · Active". The component derives
     * these (tool name + status); NEVER the input args or result payload.
     */
    VisibleLogLabels: string[];
    /** ID of the selected log (detail panel open), or null. */
    SelectedLogId: string | null;
    /** Non-secret label of the selected log (tool name), or null. */
    SelectedLogName: string | null;
    /** Whether the log detail panel is open. */
    DetailPanelOpen: boolean;
}

/** Build the Logs-tab deep context slice. */
export function buildMCPLogsContext(input: MCPLogsContextInput): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
        Surface: 'logs',
        ExecutionCount: input.ExecutionCount,
        FilteredExecutionCount: input.FilteredExecutionCount,
        FailedExecutionCount: input.FailedExecutionCount,
        LogStatusFilter: input.LogStatusFilter,
        SortColumn: input.SortColumn,
        SortDirection: input.SortDirection,
        SelectedLogId: input.SelectedLogId,
        SelectedLogName: input.SelectedLogName,
        DetailPanelOpen: input.DetailPanelOpen,
    };
    return withBoundedNames(ctx, 'VisibleLogLabels', input.VisibleLogLabels);
}

/**
 * The union of per-tab deep-context inputs the component can supply. Exactly one
 * is built into the deep slice, keyed by the active tab.
 */
export type MCPTabContextInput =
    | { Tab: 'servers'; Data: MCPServersContextInput }
    | { Tab: 'connections'; Data: MCPConnectionsContextInput }
    | { Tab: 'tools'; Data: MCPToolsContextInput }
    | { Tab: 'logs'; Data: MCPLogsContextInput };

/**
 * Build the full MCP agent context: the always-on top-level slice merged with
 * the deep per-tab slice for the active tab. Pure + deterministic. The deep slice
 * keys take precedence on the (intentional) overlap of count fields, so the agent
 * sees the tab-scoped, filter-aware numbers.
 *
 * @param top - the always-on counts/tab/view-mode snapshot
 * @param tab - the active tab's deep snapshot (discriminated by `Tab`)
 * @returns a flat, secret-free key-value object suitable for `SetAgentContext`
 */
export function buildMCPAgentContextFull(top: MCPAgentContextInput, tab: MCPTabContextInput): Record<string, unknown> {
    const base = buildMCPAgentContext(top);
    const deep = buildMCPTabContext(tab);
    return { ...base, ...deep };
}

/** Build just the deep per-tab slice for the active tab. */
export function buildMCPTabContext(tab: MCPTabContextInput): Record<string, unknown> {
    switch (tab.Tab) {
        case 'servers':
            return buildMCPServersContext(tab.Data);
        case 'connections':
            return buildMCPConnectionsContext(tab.Data);
        case 'tools':
            return buildMCPToolsContext(tab.Data);
        case 'logs':
            return buildMCPLogsContext(tab.Data);
    }
}
