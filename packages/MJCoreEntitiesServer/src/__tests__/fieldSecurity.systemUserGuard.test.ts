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
 *   1. a field **Deny** aimed at a role the system user already holds
 *      (`MJEntityFieldPermissionEntityServer`)
 *   2. giving the system user a role that already denies a field
 *      (`MJUserRoleEntityServer`)
 *
 * Only DENYING rules are refused. The system user's own access comes from ordinary `Allow`
 * rows that snapshot initialization writes for the standard roles it holds, so a guard that
 * counted every rule would make field security impossible to enable at all.
 *
 * This restricts CONFIGURATION only. There is no user exempt from a Deny at runtime — the
 * runtime aggregation has no system-user branch.
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

vi.mock('@memberjunction/generic-database-provider', () => ({
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

/** A rule that takes read access away. */
const DENYING = { ReadAccess: 'Deny', UpdateAccess: 'No Access', CreateAccess: 'No Access' } as const;
/** The snapshot default for a role with full entity access — a grant, not a restriction. */
const GRANTING = { ReadAccess: 'Allow', UpdateAccess: 'Allow', CreateAccess: 'Allow' } as const;
/** Read-only snapshot default. `No Access` is the aggregation's identity, so this restricts nobody. */
const NEUTRAL = { ReadAccess: 'Allow', UpdateAccess: 'No Access', CreateAccess: 'No Access' } as const;

/**
 * Metadata where `Employees.Salary` carries a rule bound to the given role.
 *
 * `EnableFieldLevelSecurity` is a red herring on purpose — see the disabled-entity test below.
 * The guard walks rules regardless of the flag, so that the two halves of the system-user
 * guard compose.
 */
function metadataWithRuleForRole(
    roleID: string,
    enableFieldLevelSecurity: boolean = true,
    verbs: typeof DENYING | typeof GRANTING | typeof NEUTRAL = DENYING
): void {
    entitiesStub.value = [
        {
            Name: 'Employees',
            EnableFieldLevelSecurity: enableFieldLevelSecurity,
            Fields: [
                { Name: 'ID', HasFieldPermissions: false, FieldPermissions: [] },
                { Name: 'Salary', HasFieldPermissions: true, FieldPermissions: [{ RoleID: roleID, ...verbs }] },
            ],
        },
        { Name: 'Unsecured Entity', EnableFieldLevelSecurity: false, Fields: [] },
    ];
}

beforeEach(() => {
    systemUserStub.value = null;
    entitiesStub.value = [];
});

// ─── Direction 1: a rule aimed at a role the system user holds ────────────

describe('MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason', () => {
    it('refuses a DENYING rule targeting a role the system user holds, and says why', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        const reason = MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID, DENYING);
        expect(reason).toBeTruthy();
        expect(reason).toContain('system user');
        expect(reason).toContain('Remove the role from the system user');
    });

    it('ALLOWS a granting rule on a system-user role — that is what keeps the server working', () => {
        // With no runtime exemption left, the system user's access comes from these very rows.
        // Refusing them would make field security impossible to enable on any entity, since the
        // standard roles carry entity permissions almost everywhere.
        systemUserHolding(RESTRICTED_ROLE_ID);
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID, GRANTING)).toBeNull();
    });

    it('allows a neutral rule on a system-user role — No Access cannot take access away', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID, NEUTRAL)).toBeNull();
    });

    it('refuses a Deny on ANY of the three verbs, not just read', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        const updateDeny = { ReadAccess: 'Allow', UpdateAccess: 'Deny', CreateAccess: 'No Access' } as const;
        const createDeny = { ReadAccess: 'Allow', UpdateAccess: 'No Access', CreateAccess: 'Deny' } as const;
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID, updateDeny)).toBeTruthy();
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID, createDeny)).toBeTruthy();
    });

    it('treats a role-only pre-check as though the rule denied', () => {
        // Callers vetting a ROLE rather than a specific rule get the conservative answer.
        systemUserHolding(RESTRICTED_ROLE_ID);
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID)).toBeTruthy();
    });

    it('allows a rule targeting any other role', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(ORDINARY_ROLE_ID, DENYING)).toBeNull();
    });

    it('matches role IDs case-insensitively (UUID casing differs by platform)', () => {
        systemUserHolding(RESTRICTED_ROLE_ID.toLowerCase());
        expect(
            MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID.toUpperCase(), DENYING)
        ).toBeTruthy();
    });

    it('does not block when the user cache is cold or the system user has no roles', () => {
        systemUserStub.value = null;
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID, DENYING)).toBeNull();
        systemUserStub.value = { ID: SYSTEM_USER_ID, UserRoles: [] };
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(RESTRICTED_ROLE_ID, DENYING)).toBeNull();
    });

    it('does not block when no role is set yet', () => {
        systemUserHolding(RESTRICTED_ROLE_ID);
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(null, DENYING)).toBeNull();
    });
});

// ─── Direction 2: giving the system user a role that carries rules ────────

describe('MJUserRoleEntityServer.SystemUserRejectionReason', () => {
    it('refuses giving the system user a role that DENIES a field, and names the entity', () => {
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID, true, DENYING);
        const reason = MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, RESTRICTED_ROLE_ID);
        expect(reason).toBeTruthy();
        expect(reason).toContain('Employees');
        expect(reason).toContain('system user');
    });

    it('allows giving the system user a role whose rules only GRANT', () => {
        // The standard roles the system user holds pick up Allow rows on every enabled entity.
        // Counting those would make its own role set unassignable.
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID, true, GRANTING);
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, RESTRICTED_ROLE_ID)).toBeNull();
    });

    it('allows giving the system user a role whose rules are neutral', () => {
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID, true, NEUTRAL);
        expect(MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, RESTRICTED_ROLE_ID)).toBeNull();
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

    it('still refuses when the entity has field security DISABLED — the ordering trap', () => {
        // The two halves of this guard have to compose, and gating this walk on
        // EnableFieldLevelSecurity would leave a three-step hole: disable field security on an
        // entity, assign the role (now "carrying no active rules") to the system user, then
        // re-enable. Every step is permitted and the end state is the one both halves exist to
        // prevent. Disabling preserves rules precisely so re-enabling does not lose them, so a
        // dormant rule is not a gone rule.
        systemUserHolding();
        metadataWithRuleForRole(RESTRICTED_ROLE_ID, false);

        expect(MJUserRoleEntityServer.SystemUserRejectionReason(SYSTEM_USER_ID, RESTRICTED_ROLE_ID)).toBeTruthy();
    });
});
