import { describe, it, expect } from 'vitest';
import type { SourceFieldInfo, ExternalFieldSchema } from '@memberjunction/integration-engine';
import { mergeDeclaredWithSampledFields } from '../index.js';

// Minimal factories — cast partial literals to the engine shapes to keep the tests readable.
const dcl = (p: Partial<SourceFieldInfo> & { Name: string }): SourceFieldInfo =>
    ({ Label: p.Name, SourceType: 'string', IsRequired: false, MaxLength: null, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: false, IsForeignKey: false, ForeignKeyTarget: null, ...p }) as SourceFieldInfo;
const smp = (p: Partial<ExternalFieldSchema> & { Name: string }): ExternalFieldSchema =>
    ({ Label: p.Name, DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false, ...p }) as ExternalFieldSchema;

describe('mergeDeclaredWithSampledFields', () => {
    it('keeps every declared field (never shrinks the declared set)', () => {
        const out = mergeDeclaredWithSampledFields([dcl({ Name: 'id' }), dcl({ Name: 'name' })], [smp({ Name: 'name' })]);
        expect(out.map(f => f.Name)).toEqual(['id', 'name']);
    });

    it('appends sampled-only fields the declaration did not cover (mapped to SourceFieldInfo)', () => {
        const out = mergeDeclaredWithSampledFields([dcl({ Name: 'id' })], [smp({ Name: 'id' }), smp({ Name: 'custom_x', DataType: 'number' })]);
        expect(out.map(f => f.Name)).toEqual(['id', 'custom_x']);
        const cx = out.find(f => f.Name === 'custom_x')!;
        expect(cx.SourceType).toBe('number'); // DataType → SourceType on the mapped sampled field
    });

    it('matches by Name case-insensitively + trimmed (no duplicate; declared identity wins)', () => {
        const out = mergeDeclaredWithSampledFields([dcl({ Name: 'Email' })], [smp({ Name: '  email ' })]);
        expect(out).toHaveLength(1);
        expect(out[0].Name).toBe('Email');
    });

    it('declared attributes win; sampled only fills empty (undefined/null) slots', () => {
        const out = mergeDeclaredWithSampledFields([dcl({ Name: 'a', SourceType: 'string', Description: undefined })], [smp({ Name: 'a', DataType: 'number', Description: 'from sample' })]);
        expect(out[0].SourceType).toBe('string');          // declared value preserved
        expect(out[0].Description).toBe('from sample');     // declared gap filled from sampled
    });

    it('capacity attributes (MaxLength) take the larger value — never shrink a column', () => {
        const out = mergeDeclaredWithSampledFields([dcl({ Name: 'a', MaxLength: 100 })], [smp({ Name: 'a', MaxLength: 250 })]);
        expect(out[0].MaxLength).toBe(250);
    });

    it('does not shrink a declared capacity when the sample is smaller', () => {
        const out = mergeDeclaredWithSampledFields([dcl({ Name: 'a', MaxLength: 400 })], [smp({ Name: 'a', MaxLength: 50 })]);
        expect(out[0].MaxLength).toBe(400);
    });

    it('handles null/undefined/empty inputs without throwing', () => {
        expect(mergeDeclaredWithSampledFields(null, null)).toEqual([]);
        expect(mergeDeclaredWithSampledFields([dcl({ Name: 'id' })], undefined).map(f => f.Name)).toEqual(['id']);
        expect(mergeDeclaredWithSampledFields(undefined, [smp({ Name: 'x' })]).map(f => f.Name)).toEqual(['x']);
    });

    it('does not mutate the declared input', () => {
        const declared = [dcl({ Name: 'a', Description: undefined })];
        mergeDeclaredWithSampledFields(declared, [smp({ Name: 'a', Description: 'x' })]);
        expect(declared[0].Description).toBeUndefined();
    });
});
