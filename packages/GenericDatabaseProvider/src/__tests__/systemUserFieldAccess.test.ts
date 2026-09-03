/**
 * The system-user field-access guard.
 *
 * Field-level security has no exempt user at runtime, so the MJ system user's access comes from
 * ordinary `Allow` rows. These tests pin the two things that follow from that:
 *
 *  1. a change is judged by the PROJECTED AGGREGATE across every role the account holds — not by
 *     whether the changed rule happens to say `Deny`. Setting each of its roles to `No Access` in
 *     turn writes no `Deny` and still ends in a lockout;
 *  2. the guard stands down wherever field rules cannot decide anything (unrestrictable fields,
 *     an account already denied at entity level, a cold user cache).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const SYS_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_A = 'a0000000-0000-0000-0000-00000000000a';
const ROLE_B = 'b0000000-0000-0000-0000-00000000000b';
const OTHER_ROLE = 'c0000000-0000-0000-0000-00000000000c';

const { systemUserStub } = vi.hoisted(() => ({ systemUserStub: { value: null as unknown } }));

vi.mock('../UserCache.js', () => ({
    UserCache: {
        get Instance() {
            return { GetSystemUser: () => systemUserStub.value };
        },
    },
}));

import {
    SystemUserFieldAccessLossReason,
    FindSystemUserFieldAccessViolations,
    SystemUserHoldsRole,
} from '../systemUserFieldAccess.js';
import type { EntityFieldInfo, EntityInfo, FieldPermissionRuleForRole, IMetadataProvider, UserInfo } from '@memberjunction/core';

/** A rule granting everything to a role. */
const allow = (roleID: string): FieldPermissionRuleForRole => ({
    RoleID: roleID,
    ReadAccess: 'Allow',
    UpdateAccess: 'Allow',
    CreateAccess: 'Allow',
});
/** A rule granting nothing and denying nothing. */
const neutral = (roleID: string): FieldPermissionRuleForRole => ({
    RoleID: roleID,
    ReadAccess: 'No Access',
    UpdateAccess: 'No Access',
    CreateAccess: 'No Access',
});
/** A rule that takes read away. */
const deny = (roleID: string): FieldPermissionRuleForRole => ({
    RoleID: roleID,
    ReadAccess: 'Deny',
    UpdateAccess: 'No Access',
    CreateAccess: 'No Access',
});

function systemUserHolding(...roleIDs: string[]): void {
    systemUserStub.value = {
        ID: SYS_USER_ID,
        UserRoles: roleIDs.map(id => ({ RoleID: id, Role: `Role-${id}` })),
    };
}

/** An entity whose permissions give the system user's roles full entity-level CRUD. */
function entityWith(entityAccess: { CanRead: boolean; CanUpdate: boolean; CanCreate: boolean }, fields: EntityFieldInfo[] = []): EntityInfo {
    return {
        Name: 'MJ: Employees',
        EnableFieldLevelSecurity: true,
        Fields: fields,
        GetUserPermisions: () => entityAccess,
    } as unknown as EntityInfo;
}

function fieldNamed(
    name: string,
    opts: { unrestrictableField?: boolean; unrestrictableEntity?: boolean; rules?: FieldPermissionRuleForRole[] } = {}
): EntityFieldInfo {
    return {
        Name: name,
        IsUnrestrictableField: opts.unrestrictableField ?? false,
        IsOnUnrestrictableEntity: opts.unrestrictableEntity ?? false,
        FieldPermissions: opts.rules ?? [],
    } as unknown as EntityFieldInfo;
}

const FULL = { CanRead: true, CanUpdate: true, CanCreate: true };

beforeEach(() => {
    systemUserStub.value = null;
});

