import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthorizationInfo, AuthorizationRoleInfo, Metadata, UserInfo } from '@memberjunction/core';
import { EvaluateAuthorizationChecks, FindMatchingAuthorization } from '../custom/operations/EvaluateAuthorizationChecks';

function setupRoles(rows: Array<{ ID: string; AuthorizationID: string; RoleID: string; Type?: string }>) {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        AuthorizationRoles: rows.map((r) => new AuthorizationRoleInfo({ ...r, Type: r.Type ?? 'Allow' })),
    } as never);
}

function auth(init: { ID: string; Name: string; ParentID?: string | null; IsActive?: boolean }) {
    return new AuthorizationInfo({
        ID: init.ID,
        Name: init.Name,
        ParentID: init.ParentID ?? null,
        IsActive: init.IsActive ?? true,
    });
}

function user(roleIDs: string[]) {
    return new UserInfo(null, {
        ID: 'u-1',
        UserRoles: roleIDs.map((RoleID) => ({ UserID: 'u-1', RoleID })),
    });
}

describe('EvaluateAuthorizationChecks', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns empty Results for an empty Names list', () => {
        setupRoles([]);
        expect(EvaluateAuthorizationChecks([], user(['r-1']), [])).toEqual([]);
    });

    it('fails closed on an unknown name', () => {
        setupRoles([]);
        const catalog = [auth({ ID: 'a-1', Name: 'Orders.Price.OverrideList' })];
        const rows = EvaluateAuthorizationChecks(['Not.A.Real.Auth'], user(['r-1']), catalog);
        expect(rows).toEqual([
            {
                Name: 'Not.A.Real.Auth',
                Allowed: false,
                Unknown: true,
                ViaAncestor: false,
                MatchedAuthorizationName: null,
            },
        ]);
    });

    it('allows a direct grant', () => {
        setupRoles([{ ID: 'ar-1', AuthorizationID: 'a-leaf', RoleID: 'r-clerk', Type: 'Allow' }]);
        const leaf = auth({ ID: 'a-leaf', Name: 'Orders.Price.OverrideList', ParentID: 'a-parent' });
        const parent = auth({ ID: 'a-parent', Name: 'Orders.Price.Override' });
        const rows = EvaluateAuthorizationChecks(['Orders.Price.OverrideList'], user(['r-clerk']), [leaf, parent]);
        expect(rows[0]).toMatchObject({
            Allowed: true,
            Unknown: false,
            ViaAncestor: false,
            MatchedAuthorizationName: 'Orders.Price.OverrideList',
        });
    });

    it('allows via an ancestor grant and sets ViaAncestor', () => {
        setupRoles([{ ID: 'ar-1', AuthorizationID: 'a-parent', RoleID: 'r-controller', Type: 'Allow' }]);
        const leaf = auth({ ID: 'a-leaf', Name: 'Orders.Price.OverrideAny', ParentID: 'a-parent' });
        const parent = auth({ ID: 'a-parent', Name: 'Orders.Price.Override' });
        const rows = EvaluateAuthorizationChecks(['orders.price.overrideany'], user(['r-controller']), [leaf, parent]);
        expect(rows[0]).toMatchObject({
            Name: 'orders.price.overrideany',
            Allowed: true,
            Unknown: false,
            ViaAncestor: true,
            MatchedAuthorizationName: 'Orders.Price.Override',
        });
    });

    it('denies when no role matches the leaf or ancestors', () => {
        setupRoles([{ ID: 'ar-1', AuthorizationID: 'a-leaf', RoleID: 'r-other', Type: 'Allow' }]);
        const leaf = auth({ ID: 'a-leaf', Name: 'Orders.Price.OverrideList' });
        const rows = EvaluateAuthorizationChecks(['Orders.Price.OverrideList'], user(['r-clerk']), [leaf]);
        expect(rows[0]).toMatchObject({ Allowed: false, Unknown: false, ViaAncestor: false, MatchedAuthorizationName: null });
    });

    it('skips duplicate names (case-insensitive) and blank entries', () => {
        setupRoles([{ ID: 'ar-1', AuthorizationID: 'a-1', RoleID: 'r-1', Type: 'Allow' }]);
        const a = auth({ ID: 'a-1', Name: 'Can Share Skills' });
        const rows = EvaluateAuthorizationChecks(['Can Share Skills', '', 'can share skills', '  '], user(['r-1']), [a]);
        expect(rows).toHaveLength(1);
        expect(rows[0].Allowed).toBe(true);
    });

    it('FindMatchingAuthorization returns the leaf when both leaf and parent match', () => {
        setupRoles([
            { ID: 'ar-1', AuthorizationID: 'a-leaf', RoleID: 'r-1', Type: 'Allow' },
            { ID: 'ar-2', AuthorizationID: 'a-parent', RoleID: 'r-1', Type: 'Allow' },
        ]);
        const leaf = auth({ ID: 'a-leaf', Name: 'Leaf', ParentID: 'a-parent' });
        const parent = auth({ ID: 'a-parent', Name: 'Parent' });
        const matched = FindMatchingAuthorization(leaf, user(['r-1']), [leaf, parent]);
        expect(matched?.Name).toBe('Leaf');
    });
});
