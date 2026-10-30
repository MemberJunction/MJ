import { describe, it, expect } from 'vitest';
import {
  GateRules,
  type GateGuardInputs, type GateInputs, type StoredGateIntervals,
} from '../gate';
import { EvaluationProtocol } from '../evaluation-protocol';
import { TrainerResultFixtures } from './fixtures/trainer-result';

const keepIn: GateInputs = { modelName: 'xgb', modelBeatsDummy: false, modelBeatsBestSimple: false, memberBeatsDummy: { glm: true }, memberScores: { glm: 0.3 }, deliveredMember: null };
const keepIv: StoredGateIntervals = {
  modelName: 'xgb',
  modelVsDummy: { value: 0, lower: -0.01, upper: 0.01 },
  modelVsBestSimple: { value: -0.01, lower: -0.02, upper: 0 },
  memberVsDummy: { glm: { value: 0.03, lower: 0.01, upper: 0.05 } },
  memberScores: { glm: 0.3 },
  deliveredMember: null,
};
const noGuards = (taskKind: GateGuardInputs['taskKind']): GateGuardInputs => ({ taskKind, holdoutClassCounts: null, modelAucInterval: null, minMinorityClassRows: 20 });
const binaryGuards = (counts: Readonly<Record<string, number>>, auc: { lower: number; upper: number } | null): GateGuardInputs =>
  ({ taskKind: 'binary', holdoutClassCounts: counts, modelAucInterval: auc === null ? null : { level: 0.95, ...auc }, minMinorityClassRows: 20 });

describe('GateRules.DecideGate — the decision table', () => {
  it('ships the model that beats the dummy and the best simple member', () => {
    expect(GateRules.DecideGate({ ...keepIn, modelBeatsDummy: true, modelBeatsBestSimple: true })).toEqual(
      { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null });
  });
  it('does not ship the model over the best simple member when the selected model is itself a simple member', () => {
    expect(GateRules.DecideGate({ ...keepIn, modelBeatsDummy: true, modelBeatsBestSimple: true, deliveredMember: 'glm' }).outcome).toBe('keep-simple-baseline');
  });
  it('ships the model when it beats the dummy and no simple member does', () => {
    expect(GateRules.DecideGate({ ...keepIn, modelBeatsDummy: true, memberBeatsDummy: { glm: false } })).toEqual(
      { outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: 'no simple baseline carries demonstrable signal' });
  });
  it('keeps the eligible member with the lowest score, ties by name', () => {
    expect(GateRules.DecideGate({ ...keepIn, memberBeatsDummy: { oneFeature: true, glm: true }, memberScores: { oneFeature: 0.3783, glm: 0.3652 } }).shipped).toBe('glm');
    expect(GateRules.DecideGate({ ...keepIn, memberBeatsDummy: { oneFeature: true, glm: true }, memberScores: { oneFeature: 0.3, glm: 0.3 } }).shipped).toBe('glm');
  });
  it('decides no-signal when nothing beats the dummy', () => {
    expect(GateRules.DecideGate({ ...keepIn, memberBeatsDummy: { glm: false } })).toEqual(
      { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null });
  });
});

describe('GateRules.GateInputsFromIntervals and the margin', () => {
  it('re-derives the keep-simple inputs from stored intervals', () => {
    expect(GateRules.GateInputsFromIntervals(keepIv, EvaluationProtocol.ToNonNegative(0.005))).toEqual(keepIn);
  });
  it('a lower bound equal to the margin does not beat', () => {
    expect(GateRules.BeatsByMargin({ value: 0.01, lower: 0.005, upper: 0.02 }, EvaluationProtocol.ToNonNegative(0.005))).toBe(false);
  });
  it('without a best-simple interval the model never beats the best simple', () => {
    expect(GateRules.GateInputsFromIntervals({ ...keepIv, modelVsBestSimple: null, modelVsDummy: { value: 0.05, lower: 0.04, upper: 0.06 } }, EvaluationProtocol.ToNonNegative(0)).modelBeatsBestSimple).toBe(false);
  });
});

