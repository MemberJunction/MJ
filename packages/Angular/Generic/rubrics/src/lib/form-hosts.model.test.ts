import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VersionRows } from './model';
import { Frozen } from '@memberjunction/rubrics-base';
import { CategoryParentChoices, HostSnapshot, PriorPublishedVersion } from './form-hosts.model';

describe('rubric form hosts', () => {
    it('does not keep a camelCase parent-choice alias', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'form-hosts.model.ts'), 'utf8');
        expect(source).not.toContain('export function categoryParentChoices');
    });

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
        expect(rows.some(row => row.key === 'scale' && row.marks.some(mark => mark.property === 'NormalizedValue'))).toBe(true);
    });

    it('freezes a level only when a published version uses its scale', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'form-hosts.model.ts'), 'utf8');
        const host = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'form-hosts.component.ts'), 'utf8');
        expect(source).not.toContain('function ScaleIsFrozen');
        expect(host).toContain('Frozen(');
        expect(Frozen(['used'], 'used')).toBe(true);
        expect(Frozen(['USED'], 'used')).toBe(true);
        expect(Frozen(['used'], 'draft-scale')).toBe(false);
    });
});
