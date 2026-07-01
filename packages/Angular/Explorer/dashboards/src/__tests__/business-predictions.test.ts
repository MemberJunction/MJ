import { describe, it, expect } from 'vitest';
import { toBusinessPredictionCard, buildBusinessCatalog } from '../PredictiveStudio/business-predictions.view-models';

/**
 * The business catalog reframes published models as plain "predictions" — and the trust gate is the
 * safety contract: a Poor / unmeasured model must be visibly blocked, never presented as usable.
 */
describe('toBusinessPredictionCard', () => {
  it('maps a Good model to an openable card with the plain title', () => {
    const c = toBusinessPredictionCard({ modelId: 'm1', name: "Who won't renew this year?", HoldoutMetrics: JSON.stringify({ AUC: 0.78, Accuracy: 0.8 }), ProblemType: 'classification' });
    expect(c.title).toBe("Who won't renew this year?");
    expect(c.trust.grade).toBe('Good');
    expect(c.canOpen).toBe(true);
    expect(c.blockedReason).toBeNull();
  });

  it('BLOCKS a Poor model with a plain "needs an analyst" reason', () => {
    const c = toBusinessPredictionCard({ modelId: 'm2', name: 'Win-back', HoldoutMetrics: JSON.stringify({ AUC: 0.51 }), ProblemType: 'classification' });
    expect(c.canOpen).toBe(false);
    expect(c.blockedReason).toMatch(/analyst/i);
  });

  it('BLOCKS an unmeasured model (fail-safe)', () => {
    const c = toBusinessPredictionCard({ modelId: 'm3', name: 'x', HoldoutMetrics: null, Metrics: null, ProblemType: 'classification' });
    expect(c.canOpen).toBe(false);
    expect(c.trust.unknown).toBe(true);
    expect(c.blockedReason).toMatch(/measured/i);
  });

  it('falls back to a placeholder title when the name is blank', () => {
    expect(toBusinessPredictionCard({ modelId: 'm', name: '  ', HoldoutMetrics: JSON.stringify({ AUC: 0.9 }), ProblemType: 'classification' }).title).toBe('Untitled prediction');
  });
});

describe('buildBusinessCatalog', () => {
  it('orders most-trustworthy first (Poor sinks to the bottom)', () => {
    const cards = buildBusinessCatalog([
      { modelId: 'poor', name: 'p', HoldoutMetrics: JSON.stringify({ AUC: 0.52 }), ProblemType: 'classification' },
      { modelId: 'exc', name: 'e', HoldoutMetrics: JSON.stringify({ AUC: 0.93 }), ProblemType: 'classification' },
      { modelId: 'good', name: 'g', HoldoutMetrics: JSON.stringify({ AUC: 0.78 }), ProblemType: 'classification' },
    ]);
    expect(cards.map((c) => c.modelId)).toEqual(['exc', 'good', 'poor']);
  });
});
