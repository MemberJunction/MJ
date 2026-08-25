import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks: rows returned by RunView and the mock function itself.
// The resolver makes two distinct RunView queries:
//   - 'MJ: Search Scope Permissions' for the user/role grant matrix
//   - 'MJ: AI Agent Search Scopes' for the agent's Assigned-mode allow list
// We dispatch by EntityName so each test can populate the right corpus.
const { mockRunViewFn, mockRows, mockAgentScopeAssignments } = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
    const mockRows: Array<{
        ID: string;
        SearchScopeID: string;
        UserID: string | null;
        RoleID: string | null;
        PermissionLevel: 'None' | 'Read' | 'Search' | 'Manage';
    }> = [];
    const mockAgentScopeAssignments: Array<{
        AgentID: string;
        SearchScopeID: string;
    }> = [];
    return { mockRunViewFn, mockRows, mockAgentScopeAssignments };
});

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        RunView: MockRunView,
        // Resolver constructs no Metadata directly, but a few re-exports are
        // wired up for completeness in case future logic imports them.
        Metadata: class { get Entities() { return []; } },
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

// The resolver registers itself with the ClassFactory so consumers can replace it, so the mock has
// to satisfy `RegisterClass` and `MJGlobal` as well as `UUIDsEqual`. Registration is a no-op here —
// these tests exercise the stock resolver's own logic directly, not the resolution seam (that is
// covered by `__tests__/SearchScopePermissionResolver.pluggable.test.ts`).
// The resolver now imports AIEngine to judge whether a principal may be WIELDED before its
// SearchScopeAccess='All' fallback grants anything. AIEngine pulls BaseSingleton from global, so a
// hand-written global mock has to carry it; importOriginal keeps the rest real.
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: {
        Config: async () => undefined,
        get Agents() { return aiAgentsStub; },
        GetUserAgentPermissions: (...a: unknown[]) => agentPermsStub(...(a as [])),
        GetSkillsForAgent: (...a: unknown[]) => skillsForAgentStub(...(a as [])),
    } },
}));
// Permissive by default: every test in this file predates the wieldability gate and assumes the
// principal is one the caller may use. Tests that exercise the gate narrow these.
let aiAgentsStub: { some: (predicate: unknown) => boolean } = { some: () => true };
const agentPermsStub = vi.fn(async () => ({ canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false }));
const skillsForAgentStub = vi.fn((): Array<{ ID: string }> => [{ ID: 'ANY' }]);

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a?: string | null, b?: string | null) =>
        !!a && !!b && a.toLowerCase() === b.toLowerCase(),
    RegisterClass: () => () => { /* no-op: registration is not under test here */ },
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: () => null,
                Register: () => { /* no-op */ },
            },
        },
    },
}));

import {
    SearchScopePermissionResolver,
    EffectivePermission,
} from '../SearchScopePermissionResolver';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';

const SCOPE_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA';
const ROLE_ID_DEV = 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB';
const ROLE_ID_ADMIN = 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC';

function makeUser(roleIds: string[] = []): UserInfo {
    const ur = roleIds.map(rid => ({ RoleID: rid })) as { RoleID: string }[];
    return {
        ID: USER_ID,
        Name: 'Test User',
        Email: 'test@example.com',
        // The resolver only reads UserRoles[].RoleID; satisfy that surface.
        UserRoles: ur,
    } as unknown as UserInfo;
}

function makeAgent(access: 'All' | 'Assigned' | 'None'): MJAIAgentEntity {
    return {
        ID: 'agent-1',
        Name: 'Test Agent',
        SearchScopeAccess: access,
    } as unknown as MJAIAgentEntity;
}

function setRows(rows: typeof mockRows) {
    mockRows.length = 0;
    mockRows.push(...rows);
}