describe('GateRules.ApplyGateGuards: a holdout minority below the protocol minimum, or an AUC interval containing 0.5, never ships', () => {
  const model = GateRules.DecideGate({ ...keepIn, modelBeatsDummy: true, modelBeatsBestSimple: true });
  const keep = GateRules.DecideGate(keepIn);
  it('downgrades to no-signal when the holdout minority class has fewer rows than the protocol minimum', () => {
    const g = GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 12, Renewed: 88 }, { lower: 0.55, upper: 0.7 }));
    expect(g.Decision.outcome).toBe('no-signal');
    expect(g.GuardRefusal).toEqual({ kind: 'minority-class-below-minimum', classLabel: 'Lapsed', rows: 12, minimum: 20 });
    expect(g.Transcribed).toEqual(model);
    expect(GateRules.ApplyGateGuards(keep, binaryGuards({ Lapsed: 12, Renewed: 88 }, null)).Decision.outcome).toBe('no-signal');
    expect(GateRules.ApplyGateGuards(model, { ...binaryGuards({ Lapsed: 12, Renewed: 88 }, { lower: 0.55, upper: 0.7 }), minMinorityClassRows: 10 }).Decision).toEqual(model);
  });
  it('names the first class in label order when two classes tie for the rarest', () => {
    expect(GateRules.ApplyGateGuards(model, binaryGuards({ Renewed: 12, Lapsed: 12 }, { lower: 0.55, upper: 0.7 })).GuardRefusal)
      .toEqual({ kind: 'minority-class-below-minimum', classLabel: 'Lapsed', rows: 12, minimum: 20 });
  });
  it('ships when the minority class has exactly the protocol minimum of rows', () => {
    const g = GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 20, Renewed: 80 }, { lower: 0.55, upper: 0.7 }));
    expect(g.GuardRefusal).toBeNull();
    expect(g.Decision).toEqual(model);
  });
  it('passes a transcribed no-signal through without a guard refusal, so its reason stays "nothing beats the flat guess"', () => {
    const noSignal = GateRules.DecideGate({ ...keepIn, memberBeatsDummy: { glm: false } });
    const g = GateRules.ApplyGateGuards(noSignal, binaryGuards({ Lapsed: 12, Renewed: 88 }, null));
    expect(g).toEqual({ Transcribed: noSignal, Decision: noSignal, GuardRefusal: null });
    expect(GateRules.DescribeGate(keepIv, g, 'log-loss').code).toBe('nothing-beats-dummy');
  });
  it('downgrades a model whose AUC interval contains 0.5, or whose AUC interval is missing', () => {
    expect(GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 30, Renewed: 70 }, { lower: 0.48, upper: 0.66 })).GuardRefusal)
      .toEqual({ kind: 'auc-interval-contains-chance', lower: 0.48, upper: 0.66 });
    expect(GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 30, Renewed: 70 }, null)).GuardRefusal).toEqual({ kind: 'auc-interval-missing' });
  });
  it('an AUC interval whose bound is exactly 0.5 contains chance', () => {
    expect(GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 30, Renewed: 70 }, { lower: 0.5, upper: 0.66 })).GuardRefusal)
      .toEqual({ kind: 'auc-interval-contains-chance', lower: 0.5, upper: 0.66 });
    expect(GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 30, Renewed: 70 }, { lower: 0.4, upper: 0.5 })).GuardRefusal)
      .toEqual({ kind: 'auc-interval-contains-chance', lower: 0.4, upper: 0.5 });
  });
  it('does not refuse an AUC interval wholly below 0.5: the rule is "contains 0.5"', () => {
    const g = GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 30, Renewed: 70 }, { lower: 0.3, upper: 0.45 }));
    expect(g.GuardRefusal).toBeNull();
    expect(g.Decision).toEqual(model);
  });
  it('keeps a model that clears both guards, and applies no AUC guard to a continuous task', () => {
    expect(GateRules.ApplyGateGuards(model, binaryGuards({ Lapsed: 30, Renewed: 70 }, { lower: 0.52, upper: 0.7 })).Decision).toEqual(model);
    expect(GateRules.ApplyGateGuards(model, noGuards('continuous')).Decision).toEqual(model);
  });
});

describe('GateRules.SameGate', () => {
  it('is same for equal decisions and not same when the branch matches but the shipped member differs', () => {
    const glm = GateRules.DecideGate(keepIn);
    const oneFeature = GateRules.DecideGate({ ...keepIn, memberBeatsDummy: { oneFeature: true }, memberScores: { oneFeature: 0.3 } });
    expect(glm.branch).toBe(oneFeature.branch);
    expect(GateRules.SameGate(glm, GateRules.DecideGate(keepIn))).toBe(true);
    expect(GateRules.SameGate(glm, oneFeature)).toBe(false);
  });
});

