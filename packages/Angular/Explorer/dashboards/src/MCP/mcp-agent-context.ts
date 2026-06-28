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
 * 🚨 SAFETY BOUNDARY — NO SECRETS, EVER 🚨
 * MCP is a credential-bearing surface: servers carry OAuth client secrets,
 * connections carry bearer tokens, and there are dedicated OAuth token / client
 * registration / credential entities in scope. The context built here exposes
 * ONLY aggregate counts and navigation state — never a server URL, command,
 * bearer token, OAuth client secret, hashed/encrypted credential, or any tool
 * input/output payload. If you add a field to {@link MCPAgentContextInput},
 * verify it carries no secret/credential value before doing so.
 */

import type { MCPDashboardTab, ToolsViewMode } from './mcp-dashboard.component';

/** The four MCP dashboard tabs. */
export const MCP_TABS: readonly MCPDashboardTab[] = ['servers', 'connections', 'tools', 'logs'] as const;

/** The two tools-view modes. */
export const MCP_TOOLS_VIEW_MODES: readonly ToolsViewMode[] = ['card', 'list'] as const;

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
 * The plain, component-supplied snapshot used to build the MCP agent context.
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
 * Build the agent-visible context object for the MCP dashboard.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing. Returns a flat key-value object
 * suitable for `SetAgentContext`.
 *
 * @param input - the component's current state snapshot (counts + nav state only)
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
