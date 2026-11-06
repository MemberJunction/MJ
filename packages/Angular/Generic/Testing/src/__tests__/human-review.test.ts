import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HumanEvaluationFields, HumanScoreFields, JudgedRubric, PriorHumanEvaluation, VersionSnapshot } from '../lib/models/human-review';

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
    it('does not keep camelCase aliases of the review helpers', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/models/human-review.ts'), 'utf8');
        expect(source).not.toContain('export function judgedRubric');
        expect(source).not.toContain('export function priorHumanEvaluation');
        expect(source).not.toContain('export function humanEvaluationFields');
        expect(source).not.toContain('export function humanScoreFields');
        expect(source).not.toContain('export function versionSnapshot');
    });

    it('uses the AI judgment and copies its subject and context onto a human draft', () => {
        const judged = JudgedRubric([
            { ...JUDGE, EvaluatorType: 'Human', RubricVersionID: 'other' },
            JUDGE,
        ]);
        expect(judged?.VersionId).toBe('version-1');
        expect(HumanEvaluationFields(judged!, 'user-1')).toMatchObject({
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
        expect(JudgedRubric([])).toBeNull();
        expect(JudgedRubric([{ ...JUDGE, Status: 'Draft' }])).toBeNull();
    });

    it('writes the chosen level onto a score row and leaves a not-applicable leaf without a level', () => {
        expect(HumanScoreFields('eval-1', [
            { criterionId: 'c1', scaleLevelId: 'met', rationale: 'Matches.' },
            { criterionId: 'c2', isNotApplicable: true },
        ])).toEqual([
            { EvaluationID: 'eval-1', CriterionID: 'c1', ScaleLevelID: 'met', RawValue: null, IsNotApplicable: false, Rationale: 'Matches.', Evidence: null },
            { EvaluationID: 'eval-1', CriterionID: 'c2', ScaleLevelID: null, RawValue: null, IsNotApplicable: true, Rationale: null, Evidence: null },
        ]);
    });

    it('stores a percentage value and evidence as a quote list', () => {
        const [row] = HumanScoreFields('eval-1', [{ criterionId: 'pct', rawValue: 80, evidence: 'The figure shows 80.' }]);
        expect(row.RawValue).toBe(80);
        expect(row.Evidence).toBe(JSON.stringify([{ Type: 'Quote', Text: 'The figure shows 80.' }]));
        expect(row.Evidence).not.toBe('The figure shows 80.');
    });

    it('builds the form version from the stored criterion and scale rows', () => {
        const version = VersionSnapshot(
            { ID: 'version-1', RubricID: 'rubric-1', NotApplicablePolicy: 'NotAllowed', PassThreshold: 0.7, ScoreDisplayMin: 0, ScoreDisplayMax: 1 },
            [{ ID: 'c1', Key: 'accurate', Name: 'Accurate', NodeType: 'Criterion', ScaleID: 'scale-1', Weight: 2, IsGate: 1, GateMinimumScore: 1, Sequence: 0 }],
            [{ ID: 'scale-1', ScaleType: 'Levels', HigherIsBetter: true }],
            [{ ID: 'met', ScaleID: 'scale-1', Label: 'Met', Value: 1, NormalizedValue: 1, Sequence: 1 }],
        );
        expect(version.nodes[0]).toMatchObject({ key: 'accurate', weight: 2, isGate: true, gateMinimumScore: 1 });
        expect(version.scales[0].levels[0].label).toBe('Met');
    });

    it('keeps guidance, the leaf policy, and the anchor on the node', () => {
        const version = VersionSnapshot(
            { ID: 'version-1', RubricID: 'rubric-1', NotApplicablePolicy: 'ExcludeAndRedistribute' },
            [{ ID: 'c1', Key: 'accurate', Name: 'Accurate', NodeType: 'Criterion', ScaleID: 'scale-1', Weight: 1, NotApplicablePolicy: 'NotAllowed', Guidance: 'Check the figure.', Sequence: 0 }],
            [],
            [],
            [{ CriterionID: 'c1', ScaleLevelID: 'met', Descriptor: 'The figure matches.' }],
        );
        expect(version.nodes[0].guidance).toBe('Check the figure.');
        expect(version.nodes[0].notApplicablePolicy).toBe('NotAllowed');
        expect(version.nodes[0].anchors).toEqual([{ scaleLevelId: 'met', anchorValue: null, descriptor: 'The figure matches.' }]);
    });

    it('points a second human score at the reviewer\'s current submitted evaluation', () => {
        const judged = JudgedRubric([JUDGE])!;
        const prior = PriorHumanEvaluation([
            { ...JUDGE, ID: 'human-1', EvaluatorType: 'Human', EvaluatorUserID: 'user-1' },
            { ...JUDGE, ID: 'other-person', EvaluatorType: 'Human', EvaluatorUserID: 'user-2' },
        ], judged, 'user-1');
        expect(prior).toBe('human-1');
        expect(HumanEvaluationFields(judged, 'user-1', prior).SupersedesEvaluationID).toBe('human-1');
    });
});
