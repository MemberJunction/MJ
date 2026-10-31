import { describe, it, expect } from 'vitest';
import { TRAINING_RUN_RESULTS_SCHEMA, type GateDecision, type StoredGateRecord } from '@memberjunction/predictive-studio-core';
import { BusinessPredictions } from '../PredictiveStudio/business-predictions.view-models';

const DECISIONS: Readonly<Record<'model' | 'keep-simple-baseline' | 'no-signal', GateDecision>> = {
  model: { outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: 'no simple baseline carries demonstrable signal' },
  'keep-simple-baseline': { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null },
  'no-signal': { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
};

const stored = (outcome: 'model' | 'keep-simple-baseline' | 'no-signal'): string => {
  const gate: StoredGateRecord = {
    evaluationProtocolId: 'P1', margin: 0, primaryMetric: 'log-loss', holdoutRows: 500,
    intervals: { modelName: 'xgb', modelVsDummy: { value: 0.02, lower: 0.01, upper: 0.03 }, modelVsBestSimple: null, memberVsDummy: { glm: { value: 0.015, lower: 0.005, upper: 0.025 } }, memberScores: { glm: 0.4 }, deliveredMember: null },
    guards: { taskKind: 'binary', holdoutClassCounts: { '0': 400, '1': 100 }, modelAucInterval: { level: 0.95, lower: 0.6, upper: 0.7 }, minMinorityClassRows: 20 },
    transcribed: DECISIONS[outcome], decision: DECISIONS[outcome], guardRefusal: null,
    reason: { code: outcome === 'no-signal' ? 'nothing-beats-dummy' : outcome === 'model' ? 'only-model-beats-dummy' : 'simple-baseline-carries-signal', text: 'stored reason' },
    incumbentDiff: null, sliceCoverage: { missingSubgroups: [], missingPeriods: [], slicesWithoutInterval: 0 },
  };
  return JSON.stringify({
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 500, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 500, dataCutoff: '2026-07-30' },
    legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: null, gate,
  });
};

describe('business catalog from stored gate decisions', () => {
  it('opens only what the gate shipped, and says why the rest is blocked', () => {
    const shipped = BusinessPredictions.ToBusinessPredictionCard({ modelId: 'm1', name: 'Renewal', ValidationResults: stored('model') });
    expect(shipped.canOpen).toBe(true);
    expect(shipped.blockedReason).toBeNull();
    expect(shipped.trust.Headline).toBe('Beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).');
    const none = BusinessPredictions.ToBusinessPredictionCard({ modelId: 'm2', name: 'Noise', ValidationResults: stored('no-signal') });
    expect(none.canOpen).toBe(false);
    expect(none.blockedReason).toBe('stored reason');
    const legacy = BusinessPredictions.ToBusinessPredictionCard({ modelId: 'm3', name: 'Old', ValidationResults: null });
    expect(legacy.canOpen).toBe(false);
    expect(legacy.blockedReason).toMatch(/not evaluated under an Evaluation Protocol/i);
  });

  it('a kept simple baseline opens', () => {
    const kept = BusinessPredictions.ToBusinessPredictionCard({ modelId: 'm4', name: 'Renewal', ValidationResults: stored('keep-simple-baseline') });
    expect(kept.canOpen).toBe(true);
    expect(kept.trust.Headline).toBe('A simple baseline (glm) beats the flat guess by 0.0150 [0.0050, 0.0250] (log-loss); the trained model did not beat it.');
  });

  it('falls back to a placeholder title when the name is blank, and carries the update time', () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const c = BusinessPredictions.ToBusinessPredictionCard({ modelId: 'm', name: '  ', ValidationResults: null, UpdatedAt: at });
    expect([c.title, c.updatedAt]).toEqual(['Untitled prediction', at]);
  });

  it('orders model, keep-simple-baseline, no-signal, not evaluated', () => {
    const cards = BusinessPredictions.BuildBusinessCatalog([
      { modelId: 'a', name: 'A', ValidationResults: null },
      { modelId: 'b', name: 'B', ValidationResults: stored('no-signal') },
      { modelId: 'c', name: 'C', ValidationResults: stored('keep-simple-baseline') },
      { modelId: 'd', name: 'D', ValidationResults: stored('model') },
    ]);
    expect(cards.map((c) => c.modelId)).toEqual(['d', 'c', 'b', 'a']);
  });
});
