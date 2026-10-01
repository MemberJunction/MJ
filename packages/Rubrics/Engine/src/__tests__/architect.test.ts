import { describe, expect, it } from 'vitest';
import { critiqueRubric, draftFromImport, importMatrix, publishImportedDraft } from '../architect.js';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';

describe('rubric architect', () => {
    it('nests a numbered path and marks a knockout as a gate', () => {
        const rows = importMatrix('3,Security,1,no\n3.2,Encryption,2,yes');
        expect(rows[1]).toMatchObject({ key: '3.2', parentKey: '3', name: 'Encryption', weight: 2, gate: true });
    });

    it('flags a vague name, a missing anchor, and a gate that allows not-applicable', () => {
        const version: RubricVersionSnapshot = {
            id: 'v', rubricId: 'r', notApplicablePolicy: 'ExcludeAndRedistribute', scoreDisplayMin: 0, scoreDisplayMax: 1,
            nodes: [{
                id: 'c', key: 'ok', name: 'Ok', nodeType: 'Criterion', weight: 1, isAdvisory: false, isGate: true,
                notApplicablePolicy: 'ExcludeAndRedistribute', evidenceRequired: false, rationaleRequired: false, sequence: 0,
            }],
            scales: [], bands: [],
        };
        const inherited: RubricVersionSnapshot = {
            ...version,
            notApplicablePolicy: 'NotAllowed',
            nodes: [{ ...version.nodes[0], name: 'Accuracy', notApplicablePolicy: null }],
        };
        expect(critiqueRubric(inherited).some(note => note.includes('not-applicable'))).toBe(false);
        expect(draftFromImport('Imported', '1,Accuracy,1,yes').status).toBe('Draft');
        expect(publishImportedDraft().ok).toBe(false);
        expect(critiqueRubric(version)).toEqual([
            'ok: the name is too vague.',
            'ok: no anchors.',
            'ok: a gate should not allow not-applicable.',
        ]);
    });
});