describe('GateRules.StoredGateIntervalsFromResult', () => {
  it('maps the trainer comparisons to stored intervals and decides keep-simple-baseline (GLM)', () => {
    const r = GateRules.StoredGateIntervalsFromResult(TrainerResultFixtures.C1KeepSimpleResult());
    expect(r.Ok).toBe(true);
    if (!r.Ok) return;
    expect(r.Intervals.memberScores).toEqual({ oneFeature: 0.3783, glm: 0.3652 });
    expect(r.Intervals.modelVsBestSimple).toEqual({ value: -0.006, lower: -0.017, upper: 0.005 });
    expect(r.Intervals.deliveredMember).toBeNull();
    const g = GateRules.DecideGuardedGate(r.Intervals, EvaluationProtocol.ToNonNegative(0), noGuards('binary'));
    expect(g.Decision).toEqual({ outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null });
    const reason = GateRules.DescribeGate(r.Intervals, g, 'log-loss');
    expect(reason.code).toBe('simple-baseline-carries-signal');
    expect(reason.text).toContain('0.0239 [0.0110, 0.0360]');
  });
  it('compares the model with the first member in name order when two members tie on score', () => {
    const result = TrainerResultFixtures.C1KeepSimpleResult();
    const tied = { ...result, baselines: result.baselines.map((b) => (b.role === 'simple' ? { ...b, holdout: { ...b.holdout, value: 0.37 } } : b)) };
    const r = GateRules.StoredGateIntervalsFromResult(tied);
    if (!r.Ok) throw new Error(r.MissingComparison);
    expect(r.Intervals.modelVsBestSimple).toEqual({ value: -0.006, lower: -0.017, upper: 0.005 });
  });
  it('stores the member as the delivered member when the finalist carries a member name', () => {
    const r = GateRules.StoredGateIntervalsFromResult(TrainerResultFixtures.C1MemberNamedFinalistResult());
    if (!r.Ok) throw new Error(r.MissingComparison);
    expect(r.Intervals.deliveredMember).toBe('glm');
    expect(GateRules.DecideGuardedGate(r.Intervals, EvaluationProtocol.ToNonNegative(0), noGuards('binary')).Decision.shipped).toBe('glm');
  });
  it('names a missing comparison instead of guessing', () => {
    const result = TrainerResultFixtures.C1KeepSimpleResult();
    const { glmVsDummy: _dropped, ...rest } = result.comparisons;
    expect(GateRules.StoredGateIntervalsFromResult({ ...result, comparisons: rest })).toEqual({ Ok: false, MissingComparison: 'glmVsDummy' });
    const { 'modelVs:glm': _droppedBest, ...noBest } = result.comparisons;
    expect(GateRules.StoredGateIntervalsFromResult({ ...result, comparisons: noBest })).toEqual({ Ok: false, MissingComparison: 'modelVs:glm' });
    const { modelVsDummy: _droppedModel, ...noModel } = result.comparisons;
    expect(GateRules.StoredGateIntervalsFromResult({ ...result, comparisons: noModel })).toEqual({ Ok: false, MissingComparison: 'modelVsDummy' });
  });
  it('treats the unit incumbent heuristic as a simple member', () => {
    expect(GateRules.BaselineMemberName({ kind: 'incumbent-heuristic', name: 'renewed last year' })).toBe('heuristic:renewed last year');
    const result = TrainerResultFixtures.C1KeepSimpleResult();
    const withRule = {
      ...result,
      baselines: [...result.baselines, { baseline: { kind: 'incumbent-heuristic' as const, name: 'renewed last year' }, role: 'simple' as const, holdout: { metric: 'log-loss' as const, value: 0.36, interval: { level: 0.95, lower: 0.32, upper: 0.4 }, n: 1205 } }],
      comparisons: { ...result.comparisons, 'heuristic:renewed last yearVsDummy': { value: 0.029, ci: [0.015, 0.043] as const, beats: true }, 'modelVs:heuristic:renewed last year': { value: -0.011, ci: [-0.02, -0.002] as const, beats: false } },
    };
    const r = GateRules.StoredGateIntervalsFromResult(withRule);
    if (!r.Ok) throw new Error(r.MissingComparison);
    const g = GateRules.DecideGuardedGate(r.Intervals, EvaluationProtocol.ToNonNegative(0), noGuards('binary'));
    expect(g.Decision.shipped).toBe('heuristic:renewed last year');
    expect(GateRules.DescribeGate(r.Intervals, g, 'log-loss').code).toBe('heuristic-carries-signal');
  });
});

