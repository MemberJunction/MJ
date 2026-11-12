import { describe, it, expect } from 'vitest';
import { ApplyPlattCalibration } from '@memberjunction/ai';
import {
    ApplyPlatt,
    BalancedAccuracy,
    CALIBRATION_FIT_DEFAULT_MIN_POINTS,
    CalibrationPoint,
    FitDecisionCalibrations,
    FitPlatt,
    GroupCalibrationPoints,
    RenderCalibrationFitReport,
    ResolveTargetPrior,
    ShiftPlattIntercept
} from '../decision-eval';

const JEV = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };
const LLM = { ModelName: 'LLM Decision', ResolvedModel: 'GPT-OSS-120B' };

/**
 * A deterministic, overlapping sample: positives spread over [0.30, 0.95] and negatives over
 * [0.05, 0.70], so the fit is finite and the scores are not perfect.
 */
function overlappingPoints(use: string, question: string, model: { ModelName: string; ResolvedModel: string }, positives = 40, negatives = 60): CalibrationPoint[] {
    const points: CalibrationPoint[] = [];
    for (let i = 0; i < positives; i++) {
        points.push({ Use: use, Question: question, ...model, RawProbability: 0.3 + (0.65 * i) / (positives - 1), Label: true });
    }
    for (let i = 0; i < negatives; i++) {
        points.push({ Use: use, Question: question, ...model, RawProbability: 0.05 + (0.65 * i) / (negatives - 1), Label: false });
    }
    return points;
}

describe('GroupCalibrationPoints', () => {
    it('groups by use, question, model and resolved model, in first-seen order', () => {
        const points: CalibrationPoint[] = [
            { Use: 'routing', Question: 'continues', ...JEV, RawProbability: 0.9, Label: true },
            { Use: 'routing', Question: 'continues', ...LLM, RawProbability: 0.4, Label: false },
            { Use: 'routing', Question: 'agent', ...JEV, RawProbability: 0.7, Label: true },
            { Use: 'routing', Question: 'continues', ...JEV, RawProbability: 0.2, Label: false },
            { Use: 'routing', Question: 'continues', ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14', RawProbability: 0.5, Label: true }
        ];
        const { Groups, Skipped } = GroupCalibrationPoints(points);
        expect(Skipped).toEqual([]);
        expect(Groups.map(g => [g.Question, g.ModelName, g.ResolvedModel, g.Points.length])).toEqual([
            ['continues', 'Jev', 'typesafe/jev-1.13-20260917', 2],
            ['continues', 'LLM Decision', 'GPT-OSS-120B', 1],
            ['agent', 'Jev', 'typesafe/jev-1.13-20260917', 1],
            ['continues', 'Jev', 'typesafe/jev-1.14', 1]
        ]);
    });

    it('trims the key fields, so whitespace does not split a group', () => {
        const { Groups } = GroupCalibrationPoints([
            { Use: 'routing ', Question: ' continues', ...JEV, RawProbability: 0.9, Label: true },
            { Use: 'routing', Question: 'continues', ModelName: ' Jev', ResolvedModel: 'typesafe/jev-1.13-20260917 ', RawProbability: 0.1, Label: false }
        ]);
        expect(Groups).toHaveLength(1);
        expect(Groups[0].Use).toBe('routing');
    });

    it('expands a point by its weight', () => {
        const { Groups } = GroupCalibrationPoints([{ Use: 'u', Question: 'q', ...JEV, RawProbability: 0.6, Label: true, Weight: 3 }]);
        expect(Groups[0].Points).toEqual([
            { Probability: 0.6, Positive: true },
            { Probability: 0.6, Positive: true },
            { Probability: 0.6, Positive: true }
        ]);
    });

    it('keeps the folds only when every point of a group has one', () => {
        const withFolds = GroupCalibrationPoints([
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 0.6, Label: true, Fold: 0, Weight: 2 },
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 0.3, Label: false, Fold: 1 }
        ]);
        expect(withFolds.Groups[0].Folds).toEqual([0, 0, 1]);
        const partial = GroupCalibrationPoints([
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 0.6, Label: true, Fold: 0 },
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 0.3, Label: false }
        ]);
        expect(partial.Groups[0].Folds).toBeNull();
    });

    it('skips unusable points and says why', () => {
        const { Groups, Skipped } = GroupCalibrationPoints([
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 1.2, Label: true },
            { Use: 'u', Question: 'q', ModelName: 'Jev', ResolvedModel: ' ', RawProbability: 0.5, Label: true },
            { Use: 'u', Question: 'q', ...JEV, RawProbability: Number.NaN, Label: false },
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 0.5, Label: true, Weight: 0.5 },
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 0.5, Label: true, Fold: -1 },
            { Use: 'u', Question: 'q', ...JEV, RawProbability: 0.5, Label: true }
        ]);
        expect(Skipped.map(s => s.Index)).toEqual([0, 1, 2, 3, 4]);
        expect(Skipped[0].Reason).toContain('RawProbability');
        expect(Skipped[1].Reason).toContain('ResolvedModel is missing');
        expect(Skipped[3].Reason).toContain('Weight');
        expect(Skipped[4].Reason).toContain('Fold');
        expect(Groups[0].Points).toHaveLength(1);
    });
});

