/**
 * Tests for the MCP dashboard's pure agent-context helpers:
 * - buildMCPAgentContext: state snapshot → flat, secret-free agent context object
 * - isValidMCPTab: tab validation for the SwitchMCPTab client tool
 * - isValidToolsViewMode: view-mode validation for the SetToolsViewMode client tool
 *
 * The `import type` of the tab / view-mode unions from the component file is
 * type-only (erased at transpile time), so these tests do not pull in the
 * Angular component at runtime.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildMCPAgentContext,
    BuildMCPAgentContextFull,
    BuildMCPServersContext,
    BuildMCPConnectionsContext,
    BuildMCPToolsContext,
    BuildMCPLogsContext,
    BuildMCPTabContext,
    CapMCPNames,
    ResolveMCPItem,
    BuildMCPNotFoundError,
    IsValidMCPTab,
    IsValidToolsViewMode,
    MCP_TABS,
    MCP_TOOLS_VIEW_MODES,
    MCP_LOG_SORT_COLUMNS,
    MCP_AGENT_CONTEXT_NAME_LIST_CAP,
    MCPAgentContextInput,
    MCPServersContextInput,
    MCPConnectionsContextInput,
    MCPToolsContextInput,
    MCPLogsContextInput,
    MCPNamedItem,
    MCPTabContextInput,
} from '../MCP/mcp-agent-context';

function makeInput(overrides: Partial<MCPAgentContextInput> = {}): MCPAgentContextInput {
    return {
        ActiveTab: 'servers',
        ServerCount: 3,
        ActiveServerCount: 2,
        ConnectionCount: 5,
        ToolCount: 42,
        RecentExecutionCount: 17,
        FailedExecutionCount: 4,
        CurrentSearchTerm: '',
        ToolsViewMode: 'card',
        ...overrides,
    };
}

describe('buildMCPAgentContext', () => {
    it('maps every snapshot field onto the context object', () => {
        const ctx = BuildMCPAgentContext(
            makeInput({
                ActiveTab: 'tools',
                ServerCount: 7,
                ActiveServerCount: 6,
                ConnectionCount: 9,
                ToolCount: 100,
                RecentExecutionCount: 50,
                FailedExecutionCount: 3,
                CurrentSearchTerm: 'github',
                ToolsViewMode: 'list',
            }),
        );
        expect(ctx).toEqual({
            ActiveTab: 'tools',
            ServerCount: 7,
            ActiveServerCount: 6,
            ConnectionCount: 9,
            ToolCount: 100,
            RecentExecutionCount: 50,
            FailedExecutionCount: 3,
            CurrentSearchTerm: 'github',
            ToolsViewMode: 'list',
        });
    });

    it('preserves zero counts and an empty search term', () => {
        const ctx = BuildMCPAgentContext(
            makeInput({
                ServerCount: 0,
                ActiveServerCount: 0,
                ConnectionCount: 0,
                ToolCount: 0,
                RecentExecutionCount: 0,
                FailedExecutionCount: 0,
                CurrentSearchTerm: '',
            }),
        );
        expect(ctx['ServerCount']).toBe(0);
        expect(ctx['FailedExecutionCount']).toBe(0);
        expect(ctx['CurrentSearchTerm']).toBe('');
    });

    it('exposes ONLY the documented secret-free keys — no credential/token/url fields leak in', () => {
        const ctx = BuildMCPAgentContext(makeInput());
        const keys = Object.keys(ctx).sort();
        expect(keys).toEqual(
            [
                'ActiveServerCount',
                'ActiveTab',
                'ConnectionCount',
                'CurrentSearchTerm',
                'FailedExecutionCount',
                'RecentExecutionCount',
                'ServerCount',
                'ToolCount',
                'ToolsViewMode',
            ].sort(),
        );
        // Defense-in-depth: assert none of the forbidden secret-bearing keys appear.
        const forbidden = ['token', 'secret', 'credential', 'bearer', 'oauth', 'url', 'command', 'password', 'key'];
        for (const k of keys) {
            for (const bad of forbidden) {
                expect(k.toLowerCase().includes(bad)).toBe(false);
            }
        }
    });
});

describe('isValidMCPTab', () => {
    it('accepts every known tab', () => {
        for (const tab of MCP_TABS) {
            expect(IsValidMCPTab(tab)).toBe(true);
        }
    });

    it('rejects unknown / malformed input', () => {
        expect(IsValidMCPTab('Servers')).toBe(false); // case-sensitive by design
        expect(IsValidMCPTab('oauth')).toBe(false);
        expect(IsValidMCPTab('')).toBe(false);
        expect(IsValidMCPTab(undefined)).toBe(false);
        expect(IsValidMCPTab(null)).toBe(false);
        expect(IsValidMCPTab(3)).toBe(false);
        expect(IsValidMCPTab({ tab: 'tools' })).toBe(false);
    });
});

describe('isValidToolsViewMode', () => {
    it('accepts every known view mode', () => {
        for (const mode of MCP_TOOLS_VIEW_MODES) {
            expect(IsValidToolsViewMode(mode)).toBe(true);
        }
    });

    it('rejects unknown / malformed input', () => {
        expect(IsValidToolsViewMode('grid')).toBe(false);
        expect(IsValidToolsViewMode('Card')).toBe(false);
        expect(IsValidToolsViewMode('')).toBe(false);
        expect(IsValidToolsViewMode(undefined)).toBe(false);
        expect(IsValidToolsViewMode(null)).toBe(false);
        expect(IsValidToolsViewMode(0)).toBe(false);
    });
});

// ============================================================================
// Name-list cap + resolver + not-found error
// ============================================================================

describe('capMCPNames', () => {
    it('returns all names when under the cap', () => {
        expect(CapMCPNames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it(`caps at ${MCP_AGENT_CONTEXT_NAME_LIST_CAP} entries`, () => {
        const many = Array.from({ length: 100 }, (_, i) => `n${i}`);
        const out = CapMCPNames(many);
        expect(out).toHaveLength(MCP_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(out[0]).toBe('n0');
        expect(out[MCP_AGENT_CONTEXT_NAME_LIST_CAP - 1]).toBe(`n${MCP_AGENT_CONTEXT_NAME_LIST_CAP - 1}`);
    });

    it('does not mutate the input', () => {
        const input = Array.from({ length: 40 }, (_, i) => `n${i}`);
        const copy = [...input];
        CapMCPNames(input);
        expect(input).toEqual(copy);
    });
});

describe('resolveMCPItem', () => {
    const items: MCPNamedItem[] = [
        { ID: 'AAAAAAAA-1111-1111-1111-111111111111', Name: 'GitHub Server' },
        { ID: 'bbbbbbbb-2222-2222-2222-222222222222', Name: 'Slack Tools' },
        { ID: 'cccccccc-3333-3333-3333-333333333333', Name: 'Slack Admin' },
    ];

    it('matches by exact ID across UUID case variance', () => {
        expect(ResolveMCPItem('aaaaaaaa-1111-1111-1111-111111111111', items)?.Name).toBe('GitHub Server');
        expect(ResolveMCPItem('BBBBBBBB-2222-2222-2222-222222222222', items)?.Name).toBe('Slack Tools');
    });

    it('matches by exact name (case-insensitive, trimmed) before falling to contains', () => {
        expect(ResolveMCPItem('  slack admin ', items)?.ID).toBe('cccccccc-3333-3333-3333-333333333333');
    });

    it('falls back to the first contains match on the name', () => {
        // "slack" matches both Slack rows; the FIRST (Slack Tools) wins.
        expect(ResolveMCPItem('slack', items)?.Name).toBe('Slack Tools');
        expect(ResolveMCPItem('github', items)?.Name).toBe('GitHub Server');
    });

    it('returns null on empty / whitespace / unknown input', () => {
        expect(ResolveMCPItem('', items)).toBeNull();
        expect(ResolveMCPItem('   ', items)).toBeNull();
        expect(ResolveMCPItem('does-not-exist', items)).toBeNull();
    });

    it('returns null against an empty candidate list', () => {
        expect(ResolveMCPItem('anything', [])).toBeNull();
    });
});

describe('buildMCPNotFoundError', () => {
    it('samples up to 6 available names and names the noun', () => {
        const items: MCPNamedItem[] = Array.from({ length: 8 }, (_, i) => ({ ID: `id${i}`, Name: `Server ${i}` }));
        const msg = BuildMCPNotFoundError('zzz', items, 'server');
        expect(msg).toContain('No server matching "zzz" is available');
        expect(msg).toContain('Server 0, Server 1, Server 2, Server 3, Server 4, Server 5');
        expect(msg).not.toContain('Server 6'); // capped at 6
    });

    it('handles an empty candidate list gracefully', () => {
        expect(BuildMCPNotFoundError('x', [], 'tool')).toContain('(none)');
    });
});

// ============================================================================
// Per-tab DEEP context slices
// ============================================================================

describe('buildMCPServersContext', () => {
    function makeServers(overrides: Partial<MCPServersContextInput> = {}): MCPServersContextInput {
        return {
            ServerCount: 3,
            FilteredServerCount: 2,
            ActiveServerCount: 2,
            ServerStatusFilter: 'all',
            VisibleServerNames: ['GitHub', 'Slack'],
            SelectedServerId: null,
            SelectedServerName: null,
            ...overrides,
        };
    }

    it('publishes counts, filter, selection, and visible names', () => {
        const ctx = BuildMCPServersContext(makeServers({ SelectedServerId: 'srv-1', SelectedServerName: 'GitHub' }));
        expect(ctx).toMatchObject({
            Surface: 'servers',
            ServerCount: 3,
            FilteredServerCount: 2,
            ActiveServerCount: 2,
            ServerStatusFilter: 'all',
            SelectedServerId: 'srv-1',
            SelectedServerName: 'GitHub',
            VisibleServerNames: ['GitHub', 'Slack'],
        });
    });

    it('omits the names key entirely when there are no visible servers', () => {
        const ctx = BuildMCPServersContext(makeServers({ VisibleServerNames: [] }));
        expect(ctx['VisibleServerNames']).toBeUndefined();
        expect(ctx['VisibleServerNamesCount']).toBeUndefined();
    });

    it('adds a companion count when the visible list exceeds the cap', () => {
        const names = Array.from({ length: 40 }, (_, i) => `S${i}`);
        const ctx = BuildMCPServersContext(makeServers({ VisibleServerNames: names }));
        expect((ctx['VisibleServerNames'] as string[]).length).toBe(MCP_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['VisibleServerNamesCount']).toBe(40);
    });
});

describe('buildMCPConnectionsContext', () => {
    it('publishes connection counts, filter, selection, and visible names', () => {
        const input: MCPConnectionsContextInput = {
            ConnectionCount: 5,
            FilteredConnectionCount: 1,
            ConnectionStatusFilter: 'Active',
            VisibleConnectionNames: ['Prod Conn'],
            SelectedConnectionId: 'conn-1',
            SelectedConnectionName: 'Prod Conn',
        };
        expect(BuildMCPConnectionsContext(input)).toEqual({
            Surface: 'connections',
            ConnectionCount: 5,
            FilteredConnectionCount: 1,
            ConnectionStatusFilter: 'Active',
            SelectedConnectionId: 'conn-1',
            SelectedConnectionName: 'Prod Conn',
            VisibleConnectionNames: ['Prod Conn'],
        });
    });
});

describe('buildMCPToolsContext', () => {
    function makeTools(overrides: Partial<MCPToolsContextInput> = {}): MCPToolsContextInput {
        return {
            ToolCount: 100,
            FilteredToolCount: 10,
            ToolsViewMode: 'card',
            ToolStatusFilter: 'all',
            ServerFilter: 'all',
            ServerFilterName: null,
            CategoryFilter: 'all',
            FavoritesOnly: false,
            RecentOnly: false,
            FavoriteToolCount: 4,
            VisibleToolNames: ['github_search', 'github_create_issue'],
            AvailableServerNames: ['GitHub', 'Slack'],
            AvailableCategoryNames: ['github', 'slack'],
            SelectedToolId: null,
            SelectedToolName: null,
            ...overrides,
        };
    }

    it('publishes all filter dimensions + bounded name lists', () => {
        const ctx = BuildMCPToolsContext(makeTools({
            ServerFilter: 'srv-1', ServerFilterName: 'GitHub', FavoritesOnly: true,
            SelectedToolId: 'tool-1', SelectedToolName: 'github_search',
        }));
        expect(ctx).toMatchObject({
            Surface: 'tools',
            ToolCount: 100,
            FilteredToolCount: 10,
            ToolsViewMode: 'card',
            ServerFilter: 'srv-1',
            ServerFilterName: 'GitHub',
            FavoritesOnly: true,
            FavoriteToolCount: 4,
            SelectedToolId: 'tool-1',
            SelectedToolName: 'github_search',
            VisibleToolNames: ['github_search', 'github_create_issue'],
            AvailableServerNames: ['GitHub', 'Slack'],
            AvailableCategoryNames: ['github', 'slack'],
        });
    });

    it('bounds each name list independently with its own companion count', () => {
        const tools = Array.from({ length: 30 }, (_, i) => `t${i}`);
        const servers = Array.from({ length: 28 }, (_, i) => `srv${i}`);
        const ctx = BuildMCPToolsContext(makeTools({ VisibleToolNames: tools, AvailableServerNames: servers, AvailableCategoryNames: ['github'] }));
        expect((ctx['VisibleToolNames'] as string[]).length).toBe(MCP_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['VisibleToolNamesCount']).toBe(30);
        expect((ctx['AvailableServerNames'] as string[]).length).toBe(MCP_AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['AvailableServerNamesCount']).toBe(28);
        // Under cap → no companion count.
        expect(ctx['AvailableCategoryNamesCount']).toBeUndefined();
    });
});

describe('buildMCPLogsContext', () => {
    it('publishes execution counts, sort, selection, and non-secret labels', () => {
        const input: MCPLogsContextInput = {
            ExecutionCount: 50,
            FilteredExecutionCount: 12,
            FailedExecutionCount: 3,
            LogStatusFilter: 'Error',
            SortColumn: 'started',
            SortDirection: 'desc',
            VisibleLogLabels: ['github_search · Error', 'slack_post · Success'],
            SelectedLogId: 'log-1',
            SelectedLogName: 'github_search',
            DetailPanelOpen: true,
        };
        const ctx = BuildMCPLogsContext(input);
        expect(ctx).toMatchObject({
            Surface: 'logs',
            ExecutionCount: 50,
            FilteredExecutionCount: 12,
            FailedExecutionCount: 3,
            LogStatusFilter: 'Error',
            SortColumn: 'started',
            SortDirection: 'desc',
            SelectedLogId: 'log-1',
            SelectedLogName: 'github_search',
            DetailPanelOpen: true,
            VisibleLogLabels: ['github_search · Error', 'slack_post · Success'],
        });
    });
});

// ============================================================================
// Dispatch + full-context merge + secret-free audit on the deep slices
// ============================================================================

describe('buildMCPTabContext (dispatch)', () => {
    it('dispatches to the right per-tab builder by discriminant', () => {
        const servers: MCPTabContextInput = {
            Tab: 'servers',
            Data: { ServerCount: 1, FilteredServerCount: 1, ActiveServerCount: 1, ServerStatusFilter: 'all', VisibleServerNames: ['A'], SelectedServerId: null, SelectedServerName: null },
        };
        expect(BuildMCPTabContext(servers)['Surface']).toBe('servers');

        const logs: MCPTabContextInput = {
            Tab: 'logs',
            Data: { ExecutionCount: 0, FilteredExecutionCount: 0, FailedExecutionCount: 0, LogStatusFilter: 'all', SortColumn: 'started', SortDirection: 'desc', VisibleLogLabels: [], SelectedLogId: null, SelectedLogName: null, DetailPanelOpen: false },
        };
        expect(BuildMCPTabContext(logs)['Surface']).toBe('logs');
    });
});

describe('buildMCPAgentContextFull', () => {
    const top: MCPAgentContextInput = {
        ActiveTab: 'tools',
        ServerCount: 3,
        ActiveServerCount: 2,
        ConnectionCount: 5,
        ToolCount: 100,
        RecentExecutionCount: 17,
        FailedExecutionCount: 4,
        CurrentSearchTerm: 'github',
        ToolsViewMode: 'list',
    };

    it('merges the top-level slice with the active-tab deep slice', () => {
        const tab: MCPTabContextInput = {
            Tab: 'tools',
            Data: {
                ToolCount: 100, FilteredToolCount: 8, ToolsViewMode: 'list', ToolStatusFilter: 'all',
                ServerFilter: 'all', ServerFilterName: null, CategoryFilter: 'all', FavoritesOnly: false,
                RecentOnly: false, FavoriteToolCount: 0, VisibleToolNames: ['github_search'],
                AvailableServerNames: ['GitHub'], AvailableCategoryNames: ['github'],
                SelectedToolId: null, SelectedToolName: null,
            },
        };
        const ctx = BuildMCPAgentContextFull(top, tab);
        // top-level keys present
        expect(ctx['ActiveTab']).toBe('tools');
        expect(ctx['CurrentSearchTerm']).toBe('github');
        // deep keys present
        expect(ctx['Surface']).toBe('tools');
        expect(ctx['FilteredToolCount']).toBe(8);
        expect(ctx['VisibleToolNames']).toEqual(['github_search']);
    });

    it('never leaks a secret-bearing key across the merged context (defense-in-depth)', () => {
        const tab: MCPTabContextInput = {
            Tab: 'servers',
            Data: { ServerCount: 1, FilteredServerCount: 1, ActiveServerCount: 1, ServerStatusFilter: 'all', VisibleServerNames: ['GitHub Server'], SelectedServerId: 'srv-1', SelectedServerName: 'GitHub Server' },
        };
        const ctx = BuildMCPAgentContextFull(top, tab);
        const forbidden = ['token', 'secret', 'credential', 'bearer', 'oauth', 'password', 'url', 'command', 'apikey'];
        for (const key of Object.keys(ctx)) {
            for (const bad of forbidden) {
                expect(key.toLowerCase().includes(bad)).toBe(false);
            }
        }
    });
});

describe('MCP_LOG_SORT_COLUMNS', () => {
    it('enumerates exactly the seven sortable log columns', () => {
        expect([...MCP_LOG_SORT_COLUMNS]).toEqual(['status', 'server', 'tool', 'connection', 'started', 'duration', 'error']);
    });
});
