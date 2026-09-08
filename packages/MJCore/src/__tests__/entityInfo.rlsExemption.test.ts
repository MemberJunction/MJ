/**
 * EntityInfo RLS Exemption Tests
 *
 * Tests the centralized RLS exemption check in GetUserRowLevelSecurityWhereClause.
 * This was the root cause of a bug where single-record GraphQL resolvers applied
 * RLS filters even when the user had a role that exempted them.
 *
 * Scenario modeled after the real bug:
 *   - Entity "MJ: AI Prompt Runs" with 3 role permissions:
 *     - UI role: CanRead=true, ReadRLSFilterID set (filter: AgentRunID IN ...)
 *     - Developer role: CanRead=true, no RLS filter
 *     - Integration role: CanRead=true, no RLS filter
 *   - User with [UI, Integration] roles should be EXEMPT (Integration has no filter)
 *   - User with [UI] role only should get the RLS filter applied
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EntityInfo, EntityPermissionInfo, EntityPermissionType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import {
    UserInfo,
    UserRoleInfo,
    RowLevelSecurityFilterInfo,
    APIKeyRowFilterBinding,
} from '../generic/securityInfo';

// ─── Constants ────────────────────────────────────────────────────────────

const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const OTHER_ENTITY_ID = 'E0000000-0000-0000-0000-000000000099';
const UI_ROLE_ID = 'R0000000-0000-0000-0000-000000000001';
const DEV_ROLE_ID = 'R0000000-0000-0000-0000-000000000002';
const INTEGRATION_ROLE_ID = 'R0000000-0000-0000-0000-000000000003';
const READ_RLS_FILTER_ID = 'F0000000-0000-0000-0000-000000000001';
const CREATE_RLS_FILTER_ID = 'F0000000-0000-0000-0000-000000000002';
// Key-filter IDs chosen so their byte order is unambiguous (A... < B...):
// GetEffectiveRowFilterWhereClause must render bindings in FilterID sort order
// because the clause participates in the RunView cache fingerprint (INV-2).
const KEY_FILTER_A_ID = 'A0000000-0000-0000-0000-000000000001';
const KEY_FILTER_B_ID = 'B0000000-0000-0000-0000-000000000001';
const KEY_FILTER_ACTING_ID = 'C0000000-0000-0000-0000-000000000001';
const DANGLING_FILTER_ID = 'D0000000-0000-0000-0000-00000000DEAD';
const USER_ID = 'U0000000-0000-0000-0000-000000000001';

// ─── Mock Data Builders ───────────────────────────────────────────────────

function buildRLSFilter(id: string, filterText: string): RowLevelSecurityFilterInfo {
    return new RowLevelSecurityFilterInfo({
        ID: id,
        Name: `Filter-${id}`,
        FilterText: filterText,
        Description: 'Test filter',
    });
}

function buildPermission(overrides: Partial<Record<string, unknown>>): EntityPermissionInfo {
    return new EntityPermissionInfo({
        ID: `perm-${overrides.RoleID}`,
        EntityID: ENTITY_ID,
        CanRead: true,
        CanCreate: true,
        CanUpdate: true,
        CanDelete: true,
        ReadRLSFilterID: null,
        CreateRLSFilterID: null,
        UpdateRLSFilterID: null,
        DeleteRLSFilterID: null,
        Type: 'Allow',
        ...overrides,
    });
}

function buildUser(id: string, roleIds: string[]): UserInfo {
    const user = new UserInfo(null, {
        ID: id,
        Name: 'Test User',
        Email: 'test@example.com',
        IsActive: true,
        UserRoles: roleIds.map(rId => ({
            UserID: id,
            RoleID: rId,
            Role: `Role-${rId}`,
        })),
    });
    return user;
}

function buildEntityInfo(permissions: EntityPermissionInfo[]): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Test Entity',
        SchemaName: '__mj',
        BaseTable: 'TestEntity',
        BaseView: 'vwTestEntities',
        Permissions: permissions.map(p => ({
            ID: p.ID,
            EntityID: p.EntityID,
            RoleID: p.RoleID,
            CanRead: p.CanRead,
            CanCreate: p.CanCreate,
            CanUpdate: p.CanUpdate,
            CanDelete: p.CanDelete,
            ReadRLSFilterID: p.ReadRLSFilterID,
            CreateRLSFilterID: p.CreateRLSFilterID,
            UpdateRLSFilterID: p.UpdateRLSFilterID,
            DeleteRLSFilterID: p.DeleteRLSFilterID,
            Type: p.Type,
        })),
        Fields: [],
    });
}

// ─── Test Setup ───────────────────────────────────────────────────────────

const readFilter = buildRLSFilter(READ_RLS_FILTER_ID, "AgentRunID IN (SELECT ID FROM __mj.vwAIAgentRuns WHERE UserID = '{{UserID}}')");
const createFilter = buildRLSFilter(CREATE_RLS_FILTER_ID, "DepartmentID = '{{UserDepartmentID}}'");
const keyFilterA = buildRLSFilter(KEY_FILTER_A_ID, "KeyColA = '{{UserID}}'");
const keyFilterB = buildRLSFilter(KEY_FILTER_B_ID, "KeyColB = '{{UserID}}'");
const keyFilterActing = buildRLSFilter(KEY_FILTER_ACTING_ID, "OrganizationID = '{{ActingOrganizationID}}'");

let savedProvider: typeof Metadata.Provider;

beforeAll(() => {
    savedProvider = Metadata.Provider;
    Metadata.Provider = {
        Entities: [],
        RowLevelSecurityFilters: [readFilter, createFilter, keyFilterA, keyFilterB, keyFilterActing],
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = savedProvider;
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('EntityInfo RLS Exemption (centralized in GetUserRowLevelSecurityWhereClause)', () => {

    describe('UserExemptFromRowLevelSecurity', () => {
        it('returns true when user has a role with no Read RLS filter', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID, INTEGRATION_ROLE_ID]);

            expect(entity.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)).toBe(true);
        });

        it('returns false when all user roles have Read RLS filters', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            expect(entity.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)).toBe(false);
        });

        it('returns false when user has no matching roles on the entity', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            // User has UI role but entity only grants to DEV role
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            expect(entity.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)).toBe(false);
        });

        it('checks the correct permission type (Create vs Read)', () => {
            const entity = buildEntityInfo([
                buildPermission({
                    RoleID: UI_ROLE_ID,
                    ReadRLSFilterID: null,           // exempt from Read
                    CreateRLSFilterID: CREATE_RLS_FILTER_ID, // NOT exempt from Create
                }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            expect(entity.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)).toBe(true);
            expect(entity.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Create)).toBe(false);
        });
    });

    describe('GetUserRowLevelSecurityWhereClause (centralized exemption)', () => {
        it('returns empty string when user is exempt via any role', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID, INTEGRATION_ROLE_ID]);

            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toBe('');
        });

        it('returns RLS filter SQL when user is NOT exempt', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toContain('AND');
            expect(clause).toContain('AgentRunID IN');
            expect(clause).toContain(USER_ID);
        });

        it('returns empty string when user has no roles matching the entity', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            // User has UI role, entity only has DEV permission
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toBe('');
        });

        it('returns empty string with no prefix when returnPrefix is empty', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');

            expect(clause).not.toContain('AND');
            expect(clause).toContain('AgentRunID IN');
        });

        it('ORs together multiple RLS filters from different roles', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: CREATE_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID, DEV_ROLE_ID]);

            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');

            expect(clause).toContain('AgentRunID IN');
            expect(clause).toContain(' OR ');
            expect(clause).toContain('DepartmentID');
        });

        it('deduplicates when multiple roles reference the same filter', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID, DEV_ROLE_ID]);

            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');

            // Should contain the filter once, not ORed with itself
            expect(clause).not.toContain(' OR ');
            expect(clause).toContain('AgentRunID IN');
        });
    });

    describe('Real-world scenario: MJ AI Prompt Runs bug', () => {
        it('user with UI + Integration roles is exempt (Integration has no RLS)', () => {
            // This is the exact scenario that caused the bug:
            // UI role has an RLS filter, Integration role does not.
            // User with both roles should be exempt.
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: null }),
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID, INTEGRATION_ROLE_ID]);

            // Before the fix, this returned the UI role's RLS filter SQL.
            // After the fix, it returns '' because Integration exempts the user.
            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toBe('');
        });

        it('user with only UI role gets the RLS filter applied', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: null }),
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toContain('AND');
            expect(clause).toContain('AgentRunID IN');
        });
    });

    describe('GetUserRowLevelSecurityInfo', () => {
        it('collects filters only from roles the user holds', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: CREATE_RLS_FILTER_ID }),
            ]);
            // User only has UI role
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const filters = entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Read);

            expect(filters).toHaveLength(1);
            expect(filters[0].ID).toBe(READ_RLS_FILTER_ID);
        });

        it('returns empty array when user has no roles with RLS filters', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const filters = entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Read);

            expect(filters).toHaveLength(0);
        });

        it('returns empty array when user has no matching roles', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: DEV_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const filters = entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Read);

            expect(filters).toHaveLength(0);
        });
    });

    describe('Permission type isolation', () => {
        it('Read RLS does not affect Create checks', () => {
            const entity = buildEntityInfo([
                buildPermission({
                    RoleID: UI_ROLE_ID,
                    ReadRLSFilterID: READ_RLS_FILTER_ID,
                    CreateRLSFilterID: null,
                }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            // Read should have filter
            const readClause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
            expect(readClause).toContain('AgentRunID');

            // Create should be exempt (no CreateRLSFilterID)
            const createClause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Create, '');
            expect(createClause).toBe('');
        });

        it('Update and Delete RLS are checked independently', () => {
            const entity = buildEntityInfo([
                buildPermission({
                    RoleID: UI_ROLE_ID,
                    UpdateRLSFilterID: READ_RLS_FILTER_ID,
                    DeleteRLSFilterID: null,
                }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);

            const updateClause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Update, '');
            expect(updateClause).toContain('AgentRunID');

            const deleteClause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Delete, '');
            expect(deleteClause).toBe('');
        });
    });

    // ─── API-key row filters: GetEffectiveRowFilterWhereClause ────────────

    describe('GetEffectiveRowFilterWhereClause (role layer + API-key layer)', () => {
        function bind(filterId: string, permissionType: APIKeyRowFilterBinding['PermissionType'] = 'Read', entityId: string = ENTITY_ID): APIKeyRowFilterBinding {
            return { EntityID: entityId, PermissionType: permissionType, FilterID: filterId };
        }

        it('applies the key filter for a role-RLS-EXEMPT user — the central fail-open regression', () => {
            // User is exempt from role RLS (Integration role has no filter), but the
            // API key carries a row-filter binding. Before centralizing on
            // GetEffectiveRowFilterWhereClause, the exemption silently swallowed the
            // key filter — an unrestricted-role principal escaped the key ceiling.
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID, INTEGRATION_ROLE_ID]);
            user.APIKeyRowFilters = [bind(KEY_FILTER_A_ID)];

            // Sanity: the role layer alone yields nothing (user is exempt)
            expect(entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '')).toBe('');

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toContain(`KeyColA = '${USER_ID}'`);
            expect(clause).not.toContain('AgentRunID'); // role layer stays exempt
            expect(clause.startsWith('AND ')).toBe(true);
        });

        it('composes role clause AND key clause — never OR across layers', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);
            user.APIKeyRowFilters = [bind(KEY_FILTER_A_ID)];

            const roleClause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');

            expect(roleClause.length).toBeGreaterThan(0);
            expect(clause).toBe(`(${roleClause}) AND ((KeyColA = '${USER_ID}'))`);
            // No OR joins the layers — a key ceiling must never widen role RLS
            const layerJoin = clause.slice(clause.indexOf(roleClause) + roleClause.length, clause.indexOf('KeyColA'));
            expect(layerJoin).not.toContain(' OR ');
            expect(layerJoin).toContain(' AND ');
        });

        it('AND-composes two bindings for the same entity+type in FilterID byte order (INV-2)', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            // Deliberately supplied in REVERSE FilterID order: B before A
            user.APIKeyRowFilters = [bind(KEY_FILTER_B_ID), bind(KEY_FILTER_A_ID)];

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');

            // Both bindings apply, AND-composed, rendered in sorted FilterID order
            expect(clause).toBe(`((KeyColA = '${USER_ID}') AND (KeyColB = '${USER_ID}'))`);
            expect(clause.indexOf('KeyColA')).toBeLessThan(clause.indexOf('KeyColB'));
            expect(clause).not.toContain(' OR ');
        });

        it('renders identical clause bytes regardless of binding input order (INV-2)', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const userForward = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            userForward.APIKeyRowFilters = [bind(KEY_FILTER_A_ID), bind(KEY_FILTER_B_ID)];
            const userReverse = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            userReverse.APIKeyRowFilters = [bind(KEY_FILTER_B_ID), bind(KEY_FILTER_A_ID)];

            const forward = entity.GetEffectiveRowFilterWhereClause(userForward, EntityPermissionType.Read, '');
            const reverse = entity.GetEffectiveRowFilterWhereClause(userReverse, EntityPermissionType.Read, '');

            expect(forward).toBe(reverse);
        });

        it('contributes (1=0) for a binding whose FilterID is missing from metadata — fail closed', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            user.APIKeyRowFilters = [bind(DANGLING_FILTER_ID)];

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');

            expect(clause).toContain('(1=0)');
        });

        it('collapses a key filter with an unresolved {{Acting*}} token to (1=0) — fail closed', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            // No APIKeyActingContext stamped → {{ActingOrganizationID}} cannot resolve
            user.APIKeyRowFilters = [bind(KEY_FILTER_ACTING_ID)];

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');

            expect(clause).toContain('(1=0)');
            expect(clause).not.toContain('{{ActingOrganizationID}}');
        });

        it('resolves a key filter with {{ActingOrganizationID}} when the acting context is stamped', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            user.APIKeyActingContext = { ActingOrganizationID: 'ORG00000-0000-0000-0000-000000000001' };
            user.APIKeyRowFilters = [bind(KEY_FILTER_ACTING_ID)];

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');

            expect(clause).toBe("((OrganizationID = 'ORG00000-0000-0000-0000-000000000001'))");
        });

        it('does NOT apply a binding targeting a different entity', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            user.APIKeyRowFilters = [bind(KEY_FILTER_A_ID, 'Read', OTHER_ENTITY_ID)];

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toBe('');
        });

        it('does NOT apply a binding for a different permission type', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            user.APIKeyRowFilters = [bind(KEY_FILTER_A_ID, 'Update')];

            const readClause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, 'AND');
            const updateClause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Update, 'AND');

            expect(readClause).toBe('');
            expect(updateClause).toContain('KeyColA');
        });

        it('matches the legacy role-only clause when no bindings exist (regression)', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: UI_ROLE_ID, ReadRLSFilterID: READ_RLS_FILTER_ID }),
            ]);
            const user = buildUser(USER_ID, [UI_ROLE_ID]);
            // user.APIKeyRowFilters left undefined — no key layer at all

            const legacy = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
            const effective = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');
            const effectiveWithPrefix = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(legacy.length).toBeGreaterThan(0);
            // Same predicate, wrapped in one grouping paren by the layer composer
            expect(effective).toBe(`(${legacy})`);
            expect(effectiveWithPrefix).toBe(`AND (${legacy})`);
        });

        it('returns empty string for an exempt user with no bindings', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toBe('');
        });

        it('empty bindings array behaves the same as no bindings', () => {
            const entity = buildEntityInfo([
                buildPermission({ RoleID: INTEGRATION_ROLE_ID, ReadRLSFilterID: null }),
            ]);
            const user = buildUser(USER_ID, [INTEGRATION_ROLE_ID]);
            user.APIKeyRowFilters = [];

            const clause = entity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, 'AND');

            expect(clause).toBe('');
        });
    });
});
