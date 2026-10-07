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
const streamSearchSpy = vi.fn();
const permissionResolveSpy = vi.fn();
const logForbiddenSpy = vi.fn();

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
// NOTE: wieldability — "may this caller actually use this principal?" — is decided by
// SearchScopePermissionResolver, NOT by this action, so it is covered by that resolver's own tests
// (SearchEngine/src/permissions/__tests__). The action's job here is to resolve the skill, refuse a
// malformed one, and hand it to the resolver; mocking the AI engine in this file would only stub a
// package the action does not import.

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            Search: (...args: unknown[]) => searchSpy(...args),
            streamSearch: (...args: unknown[]) => streamSearchSpy(...args),
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

function mkParams(
    paramList: Array<{ Name: string; Value: unknown; Type?: 'Input' | 'Output' }>,
    context?: Record<string, unknown>,
): RunActionParams {
    return {
        Action: { Name: 'Scoped Search' },
        ContextUser: { ID: 'u1' },
        Params: paramList.map(p => mkParam(p.Name, p.Value, p.Type ?? 'Input')),
        Filters: [],
        ...(context ? { Context: context } : {}),
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

    it('streamingMode=partials reports each provider\'s count from resultCount — a progress event carries no rows', async () => {
        loadedAgentStub.SearchScopeAccess = 'All';
        streamSearchSpy.mockImplementation(async function* () {
            yield { phase: 'provider', providerName: 'FullText', results: [], resultCount: 3, durationMs: 11 };
            yield { phase: 'fused', results: [] };
            yield { phase: 'final', results: [], sourceCounts: { Vector: 0, FullText: 3, Entity: 0, Storage: 0 }, elapsedMs: 14 };
        });
        const action = new ScopedSearchAction();
        const result = await run(action, mkParams([
            { Name: 'Query', Value: 'q' },
            { Name: 'AgentID', Value: 'agent-1' },
            { Name: 'StreamingMode', Value: 'partials' }
        ]));
        expect(result.Success).toBe(true);
        const progress = result.Params?.find((p: { Name: string }) => p.Name === 'ProgressEvents')?.Value as Array<Record<string, unknown>>;
        expect(progress[0]).toEqual({ phase: 'provider', providerName: 'FullText', count: 3, durationMs: 11 });
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

        it('passes the tenant into the permission decision, so tenant-scoped grants are not discarded', async () => {
            // isGrantForTenant DISCARDS a tenant-scoped row when the caller supplies no tenant. Omitting
            // it threw away every tenant-scoped grant — including a tenant-scoped None, which is an
            // explicit admin deny, so the deny evaporated and the search was allowed.
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-x', Name: 'X' });
            const action = new ScopedSearchAction();
            await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'ScopeID', Value: 'scope-x' },
                { Name: 'PrimaryScopeRecordID', Value: 'org-77' }
            ]));
            expect(permissionResolveSpy).toHaveBeenCalledWith(
                expect.objectContaining({ PrimaryScopeRecordID: 'org-77' })
            );
        });

        it('does not leak the principal NAME back to the caller — the denial is a name oracle otherwise', async () => {
            // The resolver's Reason names the principal so the AUDIT row can. Echoing it to the caller
            // lets anyone who can guess ids enumerate the skill and agent catalogues by reading denials.
            loadedAgentStub.SearchScopeAccess = 'All';
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-x', Name: 'X' });
            permissionResolveSpy.mockResolvedValueOnce({
                Allowed: false,
                Level: 'None',
                Source: 'SkillAssignedNotListed',
                Reason: "Skill 'Q3 Board Compensation Review' has SearchScopeAccess='Assigned' and this scope is not in its assigned scope list.",
                toSqlPredicate: () => '1=0',
            });
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'ScopeID', Value: 'scope-x' }
            ]));
            expect(result.Success).toBe(false);
            expect(result.Message).not.toContain('Q3 Board Compensation Review');
            // but it must still say enough to act on: the ids the caller sent, and the KIND of refusal
            expect(result.Message).toContain('agent-1');
            expect(result.Message).toContain('SkillAssignedNotListed');
            // and the audit row keeps the full reason, names and all
            expect(logForbiddenSpy).toHaveBeenCalledWith(
                expect.objectContaining({ FailureReason: expect.stringContaining('Q3 Board Compensation Review') })
            );
        });

        it('reports ACCESS_DENIED when the resolver source is PrincipalNotActivatable', async () => {
            // The source is named "Principal": it says the PRINCIPAL may not be wielded, not that the
            // user lacks a grant. Classifying it as PERMISSION_DENIED told calling code the opposite,
            // and nothing caught that because this one-line list had no test of its own.
            loadedAgentStub.SearchScopeAccess = 'All';
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-x', Name: 'X' });
            permissionResolveSpy.mockResolvedValueOnce({
                Allowed: false,
                Level: 'None',
                Source: 'PrincipalNotActivatable',
                Reason: "this user may not run agent 'A' — the fallback does not apply.",
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
            // The gate is still consulted, just with no skill — assert the call happened rather
            // than guarding on it, so a silently-skipped gate fails here instead of passing.
            expect(permissionResolveSpy).toHaveBeenCalled();
            const gateArgs = permissionResolveSpy.mock.calls[0][0] as { Skill?: unknown };
            expect(gateArgs.Skill).toBeNull();
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
            const gateArgs = permissionResolveSpy.mock.calls[permissionResolveSpy.mock.calls.length - 1]?.[0] as { Skill?: { ID: string } | null };
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

        it('refuses any skill it cannot judge, not only the None case', async () => {
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

        it('a caller passing NO skill is unaffected, as before this input existed', async () => {
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

    describe('AISkillID — bound to the RUN when inside one (Context.ActiveSkillIDs)', () => {
        // BaseAgent.ExecuteSingleAction stamps Context.ActiveSkillIDs (the skills the run actually
        // activated) before every action call. Inside a Loop agent the AISkillID parameter is written by
        // the MODEL, so the run is the authority: a named skill the run never activated is refused, and a
        // lone active skill becomes the principal without the model having to name it.
        const SKILL_UUID = '11111111-2222-4333-8444-555555555555';
        const OTHER_UUID = '99999999-8888-4777-8666-555555555555';

        beforeEach(() => {
            loadedSkillStub.ID = SKILL_UUID;
            loadedSkillStub.Load = async () => true;
            loadedSkillStub.SearchScopeAccess = 'All';
            loadedAgentStub.SearchScopeAccess = 'All';
            globalScopeStub = { ID: 'global-id', Name: 'Global', IsGlobal: true };
        });

        it('defaults the principal to the run\'s lone active skill when none is named', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }],
                { ActiveSkillIDs: [SKILL_UUID] },
            ));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].AISkillID).toBe(SKILL_UUID);
            const gateArgs = permissionResolveSpy.mock.calls[permissionResolveSpy.mock.calls.length - 1]?.[0] as { Skill?: { ID: string } | null };
            expect(gateArgs.Skill?.ID).toBe(SKILL_UUID);
        });

        it('REFUSES a named skill the run never activated (the model cannot widen its own reach)', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'AISkillID', Value: OTHER_UUID }],
                { ActiveSkillIDs: [SKILL_UUID] },
            ));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('REFUSES a named skill when the run has NO active skill (empty array is still "inside a run")', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'AISkillID', Value: SKILL_UUID }],
                { ActiveSkillIDs: [] },
            ));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('accepts a named skill that IS active in the run', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'AISkillID', Value: SKILL_UUID.toUpperCase() }],
                { ActiveSkillIDs: [SKILL_UUID] },
            ));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].AISkillID).toBe(SKILL_UUID);
        });

        it('does NOT pick a default when several skills are active and none is named', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }],
                { ActiveSkillIDs: [SKILL_UUID, OTHER_UUID] },
            ));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].AISkillID).toBeUndefined();
        });

        it('outside an agent run (no ActiveSkillIDs on the context) the explicit parameter still rules', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'AISkillID', Value: SKILL_UUID }],
            ));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].AISkillID).toBe(SKILL_UUID);
        });
    });

    describe('AgentID — bound to the RUN when inside one (Context.AgentID)', () => {
        // Inside a Loop agent the AgentID parameter is model-written, like AISkillID. It may restate the
        // run's identity, never replace it: a different agent would be judged by THAT agent's
        // SearchScopeAccess and grants.
        beforeEach(() => {
            loadedAgentStub.SearchScopeAccess = 'All';
            globalScopeStub = { ID: 'global-id', Name: 'Global', IsGlobal: true };
        });

        it('REFUSES an explicit AgentID that differs from the run\'s stamped agent', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-other' }],
                { AgentID: 'agent-1', ActiveSkillIDs: [] },
            ));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('accepts an explicit AgentID that restates the run\'s agent (case-insensitively)', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams(
                [{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'AGENT-1' }],
                { AgentID: 'agent-1', ActiveSkillIDs: [] },
            ));
            expect(result.Success).toBe(true);
        });

        it('outside a run (no Context.AgentID) the explicit AgentID is the only source, as before', async () => {
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }]));
            expect(result.Success).toBe(true);
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

        // Dropping a bad dimension used to run the search WITHOUT it — wider than the caller asked for. Every
        // malformed shape is now refused before any gate or search runs.
        it.each<[string, unknown]>([
            ['an object-valued entry', JSON.stringify({ Region: 'US', NestedJunk: { foo: 'bar' } })],
            ['a null entry', JSON.stringify({ Region: 'US', NullValue: null })],
            ['a mixed array entry', JSON.stringify({ Tags: ['ok', 42, true] })],
            ['JSON that is not an object (an array)', JSON.stringify(['US'])],
            ['JSON that is not an object (a number)', '42'],
            ['an array passed as is', ['US']],
        ])('REFUSES SecondaryScopes with %s instead of dropping it (INVALID_PARAM, no search)', async (_label, value) => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const result = await run(new ScopedSearchAction(), mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'SecondaryScopes', Value: value }
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(searchSpy).not.toHaveBeenCalled();
            expect(permissionResolveSpy).not.toHaveBeenCalled();
        });

        it('REFUSES malformed SecondaryScopes JSON instead of searching without it', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const action = new ScopedSearchAction();
            const result = await run(action, mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'PrimaryScopeRecordID', Value: 'ORG-O1' },
                { Name: 'SecondaryScopes', Value: '{not valid json' }
            ]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(result.Message).toMatch(/not valid JSON/);
            // Tells the model exactly what a well-formed value is (the metadata's parameter description predates the refusal).
            expect(result.Message).toMatch(/SecondaryScopes must be a JSON object mapping each dimension name to a string, number, boolean/);
            expect(result.Message).toMatch(/or array of strings/);
            expect(searchSpy).not.toHaveBeenCalled();
            expect(logForbiddenSpy).not.toHaveBeenCalled(); // malformed input, not an access attempt
        });

        it.each<[string, unknown]>([
            ['an array', ['US']],
            ['an unsupported value', { Region: { nested: true } }],
        ])('tells the model the shape SecondaryScopes must have when it is %s', async (_label, value) => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const result = await run(new ScopedSearchAction(), mkParams([
                { Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'SecondaryScopes', Value: value },
            ]));
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(result.Message).toMatch(/must be a JSON object mapping each dimension name/);
            expect(result.Message).toMatch(/or be omitted/);
        });

        it('accepts SecondaryScopes passed as an object, not only as a JSON string', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const result = await run(new ScopedSearchAction(), mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'SecondaryScopes', Value: { Region: 'US', Tags: ['policy'] } }
            ]));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].SearchContext).toEqual({
                PrimaryScopeRecordID: undefined,
                SecondaryScopes: { Region: 'US', Tags: ['policy'] },
            });
        });

        it('treats a blank SecondaryScopes as absent', async () => {
            loadedAgentStub.SearchScopeAccess = 'All';
            const result = await run(new ScopedSearchAction(), mkParams([
                { Name: 'Query', Value: 'q' },
                { Name: 'AgentID', Value: 'agent-1' },
                { Name: 'SecondaryScopes', Value: '   ' }
            ]));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].SearchContext).toBeUndefined();
        });
    });

    describe('Tenant — bound to the RUN when inside one (RunActionParams.RunScope)', () => {
        // BaseAgent.ExecuteSingleAction stamps RunActionParams.RunScope (the run's validated tenant and secondary
        // scopes) on every dispatch. Inside a Loop agent PrimaryScopeRecordID / SecondaryScopes are written by the
        // MODEL, so the run is the authority, exactly as for AISkillID: a missing tenant defaults to the run's, and one
        // the run does not carry is refused rather than searched.
        const TENANT = 'aaaaaaaa-1111-4222-8333-444444444444';
        const OTHER_TENANT = 'bbbbbbbb-1111-4222-8333-444444444444';
        const inRun = (
            runScope: { PrimaryScopeRecordID: string | null; SecondaryScopes?: Record<string, unknown> | null },
            extra: Array<{ Name: string; Value: unknown }> = [],
        ): RunActionParams => {
            const params = mkParams([{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'ScopeID', Value: 'scope-1' }, ...extra],
                { AgentID: 'agent-1', ActiveSkillIDs: [] });
            (params as unknown as { RunScope: unknown }).RunScope = runScope;
            return params;
        };
        const gateTenant = (): unknown => (permissionResolveSpy.mock.calls[0][0] as { PrimaryScopeRecordID: unknown }).PrimaryScopeRecordID;

        beforeEach(() => {
            loadedAgentStub.SearchScopeAccess = 'All';
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-1', Name: 'HR' });
        });

        it("searches the run's tenant when the model names none, and the permission decision is made for it", async () => {
            const result = await run(new ScopedSearchAction(), inRun({ PrimaryScopeRecordID: TENANT }));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].SearchContext).toEqual({ PrimaryScopeRecordID: TENANT, SecondaryScopes: undefined });
            expect(gateTenant()).toBe(TENANT);
        });

        it("REFUSES a model tenant that is not the run's: INVALID_PARAM, a Forbidden row, no gate and no search", async () => {
            const params = inRun({ PrimaryScopeRecordID: TENANT }, [{ Name: 'PrimaryScopeRecordID', Value: OTHER_TENANT }]);
            const result = await run(new ScopedSearchAction(), params);
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(result.Message).toContain(OTHER_TENANT);
            expect(result.Message).not.toContain(TENANT); // the caller is not told the run's tenant
            expect(result.Message).toMatch(/Inside an agent run the tenant comes from the run — omit PrimaryScopeRecordID and the run's tenant applies/);
            expect(searchSpy).not.toHaveBeenCalled();
            expect(permissionResolveSpy).not.toHaveBeenCalled();
            expect(logForbiddenSpy).toHaveBeenCalledOnce();
            const row = logForbiddenSpy.mock.calls[0][0] as { FailureReason: string; AIAgentID: string; ScopeIDs: string[]; ContextUser: { ID: string } };
            expect(row).toMatchObject({ AIAgentID: 'agent-1', ScopeIDs: ['scope-1'], ContextUser: { ID: 'u1' }, PrimaryScopeRecordID: TENANT });
            expect(row.FailureReason).toContain(OTHER_TENANT);
            expect(row.FailureReason).toContain(TENANT);
        });

        it("accepts a case variant of the run's tenant and searches with the run's own spelling", async () => {
            const params = inRun({ PrimaryScopeRecordID: TENANT }, [{ Name: 'PrimaryScopeRecordID', Value: ` ${TENANT.toUpperCase()} ` }]);
            const result = await run(new ScopedSearchAction(), params);
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].SearchContext.PrimaryScopeRecordID).toBe(TENANT);
            expect(gateTenant()).toBe(TENANT);
        });

        it('REFUSES any model tenant when the run is unscoped (no tenant to restate)', async () => {
            const result = await run(new ScopedSearchAction(), inRun({ PrimaryScopeRecordID: null }, [{ Name: 'PrimaryScopeRecordID', Value: OTHER_TENANT }]));
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(result.Message).toMatch(/this agent run is not scoped to a tenant\./);
            expect(result.Message).toMatch(/Inside an agent run the tenant comes from the run — omit PrimaryScopeRecordID/);
            expect(searchSpy).not.toHaveBeenCalled();
            expect((logForbiddenSpy.mock.calls[0][0] as { FailureReason: string }).FailureReason).toMatch(/no tenant/);
            expect((logForbiddenSpy.mock.calls[0][0] as { PrimaryScopeRecordID: unknown }).PrimaryScopeRecordID).toBeNull();
        });

        it("attributes a permission denial inside the run to the run's tenant", async () => {
            permissionResolveSpy.mockResolvedValue({ Allowed: false, Level: 'None', Source: 'NoGrant', Reason: 'tenant deny', toSqlPredicate: () => '1=0' });
            const result = await run(new ScopedSearchAction(), inRun({ PrimaryScopeRecordID: TENANT }));
            expect(result.ResultCode).toBe('PERMISSION_DENIED');
            expect(gateTenant()).toBe(TENANT);
            expect(logForbiddenSpy.mock.calls[0][0]).toMatchObject({ PrimaryScopeRecordID: TENANT, ScopeIDs: ['scope-1'] });
        });

        it('an unscoped run with no model tenant searches with no tenant, as before', async () => {
            const result = await run(new ScopedSearchAction(), inRun({ PrimaryScopeRecordID: null, SecondaryScopes: null }));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].SearchContext).toBeUndefined();
            expect(gateTenant()).toBeNull();
        });

        it('outside an agent run (no RunScope) the model tenant is honoured, unchanged', async () => {
            const result = await run(new ScopedSearchAction(), mkParams([
                { Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'ScopeID', Value: 'scope-1' },
                { Name: 'PrimaryScopeRecordID', Value: OTHER_TENANT },
            ]));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].SearchContext.PrimaryScopeRecordID).toBe(OTHER_TENANT);
            expect(gateTenant()).toBe(OTHER_TENANT);
        });

        it("applies the run's secondary scopes when the model passes none", async () => {
            await run(new ScopedSearchAction(), inRun({ PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA' } }));
            expect(searchSpy.mock.calls[0][0].SearchContext).toEqual({ PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA' } });
        });

        it('REFUSES a SecondaryScopes key the run sets with a different value (INVALID_PARAM, Forbidden row, no search)', async () => {
            const result = await run(new ScopedSearchAction(), inRun(
                { PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA' } },
                [{ Name: 'SecondaryScopes', Value: JSON.stringify({ Region: 'US' }) }],
            ));
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(result.Message).toContain('Region');
            expect(result.Message).not.toContain('EMEA');
            expect(searchSpy).not.toHaveBeenCalled();
            expect(logForbiddenSpy).toHaveBeenCalledOnce();
        });

        it("allows restating a run key with an equal value (case-insensitive, arrays as sets) and adds keys the run does not set", async () => {
            const result = await run(new ScopedSearchAction(), inRun(
                { PrimaryScopeRecordID: TENANT, SecondaryScopes: { Region: 'EMEA', Tags: ['a', 'b'] } },
                [{ Name: 'SecondaryScopes', Value: { Region: 'emea', Tags: ['B', 'a'], Department: 'Finance' } }],
            ));
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].SearchContext).toEqual({
                PrimaryScopeRecordID: TENANT,
                SecondaryScopes: { Region: 'EMEA', Tags: ['a', 'b'], Department: 'Finance' },
            });
        });

        it('REFUSES malformed SecondaryScopes inside a run too, without a Forbidden row', async () => {
            const result = await run(new ScopedSearchAction(), inRun({ PrimaryScopeRecordID: TENANT }, [{ Name: 'SecondaryScopes', Value: '{oops' }]));
            expect(result.ResultCode).toBe('INVALID_PARAM');
            expect(searchSpy).not.toHaveBeenCalled();
            expect(logForbiddenSpy).not.toHaveBeenCalled();
        });

        it("judges every audience reader under the run's tenant, not a model value", async () => {
            const params = inRun({ PrimaryScopeRecordID: TENANT });
            (params as unknown as { Audience: unknown }).Audience = { Readers: [{ ID: 'reader-a', Name: 'Reader A', UserRoles: [] }] };
            await run(new ScopedSearchAction(), params);
            expect(permissionResolveSpy).toHaveBeenCalledTimes(2);
            for (const call of permissionResolveSpy.mock.calls) {
                expect((call[0] as { PrimaryScopeRecordID: unknown }).PrimaryScopeRecordID).toBe(TENANT);
            }
        });
    });

    describe('Audience (RunActionParams.Audience — a shared conversation)', () => {
        const readerA = { ID: 'reader-a', Name: 'Reader A', UserRoles: [] };
        const readerB = { ID: 'reader-b', Name: 'Reader B', UserRoles: [] };
        const resultWithCounts = {
            Success: true,
            Results: [],
            TotalCount: 0,
            ElapsedMs: 1,
            SourceCounts: { Vector: 3, FullText: 2, Entity: 7, Storage: 1 },
            Providers: [],
        };
        const withAudience = (readers: unknown[], extra: Array<{ Name: string; Value: unknown }> = []): RunActionParams => {
            const params = mkParams([{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }, { Name: 'ScopeID', Value: 'scope-1' }, ...extra]);
            (params as unknown as { Audience: unknown }).Audience = { Readers: readers };
            return params;
        };
        const userOf = (call: number): { ID: string } => (permissionResolveSpy.mock.calls[call][0] as { User: { ID: string } }).User;

        beforeEach(() => {
            loadedAgentStub.SearchScopeAccess = 'All';
            getActiveScopeByIDSpy.mockReturnValue({ ID: 'scope-1', Name: 'HR' });
            searchSpy.mockResolvedValue(resultWithCounts);
        });

        it('declares that it can honour an audience', () => {
            expect(new ScopedSearchAction().SupportsAudience).toBe(true);
        });

        it('passes the audience to the search and withholds SourceCounts from the output', async () => {
            const params = withAudience([readerA]);
            const result = await run(new ScopedSearchAction(), params);
            expect(result.Success).toBe(true);
            expect(searchSpy.mock.calls[0][0].Audience).toBe((params as unknown as { Audience: unknown }).Audience);
            expect(result.Params?.some((p: { Name: string }) => p.Name === 'SourceCounts')).toBe(false);
            expect(result.Params?.find((p: { Name: string }) => p.Name === 'Results')?.Value).toEqual([]);
        });

        it('without an audience: no Audience on the search and SourceCounts are returned, as before', async () => {
            const result = await run(new ScopedSearchAction(), mkParams([{ Name: 'Query', Value: 'q' }, { Name: 'AgentID', Value: 'agent-1' }]));
            expect(searchSpy.mock.calls[0][0].Audience).toBeUndefined();
            expect(result.Params?.find((p: { Name: string }) => p.Name === 'SourceCounts')?.Value).toEqual(resultWithCounts.SourceCounts);
        });

        it('runs the scope gate for every reader, with the caller as ContextUser and the same principals and tenant', async () => {
            await run(new ScopedSearchAction(), withAudience([readerA, readerB], [{ Name: 'PrimaryScopeRecordID', Value: 'ORG-1' }]));
            expect(permissionResolveSpy).toHaveBeenCalledTimes(3);
            expect(userOf(0).ID).toBe('u1');
            expect([userOf(1).ID, userOf(2).ID].sort()).toEqual(['reader-a', 'reader-b']);
            for (const call of permissionResolveSpy.mock.calls.slice(1)) {
                expect(call[0]).toMatchObject({ ContextUser: { ID: 'u1' }, SearchScopeID: 'scope-1', Agent: loadedAgentStub, PrimaryScopeRecordID: 'ORG-1' });
            }
            expect(searchSpy).toHaveBeenCalledOnce();
        });

        it('refuses the search when a reader may not search the scope: PERMISSION_DENIED and a Forbidden row naming the reader', async () => {
            permissionResolveSpy.mockImplementation(async (input: { User: { ID: string } }) => input.User.ID === 'reader-b'
                ? { Allowed: false, Level: 'None', Source: 'NoGrant', Reason: 'no grant', toSqlPredicate: () => '1=0' }
                : { Allowed: true, Level: 'Search', Source: 'RoleGrant', Reason: 'ok', toSqlPredicate: () => '1=1' });
            const result = await run(new ScopedSearchAction(), withAudience([readerA, readerB]));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('PERMISSION_DENIED');
            expect(result.Message).not.toContain('Reader B');
            expect(searchSpy).not.toHaveBeenCalled();
            expect(logForbiddenSpy).toHaveBeenCalledOnce();
            expect(logForbiddenSpy.mock.calls[0][0]).toMatchObject({ ScopeIDs: ['scope-1'], ContextUser: { ID: 'u1' }, AIAgentID: 'agent-1' });
            // Recorded under the caller: the reader's ID and the verdict's fixed Source, never their name or the resolver's reason.
            expect(logForbiddenSpy.mock.calls[0][0].FailureReason).toBe('Audience reader reader-b may not search this scope (NoGrant).');
        });

        it('refuses a reader whose grant is only Read, as it does the caller', async () => {
            permissionResolveSpy.mockImplementation(async (input: { User: { ID: string } }) => input.User.ID === 'reader-a'
                ? { Allowed: true, Level: 'Read', Source: 'RoleGrant', Reason: 'read only', toSqlPredicate: () => '1=1' }
                : { Allowed: true, Level: 'Search', Source: 'RoleGrant', Reason: 'ok', toSqlPredicate: () => '1=1' });
            const result = await run(new ScopedSearchAction(), withAudience([readerA]));
            expect(result.ResultCode).toBe('PERMISSION_DENIED');
            expect(logForbiddenSpy.mock.calls[0][0].FailureReason)
                .toBe('Audience reader reader-a may not search this scope (Read level: visibility, not search).');
        });

        it("streamingMode=partials under an audience: no provider counts (the caller's unfiltered reach), the rest of the trail kept", async () => {
            streamSearchSpy.mockImplementation(async function* () {
                yield { phase: 'provider', providerName: 'FullText', results: [], resultCount: 3, durationMs: 11 };
                yield { phase: 'fused', results: [] };
                yield { phase: 'final', results: [], sourceCounts: { Vector: 0, FullText: 3, Entity: 0, Storage: 0 }, elapsedMs: 14 };
            });
            const result = await run(new ScopedSearchAction(), withAudience([readerA], [{ Name: 'StreamingMode', Value: 'partials' }]));
            expect(result.Success).toBe(true);
            const progress = result.Params?.find((p: { Name: string }) => p.Name === 'ProgressEvents')?.Value as Array<Record<string, unknown>>;
            expect(progress).toEqual([{ phase: 'fused', count: 0 }, { phase: 'final', count: 0, elapsedMs: 14 }]);
            expect(JSON.stringify(result.Params)).not.toContain('"provider"');
            expect(result.Params?.some((p: { Name: string }) => p.Name === 'SourceCounts')).toBe(false);
        });

        it('does not judge the readers when the caller is already refused', async () => {
            permissionResolveSpy.mockResolvedValue({
                Allowed: false, Level: 'None', Source: 'NoGrant', Reason: 'caller no grant', toSqlPredicate: () => '1=0',
            });
            await run(new ScopedSearchAction(), withAudience([readerA]));
            expect(permissionResolveSpy).toHaveBeenCalledOnce();
            expect(logForbiddenSpy).toHaveBeenCalledOnce();
        });
    });

});
