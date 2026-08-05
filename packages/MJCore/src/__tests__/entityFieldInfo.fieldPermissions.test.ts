/**
 * Field-Level (Column-Level) Security — permission aggregation tests
 *
 * Covers `EntityFieldInfo.GetUserFieldPermissions()` and the entity-level
 * `EntityInfo.HasAnyFieldPermissions` short-circuit that every enforcement point gates on.
 *
 * The three outcomes that are easiest to conflate, and are therefore tested explicitly:
 *   - No records at all                    → fully OPEN (the backwards-compatible default)
 *   - Records exist, none match the roles  → fully CLOSED (opt-in whitelist)
 *   - Records match                        → Allow-minus-Deny aggregate
 *
 * Plus the two unrestrictable-target guards, which exist so that a configuration cannot be
 * saved that breaks the platform (primary keys / system columns) or that cannot be reversed
 * through the product (the security-configuration and identity surface).
 *
 * Note what is deliberately absent: any per-USER exemption. No user is above a Deny.
 */

import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo, EntityFieldPermissionInfo } from '../generic/entityInfo';
import { UserInfo } from '../generic/securityInfo';

// ─── Constants ────────────────────────────────────────────────────────────

const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const SALARY_FIELD_ID = 'F0000000-0000-0000-0000-000000000001';
const ID_FIELD_ID = 'F0000000-0000-0000-0000-000000000002';
const NOTES_FIELD_ID = 'F0000000-0000-0000-0000-000000000003';
const SYSTEM_FIELD_ID = 'F0000000-0000-0000-0000-000000000004';

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const FINANCE_ROLE_ID = 'A0000000-0000-0000-0000-000000000002';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const USER_ID = 'C0000000-0000-0000-0000-000000000001';

// ─── Builders ─────────────────────────────────────────────────────────────

type PermissionSeed = {
    RoleID: string;
    Type?: string;
    CanRead?: boolean;
    CanUpdate?: boolean;
};

function permission(seed: PermissionSeed): Record<string, unknown> {
    return {
        ID: `perm-${seed.RoleID}-${seed.Type ?? 'Allow'}`,
        EntityFieldID: SALARY_FIELD_ID,
        RoleID: seed.RoleID,
        Type: seed.Type ?? 'Allow',
        CanRead: seed.CanRead ?? false,
        CanUpdate: seed.CanUpdate ?? false,
        CanCreate: false,
    };
}

function buildUser(roleIds: string[]): UserInfo {
    return new UserInfo(null, {
        ID: USER_ID,
        Name: 'Test User',
        Email: 'test@example.com',
        IsActive: true,
        UserRoles: roleIds.map((rId) => ({ UserID: USER_ID, RoleID: rId, Role: `Role-${rId}` })),
    });
}

/**
 * Builds an entity whose `Salary` field carries the supplied permission records.
 * `entityName` drives the unrestrictable-ENTITY guard; `Employees` is restrictable.
 */
function buildEntity(
    salaryPermissions: Record<string, unknown>[],
    entityName: string = 'Employees'
): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: entityName,
        SchemaName: '__mj',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        Permissions: [],
        Fields: [
            {
                ID: ID_FIELD_ID,
                EntityID: ENTITY_ID,
                Sequence: 1,
                Name: 'ID',
                Entity: entityName,
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                EntityFieldPermissions: [],
            },
            {
                ID: SALARY_FIELD_ID,
                EntityID: ENTITY_ID,
                Sequence: 2,
                Name: 'Salary',
                Entity: entityName,
                Type: 'money',
                IsPrimaryKey: false,
                EntityFieldPermissions: salaryPermissions,
            },
            {
                ID: NOTES_FIELD_ID,
                EntityID: ENTITY_ID,
                Sequence: 3,
                Name: 'Notes',
                Entity: entityName,
                Type: 'nvarchar',
                IsPrimaryKey: false,
                EntityFieldPermissions: [],
            },
            {
                ID: SYSTEM_FIELD_ID,
                EntityID: ENTITY_ID,
                Sequence: 4,
                Name: '__mj_UpdatedAt',
                Entity: entityName,
                Type: 'datetimeoffset',
                IsPrimaryKey: false,
                EntityFieldPermissions: [],
            },
        ],
    });
}

