/**
 * Which described output columns a field-level security restricted caller must not receive, and
 * dropping them from rows.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, FieldPermissionAccess, UserInfo } from '@memberjunction/core';
import type { DescribedColumn } from '../describeStatement';
import { UndescribedColumnNames, WithheldColumnNames, WithholdColumns } from '../fieldSecurity/queryColumnSecurity';

const PEOPLE = 'E0000000-0000-0000-0000-0000000000B1';
const HR = 'R0000000-0000-0000-0000-0000000000B1';
const STAFF = 'R0000000-0000-0000-0000-0000000000B2';

function field(id: string, name: string, sequence: number, roles: string[] | null): Record<string, unknown> {
    const rules = (roles ?? []).map((roleId, i) => ({
        ID: `${id}-${i}`, EntityFieldID: id, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
    return { ID: id, EntityID: PEOPLE, Sequence: sequence, Name: name, Type: 'nvarchar', IsPrimaryKey: name === 'ID', EntityFieldPermissions: rules };
}

const people = new EntityInfo({
    ID: PEOPLE, Name: 'People', SchemaName: 'hr', BaseTable: 'Person', BaseView: 'vwPeople', EnableFieldLevelSecurity: true,
    Permissions: [HR, STAFF].map(RoleID => ({ EntityID: PEOPLE, RoleID, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false })),
    Fields: [field('f-id', 'ID', 1, null), field('f-name', 'Name', 2, [HR, STAFF]), field('f-salary', 'Salary', 3, [HR])],
    AlternateBaseViews: [{ ID: 'abv-1', EntityID: PEOPLE, Name: 'Lite', ViewName: 'vwPeopleLite', SchemaName: 'hr' }],
});
const staff = new UserInfo(undefined, { ID: 'A0000000-0000-0000-0000-0000000000B2', Name: 's', Email: 's@x.com', IsActive: true, UserRoles: [{ UserID: 's', RoleID: STAFF, Role: 'Staff' }] });
const hr = new UserInfo(undefined, { ID: 'A0000000-0000-0000-0000-0000000000B1', Name: 'h', Email: 'h@x.com', IsActive: true, UserRoles: [{ UserID: 'h', RoleID: HR, Role: 'HR' }] });

function column(name: string, source: [string, string, string] | null): DescribedColumn {
    return { Name: name, Ordinal: 1, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(50)', IsNullable: true, IsComputed: source === null,
        Source: source ? { Schema: source[0], Object: source[1], Column: source[2] } : null };
}

describe('WithheldColumnNames', () => {
    it('withholds a column whose source is a denied field, through the base view, base table or an alternate base view', () => {
        const columns = [
            column('ID', ['hr', 'vwPeople', 'ID']), column('Pay', ['HR', 'VWPEOPLE', 'salary']),
            column('T', ['hr', 'Person', 'Salary']), column('L', ['hr', 'vwPeopleLite', 'Salary']), column('Name', ['hr', 'vwPeople', 'Name']),
        ];
        expect([...WithheldColumnNames(columns, [people], [people], staff)].sort()).toEqual(['L', 'Pay', 'T']);
        expect(WithheldColumnNames(columns, [people], [people], hr).size).toBe(0);
    });

    it('withholds an untraced column named like a denied field, and keeps one named otherwise', () => {
        const columns = [column('Salary', null), column('Total', null), column('Salary', ['other', 'vwElsewhere', 'Salary'])];
        expect([...WithheldColumnNames(columns, [people], [people], staff)]).toEqual(['Salary']);
        expect(WithheldColumnNames([column('Total', null)], [people], [people], staff).size).toBe(0);
    });
});

describe('WithholdColumns / UndescribedColumnNames', () => {
    it('drops the withheld columns into new row objects and leaves the input untouched', () => {
        const rows = [Object.freeze({ ID: 1, Salary: 9 })];
        expect(WithholdColumns(rows, new Set(['Salary']))).toEqual([{ ID: 1 }]);
        expect(rows[0]).toEqual({ ID: 1, Salary: 9 });
        expect(WithholdColumns(rows, new Set())).toBe(rows);
    });

    it('names the row columns a description does not list', () => {
        expect([...UndescribedColumnNames([{ ID: 1, Extra: 2 }], [column('ID', null)])]).toEqual(['Extra']);
    });
});
