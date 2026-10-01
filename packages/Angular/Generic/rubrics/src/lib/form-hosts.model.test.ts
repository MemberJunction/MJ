import { describe, expect, it } from 'vitest';
import { VersionRows } from './model';
import { CategoryParentChoices, HostSnapshot, PriorPublishedVersion, ScaleIsFrozen } from './form-hosts.model';

describe('rubric form hosts', () => {
    it('diffs a version against the one it was based on', () => {
        expect(PriorPublishedVersion([
            { Id: 'published', Status: 'Published', BasedOnId: null, Major: 1, Minor: 0, Patch: 0 },
            { Id: 'draft', Status: 'Draft', BasedOnId: 'published', Major: 0, Minor: 0, Patch: 0 },
        ], 'draft')).toBe('published');
    });

    it('hides a category and its descendants from the parent list', () => {
        const choices = CategoryParentChoices([
            { Id: 'root', Name: 'Root', ParentId: null },
            { Id: 'self', Name: 'Self', ParentId: 'root' },
            { Id: 'child', Name: 'Child', ParentId: 'self' },
            { Id: 'other', Name: 'Other', ParentId: null },
        ], 'self');
        expect(choices.map(choice => choice.name)).toEqual(['Root', 'Other']);
    });

    it('shows a level value change on the version diff', () => {
        const version = { ID: 'v', RubricID: 'r' };
        const criterion = { ID: 'c', Key: 'facts', Name: 'Facts', ScaleID: 'scale', Weight: 1 };
        const scale = { ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true };
        const level = { ID: 'met', ScaleID: 'scale', Label: 'Met', Value: 1, NormalizedValue: 1, Sequence: 1 };
        const base = HostSnapshot(version, [criterion], [scale], [level], []);
        const shifted = HostSnapshot(version, [criterion], [scale], [{ ...level, NormalizedValue: 0.5 }], []);
        const rows = VersionRows(base, shifted);
        expect(rows.some(row => row.key === 'scale' && row.marks.some(mark => mark.includes('NormalizedValue')))).toBe(true);
    });

    it('freezes a level only when a published version uses its scale', () => {
        expect(ScaleIsFrozen(['used'], 'used')).toBe(true);
        expect(ScaleIsFrozen(['used'], 'draft-scale')).toBe(false);
    });
});
