/**
 * GetUserRowLevelSecurityInfo must collect a row filter only from a permission row that GRANTS the
 * operation.
 *
 * The caller ORs the collected filters together (roles are additive), so a filter picked up from a
 * row whose `Can*` flag is false WIDENS the clause. The reachable shape: role A grants Create bound
 * to F1; role B has CanCreate=false but still carries CreateRLSFilterID=F2 (nothing clears the
 * filter column when the flag is cleared). GetUserPermisions ORs the flags across roles, so the user
 * passes the permission gate on A alone — and then created against `F1 OR F2`.
 *
 * Builders mirror entityInfo.rlsExemption.test.ts; kept local so the two files evolve independently.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EntityInfo, EntityPermissionInfo, EntityPermissionType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo, RowLevelSecurityFilterInfo } from '../generic/securityInfo';

const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const ROLE_A_ID = 'R0000000-0000-0000-0000-00000000000A';
const ROLE_B_ID = 'R0000000-0000-0000-0000-00000000000B';
const FILTER_1_ID = 'F0000000-0000-0000-0000-000000000001';
const FILTER_2_ID = 'F0000000-0000-0000-0000-000000000002';
const USER_ID = 'U0000000-0000-0000-0000-000000000001';

function buildRLSFilter(id: string, filterText: string): RowLevelSecurityFilterInfo {
    return new RowLevelSecurityFilterInfo({ ID: id, Name: `Filter-${id}`, FilterText: filterText, Description: 'Test filter' });
}

function buildPermission(overrides: Partial<EntityPermissionInfo> & { RoleID: string }): EntityPermissionInfo {
    return new EntityPermissionInfo({
        ID: `perm-${overrides.RoleID}`,
        EntityID: ENTITY_ID,
        CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true,
        ReadRLSFilterID: null, CreateRLSFilterID: null, UpdateRLSFilterID: null, DeleteRLSFilterID: null,
        Type: 'Allow',
        ...overrides,
    });
}

function buildUser(roleIds: string[]): UserInfo {
    return new UserInfo(null, {
        ID: USER_ID, Name: 'Test User', Email: 'test@example.com', IsActive: true,
        UserRoles: roleIds.map((rId) => ({ UserID: USER_ID, RoleID: rId, Role: `Role-${rId}` })),
    });
}

function buildEntityInfo(permissions: EntityPermissionInfo[]): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Test Entity', SchemaName: '__mj', BaseTable: 'TestEntity', BaseView: 'vwTestEntities',
        Permissions: permissions.map((p) => ({
            ID: p.ID, EntityID: p.EntityID, RoleID: p.RoleID,
            CanRead: p.CanRead, CanCreate: p.CanCreate, CanUpdate: p.CanUpdate, CanDelete: p.CanDelete,
            ReadRLSFilterID: p.ReadRLSFilterID, CreateRLSFilterID: p.CreateRLSFilterID,
            UpdateRLSFilterID: p.UpdateRLSFilterID, DeleteRLSFilterID: p.DeleteRLSFilterID,
            Type: p.Type,
        })),
        Fields: [],
    });
}

const filter1 = buildRLSFilter(FILTER_1_ID, "OrganizationID = '{{UserOrganizationID}}'");
const filter2 = buildRLSFilter(FILTER_2_ID, "UserID = '{{UserID}}'");

let savedProvider: typeof Metadata.Provider;
beforeAll(() => {
    savedProvider = Metadata.Provider;
    Metadata.Provider = { Entities: [], RowLevelSecurityFilters: [filter1, filter2] } as unknown as ProviderBase;
});
afterAll(() => {
    Metadata.Provider = savedProvider;
});

describe('GetUserRowLevelSecurityInfo collects filters only from rows that GRANT the operation', () => {
    it('a leftover filter on a non-granting row is NOT collected, so it cannot widen the OR', () => {
        const entity = buildEntityInfo([
            buildPermission({ RoleID: ROLE_A_ID, CanCreate: true, CreateRLSFilterID: FILTER_1_ID }),
            buildPermission({ RoleID: ROLE_B_ID, CanCreate: false, CreateRLSFilterID: FILTER_2_ID }), // flag cleared, filter left behind
        ]);
        const user = buildUser([ROLE_A_ID, ROLE_B_ID]);

        const collected = entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Create);
        expect(collected.map((f) => f.ID)).toEqual([FILTER_1_ID]);

        const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Create, '');
        expect(clause).toContain('OrganizationID');
        expect(clause).not.toContain(`UserID = '${USER_ID}'`);
    });

    it('the same leftover on Update and Delete is ignored the same way', () => {
        const entity = buildEntityInfo([
            buildPermission({ RoleID: ROLE_A_ID, UpdateRLSFilterID: FILTER_1_ID, DeleteRLSFilterID: FILTER_1_ID }),
            buildPermission({ RoleID: ROLE_B_ID, CanUpdate: false, CanDelete: false, UpdateRLSFilterID: FILTER_2_ID, DeleteRLSFilterID: FILTER_2_ID }),
        ]);
        const user = buildUser([ROLE_A_ID, ROLE_B_ID]);

        expect(entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Update).map((f) => f.ID)).toEqual([FILTER_1_ID]);
        expect(entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Delete).map((f) => f.ID)).toEqual([FILTER_1_ID]);
    });

    it('a read-only row with a Read filter still contributes that Read filter (granting rows are unchanged)', () => {
        const entity = buildEntityInfo([
            buildPermission({ RoleID: ROLE_A_ID, CanRead: true, CanCreate: false, ReadRLSFilterID: FILTER_2_ID }),
        ]);
        const user = buildUser([ROLE_A_ID]);

        expect(entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Read).map((f) => f.ID)).toEqual([FILTER_2_ID]);
    });

    it('two granting rows still OR their filters together (unchanged behaviour)', () => {
        const entity = buildEntityInfo([
            buildPermission({ RoleID: ROLE_A_ID, CreateRLSFilterID: FILTER_1_ID }),
            buildPermission({ RoleID: ROLE_B_ID, CreateRLSFilterID: FILTER_2_ID }),
        ]);
        const user = buildUser([ROLE_A_ID, ROLE_B_ID]);

        const clause = entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Create, '');
        expect(clause).toContain('OrganizationID');
        expect(clause).toContain(`UserID = '${USER_ID}'`);
        expect(clause).toContain(' OR ');
    });

    it('a user whose only row does not grant the operation collects nothing (the permission gate refuses them anyway)', () => {
        const entity = buildEntityInfo([
            buildPermission({ RoleID: ROLE_B_ID, CanCreate: false, CreateRLSFilterID: FILTER_2_ID }),
        ]);
        const user = buildUser([ROLE_B_ID]);

        expect(entity.GetUserRowLevelSecurityInfo(user, EntityPermissionType.Create)).toEqual([]);
        expect(entity.GetUserPermisions(user).CanCreate).toBe(false);
    });
});

describe('Deny rows never read as grants (their Can* flags are denials)', () => {
    it('a Deny row with CanCreate + a Create filter contributes no filter, even though its flag is set', () => {
        const entity = buildEntityInfo([
            buildPermission({ RoleID: ROLE_A_ID, CanCreate: true, CreateRLSFilterID: FILTER_1_ID }),
            buildPermission({ RoleID: ROLE_B_ID, Type: 'Deny', CanCreate: true, CreateRLSFilterID: FILTER_2_ID }),
        ]);
        const ids = entity.GetUserRowLevelSecurityInfo(buildUser([ROLE_A_ID, ROLE_B_ID]), EntityPermissionType.Create).map((f) => f.ID);
        expect(ids).toEqual([FILTER_1_ID]);
    });

    it('a Deny row with CanRead and no filter does NOT exempt the user from RLS', () => {
        const entity = buildEntityInfo([
            buildPermission({ RoleID: ROLE_A_ID, CanRead: true, ReadRLSFilterID: FILTER_1_ID }),
            buildPermission({ RoleID: ROLE_B_ID, Type: 'Deny', CanRead: true, ReadRLSFilterID: null }),
        ]);
        expect(entity.UserExemptFromRowLevelSecurity(buildUser([ROLE_A_ID, ROLE_B_ID]), EntityPermissionType.Read)).toBe(false);
    });

    it('Type is compared case- and whitespace-insensitively, and a blank Type is Allow', () => {
        expect(buildPermission({ RoleID: ROLE_A_ID, Type: ' DENY ' }).IsDeny).toBe(true);
        expect(buildPermission({ RoleID: ROLE_A_ID, Type: '' }).IsDeny).toBe(false);
        expect(buildPermission({ RoleID: ROLE_A_ID, Type: 'Allow' }).IsDeny).toBe(false);
    });
});
