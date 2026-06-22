/**
 * Tests for the "find similar by description" action wrappers after their
 * migration onto the unified Provider.SearchEntity pipeline:
 *   - Find Best Action / Find Candidate Actions  (BaseFindActionsAction)
 *   - Find Best Agent  / Find Candidate Agents   (BaseFindAgentsAction)
 *   - Search Query Catalog
 *
 * Each ranks via params.Provider.SearchEntity (semantic mode) and hydrates
 * record metadata from cached engines. Tests focus on validation, the
 * SearchEntity hand-off, hydration/filtering, and result shaping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchEntityMock = vi.fn();
// SearchEntity on the global fallback provider (Metadata.Provider), used when
// the caller does not thread params.Provider (agents, MCP, CLI, scheduled jobs).
const globalSearchEntityMock = vi.fn();

// --- cached-engine state the actions hydrate from -------------------------
const aiEngineState: {
    systemActions: Array<Record<string, unknown>>;
    agents: Array<Record<string, unknown>>;
    agentActions: Array<Record<string, unknown>>;
    agentRelationships: Array<Record<string, unknown>>;
} = { systemActions: [], agents: [], agentActions: [], agentRelationships: [] };

const accessibleAgentsMock = vi.fn();
const queryState: { queries: Array<Record<string, unknown>> } = { queries: [] };

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    NormalizeUUID: (v: unknown) => String(v).toLowerCase(),
    UUIDsEqual: (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase(),
}));

vi.mock('@memberjunction/actions-base', () => ({}));
vi.mock('@memberjunction/ai-core-plus', () => ({}));
vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    RunView: class RunView {
        public async RunView(): Promise<{ Success: boolean; Results: unknown[] }> {
            return { Success: true, Results: [] };
        }
    },
    // Global provider the helper falls back to when params.Provider is absent.
    Metadata: { get Provider() { return { SearchEntity: globalSearchEntityMock }; } },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get SystemActions() { return aiEngineState.systemActions; },
            get Agents() { return aiEngineState.agents; },
            get AgentActions() { return aiEngineState.agentActions; },
            get AgentRelationships() { return aiEngineState.agentRelationships; },
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        GetAccessibleAgents: (...args: unknown[]) => accessibleAgentsMock(...args),
    },
}));

vi.mock('@memberjunction/core-entities-server', () => ({
    QueryEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Queries() { return queryState.queries; },
        },
    },
}));

import { FindBestActionAction } from '../custom/ai/find-best-action.action';
import { FindBestAgentAction } from '../custom/ai/find-best-agent.action';
import { FindCandidateAgentsAction } from '../custom/ai/find-candidate-agents.action';
import { SearchQueryCatalogAction } from '../custom/data/search-query-catalog.action';

type Param = { Name: string; Type: string; Value: unknown };
const makeParams = (
    inputs: Array<{ Name: string; Value: unknown }>,
    opts: { withProvider?: boolean; withUser?: boolean } = {}
): { Params: Param[]; ContextUser?: unknown; Provider?: unknown } => ({
    Params: inputs.map(p => ({ Name: p.Name, Type: 'Input', Value: p.Value })),
    ContextUser: opts.withUser === false ? undefined : { ID: 'user-1', Name: 'Tester' },
    Provider: opts.withProvider === false ? undefined : { SearchEntity: searchEntityMock },
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (action: any, params: unknown) => action.InternalRunAction(params);

beforeEach(() => {
    searchEntityMock.mockReset().mockResolvedValue([]);
    globalSearchEntityMock.mockReset().mockResolvedValue([]);
    accessibleAgentsMock.mockReset().mockResolvedValue([]);
    aiEngineState.systemActions = [];
    aiEngineState.agents = [];
    aiEngineState.agentActions = [];
    aiEngineState.agentRelationships = [];
    queryState.queries = [];
});

describe('FindBestActionAction (wrapper)', () => {
    it('rejects missing TaskDescription', async () => {
        const r = await run(new FindBestActionAction(), makeParams([]));
        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('INVALID_INPUT');
    });

    it('rejects out-of-range MaxResults', async () => {
        const r = await run(new FindBestActionAction(), makeParams([
            { Name: 'TaskDescription', Value: 'do a thing' },
            { Name: 'MaxResults', Value: 99 },
        ]));
        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('INVALID_INPUT');
    });

    it('falls back to the global provider when none is threaded', async () => {
        // Honors the documented RunActionParams.Provider contract
        // (params.Provider ?? global): in-process callers that don't thread a
        // provider (agents, MCP, CLI, scheduled jobs) still rank via the global
        // provider's SearchEntity, just like every other action.
        aiEngineState.systemActions = [
            { ID: 'A1', Name: 'Web Search', Description: 'search web', Category: 'Utility', Status: 'Active', DriverClass: 'WebSearch' },
        ];
        globalSearchEntityMock.mockResolvedValue([
            { recordId: 'A1', score: 0.9, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e1' },
        ]);

        const r = await run(new FindBestActionAction(), makeParams(
            [{ Name: 'TaskDescription', Value: 'do a thing' }],
            { withProvider: false }
        ));

        // The threaded provider was absent, so the global provider's SearchEntity ran.
        expect(searchEntityMock).not.toHaveBeenCalled();
        expect(globalSearchEntityMock).toHaveBeenCalledOnce();
        expect(r.Success).toBe(true);
        expect(JSON.parse(r.Message).allMatches[0].actionName).toBe('Web Search');
    });

    it('calls SearchEntity in semantic mode for MJ: Actions and hydrates results', async () => {
        aiEngineState.systemActions = [
            { ID: 'A1', Name: 'Web Search', Description: 'search web', Category: 'Utility', Status: 'Active', DriverClass: 'WebSearch' },
            { ID: 'A2', Name: 'Create Agent', Description: 'mgmt', Category: 'Agent Management', Status: 'Active', DriverClass: 'CreateAgent' },
        ];
        searchEntityMock.mockResolvedValue([
            { recordId: 'A1', score: 0.91, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e1' },
            { recordId: 'A2', score: 0.80, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e2' },
        ]);

        const r = await run(new FindBestActionAction(), makeParams([{ Name: 'TaskDescription', Value: 'search the web' }]));

        expect(searchEntityMock).toHaveBeenCalledOnce();
        const [sp] = searchEntityMock.mock.calls[0];
        expect(sp.entityName).toBe('MJ: Actions');
        expect(sp.options.mode).toBe('semantic');

        expect(r.Success).toBe(true);
        const payload = JSON.parse(r.Message);
        // Agent Management filtered out by default
        expect(payload.matchCount).toBe(1);
        expect(payload.allMatches[0].actionName).toBe('Web Search');
        expect(payload.allMatches[0].similarityScore).toBe(0.91);
    });

    it('returns NO_ACTIONS_FOUND when nothing hydrates', async () => {
        searchEntityMock.mockResolvedValue([
            { recordId: 'ghost', score: 0.5, matchType: 'semantic', components: {}, entityRecordDocumentId: null },
        ]);
        const r = await run(new FindBestActionAction(), makeParams([{ Name: 'TaskDescription', Value: 'x' }]));
        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('NO_ACTIONS_FOUND');
    });
});

describe('FindBestAgentAction (wrapper)', () => {
    it('permission-filters to runnable agents and excludes Sub-Agents', async () => {
        aiEngineState.agents = [
            { ID: 'G1', Name: 'Researcher', Description: 'research', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, DefaultArtifactType: 'Report' },
            { ID: 'G2', Name: 'Helper Sub', Description: 'sub', Status: 'Active', InvocationMode: 'Sub-Agent', ParentID: null },
            { ID: 'G3', Name: 'NoPerm', Description: 'np', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
        ];
        accessibleAgentsMock.mockResolvedValue([{ ID: 'G1' }, { ID: 'G2' }]); // G3 not runnable
        searchEntityMock.mockResolvedValue([
            { recordId: 'G1', score: 0.9, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e1' },
            { recordId: 'G2', score: 0.85, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e2' },
            { recordId: 'G3', score: 0.8, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e3' },
        ]);

        const r = await run(new FindBestAgentAction(), makeParams([{ Name: 'TaskDescription', Value: 'research stuff' }]));

        expect(r.Success).toBe(true);
        const payload = JSON.parse(r.Message);
        expect(payload.matchCount).toBe(1);
        expect(payload.allMatches[0].agentName).toBe('Researcher');
        // best-agent variant does NOT include subAgents/defaultArtifactType
        expect(payload.allMatches[0].subAgents).toBeUndefined();
        const [, permission] = accessibleAgentsMock.mock.calls[0];
        expect(permission).toBe('run');
    });
});

describe('FindCandidateAgentsAction (wrapper)', () => {
    it('includes sub-agent details and excludes child agents by default', async () => {
        aiEngineState.agents = [
            { ID: 'P1', Name: 'Parent', Description: 'parent', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, DefaultArtifactType: 'Report' },
            { ID: 'C1', Name: 'Child', Description: 'child', Status: 'Active', InvocationMode: 'Top-Level', ParentID: 'P1' },
        ];
        accessibleAgentsMock.mockResolvedValue([{ ID: 'P1' }, { ID: 'C1' }]);
        searchEntityMock.mockResolvedValue([
            { recordId: 'P1', score: 0.9, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e1' },
            { recordId: 'C1', score: 0.88, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e2' },
        ]);

        const r = await run(new FindCandidateAgentsAction(), makeParams([{ Name: 'TaskDescription', Value: 'do work' }]));

        expect(r.Success).toBe(true);
        const payload = JSON.parse(r.Message);
        // child (ParentID set) excluded by default ExcludeSubAgents
        expect(payload.matchCount).toBe(1);
        expect(payload.allMatches[0].agentName).toBe('Parent');
        expect(payload.allMatches[0].defaultArtifactType).toBe('Report');
        expect(payload.allMatches[0].subAgents).toEqual([{ name: 'Child', description: 'child' }]);
    });
});

describe('SearchQueryCatalogAction (wrapper)', () => {
    it('rejects missing SearchText', async () => {
        const r = await run(new SearchQueryCatalogAction(), makeParams([]));
        expect(r.Success).toBe(false);
        expect(r.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('ranks via SearchEntity over MJ: Queries and filters to approved', async () => {
        queryState.queries = [
            { ID: 'Q1', Name: 'Active Members', Description: 'list members', Category: 'Members', Status: 'Approved', Reusable: true, SQL: 'SELECT 1', UserQuestion: 'who is active' },
            { ID: 'Q2', Name: 'Draft Query', Description: 'wip', Category: 'Misc', Status: 'Pending', Reusable: false, SQL: 'SELECT 2', UserQuestion: 'wip' },
        ];
        searchEntityMock.mockResolvedValue([
            { recordId: 'Q1', score: 0.72, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e1' },
            { recordId: 'Q2', score: 0.71, matchType: 'semantic', components: {}, entityRecordDocumentId: 'e2' },
        ]);

        const r = await run(new SearchQueryCatalogAction(), makeParams([{ Name: 'SearchText', Value: 'active members' }]));

        const [sp] = searchEntityMock.mock.calls[0];
        expect(sp.entityName).toBe('MJ: Queries');
        expect(sp.options.mode).toBe('semantic');

        expect(r.Success).toBe(true);
        const resultsParam = r ? (r as { Success: boolean }) : null;
        expect(resultsParam).toBeTruthy();
        // Q2 (Pending) filtered out by approvedOnly default
        expect(r.Message).toMatch(/Active Members/);
    });

    it('returns NO_MATCHES when nothing hydrates', async () => {
        searchEntityMock.mockResolvedValue([
            { recordId: 'ghost', score: 0.6, matchType: 'semantic', components: {}, entityRecordDocumentId: null },
        ]);
        const r = await run(new SearchQueryCatalogAction(), makeParams([{ Name: 'SearchText', Value: 'x' }]));
        expect(r.Success).toBe(true);
        expect(r.ResultCode).toBe('NO_MATCHES');
    });
});
