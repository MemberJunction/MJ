/**
 * Tests for the System Diagnostics dashboard's pure agent-context helpers:
 * - buildSystemDiagnosticsAgentContext: read-only diagnostic snapshot → context
 * - isValidDiagnosticsSection / isValidPerfTab: tolerant tool-input validation
 *
 * 🚨 SAFETY: includes an explicit assertion that the published context can NEVER
 * contain a secret-bearing key (token / password / credential / connection
 * string / cache value). System Diagnostics is read-only — context is diagnostic
 * METRICS + bounded runtime SHAPE names (engine class names, redundant entity
 * names, slow-op labels), never raw payloads, cache values, or secrets.
 */
import { describe, it, expect } from 'vitest';
import {
    buildSystemDiagnosticsAgentContext,
    isValidDiagnosticsSection,
    isValidPerfTab,
    VALID_DIAGNOSTICS_SECTIONS,
    VALID_PERF_TABS,
    SystemDiagnosticsAgentContextInput,
} from '../SystemDiagnostics/system-diagnostics-agent-context';
import { AGENT_CONTEXT_NAME_LIST_CAP } from '../shared/agent-tool-validation';

function makeInput(overrides: Partial<SystemDiagnosticsAgentContextInput> = {}): SystemDiagnosticsAgentContextInput {
    return {
        ActiveSection: 'engines',
        PerfTab: 'monitor',
        TelemetrySource: 'client',
        TelemetryEnabled: true,
        ServerTelemetryEnabled: false,
        CategoryFilter: 'all',
        SlowQueryThresholdMs: 500,
        EngineCount: 12,
        LoadedEngineCount: 9,
        TotalMemoryBytes: 1024 * 1024,
        TotalMemoryDisplay: '1.0 MB',
        EngineNames: ['AIModelEngine', 'QueryEngine', 'UserCache'],
        RedundantLoadCount: 1,
        RedundantEntityNames: ['Users'],
        TotalEvents: 200,
        TotalPatterns: 30,
        TotalInsights: 2,
        ActiveEvents: 1,
        SlowQueryCount: 2,
        SlowOperations: [
            { Label: 'Users', Category: 'RunView', ElapsedMs: 820 },
            { Label: 'spGetReport', Category: 'RunQuery', ElapsedMs: 610 },
        ],
        CategoryBreakdown: [
            { Name: 'RunView', Events: 120, AvgMs: 45 },
            { Name: 'RunQuery', Events: 80, AvgMs: 90 },
        ],
        CacheInitialized: true,
        CacheTotalEntries: 50,
        CacheTotalSizeBytes: 2048,
        CacheHits: 300,
        CacheMisses: 20,
        CacheHitRate: 93.75,
        CacheDatasetCount: 5,
        CacheRunViewCount: 40,
        CacheRunQueryCount: 5,
        ...overrides,
    };
}

describe('isValidDiagnosticsSection / isValidPerfTab', () => {
    it('accepts the known sections and perf tabs', () => {
        for (const s of VALID_DIAGNOSTICS_SECTIONS) expect(isValidDiagnosticsSection(s)).toBe(true);
        for (const t of VALID_PERF_TABS) expect(isValidPerfTab(t)).toBe(true);
    });
    it('rejects unknown / non-string values', () => {
        expect(isValidDiagnosticsSection('secrets')).toBe(false);
        expect(isValidPerfTab('logs')).toBe(false);
        expect(isValidDiagnosticsSection(null)).toBe(false);
        expect(isValidPerfTab(7)).toBe(false);
    });
});

describe('buildSystemDiagnosticsAgentContext', () => {
    it('reports navigation, metrics, and bounded names', () => {
        const ctx = buildSystemDiagnosticsAgentContext(makeInput());
        expect(ctx['ActiveSection']).toBe('engines');
        expect(ctx['EngineCount']).toBe(12);
        expect(ctx['LoadedEngineCount']).toBe(9);
        expect(ctx['EngineNames']).toEqual(['AIModelEngine', 'QueryEngine', 'UserCache']);
        expect(ctx['RedundantEntityNames']).toEqual(['Users']);
        expect(ctx['CacheHitRate']).toBe(93.75);
    });

    it('caps slow-operations to 10 and preserves label/category/duration shape', () => {
        const many = Array.from({ length: 18 }, (_, i) => ({ Label: `op-${i}`, Category: 'RunView', ElapsedMs: 700 + i }));
        const ctx = buildSystemDiagnosticsAgentContext(makeInput({ SlowOperations: many }));
        const ops = ctx['SlowOperations'] as Array<Record<string, unknown>>;
        expect(ops.length).toBe(10);
        expect(Object.keys(ops[0]).sort()).toEqual(['Category', 'ElapsedMs', 'Label']);
    });

    it('bounds engine + redundant name lists with truncation flags', () => {
        const many = Array.from({ length: AGENT_CONTEXT_NAME_LIST_CAP + 5 }, (_, i) => `Engine${i}`);
        const ctx = buildSystemDiagnosticsAgentContext(makeInput({ EngineNames: many, RedundantEntityNames: many }));
        expect((ctx['EngineNames'] as string[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['EngineNamesTruncated']).toBe(true);
        expect(ctx['RedundantEntityNamesTruncated']).toBe(true);
    });

    // 🚨 The load-bearing safety test: the published context must never carry any
    // secret-bearing key, regardless of input.
    it('NEVER leaks a secret-bearing key (security boundary)', () => {
        const SECRET_KEY_PATTERNS = [
            'secret', 'password', 'passwd', 'pwd', 'token', 'apikey', 'api_key',
            'privatekey', 'private_key', 'connectionstring', 'connection_string',
            'credentialvalue', 'hash', 'bearer', 'payload', 'rawsql', 'sqltext',
        ];

        // Hostile inputs: secret-looking strings stuffed into name fields are still
        // published only as benign diagnostic SHAPE strings under whitelisted keys.
        const ctx = buildSystemDiagnosticsAgentContext(makeInput({
            EngineNames: ['token-stuffer', 'PasswordEngine'],
            SlowOperations: [{ Label: 'secret-op', Category: 'RunView', ElapsedMs: 999 }],
        }));

        for (const key of Object.keys(ctx)) {
            const lower = key.toLowerCase();
            for (const pattern of SECRET_KEY_PATTERNS) {
                expect(
                    lower.includes(pattern),
                    `Context KEY "${key}" matches secret-like pattern "${pattern}"`,
                ).toBe(false);
            }
        }

        // The input contract itself has no field for a cache VALUE, telemetry
        // payload, filter SQL body, or secret — so none can be published.
        const inputKeys = Object.keys(makeInput());
        expect(inputKeys).not.toContain('CacheValues');
        expect(inputKeys).not.toContain('TelemetryPayloads');
        expect(inputKeys).not.toContain('FilterSQL');
        expect(inputKeys).not.toContain('QueryResults');
    });
});
