/**
 * Field-Level (Column-Level) Security — trinary permission aggregation
 *
 * Covers `EntityFieldInfo.GetUserFieldPermissions()` and the entity-level
 * `EntityInfo.EnableFieldLevelSecurity` gate that every enforcement point checks first.
 *
 * Each of Read/Update/Create is `Allow` / `Deny` / `No Access`, aggregated per verb across the
 * roles a user holds as `(any Allow) AND NOT (any Deny)`. `No Access` is the identity and Deny
 * is absorbing, which is what collapses three states to that one expression.
 *
 * Three outcomes that are easy to conflate:
 *   - FLS disabled on the entity        → fully OPEN. The flag is the only switch.
 *   - No records, FLS enabled           → fully CLOSED. Snapshot init guarantees rows exist,
 *                                          so a missing row means reconciliation has not run,
 *                                          and failing closed makes that visible.
 *   - Records exist, none match a role  → fully CLOSED, for want of an Allow.
 *
 * Plus the rule that a row-level CHECK constraint provably cannot enforce: **Read is required
 * for Update and Create.** Two individually legal rows across two roles aggregate to
 * read-denied + update-allowed, so the clamp after aggregation is the actual enforcement.
 *
 * Note what is deliberately absent: any per-USER exemption whatsoever, including for the MJ
 * system user (pinned in fieldSecurity.enforcement.test.ts). Nobody is above a Deny.
 */

import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo, EntityFieldPermissionInfo, FieldPermissionAccess } from '../generic/entityInfo';
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

const ALLOW = FieldPermissionAccess.Allow;
const DENY = FieldPermissionAccess.Deny;
const NONE = FieldPermissionAccess.NoAccess;

/** Every access outcome open — what the policy exits in GetUserFieldPermissions return. */
const FULLY_OPEN = { CanRead: true, CanUpdate: true, CanCreate: true };
/** Every access outcome closed. */
const FULLY_CLOSED = { CanRead: false, CanUpdate: false, CanCreate: false };

// ─── Builders ─────────────────────────────────────────────────────────────

type PermissionSeed = {
    RoleID: string;
    Read?: string;
    Update?: string;
    Create?: string;
};

