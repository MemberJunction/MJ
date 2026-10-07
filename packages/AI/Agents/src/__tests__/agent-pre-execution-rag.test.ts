import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LogStatusOptions, UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentSearchScopeEntity, MJAISkillEntity, MJSearchScopeEntity } from '@memberjunction/core-entities';
import type { EffectivePermission, ResolvePermissionInput, SearchEngine, SearchResult } from '@memberjunction/search-engine';

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

/** The `LogForbiddenSearch` input, from the engine's own signature. */
type ForbiddenSearchInput = Parameters<SearchEngine['LogForbiddenSearch']>[0];

const {
    mockSearch, mockStreamSearch, mockLogForbidden, mockResolvePermission, mockRenderTemplate, mockFindTemplate,
    mockLogError, mockLogStatusEx, cachedSkills, Verdict, PERMITTED,
} = vi.hoisted(() => {
    /** A resolver verdict, built the way the resolver builds one. */
    const Verdict = (Allowed: boolean, Level: EffectivePermission['Level'], Source: EffectivePermission['Source'], Reason: string): EffectivePermission =>
        ({ Allowed, Level, Source, Reason, toSqlPredicate: () => (Allowed ? '1=1' : '1=0') });
    const PERMITTED = Verdict(true, 'Search', 'RoleGrant', 'granted');
    return {
        Verdict,
        PERMITTED,
        mockSearch: vi.fn<SearchEngine['Search']>(),
        mockStreamSearch: vi.fn<SearchEngine['streamSearch']>(),
        mockLogForbidden: vi.fn(async (_input: ForbiddenSearchInput): Promise<void> => {}),
        // Permitted by default, so a test that reaches the search path without stubbing the gate
        // behaves as before this gate existed, instead of tripping on an undefined verdict.
        mockResolvePermission: vi.fn(async (_input: ResolvePermissionInput): Promise<EffectivePermission> => PERMITTED),
        mockRenderTemplate: vi.fn(async () => ({ Success: true, Output: 'rendered query' })),
        mockFindTemplate: vi.fn((_id: string): { GetHighestPriorityContent: () => { TemplateText: string } } | undefined => undefined),
        mockLogError: vi.fn((_message: string) => {}),
        mockLogStatusEx: vi.fn((_options: LogStatusOptions | string) => {}),
        /** What AIEngine.Instance.Skills holds for the test. */
        cachedSkills: [] as MJAISkillEntity[],
    };
});

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: { Instance: { Search: mockSearch, streamSearch: mockStreamSearch, LogForbiddenSearch: mockLogForbidden } },
    SearchFusion: class { CrossScopeFusion() { return []; } Deduplicate(x: unknown) { return x; } },
    GetSearchScopePermissionResolver: () => ({ ResolveEffectivePermission: mockResolvePermission }),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn(async () => {}), get Skills() { return cachedSkills; } } },
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: { Instance: { Config: vi.fn(async () => {}), FindTemplate: mockFindTemplate, RenderTemplate: mockRenderTemplate } }
}));

vi.mock('@memberjunction/core', () => ({
    LogError: mockLogError,
    LogStatus: vi.fn(),
    LogStatusEx: mockLogStatusEx,
    IsVerboseLoggingEnabled: () => false,
    RunView: class {
        async RunView() { return { Success: true, Results: [] }; }
    },
    UserInfo: class {}
}));

import { AgentPreExecutionRAG, type AgentPreExecutionRAGParams } from '../agent-pre-execution-rag';
import { SearchEngineBase } from '@memberjunction/core-entities';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

