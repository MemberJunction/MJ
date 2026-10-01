import { describe, expect, it } from 'vitest';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { addCriterion, addNode, answerLevel, bandFor, canSubmit, displayScore, draftProblems, incompleteAnswers, moveNode, previewScore, setAnchor, setGate, setScale, setWeight, weightShares } from './model.js';

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

    it('builds a parent and a gated child with a scale and an anchor', () => {
        let nodes = addNode([], 'Quality', 'Group', null);
        const parent = nodes[0];
        nodes = addCriterion(nodes, 'Clarity', null);
        const child = nodes[1];
        nodes = moveNode(nodes, child.id, parent.id);
        nodes = setScale(nodes, child.id, 'scale');
        nodes = setAnchor(nodes, child.id, 'high', 'Clear enough to act on');
        nodes = setGate(nodes, child.id, true, 0.6);
        const built = nodes.find(node => node.id === child.id);
        expect(built?.parentId).toBe(parent.id);
        expect(built?.sequence).toBe(0);
        expect(draftProblems(nodes, [scale])).toEqual([]);
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

    it('refuses not applicable when the policy is NotAllowed, and ignores an unanswered advisory leaf', () => {
        const mandatory = leaf('must', 1, { notApplicablePolicy: 'NotAllowed' });
        const note = leaf('note', 1, { isAdvisory: true });
        const kept = answerLevel([{ criterionId: 'must', scaleLevelId: 'high' }], 'must', null, true, 'NotAllowed');
        expect(kept).toEqual([{ criterionId: 'must', scaleLevelId: 'high' }]);
        expect(canSubmit([mandatory], [{ criterionId: 'must', isNotApplicable: true }], 'ExcludeAndRedistribute')).toBe(false);
        expect(canSubmit([note], [])).toBe(true);
    });
});

describe('read-only result', () => {
    it('maps the score onto the display range and names the band', () => {
        expect(displayScore(0.75, 0, 100)).toBe(75);
        expect(displayScore(null, 0, 100)).toBeNull();
        expect(bandFor(0.8, version([]).bands)?.label).toBe('High');
        expect(bandFor(0.2, version([]).bands)).toBeNull();
        const bands = [
            { id: 'low', label: 'Low', minScore: 0, maxScore: 0.5, displayTone: 'Neutral', sequence: 0 },
            { id: 'high', label: 'Upper', minScore: 0.5, maxScore: 1, displayTone: 'Success', sequence: 1 },
        ];
        expect(bandFor(0.5, bands)?.label).toBe('Upper');
        expect(bandFor(1, bands)?.label).toBe('Upper');
    });
});
