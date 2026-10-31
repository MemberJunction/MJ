import { describe, it, expect } from 'vitest';
import { TrustVerdicts } from '../trust';
import { TRAINING_RUN_RESULTS_SCHEMA } from '../training-run-results';
import type { StoredGateRecord } from '../run-evaluation';

const gate: StoredGateRecord = {
  evaluationProtocolId: '33333333-4444-4555-8666-777777777777',
  margin: 0,
  primaryMetric: 'log-loss',
  holdoutRows: 1205,
  intervals: {
    modelName: 'xgb',
    modelVsDummy: { value: 0.0177, lower: 0.0098, upper: 0.0254 },
    modelVsBestSimple: { value: 0.006, lower: 0.001, upper: 0.011 },
    memberVsDummy: { glm: { value: 0.0239, lower: 0.011, upper: 0.036 } },
    memberScores: { glm: 0.3652 },
    deliveredMember: null,
  },
  guards: { taskKind: 'binary', holdoutClassCounts: { Lapsed: 300, Renewed: 905 }, modelAucInterval: { level: 0.95, lower: 0.6, upper: 0.7 }, minMinorityClassRows: 20 },
  transcribed: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
  decision: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
  guardRefusal: null,
  reason: { code: 'model-beats-best-simple', text: 'The model beats the flat guess by 0.0177 [0.0098, 0.0254] …' },
  incumbentDiff: null,
  sliceCoverage: { missingSubgroups: [], missingPeriods: [], slicesWithoutInterval: 0 },
};

const KEEP_GLM: StoredGateRecord['decision'] = { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null };
const NO_SIGNAL: StoredGateRecord['decision'] = { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null };

/** A v2 envelope whose `gate` member is `gate` with `over` applied. */
const record = (over: Partial<StoredGateRecord>): string => JSON.stringify({
  schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
  unitResolution: { rowsRead: 1205, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 1205, dataCutoff: '2026-07-30' },
  legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: null,
  gate: { ...gate, ...over },
});

