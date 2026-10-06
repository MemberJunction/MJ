import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core-entities', () => {
    return {
        SearchEngineBase: {
            Instance: {
                Config: vi.fn(async () => {}),
                GetAgentScopes: vi.fn(() => []),
                GetActiveScopeByID: vi.fn(() => undefined),
            }
        }
    };
});

const { mockSearch, mockStreamSearch, mockLogForbidden, mockResolvePermission, PERMITTED } = vi.hoisted(() => {
    const PERMITTED = { Allowed: true, Level: 'Search', Source: 'RoleGrant', Reason: 'granted' };
    return {
        PERMITTED,
        mockSearch: vi.fn(),
        mockStreamSearch: vi.fn(),
        mockLogForbidden: vi.fn(async () => {}),
        // Permitted by default, so a test that reaches the search path without stubbing the gate
        // behaves as before this gate existed, instead of tripping on an undefined verdict.
        mockResolvePermission: vi.fn(async () => PERMITTED),
    };
});

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: { Instance: { Search: mockSearch, streamSearch: mockStreamSearch, LogForbiddenSearch: mockLogForbidden } },
    SearchFusion: class { CrossScopeFusion() { return []; } Deduplicate(x: unknown) { return x; } },
    GetSearchScopePermissionResolver: () => ({ ResolveEffectivePermission: mockResolvePermission }),
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: { Instance: { Config: vi.fn(async () => {}), FindTemplate: () => undefined, RenderTemplate: vi.fn() } }
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    RunView: class {
        async RunView() { return { Success: true, Results: [] }; }
    },
    UserInfo: class {}
}));

import { AgentPreExecutionRAG } from '../agent-pre-execution-rag';
import { SearchEngineBase } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

