/**
 * The startup sweep for field-level security: orphaned field rules and the system user's own
 * field access. Both are log-only, so the assertions are on what reaches `LogError` and on the
 * counts the public methods return.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const SYS_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_A = 'a0000000-0000-0000-0000-00000000000a';
const OTHER_ROLE = 'c0000000-0000-0000-0000-00000000000c';

const { systemUserStub, logError } = vi.hoisted(() => ({
    systemUserStub: { value: null as unknown },
    logError: vi.fn<(message: string) => void>(),
}));

vi.mock('../UserCache.js', () => ({
    UserCache: {
        get Instance() {
            return { GetSystemUser: () => systemUserStub.value };
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: logError };
});

import { SystemUserFieldAccessCheck } from '../SystemUserFieldAccessCheck.js';
import type { EntityFieldInfo, EntityInfo, FieldPermissionRuleForRole, IMetadataProvider } from '@memberjunction/core';

const allow = (roleID: string): FieldPermissionRuleForRole => ({
    RoleID: roleID,
    ReadAccess: 'Allow',
    UpdateAccess: 'Allow',
    CreateAccess: 'Allow',
});
const neutral = (roleID: string): FieldPermissionRuleForRole => ({
    RoleID: roleID,
    ReadAccess: 'No Access',
    UpdateAccess: 'No Access',
    CreateAccess: 'No Access',
});

const FULL = { CanRead: true, CanUpdate: true, CanCreate: true };

function systemUserHolding(...roleIDs: string[]): void {
    systemUserStub.value = {
        ID: SYS_USER_ID,
        UserRoles: roleIDs.map((id) => ({ RoleID: id, Role: `Role-${id}` })),
    };
}

function field(name: string, rules: FieldPermissionRuleForRole[]): EntityFieldInfo {
    return {
        Name: name,
        IsUnrestrictableField: false,
        IsOnUnrestrictableEntity: false,
        ReadOnly: false,
        FieldPermissions: rules,
    } as unknown as EntityFieldInfo;
}

function entity(opts: { name?: string; fls?: boolean; permissionRoleIDs: string[]; fields: EntityFieldInfo[] }): EntityInfo {
    return {
        Name: opts.name ?? 'MJ: Employees',
        EnableFieldLevelSecurity: opts.fls ?? true,
        Permissions: opts.permissionRoleIDs.map((RoleID) => ({ RoleID })),
        Fields: opts.fields,
        GetUserPermisions: () => FULL,
    } as unknown as EntityInfo;
}

function providerWith(...entities: EntityInfo[]): IMetadataProvider {
    return { Entities: entities } as unknown as IMetadataProvider;
}

/** Every LogError message from the run, joined so one `toContain` can search them all. */
function logged(): string {
    return logError.mock.calls.map((c) => c[0]).join('\n');
}

const check = SystemUserFieldAccessCheck.Instance;

beforeEach(() => {
    systemUserStub.value = null;
    logError.mockClear();
});

describe('SystemUserFieldAccessCheck.HandleStartup', () => {
    it('reports nothing for a clean configuration', async () => {
        systemUserHolding(ROLE_A);
        const provider = providerWith(entity({ permissionRoleIDs: [ROLE_A], fields: [field('Email', [allow(ROLE_A)])] }));

        await check.HandleStartup(undefined, provider);

        expect(logError).not.toHaveBeenCalled();
        expect(check.Run(provider)).toBe(0);
        expect(check.RunOrphanedFieldRuleSweep(provider)).toBe(0);
    });

    it('matches role IDs case-insensitively, so differently cased UUIDs are not orphans', () => {
        const provider = providerWith(entity({ permissionRoleIDs: [ROLE_A.toUpperCase()], fields: [field('Email', [allow(ROLE_A)])] }));

        expect(check.RunOrphanedFieldRuleSweep(provider)).toBe(0);
        expect(logError).not.toHaveBeenCalled();
    });

    it('reports a field rule whose role has no entity permission on the same entity', async () => {
        systemUserHolding(ROLE_A);
        const provider = providerWith(entity({
            permissionRoleIDs: [ROLE_A],
            fields: [field('Email', [allow(ROLE_A), allow(OTHER_ROLE)])],
        }));

        await check.HandleStartup(undefined, provider);

        expect(logError).toHaveBeenCalledTimes(1);
        expect(logged()).toContain('1 field permission row(s) name a role with no entity permission');
        expect(logged()).toContain(`MJ: Employees.Email (role ${OTHER_ROLE})`);
        expect(check.RunOrphanedFieldRuleSweep(provider)).toBe(1);
    });

    it('reports a field the system user can no longer read', async () => {
        systemUserHolding(ROLE_A);
        const provider = providerWith(entity({ permissionRoleIDs: [ROLE_A], fields: [field('Salary', [neutral(ROLE_A)])] }));

        await check.HandleStartup(undefined, provider);

        expect(logError).toHaveBeenCalledTimes(1);
        expect(logged()).toContain('The MJ system user has lost field-level access to 1 field(s)');
        expect(logged()).toContain('MJ: Employees.Salary (cannot read)');
        expect(check.Run(provider)).toBe(1);
    });

    it('names at most ten offenders and summarises the rest', () => {
        const fields = Array.from({ length: 12 }, (_, i) => field(`F${i}`, [allow(OTHER_ROLE)]));
        const provider = providerWith(entity({ permissionRoleIDs: [ROLE_A], fields }));

        expect(check.RunOrphanedFieldRuleSweep(provider)).toBe(12);
        expect(logged()).toContain('MJ: Employees.F9 ');
        expect(logged()).not.toContain('MJ: Employees.F10 ');
        expect(logged()).toContain('...and 2 more');
    });

    it('does nothing without a provider', async () => {
        systemUserHolding(ROLE_A);

        await expect(check.HandleStartup(undefined, undefined)).resolves.toBeUndefined();

        expect(logError).not.toHaveBeenCalled();
        expect(check.RunOrphanedFieldRuleSweep(null)).toBe(0);
        expect(check.Run(null)).toBe(0);
    });

    it('skips the system-user check when no system user resolves, but still sweeps orphans', async () => {
        const provider = providerWith(entity({
            permissionRoleIDs: [ROLE_A],
            fields: [field('Salary', [neutral(ROLE_A)]), field('Email', [allow(OTHER_ROLE)])],
        }));

        await check.HandleStartup(undefined, provider);

        expect(check.Run(provider)).toBe(0);
        expect(logError).toHaveBeenCalledTimes(1);
        expect(logged()).toContain(`MJ: Employees.Email (role ${OTHER_ROLE})`);
        expect(logged()).not.toContain('system user has lost');
    });

    it('ignores entities with field-level security disabled', async () => {
        systemUserHolding(ROLE_A);
        const provider = providerWith(entity({
            fls: false,
            permissionRoleIDs: [ROLE_A],
            fields: [field('Salary', [neutral(ROLE_A)]), field('Email', [allow(OTHER_ROLE)])],
        }));

        await check.HandleStartup(undefined, provider);

        expect(logError).not.toHaveBeenCalled();
        expect(check.RunOrphanedFieldRuleSweep(provider)).toBe(0);
        expect(check.Run(provider)).toBe(0);
    });
});