describe('ShiftPlattIntercept', () => {
    it('adds logit(target) − logit(sample) to the intercept', () => {
        // logit(0.75) = ln 3 and logit(0.25) = −ln 3, so the shift is 2 ln 3.
        expect(ShiftPlattIntercept(0.5, 0.25, 0.75)).toBeCloseTo(0.5 + 2 * Math.log(3), 12);
        expect(ShiftPlattIntercept(-1.2, 0.4, 0.4)).toBeCloseTo(-1.2, 12);
    });

    it('moves a calibrated posterior as Bayes\' rule does for a change of prior', () => {
        // At a 50/50 mix, a calibrated 0.5 is a likelihood ratio of 1, so at a 90% prior it reads 0.9.
        const shifted = ShiftPlattIntercept(0, 0.5, 0.9);
        expect(ApplyPlattCalibration(0.5, { A: 1, B: shifted })).toBeCloseTo(0.9, 9);
        // A calibrated 0.8 at a 20% prior is a likelihood ratio of (0.8/0.2)/(0.2/0.8) = 16; at 50% that is 16/17.
        const b = Math.log(0.8 / 0.2);
        const atSample = ApplyPlattCalibration(0.5, { A: 1, B: b });
        expect(atSample).toBeCloseTo(0.8, 9);
        expect(ApplyPlattCalibration(0.5, { A: 1, B: ShiftPlattIntercept(b, 0.2, 0.5) })).toBeCloseTo(16 / 17, 9);
    });

    it('refuses a prior outside (0, 1)', () => {
        expect(() => ShiftPlattIntercept(0, 0, 0.5)).toThrow(/\(0, 1\)/);
        expect(() => ShiftPlattIntercept(0, 0.5, 1)).toThrow(/\(0, 1\)/);
    });
});

describe('ResolveTargetPrior', () => {
    it('reads one prior for every use, a use\'s own prior, or the * entry', () => {
        expect(ResolveTargetPrior(undefined, 'routing')).toBeNull();
        expect(ResolveTargetPrior(0.9, 'routing')).toBe(0.9);
        expect(ResolveTargetPrior({ routing: 0.9, '*': 0.3 }, 'routing')).toBe(0.9);
        expect(ResolveTargetPrior({ routing: 0.9, '*': 0.3 }, 'dupe')).toBe(0.3);
        expect(ResolveTargetPrior({ routing: 0.9 }, 'dupe')).toBeNull();
        expect(ResolveTargetPrior({ routing: 0.9 }, 'constructor')).toBeNull();
    });
});