function permission(seed: PermissionSeed): Record<string, unknown> {
    return {
        ID: `perm-${seed.RoleID}-${seed.Read ?? NONE}`,
        EntityFieldID: SALARY_FIELD_ID,
        RoleID: seed.RoleID,
        ReadAccess: seed.Read ?? NONE,
        UpdateAccess: seed.Update ?? NONE,
        CreateAccess: seed.Create ?? NONE,
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
 * Field security is ENABLED by default — the interesting cases all require it.
 */
function buildEntity(
    salaryPermissions: Record<string, unknown>[],
    entityName: string = 'Employees',
    enableFieldLevelSecurity: boolean = true
): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: entityName,
        SchemaName: '__mj',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        EnableFieldLevelSecurity: enableFieldLevelSecurity,
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
                // Snapshot initialization would give this an Allow row; several tests below
                // depend on it being fully granted so they isolate Salary.
                EntityFieldPermissions: [
                    permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                    permission({ RoleID: FINANCE_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                    permission({ RoleID: INTERN_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                ],
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

/** The common shape: aggregate Salary for a user holding `roles`, FLS on. */
function salaryPerms(entity: EntityInfo, roles: string[]) {
    return salaryField(entity).GetUserFieldPermissions(buildUser(roles), true);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('EntityFieldInfo field-level security', () => {
    describe('metadata loading', () => {
        it('constructs EntityFieldPermissionInfo instances from the metadata payload', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: ALLOW })]);
            const field = salaryField(entity);

            expect(field.FieldPermissions).toHaveLength(1);
            expect(field.FieldPermissions[0]).toBeInstanceOf(EntityFieldPermissionInfo);
            expect(field.FieldPermissions[0].RoleID).toBe(HR_ROLE_ID);
            expect(field.FieldPermissions[0].ReadAccess).toBe(ALLOW);
        });

        it('defaults every verb to No Access, so a row grants nothing by accident', () => {
            const bare = new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID });

            expect(bare.ReadAccess).toBe(NONE);
            expect(bare.UpdateAccess).toBe(NONE);
            expect(bare.CreateAccess).toBe(NONE);
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

    describe('the entity flag is the only switch', () => {
        it('grants full access to a restricted field when field security is DISABLED', () => {
            // Same Deny row as the closed cases below; the flag is what changes the answer.
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })], 'Employees', false);

            expect(salaryField(entity).GetUserFieldPermissions(buildUser([HR_ROLE_ID]), false)).toEqual(FULLY_OPEN);
        });

        it('CLOSES a field with no records when field security is ENABLED', () => {
            // Snapshot initialization guarantees a row exists for every (field, role) that
            // should have one, so a missing row means reconciliation has not run. Fail closed.
            const entity = buildEntity([]);

            expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(FULLY_CLOSED);
        });

        it('closes a field with no records even for a user holding no roles at all', () => {
            const entity = buildEntity([]);

            expect(salaryPerms(entity, [])).toEqual(FULLY_CLOSED);
        });
    });

    describe('records exist but none match the user roles', () => {
        it('blocks all access — no matching Allow, so nothing is granted', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
            ]);

            expect(salaryPerms(entity, [INTERN_ROLE_ID])).toEqual(FULLY_CLOSED);
        });

        it('blocks a role-less user on a configured field', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: ALLOW })]);

            expect(salaryPerms(entity, [])).toEqual(FULLY_CLOSED);
        });
    });

    describe('single-row truth table — all 27 combinations of the three verbs', () => {
        // A single role, a single row. Read gates the other two, so the expectation is
        // mechanical: a verb is granted iff it is Allow AND Read is Allow.
        const states = [ALLOW, DENY, NONE];
        for (const read of states) {
            for (const update of states) {
                for (const create of states) {
                    const readable = read === ALLOW;
                    const expected = {
                        CanRead: readable,
                        CanUpdate: readable && update === ALLOW,
                        CanCreate: readable && create === ALLOW,
                    };
                    it(`Read=${read}, Update=${update}, Create=${create} → ${JSON.stringify(expected)}`, () => {
                        const entity = buildEntity([
                            permission({ RoleID: HR_ROLE_ID, Read: read, Update: update, Create: create }),
                        ]);

                        expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(expected);
                    });
                }
            }
        }
    });

    describe('aggregation across roles — Allow ORs, Deny is absorbing', () => {
        it('ORs Allow across roles: read from one, update from another', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: ALLOW }),
                permission({ RoleID: FINANCE_ROLE_ID, Read: ALLOW, Update: ALLOW }),
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID, FINANCE_ROLE_ID])).toEqual({
                CanRead: true,
                CanUpdate: true,
                CanCreate: false,
            });
        });

        it('treats No Access as neutral — another role\'s Allow still wins', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: NONE, Update: NONE, Create: NONE }),
                permission({ RoleID: FINANCE_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID, FINANCE_ROLE_ID])).toEqual(FULLY_OPEN);
        });

        it('lets one Deny beat any number of Allows', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                permission({ RoleID: FINANCE_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                permission({ RoleID: INTERN_ROLE_ID, Read: DENY }),
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID, FINANCE_ROLE_ID, INTERN_ROLE_ID])).toEqual(FULLY_CLOSED);
        });

        it('denies per verb — an UPDATE Deny does not remove the read grant', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                permission({ RoleID: INTERN_ROLE_ID, Update: DENY }),
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID, INTERN_ROLE_ID])).toEqual({
                CanRead: true,
                CanUpdate: false,
                CanCreate: true,
            });
        });

        it('ignores rows for roles the user does not hold', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                permission({ RoleID: INTERN_ROLE_ID, Read: DENY }),
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(FULLY_OPEN);
        });

        it('a Deny alone, with no Allow anywhere, blocks access', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })]);

            expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(FULLY_CLOSED);
        });
    });

    describe('Read is required for Update and Create — the ACROSS-ROLES clamp', () => {
        it('blocks update when one role grants read+update and another denies read', () => {
            // The case a row-level CHECK constraint cannot catch: both rows are individually
            // legal — the constraint only ever sees one row at a time — yet the aggregate is
            // read-denied + update-allowed. This clamp is the only place the rule holds.
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
                permission({ RoleID: INTERN_ROLE_ID, Read: DENY }),
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID, INTERN_ROLE_ID])).toEqual(FULLY_CLOSED);
        });

        it('blocks update when read simply never resolves to Allow', () => {
            // No Deny anywhere — read is merely un-granted. Update must still fall.
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: NONE, Update: ALLOW, Create: ALLOW }),
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(FULLY_CLOSED);
        });

        it('leaves update and create alone when read DOES resolve to Allow', () => {
            const entity = buildEntity([
                permission({ RoleID: HR_ROLE_ID, Read: DENY }),
                permission({ RoleID: FINANCE_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW }),
            ]);

            // Deny still wins for HR+Finance...
            expect(salaryPerms(entity, [HR_ROLE_ID, FINANCE_ROLE_ID])).toEqual(FULLY_CLOSED);
            // ...but Finance alone keeps everything.
            expect(salaryPerms(entity, [FINANCE_ROLE_ID])).toEqual(FULLY_OPEN);
        });

        it('never produces CanUpdate or CanCreate without CanRead, over the whole 27-cell space', () => {
            const states = [ALLOW, DENY, NONE];
            for (const read of states) {
                for (const update of states) {
                    for (const create of states) {
                        const entity = buildEntity([
                            permission({ RoleID: HR_ROLE_ID, Read: read, Update: update, Create: create }),
                        ]);
                        const p = salaryPerms(entity, [HR_ROLE_ID]);
                        if (!p.CanRead) {
                            expect(p.CanUpdate).toBe(false);
                            expect(p.CanCreate).toBe(false);
                        }
                    }
                }
            }
        });
    });

    describe('unrecognized values fail CLOSED', () => {
        it('treats an unknown access value as No Access rather than as a grant', () => {
            const entity = buildEntity([
                { ...permission({ RoleID: HR_ROLE_ID }), ReadAccess: 'Sure Why Not' },
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(FULLY_CLOSED);
        });

        it('treats null/undefined as No Access', () => {
            const entity = buildEntity([
                { ...permission({ RoleID: HR_ROLE_ID }), ReadAccess: null, UpdateAccess: undefined },
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(FULLY_CLOSED);
        });

        it('normalizes casing and surrounding whitespace', () => {
            const entity = buildEntity([
                { ...permission({ RoleID: HR_ROLE_ID }), ReadAccess: '  aLLoW  ', UpdateAccess: ' DENY ' },
            ]);

            expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual({
                CanRead: true,
                CanUpdate: false,
                CanCreate: false,
            });
        });
    });

    describe('unrestrictable FIELDS — primary keys and system columns', () => {
        it('keeps a primary key fully open even when a Deny targets it', () => {
            const entity = buildEntity([]);
            const pk = entity.FieldByName('ID')!;
            // Attach records directly: the save-time guard rejects these, so reaching the
            // aggregation with them present means they were written outside the entity path.
            pk.FieldPermissions.push(new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, ReadAccess: DENY }));

            expect(pk.IsUnrestrictableField).toBe(true);
            expect(pk.GetUserFieldPermissions(buildUser([HR_ROLE_ID]), true)).toEqual(FULLY_OPEN);
        });

        it('keeps a primary key CREATABLE, not merely readable', () => {
            // Forced open BEFORE aggregation rather than patched after. A half-corrected
            // result (readable but not creatable) would break inserts on entities whose
            // primary key the caller supplies.
            const entity = buildEntity([]);
            const pk = entity.FieldByName('ID')!;
            pk.FieldPermissions.push(new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, ReadAccess: DENY }));

            expect(pk.GetUserFieldPermissions(buildUser([HR_ROLE_ID]), true).CanCreate).toBe(true);
        });

        it('keeps a primary key open for a user matching no role on it', () => {
            const entity = buildEntity([]);
            const pk = entity.FieldByName('ID')!;
            pk.FieldPermissions.push(new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, ReadAccess: ALLOW }));

            expect(pk.GetUserFieldPermissions(buildUser([INTERN_ROLE_ID]), true)).toEqual(FULLY_OPEN);
        });

        it('keeps a __mj_ system column open', () => {
            const entity = buildEntity([]);
            const systemField = entity.FieldByName('__mj_UpdatedAt')!;
            systemField.FieldPermissions.push(new EntityFieldPermissionInfo({ RoleID: HR_ROLE_ID, ReadAccess: DENY }));

            expect(systemField.IsUnrestrictableField).toBe(true);
            expect(systemField.GetUserFieldPermissions(buildUser([HR_ROLE_ID]), true)).toEqual(FULLY_OPEN);
        });

        it('treats a soft primary key the same as a hard one', () => {
            const field = new EntityFieldInfo({
                ID: SALARY_FIELD_ID,
                Name: 'SoftKey',
                Entity: 'Employees',
                IsPrimaryKey: false,
                IsSoftPrimaryKey: true,
                EntityFieldPermissions: [permission({ RoleID: HR_ROLE_ID, Read: DENY })],
            });

            expect(field.IsUnrestrictableField).toBe(true);
            expect(field.GetUserFieldPermissions(buildUser([HR_ROLE_ID]), true)).toEqual(FULLY_OPEN);
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
                const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })], entityName);

                expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(true);
                expect(salaryPerms(entity, [HR_ROLE_ID])).toEqual(FULLY_OPEN);
            });
        }

        it('matches entity names case-insensitively and ignores surrounding whitespace', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })], '  mj: ENTITY field PERMISSIONS  ');

            expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(true);
        });

        it('does NOT exempt an ordinary business entity', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })], 'Employees');

            expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(false);
            expect(salaryPerms(entity, [HR_ROLE_ID]).CanRead).toBe(false);
        });

        it('does NOT exempt an entity whose name merely contains a surface name', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })], 'MJ: Roles Archive');

            expect(salaryField(entity).IsOnUnrestrictableEntity).toBe(false);
        });
    });

    describe('no per-user exemption exists', () => {
        it('denies an Owner-type user exactly as it denies anyone else', () => {
            const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })]);
            const owner = buildUser([HR_ROLE_ID]);
            owner.Type = 'Owner';

            expect(salaryField(entity).GetUserFieldPermissions(owner, true).CanRead).toBe(false);
        });
    });
});

