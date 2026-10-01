import { describe, expect, it } from 'vitest';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { addCriterion, answerLevel, bandFor, canSubmit, displayScore, draftProblems, incompleteAnswers, previewScore, setWeight, weightShares } from './model.js';

const scale: RubricScaleSnapshot = {
    id: 'scale',
    scaleType: 'Levels',
    higherIsBetter: true,
    levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 }],
};

function leaf(id: string, weight: number, extra: Partial<RubricNodeSnapshot> = {}): RubricNodeSnapshot {
    return {
        id, key: id, name: id, nodeType: 'Criterion', scaleId: 'scale', weight,
        isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0,
        ...extra,
    };
}

function version(nodes: RubricNodeSnapshot[]): RubricVersionSnapshot {
    return {
        id: 'version', rubricId: 'rubric', notApplicablePolicy: 'ExcludeAndRedistribute',
        scoreDisplayMin: 0, scoreDisplayMax: 100, nodes, scales: [scale], bands: [{ id: 'band', label: 'High', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 0 }],
    };
}

describe('rubric author', () => {
    it('shows live shares and ignores an advisory sibling', () => {
        const shares = weightShares([leaf('a', 1), leaf('b', 3), leaf('note', 5, { isAdvisory: true })]);
        expect(shares.get('a')).toBe(25);
        expect(shares.get('b')).toBe(75);
        expect(shares.get('note')).toBe(0);
    });

    it('refuses a duplicate key, a missing scale, and a gate with no minimum', () => {
        const problems = draftProblems([
            leaf('a', 1),
            leaf('b', 1, { key: 'a' }),
            leaf('c', 1, { scaleId: null }),
            leaf('d', 1, { isGate: true }),
        ], [scale]);
        expect(problems.join(' ')).toMatch(/Duplicate key a/);
        expect(problems.join(' ')).toMatch(/c needs a scale/);
        expect(problems.join(' ')).toMatch(/d is a gate with no minimum/);
    });

    it('adds a criterion with a unique key and previews the sample score', () => {
        const nodes = addCriterion([], 'Clarity', 'scale');
        expect(nodes).toHaveLength(1);
        expect(nodes[0].key).toBe('clarity');
        const weighted = setWeight(nodes, nodes[0].id, 2);
        expect(weighted[0].weight).toBe(2);
        const tree = version(weighted);
        const scored = previewScore(tree, [{ criterionId: nodes[0].id, scaleLevelId: 'high' }]);
        expect(scored.normalizedScore).toBe(1);
        expect(scored.outcome).toBe('Scored');
    });
});

describe('answer form', () => {
    it('blocks submit until a required rationale is present, and N/A clears the level', () => {
        const nodes = [leaf('a', 1, { rationaleRequired: true, evidenceRequired: true })];
        expect(canSubmit(nodes, [])).toBe(false);
        const chosen = answerLevel([], 'a', 'high', false);
        expect(incompleteAnswers(nodes, chosen).join(' ')).toMatch(/rationale/);
        const ready = [{ ...chosen[0], rationale: 'Because', evidence: 'The quote' }];
        expect(canSubmit(nodes, ready)).toBe(true);
        const skipped = answerLevel(ready, 'a', 'high', true);
        expect(skipped[0].scaleLevelId).toBeNull();
        expect(skipped[0].isNotApplicable).toBe(true);
        expect(canSubmit(nodes, skipped)).toBe(true);
    });
});

describe('read-only result', () => {
    it('maps the score onto the display range and names the band', () => {
        expect(displayScore(0.75, 0, 100)).toBe(75);
        expect(displayScore(null, 0, 100)).toBeNull();
        expect(bandFor(0.8, version([]).bands)?.label).toBe('High');
        expect(bandFor(0.2, version([]).bands)).toBeNull();
    });
});