describe('AgentPreExecutionRAG', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('scope permission gate', () => {
        const agentFields: Pick<MJAIAgentEntity, 'ID' | 'Name' | 'Description'> = { ID: 'agent-1', Name: 'Helper', Description: null };
        const agent = agentFields as MJAIAgentEntity;
        type RowFields = Pick<MJAIAgentSearchScopeEntity,
            'SearchScopeID' | 'Priority' | 'MaxResults' | 'MinScore' | 'FusionWeightsOverride' | 'QueryTemplateID'>;
        const rowFor = (scopeID: string, queryTemplateID: string | null = null): MJAIAgentSearchScopeEntity => {
            const fields: RowFields = {
                SearchScopeID: scopeID, Priority: 1, MaxResults: 5, MinScore: 0, FusionWeightsOverride: null, QueryTemplateID: queryTemplateID,
            };
            return fields as MJAIAgentSearchScopeEntity;
        };
        const scopeFor = (ID: string, Name: string): MJSearchScopeEntity => {
            const fields: Pick<MJSearchScopeEntity, 'ID' | 'Name' | 'Description' | 'Icon'> = { ID, Name, Description: null, Icon: null };
            return fields as MJSearchScopeEntity;
        };
        const skillFor = (ID: string): MJAISkillEntity => {
            const fields: Pick<MJAISkillEntity, 'ID' | 'Name'> = { ID, Name: `Skill ${ID}` };
            return fields as MJAISkillEntity;
        };
        const scopes: Record<string, MJSearchScopeEntity> = { s1: scopeFor('s1', 'HR'), s2: scopeFor('s2', 'Finance') };
        const emptySearch: SearchResult = {
            Success: true, Results: [], TotalCount: 0, ElapsedMs: 1, SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 }, Providers: [],
        };
        const run = (extra: Partial<AgentPreExecutionRAGParams> = {}) =>
            new AgentPreExecutionRAG().Execute({ agent, lastUserMessage: 'refund policy', contextUser: fakeUser, primaryScopeRecordId: 'org-1', ...extra });
        const denyAll = () => mockResolvePermission.mockResolvedValue(Verdict(false, 'None', 'NoGrant', 'no grant for this user'));
        const resolverInput = (call = 0): ResolvePermissionInput => mockResolvePermission.mock.calls[call][0];
        const forbiddenRow = (call = 0): ForbiddenSearchInput => mockLogForbidden.mock.calls[call][0];

        beforeEach(() => {
            vi.mocked(SearchEngineBase.Instance.GetAgentScopes).mockReturnValue([rowFor('s1')]);
            vi.mocked(SearchEngineBase.Instance.GetActiveScopeByID).mockImplementation((id: string) => scopes[id]);
            mockSearch.mockResolvedValue(emptySearch);
            mockResolvePermission.mockResolvedValue(PERMITTED);
            mockFindTemplate.mockReturnValue(undefined);
            cachedSkills.length = 0;
        });

        it('skips a scope the acting user may not use: no search runs, the attempt is logged as Forbidden, the console line is verbose-only', async () => {
            denyAll();
            expect(await run()).toBeNull();
            expect(mockSearch).not.toHaveBeenCalled();
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
            expect(forbiddenRow()).toMatchObject({
                Query: 'refund policy', ScopeIDs: ['s1'], FailureReason: 'no grant for this user', AIAgentID: 'agent-1',
                AISkillID: null, PrimaryScopeRecordID: 'org-1', ContextUser: fakeUser,
            });
            expect(mockLogStatusEx).toHaveBeenCalledWith(expect.objectContaining({ verboseOnly: true }));
            expect(mockLogError).not.toHaveBeenCalled();
        });

        it('refuses a Read-level grant: visibility of the scope is not the right to search it (same bar as the action)', async () => {
            mockResolvePermission.mockResolvedValue(Verdict(true, 'Read', 'RoleGrant', 'read grant'));
            expect(await run()).toBeNull();
            expect(mockSearch).not.toHaveBeenCalled();
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
            expect(forbiddenRow().FailureReason).toMatch(/Read grants visibility/);
        });

        it('searches a scope granted at Manage', async () => {
            mockResolvePermission.mockResolvedValue(Verdict(true, 'Manage', 'DirectGrant', 'manage grant'));
            await run();
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockLogForbidden).not.toHaveBeenCalled();
        });

        it('resolves the permission with the acting user (as User and ContextUser), the agent as principal and the tenant, then searches', async () => {
            await run();
            expect(mockResolvePermission).toHaveBeenCalledTimes(1);
            expect(resolverInput()).toMatchObject({
                User: fakeUser, ContextUser: fakeUser, SearchScopeID: 's1', Agent: agent, Skill: null, PrimaryScopeRecordID: 'org-1',
            });
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockLogForbidden).not.toHaveBeenCalled();
        });

        it('passes a null tenant through when the run has none, to the resolver and to the Forbidden row', async () => {
            denyAll();
            await run({ primaryScopeRecordId: undefined });
            expect(resolverInput()).toMatchObject({ PrimaryScopeRecordID: null });
            expect(forbiddenRow().PrimaryScopeRecordID).toBeNull();
        });

        it('truncates the Forbidden reason to the 500-character column', async () => {
            mockResolvePermission.mockResolvedValue(Verdict(false, 'None', 'NoGrant', 'x'.repeat(600)));
            await run();
            expect(forbiddenRow().FailureReason).toHaveLength(500);
        });

        it('treats a resolver failure as denied for that scope only: an error is logged, no Forbidden row is written, the others still run', async () => {
            vi.mocked(SearchEngineBase.Instance.GetAgentScopes).mockReturnValue([rowFor('s1'), rowFor('s2')]);
            mockResolvePermission.mockImplementation(async (input: ResolvePermissionInput) => {
                if (input.SearchScopeID === 's1') throw new Error('permission store unavailable');
                return PERMITTED;
            });
            await run();
            expect(mockLogError).toHaveBeenCalledWith(expect.stringMatching(/"HR" could not be resolved.*permission store unavailable/));
            expect(mockLogForbidden).not.toHaveBeenCalled();
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockSearch.mock.calls[0][0]).toMatchObject({ ScopeIDs: ['s2'] });
        });

        it('a denied scope does not stop the others from being searched', async () => {
            vi.mocked(SearchEngineBase.Instance.GetAgentScopes).mockReturnValue([rowFor('s1'), rowFor('s2')]);
            mockResolvePermission.mockImplementation(async (input: ResolvePermissionInput) =>
                input.SearchScopeID === 's1' ? Verdict(false, 'None', 'NoGrant', 'no grant') : PERMITTED);
            await run();
            expect(mockSearch).toHaveBeenCalledTimes(1);
            expect(mockSearch.mock.calls[0][0]).toMatchObject({ ScopeIDs: ['s2'] });
        });

        it('gates the streaming path too', async () => {
            denyAll();
            expect(await run({ streamingEnabled: true })).toBeNull();
            expect(mockStreamSearch).not.toHaveBeenCalled();
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
        });

        it('gates before the query template is rendered; the Forbidden row carries the message, not a rendering', async () => {
            vi.mocked(SearchEngineBase.Instance.GetAgentScopes).mockReturnValue([rowFor('s1', 'tmpl-1')]);
            mockFindTemplate.mockReturnValue({ GetHighestPriorityContent: () => ({ TemplateText: '{{ lastUserMessage }}' }) });
            await run();
            // Control: permitted, the template renders and its output is the query.
            expect(mockRenderTemplate).toHaveBeenCalledTimes(1);
            expect(mockSearch.mock.calls[0][0]).toMatchObject({ Query: 'rendered query' });

            vi.clearAllMocks();
            denyAll();
            expect(await run()).toBeNull();
            expect(mockRenderTemplate).not.toHaveBeenCalled();
            expect(mockSearch).not.toHaveBeenCalled();
            expect(forbiddenRow().Query).toBe('refund policy');
        });

        it.each(['', '   '])('skips a template-less scope before the gate on an empty message (%j): no permission check, no Forbidden row', async (message) => {
            denyAll();
            expect(await run({ lastUserMessage: message })).toBeNull();
            expect(mockResolvePermission).not.toHaveBeenCalled();
            expect(mockLogForbidden).not.toHaveBeenCalled();
            expect(mockSearch).not.toHaveBeenCalled();
        });

        it('still gates a templated scope when the message is empty: the template may build the query from other context', async () => {
            vi.mocked(SearchEngineBase.Instance.GetAgentScopes).mockReturnValue([rowFor('s1', 'tmpl-1')]);
            denyAll();
            await run({ lastUserMessage: '' });
            expect(mockResolvePermission).toHaveBeenCalledTimes(1);
            expect(mockLogForbidden).toHaveBeenCalledTimes(1);
        });

        it('passes the lone active skill as the principal: to the resolver, the search and the Forbidden row', async () => {
            const skill = skillFor('skill-1');
            cachedSkills.push(skillFor('skill-other'), skill);
            await run({ activeSkillIDs: ['SKILL-1'] });
            expect(resolverInput().Skill).toBe(skill);
            expect(mockSearch.mock.calls[0][0]).toMatchObject({ AISkillID: 'skill-1' });

            vi.clearAllMocks();
            denyAll();
            await run({ activeSkillIDs: ['skill-1'] });
            expect(forbiddenRow().AISkillID).toBe('skill-1');
        });

        it('threads the skill principal through the streaming path', async () => {
            cachedSkills.push(skillFor('skill-1'));
            mockStreamSearch.mockImplementation(async function* () {
                yield { phase: 'final' as const, results: [], sourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 }, elapsedMs: 1 };
            });
            await run({ activeSkillIDs: ['skill-1'], streamingEnabled: true });
            expect(mockStreamSearch).toHaveBeenCalledTimes(1);
            expect(mockStreamSearch.mock.calls[0][0]).toMatchObject({ AISkillID: 'skill-1' });
        });

        it('writes each provider\'s count to the streaming trace from resultCount — a progress event carries no rows', async () => {
            mockStreamSearch.mockImplementation(async function* () {
                yield { phase: 'provider' as const, providerName: 'FullText', results: [], resultCount: 4, durationMs: 12 };
                yield { phase: 'final' as const, results: [], sourceCounts: { Vector: 0, FullText: 4, Entity: 0, Storage: 0 }, elapsedMs: 15 };
            });
            const streamingTrace: string[] = [];
            await run({ streamingEnabled: true, streamingTrace });
            expect(streamingTrace).toEqual(['### Provider `FullText` returned 4 rows in 12ms']);
        });

        it('passes no skill principal when several skills are active (the action\'s rule)', async () => {
            cachedSkills.push(skillFor('skill-1'), skillFor('skill-2'));
            await run({ activeSkillIDs: ['skill-1', 'skill-2'] });
            expect(resolverInput().Skill).toBeNull();
            expect(mockSearch.mock.calls[0][0].AISkillID).toBeUndefined();
        });

        describe('an audience (audienceReaders)', () => {
            const readerA = { ID: 'reader-a', Name: 'Reader A' } as unknown as UserInfo;
            const readerB = { ID: 'reader-b', Name: 'Reader B' } as unknown as UserInfo;
            const denyFor = (deniedID: string) => mockResolvePermission.mockImplementation(async (input: ResolvePermissionInput) =>
                input.User.ID === deniedID ? Verdict(false, 'None', 'NoGrant', 'no grant for this reader') : PERMITTED);

            it('passes the readers to Search, leaving out the caller and a reader listed twice', async () => {
                await run({ audienceReaders: [readerA, { ID: 'U1' } as unknown as UserInfo, { ID: 'READER-A', Name: 'Reader A' } as unknown as UserInfo] });
                expect(mockSearch).toHaveBeenCalledTimes(1);
                expect(mockSearch.mock.calls[0][0].Audience).toEqual({ Readers: [readerA] });
            });

            it('passes the readers to streamSearch too', async () => {
                mockStreamSearch.mockImplementation(async function* () {
                    yield { phase: 'final' as const, results: [], sourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 }, elapsedMs: 1 };
                });
                await run({ audienceReaders: [readerA], streamingEnabled: true });
                expect(mockStreamSearch.mock.calls[0][0].Audience).toEqual({ Readers: [readerA] });
            });

            it('sets no Audience on the search without readers, or when the only reader is the caller', async () => {
                await run({ audienceReaders: [{ ID: 'u1' } as unknown as UserInfo] });
                expect(mockSearch.mock.calls[0][0].Audience).toBeUndefined();
                expect(mockResolvePermission).toHaveBeenCalledTimes(1);
            });

            it('runs the scope gate for every reader, the reader as User and the caller as ContextUser', async () => {
                await run({ audienceReaders: [readerA, readerB] });
                expect(mockResolvePermission).toHaveBeenCalledTimes(3);
                const users = mockResolvePermission.mock.calls.map(c => c[0].User.ID);
                expect(users[0]).toBe('u1');
                expect(users.slice(1).sort()).toEqual(['reader-a', 'reader-b']);
                for (const call of mockResolvePermission.mock.calls) {
                    expect(call[0]).toMatchObject({ ContextUser: fakeUser, SearchScopeID: 's1', Agent: agent, PrimaryScopeRecordID: 'org-1' });
                }
            });

            it('skips the scope for a refused reader and writes one Forbidden row naming them', async () => {
                denyFor('reader-b');
                expect(await run({ audienceReaders: [readerA, readerB] })).toBeNull();
                expect(mockSearch).not.toHaveBeenCalled();
                expect(mockLogForbidden).toHaveBeenCalledTimes(1);
                expect(forbiddenRow()).toMatchObject({ ScopeIDs: ['s1'], ContextUser: fakeUser, AIAgentID: 'agent-1', PrimaryScopeRecordID: 'org-1' });
                expect(forbiddenRow().FailureReason).toMatch(/Audience reader 'Reader B' \(reader-b\) may not search this scope: no grant for this reader/);
            });

            it('refuses a reader whose grant is only Read, as it does the caller', async () => {
                mockResolvePermission.mockImplementation(async (input: ResolvePermissionInput) =>
                    input.User.ID === 'reader-a' ? Verdict(true, 'Read', 'RoleGrant', 'read grant') : PERMITTED);
                expect(await run({ audienceReaders: [readerA] })).toBeNull();
                expect(forbiddenRow().FailureReason).toMatch(/Read grants visibility/);
            });

            it('skips only the refused scope: a scope every reader may search still runs', async () => {
                vi.mocked(SearchEngineBase.Instance.GetAgentScopes).mockReturnValue([rowFor('s1'), rowFor('s2')]);
                mockResolvePermission.mockImplementation(async (input: ResolvePermissionInput) =>
                    input.SearchScopeID === 's1' && input.User.ID === 'reader-a' ? Verdict(false, 'None', 'NoGrant', 'no') : PERMITTED);
                await run({ audienceReaders: [readerA] });
                expect(mockSearch).toHaveBeenCalledTimes(1);
                expect(mockSearch.mock.calls[0][0]).toMatchObject({ ScopeIDs: ['s2'], Audience: { Readers: [readerA] } });
            });

            it('skips the scope, logged with no Forbidden row, when a reader\'s permission cannot be resolved', async () => {
                mockResolvePermission.mockImplementation(async (input: ResolvePermissionInput) => {
                    if (input.User.ID === 'reader-a') throw new Error('permission store unavailable');
                    return PERMITTED;
                });
                expect(await run({ audienceReaders: [readerA] })).toBeNull();
                expect(mockLogForbidden).not.toHaveBeenCalled();
                expect(mockLogError).toHaveBeenCalledWith(expect.stringMatching(/"HR" for audience reader reader-a could not be resolved/));
            });

            it('does not judge the readers when the caller is refused (one Forbidden row, for the caller)', async () => {
                denyAll();
                await run({ audienceReaders: [readerA] });
                expect(mockResolvePermission).toHaveBeenCalledTimes(1);
                expect(mockLogForbidden).toHaveBeenCalledTimes(1);
                expect(forbiddenRow().FailureReason).toBe('no grant for this user');
            });
        });

        it('skips retrieval when the lone active skill is not in the AI metadata cache, rather than search with an unjudged principal', async () => {
            expect(await run({ activeSkillIDs: ['skill-missing'] })).toBeNull();
            expect(mockResolvePermission).not.toHaveBeenCalled();
            expect(mockSearch).not.toHaveBeenCalled();
            expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('skill-missing'));
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