describe('TrustVerdicts.DeriveTrustVerdict — a rendering of the stored gate decision', () => {
  it('a run with no stored decision is not evaluated and cannot be acted on (no in-sample fallback)', () => {
    for (const vr of [null, '', JSON.stringify({ metrics: { accuracy: 0.95 }, holdoutMetrics: { auc: 0.9 } })]) {
      const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: vr });
      expect(v.Kind).toBe('not-evaluated');
      expect(v.Outcome).toBeNull();
      expect(v.CanAct).toBe(false);
      expect(v.Comparison).toBeNull();
      expect(v.HoldoutRows).toBeNull();
    }
  });

  it('a v2 envelope without a gate member (a run trained before the gate was stored) is not evaluated', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({}).replace(/,"gate":\{.*\}\}$/, ',"gate":null}') });
    expect(v.Kind).toBe('not-evaluated');
  });

  it('a shipped model says how much it beats the flat guess by, with the interval', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({}) });
    expect(v.Kind).toBe('evaluated');
    expect(v.Outcome).toBe('model');
    expect(v.CanAct).toBe(true);
    expect(v.Headline).toBe('Beats the flat guess by 0.0177 [0.0098, 0.0254] (log-loss).');
    expect(v.Reason).toBe('The model beats the flat guess by 0.0177 [0.0098, 0.0254] …');
    expect(v.Comparison).toEqual({ Against: 'the flat guess', Shipped: 'xgb', Value: 0.0177, Lower: 0.0098, Upper: 0.0254, Metric: 'log-loss' });
    expect(v.HoldoutRows).toBe(1205);
  });

  it('keep-simple-baseline names the simple baseline and its own interval, and says the trained model did not beat it', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({ decision: KEEP_GLM }) });
    expect(v.Outcome).toBe('keep-simple-baseline');
    expect(v.CanAct).toBe(true);
    expect(v.Headline).toBe('A simple baseline (glm) beats the flat guess by 0.0239 [0.0110, 0.0360] (log-loss); the trained model did not beat it.');
    expect(v.Comparison).toEqual({ Against: 'the flat guess', Shipped: 'glm', Value: 0.0239, Lower: 0.011, Upper: 0.036, Metric: 'log-loss' });
  });

  it('keep-simple-baseline claims no lost comparison when the trained model is that baseline (a 0 [0, 0] comparison)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({
      decision: KEEP_GLM,
      intervals: { ...gate.intervals, modelName: 'logistic_regression', modelVsBestSimple: { value: 0, lower: 0, upper: 0 } },
    }) });
    expect(v.Headline).toBe('A simple baseline (glm) beats the flat guess by 0.0239 [0.0110, 0.0360] (log-loss).');
  });

  it('keep-simple-baseline claims no lost comparison when the delivered member is the shipped baseline', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({ decision: KEEP_GLM, intervals: { ...gate.intervals, modelName: 'glm', deliveredMember: 'glm' } }) });
    expect(v.Headline).toBe('A simple baseline (glm) beats the flat guess by 0.0239 [0.0110, 0.0360] (log-loss).');
  });

  it('a 0 [0, 0] comparison against a different member than the shipped one still says the trained model did not beat it', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({
      decision: KEEP_GLM,
      intervals: {
        ...gate.intervals,
        modelVsBestSimple: { value: 0, lower: 0, upper: 0 },
        memberVsDummy: { ...gate.intervals.memberVsDummy, oneFeature: { value: 0.01, lower: 0.001, upper: 0.02 } },
        memberScores: { glm: 0.3652, oneFeature: 0.3601 },
      },
    }) });
    expect(v.Headline).toBe('A simple baseline (glm) beats the flat guess by 0.0239 [0.0110, 0.0360] (log-loss); the trained model did not beat it.');
  });

  it('a kept heuristic rule is named as the existing rule', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({
      decision: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'heuristic:renewed last year', shippedRole: 'simpleBaseline', note: null },
      intervals: { ...gate.intervals, memberVsDummy: { 'heuristic:renewed last year': { value: 0.02, lower: 0.01, upper: 0.03 } } },
    }) });
    expect(v.Headline).toBe('A simple baseline (the existing rule "renewed last year") beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss); the trained model did not beat it.');
  });

  it('no-signal cannot be acted on and shows the stored reason', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({
      decision: NO_SIGNAL,
      guardRefusal: { kind: 'minority-class-below-minimum', classLabel: 'Lapsed', rows: 12, minimum: 20 },
      reason: { code: 'minority-class-below-minimum', text: 'The test set has only 12 rows of "Lapsed"; …' },
    }) });
    expect(v.Kind).toBe('evaluated');
    expect(v.Outcome).toBe('no-signal');
    expect(v.CanAct).toBe(false);
    expect(v.Headline).toBe('Not shipped: the test set cannot tell this model from chance.');
    expect(v.Reason).toContain('12 rows of "Lapsed"');
    expect(v.Comparison).toBeNull();
    expect(v.HoldoutRows).toBe(1205);
  });

  it('no-signal without a guard refusal says nothing beats the flat guess', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({ decision: NO_SIGNAL, reason: { code: 'nothing-beats-dummy', text: 'Neither the model nor a simple baseline beats the flat guess.' } }) });
    expect(v.CanAct).toBe(false);
    expect(v.Headline).toBe('No signal: nothing beats the flat guess.');
    expect(v.Reason).toBe('Neither the model nor a simple baseline beats the flat guess.');
  });

  it('a kept member without a stored interval is not evaluated (no invented number)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({ decision: KEEP_GLM, intervals: { ...gate.intervals, memberVsDummy: {} } }) });
    expect(v.Kind).toBe('not-evaluated');
    expect(v.CanAct).toBe(false);
  });

  it('never grades with a band or an accuracy sentence', () => {
    for (const vr of [record({}), record({ decision: KEEP_GLM }), record({ decision: NO_SIGNAL }), null]) {
      const v = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: vr });
      expect(`${v.Headline} ${v.Reason}`).not.toMatch(/Excellent|Good|Fair|Poor|out of 10|Explains about|Accounts for about/);
    }
  });

  it('titles and evidence', () => {
    expect(TrustVerdicts.OutcomeTitle(TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({}) }))).toBe('Ships — the model beats the flat guess');
    expect(TrustVerdicts.OutcomeTitle(TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({ decision: KEEP_GLM }) }))).toBe('Ships — a simple baseline');
    expect(TrustVerdicts.OutcomeTitle(TrustVerdicts.DeriveTrustVerdict({ ValidationResults: record({ decision: NO_SIGNAL }) }))).toBe('No signal — not usable');
    expect(TrustVerdicts.OutcomeTitle(TrustVerdicts.DeriveTrustVerdict({ ValidationResults: null }))).toBe('Not evaluated yet');
    expect(TrustVerdicts.TrustEvidenceLine({ count: 1205, noun: 'members' })).toBe('Checked against 1,205 past members it had never seen.');
    expect(TrustVerdicts.TrustEvidenceLine({ count: null, noun: 'records' })).toBe('Checked against past records it had never seen.');
    expect(TrustVerdicts.TrustEvidenceLine()).toBe('Checked against past records it had never seen.');
  });
});
