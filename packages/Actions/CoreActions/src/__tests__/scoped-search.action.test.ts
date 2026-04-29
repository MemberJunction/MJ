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

// Mock the SearchEngine singleton + the SearchScopePermissionResolver class.
// The resolver mock returns Allowed=true by default so existing tests that
// did not care about Phase 2A enforcement keep passing; tests that exercise
// the denial path override the spy.
vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            Search: (...args: unknown[]) => searchSpy(...args),
            LogForbiddenSearch: (...args: unknown[]) => logForbiddenSpy(...args),
        }
    },
    SearchScopePermissionResolver: class {
        ResolveEffectivePermission = (...args: unknown[]) => permissionResolveSpy(...args);
    }
}));

// Mock SearchEngineBase cache
const getAgentScopesSpy = vi.fn();
const getActiveScopeByIDSpy = vi.fn();
const globalScopeStub = { ID: 'global-id', Name: 'Global', IsGlobal: true } as unknown;

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

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class {
        GetEntityObject = async () => loadedAgentStub;
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
});
