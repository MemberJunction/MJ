/**
 * Field-permission reconciliation delta.
 *
 * The contract under test, in one sentence: reconciliation ADDS missing rows at snapshot
 * defaults and REMOVES orphans, and never touches a row that already exists.
 *
 * That last clause is the load-bearing one. An administrator's tightening has to survive every
 * reconciliation — including disable → schema change → re-enable — which is what lets "keep the
 * rows, functionally inactive" on disable and "graceful reconciliation" on re-enable be the
 * same code path.
 */

import { describe, it, expect } from 'vitest';
import { EntityInfo, FieldPermissionAccess } from '@memberjunction/core';
import { ComputeFieldPermissionDelta, IsEmptyFieldPermissionDelta } from '../custom/fieldPermissionDelta';

const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const ID_FIELD_ID = 'F0000000-0000-0000-0000-000000000001';
const SALARY_FIELD_ID = 'F0000000-0000-0000-0000-000000000002';
const NOTES_FIELD_ID = 'F0000000-0000-0000-0000-000000000003';
const SYSTEM_FIELD_ID = 'F0000000-0000-0000-0000-000000000004';

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const FINANCE_ROLE_ID = 'A0000000-0000-0000-0000-000000000002';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';

const ALLOW = FieldPermissionAccess.Allow;
const DENY = FieldPermissionAccess.Deny;
const NONE = FieldPermissionAccess.NoAccess;

type EntityPermissionSeed = {
    RoleID: string;
    Type?: string;
    CanRead?: boolean;
    CanUpdate?: boolean;
    CanCreate?: boolean;
};

type FieldPermissionSeed = {
    ID: string;
    RoleID: string;
    Read?: string;
    Update?: string;
    Create?: string;
};

function entityPermission(seed: EntityPermissionSeed): Record<string, unknown> {
    return {
        ID: `ep-${seed.RoleID}-${seed.Type ?? 'Allow'}`,
        EntityID: ENTITY_ID,
        RoleID: seed.RoleID,
        Type: seed.Type ?? 'Allow',
        CanRead: seed.CanRead ?? false,
        CanUpdate: seed.CanUpdate ?? false,
        CanCreate: seed.CanCreate ?? false,
        CanDelete: false,
    };
}

function fieldPermission(fieldID: string, seed: FieldPermissionSeed): Record<string, unknown> {
    return {
        ID: seed.ID,
        EntityFieldID: fieldID,
        RoleID: seed.RoleID,
        ReadAccess: seed.Read ?? NONE,
        UpdateAccess: seed.Update ?? NONE,
        CreateAccess: seed.Create ?? NONE,
    };
}

function buildEntity(opts: {
    permissions?: Record<string, unknown>[];
    salaryRows?: Record<string, unknown>[];
    notesRows?: Record<string, unknown>[];
    pkRows?: Record<string, unknown>[];
    systemRows?: Record<string, unknown>[];
    entityName?: string;
} = {}): EntityInfo {
    const entityName = opts.entityName ?? 'Employees';
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: entityName,
        SchemaName: '__mj',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        EnableFieldLevelSecurity: true,
        Permissions: opts.permissions ?? [entityPermission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true })],
        Fields: [
            { ID: ID_FIELD_ID, EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: entityName, Type: 'uniqueidentifier', IsPrimaryKey: true, EntityFieldPermissions: opts.pkRows ?? [] },
            { ID: SALARY_FIELD_ID, EntityID: ENTITY_ID, Sequence: 2, Name: 'Salary', Entity: entityName, Type: 'money', EntityFieldPermissions: opts.salaryRows ?? [] },
            { ID: NOTES_FIELD_ID, EntityID: ENTITY_ID, Sequence: 3, Name: 'Notes', Entity: entityName, Type: 'nvarchar', EntityFieldPermissions: opts.notesRows ?? [] },
            { ID: SYSTEM_FIELD_ID, EntityID: ENTITY_ID, Sequence: 4, Name: '__mj_UpdatedAt', Entity: entityName, Type: 'datetimeoffset', EntityFieldPermissions: opts.systemRows ?? [] },
        ],
    });
}

/** The inserted row for a given (field, role), or undefined. */
function insertFor(delta: ReturnType<typeof ComputeFieldPermissionDelta>, fieldID: string, roleID: string) {
    return delta.ToInsert.find(r => r.EntityFieldID === fieldID && r.RoleID.toLowerCase() === roleID.toLowerCase());
}