describe('EntityInfo.EnableFieldLevelSecurity', () => {
    it('defaults to false, so an entity that never opted in is unaffected', () => {
        const entity = new EntityInfo({
            ID: ENTITY_ID,
            Name: 'Untouched',
            SchemaName: '__mj',
            BaseTable: 'Untouched',
            BaseView: 'vwUntouched',
            Permissions: [],
            Fields: [],
        });

        expect(entity.EnableFieldLevelSecurity).toBe(false);
    });

    it('is copied off the Entity row rather than derived from the field records', () => {
        // The distinction that matters: rows can exist while the flag is off (retained but
        // inactive), and the flag can be on while a field has no rows (denied, pending
        // reconciliation). Neither implies the other.
        const rowsButDisabled = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: ALLOW })], 'Employees', false);
        const enabledButNoRows = buildEntity([], 'Employees', true);

        expect(rowsButDisabled.EnableFieldLevelSecurity).toBe(false);
        expect(salaryField(rowsButDisabled).HasFieldPermissions).toBe(true);

        expect(enabledButNoRows.EnableFieldLevelSecurity).toBe(true);
        expect(salaryField(enabledButNoRows).HasFieldPermissions).toBe(false);
    });
});

describe('EntityInfo denied-field precompute', () => {
    it('returns an empty set for every verb when field security is disabled', () => {
        const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })], 'Employees', false);
        const user = buildUser([HR_ROLE_ID]);

        expect(entity.GetDeniedReadFields(user).size).toBe(0);
        expect(entity.GetDeniedUpdateFields(user).size).toBe(0);
        expect(entity.GetDeniedCreateFields(user).size).toBe(0);
    });

    it('reports a denied field lowercased, so callers can match case-insensitively', () => {
        const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: DENY })]);

        expect(entity.GetDeniedReadFields(buildUser([HR_ROLE_ID])).has('salary')).toBe(true);
    });

    it('does NOT skip fields that carry no permission records — they are denied', () => {
        // On an FLS-enabled entity a field with no rows is denied, so a lifecycle bug shows up
        // as a visible loss of access rather than a silent loss of protection.
        const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })]);
        const denied = entity.GetDeniedReadFields(buildUser([HR_ROLE_ID]));

        expect(denied.has('salary')).toBe(false); // has an Allow row
        expect(denied.has('notes')).toBe(false); // has an Allow row
        expect(denied.has('id')).toBe(false); // unrestrictable — forced open
        expect(denied.has('__mj_updatedat')).toBe(false); // unrestrictable — forced open
    });

    it('denies an ordinary field that reconciliation never gave a row', () => {
        const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })]);
        // Strip Notes' rows, simulating a field added after the last reconciliation run.
        entity.FieldByName('Notes')!.FieldPermissions.length = 0;

        expect(entity.GetDeniedReadFields(buildUser([HR_ROLE_ID])).has('notes')).toBe(true);
    });

    it('keeps the three verbs distinct', () => {
        const entity = buildEntity([
            permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: NONE, Create: ALLOW }),
        ]);
        const user = buildUser([HR_ROLE_ID]);

        expect(entity.GetDeniedReadFields(user).has('salary')).toBe(false);
        expect(entity.GetDeniedUpdateFields(user).has('salary')).toBe(true);
        expect(entity.GetDeniedCreateFields(user).has('salary')).toBe(false);
    });

    it('denies every verb for a user whose roles match nothing', () => {
        const entity = buildEntity([permission({ RoleID: HR_ROLE_ID, Read: ALLOW, Update: ALLOW, Create: ALLOW })]);
        const stranger = buildUser([INTERN_ROLE_ID]);

        expect(entity.GetDeniedReadFields(stranger).has('salary')).toBe(true);
        expect(entity.GetDeniedUpdateFields(stranger).has('salary')).toBe(true);
        expect(entity.GetDeniedCreateFields(stranger).has('salary')).toBe(true);
    });

    it('is empty for an entity with no fields at all', () => {
        const entity = new EntityInfo({
            ID: ENTITY_ID,
            Name: 'Empty',
            SchemaName: '__mj',
            BaseTable: 'Empty',
            BaseView: 'vwEmpties',
            EnableFieldLevelSecurity: true,
            Permissions: [],
            Fields: [],
        });

        expect(entity.GetDeniedReadFields(buildUser([HR_ROLE_ID])).size).toBe(0);
    });
});
