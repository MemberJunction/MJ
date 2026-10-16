import { describe, it, expect } from 'vitest';
import type { WriteBackResult } from '@memberjunction/record-set-processor-base';
import { WriteBackPreviewModel } from '../lib/write-back-preview';

const base: WriteBackResult = { updatedRecord: false, changed: false, dryRun: true };

describe('WriteBackPreviewModel.Build', () => {
    it('shows each previewed field with the value the write stores', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewFields: { Tier: 'Gold' } });

        expect(Changes).toEqual([{ Field: 'Tier', OldValue: undefined, NewValue: 'Gold', Applied: true, Changed: true, IsAddition: true }]);
    });

    it('shows each previewed child row with its values, leaving out the link to the processed record', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewChildren: [{ PersonID: 'ID-1', Name: 'Go' }, { Name: 'SQL', Level: 4 }] });

        expect(Changes.map((c) => [c.Field, c.NewValue])).toEqual([['Child row', 'Name: Go'], ['Child row', 'Name: SQL; Level: 4']]);
    });

    it('shows a matched tag and a new tag, not one constrained growth cannot place', () => {
        const { Changes } = WriteBackPreviewModel.Build('id-1', { ...base, previewTags: [
            { tagText: 'vip', resolvedTagName: 'VIP', matched: true, created: false, rootTagID: 'r' },
            { tagText: 'fresh', matched: false, created: true, rootTagID: 'r' },
            { tagText: 'unplaced', matched: false, created: false, rootTagID: 'r' },
        ] });

        expect(Changes.map((c) => c.NewValue)).toEqual(['VIP', 'fresh (new tag)']);
    });

    it('gives a record whose real write would fail its errors and no changes', () => {
        const rows = WriteBackPreviewModel.Build('id-1', { ...base, PreviewErrors: ['no such row'], previewFields: { Tier: 'b' } });

        expect(rows).toEqual({ Changes: [], Errors: ['no such row'], Withheld: [] });
    });

    it('lists each withheld output as a line, apart from the changes (a kept NOT NULL field and a skipped child mapping say so)', () => {
        const rows = WriteBackPreviewModel.Build('id-1', { ...base,
            previewFields: { SeniorityLevelID: null },
            withheldFields: ['SeniorityLevelID', 'Grade'], withheldKeptFields: ['grade'], withheldChildEntities: ['Person Job Functions'],
        });

        expect(rows.Changes.map((c) => [c.Field, c.NewValue])).toEqual([['SeniorityLevelID', null]]);
        expect(rows.Withheld).toEqual([
            'SeniorityLevelID: withheld (below confidence)',
            'Grade: withheld (below confidence); kept, the column does not allow null',
            'Person Job Functions: withheld (below confidence); rows unchanged',
        ]);
    });

    it('has no changes for a preview that proposes none', () => {
        expect(WriteBackPreviewModel.Build('id-1', { ...base }).Changes).toEqual([]);
    });
});
