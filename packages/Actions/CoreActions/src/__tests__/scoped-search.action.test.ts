import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

// Mock the class registry so @RegisterClass doesn't actually register during tests
vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
    };
});

const searchSpy = vi.fn();
const permissionResolveSpy = vi.fn();
const logForbiddenSpy = vi.fn();
// Returns the agent/user-activatable skill list. Defaults to "contains the stub skill" so the tests
// written before the gate existed keep exercising what they were written for; the two that care
// about the gate return an empty list instead.
const skillMayRunSpy = vi.fn(() => [{ ID: 'skill-1' }]);
// The agent is a caller-supplied principal too. Defaults to allowed so every pre-existing test keeps
// exercising what it was written for.
const agentMayRunSpy = vi.fn(async () => true);
let agentsInCacheStub: Array<{ ID: string }> = [{ ID: 'agent-1' }];

// Mock the SearchEngine singleton + the SearchScope permission resolver.
// The resolver mock returns Allowed=true by default so existing tests that
// did not care about Phase 2A enforcement keep passing; tests that exercise
// the denial path override the spy.
//
// The action obtains its resolver through the pluggable seam —
// `GetSearchScopePermissionResolver()` — rather than by constructing the class, so the
// mock MUST provide that accessor. Omitting it does not fail loudly: the import is
// simply `undefined`, calling it throws a TypeError, and the action's catch-all turns
// that into `UNEXPECTED_ERROR`. Every test that got as far as the resolver failed with
// a result code unrelated to the thing under test, while the tests that bail out earlier
// (missing Query, unresolvable AgentID, SearchScopeAccess=None) kept passing — which is
// what made the cause look like a permissions regression instead of a missing double.
//
// Both shapes are exported here on purpose: the accessor is what the action uses, and the
// class is still exported by the real module (deprecated) so anything importing it keeps
// resolving. Both are backed by the SAME spy, so existing assertions on
// `permissionResolveSpy` are unaffected.
// The skill activation gate. Loading a skill is not permission to wield it as a principal, so the
// action intersects it against GetSkillsForAgent(agent, user) — the same call BaseAgent uses to
// decide whether a requested skill may activate at all.
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: async () => undefined,
            GetSkillsForAgent: (...args: unknown[]) => skillMayRunSpy(...(args as [])),
            // Cache membership is checked separately from permission so a stale cache reports as a
            // metadata-load problem rather than an access denial.
            get Agents() { return agentsInCacheStub; },
        },
    },
    AIAgentPermissionHelper: {
        HasPermission: (...args: unknown[]) => agentMayRunSpy(...(args as [])),
    },
}));

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            Search: (...args: unknown[]) => searchSpy(...args),
            LogForbiddenSearch: (...args: unknown[]) => logForbiddenSpy(...args),
        }
    },
    GetSearchScopePermissionResolver: () => ({
        ResolveEffectivePermission: (...args: unknown[]) => permissionResolveSpy(...args),
    }),
    SearchScopePermissionResolver: class {
        ResolveEffectivePermission = (...args: unknown[]) => permissionResolveSpy(...args);
    }
}));

// Mock SearchEngineBase cache
const getAgentScopesSpy = vi.fn();
const getActiveScopeByIDSpy = vi.fn();
// `let`, not `const`: an installation with no IsGlobal scope row is a real configuration, and it is
// the one where resolveScopeAll yields an undefined scopeID.
let globalScopeStub: unknown = { ID: 'global-id', Name: 'Global', IsGlobal: true };

vi.mock('@memberjunction/core-entities', () => ({
    SearchEngineBase: {
        Instance: {
            Config: vi.fn(async () => {}),
            GetAgentScopes: (...a: unknown[]) => getAgentScopesSpy(...a),
            GetActiveScopeByID: (id: string) => getActiveScopeByIDSpy(id),
            get GlobalScope() { return globalScopeStub; },
        }
    }
}));

// Mock Metadata.GetEntityObject for agent loading
const loadedAgentStub: { ID: string; Name: string; SearchScopeAccess: string; Load: (id: string) => Promise<boolean> } = {
    ID: 'agent-1',
    Name: 'Test Agent',
    SearchScopeAccess: 'All',
    Load: async () => true,
};

// The skill principal loads through the same Metadata path as the agent, so the mock has to
// dispatch on entity name — returning the agent stub for 'MJ: AI Skills' would make a skill test
// pass for the wrong reason.
const loadedSkillStub: { ID: string; Name: string; SearchScopeAccess: string; Load: (id: string) => Promise<boolean> } = {
    ID: 'skill-1',
    Name: 'Test Skill',
    SearchScopeAccess: 'All',
    Load: async () => true,
};

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: () => false,
    Metadata: class {
        GetEntityObject = async (entityName: string) =>
            entityName === 'MJ: AI Skills' ? loadedSkillStub : loadedAgentStub;
    },
    UserInfo: class {},
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_p: unknown): Promise<unknown> { return null; }
    }
}));

