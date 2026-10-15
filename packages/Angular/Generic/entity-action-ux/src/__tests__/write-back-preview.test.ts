import { describe, it, expect } from 'vitest';
import type { WriteBackResult } from '@memberjunction/record-set-processor-base';
import { WriteBackPreviewModel } from '../lib/write-back-preview';

const base: WriteBackResult = { updatedRecord: false, changed: false, dryRun: true };

describe('WriteBackPreviewModel.Build', () => {
    it('shows the engine\'s field changes as they are, old value included', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewFieldChanges: [{ Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold' }] });

        expect(Changes).toEqual([{ Field: 'Tier', OldValue: 'Silver', NewValue: 'Gold', Applied: true, Changed: true }]);
    });

    it('shows inserts, updates and removals of child rows, and nothing for a row the write leaves alone', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewChildChanges: [
            { Entity: 'Skill', Action: 'insert', Values: { PersonID: 'ID-1', Name: 'Go' } },
            { Entity: 'Skill', Action: 'update', Values: { Level: 4 } },
            { Entity: 'Skill', Action: 'delete', Values: { Name: 'Perl' } },
            { Entity: 'Skill', Action: 'none', Values: { Name: 'SQL' } },
        ] });

        expect(Changes.map((c) => [c.Field, c.NewValue])).toEqual([['New Skill', 'Name: Go'], ['Update Skill', 'Level: 4'], ['Remove Skill', 'Name: Perl']]);
    });

    it('shows a tag link the record lacks and a new tag, not one already linked or one constrained growth cannot place', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewTags: [
            { tagText: 'vip', resolvedTagName: 'VIP', matched: true, created: false, rootTagID: 'r' },
            { tagText: 'old', resolvedTagName: 'Old', matched: true, created: false, rootTagID: 'r', alreadyLinked: true, reweighted: false },
            { tagText: 'fresh', matched: false, created: true, rootTagID: 'r' },
            { tagText: 'unplaced', matched: false, created: false, rootTagID: 'r' },
        ] });

        expect(Changes.map((c) => c.NewValue)).toEqual(['VIP', 'fresh (new tag)']);
    });

    it('gives a record whose real write would fail its errors and no changes', () => {
        const rows = WriteBackPreviewModel.Build('id-1', { ...base, PreviewErrors: ['no such row'], previewFieldChanges: [{ Field: 'Tier', OldValue: 'a', NewValue: 'b' }] });

        expect(rows).toEqual({ Changes: [], Errors: ['no such row'], Withheld: [] });
    });

    it('lists each withheld output as a line, apart from the changes (a kept NOT NULL field and a skipped child mapping say so)', () => {
        const rows = WriteBackPreviewModel.Build('id-1', { ...base,
            previewFieldChanges: [{ Field: 'SeniorityLevelID', OldValue: 'lvl-1', NewValue: null }],
            withheldFields: ['SeniorityLevelID', 'Grade'], withheldKeptFields: ['grade'], withheldChildEntities: ['Person Job Functions'],
        });

        expect(rows.Changes).toEqual([{ Field: 'SeniorityLevelID', OldValue: 'lvl-1', NewValue: null, Applied: true, Changed: true }]);
        expect(rows.Withheld).toEqual([
            'SeniorityLevelID: withheld (below confidence)',
            'Grade: withheld (below confidence); kept, the column does not allow null',
            'Person Job Functions: withheld (below confidence); rows unchanged',
        ]);
    });

    it('carries the names the engine read for a foreign-key field change, keeping the IDs as the values (F14)', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewFieldChanges: [
            { Field: 'SeniorityLevelID', OldValue: 'lvl-1', NewValue: 'lvl-2', OldValueName: 'Senior', NewValueName: 'Director' },
        ] });

        expect(Changes).toEqual([{ Field: 'SeniorityLevelID', OldValue: 'lvl-1', NewValue: 'lvl-2', OldValueName: 'Senior', NewValueName: 'Director', Applied: true, Changed: true }]);
    });

    it('names a child row\'s foreign-key values, keeping its IDs for the hover text (F14)', () => {
        const { Changes } = WriteBackPreviewModel.Build('person-1', { ...base, previewChildChanges: [
            { Entity: 'Person Job Functions', Action: 'insert', Values: { PersonID: 'person-1', JobFunctionID: 'jf-7', Sequence: 1 },
                ValueNames: { PersonID: 'Alex Kim', JobFunctionID: 'Engineering' } },
            { Entity: 'Person Job Functions', Action: 'insert', Values: { JobFunctionID: 'jf-8' } },
        ] });

        expect(Changes[0]).toMatchObject({ Field: 'New Person Job Functions', NewValue: 'JobFunctionID: jf-7; Sequence: 1', NewValueName: 'JobFunctionID: Engineering; Sequence: 1' });
        expect(Changes[1].NewValue).toBe('JobFunctionID: jf-8');
        expect(Changes[1].NewValueName).toBeUndefined();
    });

    it('shows a child row\'s fields by their labels, keeping the field names for the hover text', () => {
        const { Changes } = WriteBackPreviewModel.Build('person-1', { ...base, previewChildChanges: [
            { Entity: 'Person Job Functions', Action: 'insert', Values: { JobFunctionID: 'jf-7', Sequence: 1 }, ValueNames: { JobFunctionID: 'Engineering' } },
        ] }, (entity, field) => (entity === 'Person Job Functions' && field === 'JobFunctionID' ? 'Job Function' : field));

        expect(Changes[0]).toMatchObject({ NewValue: 'JobFunctionID: jf-7; Sequence: 1', NewValueName: 'Job Function: Engineering; Sequence: 1' });
    });

    it('has no changes for a preview that proposes none', () => {
        expect(WriteBackPreviewModel.Build('id-1', { ...base, previewFields: { Tier: 'Gold' }, previewFieldChanges: [] }).Changes).toEqual([]);
    });

    it('shows an existing link whose weight differs as a reweight, which the real write saves', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewTags: [
            { tagText: 'old', resolvedTagName: 'Old', matched: true, created: false, rootTagID: 'r', alreadyLinked: true, reweighted: true },
        ] });

        expect(Changes.map((c) => [c.Field, c.NewValue])).toEqual([['Reweight tag', 'Old']]);
    });
});