describe('SearchScopePermissionResolver', () => {
    let resolver: SearchScopePermissionResolver;

    beforeEach(() => {
        resolver = new SearchScopePermissionResolver();
        mockRows.length = 0;
        mockAgentScopeAssignments.length = 0;
        mockRunViewFn.mockReset();
        mockRunViewFn.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agent Search Scopes') {
                // Return the subset of mockAgentScopeAssignments matching the
                // ExtraFilter's AgentID and SearchScopeID. This is loose
                // matching — sufficient for unit tests since the caller only
                // checks length > 0.
                const filter = params.ExtraFilter ?? '';
                const match = (rec: { AgentID: string; SearchScopeID: string }) =>
                    filter.includes(`'${rec.AgentID}'`) && filter.includes(`'${rec.SearchScopeID}'`);
                const matches = mockAgentScopeAssignments.filter(match);
                return { Success: true, Results: matches };
            }
            // Default: SearchScopePermission rows
            return { Success: true, Results: mockRows };
        });
    });

    describe('PM-01: no grants and no agent → reject', () => {
        it('rejects with NoGrant', async () => {
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('NoGrant');
            expect(result.Level).toBe('None');
            expect(result.toSqlPredicate()).toBe('1=0');
        });
    });

    describe('PM-02: direct user Read grant', () => {
        it('allows at Read', async () => {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID, RoleID: null, PermissionLevel: 'Read',
            }]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(true);
            expect(result.Level).toBe('Read');
            expect(result.Source).toBe('DirectGrant');
        });
    });

    describe('PM-03: role grant only', () => {
        it('allows at the role-granted level', async () => {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: null, RoleID: ROLE_ID_DEV, PermissionLevel: 'Search',
            }]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser([ROLE_ID_DEV]),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(true);
            expect(result.Level).toBe('Search');
            expect(result.Source).toBe('RoleGrant');
        });
    });

    describe('PM-04: direct + role both grant — highest wins', () => {
        it('returns Search when user has Read and role has Search', async () => {
            setRows([
                { ID: 'p1', SearchScopeID: SCOPE_ID, UserID: USER_ID, RoleID: null, PermissionLevel: 'Read' },
                { ID: 'p2', SearchScopeID: SCOPE_ID, UserID: null, RoleID: ROLE_ID_DEV, PermissionLevel: 'Search' },
            ]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser([ROLE_ID_DEV]),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            // Direct grant wins as the source even when role would be higher;
            // by design, an explicit user-scoped grant supersedes role-based
            // inheritance to keep audit trails clean. Direct=Read overrides.
            expect(result.Allowed).toBe(true);
            expect(result.Level).toBe('Read');
            expect(result.Source).toBe('DirectGrant');
        });

        it('returns Manage when user has Manage and role has Search', async () => {
            setRows([
                { ID: 'p1', SearchScopeID: SCOPE_ID, UserID: USER_ID, RoleID: null, PermissionLevel: 'Manage' },
                { ID: 'p2', SearchScopeID: SCOPE_ID, UserID: null, RoleID: ROLE_ID_DEV, PermissionLevel: 'Search' },
            ]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser([ROLE_ID_DEV]),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Level).toBe('Manage');
            expect(result.Source).toBe('DirectGrant');
        });
    });

    describe('PM-05: no user/role grant, agent has SearchScopeAccess=All', () => {
        it('allows at Search via AgentUnscopedAll', async () => {
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: makeAgent('All'),
            });
            expect(result.Allowed).toBe(true);
            expect(result.Level).toBe('Search');
            expect(result.Source).toBe('AgentUnscopedAll');
        });
    });

    describe("a principal may only WIDEN if the caller may wield it", () => {
        // The 'All' fallbacks are the only place a principal changes an outcome: by the time they
        // are reached the user has no grant of their own, and 'All' is about to supply one. Both
        // permission models are open by default, so without this an id a caller merely NAMED could
        // grant Search on any scope.
        beforeEach(() => {
            // mockClear as well as re-stubbing: the attribution test asserts the gate was never
            // CALLED, and call history survives a value reset.
            agentPermsStub.mockClear();
            skillsForAgentStub.mockClear();
            aiAgentsStub = { some: () => true };
            agentPermsStub.mockResolvedValue({ canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false });
        });

        it('does NOT grant when the user may not run the agent', async () => {
            agentPermsStub.mockResolvedValue({ canView: true, canRun: false, canEdit: false, canDelete: false, isOwner: false });
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID, Agent: makeAgent('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
            expect(result.Reason).toContain('may not run agent');
        });

        it('calls a stale metadata cache what it is, not a denial', async () => {
            // GetUserAgentPermissions throws when the agent is absent from the cache and fails
            // closed to all-false, so without this an agent created after the cache loaded reads as
            // "not permitted" — a metadata-load problem wearing an authorization message.
            aiAgentsStub = { some: () => false };
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID, Agent: makeAgent('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('metadata-load problem');
        });

        it('LEAVES ATTRIBUTION ALONE — an agent that is not "All" is never gated', async () => {
            // The regression this placement exists to avoid. agent-pre-execution-rag threads
            // AIAgentID purely so SearchExecutionLog can attribute the search; gating the SUPPLY of
            // the id rather than its use as a GRANT turned an analytics field into a retrieval
            // outage. A non-'All' agent must reach the same verdict it always did.
            agentPermsStub.mockResolvedValue({ canView: false, canRun: false, canEdit: false, canDelete: false, isOwner: false });
            aiAgentsStub = { some: () => false };
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID, Agent: makeAgent('Assigned'),
            });
            // Whatever the outcome, it is decided by the scope rules — NOT by wieldability.
            expect(result.Source).not.toBe('PrincipalNotActivatable');
            expect(agentPermsStub).not.toHaveBeenCalled();
        });
    });

    describe('PM-06: agent SearchScopeAccess=None overrides everything', () => {
        it('rejects even when user has a direct Manage grant', async () => {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID, RoleID: null, PermissionLevel: 'Manage',
            }]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: makeAgent('None'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('AgentNone');
            expect(result.toSqlPredicate()).toBe('1=0');
        });
    });

    describe('PM-07: explicit user-direct None denies even with role grant', () => {
        it('rejects with DirectGrant + None', async () => {
            setRows([
                { ID: 'p1', SearchScopeID: SCOPE_ID, UserID: USER_ID, RoleID: null, PermissionLevel: 'None' },
                { ID: 'p2', SearchScopeID: SCOPE_ID, UserID: null, RoleID: ROLE_ID_DEV, PermissionLevel: 'Search' },
            ]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser([ROLE_ID_DEV]),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('DirectGrant');
            expect(result.Level).toBe('None');
        });
    });

    describe('PM-08: user has Manage grant', () => {
        it('allows at Manage', async () => {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID, RoleID: null, PermissionLevel: 'Manage',
            }]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(true);
            expect(result.Level).toBe('Manage');
        });
    });

    describe('PM-09: multiple role grants — highest wins', () => {
        it('returns Manage when one role has Manage and another has Read', async () => {
            setRows([
                { ID: 'p1', SearchScopeID: SCOPE_ID, UserID: null, RoleID: ROLE_ID_DEV, PermissionLevel: 'Read' },
                { ID: 'p2', SearchScopeID: SCOPE_ID, UserID: null, RoleID: ROLE_ID_ADMIN, PermissionLevel: 'Manage' },
            ]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser([ROLE_ID_DEV, ROLE_ID_ADMIN]),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(true);
            expect(result.Level).toBe('Manage');
            expect(result.Source).toBe('RoleGrant');
        });
    });

    describe('PM-10: role-level None entries are ignored at the role tier', () => {
        it('falls through to NoGrant when a role has only a None entry', async () => {
            setRows([
                { ID: 'p1', SearchScopeID: SCOPE_ID, UserID: null, RoleID: ROLE_ID_DEV, PermissionLevel: 'None' },
            ]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser([ROLE_ID_DEV]),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('NoGrant');
        });
    });

    describe('PM-11: agent SearchScopeAccess=Assigned + scope NOT listed', () => {
        it('rejects with AgentAssignedNotListed even when user has direct Manage', async () => {
            // User has Manage but agent is Assigned and the scope isn't in
            // the agent's allow list. The Assigned restriction fires first.
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID, RoleID: null, PermissionLevel: 'Manage',
            }]);
            // Note: mockAgentScopeAssignments is empty — agent has no
            // assignments.
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('AgentAssignedNotListed');
            expect(result.Level).toBe('None');
            expect(result.Reason).toContain('ACCESS_DENIED');
        });
    });

    describe('PM-12: agent SearchScopeAccess=Assigned + scope listed + user grant', () => {
        it('falls through to user grant and allows', async () => {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID, RoleID: null, PermissionLevel: 'Manage',
            }]);
            mockAgentScopeAssignments.push({ AgentID: 'agent-1', SearchScopeID: SCOPE_ID });
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'),
            });
            // Assigned mode restricts (only listed scopes are reachable) but
            // does not grant — the user-direct grant produces the verdict.
            expect(result.Allowed).toBe(true);
            expect(result.Source).toBe('DirectGrant');
            expect(result.Level).toBe('Manage');
        });
    });

    describe('PM-13: agent SearchScopeAccess=Assigned + scope listed + no user grant', () => {
        it('falls through to NoGrant (Assigned restricts, does not grant)', async () => {
            mockAgentScopeAssignments.push({ AgentID: 'agent-1', SearchScopeID: SCOPE_ID });
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('NoGrant');
        });
    });

    describe('UUID comparison is case-insensitive', () => {
        it('matches a lowercase user UUID against an uppercase row UUID', async () => {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID.toLowerCase(), RoleID: null, PermissionLevel: 'Read',
            }]);
            const result = await resolver.ResolveEffectivePermission({
                User: { ...makeUser(), ID: USER_ID } as UserInfo,
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.Allowed).toBe(true);
            expect(result.Source).toBe('DirectGrant');
        });
    });

    describe('toSqlPredicate', () => {
        it("returns '1=1' when allowed", async () => {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID, RoleID: null, PermissionLevel: 'Read',
            }]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.toSqlPredicate()).toBe('1=1');
        });

        it("returns '1=0' when rejected", async () => {
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            });
            expect(result.toSqlPredicate()).toBe('1=0');
        });
    });

    describe('fail-closed behavior on RunView failure', () => {
        it('throws when the permissions query fails', async () => {
            mockRunViewFn.mockResolvedValueOnce({
                Success: false,
                ErrorMessage: 'Connection timeout',
            });
            await expect(resolver.ResolveEffectivePermission({
                User: makeUser(),
                SearchScopeID: SCOPE_ID,
                Agent: null,
            })).rejects.toThrow(/Connection timeout/);
        });
    });
});

describe('EffectivePermission shape', () => {
    it('matches the documented contract', () => {
        const sample: EffectivePermission = {
            Allowed: true,
            Level: 'Search',
            Source: 'DirectGrant',
            Reason: 'test',
            toSqlPredicate: () => '1=1',
        };
        expect(sample.toSqlPredicate()).toBe('1=1');
    });
});
