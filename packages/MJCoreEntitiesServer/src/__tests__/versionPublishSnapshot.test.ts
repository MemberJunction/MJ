import { describe, expect, it } from 'vitest';
import { RubricScoring } from '@memberjunction/rubrics-base';
import { LoadDraftForPublish } from '../custom/rubrics/versionPublish.js';

describe('LoadDraftForPublish', () => {
    it('copies RollupMethod, EvaluatorConfig, Description, and Guidance so Minimum is not a weighted mean', async () => {
        const run = async (entityName: string) => {
            if (entityName === 'MJ: Rubric Versions') {
                return { Success: true, Results: [{ ID: 'v', NotApplicablePolicy: 'ExcludeAndRedistribute', PassThreshold: null, ScoreDisplayMin: 0, ScoreDisplayMax: 1 }] };
            }
            if (entityName === 'MJ: Rubric Criteria') {
                return { Success: true, Results: [
                    { ID: 'g', Key: 'group', Name: 'Group', Description: 'The weaker child decides.', Guidance: 'Do not average.', NodeType: 'Group', Weight: 1, RollupMethod: 'Minimum', IsAdvisory: false, IsGate: false, Sequence: 0 },
                    { ID: 'a', Key: 'a', Name: 'A', ParentID: 'g', NodeType: 'Criterion', ScaleID: 'scale', Weight: 1, IsAdvisory: false, IsGate: false, Sequence: 1, EvaluatorConfig: '{"Deterministic":{"path":"a"}}' },
                    { ID: 'b', Key: 'b', Name: 'B', ParentID: 'g', NodeType: 'Criterion', ScaleID: 'scale', Weight: 1, IsAdvisory: false, IsGate: false, Sequence: 2 },
                ] };
            }
            if (entityName === 'MJ: Rubric Scales') return { Success: true, Results: [{ ID: 'scale', ScaleType: 'Levels', HigherIsBetter: true }] };
            if (entityName === 'MJ: Rubric Scale Levels') {
                return { Success: true, Results: [
                    { ID: 'high', Label: 'High', Value: 1, NormalizedValue: 1, Sequence: 0 },
                    { ID: 'low', Label: 'Low', Value: 0, NormalizedValue: 0, Sequence: 1 },
                ] };
            }
            return { Success: true, Results: [] };
        };
        const loaded = await LoadDraftForPublish(run, 'v', 'rubric', null);
        const group = loaded.draft.nodes.find(node => node.id === 'g');
        expect(group?.rollupMethod).toBe('Minimum');
        expect(group?.description).toBe('The weaker child decides.');
        expect(group?.guidance).toBe('Do not average.');
        expect(loaded.draft.nodes.find(node => node.id === 'a')?.evaluatorConfig).toEqual({ Deterministic: { path: 'a' } });
        const score = RubricScoring.compute({
            version: loaded.draft,
            answers: [
                { criterionId: 'a', scaleLevelId: 'high' },
                { criterionId: 'b', scaleLevelId: 'low' },
            ],
        });
        expect(score.normalizedScore).toBe(0);
    });
});
