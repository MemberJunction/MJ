import { describe, expect, it } from 'vitest';
import { humanEvaluationFields, humanScoreFields, judgedRubric, versionSnapshot } from '../lib/models/human-review';

const JUDGE = {
    Status: 'Submitted',
    EvaluatorType: 'AIPrompt',
    RubricID: 'rubric-1',
    RubricVersionID: 'version-1',
    SubjectEntityID: 'entity-runs',
    SubjectRecordID: 'run-1',
    ContextEntityID: 'entity-tests',
    ContextRecordID: 'test-1',
};

describe('human rubric review', () => {
    it('uses the AI judgment and copies its subject and context onto a human draft', () => {
        const judged = judgedRubric([
            { ...JUDGE, EvaluatorType: 'Human', RubricVersionID: 'other' },
            JUDGE,
        ]);
        expect(judged?.versionId).toBe('version-1');
        expect(humanEvaluationFields(judged!, 'user-1')).toMatchObject({
            RubricID: 'rubric-1',
            RubricVersionID: 'version-1',
            SubjectEntityID: 'entity-runs',
            SubjectRecordID: 'run-1',
            ContextEntityID: 'entity-tests',
            ContextRecordID: 'test-1',
            EvaluatorType: 'Human',
            EvaluatorUserID: 'user-1',
            Status: 'Draft',
        });
    });

    it('hides the review when the run has no submitted rubric judgment', () => {
        expect(judgedRubric([])).toBeNull();
        expect(judgedRubric([{ ...JUDGE, Status: 'Draft' }])).toBeNull();
    });

    it('writes the chosen level onto a score row and leaves a not-applicable leaf without a level', () => {
        expect(humanScoreFields('eval-1', [
            { criterionId: 'c1', scaleLevelId: 'met', rationale: 'Matches.' },
            { criterionId: 'c2', isNotApplicable: true },
        ])).toEqual([
            { EvaluationID: 'eval-1', CriterionID: 'c1', ScaleLevelID: 'met', IsNotApplicable: false, Rationale: 'Matches.', Evidence: null },
            { EvaluationID: 'eval-1', CriterionID: 'c2', ScaleLevelID: null, IsNotApplicable: true, Rationale: null, Evidence: null },
        ]);
    });

    it('builds the form version from the stored criterion and scale rows', () => {
        const version = versionSnapshot(
            { ID: 'version-1', RubricID: 'rubric-1', NotApplicablePolicy: 'NotAllowed', PassThreshold: 0.7, ScoreDisplayMin: 0, ScoreDisplayMax: 1 },
            [{ ID: 'c1', Key: 'accurate', Name: 'Accurate', NodeType: 'Criterion', ScaleID: 'scale-1', Weight: 2, IsGate: 1, GateMinimumScore: 1, Sequence: 0 }],
            [{ ID: 'scale-1', ScaleType: 'Levels', HigherIsBetter: true }],
            [{ ID: 'met', ScaleID: 'scale-1', Label: 'Met', Value: 1, NormalizedValue: 1, Sequence: 1 }],
        );
        expect(version.nodes[0]).toMatchObject({ key: 'accurate', weight: 2, isGate: true, gateMinimumScore: 1 });
        expect(version.scales[0].levels[0].label).toBe('Met');
    });
});