describe('ComputeFieldPermissionDelta — snapshot initialization', () => {
    it('creates a row for every restrictable field × qualifying role', () => {
        const delta = ComputeFieldPermissionDelta(buildEntity());

        // Salary and Notes for HR; the PK and the __mj_ column get nothing.
        expect(delta.ToInsert).toHaveLength(2);
        expect(insertFor(delta, SALARY_FIELD_ID, HR_ROLE_ID)).toBeDefined();
        expect(insertFor(delta, NOTES_FIELD_ID, HR_ROLE_ID)).toBeDefined();
        expect(insertFor(delta, ID_FIELD_ID, HR_ROLE_ID)).toBeUndefined();
        expect(insertFor(delta, SYSTEM_FIELD_ID, HR_ROLE_ID)).toBeUndefined();
    });

    it('mirrors entity-level permissions, so enabling changes no behavior', () => {
        const entity = buildEntity({
            permissions: [
                entityPermission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true }),
                entityPermission({ RoleID: FINANCE_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: false }),
                entityPermission({ RoleID: INTERN_ROLE_ID, CanRead: true, CanUpdate: false, CanCreate: false }),
            ],
        });
        const delta = ComputeFieldPermissionDelta(entity);

        expect(insertFor(delta, SALARY_FIELD_ID, HR_ROLE_ID)).toMatchObject({
            ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: ALLOW,
        });
        expect(insertFor(delta, SALARY_FIELD_ID, FINANCE_ROLE_ID)).toMatchObject({
            ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: NONE,
        });
        expect(insertFor(delta, SALARY_FIELD_ID, INTERN_ROLE_ID)).toMatchObject({
            ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE,
        });
    });

    it('gives a role with no entity-level READ no rows at all', () => {
        // The entity gate already excludes this role, so rows would be noise — and a row
        // granting Update without Read would violate the Read-required CHECK constraint.
        const entity = buildEntity({
            permissions: [entityPermission({ RoleID: INTERN_ROLE_ID, CanRead: false, CanUpdate: true, CanCreate: true })],
        });

        expect(ComputeFieldPermissionDelta(entity).ToInsert).toHaveLength(0);
    });

    it('never emits a row that would violate the Read-required constraint', () => {
        const entity = buildEntity({
            permissions: [
                entityPermission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true }),
                entityPermission({ RoleID: FINANCE_ROLE_ID, CanRead: true, CanUpdate: false, CanCreate: true }),
                entityPermission({ RoleID: INTERN_ROLE_ID, CanRead: false, CanUpdate: true, CanCreate: true }),
            ],
        });

        for (const row of ComputeFieldPermissionDelta(entity).ToInsert) {
            if (row.UpdateAccess === ALLOW || row.CreateAccess === ALLOW) {
                expect(row.ReadAccess).toBe(ALLOW);
            }
        }
    });

    it('aggregates a role\'s own entity-level Deny before deciding', () => {
        const entity = buildEntity({
            permissions: [
                entityPermission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true }),
                entityPermission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanUpdate: true }),
            ],
        });

        expect(insertFor(ComputeFieldPermissionDelta(entity), SALARY_FIELD_ID, HR_ROLE_ID)).toMatchObject({
            ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: ALLOW,
        });
    });

    it('drops a role entirely when an entity-level Deny removes its read', () => {
        const entity = buildEntity({
            permissions: [
                entityPermission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true }),
                entityPermission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true }),
            ],
        });

        expect(ComputeFieldPermissionDelta(entity).ToInsert).toHaveLength(0);
    });

    it('emits nothing on an unrestrictable entity', () => {
        const entity = buildEntity({ entityName: 'MJ: Entity Field Permissions' });
        const delta = ComputeFieldPermissionDelta(entity);

        expect(delta.ToInsert).toHaveLength(0);
        expect(IsEmptyFieldPermissionDelta(delta)).toBe(true);
    });
});

describe('ComputeFieldPermissionDelta — an existing row is never touched', () => {
    it('leaves an administrator\'s tightening alone', () => {
        const tightened = fieldPermission(SALARY_FIELD_ID, { ID: 'p1', RoleID: HR_ROLE_ID, Read: DENY });
        const entity = buildEntity({ salaryRows: [tightened] });
        const delta = ComputeFieldPermissionDelta(entity);

        // No insert for the pair that already has a row, and nothing to delete either.
        expect(insertFor(delta, SALARY_FIELD_ID, HR_ROLE_ID)).toBeUndefined();
        expect(delta.ToDelete).not.toContain('p1');
    });

    it('is idempotent — a second run after applying the first changes nothing', () => {
        const first = ComputeFieldPermissionDelta(buildEntity());
        const applied = first.ToInsert.map((row, i) => ({
            ID: `applied-${i}`,
            EntityFieldID: row.EntityFieldID,
            RoleID: row.RoleID,
            ReadAccess: row.ReadAccess,
            UpdateAccess: row.UpdateAccess,
            CreateAccess: row.CreateAccess,
        }));

        const second = ComputeFieldPermissionDelta(buildEntity({
            salaryRows: applied.filter(r => r.EntityFieldID === SALARY_FIELD_ID),
            notesRows: applied.filter(r => r.EntityFieldID === NOTES_FIELD_ID),
        }));

        expect(IsEmptyFieldPermissionDelta(second)).toBe(true);
    });

    it('matches role IDs case-insensitively, so casing never fabricates a duplicate', () => {
        const entity = buildEntity({
            salaryRows: [fieldPermission(SALARY_FIELD_ID, { ID: 'p1', RoleID: HR_ROLE_ID.toUpperCase(), Read: ALLOW })],
            notesRows: [fieldPermission(NOTES_FIELD_ID, { ID: 'p2', RoleID: HR_ROLE_ID.toLowerCase(), Read: ALLOW })],
        });
        const delta = ComputeFieldPermissionDelta(entity);

        expect(delta.ToInsert).toHaveLength(0);
        expect(delta.ToDelete).toHaveLength(0);
    });
});

