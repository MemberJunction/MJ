/**
 * The merge rules are where unconditional sampling can do damage: get one backwards and a
 * deliberate declaration is silently overwritten by an inference drawn from a handful of rows.
 * Every rule has a test asserting the direction, not just the mechanism.
 */
import { describe, it, expect } from 'vitest';
import { MergeLength, MergeDeclaredWithSample } from '../DeclaredSampleMerge.js';
import type { ExternalFieldSchema } from '../BaseIntegrationConnector.js';

const field = (Name: string, over: Partial<ExternalFieldSchema> = {}): ExternalFieldSchema => ({
    Name, Label: Name, DataType: 'string', IsRequired: false, AllowsNull: true,
    MaxLength: null, IsPrimaryKey: false, IsUniqueKey: false, IsReadOnly: false, IsForeignKey: false,
    ...over,
} as ExternalFieldSchema);

describe('MergeLength', () => {
    it('takes the larger of two bounded widths', () => {
        expect(MergeLength(100, 900)).toBe(900);
        expect(MergeLength(900, 100)).toBe(900);
    });

    it('NEVER shrinks — the one outcome that loses data', () => {
        expect(MergeLength(4000, 12)).toBe(4000);
    });

    it('unbounded beats any measured width, from either side', () => {
        // A declared `text` is a deliberate statement that no width is safe; an observation past
        // the bounded ceiling is the data saying the same thing.
        expect(MergeLength(null, 50)).toBeNull();
        expect(MergeLength(50, null)).toBeNull();
    });

    it('yields to whichever side actually has an opinion', () => {
        expect(MergeLength(undefined, 120)).toBe(120);
        expect(MergeLength(120, undefined)).toBe(120);
        expect(MergeLength(undefined, undefined)).toBeUndefined();
    });
});

describe('MergeDeclaredWithSample', () => {
    it('widens a declared field the data outgrew, and reports it', () => {
        const out = MergeDeclaredWithSample([field('about', { MaxLength: 100 })], [field('about', { MaxLength: 900 })]);
        expect(out.Fields[0].MaxLength).toBe(900);
        expect(out.WidenedFieldNames).toEqual(['about']);
    });

    it('leaves a declared field alone when the data fits inside it', () => {
        const out = MergeDeclaredWithSample([field('code', { MaxLength: 50 })], [field('code', { MaxLength: 4 })]);
        expect(out.Fields[0].MaxLength).toBe(50);
        expect(out.WidenedFieldNames).toEqual([]);
    });

    it('ADDS a field the source sends but never documented', () => {
        // The whole point: the column exists at RSU time instead of arriving through overflow
        // one sync later.
        const out = MergeDeclaredWithSample([field('id')], [field('id'), field('undocumented', { MaxLength: 30 })]);
        expect(out.AddedFieldNames).toEqual(['undocumented']);
        expect(out.Fields.map(f => f.Name)).toEqual(['id', 'undocumented']);
    });

    it('appends rather than interleaves, so declared order still reads against the catalog', () => {
        const out = MergeDeclaredWithSample([field('b'), field('a')], [field('zzz'), field('a'), field('b')]);
        expect(out.Fields.map(f => f.Name)).toEqual(['b', 'a', 'zzz']);
    });

    it('never overwrites a declared description, label or type from a sample', () => {
        const declared = [field('note', { Description: 'written down', Label: 'Note', DataType: 'text' })];
        const observed = [field('note', { Description: 'guessed', Label: 'NOTE', DataType: 'string' })];
        const out = MergeDeclaredWithSample(declared, observed);
        expect(out.Fields[0].Description).toBe('written down');
        expect(out.Fields[0].Label).toBe('Note');
        expect(out.Fields[0].DataType).toBe('text');
    });

    it('a DECLARED key wins outright, even when the sample nominates another column', () => {
        // The one question a declaration can genuinely pre-answer. Overriding it is how a child
        // table ends up keyed on its parent FK.
        const declared = [field('realKey', { IsPrimaryKey: true }), field('parent_id')];
        const observed = [field('realKey'), field('parent_id', { IsPrimaryKey: true })];
        const out = MergeDeclaredWithSample(declared, observed);
        expect(out.Fields.find(f => f.Name === 'realKey')!.IsPrimaryKey).toBe(true);
        expect(out.Fields.find(f => f.Name === 'parent_id')!.IsPrimaryKey).toBe(false);
        expect(out.AdoptedKeyNames).toEqual([]);
    });

    it('adopts an observed key ONLY when the declaration named none', () => {
        const out = MergeDeclaredWithSample([field('rowId'), field('name')], [field('rowId', { IsPrimaryKey: true })]);
        expect(out.Fields.find(f => f.Name === 'rowId')!.IsPrimaryKey).toBe(true);
        expect(out.AdoptedKeyNames).toEqual(['rowId']);
    });

    it('refuses to make an ADDED field the key when one was already declared', () => {
        const declared = [field('realKey', { IsPrimaryKey: true })];
        const observed = [field('surprise', { IsPrimaryKey: true })];
        const out = MergeDeclaredWithSample(declared, observed);
        expect(out.Fields.find(f => f.Name === 'surprise')!.IsPrimaryKey).toBe(false);
        expect(out.AdoptedKeyNames).toEqual([]);
    });

    it('matches fields case-insensitively, as the rest of the pipeline does', () => {
        const out = MergeDeclaredWithSample([field('Email', { MaxLength: 50 })], [field('email', { MaxLength: 320 })]);
        expect(out.Fields).toHaveLength(1);
        expect(out.Fields[0].Name).toBe('Email');
        expect(out.Fields[0].MaxLength).toBe(320);
    });

    it('an empty sample changes nothing at all', () => {
        const declared = [field('a', { MaxLength: 10 }), field('b', { IsPrimaryKey: true })];
        const out = MergeDeclaredWithSample(declared, []);
        expect(out.Fields).toEqual(declared);
        expect(out.AddedFieldNames).toEqual([]);
        expect(out.WidenedFieldNames).toEqual([]);
    });
});
