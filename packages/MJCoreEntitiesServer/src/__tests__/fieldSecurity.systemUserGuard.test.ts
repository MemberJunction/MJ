/**
 * The system-user configuration guard for field-level security.
 *
 * The MJ system user is the account the server runs background work as. It pre-warms the
 * shared engine caches at startup, and in task mode (job and agent runners) engines instead
 * load on first touch — so whichever caller gets there first configures the engine for the
 * whole process. Those caches are process-wide and shared across users, so a restricted
 * system user could leave partially loaded records in a cache everyone reads afterward.
 *
 * Two saves can reach that state, so both are refused:
 *   1. a field rule aimed at a role the system user already holds
 *      (`MJEntityFieldPermissionEntityServer`)
 *   2. giving the system user a role that already carries field rules
 *      (`MJUserRoleEntityServer`)
 *
 * This restricts CONFIGURATION only. There is still no user exempt from a Deny at runtime.
 *
 * Both checks are exposed as static helpers, so they are tested directly against a stubbed
 * `UserCache` and stubbed metadata rather than through the heavy generated bases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';
const RESTRICTED_ROLE_ID = 'B0000000-0000-0000-0000-00000000000A';
const ORDINARY_ROLE_ID = 'B0000000-0000-0000-0000-00000000000B';
const REGULAR_USER_ID = 'C0000000-0000-0000-0000-00000000000C';

const { systemUserStub, entitiesStub } = vi.hoisted(() => ({
    systemUserStub: { value: null as unknown },
    entitiesStub: { value: [] as unknown[] },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    UserCache: {
        get Instance() {
            return { GetSystemUser: () => systemUserStub.value };
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        public get Entities(): unknown[] {
            return entitiesStub.value;
        }
    }
    return { ...actual, Metadata: MockMetadata };
});

vi.mock('@memberjunction/core-entities', () => {
    class MockBase {
        public Validate() {
            return { Success: true, Errors: [] };
        }
    }
    return { MJEntityFieldPermissionEntity: MockBase, MJUserRoleEntity: MockBase };
});

import { MJEntityFieldPermissionEntityServer } from '../custom/MJEntityFieldPermissionEntityServer.server';
import { MJUserRoleEntityServer } from '../custom/MJUserRoleEntityServer.server';

/** A system user holding the given roles. */
function systemUserHolding(...roleIDs: string[]): void {
    systemUserStub.value = {
        ID: SYSTEM_USER_ID,
        Email: 'system@memberjunction.org',
        UserRoles: roleIDs.map(id => ({ RoleID: id, Role: `Role-${id}` })),
    };
}

/** Metadata where `Employees.Salary` carries a rule bound to the given role. */
function metadataWithRuleForRole(roleID: string): void {
    entitiesStub.value = [
        {
            Name: 'Employees',
            HasAnyFieldPermissions: true,
            Fields: [
                { Name: 'ID', HasFieldPermissions: false, FieldPermissions: [] },
                { Name: 'Salary', HasFieldPermissions: true, FieldPermissions: [{ RoleID: roleID }] },
            ],
        },
        { Name: 'Unsecured Entity', HasAnyFieldPermissions: false, Fields: [] },
    ];
}

beforeEach(() => {
    systemUserStub.value = null;
    entitiesStub.value = [];
});

// ─── Direction 1: a rule aimed at a role the system user holds ────────────

describe('MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason', () => {
    it('refuses a rule targeting a role the system user holds, and says why', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        const reason = MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID);
        expect(reason).toBeTruthy();
        expect(reason).toContain('system user');
        expect(reason).toContain('Remove the role from the system user');
    });

    it('allows a rule targeting any other role', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(ORDINARY_ROLE_ID)).toBeNull();
    });

    it('matches role IDs case-insensitively (UUID casing differs by platform)', () => {
        systemUserHolding(RESTRICTED_ROLE_ID.toLowerCase());
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID.toUpperCase())).toBeTruthy();
    });

    it('does not block when the user cache is cold or the system user has no roles', () => {
        systemUserStub.value = null;
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID)).toBeNull();
        systemUserStub.value = { ID: SYSTEM_USER_ID, UserRoles: [] };
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID)).toBeNull();
    });

    it('does not block when no role is set yet', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(null)).toBeNull();
    });
});

// ─── Direction 2: giving the system user a role that carries rules ────────

describe('MJUserRoleEntityServer.SystemUserRejectionReason', () => {
    it('refuses giving the system user a role that carries field rules, and names the entity', () => {
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID);
        const reason = MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, RESTRICTED_ROLE_ID);
        expect(reason).toBeTruthy();
        expect(reason).toContain('Employees');
        expect(reason).toContain('system user');
    });

    it('allows giving the system user a role with no field rules', () => {
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID);
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, ORDINARY_ROLE_ID)).toBeNull();
    });

    it('never blocks a regular user — the guard is only about the system account', () => {
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID);
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(REGULAR_USER_ID, RESTRICTED_ROLE_ID)).toBeNull();
    });

    it('matches the system user ID case-insensitively', () => {
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID);
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID.toUpperCase(), RESTRICTED_ROLE_ID)).toBeTruthy();
    });

    it('does not block when the user cache is cold, or when ids are missing', () => {
        systemUserStub.value = null;
        metadataWithRuleForRole(RESTRICTED_ROLE_ID);
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, RESTRICTED_ROLE_ID)).toBeNull();
        systemUserHolding();
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(null, RESTRICTED_ROLE_ID)).toBeNull();
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, null)).toBeNull();
    });
});
