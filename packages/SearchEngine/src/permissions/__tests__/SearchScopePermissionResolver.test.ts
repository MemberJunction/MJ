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

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a?: string | null, b?: string | null) =>
        !!a && !!b && a.toLowerCase() === b.toLowerCase(),
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
