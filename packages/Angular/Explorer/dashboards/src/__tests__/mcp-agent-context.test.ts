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
    buildMCPAgentContext,
    isValidMCPTab,
    isValidToolsViewMode,
    MCP_TABS,
    MCP_TOOLS_VIEW_MODES,
    MCPAgentContextInput,
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
        const ctx = buildMCPAgentContext(
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
        const ctx = buildMCPAgentContext(
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
        const ctx = buildMCPAgentContext(makeInput());
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
            expect(isValidMCPTab(tab)).toBe(true);
        }
    });

    it('rejects unknown / malformed input', () => {
        expect(isValidMCPTab('Servers')).toBe(false); // case-sensitive by design
        expect(isValidMCPTab('oauth')).toBe(false);
        expect(isValidMCPTab('')).toBe(false);
        expect(isValidMCPTab(undefined)).toBe(false);
        expect(isValidMCPTab(null)).toBe(false);
        expect(isValidMCPTab(3)).toBe(false);
        expect(isValidMCPTab({ tab: 'tools' })).toBe(false);
    });
});

describe('isValidToolsViewMode', () => {
    it('accepts every known view mode', () => {
        for (const mode of MCP_TOOLS_VIEW_MODES) {
            expect(isValidToolsViewMode(mode)).toBe(true);
        }
    });

    it('rejects unknown / malformed input', () => {
        expect(isValidToolsViewMode('grid')).toBe(false);
        expect(isValidToolsViewMode('Card')).toBe(false);
        expect(isValidToolsViewMode('')).toBe(false);
        expect(isValidToolsViewMode(undefined)).toBe(false);
        expect(isValidToolsViewMode(null)).toBe(false);
        expect(isValidToolsViewMode(0)).toBe(false);
    });
});