describe('SystemUserFieldAccessLossReason', () => {
    it('permits a change that leaves an Allow standing on another system-user role', () => {
        systemUserHolding(ROLE_A, ROLE_B);
        const reason = SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('Email'), [neutral(ROLE_A), allow(ROLE_B)]);
        expect(reason).toBeNull();
    });

    it('REFUSES the change that turns the last Allow into No Access — no Deny anywhere', () => {
        // This is the hole a per-rule "does it contain a Deny?" check cannot see.
        systemUserHolding(ROLE_A, ROLE_B);
        const reason = SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('Email'), [neutral(ROLE_A), neutral(ROLE_B)]);
        expect(reason).toBeTruthy();
        expect(reason).toContain('unable to read');
        expect(reason).toContain('Email');
    });

    it('REFUSES a projection with no rules at all — the last row deleted', () => {
        systemUserHolding(ROLE_A);
        expect(SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('Email'), [])).toBeTruthy();
    });

    it('REFUSES a Deny even when another role allows — Deny is absorbing', () => {
        systemUserHolding(ROLE_A, ROLE_B);
        const reason = SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('Email'), [allow(ROLE_A), deny(ROLE_B)]);
        expect(reason).toBeTruthy();
    });

    it('ignores rules bound to roles the system user does not hold', () => {
        systemUserHolding(ROLE_A);
        const reason = SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('Email'), [allow(ROLE_A), deny(OTHER_ROLE)]);
        expect(reason).toBeNull();
    });

    it('refuses a lost UPDATE when the entity-level permission grants update', () => {
        systemUserHolding(ROLE_A);
        const readOnlyRule: FieldPermissionRuleForRole = {
            RoleID: ROLE_A,
            ReadAccess: 'Allow',
            UpdateAccess: 'No Access',
            CreateAccess: 'Allow',
        };
        const reason = SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('Email'), [readOnlyRule]);
        expect(reason).toContain('unable to update');
    });

    it('does NOT demand update when the entity-level permission is read-only', () => {
        // The snapshot mirrors entity permissions, so Allow/No Access/No Access is the correct
        // state for a read-only role. Demanding update would refuse the rows the guard protects.
        systemUserHolding(ROLE_A);
        const entity = entityWith({ CanRead: true, CanUpdate: false, CanCreate: false });
        const rule: FieldPermissionRuleForRole = {
            RoleID: ROLE_A,
            ReadAccess: 'Allow',
            UpdateAccess: 'No Access',
            CreateAccess: 'No Access',
        };
        expect(SystemUserFieldAccessLossReason(entity, fieldNamed('Email'), [rule])).toBeNull();
    });

    it('stands down when the system user has no entity-level read — already denied one level up', () => {
        systemUserHolding(ROLE_A);
        const entity = entityWith({ CanRead: false, CanUpdate: false, CanCreate: false });
        expect(SystemUserFieldAccessLossReason(entity, fieldNamed('Email'), [])).toBeNull();
    });

    it('stands down for unrestrictable fields and entities — forced open regardless', () => {
        systemUserHolding(ROLE_A);
        expect(SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('ID', { unrestrictableField: true }), [])).toBeNull();
        expect(SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('X', { unrestrictableEntity: true }), [])).toBeNull();
    });

    it('stands down on a cold user cache rather than blocking an administrator', () => {
        systemUserStub.value = null;
        expect(SystemUserFieldAccessLossReason(entityWith(FULL), fieldNamed('Email'), [])).toBeNull();
    });
});

describe('SystemUserHoldsRole', () => {
    it('matches case-insensitively and rejects unheld or missing roles', () => {
        systemUserHolding(ROLE_A);
        expect(SystemUserHoldsRole(ROLE_A.toUpperCase())).toBe(true);
        expect(SystemUserHoldsRole(OTHER_ROLE)).toBe(false);
        expect(SystemUserHoldsRole(null)).toBe(false);
    });

    it('is false on a cold cache, so the caller skips the expensive projection', () => {
        systemUserStub.value = null;
        expect(SystemUserHoldsRole(ROLE_A)).toBe(false);
    });
});

