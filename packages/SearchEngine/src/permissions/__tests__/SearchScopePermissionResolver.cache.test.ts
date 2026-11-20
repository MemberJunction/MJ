import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';

const { mockRunViewFn, eventCallbacks } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    eventCallbacks: [] as Array<(event: { event: string; eventCode: string; args: unknown }) => void>,
}));

vi.mock('@memberjunction/core', () => ({
    BaseEntity: { BaseEventCode: 'BaseEntityEvent' },
    Metadata: class {},
    RunView: class {
        RunView = mockRunViewFn;
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            Agents: [{ ID: 'agent-1' }],
            GetUserAgentPermissions: vi.fn(async () => ({ canRun: true })),
            GetSkillsForAgent: vi.fn(() => []),
        },
    },
}));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => <T>(target: T) => target,
        MJGlobal: {
            Instance: {
                ClassFactory: { CreateInstance: () => null },
                GetEventListener: () => ({
                    subscribe: (cb: (event: { event: string; eventCode: string; args: unknown }) => void) => {
                        eventCallbacks.push(cb);
                        return { unsubscribe: () => { /* no-op */ } };
                    },
                }),
            },
        },
    };
});

import { SearchScopePermissionResolver } from '../SearchScopePermissionResolver';

const SCOPE_1 = '11111111-1111-4111-8111-111111111111';
const SCOPE_2 = '22222222-2222-4222-8222-222222222222';
const USER_A = { ID: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', Name: 'User A', UserRoles: [] } as unknown as UserInfo;
const USER_B = { ID: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', Name: 'User B', UserRoles: [] } as unknown as UserInfo;
const NO_ID_USER = { ID: '', Name: 'No ID', UserRoles: [] } as unknown as UserInfo;

describe('SearchScopePermissionResolver — user-scoped short-TTL cache & invalidation', () => {
    let resolver: SearchScopePermissionResolver;

    beforeEach(() => {
        SearchScopePermissionResolver.ClearCache();
        resolver = new SearchScopePermissionResolver();
        mockRunViewFn.mockReset();
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agent Search Scopes') {
                return { Success: true, Results: [{ ID: 'assign-1' }] };
            }
            return {
                Success: true,
                Results: [{ UserID: USER_A.ID, RoleID: null, PermissionLevel: 'Search' }],
            };
        });
    });

    it('caches permission rows and agent-scope assignments per user within TTL', async () => {
        const agent = { ID: 'agent-1', Name: 'Assigned Agent', SearchScopeAccess: 'Assigned' } as unknown as MJAIAgentEntity;

        const r1 = await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: agent });
        expect(r1.Allowed).toBe(true);
        expect(mockRunViewFn).toHaveBeenCalledTimes(2); // 1x Agent Search Scopes + 1x Search Scope Permissions

        const r2 = await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: agent });
        expect(r2.Allowed).toBe(true);
        expect(mockRunViewFn).toHaveBeenCalledTimes(2); // Both cached!
    });

    it('isolates cached permission rows by contextUser.ID (User B never hits User A cache)', async () => {
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(1);

        const rB = await resolver.ResolveEffectivePermission({ User: USER_B, SearchScopeID: SCOPE_1, Agent: null });
        expect(rB.Allowed).toBe(false);
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);
    });

    it('never caches when contextUser.ID is empty (fail-closed)', async () => {
        await resolver.ResolveEffectivePermission({ User: NO_ID_USER, SearchScopeID: SCOPE_1, Agent: null });
        await resolver.ResolveEffectivePermission({ User: NO_ID_USER, SearchScopeID: SCOPE_1, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);
    });

    it('invalidates only the targeted scope on ClearCache(scopeID) and on entity save events', async () => {
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: null });
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_2, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);

        // Evict only SCOPE_1 via ClearCache(SCOPE_1)
        SearchScopePermissionResolver.ClearCache(SCOPE_1);
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_2, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(2); // SCOPE_2 still cached
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(3); // SCOPE_1 re-queried

        // Evict SCOPE_2 via MJGlobal entity save event (typed SearchScopeID property, no .Get())
        for (const cb of eventCallbacks) {
            cb({
                event: 'ComponentEvent',
                eventCode: 'BaseEntityEvent',
                args: {
                    type: 'save',
                    baseEntity: {
                        EntityInfo: { Name: 'MJ: Search Scope Permissions' },
                        SearchScopeID: SCOPE_2,
                    },
                },
            });
        }
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(3); // SCOPE_1 untouched by SCOPE_2 save
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_2, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(4); // SCOPE_2 re-queried
    });

    it('invalidates cached permissions on remote-invalidate events where baseEntity is null and entityName carries the entity', async () => {
        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(1);

        for (const cb of eventCallbacks) {
            cb({
                event: 'ComponentEvent',
                eventCode: 'BaseEntityEvent',
                args: {
                    type: 'remote-invalidate',
                    baseEntity: null,
                    entityName: 'MJ: Search Scope Permissions',
                },
            });
        }

        await resolver.ResolveEffectivePermission({ User: USER_A, SearchScopeID: SCOPE_1, Agent: null });
        expect(mockRunViewFn).toHaveBeenCalledTimes(2);
    });
});