function salaryField(entity: EntityInfo): EntityFieldInfo {
    return entity.FieldByName('Salary')!;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('EntityFieldInfo field-level security', () => {
    describe('metadata loading', () => {
        it('constructs EntityFieldPermissionInfo instances from the metadata payload', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: true })]);
            const field = salaryField(entity);

            expect(field.FieldPermissions).toHaveLength(1);
            expect(field.FieldPermissions[0]).toBeInstanceOf(EntityFieldPermissionInfo);
            expect(field.FieldPermissions[0].RoleID).toBe(HR_ROLE_ID);
            expect(field.FieldPermissions[0].CanRead).toBe(true);
        });

        it('leaves FieldPermissions empty when the payload omits the key entirely', () => {
            // A database without the EntityFieldPermissions dataset item ships no such array.
            const entity = new EntityInfo({
                ID: ENTITY_ID,
                Name: 'Employees',
                SchemaName: '__mj',
                BaseTable: 'Employee',
                BaseView: 'vwEmployees',
                Permissions: [],
                Fields: [{ ID: SALARY_FIELD_ID, EntityID: ENTITY_ID, Sequence: 1, Name: 'Salary', Entity: 'Employees' }],
            });

            expect(salaryField(entity).FieldPermissions).toEqual([]);
            expect(salaryField(entity).HasFieldPermissions).toBe(false);
        });
    });

    describe('default-open when no records exist', () => {
        it('grants full access to a field with no permission records', () => {
            const entity = buildEntity([]);
            const perms = salaryField(entity).GetUserFieldPermissions(buildUser([INTERN_ROLE_ID]));

            expect(perms).toEqual({ CanRead: true, CanUpdate: true });
        });

        it('grants full access to a sibling field even when another field IS secured', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: true })]);
            const notes = entity.FieldByName('Notes')!;

            expect(notes.GetUserFieldPermissions(buildUser([INTERN_ROLE_ID]))).toEqual({
                CanRead: true,
                CanUpdate: true,
            });
        });

        it('grants full access when the user holds no roles at all', () => {
            const entity = buildEntity([]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([]))).toEqual({
                CanRead: true,
                CanUpdate: true,
            });
        });
    });

    describe('records exist but none match the user roles', () => {
        it('blocks all access — a configured field is an opt-in whitelist', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true })]);
            const perms = salaryField(entity).GetUserFieldPermissions(buildUser([INTERN_ROLE_ID]));

            expect(perms).toEqual({ CanRead: false, CanUpdate: false });
        });

        it('blocks a role-less user on a configured field', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: true })]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([]))).toEqual({
                CanRead: false,
                CanUpdate: false,
            });
        });
    });

    describe('Allow aggregation (OR across roles)', () => {
        it('grants read to a role holding an explicit Allow', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true })]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                CanRead: true,
                CanUpdate: true,
            });
        });

        it('ORs Allow flags across multiple roles — read from one, update from another', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: false }),
                permission({ RoleID: FINANCE_ROLE_ID, CanRead: false, CanUpdate: true }),
            ]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID, FINANCE_ROLE_ID]))).toEqual({
                CanRead: true,
                CanUpdate: true,
            });
        });

        it('ignores Allow rows for roles the user does not hold', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true }),
                permission({ RoleID: FINANCE_ROLE_ID, CanRead: true, CanUpdate: true }),
            ]);

            // Holds HR only — but a matching row exists, so this is the aggregate, not the closed default.
            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                CanRead: true,
                CanUpdate: true,
            });
        });

        it('grants nothing when the only matching Allow row has every flag off', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: false, CanUpdate: false })]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                CanRead: false,
                CanUpdate: false,
            });
        });

        it('treats a missing/unknown Type as Allow, for rows written before the column existed', () => {
            const entity = buildEntity([
                { ...permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true }), Type: null },
            ]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                CanRead: true,
                CanUpdate: true,
            });
        });
    });

    describe('Deny wins', () => {
        it('subtracts a Deny from an Allow held through the same role', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true }),
                permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true }),
            ]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                CanRead: false,
                CanUpdate: true,
            });
        });

        it('subtracts a Deny from one role against an Allow from another role', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true }),
                permission({ RoleID: INTERN_ROLE_ID, Type: 'Deny', CanRead: true, CanUpdate: true }),
            ]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID, INTERN_ROLE_ID]))).toEqual({
                CanRead: false,
                CanUpdate: false,
            });
        });

        it('denies per-flag — a read Deny does not remove an update grant', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true }),
                permission({ RoleID: INTERN_ROLE_ID, Type: 'Deny', CanRead: true, CanUpdate: false }),
            ]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID, INTERN_ROLE_ID]))).toEqual({
                CanRead: false,
                CanUpdate: true,
            });
        });

        it('ignores a Deny row for a role the user does not hold', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true }),
                permission({ RoleID: INTERN_ROLE_ID, Type: 'Deny', CanRead: true, CanUpdate: true }),
            ]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                CanRead: true,
                CanUpdate: true,
            });
        });

        it('normalizes Type casing and padding — nchar columns arrive padded', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true }),
                { ...permission({ RoleID: HR_ROLE_ID, CanRead: true }), Type: '  DENY  ' },
            ]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID])).CanRead).toBe(false);
        });

        it('a Deny alone (no Allow) blocks access', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true })]);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                CanRead: false,
                CanUpdate: false,
            });
        });
    });

    describe('unrestrictable FIELDS — primary keys and system columns', () => {
        it('keeps a primary key readable even when a Deny targets it', () => {
            const entity = buildEntity([]);
            const pk = entity.FieldByName('ID')!;
            // Attach records directly: the save-time guard rejects these, so reaching the
            // aggregation with them present means they were written outside the entity path.
            pk.FieldPermissions.push(
                new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true, CanUpdate: true })
            );

            expect(pk.IsUnrestrictableField).toBe(true);
            expect(pk.GetUserFieldPermissions(buildUser([HR_ROLE_ID])).CanRead).toBe(true);
        });

        it('keeps a primary key readable for a user matching no role on it', () => {
            const entity = buildEntity([]);
            const pk = entity.FieldByName('ID')!;
            pk.FieldPermissions.push(new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, CanRead: true }));

            expect(pk.GetUserFieldPermissions(buildUser([INTERN_ROLE_ID])).CanRead).toBe(true);
        });

        it('still applies the update restriction to a primary key — only READ is forced open', () => {
            const entity = buildEntity([]);
            const pk = entity.FieldByName('ID')!;
            pk.FieldPermissions.push(
                new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true, CanUpdate: true })
            );

            expect(pk.GetUserFieldPermissions(buildUser([HR_ROLE_ID])).CanUpdate).toBe(false);
        });

        it('keeps a __mj_ system column readable', () => {
            const entity = buildEntity([]);
            const systemField = entity.FieldByName('__mj_UpdatedAt')!;
            systemField.FieldPermissions.push(
                new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true })
            );

            expect(systemField.IsUnrestrictableField).toBe(true);
            expect(systemField.GetUserFieldPermissions(buildUser([HR_ROLE_ID])).CanRead).toBe(true);
        });

        it('treats a soft primary key the same as a hard one', () => {
            const field = new EntityFieldInfo({
                ID: SALARY_FIELD_ID,
                Name: 'SoftKey',
                Entity: 'Employees',
                IsPrimaryKey: false,
                IsSoftPrimaryKey: true,
                EntityFieldPermissions: [permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true })],
            });

            expect(field.IsUnrestrictableField).toBe(true);
            expect(field.GetUserFieldPermissions(buildUser([HR_ROLE_ID])).CanRead).toBe(true);
        });

        it('does not treat an ordinary field as unrestrictable', () => {
            const entity = buildEntity([]);

            expect(salaryField(entity).IsUnrestrictableField).toBe(false);
            expect(entity.FieldByName('Notes')!.IsUnrestrictableField).toBe(false);
        });
    });

    describe('unrestrictable ENTITIES — the security-configuration and identity surface', () => {
        const surface = [
            'MJ: Entities',
            'MJ: Entity Fields',
            'MJ: Entity Permissions',
            'MJ: Entity Field Permissions',
            'MJ: Roles',
            'MJ: Users',
            'MJ: User Roles',
        ];

        for (const entityName of surface) {
            it(`ignores permission records on '${entityName}'`, () => {
                const entity = buildEntity(
                    [permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true, CanUpdate: true })],
                    entityName
                );

                expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(true);
                expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]))).toEqual({
                    CanRead: true,
                    CanUpdate: true,
                });
            });
        }

        it('matches entity names case-insensitively and ignores surrounding whitespace', () => {
            const entity = buildEntity(
                [permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true })],
                '  mj: ENTITY field PERMISSIONS  '
            );

            expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(true);
        });

        it('does NOT exempt an ordinary business entity', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true })], 'Employees');

            expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(false);
            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID])).CanRead).toBe(false);
        });

        it('does NOT exempt an entity whose name merely contains a surface name', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true })], 'MJ: Roles Archive');

            expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(false);
        });
    });

    describe('no per-user exemption exists', () => {
        it('denies an Owner-type user exactly as it denies anyone else', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Type: 'Deny', CanRead: true })]);
            const owner = buildUser([HR_ROLE_ID]);
            owner.Type = 'Owner';

            expect(salaryField(entity).GetUserFieldPermissions(owner).CanRead).toBe(false);
        });
    });
});

describe('EntityInfo.HasAnyFieldPermissions', () => {
    it('is false when no field on the entity has records — the enforcement short-circuit', () => {
        expect(buildEntity([]).HasAnyFieldPermissions).toBe(false);
    });

    it('is true when at least one field has records', () => {
        expect(buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: true })]).HasAnyFieldPermissions).toBe(true);
    });

    it('memoizes the result across repeated reads', () => {
        const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, CanRead: true })]);
        const fields = entity.Fields;
        const spy = fields.map((f) => f);

        expect(entity.HasAnyFieldPermissions).toBe(true);
        // Emptying the underlying arrays after the first read must not change the memoized answer;
        // metadata is immutable after load, and enforcement paths read this on every request.
        for (const f of spy) {
            f.FieldPermissions.length = 0;
        }
        expect(entity.HasAnyFieldPermissions).toBe(true);
    });

    it('is false for an entity with no fields at all', () => {
        const entity = new EntityInfo({
            ID: ENTITY_ID,
            Name: 'Empty',
            SchemaName: '__mj',
            BaseTable: 'Empty',
            BaseView: 'vwEmpties',
            Permissions: [],
            Fields: [],
        });

        expect(entity.HasAnyFieldPermissions).toBe(false);
    });
});
