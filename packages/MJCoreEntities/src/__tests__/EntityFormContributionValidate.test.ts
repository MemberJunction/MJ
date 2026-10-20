import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { MJEntityFormContributionEntity } from '../generated/entities/__mj';

/**
 * `MJEntityFormContributionEntity.Validate()` runs every table-level CHECK on the row in code, so a
 * bad row fails before it reaches the database and the error names the field to fix.
 */

const CONTRIBUTION_FIELDS = [
    'ID', 'EntityID', 'ComponentID', 'Name', 'Slot', 'Presentation', 'Inclusion', 'ChromeGroup',
    'RelatedEntityID', 'RelatedJoinField', 'ReplacesSectionKey', 'ReplacesSectionKeys', 'ReplacesFieldNames',
    'InSectionKey', 'SectionPosition', 'Scope', 'UserID', 'RoleID', 'Status',
];

/**
 * Every column is nullable and typed nvarchar, so the base field checks pass and only the
 * contribution's own validators can fail.
 */
function contributionEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: 'entity-form-contributions',
        Name: 'MJ: Entity Form Contributions',
        Status: 'Active',
        EntityFields: CONTRIBUTION_FIELDS.map((name, i) => ({
            ID: `f-${name}`,
            EntityID: 'entity-form-contributions',
            Name: name,
            Type: 'nvarchar',
            Length: 510,
            AllowsNull: true,
            IsPrimaryKey: name === 'ID',
            AllowUpdateAPI: true,
            ValueListType: 'None',
            Sequence: i + 1,
            Status: 'Active',
            EntityFieldValues: [],
        })),
        EntityPermissions: [],
        EntityRelationships: [],
        EntitySettings: [],
    });
}

/** A valid Global panel row; each test breaks one rule. */
function validRow(): MJEntityFormContributionEntity {
    const row = new MJEntityFormContributionEntity(contributionEntityInfo());
    row.Name = 'Lifetime value';
    row.Slot = 'after-fields';
    row.Presentation = 'panel';
    row.Scope = 'Global';
    row.Status = 'Active';
    return row;
}

function errorFields(row: MJEntityFormContributionEntity): string[] {
    return row.Validate().Errors.map(e => e.Source);
}

describe('MJEntityFormContributionEntity.Validate', () => {
    it('passes a valid row', () => {
        const result = validRow().Validate();
        expect(result.Errors).toEqual([]);
        expect(result.Success).toBe(true);
    });

    it('fails a bare row that sets Inclusion, naming Presentation', () => {
        const row = validRow();
        row.Presentation = 'bare';
        row.Inclusion = 'Primary';
        const result = row.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map(e => e.Source)).toEqual(['Presentation']);
    });

    it('fails a join field with no related entity, naming RelatedEntityID', () => {
        const row = validRow();
        row.RelatedJoinField = 'PersonID';
        const result = row.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map(e => e.Source)).toEqual(['RelatedEntityID']);
    });

    it('fails a User row with no user, naming UserID', () => {
        const row = validRow();
        row.Scope = 'User';
        expect(errorFields(row)).toEqual(['UserID']);
    });

    it('fails a section position with no section claim, naming SectionPosition', () => {
        const row = validRow();
        row.SectionPosition = 'end';
        expect(errorFields(row)).toEqual(['SectionPosition']);
    });
});
