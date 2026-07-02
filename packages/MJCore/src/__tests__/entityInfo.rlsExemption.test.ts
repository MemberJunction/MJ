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
} from '../generic/securityInfo';

// ─── Constants ────────────────────────────────────────────────────────────

const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const UI_ROLE_ID = 'R0000000-0000-0000-0000-000000000001';
const DEV_ROLE_ID = 'R0000000-0000-0000-0000-000000000002';
const INTEGRATION_ROLE_ID = 'R0000000-0000-0000-0000-000000000003';
const READ_RLS_FILTER_ID = 'F0000000-0000-0000-0000-000000000001';
const CREATE_RLS_FILTER_ID = 'F0000000-0000-0000-0000-000000000002';
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

let savedProvider: typeof Metadata.Provider;

beforeAll(() => {
    savedProvider = Metadata.Provider;
    Metadata.Provider = {
        Entities: [],
        RowLevelSecurityFilters: [readFilter, createFilter],
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
});
