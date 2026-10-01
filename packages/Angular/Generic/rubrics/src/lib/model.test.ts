import { describe, expect, it } from 'vitest';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { addCriterion, addNode, answerLevel, bandFor, canSubmit, comparisonMatrix, displayScore, draftProblems, incompleteAnswers, moveNode, moveProblem, previewScore, publishPreview, setAnchor, setGate, setScale, setWeight, versionRows, weightShares } from './model.js';

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

    it('does not parent a group under its own child', () => {
        let nodes = addNode([], 'Quality', 'Group', null);
        const parent = nodes[0];
        nodes = addNode(nodes, 'Clarity', 'Criterion', 'scale', parent.id);
        const child = nodes[1];
        const kept = moveNode(nodes, parent.id, child.id);
        expect(kept.find(node => node.id === parent.id)?.parentId ?? null).toBeNull();
        expect(moveProblem(nodes, parent.id, child.id)).toMatch(/quality/);
        const cycled = kept.map(node => node.id === parent.id ? { ...node, parentId: child.id } : node);
        expect(draftProblems(cycled, [scale]).join(' ')).toMatch(/quality/);
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

describe('publish, diff, and comparison', () => {
    function snap(weight: number, instructions: string | null): RubricVersionSnapshot {
        return {
            id: 'v', rubricId: 'r', majorVersion: 1, minorVersion: 0, patchVersion: 0,
            notApplicablePolicy: 'ExcludeAndRedistribute', scoreDisplayMin: 0, scoreDisplayMax: 100,
            instructions, nodes: [leaf('clarity', weight)], scales: [scale], bands: [],
        };
    }

    it('shows a major weight change and will not apply a lower request', () => {
        const preview = publishPreview(snap(1, null), snap(2, null), 'Patch');
        expect(preview.computedBump).toBe('Major');
        expect(preview.appliedBump).toBe('Major');
        expect(preview.nextVersion).toBe('2.0.0');
        expect(preview.changes.some(change => change.subject === 'clarity' && change.property === 'Weight')).toBe(true);
        expect(preview.higherBumps).toEqual([]);
    });

    it('offers a higher bump for a wording change and lines the keys up', () => {
        const base = snap(1, null);
        const draft = snap(1, 'Clearer instructions');
        const preview = publishPreview(base, draft, 'Major');
        expect(preview.computedBump).toBe('Patch');
        expect(preview.appliedBump).toBe('Major');
        expect(preview.higherBumps).toEqual(['Minor', 'Major']);
        const rows = versionRows(base, { ...draft, nodes: [...draft.nodes, leaf('sourcing', 1)] });
        expect(rows.find(row => row.key === 'sourcing')?.left).toBeNull();
        expect(rows.find(row => row.key === 'clarity')?.right).toBe('clarity');
    });

    it('marks disagreement and keeps self and withdrawn out of the human and AI means', () => {
        const matrix = comparisonMatrix(['clarity', 'evidence'], [
            { id: 'human', name: 'Ada', evaluatorType: 'Human', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 1 }, { key: 'evidence', normalizedScore: 0 }] },
            { id: 'ai', name: 'Judge', evaluatorType: 'AI', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 1 }, { key: 'evidence', normalizedScore: 1 }] },
            { id: 'self', name: 'Vendor', evaluatorType: 'Self', status: 'Submitted', scores: [{ key: 'clarity', normalizedScore: 0 }, { key: 'evidence', normalizedScore: 0 }] },
            { id: 'gone', name: 'Withdrawn', evaluatorType: 'Human', status: 'Withdrawn', scores: [{ key: 'clarity', normalizedScore: 0 }, { key: 'evidence', normalizedScore: 0 }] },
        ]);
        const evidence = matrix.rows.find(row => row.key === 'evidence');
        expect(evidence?.cells.find(cell => cell.columnId === 'human')?.disagree).toBe(true);
        expect(evidence?.cells.find(cell => cell.columnId === 'self')?.disagree).toBe(false);
        expect(matrix.rows.find(row => row.key === 'clarity')?.cells.every(cell => !cell.disagree)).toBe(true);
        expect(matrix.humanMean).toBe(0.5);
        expect(matrix.aiMean).toBe(1);
        expect(matrix.selfScore).toBe(0);
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
