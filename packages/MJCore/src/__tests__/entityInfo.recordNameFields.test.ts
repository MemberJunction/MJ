/**
 * `EntityInfo.RecordNameFields` and `EntityInfo.CanUserReadRecordName`: the one record-name rule every reader
 * uses (the database provider's record-name read, and the Record Set Processor's dry-run preview). A name is
 * built from every `IsNameField` field by `Sequence`, else the entity's `NameField`; a user sees it only when
 * every one of those fields is readable to them (whole or not at all).
 */

import { describe, it, expect } from 'vitest';
import { EntityInfo, FieldPermissionAccess } from '../generic/entityInfo';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';

const STAFF = 'B0000000-0000-0000-0000-000000000001';
const INTERN = 'B0000000-0000-0000-0000-000000000002';
const PEOPLE = 'E0000000-0000-0000-0000-0000000000P1';

/** Read access per role for one field. */
function readAccess(fieldId: string, read: Record<string, FieldPermissionAccess>): Record<string, unknown>[] {
    return Object.entries(read).map(([RoleID, ReadAccess], i) => ({
        ID: `${fieldId}-perm-${i}`, EntityFieldID: fieldId, RoleID, ReadAccess,
        UpdateAccess: FieldPermissionAccess.NoAccess, CreateAccess: FieldPermissionAccess.NoAccess,
    }));
}

/** `People`, named "FirstName LastName" (declared out of sequence order); interns are denied LastName. */
function people(fieldSecurity: boolean): EntityInfo {
    return new EntityInfo({
        ID: PEOPLE, Name: 'People', EnableFieldLevelSecurity: fieldSecurity,
        Permissions: [{ EntityID: PEOPLE, RoleID: STAFF, CanRead: true }, { EntityID: PEOPLE, RoleID: INTERN, CanRead: true }],
        Fields: [
            { ID: 'p-id', EntityID: PEOPLE, Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'p-last', EntityID: PEOPLE, Sequence: 3, Name: 'LastName', Type: 'nvarchar', IsNameField: true,
              EntityFieldPermissions: readAccess('p-last', { [STAFF]: FieldPermissionAccess.Allow, [INTERN]: FieldPermissionAccess.Deny }) },
            { ID: 'p-first', EntityID: PEOPLE, Sequence: 2, Name: 'FirstName', Type: 'nvarchar', IsNameField: true,
              EntityFieldPermissions: readAccess('p-first', { [STAFF]: FieldPermissionAccess.Allow, [INTERN]: FieldPermissionAccess.Allow }) },
            { ID: 'p-email', EntityID: PEOPLE, Sequence: 4, Name: 'Email', Type: 'nvarchar',
              EntityFieldPermissions: readAccess('p-email', { [STAFF]: FieldPermissionAccess.Allow, [INTERN]: FieldPermissionAccess.Deny }) },
        ],
    });
}

function user(roleId: string): UserInfo {
    const ID = `user-${roleId}`;
    return new UserInfo(null, { ID, IsActive: true, UserRoles: [new UserRoleInfo({ UserID: ID, RoleID: roleId, Role: roleId })] });
}

describe('EntityInfo.RecordNameFields', () => {
    it('lists every IsNameField field by Sequence', () => {
        expect(people(false).RecordNameFields.map((f) => f.Name)).toEqual(['FirstName', 'LastName']);
    });

    it('falls back to the NameField (a field named Name) when no field is a name field', () => {
        const tags = new EntityInfo({ ID: 'E-T', Name: 'Tags', Fields: [{ Name: 'ID', Type: 'int', IsPrimaryKey: true }, { Name: 'Name', Type: 'nvarchar' }] });
        expect(tags.RecordNameFields.map((f) => f.Name)).toEqual(['Name']);
    });

    it('is empty for an entity without name fields', () => {
        const links = new EntityInfo({ ID: 'E-L', Name: 'Links', Fields: [{ Name: 'ID', Type: 'int', IsPrimaryKey: true }, { Name: 'Weight', Type: 'int' }] });
        expect(links.RecordNameFields).toEqual([]);
    });
});

describe('EntityInfo.CanUserReadRecordName', () => {
    it('lets anyone read names when field security is off', () => {
        expect(people(false).CanUserReadRecordName(user(INTERN))).toBe(true);
        expect(people(false).CanUserReadRecordName(undefined)).toBe(true);
    });

    it('lets a user read a name only when every name field is readable (never part of it)', () => {
        expect(people(true).CanUserReadRecordName(user(STAFF))).toBe(true);
        expect(people(true).CanUserReadRecordName(user(INTERN))).toBe(false);
    });

    it('ignores fields that are not part of the name', () => {
        const entity = people(true);
        entity.Fields.find((f) => f.Name === 'LastName')!.IsNameField = false;
        // the intern may read FirstName, the whole name now; Email stays denied and does not matter
        expect(entity.CanUserReadRecordName(user(INTERN))).toBe(true);
    });

    it('fails closed for a missing user when field security is on', () => {
        expect(people(true).CanUserReadRecordName(undefined)).toBe(false);
        expect(people(true).CanUserReadRecordName(null)).toBe(false);
    });
});
