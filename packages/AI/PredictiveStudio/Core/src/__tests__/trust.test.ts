import { describe, it, expect } from 'vitest';
import { deriveTrustVerdict, trustEvidenceLine, trustDots } from '../trust';

/**
 * The trust translator is the safety centerpiece — these tests pin the grade bands AND the action
 * gate (the rule the UI badges and the agent's publish gate both rely on). The most important
 * assertion is that a coin-flip / unmeasured model is BLOCKED from being acted on (fail-safe).
 */
describe('deriveTrustVerdict', () => {
  it('grades a strong classification model Good and unlocks actions', () => {
    const v = deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.78, Accuracy: 0.8 }), Metrics: null, ProblemType: 'classification' });
    expect(v.grade).toBe('Good');
    expect(v.canAct).toBe(true);
    expect(v.gateReason).toBeNull();
    expect(v.oneLiner).toBe('Right about 8 out of 10 times.');
    expect(v.headlineMetric).toEqual({ key: 'AUC', value: 0.78 });
    expect(v.unknown).toBe(false);
  });

  it('grades a coin-flip model Poor and BLOCKS acting (the safety gate)', () => {
    const v = deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.513, Accuracy: 0.8 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Poor');
    expect(v.canAct).toBe(false);
    expect(v.gateReason).toMatch(/guessing/i);
    expect(v.oneLiner).toMatch(/guessing/i);
  });

  it('grades Excellent at high AUC and Fair in the 0.6–0.7 band (allowed, with caution)', () => {
    expect(deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.92 }), ProblemType: 'classification' }).grade).toBe('Excellent');
    const fair = deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.65, Accuracy: 0.68 }), ProblemType: 'classification' });
    expect(fair.grade).toBe('Fair');
    expect(fair.canAct).toBe(true);
  });

  it('judges regression on R²', () => {
    expect(deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ R2: 0.6 }), ProblemType: 'regression' }).grade).toBe('Good');
    const poor = deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ R2: 0.1 }), ProblemType: 'regression' });
    expect(poor.grade).toBe('Poor');
    expect(poor.canAct).toBe(false);
  });

  it('prefers honest holdout metrics over optimistic training metrics', () => {
    const v = deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.78 }), Metrics: JSON.stringify({ AUC: 0.99 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Good'); // 0.78 (holdout), not 0.99 (training)
    expect(v.headlineMetric?.value).toBe(0.78);
  });

  it('falls back to Accuracy when AUC is absent', () => {
    const v = deriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ Accuracy: 0.82 }), ProblemType: 'classification' });
    expect(v.headlineMetric?.key).toBe('Accuracy');
    expect(v.grade).toBe('Good');
  });

  it('gates OFF an unmeasured model (fail-safe, never fail-open)', () => {
    const v = deriveTrustVerdict({ HoldoutMetrics: null, Metrics: null, ProblemType: 'classification' });
    expect(v.unknown).toBe(true);
    expect(v.canAct).toBe(false);
    expect(v.gateReason).toMatch(/locked/i);
  });

  it('tolerates garbage metric JSON (→ unknown → gated off)', () => {
    const v = deriveTrustVerdict({ HoldoutMetrics: 'not json', ProblemType: 'classification' });
    expect(v.unknown).toBe(true);
    expect(v.canAct).toBe(false);
  });
});

describe('trustEvidenceLine / trustDots', () => {
  it('builds the evidence line with a real count, and never fabricates one', () => {
    expect(trustEvidenceLine({ count: 2137, noun: 'members' })).toBe('Checked against 2,137 past members it had never seen.');
    expect(trustEvidenceLine()).toBe('Checked against past records it had never seen.');
  });

  it('maps grades to filled dots', () => {
    expect(trustDots('Excellent')).toBe(5);
    expect(trustDots('Good')).toBe(4);
    expect(trustDots('Fair')).toBe(3);
    expect(trustDots('Poor')).toBe(1);
  });
});
