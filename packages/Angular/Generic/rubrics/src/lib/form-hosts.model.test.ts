import { describe, expect, it } from 'vitest';
import { versionRows } from './model';
import { categoryParentChoices, hostSnapshot, priorPublishedVersion, scaleIsFrozen } from './form-hosts.model';

describe('rubric form hosts', () => {
    it('diffs a version against the one it was based on', () => {
        expect(priorPublishedVersion([
            { id: 'published', status: 'Published', basedOnId: null, major: 1, minor: 0, patch: 0 },
            { id: 'draft', status: 'Draft', basedOnId: 'published', major: 0, minor: 0, patch: 0 },
        ], 'draft')).toBe('published');
    });

    it('hides a category and its descendants from the parent list', () => {
        const choices = categoryParentChoices([
            { id: 'root', name: 'Root', parentId: null },
            { id: 'self', name: 'Self', parentId: 'root' },
            { id: 'child', name: 'Child', parentId: 'self' },
            { id: 'other', name: 'Other', parentId: null },
        ], 'self');
        expect(choices.map(choice => choice.name)).toEqual(['Root', 'Other']);
    });

    it('shows a level value change on the version diff', () => {
        const version = { ID: 'v', RubricID: 'r' };
        const criterion = { ID: 'c', Key: 'facts', Name: 'Facts', ScaleID: 'scale', Weight: 1 };
        const scale = { ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true };
        const level = { ID: 'met', ScaleID: 'scale', Label: 'Met', Value: 1, NormalizedValue: 1, Sequence: 1 };
        const base = hostSnapshot(version, [criterion], [scale], [level], []);
        const shifted = hostSnapshot(version, [criterion], [scale], [{ ...level, NormalizedValue: 0.5 }], []);
        const rows = versionRows(base, shifted);
        expect(rows.some(row => row.key === 'scale' && row.marks.some(mark => mark.includes('NormalizedValue')))).toBe(true);
    });

    it('freezes a level only when a published version uses its scale', () => {
        expect(scaleIsFrozen(['used'], 'used')).toBe(true);
        expect(scaleIsFrozen(['used'], 'draft-scale')).toBe(false);
    });
});