describe('FitDecisionCalibrations', () => {
    const FITTED_AT = new Date('2026-11-12T00:00:00Z');

    it('emits one entry per fitted group, grouped by the model row it belongs on', () => {
        const points = [
            ...overlappingPoints('conversation-routing', 'continues', JEV),
            ...overlappingPoints('conversation-routing', 'continues', LLM),
            ...overlappingPoints('memory-note-gate', 'keep', JEV)
        ];
        const result = FitDecisionCalibrations(points, { FittedAt: FITTED_AT, CorpusLabel: 'synthetic corpus' });
        expect(result.Groups.every(g => g.Refused === undefined)).toBe(true);
        expect(result.Entries.map(e => [e.ModelName, e.Calibrations.map(c => `${c.Use}/${c.Question}`)])).toEqual([
            ['Jev', ['conversation-routing/continues', 'memory-note-gate/keep']],
            ['LLM Decision', ['conversation-routing/continues']]
        ]);
        const entry = result.Entries[0].Calibrations[0];
        expect(Object.keys(entry).sort()).toEqual(['A', 'B', 'FittedOn', 'Question', 'ResolvedModel', 'Use']);
        expect(entry.ResolvedModel).toBe('typesafe/jev-1.13-20260917');
        expect(entry.FittedOn).toContain('synthetic corpus, fitted 2026-11-12: n=100 (40 positive)');
        expect(entry.FittedOn).toContain('balanced accuracy');
    });

    it('ships the fit on every point, rounded to four places', () => {
        const points = overlappingPoints('u', 'q', JEV);
        const fit = FitPlatt(points.map(p => ({ Probability: p.RawProbability, Positive: p.Label })));
        const [group] = FitDecisionCalibrations(points, { FittedAt: FITTED_AT }).Groups;
        expect(group.Fit?.Converged).toBe(true);
        expect(group.Entry?.A).toBe(Math.round(fit.A * 10_000) / 10_000);
        expect(group.Entry?.B).toBe(Math.round(fit.B * 10_000) / 10_000);
        expect(group.SamplePrior).toBeCloseTo(0.4, 12);
        expect(group.TargetPrior).toBeNull();
    });

    it('shifts the shipped intercept to the target prior and leaves the slope alone', () => {
        const points = overlappingPoints('conversation-routing', 'continues', JEV);
        const plain = FitDecisionCalibrations(points, { FittedAt: FITTED_AT }).Groups[0];
        const shifted = FitDecisionCalibrations(points, { FittedAt: FITTED_AT, TargetPrior: { 'conversation-routing': 0.9 } }).Groups[0];
        expect(shifted.Entry?.A).toBe(plain.Entry?.A);
        const expectedB = ShiftPlattIntercept(plain.Fit!.B, 0.4, 0.9);
        expect(shifted.Entry?.B).toBe(Math.round(expectedB * 10_000) / 10_000);
        expect(shifted.TargetPrior).toBe(0.9);
        expect(shifted.Entry?.FittedOn).toContain('intercept shifted from the corpus mix 0.400 to 0.900');
    });

    it('scores out of fold with the caller\'s folds when every point has one', () => {
        const points = overlappingPoints('u', 'q', JEV).map((p, i) => ({ ...p, Fold: i % 3 }));
        const [group] = FitDecisionCalibrations(points, { FittedAt: FITTED_AT }).Groups;
        const labelled = points.map(p => ({ Probability: p.RawProbability, Positive: p.Label }));
        const calibrated = labelled.map((p, i) => {
            const fit = FitPlatt(labelled.filter((_, j) => points[j].Fold !== points[i].Fold));
            return { Probability: ApplyPlatt(p.Probability, fit), Positive: p.Positive };
        });
        expect(group.Calibrated?.BalancedAccuracy).toBeCloseTo(BalancedAccuracy(calibrated, 0.5)!, 12);
    });

    it('refuses a group with too few points, and one with a single class', () => {
        const few = overlappingPoints('u', 'few', JEV, 5, 5);
        const oneClass = overlappingPoints('u', 'one-class', JEV, 40, 2).filter(p => p.Label);
        const result = FitDecisionCalibrations([...few, ...oneClass], { FittedAt: FITTED_AT });
        expect(result.Entries).toEqual([]);
        expect(result.Groups[0].Refused).toBe(`10 points, fewer than the ${CALIBRATION_FIT_DEFAULT_MIN_POINTS} a fit needs`);
        expect(result.Groups[1].Refused).toContain('every point is positive');
    });

    it('applies the caller\'s floors', () => {
        const points = overlappingPoints('u', 'q', JEV, 40, 4);
        expect(FitDecisionCalibrations(points, { FittedAt: FITTED_AT }).Groups[0].Refused)
            .toBe('40 positive and 4 negative points; each class needs at least 5');
        expect(FitDecisionCalibrations(points, { FittedAt: FITTED_AT, MinPerClass: 3 }).Groups[0].Refused).toBeUndefined();
        expect(FitDecisionCalibrations(points, { FittedAt: FITTED_AT, MinPoints: 50 }).Groups[0].Refused)
            .toBe('44 points, fewer than the 50 a fit needs');
    });

    it('refuses a target prior outside (0, 1) before fitting anything', () => {
        expect(() => FitDecisionCalibrations(overlappingPoints('u', 'q', JEV), { TargetPrior: { u: 1.5 } }))
            .toThrow("The target prior for 'u' must be a share in (0, 1), got 1.5");
    });
});

describe('RenderCalibrationFitReport', () => {
    it('lists every group with its scores or the reason it was refused, then the skipped points', () => {
        const result = FitDecisionCalibrations([
            ...overlappingPoints('routing', 'continues', JEV),
            ...overlappingPoints('routing', 'few|ish', LLM, 3, 3),
            { Use: 'routing', Question: 'continues', ...JEV, RawProbability: 2, Label: true }
        ], { FittedAt: new Date('2026-11-12T00:00:00Z') });
        const report = RenderCalibrationFitReport(result);
        expect(report).toContain('| Use | Question | Model | Resolved model |');
        expect(report).toMatch(/\| routing \| continues \| Jev \| typesafe\/jev-1\.13-20260917 \| 100 \| 40 \|/);
        expect(report).toContain('few\\|ish');
        expect(report).toContain('refused: 6 points, fewer than the 30 a fit needs');
        expect(report).toContain('## Skipped points (1)');
        expect(report).toContain('- point 106: RawProbability must be a finite number in [0, 1], got 2');
    });
});
