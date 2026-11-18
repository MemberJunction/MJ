import { describe, it, expect } from 'vitest';

/**
 * The field-security backstop on action parameter values. Uses REAL `EntityInfo`, `UserInfo` and
 * `BaseEntity` from `@memberjunction/core`, so the denied sets come from the same aggregation
 * production uses and a system-identity entity object really holds the full-width row.
 */
import { BaseEntity, EntityInfo, FieldPermissionAccess, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { ActionParam } from '../ActionEngine-Base';
import { ENTITY_ROW_FIELD_KEY_RATIO, IsEntityShapedRow, ProjectActionParamValuesForUser } from '../ActionParamFieldSecurity';

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const SALARY = 987654.32;
const BOTH = [HR_ROLE_ID, INTERN_ROLE_ID];

type FieldSpec = { name: string; type?: string; roles?: string[]; pk?: boolean };

/** An entity with field security on; a field's `roles` are the roles that may read it. */
function entity(id: string, name: string, fields: FieldSpec[], fls = true, readers: string[] = BOTH): EntityInfo {
    return new EntityInfo({
        ID: id, Name: name, SchemaName: 'dbo', BaseTable: name, BaseView: `vw${name}`,
        IncludeInAPI: true, EnableFieldLevelSecurity: fls,
        Permissions: readers.map((RoleID) => ({ EntityID: id, RoleID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true })),
        Fields: fields.map((f, i) => ({
            ID: `${id}-f${i}`, EntityID: id, Sequence: i + 1, Name: f.name, Entity: name, Type: f.type ?? 'nvarchar',
            IsPrimaryKey: !!f.pk, AllowsNull: !f.pk,
            EntityFieldPermissions: (f.roles ?? BOTH).map((RoleID, j) => ({
                ID: `${id}-f${i}-p${j}`, EntityFieldID: `${id}-f${i}`, RoleID,
                ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
            })),
        })),
    });
}

const employees = (fls = true, readers: string[] = BOTH): EntityInfo => entity('ent-emp', 'Employees', [
    { name: 'ID', type: 'uniqueidentifier', pk: true },
    { name: 'Name' },
    { name: 'Salary', type: 'money', roles: [HR_ROLE_ID] },
    { name: 'Base Salary', type: 'money', roles: [HR_ROLE_ID] },
    { name: 'Notes' },
], fls, readers);

/** A second restricted entity sharing `ID`/`Name`, which denies `Notes` instead. */
const contractors = (): EntityInfo => entity('ent-con', 'Contractors', [
    { name: 'ID', type: 'uniqueidentifier', pk: true },
    { name: 'Name' },
    { name: 'Salary', type: 'money' },
    { name: 'Notes', roles: [HR_ROLE_ID] },
]);

function user(roleIds: string[], id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = roleIds.map((RoleID) => new UserRoleInfo({ UserID: id, RoleID, Role: RoleID }));
    return u;
}
const intern = (): UserInfo => user([INTERN_ROLE_ID], 'intern');
const hr = (): UserInfo => user([HR_ROLE_ID], 'hr');

const fullRow = (): Record<string, unknown> => ({ ID: 'emp-1', Name: 'Ada', Salary: SALARY, 'Base Salary': SALARY, Notes: 'n' });

function metadata(...entities: EntityInfo[]) {
    return { Entities: entities, EntityByID: (id: string) => entities.find((e) => e.ID === id) };
}

class EmployeeObject extends BaseEntity {}

/** An entity object loaded with no user: what a system-identity load or an engine cache holds. */
async function systemLoaded(info: EntityInfo): Promise<BaseEntity> {
    const e = new EmployeeObject(info);
    await e.LoadFromData(fullRow());
    return e;
}

const output = (value: unknown): ActionParam[] => [{ Name: 'Result', Type: 'Output', Value: value }];
const valueOf = (params: ActionParam[] | null | undefined): unknown => params?.[0]?.Value;

describe('ProjectActionParamValuesForUser: entity objects', () => {
    it('REGRESSION: a system-loaded entity object loses the denied field for a restricted user', async () => {
        const info = employees();
        const result = ProjectActionParamValuesForUser(output(await systemLoaded(info)), intern(), metadata(info));
        expect(valueOf(result)).toEqual({ ID: 'emp-1', Name: 'Ada', Notes: 'n' });
        expect(JSON.stringify(result)).not.toContain(String(SALARY));
    });

    it('keeps the field for a user allowed to read it', async () => {
        const info = employees();
        const result = ProjectActionParamValuesForUser(output(await systemLoaded(info)), hr(), metadata(info));
        expect(valueOf(result)).toMatchObject({ ID: 'emp-1', Salary: SALARY, 'Base Salary': SALARY });
    });

    it('projects entity objects inside arrays and nested envelopes', async () => {
        const info = employees();
        const value = { Page: 1, Items: [await systemLoaded(info), await systemLoaded(info)] };
        const result = ProjectActionParamValuesForUser(output(value), intern(), metadata(info));
        expect(JSON.stringify(result)).not.toContain(String(SALARY));
        expect((valueOf(result) as { Page: number }).Page).toBe(1);
    });
});

describe('ProjectActionParamValuesForUser: entity objects of an entity the user cannot read', () => {
    it("REGRESSION: by default an unreadable entity object becomes null, never its values", async () => {
        const info = employees(true, [HR_ROLE_ID]);
        const result = ProjectActionParamValuesForUser(output([await systemLoaded(info)]), intern(), metadata(info));
        expect(valueOf(result)).toEqual([null]);
        expect(JSON.stringify(result)).not.toContain('Ada');
    });

    it("'keep' returns an unreadable entity object as it was, for a serializer that drops it", async () => {
        const info = employees(true, [HR_ROLE_ID]);
        const object = await systemLoaded(info);
        const params = output(object);
        const result = ProjectActionParamValuesForUser(params, intern(), metadata(info), { UnreadableEntityObjects: 'keep' });
        expect(result).toBe(params);
    });

    it('a user who can read the entity still gets the projected values', async () => {
        const info = employees(true, [HR_ROLE_ID]);
        const result = ProjectActionParamValuesForUser(output(await systemLoaded(info)), hr(), metadata(info));
        expect(valueOf(result)).toMatchObject({ ID: 'emp-1', Salary: SALARY });
    });
});

describe('ProjectActionParamValuesForUser: plain rows', () => {
    it('REGRESSION: a GetAll()-shaped row of a restricted entity loses the denied field', () => {
        const info = employees();
        const result = ProjectActionParamValuesForUser(output(fullRow()), intern(), metadata(info));
        expect(valueOf(result)).toEqual({ ID: 'emp-1', Name: 'Ada', Notes: 'n' });
    });

    it('matches rows keyed by CodeName and in any case', () => {
        const info = employees();
        const row = { id: 'emp-1', name: 'Ada', Base_Salary: SALARY, SALARY: SALARY };
        const result = ProjectActionParamValuesForUser(output([row]), intern(), metadata(info));
        expect(valueOf(result)).toEqual([{ id: 'emp-1', name: 'Ada' }]);
    });

    it('narrows rows nested in arrays and envelopes, leaving the envelope keys alone', () => {
        const info = employees();
        const value = { TotalRows: 2, Rows: [fullRow(), fullRow()] };
        const result = ProjectActionParamValuesForUser(output(value), intern(), metadata(info));
        expect(valueOf(result)).toEqual({ TotalRows: 2, Rows: [{ ID: 'emp-1', Name: 'Ada', Notes: 'n' }, { ID: 'emp-1', Name: 'Ada', Notes: 'n' }] });
    });

    it('removes the keys denied on ANY restricted entity an ambiguous row matches', () => {
        const row = { ID: 'x', Name: 'Ada', Salary: SALARY, Notes: 'secret note' };
        const result = ProjectActionParamValuesForUser(output(row), intern(), metadata(employees(), contractors()));
        expect(valueOf(result)).toEqual({ ID: 'x', Name: 'Ada' });
    });

    it('never modifies the input', () => {
        const info = employees();
        const params = output(fullRow());
        ProjectActionParamValuesForUser(params, intern(), metadata(info));
        expect(params[0].Value).toEqual(fullRow());
    });
});

describe('ProjectActionParamValuesForUser: values left alone', () => {
    it('leaves an object without the primary key untouched', () => {
        const value = { Salary: SALARY, Name: 'Ada' };
        const params = output(value);
        expect(ProjectActionParamValuesForUser(params, intern(), metadata(employees()))).toBe(params);
    });

    it(`leaves an object untouched when under ${ENTITY_ROW_FIELD_KEY_RATIO * 100}% of its keys are the entity's fields`, () => {
        const value = { ID: 'x', Salary: SALARY, Total: 1, Currency: 'USD', Region: 'EU' };
        const params = output(value);
        expect(ProjectActionParamValuesForUser(params, intern(), metadata(employees()))).toBe(params);
    });

    it('fast path: a user denied nothing gets the same array back', () => {
        const params = output({ Rows: [fullRow()] });
        expect(ProjectActionParamValuesForUser(params, hr(), metadata(employees()))).toBe(params);
    });

    it('fast path: an entity with field security off is never matched', () => {
        const params = output(fullRow());
        expect(ProjectActionParamValuesForUser(params, intern(), metadata(employees(false)))).toBe(params);
    });

    it('returns the parameters unchanged when there is no user', () => {
        const params = output(fullRow());
        expect(ProjectActionParamValuesForUser(params, null, metadata(employees()))).toBe(params);
    });

    it('keeps scalars, dates and class instances as they are', () => {
        const when = new Date();
        const params: ActionParam[] = [
            { Name: 'Count', Type: 'Output', Value: 3 },
            { Name: 'When', Type: 'Output', Value: when },
        ];
        expect(ProjectActionParamValuesForUser(params, intern(), metadata(employees()))).toBe(params);
    });
});

describe('IsEntityShapedRow', () => {
    it('requires the primary key and the key ratio', () => {
        const info = employees();
        expect(IsEntityShapedRow(fullRow(), info)).toBe(true);
        expect(IsEntityShapedRow({ Name: 'Ada', Salary: 1 }, info)).toBe(false);
        expect(IsEntityShapedRow({ ID: 'x', A: 1, B: 2 }, info)).toBe(false);
    });
});
