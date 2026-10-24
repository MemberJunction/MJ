import { describe, it, expect } from 'vitest';
import { ToBusinessPredictionCard, BuildBusinessCatalog } from '../PredictiveStudio/business-predictions.view-models';

/**
 * The business catalog reframes published models as plain "predictions" — and the trust gate is the
 * safety contract: a Poor / unmeasured model must be visibly blocked, never presented as usable.
 */
describe('toBusinessPredictionCard', () => {
  it('maps a Good model to an openable card with the plain title', () => {
    const c = ToBusinessPredictionCard({ modelId: 'm1', name: "Who won't renew this year?", HoldoutMetrics: JSON.stringify({ AUC: 0.78, Accuracy: 0.8 }), ProblemType: 'classification', Lineage: null });
    expect(c.title).toBe("Who won't renew this year?");
    expect(c.trust.grade).toBe('Good');
    expect(c.canOpen).toBe(true);
    expect(c.blockedReason).toBeNull();
  });

  it('BLOCKS a Poor model with a plain "needs an analyst" reason', () => {
    const c = ToBusinessPredictionCard({ modelId: 'm2', name: 'Win-back', HoldoutMetrics: JSON.stringify({ AUC: 0.51 }), ProblemType: 'classification', Lineage: null });
    expect(c.canOpen).toBe(false);
    expect(c.blockedReason).toMatch(/analyst/i);
  });

  it('BLOCKS an unmeasured model (fail-safe)', () => {
    const c = ToBusinessPredictionCard({ modelId: 'm3', name: 'x', HoldoutMetrics: null, Metrics: null, ProblemType: 'classification', Lineage: null });
    expect(c.canOpen).toBe(false);
    expect(c.trust.unknown).toBe(true);
    expect(c.blockedReason).toMatch(/measured/i);
  });

  it('falls back to a placeholder title when the name is blank', () => {
    expect(ToBusinessPredictionCard({ modelId: 'm', name: '  ', HoldoutMetrics: JSON.stringify({ AUC: 0.9 }), ProblemType: 'classification', Lineage: null }).title).toBe('Untitled prediction');
  });

  it('blocks a card whose model withholds its verdict (time index not evaluated as a forecast)', () => {
    const lineage = JSON.stringify({ evaluation: { ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', WithheldReason: 'not evaluated as a forecast' } });
    const c = ToBusinessPredictionCard({ modelId: 'm9', name: 'Monthly volume', HoldoutMetrics: JSON.stringify({ r2: 0.8 }), ProblemType: 'regression', Lineage: lineage });
    expect(c.canOpen).toBe(false);
    expect(c.trust.WithheldReason).toBe('not evaluated as a forecast');
  });
});

describe('buildBusinessCatalog', () => {
  it('orders most-trustworthy first (Poor sinks to the bottom)', () => {
    const cards = BuildBusinessCatalog([
      { modelId: 'poor', name: 'p', HoldoutMetrics: JSON.stringify({ AUC: 0.52 }), ProblemType: 'classification', Lineage: null },
      { modelId: 'exc', name: 'e', HoldoutMetrics: JSON.stringify({ AUC: 0.93 }), ProblemType: 'classification', Lineage: null },
      { modelId: 'good', name: 'g', HoldoutMetrics: JSON.stringify({ AUC: 0.78 }), ProblemType: 'classification', Lineage: null },
    ]);
    expect(cards.map((c) => c.modelId)).toEqual(['exc', 'good', 'poor']);
  });
});
