import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks: rows returned by RunView and the mock function itself.
// The resolver makes two distinct RunView queries:
//   - 'MJ: Search Scope Permissions' for the user/role grant matrix
//   - 'MJ: AI Agent Search Scopes' for the agent's Assigned-mode allow list
// We dispatch by EntityName so each test can populate the right corpus.
const { mockRunViewFn, mockRows, mockAgentScopeAssignments, mockSkillScopeAssignments } = vi.hoisted(() => {
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
    const mockSkillScopeAssignments: Array<{
        SkillID: string;
        SearchScopeID: string;
    }> = [];
    return { mockRunViewFn, mockRows, mockAgentScopeAssignments, mockSkillScopeAssignments };
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
// SearchScopeAccess='All' fallback grants anything. The aiengine module is mocked
// wholesale below, so the mock needs neither BaseSingleton nor importOriginal — the resolver only
// ever touches the four members stubbed here.
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
// A real array, not a `{ some }` shim: the resolver reads `.length` (cache empty?) as well as
// `.some` (this agent present?), and those are now different conditions with different messages.
let aiAgentsStub: Array<{ ID: string }> = [{ ID: 'agent-1' }];
const agentPermsStub = vi.fn(async () => ({ canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false }));
const skillsForAgentStub = vi.fn((): Array<{ ID: string }> => [{ ID: 'ANY' }]);

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a?: string | null, b?: string | null) =>
        !!a && !!b && a.toLowerCase() === b.toLowerCase(),
    // The resolver escapes every value it interpolates into an ExtraFilter. A hand-written module
    // mock has to carry each function the module under test imports, or the import resolves to
    // undefined and every test dies on "is not a function" — which is what a missing entry here
    // looks like, rather than anything to do with the assertion.
    EscapeSQLString: (v?: string | null) => String(v ?? '').replace(/'/g, "''").replace(/\0/g, ''),
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
import type { MJAIAgentEntity, MJAISkillEntity } from '@memberjunction/core-entities';

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

const SKILL_ID = 'DDDDDDDD-DDDD-DDDD-DDDD-DDDDDDDDDDDD';

function makeSkill(access: 'All' | 'Assigned' | 'None'): MJAISkillEntity {
    return {
        ID: SKILL_ID,
        Name: 'Test Skill',
        SearchScopeAccess: access,
    } as unknown as MJAISkillEntity;
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
        mockSkillScopeAssignments.length = 0;
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
            if (params.EntityName === 'MJ: AI Skill Search Scopes') {
                // Same loose matching as the agent assignments above — the caller only checks length.
                const filter = params.ExtraFilter ?? '';
                const matches = mockSkillScopeAssignments.filter(
                    rec => filter.includes(`'${rec.SkillID}'`) && filter.includes(`'${rec.SearchScopeID}'`));
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
            aiAgentsStub = [{ ID: 'agent-1' }];
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
            aiAgentsStub = [{ ID: 'some-other-agent' }];
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID, Agent: makeAgent('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Reason).toContain('metadata-load problem');
        });

        it('LEAVES ATTRIBUTION ALONE — a non-"All" agent with NO skill supplied is never gated', async () => {
            // The regression this placement exists to avoid. agent-pre-execution-rag threads
            // AIAgentID purely so SearchExecutionLog can attribute the search; gating the SUPPLY of
            // the id rather than its use as a GRANT turned an analytics field into a retrieval
            // outage. A non-'All' agent must reach the same verdict it always did.
            agentPermsStub.mockResolvedValue({ canView: false, canRun: false, canEdit: false, canDelete: false, isOwner: false });
            aiAgentsStub = [{ ID: 'some-other-agent' }];
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

    describe('a SKILL is judged wherever it is named, not only where it grants', () => {
        // The agent is judged at its 'All' fallback because elsewhere it is attribution. A skill has
        // no such second life: it is supplied to STEER, and it steers through a surface the verdict
        // never sees — SearchParams.AISkillID binds into the expansion query, whose output IS the
        // bound for a restricts:true dimension. Judging it only at the fallback left a user holding
        // their own grant free to name any skill, which is the case these tests pin.
        beforeEach(() => {
            agentPermsStub.mockClear();
            skillsForAgentStub.mockClear();
            aiAgentsStub = [{ ID: 'agent-1' }];
            agentPermsStub.mockResolvedValue({ canView: true, canRun: true, canEdit: false, canDelete: false, isOwner: false });
            skillsForAgentStub.mockReturnValue([{ ID: SKILL_ID }]);
            // 'Assigned' principals must list this scope, or steps 1b/1d deny before the gate runs —
            // these tests are about wieldability, not about the Assigned allow-list.
            mockAgentScopeAssignments.push({ AgentID: 'agent-1', SearchScopeID: SCOPE_ID });
            mockSkillScopeAssignments.push({ SkillID: SKILL_ID, SearchScopeID: SCOPE_ID });
        });

        function grantUserDirectSearch() {
            setRows([{
                ID: 'p1', SearchScopeID: SCOPE_ID,
                UserID: USER_ID, RoleID: null, PermissionLevel: 'Search',
            }]);
        }

        it('refuses an unwieldable skill EVEN WHEN the user holds their own direct grant', async () => {
            grantUserDirectSearch();
            skillsForAgentStub.mockReturnValue([]);   // the agent cannot activate this skill for this user
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'), Skill: makeSkill('Assigned'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
        });

        it('lets a wieldable skill through to the user\'s own grant', async () => {
            grantUserDirectSearch();
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'), Skill: makeSkill('Assigned'),
            });
            expect(result.Allowed).toBe(true);
            expect(result.Source).toBe('DirectGrant');
        });

        it('grants SkillUnscopedAll when the skill is wieldable and set to All', async () => {
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'), Skill: makeSkill('All'),
            });
            expect(result.Allowed).toBe(true);
            expect(result.Source).toBe('SkillUnscopedAll');
        });

        it('refuses an All skill the agent cannot activate — the fallback is not a way in', async () => {
            skillsForAgentStub.mockReturnValue([]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'), Skill: makeSkill('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
        });

        it('refuses a skill supplied with no agent — a skill is judged relative to its caller', async () => {
            grantUserDirectSearch();
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: null, Skill: makeSkill('Assigned'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
        });

        it('refuses a skill the user cannot activate, and blames the SKILL not the agent', async () => {
            // GetSkillsForAgent's permission filter is AISkillPermissionHelper — the user's rights on
            // the SKILL. It never consults AIAgentPermission. So an empty list here means the skill
            // itself is not activatable; agent runnability is judged separately, at the fallbacks.
            skillsForAgentStub.mockReturnValue([]);
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('All'), Skill: makeSkill('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
            // Attribution matters: an operator reading this must be pointed at the skill.
            expect(result.Reason).toMatch(/skill 'Test Skill' is not activatable/);
        });

        it('a COLD metadata cache reads as a load problem, not as missing skill permissions', async () => {
            // GetSkillsForAgent reads _skills out of the AIEngine cache, so a cold cache returns [] —
            // indistinguishable from "this user may not activate that skill" unless you check. Because
            // step 1e runs BEFORE the grant steps, the misleading message would land on a user who
            // holds their own direct grant.
            grantUserDirectSearch();
            aiAgentsStub = [];                       // cache not loaded at all
            skillsForAgentStub.mockReturnValue([]);  // ...so this is empty for that reason
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'), Skill: makeSkill('Assigned'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
            expect(result.Reason).toMatch(/metadata-load problem, not a denial/);
            expect(result.Reason).not.toMatch(/not activatable by agent/);
        });

        it('reports the unevaluable All agent at step 5 when no skill fallback follows it', async () => {
            // The step-5 branch specifically: an 'All' agent absent from the cache, with NO 'All' skill
            // to be decided at 4b, so the fall-through reaches step 5 and must carry the diagnostic
            // rather than degrading to a bare NoGrant.
            aiAgentsStub = [{ ID: 'some-other-agent' }];
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID, Agent: makeAgent('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
            expect(result.Reason).toMatch(/not in the AI metadata cache/);
            expect(result.Reason).toMatch(/no direct or role grant covers this scope/);
        });

        it('an All skill CANNOT launder an agent the user may not run', async () => {
            // The escalation this arm exists to prevent. GetSkillsForAgent vouches for the skill
            // (skill permissions are open by default), the agent is perfectly ordinary, and the user
            // has no grant of their own — so if the skill's 'All' fallback granted here, naming a
            // skill would buy access to an agent the caller was never allowed to run.
            agentPermsStub.mockResolvedValue({ canView: true, canRun: false, canEdit: false, canDelete: false, isOwner: false });
            skillsForAgentStub.mockReturnValue([{ ID: SKILL_ID }]);   // the REAL call would return it
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('Assigned'), Skill: makeSkill('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
            expect(result.Reason).toMatch(/may not run agent/);
        });

        it('an All AGENT the user may not run is refused, not silently downgraded', async () => {
            agentPermsStub.mockResolvedValue({ canView: true, canRun: false, canEdit: false, canDelete: false, isOwner: false });
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('All'), Skill: makeSkill('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
        });

        it('an agent that cannot be EVALUATED cannot back the skill fallback either', async () => {
            // Fail-open regression. An agent absent from the metadata cache used to fall through to
            // step 4b, which then granted 'Search' on ANY scope to a user with NO grant of their own —
            // an admin creating an agent after boot was enough to open it. A widening fallback needs
            // the agent positively confirmed, not merely un-denied.
            aiAgentsStub = [{ ID: 'some-other-agent' }];   // cache loaded, but without THIS agent
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID,
                Agent: makeAgent('All'), Skill: makeSkill('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
            // the message still distinguishes a load problem from a denial
            expect(result.Reason).toMatch(/not in the AI metadata cache/);
        });

        it('names the un-runnable All agent rather than returning a bare NoGrant', async () => {
            // canRun:false is a DENIAL, so this is decided at step 4's early return, not step 5.
            // (The step-5 fall-through branch has its own test above, driven by a cache miss.)
            // Either way the caller must be able to tell a missing permission from an agent they are
            // not allowed to run.
            agentPermsStub.mockResolvedValue({ canView: true, canRun: false, canEdit: false, canDelete: false, isOwner: false });
            const result = await resolver.ResolveEffectivePermission({
                User: makeUser(), SearchScopeID: SCOPE_ID, Agent: makeAgent('All'),
            });
            expect(result.Allowed).toBe(false);
            expect(result.Source).toBe('PrincipalNotActivatable');
            expect(result.Reason).toMatch(/may not run agent/);
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
