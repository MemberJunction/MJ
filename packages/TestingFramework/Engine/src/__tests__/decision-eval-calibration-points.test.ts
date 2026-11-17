import { describe, it, expect } from 'vitest';
import {
    BuildPointsFromPromptRuns,
    DecisionPromptRunRow,
    LabelledPromptRunIDs,
    ParseCalibrationLabelsJsonl,
    ParseCalibrationPointsJsonl
} from '../decision-eval';

const RUN_A = 'AAAAAAAA-0000-4000-8000-000000000001';
const RUN_B = 'BBBBBBBB-0000-4000-8000-000000000002';

function run(id: string, overrides: Partial<DecisionPromptRunRow> = {}): DecisionPromptRunRow {
    return {
        ID: id,
        Model: 'Jev',
        Success: true,
        ModelSpecificResponseDetails: JSON.stringify({ ResolvedModel: 'typesafe/jev-1.13-20260917' }),
        Result: JSON.stringify({
            continues: { Kind: 'Likelihood', Probability: 0.82 },
            agent: { Kind: 'Choice', Value: 'research', Probabilities: { research: 0.7, sage: 0.3 }, Confidence: 0.7 },
            severity: { Kind: 'Score', Value: 1.4, Probabilities: { low: 0.2, mid: 0.6, high: 0.2 }, Confidence: 0.6 }
        }),
        ...overrides
    };
}

describe('ParseCalibrationPointsJsonl', () => {
    it('reads the points and reports bad lines by number', () => {
        const text = [
            JSON.stringify({ Use: 'routing', Question: 'continues', ModelName: 'Jev', ResolvedModel: 'r', RawProbability: 0.4, Label: false, Fold: 2 }),
            '',
            '{not json',
            JSON.stringify({ Use: 'routing', Question: 'continues', ModelName: 'Jev', ResolvedModel: 'r', RawProbability: 1.4, Label: true }),
            JSON.stringify({ Use: 'routing', Question: 'continues', ModelName: 'Jev', ResolvedModel: 'r', RawProbability: 0.4, Label: true, Extra: 1 })
        ].join('\n');
        const { Points, Errors } = ParseCalibrationPointsJsonl(text);
        expect(Points).toEqual([{ Use: 'routing', Question: 'continues', ModelName: 'Jev', ResolvedModel: 'r', RawProbability: 0.4, Label: false, Fold: 2 }]);
        expect(Errors.map(e => e.Line)).toEqual([3, 4, 5]);
        expect(Errors[0].Reason).toContain('not JSON');
        expect(Errors[1].Reason).toContain('RawProbability');
        expect(Errors[2].Reason).toContain('Extra');
    });
});

describe('ParseCalibrationLabelsJsonl', () => {
    it('needs exactly one of Label and ExpectedValue', () => {
        const text = [
            JSON.stringify({ PromptRunID: RUN_A, Question: 'continues', Label: true }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'agent', ExpectedValue: 'research' }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'agent' }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'agent', Label: true, ExpectedValue: 'research' })
        ].join('\n');
        const { Labels, Errors } = ParseCalibrationLabelsJsonl(text);
        expect(Labels).toHaveLength(2);
        expect(Errors.map(e => e.Line)).toEqual([3, 4]);
        expect(Errors[0].Reason).toContain('exactly one of Label and ExpectedValue');
    });
});

describe('LabelledPromptRunIDs', () => {
    it('lists each run once, whatever its casing', () => {
        const { Labels } = ParseCalibrationLabelsJsonl([
            JSON.stringify({ PromptRunID: RUN_A, Question: 'continues', Label: true }),
            JSON.stringify({ PromptRunID: RUN_A.toLowerCase(), Question: 'agent', Label: true }),
            JSON.stringify({ PromptRunID: RUN_B, Question: 'continues', Label: false })
        ].join('\n'));
        expect(LabelledPromptRunIDs(Labels)).toHaveLength(2);
    });
});

describe('BuildPointsFromPromptRuns', () => {
    it('reads a Likelihood\'s probability, and a Choice\'s or Score\'s confidence', () => {
        const { Labels } = ParseCalibrationLabelsJsonl([
            JSON.stringify({ PromptRunID: RUN_A.toLowerCase(), Question: 'continues', Label: false, Fold: 1 }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'agent', ExpectedValue: 'research' }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'agent', ExpectedValue: 'sage', Use: 'agent-discovery' }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'severity', Label: true, Weight: 2 })
        ].join('\n'));
        const { Points, Unused } = BuildPointsFromPromptRuns([run(RUN_A)], Labels, 'conversation-routing');
        expect(Unused).toEqual([]);
        expect(Points).toEqual([
            { Use: 'conversation-routing', Question: 'continues', ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', RawProbability: 0.82, Label: false, Fold: 1 },
            { Use: 'conversation-routing', Question: 'agent', ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', RawProbability: 0.7, Label: true },
            { Use: 'agent-discovery', Question: 'agent', ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', RawProbability: 0.7, Label: false },
            { Use: 'conversation-routing', Question: 'severity', ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', RawProbability: 0.6, Label: true, Weight: 2 }
        ]);
    });

    it('leaves out a label it cannot use, with the reason', () => {
        const { Labels } = ParseCalibrationLabelsJsonl([
            JSON.stringify({ PromptRunID: RUN_B, Question: 'continues', Label: true }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'missing', Label: true }),
            JSON.stringify({ PromptRunID: RUN_A, Question: 'continues', ExpectedValue: 'yes' }),
            JSON.stringify({ PromptRunID: 'CCCCCCCC-0000-4000-8000-000000000003', Question: 'continues', Label: true }),
            JSON.stringify({ PromptRunID: 'DDDDDDDD-0000-4000-8000-000000000004', Question: 'continues', Label: true })
        ].join('\n'));
        const runs = [
            run(RUN_A),
            run(RUN_B, { Success: false }),
            run('CCCCCCCC-0000-4000-8000-000000000003', { ModelSpecificResponseDetails: null })
        ];
        const { Points, Unused } = BuildPointsFromPromptRuns(runs, Labels, 'conversation-routing');
        expect(Points).toEqual([]);
        expect(Unused.map(u => u.Reason)).toEqual([
            'the run failed, so it has no answers',
            "the run has no answer to 'missing'",
            "'continues' is a Likelihood: label it with Label, not ExpectedValue",
            'the run does not name the resolved model, which the calibration is keyed on',
            'no decision prompt run with this ID'
        ]);
    });

    it('needs a use from the label or the default', () => {
        const { Labels } = ParseCalibrationLabelsJsonl(JSON.stringify({ PromptRunID: RUN_A, Question: 'continues', Label: true }));
        const { Unused } = BuildPointsFromPromptRuns([run(RUN_A)], Labels, undefined);
        expect(Unused[0].Reason).toContain('no use');
    });
});
