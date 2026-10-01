import { describe, expect, it } from 'vitest';
import { categoryParentChoices, priorPublishedVersion, scaleIsFrozen } from './form-hosts.model';

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

    it('freezes a level only when a published version uses its scale', () => {
        expect(scaleIsFrozen(['used'], 'used')).toBe(true);
        expect(scaleIsFrozen(['used'], 'draft-scale')).toBe(false);
    });
});
