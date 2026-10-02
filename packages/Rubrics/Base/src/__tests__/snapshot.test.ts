import { describe, expect, it } from 'vitest';
import { SnapshotFromRows } from '../snapshot.js';

describe('SnapshotFromRows', () => {
    it('parses EvaluatorConfig and orders anchors', () => {
        const snapshot = SnapshotFromRows({
            version: { ID: 'v', NotApplicablePolicy: 'ExcludeAndRedistribute', ScoreDisplayMin: 0, ScoreDisplayMax: 1 },
            rubricId: 'rubric',
            criteria: [{ ID: 'a', Key: 'clarity', Name: 'Clarity', NodeType: 'Criterion', Weight: 1, EvaluatorConfig: '{"Deterministic":{"path":"output"}}' }],
            anchors: [
                { CriterionID: 'a', ScaleLevelID: 'low', Descriptor: 'Miss', Sequence: 2 },
                { CriterionID: 'a', ScaleLevelID: 'high', Descriptor: 'Meet', Sequence: 1 },
            ],
            bands: [],
            scales: [],
            levels: [],
        });
        expect(snapshot.nodes[0].evaluatorConfig).toEqual({ Deterministic: { path: 'output' } });
        expect(snapshot.nodes[0].anchors?.map(anchor => anchor.descriptor)).toEqual(['Meet', 'Miss']);
    });
});