import { ScopedSearchAction } from '../custom/search/scoped-search.action';

function mkParam(name: string, value: unknown, type: 'Input' | 'Output' = 'Input') {
    return { Name: name, Value: value, Type: type };
}

function mkParams(paramList: Array<{ Name: string; Value: unknown; Type?: 'Input' | 'Output' }>): RunActionParams {
    return {
        Action: { Name: 'Scoped Search' },
        ContextUser: { ID: 'u1' },
        Params: paramList.map(p => mkParam(p.Name, p.Value, p.Type ?? 'Input')),
        Filters: [],
    } as unknown as RunActionParams;
}

async function run(action: ScopedSearchAction, params: RunActionParams): Promise<ActionResultSimple> {
    return await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(params);
}

describe('ScopedSearchAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        searchSpy.mockReset();
        getAgentScopesSpy.mockReset();
        getActiveScopeByIDSpy.mockReset();
        permissionResolveSpy.mockReset();
        loadedAgentStub.SearchScopeAccess = 'All';
        // Default: successful empty-result search
        searchSpy.mockResolvedValue({
            Success: true,
            Results: [],
            TotalCount: 0,
            ElapsedMs: 1,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            Providers: []
        });
        // Default: permission resolver allows. Tests that need a denial
        // override this in the test body.
        permissionResolveSpy.mockResolvedValue({
            Allowed: true,
            Level: 'Search',
            Source: 'DirectGrant',
            Reason: 'mock allow',
            toSqlPredicate: () => '1=1',
        });
    });

    it('rejects when Query is missing', async () => {
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'AgentID', Value: 'agent-1' }
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_QUERY');
    });

    it('rejects when AgentID cannot be resolved', async () => {
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'refund policy' }
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_AGENT_CONTEXT');
    });

    it('rejects agents with SearchScopeAccess=None', async () => {
        loadedAgentStub.SearchScopeAccess = 'None';
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'q' },
            { Name: 'AgentID', Value: 'agent-1' }
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('ACCESS_DENIED');
        expect(searchSpy).not.toHaveBeenCalled();
    });

    it('allows SearchScopeAccess=All with no scopeID (uses Global)', async () => {
        loadedAgentStub.SearchScopeAccess = 'All';
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'q' },
            { Name: 'AgentID', Value: 'agent-1' }
        ]));
        expect(result.Success).toBe(true);
        expect(searchSpy).toHaveBeenCalledOnce();
        const callArgs = searchSpy.mock.calls[0][0];
        expect(callArgs.ScopeIDs).toEqual(['global-id']);
        const scopeResolved = result.Params?.find((p: { Name: string }) => p.Name === 'ScopeID_Resolved');
        expect(scopeResolved?.Value).toBe('global-id');
    });

    it('enforces Assigned scope rows — rejects when requested scope not in allowlist', async () => {
        loadedAgentStub.SearchScopeAccess = 'Assigned';
        getAgentScopesSpy.mockReturnValue([
            { SearchScopeID: 'scope-allowed', IsDefault: true, Priority: 0 }
        ]);
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'q' },
            { Name: 'AgentID', Value: 'agent-1' },
            { Name: 'ScopeID', Value: 'scope-blocked' }
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('ACCESS_DENIED');
        expect(searchSpy).not.toHaveBeenCalled();
    });

    it('enforces Assigned scope rows — uses IsDefault when no scopeID supplied', async () => {
        loadedAgentStub.SearchScopeAccess = 'Assigned';
        getAgentScopesSpy.mockReturnValue([
            { SearchScopeID: 'scope-a', IsDefault: false, Priority: 5 },
            { SearchScopeID: 'scope-default', IsDefault: true, Priority: 10 }
        ]);
        getActiveScopeByIDSpy.mockImplementation((id: string) => ({ ID: id, Name: id }));
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'q' },
            { Name: 'AgentID', Value: 'agent-1' }
        ]));
        expect(result.Success).toBe(true);
        const callArgs = searchSpy.mock.calls[0][0];
        expect(callArgs.ScopeIDs).toEqual(['scope-default']);
    });

    it('enforces Assigned scope rows — rejects when agent has zero rows', async () => {
        loadedAgentStub.SearchScopeAccess = 'Assigned';
        getAgentScopesSpy.mockReturnValue([]);
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'q' },
            { Name: 'AgentID', Value: 'agent-1' }
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('NO_DEFAULT_SCOPE');
    });

    it('Assigned path: accepts explicit scopeID when it is in the allowlist', async () => {
        loadedAgentStub.SearchScopeAccess = 'Assigned';
        getAgentScopesSpy.mockReturnValue([
            { SearchScopeID: 'scope-allowed', IsDefault: false, Priority: 0 }
        ]);
        getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-allowed', Name: 'HR' });
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'q' },
            { Name: 'AgentID', Value: 'agent-1' },
            { Name: 'ScopeID', Value: 'scope-allowed' }
        ]));
        expect(result.Success).toBe(true);
        const callArgs = searchSpy.mock.calls[0][0];
        expect(callArgs.ScopeIDs).toEqual(['scope-allowed']);
    });

    describe('Phase 2A — SearchScopePermissionResolver enforcement', () => {
        it('rejects when the permission resolver denies the user even if the agent allows the scope', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-locked', Name: 'Locked' });
            permissionResolveSpy.mockResolvedValueOnce({
                Allowed: false,
                Level: 'None',
                Source: 'NoGrant',
                Reason: 'User has no direct grant, no qualifying role grant, and no agent-side fallback for this scope.',
                toSqlPredicate: () => '1=0',
            });
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'ScopeID', Value: 'scope-locked' }
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('PERMISSION_DENIED');
            expect(result.Message).toContain('Forbidden:');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('reports ACCESS_DENIED when the resolver source is AgentNone', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-x', Name: 'X' });
            permissionResolveSpy.mockResolvedValueOnce({
                Allowed: false,
                Level: 'None',
                Source: 'AgentNone',
                Reason: "Agent has SearchScopeAccess='None'; refused.",
                toSqlPredicate: () => '1=0',
            });
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'ScopeID', Value: 'scope-x' }
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('ACCESS_DENIED');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('passes through to search when the resolver allows', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-ok', Name: 'OK' });
            // Default permissionResolveSpy already returns Allowed=true.
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'ScopeID', Value: 'scope-ok' }
            ]));
            expect(result.Success).toBe(true);
            expect(searchSpy).toHaveBeenCalledOnce();
            // Resolver was called with the right inputs.
            expect(permissionResolveSpy).toHaveBeenCalledWith(expect.objectContaining({
                SearchScopeID: 'scope-ok',
                User: expect.objectContaining({ ID: 'u1' }),
                Agent: expect.objectContaining({ ID: 'agent-1' }),
            }));
        });
    });

    describe('AISkillID — the skill principal', () => {
        const SKILL_UUID = '11111111-2222-4333-8444-555555555555';

        beforeEach(() => {
            loadedSkillStub.ID = 'skill-1';
            loadedSkillStub.Load = async () => true;
            skillMayRunSpy.mockReturnValue([{ ID: 'skill-1' }]);
            agentMayRunSpy.mockResolvedValue(true);
            loadedSkillStub.SearchScopeAccess = 'All';
            globalScopeStub = { ID: 'global-id', Name: 'Global', IsGlobal: true };
        });

        it('leaves the principal unset and passes Skill: null when the input is omitted', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' }
            ]));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].AISkillID).toBeUndefined();
            // The gate is still consulted, just with no skill.
            const gateArgs = permissionResolveSpy.mock.calls[0]?.[0] as { Skill?: unknown } | undefined;
            if (gateArgs) expect(gateArgs.Skill).toBeNull();
        });

        it('threads the LOADED skill id onto SearchParams, not the caller\'s string', async () => {
            // The expansion query binds this, and SearchEngine's cacheKey includes it. Threading the
            // caller's spelling would log two casings of one id across a single search's Forbidden
            // rows and split the result cache between them, so the loaded entity's id is used.
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'AISkillID', Value: SKILL_UUID.toUpperCase() }
            ]));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].AISkillID).toBe(loadedSkillStub.ID);
            expect(searchSpy.mock.calls[0][0].AISkillID).not.toBe(SKILL_UUID.toUpperCase());
        });

        it('hands the loaded skill to the permission gate, so its own SearchScopeAccess applies', async () => {
            // The whole point. Widening the bound without this is a principal that is never judged.
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'AISkillID', Value: SKILL_UUID }
            ]));
            expect(result.Success).toBe(true);
            const gateArgs = permissionResolveSpy.mock.calls.at(-1)?.[0] as { Skill?: { ID: string } | null };
            expect(gateArgs.Skill).not.toBeNull();
            expect(gateArgs.Skill?.ID).toBe('skill-1');
        });

        it('refuses a non-UUID rather than dropping it', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'AISkillID', Value: 'not-a-uuid' }
            ]));
            expect(result.Success).toBe(false);
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it("refuses a skill whose SearchScopeAccess is 'None', the documented veto", async () => {
            loadedSkillStub.SearchScopeAccess = 'None';
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'AISkillID', Value: SKILL_UUID }
            ]));
            expect(result.ResultCode).toBe('ACCESS_DENIED');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it("  and still refuses it when no scope resolves, where the gate never runs", async () => {
            // resolveScopeAll returns GlobalScope?.ID. With no IsGlobal row that is undefined, and
            // enforceUserPermission used to return null on it — so the veto was skipped while
            // AISkillID was threaded into SearchParams anyway.
            loadedSkillStub.SearchScopeAccess = 'None';
            loadedAgentStub.SearchScopeAccess = 'All';
            globalScopeStub = undefined;
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'AISkillID', Value: SKILL_UUID }
            ]));
            expect(result.ResultCode).toBe('ACCESS_DENIED');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('  and refuses any skill it cannot judge, not only the None case', async () => {
            loadedSkillStub.SearchScopeAccess = 'Assigned';
            loadedAgentStub.SearchScopeAccess = 'All';
            globalScopeStub = undefined;
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'AISkillID', Value: SKILL_UUID }
            ]));
            expect(result.ResultCode).toBe('ACCESS_DENIED');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('  but a caller passing NO skill is unaffected, as before this input existed', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            globalScopeStub = undefined;
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' }
            ]));
            expect(result.Success).toBe(true);
            expect(searchSpy).toHaveBeenCalled();
        });

        it('refuses a skill that will not load, instead of searching with it unjudged', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            loadedSkillStub.Load = async () => false;
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'AISkillID', Value: SKILL_UUID }
            ]));
            expect(result.Success).toBe(false);
            expect(searchSpy).not.toHaveBeenCalled();
        });
    });

    describe('SearchContext threading (per-call multi-tenant inputs)', () => {
        it('omits SearchContext entirely when neither input is provided', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' }
            ]));
            expect(result.Success).toBe(true);
            const callArgs = searchSpy.mock.calls[0][0];
            expect(callArgs.SearchContext).toBeUndefined();
        });

        it('threads PrimaryScopeRecordID through to SearchParams.SearchContext', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'PrimaryScopeRecordID', Value: 'ORG-O1' }
            ]));
            expect(result.Success).toBe(true);
            const callArgs = searchSpy.mock.calls[0][0];
            expect(callArgs.SearchContext).toEqual({
                PrimaryScopeRecordID: 'ORG-O1',
                SecondaryScopes: undefined,
            });
        });

        it('parses SecondaryScopes JSON and supports string/number/boolean/string[] values', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const payload = JSON.stringify({
                Department: 'Finance',
                HeadcountFloor: 50,
                IsActive: true,
                Tags: ['audit', 'q4-priorities']
            });
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'PrimaryScopeRecordID', Value: 'ORG-O1' },
                { Name: 'SecondaryScopes', Value: payload }
            ]));
            expect(result.Success).toBe(true);
            const callArgs = searchSpy.mock.calls[0][0];
            expect(callArgs.SearchContext).toEqual({
                PrimaryScopeRecordID: 'ORG-O1',
                SecondaryScopes: {
                    Department: 'Finance',
                    HeadcountFloor: 50,
                    IsActive: true,
                    Tags: ['audit', 'q4-priorities']
                }
            });
        });

        it('drops SecondaryScopes entries with unsupported value types but keeps valid ones', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            // Object-valued, null, and mixed-array entries are unsupported and should be dropped.
            const payload = JSON.stringify({
                Region: 'US',                             // string — kept
                NestedJunk: { foo: 'bar' },                // object — dropped
                NullValue: null,                            // null   — dropped
                MixedArray: ['ok', 42, true],               // mixed  — dropped
                Tags: ['policy', 'audit']                  // string[] — kept
            });
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'SecondaryScopes', Value: payload }
            ]));
            expect(result.Success).toBe(true);
            const callArgs = searchSpy.mock.calls[0][0];
            expect(callArgs.SearchContext).toEqual({
                PrimaryScopeRecordID: undefined,
                SecondaryScopes: {
                    Region: 'US',
                    Tags: ['policy', 'audit']
                }
            });
        });

        it('treats malformed SecondaryScopes JSON as absent and still runs the search', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'PrimaryScopeRecordID', Value: 'ORG-O1' },
                { Name: 'SecondaryScopes', Value: '{not valid json' }
            ]));
            expect(result.Success).toBe(true);
            const callArgs = searchSpy.mock.calls[0][0];
            // Primary is still set; SecondaryScopes is dropped due to parse failure.
            expect(callArgs.SearchContext).toEqual({
                PrimaryScopeRecordID: 'ORG-O1',
                SecondaryScopes: undefined,
            });
        });
    });

    describe('AIAgentID — the agent principal is judged too', () => {
        // clearAllMocks() clears call history, NOT implementations, so a mockResolvedValue(false)
        // from a previous test would leak into the pass-through case.
        beforeEach(() => {
            agentMayRunSpy.mockResolvedValue(true);
            skillMayRunSpy.mockReturnValue([{ ID: 'skill-1' }]);
        });

        it('lets a runnable agent through, which is every existing caller', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' }
            ]));
            expect(result.Success).toBe(true);
        });
    });
});