describe('GateRules.DescribeGate — the reason in words, one case per code', () => {
  const margin0 = EvaluationProtocol.ToNonNegative(0);
  const beatsIv: StoredGateIntervals = { ...keepIv, modelVsDummy: { value: 0.05, lower: 0.04, upper: 0.06 }, modelVsBestSimple: { value: 0.02, lower: 0.01, upper: 0.03 } };
  const reasonFor = (iv: StoredGateIntervals, guards: GateGuardInputs, metric: 'log-loss' | 'rmse') =>
    GateRules.DescribeGate(iv, GateRules.DecideGuardedGate(iv, margin0, guards), metric);
  it('model-beats-best-simple', () => {
    expect(reasonFor(beatsIv, noGuards('continuous'), 'rmse')).toEqual({
      code: 'model-beats-best-simple',
      text: 'The model beats the flat guess by 0.0500 [0.0400, 0.0600] and the best simple baseline by 0.0200 [0.0100, 0.0300] (rmse, lower is better).',
    });
  });
  it('only-model-beats-dummy', () => {
    expect(reasonFor({ ...beatsIv, modelVsBestSimple: { value: -0.01, lower: -0.02, upper: 0 }, memberVsDummy: { glm: { value: 0, lower: -0.01, upper: 0.01 } } }, noGuards('continuous'), 'rmse')).toEqual({
      code: 'only-model-beats-dummy',
      text: 'The model beats the flat guess by 0.0500 [0.0400, 0.0600] (rmse); no simple baseline carries demonstrable signal.',
    });
  });
  it('simple-baseline-carries-signal', () => {
    expect(reasonFor(keepIv, noGuards('binary'), 'log-loss')).toEqual({
      code: 'simple-baseline-carries-signal',
      text: 'The simple baseline glm beats the flat guess by 0.0300 [0.0100, 0.0500] (log-loss); the trained model does not beat it, so the simple baseline is kept.',
    });
  });
  it('heuristic-carries-signal', () => {
    const iv: StoredGateIntervals = { ...keepIv, memberVsDummy: { 'heuristic:renewed last year': { value: 0.029, lower: 0.015, upper: 0.043 } }, memberScores: { 'heuristic:renewed last year': 0.36 } };
    expect(reasonFor(iv, noGuards('binary'), 'log-loss')).toEqual({
      code: 'heuristic-carries-signal',
      text: 'The existing rule "renewed last year" beats the flat guess by 0.0290 [0.0150, 0.0430] (log-loss) and the model does not beat it by the margin: keep the rule.',
    });
  });
  it('nothing-beats-dummy', () => {
    expect(reasonFor({ ...keepIv, memberVsDummy: { glm: { value: 0, lower: -0.01, upper: 0.01 } } }, noGuards('binary'), 'log-loss')).toEqual({
      code: 'nothing-beats-dummy',
      text: 'Neither the model (0.0000 [-0.0100, 0.0100]) nor any simple baseline beats the flat guess on log-loss: no signal.',
    });
  });
  it('minority-class-below-minimum', () => {
    expect(reasonFor(beatsIv, binaryGuards({ Lapsed: 12, Renewed: 88 }, { lower: 0.55, upper: 0.7 }), 'log-loss')).toEqual({
      code: 'minority-class-below-minimum',
      text: 'The test set has only 12 rows of "Lapsed"; at least 20 are needed to tell a model from chance, so nothing ships.',
    });
  });
  it('auc-interval-contains-chance', () => {
    expect(reasonFor(beatsIv, binaryGuards({ Lapsed: 30, Renewed: 70 }, { lower: 0.48, upper: 0.66 }), 'log-loss')).toEqual({
      code: 'auc-interval-contains-chance',
      text: "The model's AUC interval on the test set, [0.4800, 0.6600], contains 0.5 (a coin flip), so it does not ship.",
    });
  });
  it('auc-interval-missing', () => {
    expect(reasonFor(beatsIv, binaryGuards({ Lapsed: 30, Renewed: 70 }, null), 'log-loss')).toEqual({
      code: 'auc-interval-missing',
      text: 'The trainer reported no AUC interval for the model, so it cannot be shown to beat a coin flip; nothing ships.',
    });
  });
});

describe('GateRules.FormatInterval and GateRules.F4', () => {
  it('formats a stored interval as "x [lo, hi]" with four decimals', () => {
    expect(GateRules.F4(0.011)).toBe('0.0110');
    expect(GateRules.FormatInterval({ value: 0.0239, lower: 0.011, upper: 0.036 })).toBe('0.0239 [0.0110, 0.0360]');
  });
});
