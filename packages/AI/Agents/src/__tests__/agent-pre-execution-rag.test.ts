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

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: { Instance: { Search: vi.fn() } },
    SearchFusion: class { CrossScopeFusion() { return []; } Deduplicate(x: unknown) { return x; } }
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
