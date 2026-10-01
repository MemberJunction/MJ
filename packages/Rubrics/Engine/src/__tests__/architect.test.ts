import { describe, expect, it } from 'vitest';
import { critiqueRubric, importMatrix } from '../architect.js';
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
        expect(critiqueRubric(version)).toEqual([
            'ok: the name is too vague.',
            'ok: no anchors.',
            'ok: a gate should not allow not-applicable.',
        ]);
    });
});
