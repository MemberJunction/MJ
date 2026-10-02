/**
 * `AssignUserRolesAction` under the #4282 role-elevation guard.
 *
 * WHY THIS EXISTS. `MJUserRoleEntityServer` refuses, for a non-Owner caller, any grant of a role
 * the caller does not hold. This action is one of the guard's affected callers: it builds its
 * `MJ: User Roles` object with `params.ContextUser`, so the guard evaluates the ACTION'S caller,
 * and it assigns inside an explicit provider transaction where any refused `Save()` throws and
 * rolls the whole batch back.
 *
 * These tests pin that behaviour rather than change it — it is already correct, and notably it is
 * the one affected path that reports its refusal properly (the transaction-group paths on the
 * Explorer screens cannot, per issue #4309). They exist because the branch's changeset now makes
 * a specific factual claim about this action in its upgrade notes: batch-atomic, `Success: false`,
 * `ResultCode: 'FAILED'`, and the guard's own message carried through. Nothing else pins that, so
 * without these the note could go stale silently.
 *
 * Collaborators are mocked in the style of `update-record.action.test.ts`: no live DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    UUIDsEqual: (a: string, b: string) => String(a).toLowerCase() === String(b).toLowerCase(),
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

const { userCacheStub } = vi.hoisted(() => ({
    userCacheStub: { Users: [] as Array<{ ID: string; UserRoles: Array<{ RoleID: string }> }> },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: userCacheStub,
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class Metadata {
        public static Provider: unknown = undefined;
        public Roles: unknown[] = [];
        public GetEntityObject = vi.fn();
    },
}));

import { AssignUserRolesAction } from '../custom/user-management/assign-user-roles.action';

const ROLES = [
    { ID: 'role-ui', Name: 'UI' },
    { ID: 'role-integration', Name: 'Integration' },
];

/** Provider stub carrying the Metadata surface the action uses plus explicit transaction control. */
function makeProvider(entities: Array<{ Save: () => Promise<boolean>; LatestResult?: unknown }>) {
    const queue = [...entities];
    return {
        Roles: ROLES,
        GetEntityObject: vi.fn().mockImplementation(async () => {
            const next = queue.shift();
            return { ID: 'ur-new', UserID: '', RoleID: '', ...next };
        }),
        BeginTransaction: vi.fn().mockResolvedValue(undefined),
        CommitTransaction: vi.fn().mockResolvedValue(undefined),
        RollbackTransaction: vi.fn().mockResolvedValue(undefined),
    };
}

/** An entity whose Save() is refused the way the guard refuses it. */
const refused = (message: string) => ({
    Save: vi.fn().mockResolvedValue(false),
    LatestResult: { CompleteMessage: message },
});
const accepted = () => ({ Save: vi.fn().mockResolvedValue(true) });

function makeParams(provider: unknown, roleNames: string[], userID = 'user-1') {
    return {
        Params: [
            { Name: 'UserID', Value: userID, Type: 'Input' },
            { Name: 'RoleNames', Value: roleNames, Type: 'Input' },
        ],
        Provider: provider,
        ContextUser: { ID: 'caller-1', Type: 'User' },
    };
}

const REFUSAL = 'You may only assign a role that you hold yourself.';

describe('AssignUserRolesAction under the #4282 guard', () => {
    let action: AssignUserRolesAction;

    beforeEach(() => {
        action = new AssignUserRolesAction();
        userCacheStub.Users = [{ ID: 'user-1', UserRoles: [] }];
    });

    it('builds the UserRole with params.ContextUser, so the guard judges the ACTION caller', async () => {
        const provider = makeProvider([accepted()]);
        const params = makeParams(provider, ['UI']);

        await action.InternalRunAction(params as never);

        expect(provider.GetEntityObject).toHaveBeenCalledWith('MJ: User Roles', params.ContextUser);
    });

    it('reports FAILED when the guard refuses a role the caller does not hold', async () => {
        const provider = makeProvider([refused(REFUSAL)]);

        const result = await action.InternalRunAction(makeParams(provider, ['Integration']) as never);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('FAILED');
    });

    it("carries the guard's own message, so the caller learns WHY", async () => {
        const provider = makeProvider([refused(REFUSAL)]);

        const result = await action.InternalRunAction(makeParams(provider, ['Integration']) as never);

        expect(result.Message).toContain(REFUSAL);
        expect(result.Message).toContain('Integration');
    });

    it('ROLLS BACK the whole batch — an accepted role must not persist beside a refused one', async () => {
        const provider = makeProvider([accepted(), refused(REFUSAL)]);

        const result = await action.InternalRunAction(makeParams(provider, ['UI', 'Integration']) as never);

        expect(provider.RollbackTransaction).toHaveBeenCalledOnce();
        expect(provider.CommitTransaction).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
    });

    it('reports ZERO assigned roles after a rollback — the output params must not claim a write', async () => {
        const provider = makeProvider([accepted(), refused(REFUSAL)]);

        const result = await action.InternalRunAction(makeParams(provider, ['UI', 'Integration']) as never);

        const count = result.Params?.find(p => p.Name === 'AssignedCount');
        const ids = result.Params?.find(p => p.Name === 'AssignedRoleIDs');
        expect(count?.Value).toBe(0);
        expect(ids?.Value).toEqual([]);
    });

    it('still commits normally when the caller holds the role — the permitted path is untouched', async () => {
        const provider = makeProvider([accepted()]);

        const result = await action.InternalRunAction(makeParams(provider, ['UI']) as never);

        expect(provider.CommitTransaction).toHaveBeenCalledOnce();
        expect(provider.RollbackTransaction).not.toHaveBeenCalled();
        expect(result.Success).toBe(true);
    });

    it('never opens a transaction when every requested role is already held', async () => {
        userCacheStub.Users = [{ ID: 'user-1', UserRoles: [{ RoleID: 'role-ui' }] }];
        const provider = makeProvider([]);

        const result = await action.InternalRunAction(makeParams(provider, ['UI']) as never);

        expect(provider.BeginTransaction).not.toHaveBeenCalled();
        expect(result.Success).toBe(true);
    });
});