describe('FindSystemUserFieldAccessViolations', () => {
    const providerWith = (entities: EntityInfo[]): IMetadataProvider => ({ Entities: entities }) as unknown as IMetadataProvider;

    it('reports a field whose rules leave the system user with no Allow', () => {
        systemUserHolding(ROLE_A);
        const bad = fieldNamed('Salary', { rules: [neutral(ROLE_A)] });
        const good = fieldNamed('Title', { rules: [allow(ROLE_A)] });
        const entity = entityWith(FULL, [bad, good]);
        const violations = FindSystemUserFieldAccessViolations(providerWith([entity]));
        expect(violations).toEqual([{ EntityName: 'MJ: Employees', FieldName: 'Salary', Verb: 'read' }]);
    });

    it('skips entities with field security switched off — dormant rules restrict nothing', () => {
        systemUserHolding(ROLE_A);
        const entity = entityWith(FULL, [fieldNamed('Salary', { rules: [neutral(ROLE_A)] })]);
        (entity as unknown as { EnableFieldLevelSecurity: boolean }).EnableFieldLevelSecurity = false;
        expect(FindSystemUserFieldAccessViolations(providerWith([entity]))).toEqual([]);
    });

    it('returns nothing when there is no provider or no system user', () => {
        systemUserHolding(ROLE_A);
        expect(FindSystemUserFieldAccessViolations(null)).toEqual([]);
        systemUserStub.value = null;
        expect(FindSystemUserFieldAccessViolations(providerWith([]))).toEqual([]);
    });

    it('WithoutRoleID: refuses removing the role that carries the only Allow', () => {
        systemUserHolding(ROLE_A, ROLE_B);
        // ROLE_A allows, ROLE_B abstains — so taking ROLE_A away leaves nothing granting the field.
        const entity = entityWith(FULL, [fieldNamed('Salary', { rules: [allow(ROLE_A), neutral(ROLE_B)] })]);
        const lost = FindSystemUserFieldAccessViolations(providerWith([entity]), undefined, { WithoutRoleID: ROLE_A });
        expect(lost).toEqual([{ EntityName: 'MJ: Employees', FieldName: 'Salary', Verb: 'read' }]);
    });

    it('WithoutRoleID: permits removing a role whose Allow is duplicated by another', () => {
        systemUserHolding(ROLE_A, ROLE_B);
        const entity = entityWith(FULL, [fieldNamed('Salary', { rules: [allow(ROLE_A), allow(ROLE_B)] })]);
        expect(FindSystemUserFieldAccessViolations(providerWith([entity]), undefined, { WithoutRoleID: ROLE_A })).toEqual([]);
    });

    it('WithoutRoleID: permits a removal that also costs entity-level read — denied one level up', () => {
        systemUserHolding(ROLE_A, ROLE_B);
        // GetUserPermisions is evaluated against the PROJECTED user, so a stub that answers
        // "no read" once ROLE_A is gone models an entity whose read came only from that role.
        const entity = {
            Name: 'MJ: Employees',
            EnableFieldLevelSecurity: true,
            Fields: [fieldNamed('Salary', { rules: [allow(ROLE_A), neutral(ROLE_B)] })],
            GetUserPermisions: (u: UserInfo) =>
                u.UserRoles.some(r => r.RoleID === ROLE_A) ? FULL : { CanRead: false, CanUpdate: false, CanCreate: false },
        } as unknown as EntityInfo;
        expect(FindSystemUserFieldAccessViolations(providerWith([entity]), undefined, { WithoutRoleID: ROLE_A })).toEqual([]);
    });

    it('WithoutRoleID: leaves the caller-supplied user untouched', () => {
        systemUserHolding(ROLE_A, ROLE_B);
        const entity = entityWith(FULL, [fieldNamed('Salary', { rules: [allow(ROLE_A)] })]);
        FindSystemUserFieldAccessViolations(providerWith([entity]), undefined, { WithoutRoleID: ROLE_A });
        expect((systemUserStub.value as UserInfo).UserRoles).toHaveLength(2);
    });

    it('accepts an explicitly supplied system user, for callers that resolved it themselves', () => {
        systemUserStub.value = null;
        const user = { ID: SYS_USER_ID, UserRoles: [{ RoleID: ROLE_A, Role: 'A' }] } as unknown as UserInfo;
        const entity = entityWith(FULL, [fieldNamed('Salary', { rules: [neutral(ROLE_A)] })]);
        expect(FindSystemUserFieldAccessViolations(providerWith([entity]), user)).toHaveLength(1);
    });
});
