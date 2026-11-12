import { describe, it, expect, afterEach } from 'vitest';
import type { DecisionAnswer, DecisionCalibrationEntry } from '@memberjunction/ai';
import type { DecisionCalibrationSource } from '@memberjunction/ai-core-plus';
import {
    BuildRestrictedFieldQuestions,
    BuildRestrictedFieldState,
    CompareRestrictedFieldDecision,
    FlaggedFieldsFromVerdicts,
    GetRestrictedFieldClassifierDecisionMode,
    ReadRestrictedFieldVerdicts,
    RESTRICTED_FIELD_CLASSIFIER_USE,
    RESTRICTED_FIELD_DECISION_QUESTION,
    SetRestrictedFieldClassifierDecisionMode,
    type RestrictedFieldDecisionInput
} from '../custom/RestrictedFieldDecision';

const input: RestrictedFieldDecisionInput = {
    EntityDisplayName: 'Employees',
    MessageText: 'They want mid-six-figures plus a big incentive.',
    AnchorType: 'Section',
    AnchorKey: 'general-notes',
    CandidateFields: [
        { Name: 'Salary', DisplayName: 'Annual Compensation', Description: 'Base annual salary in USD' },
        { Name: 'BonusTarget', DisplayName: 'Executive Bonus Target', Description: null }
    ]
};

const answeredBy = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-test' };

function likelihood(p: number): DecisionAnswer {
    return { Kind: 'Likelihood', Probability: p };
}

/** A source holding an identity-like fit (A=1, B=0 keeps the raw probability's log-odds) for this use. */
function sourceWith(entries: DecisionCalibrationEntry[]): DecisionCalibrationSource {
    return { GetDecisionCalibrations: (name: string) => (name === 'Jev' ? entries : []) };
}

const identityFit: DecisionCalibrationEntry = {
    Use: RESTRICTED_FIELD_CLASSIFIER_USE,
    Question: RESTRICTED_FIELD_DECISION_QUESTION,
    ResolvedModel: 'typesafe/jev-test',
    A: 1,
    B: 0
};

describe('RestrictedFieldDecision', () => {
    afterEach(() => SetRestrictedFieldClassifierDecisionMode(undefined));

    describe('mode', () => {
        it('defaults to Shadow', () => {
            expect(GetRestrictedFieldClassifierDecisionMode()).toBe('Shadow');
        });

        it('accepts a configured mode case-insensitively', () => {
            SetRestrictedFieldClassifierDecisionMode('decision');
            expect(GetRestrictedFieldClassifierDecisionMode()).toBe('Decision');
        });

        it('restores the default for a value that is not a mode', () => {
            SetRestrictedFieldClassifierDecisionMode('Prompt');
            SetRestrictedFieldClassifierDecisionMode('sometimes');
            expect(GetRestrictedFieldClassifierDecisionMode()).toBe('Shadow');
        });
    });

    describe('BuildRestrictedFieldQuestions', () => {
        it('asks one Likelihood per field, keyed f1, f2, naming the field and its description', () => {
            const questions = BuildRestrictedFieldQuestions(input);
            expect(Object.keys(questions)).toEqual(['f1', 'f2']);
            expect(questions.f1.Kind).toBe('Likelihood');
            expect(questions.f1.Instructions).toContain('"Annual Compensation" field (Base annual salary in USD)');
            expect(questions.f1.Instructions).toContain('Employees record');
            expect(questions.f2.Instructions).toContain('"Executive Bonus Target" field,');
        });
    });

    describe('BuildRestrictedFieldState', () => {
        it('holds the comment, record type and anchor, and nothing from the record', () => {
            expect(BuildRestrictedFieldState(input)).toEqual({
                recordType: 'Employees',
                anchor: 'Section: general-notes',
                comment: input.MessageText
            });
        });

        it('falls back to the anchor type, then Record, when there is no anchor key', () => {
            expect(BuildRestrictedFieldState({ ...input, AnchorKey: null }).anchor).toBe('Section');
            expect(BuildRestrictedFieldState({ ...input, AnchorType: null, AnchorKey: null }).anchor).toBe('Record');
        });
    });

    describe('reading the decision', () => {
        it('flags fields at or above the calibrated threshold of 0.2', () => {
            const verdicts = ReadRestrictedFieldVerdicts(input, { f1: likelihood(0.25), f2: likelihood(0.1) }, answeredBy, sourceWith([identityFit]));
            expect(verdicts[0].CalibratedProbability).toBeCloseTo(0.25, 5);
            expect(FlaggedFieldsFromVerdicts(verdicts)).toEqual(['Salary']);
        });

        it('is unsure (null) when the answering model has no calibration for this use', () => {
            const verdicts = ReadRestrictedFieldVerdicts(input, { f1: likelihood(0.9), f2: likelihood(0.9) }, answeredBy, sourceWith([]));
            expect(verdicts.every(v => v.CalibratedProbability === null)).toBe(true);
            expect(FlaggedFieldsFromVerdicts(verdicts)).toBeNull();
        });

        it('is unsure when a field went unanswered or was answered as another kind', () => {
            const answers: Record<string, DecisionAnswer> = {
                f1: { Kind: 'Choice', Value: 'x', Probabilities: { x: 1 }, Confidence: 1 }
            };
            const verdicts = ReadRestrictedFieldVerdicts(input, answers, answeredBy, sourceWith([identityFit]));
            expect(verdicts.map(v => v.RawProbability)).toEqual([null, null]);
            expect(FlaggedFieldsFromVerdicts(verdicts)).toBeNull();
        });

        it('flags nothing when every calibrated probability is below the threshold', () => {
            const verdicts = ReadRestrictedFieldVerdicts(input, { f1: likelihood(0.05), f2: likelihood(0.1) }, answeredBy, sourceWith([identityFit]));
            expect(FlaggedFieldsFromVerdicts(verdicts)).toEqual([]);
        });
    });

    describe('CompareRestrictedFieldDecision', () => {
        it('agrees when the decision flags the same fields as the prompt at a raw 0.5', () => {
            const verdicts = ReadRestrictedFieldVerdicts(input, { f1: likelihood(0.8), f2: likelihood(0.2) }, answeredBy, sourceWith([]));
            const comparison = CompareRestrictedFieldDecision(verdicts, ['salary']);
            expect(comparison.Agreed).toBe(true);
            expect(comparison.Summary).toBe('decision flagged [Salary], prompt flagged [salary]');
            expect(comparison.Details?.Fields).toEqual([
                { Name: 'Salary', RawProbability: 0.8, CalibratedProbability: null, PromptFlagged: true },
                { Name: 'BonusTarget', RawProbability: 0.2, CalibratedProbability: null, PromptFlagged: false }
            ]);
        });

        it('disagrees when the sets differ', () => {
            const verdicts = ReadRestrictedFieldVerdicts(input, { f1: likelihood(0.8), f2: likelihood(0.7) }, answeredBy, sourceWith([]));
            expect(CompareRestrictedFieldDecision(verdicts, ['Salary']).Agreed).toBe(false);
            expect(CompareRestrictedFieldDecision(verdicts, []).Agreed).toBe(false);
        });
    });
});
