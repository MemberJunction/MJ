/**
 * The index-restricted field set must name each field under the key a row actually carries.
 *
 * A view row is keyed by the column's `Name`, but an explicit field list selects
 * `[Name] AS [CodeName]` whenever the two differ, so a field named "Manager Notes" comes back keyed
 * `Manager_Notes`. A set holding only names lets that row's value straight into a shared index.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';
import { GetIndexRestrictedFieldNames } from '../generic/indexRestrictedFields';
import { OmitDeniedFieldKeys } from '../generic/entityValueFieldSecurity';

const HR_ROLE = 'A0000000-0000-0000-0000-000000000001';
const STAFF_ROLE = 'A0000000-0000-0000-0000-000000000002';

type Rule = { RoleID: string; ReadAccess: string };

const allowAll: Rule[] = [{ RoleID: HR_ROLE, ReadAccess: 'Allow' }, { RoleID: STAFF_ROLE, ReadAccess: 'Allow' }];
const denyStaff: Rule[] = [{ RoleID: HR_ROLE, ReadAccess: 'Allow' }, { RoleID: STAFF_ROLE, ReadAccess: 'Deny' }];

/** A real EntityInfo whose fields carry the given read rules. `ID` is the primary key. */
function entity(name: string, fields: Record<string, Rule[]>, enableFieldLevelSecurity = true): EntityInfo {
    const entityID = `E-${name}`;
    const fieldRows = [['ID', allowAll] as const, ...Object.entries(fields)].map(([fieldName, rules], i) => ({
        ID: `F-${name}-${fieldName}`,
        EntityID: entityID,
        Sequence: i + 1,
        Name: fieldName,
        Entity: name,
        Type: 'nvarchar',
        IsPrimaryKey: fieldName === 'ID',
        EntityFieldPermissions: rules.map((r) => ({
            ID: `P-${fieldName}-${r.RoleID}`, EntityFieldID: `F-${name}-${fieldName}`, RoleID: r.RoleID,
            ReadAccess: r.ReadAccess, UpdateAccess: 'No Access', CreateAccess: 'No Access',
        })),
    }));
    return new EntityInfo({
        ID: entityID, Name: name, SchemaName: 'dbo', BaseTable: name, BaseView: `vw${name}`,
        EnableFieldLevelSecurity: enableFieldLevelSecurity, Permissions: [], Fields: fieldRows,
    });
}

/** Links `child` to `parent` the way metadata resolution would, without a provider. */
function linkAsChild(child: EntityInfo, parent: EntityInfo): EntityInfo {
    child.ParentID = parent.ID;
    Object.defineProperty(child, 'ParentEntityInfo', { get: () => parent });
    Object.defineProperty(child, 'ParentChain', { get: () => [parent] });
    return child;
}

const REVIEWS = entity('Reviews', { Title: allowAll, 'Manager Notes': denyStaff });

describe('GetIndexRestrictedFieldNames: a field whose Name differs from its CodeName', () => {
    it('names the field under both its Name and its CodeName', () => {
        const field = REVIEWS.FieldByName('Manager Notes');
        expect(field?.CodeName).toBe('Manager_Notes');

        const restricted = GetIndexRestrictedFieldNames(REVIEWS);
        expect(restricted.has('manager notes')).toBe(true);
        expect(restricted.has('manager_notes')).toBe(true);
        expect(restricted.has('title')).toBe(false);
    });

    it('strips a row keyed by CodeName, as an explicit field list returns it', () => {
        const row = { ID: 'r1', Title: 'Engineer', Manager_Notes: 'PIP-CONFIDENTIAL' };
        const kept = OmitDeniedFieldKeys(row, GetIndexRestrictedFieldNames(REVIEWS));
        expect(kept).toEqual({ ID: 'r1', Title: 'Engineer' });
    });

    it('strips a row keyed by Name, as a view row returns it', () => {
        const row = { ID: 'r1', Title: 'Engineer', 'Manager Notes': 'PIP-CONFIDENTIAL' };
        const kept = OmitDeniedFieldKeys(row, GetIndexRestrictedFieldNames(REVIEWS));
        expect(kept).toEqual({ ID: 'r1', Title: 'Engineer' });
    });

    it('names an IS-A child\'s mirror of a restricted parent field under its CodeName too', () => {
        const child = linkAsChild(entity('Senior Reviews', { Title: [], 'Manager Notes': [] }, false), REVIEWS);
        const restricted = GetIndexRestrictedFieldNames(child);
        expect(restricted.has('manager notes')).toBe(true);
        expect(restricted.has('manager_notes')).toBe(true);

        const kept = OmitDeniedFieldKeys({ ID: 'c1', Manager_Notes: 'PIP-CONFIDENTIAL' }, restricted);
        expect(kept).toEqual({ ID: 'c1' });
    });
});