describe('AgentPreExecutionRAG', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('scope permission gate', () => {
        const agent = { ID: 'agent-1', Name: 'Helper', Description: null } as never;
        const rowFor = (scopeID: string) => ({ SearchScopeID: scopeID, Priority: 1, MaxResults: 5, MinScore: 0, FusionWeightsOverride: null, QueryTemplateID: null }) as never;
        const scopes: Record<string, unknown> = {
            s1: { ID: 's1', Name: 'HR', Description: null, Icon: null },
            s2: { ID: 's2', Name: 'Finance', Description: null, Icon: null },
        };
        const emptySearch = { Success: true, Results: [], TotalCount: 0, ElapsedMs: 1, SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 } };
        const run = (extra: Record<string, unknown> = {}) =>
            new AgentPreExecutionRAG().Execute({ agent, lastUserMessage: 'refund policy', contextUser: fakeUser, primaryScopeRecordId: 'org-1', ...extra });

        beforeEach(() => {
            (SearchEngineBase.Instance.GetAgentScopes as ReturnType<typeof vi.fn>).mockReturnValue([rowFor('s1')]);
            (SearchEngineBase.Instance.GetActiveScopeByID as ReturnType<typeof vi.fn>).mockImplementation((id: string) => scopes[id]);
            mockSearch.mockResolvedValue(emptySearch);
            mockResolvePermission.mockResolvedValue(PERMITTED);
        });

        it('skips a scope the acting user may not use: no search runs, and the attempt is logged as Forbidden', async () => {
            mockResolvePermission.mockResolvedValue({ Allowed: false, Level: 'None', Source: 'RoleGrant', Reason: 'no grant for this user' });
            expect(await run()).toBeNull();
            expect(mockSearch).not.toHaveBeenCalled();
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
            expect(mockLogForbidden.mock.calls[0][0]).toMatchObject({
                Query: 'refund policy', ScopeIDs: ['s1'], FailureReason: 'no grant for this user', AIAgentID: 'agent-1', PrimaryScopeRecordID: 'org-1',
            });
        });

        it('refuses a Read-level grant: visibility of the scope is not the right to search it (same bar as the action)', async () => {
            mockResolvePermission.mockResolvedValue({ Allowed: true, Level: 'Read', Source: 'RoleGrant', Reason: 'read grant' });
            expect(await run()).toBeNull();
            expect(mockSearch).not.toHaveBeenCalled();
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
            expect(mockLogForbidden.mock.calls[0][0].FailureReason).toMatch(/Read grants visibility/);
        });

        it('resolves the permission with the acting user, the agent as principal and the tenant, then searches a permitted scope', async () => {
            await run();
            expect(mockResolvePermission).toHaveBeenCalledTimes(1);
            expect(mockResolvePermission.mock.calls[0][0]).toMatchObject({ User: fakeUser, SearchScopeID: 's1', Agent: agent, PrimaryScopeRecordID: 'org-1' });
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockLogForbidden).not.toHaveBeenCalled();
        });

        it('passes a null tenant through when the run has none', async () => {
            await run({ primaryScopeRecordId: undefined });
            expect(mockResolvePermission.mock.calls[0][0]).toMatchObject({ PrimaryScopeRecordID: null });
        });

        it('treats a resolver failure as denied for that scope only, and still searches the others', async () => {
            (SearchEngineBase.Instance.GetAgentScopes as ReturnType<typeof vi.fn>).mockReturnValue([rowFor('s1'), rowFor('s2')]);
            mockResolvePermission.mockImplementation(async (input: { SearchScopeID: string }) => {
                if (input.SearchScopeID === 's1') throw new Error('permission store unavailable');
                return PERMITTED;
            });
            await run();
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
            expect(mockLogForbidden.mock.calls[0][0]).toMatchObject({ ScopeIDs: ['s1'] });
            expect(mockLogForbidden.mock.calls[0][0].FailureReason).toMatch(/could not be resolved, reported as denied/);
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockSearch.mock.calls[0][0]).toMatchObject({ ScopeIDs: ['s2'] });
        });

        it('a denied scope does not stop the others from being searched', async () => {
            (SearchEngineBase.Instance.GetAgentScopes as ReturnType<typeof vi.fn>).mockReturnValue([rowFor('s1'), rowFor('s2')]);
            mockResolvePermission.mockImplementation(async (input: { SearchScopeID: string }) =>
                input.SearchScopeID === 's1' ? { Allowed: false, Level: 'None', Source: 'NoGrant', Reason: 'no grant' } : PERMITTED);
            await run();
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockSearch.mock.calls[0][0]).toMatchObject({ ScopeIDs: ['s2'] });
        });

        it('gates the streaming path too', async () => {
            mockResolvePermission.mockResolvedValue({ Allowed: false, Level: 'None', Source: 'NoGrant', Reason: 'no grant' });
            expect(await run({ streamingEnabled: true })).toBeNull();
            expect(mockStreamSearch).not.toHaveBeenCalled();
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
        });
    });

    it('returns null when agent has no ID', async () => {
        const rag = new AgentPreExecutionRAG();
        const result = await rag.Execute({
            agent: {} as never,
            lastUserMessage: 'find me something',
            contextUser: fakeUser
        });
        expect(result).toBeNull();
    });

    it('returns null when agent has no active pre-execution scopes', async () => {
        (SearchEngineBase.Instance.GetAgentScopes as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
        const rag = new AgentPreExecutionRAG();
        const result = await rag.Execute({
            agent: { ID: 'agent-1' } as never,
            lastUserMessage: 'q',
            contextUser: fakeUser
        });
        expect(result).toBeNull();
        expect(SearchEngineBase.Instance.GetAgentScopes).toHaveBeenCalledWith('agent-1', 'PreExecution');
    });

    describe('BuildArtifactPayload', () => {
        it('returns undefined when no combined results', () => {
            const rag = new AgentPreExecutionRAG();
            const payload = rag.BuildArtifactPayload({
                formattedSystemMessage: '',
                perScopeResults: [],
                combinedResults: [],
                queriedScopeIDs: [],
                agentScopeRows: []
            });
            expect(payload).toBeUndefined();
        });

        it('produces a Data Snapshot–shaped payload with tables + computations', () => {
            const rag = new AgentPreExecutionRAG();
            const payload = rag.BuildArtifactPayload({
                formattedSystemMessage: '',
                perScopeResults: [
                    {
                        scopeID: 's1',
                        scopeName: 'HR',
                        scopeDescription: null,
                        scopeIcon: null,
                        query: 'refund',
                        results: [],
                        minScore: 0
                    }
                ],
                combinedResults: [
                    {
                        ID: 'r1',
                        EntityName: 'Docs',
                        RecordID: 'r1',
                        SourceType: 'vector',
                        ResultType: 'entity-record',
                        Title: 'Policy',
                        Snippet: '',
                        Score: 0.9,
                        ScoreBreakdown: { Vector: 0.9 },
                        Tags: [],
                        MatchedAt: new Date()
                    }
                ],
                queriedScopeIDs: ['s1'],
                agentScopeRows: []
            });
            expect(payload).toBeDefined();
            expect(Array.isArray((payload as { tables: unknown[] }).tables)).toBe(true);
            expect((payload as { tables: { rows: unknown[] }[] }).tables[0].rows.length).toBe(1);
            expect(Array.isArray((payload as { computations: unknown[] }).computations)).toBe(true);
        });
    });
});