describe('ComputeFieldPermissionDelta — schema and permission changes', () => {
    it('adds rows for a field introduced after enablement', () => {
        // Salary already reconciled; Notes is the new column.
        const entity = buildEntity({
            salaryRows: [fieldPermission(SALARY_FIELD_ID, { ID: 'p1', RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })],
        });
        const delta = ComputeFieldPermissionDelta(entity);

        expect(delta.ToInsert).toHaveLength(1);
        expect(insertFor(delta, NOTES_FIELD_ID, HR_ROLE_ID)).toBeDefined();
        expect(delta.ToDelete).toHaveLength(0);
    });

    it('adds rows for a role granted entity read after enablement', () => {
        const entity = buildEntity({
            permissions: [
                entityPermission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true }),
                entityPermission({ RoleID: FINANCE_ROLE_ID, CanRead: true }),
            ],
            salaryRows: [fieldPermission(SALARY_FIELD_ID, { ID: 'p1', RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })],
            notesRows: [fieldPermission(NOTES_FIELD_ID, { ID: 'p2', RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })],
        });
        const delta = ComputeFieldPermissionDelta(entity);

        // Without this, a role granted entity read after enablement would see zero fields.
        expect(delta.ToInsert).toHaveLength(2);
        expect(insertFor(delta, SALARY_FIELD_ID, FINANCE_ROLE_ID)).toMatchObject({
            ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE,
        });
    });

    it('removes rows for a role that lost entity-level read', () => {
        const entity = buildEntity({
            permissions: [entityPermission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true })],
            salaryRows: [
                fieldPermission(SALARY_FIELD_ID, { ID: 'p1', RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                fieldPermission(SALARY_FIELD_ID, { ID: 'p2-orphan', RoleID: FINANCE_ROLE_ID, Read: ALLOW }),
            ],
            notesRows: [fieldPermission(NOTES_FIELD_ID, { ID: 'p3', RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })],
        });
        const delta = ComputeFieldPermissionDelta(entity);

        expect(delta.ToDelete).toEqual(['p2-orphan']);
        expect(delta.ToInsert).toHaveLength(0);
    });

    it('removes rows that target an unrestrictable field', () => {
        const entity = buildEntity({
            pkRows: [fieldPermission(ID_FIELD_ID, { ID: 'pk-orphan', RoleID: HR_ROLE_ID, Read: DENY })],
            systemRows: [fieldPermission(SYSTEM_FIELD_ID, { ID: 'sys-orphan', RoleID: HR_ROLE_ID, Read: DENY })],
            salaryRows: [fieldPermission(SALARY_FIELD_ID, { ID: 'p1', RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })],
            notesRows: [fieldPermission(NOTES_FIELD_ID, { ID: 'p2', RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })],
        });

        expect(ComputeFieldPermissionDelta(entity).ToDelete.sort()).toEqual(['pk-orphan', 'sys-orphan']);
    });

    it('survives disable → schema change → re-enable without losing a tightening', () => {
        // The rows below are what a disabled entity retains: HR was denied Salary by an admin,
        // and Notes is a column added while field security was off. Re-enabling must add the
        // missing Notes row and leave the Salary denial exactly as it stands.
        const entity = buildEntity({
            salaryRows: [fieldPermission(SALARY_FIELD_ID, { ID: 'tightened', RoleID: HR_ROLE_ID, Read: DENY })],
        });
        const delta = ComputeFieldPermissionDelta(entity);

        expect(delta.ToDelete).toHaveLength(0);
        expect(delta.ToInsert).toHaveLength(1);
        expect(insertFor(delta, NOTES_FIELD_ID, HR_ROLE_ID)).toBeDefined();
    });
});

describe('IsEmptyFieldPermissionDelta', () => {
    it('is true only when neither list has entries', () => {
        expect(IsEmptyFieldPermissionDelta({ ToInsert: [], ToDelete: [] })).toBe(true);
        expect(IsEmptyFieldPermissionDelta({ ToInsert: [], ToDelete: ['x'] })).toBe(false);
        expect(IsEmptyFieldPermissionDelta({
            ToInsert: [{ EntityFieldID: 'f', RoleID: 'r', ReadAccess: ALLOW, UpdateAccess: NONE, CreateAccess: NONE }],
            ToDelete: [],
        })).toBe(false);
    });
});
