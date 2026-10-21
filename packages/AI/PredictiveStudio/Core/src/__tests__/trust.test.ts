import { describe, it, expect } from 'vitest';
import { TrustVerdicts, TrustDots } from '../trust';
import { EvaluationLineage, type EvaluationRecord } from '../evaluation-record';
import type { MajorityBaselineRule } from '../pipeline-spec';

/**
 * The trust translator is the safety centerpiece — these tests pin the grade bands AND the action
 * gate (the rule the UI badges and the agent's publish gate both rely on). The most important
 * assertion is that a coin-flip / unmeasured model is BLOCKED from being acted on (fail-safe).
 */
describe('TrustVerdicts.DeriveTrustVerdict', () => {
  it('grades a strong classification model Good and unlocks actions', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.78, Accuracy: 0.8 }), Metrics: null, ProblemType: 'classification' });
    expect(v.grade).toBe('Good');
    expect(v.canAct).toBe(true);
    expect(v.gateReason).toBeNull();
    expect(v.oneLiner).toBe('Right about 8 out of 10 times.');
    expect(v.headlineMetric).toEqual({ key: 'AUC', value: 0.78 });
    expect(v.unknown).toBe(false);
  });

  it('grades a coin-flip model Poor and BLOCKS acting (the safety gate)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.513, Accuracy: 0.8 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Poor');
    expect(v.canAct).toBe(false);
    expect(v.gateReason).toMatch(/guessing/i);
    expect(v.oneLiner).toMatch(/guessing/i);
  });

  it('grades Excellent at high AUC and Fair in the 0.6–0.7 band (allowed, with caution)', () => {
    expect(TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.92 }), ProblemType: 'classification' }).grade).toBe('Excellent');
    const fair = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.65, Accuracy: 0.68 }), ProblemType: 'classification' });
    expect(fair.grade).toBe('Fair');
    expect(fair.canAct).toBe(true);
  });

  it('judges regression on R²', () => {
    expect(TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ R2: 0.6 }), ProblemType: 'regression' }).grade).toBe('Good');
    const poor = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ R2: 0.1 }), ProblemType: 'regression' });
    expect(poor.grade).toBe('Poor');
    expect(poor.canAct).toBe(false);
  });

  it('prefers honest holdout metrics over optimistic training metrics', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ AUC: 0.78 }), Metrics: JSON.stringify({ AUC: 0.99 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Good'); // 0.78 (holdout), not 0.99 (training)
    expect(v.headlineMetric?.value).toBe(0.78);
  });

  it('grades accuracy only against the always-majority rate (F-TR-1)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ Accuracy: 0.82, baseline_accuracy: 0.6, predicted_classes: 2 }), ProblemType: 'classification' });
    expect(v.headlineMetric?.key).toBe('Accuracy');
    expect(v.grade).toBe('Good');
    const bare = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ Accuracy: 0.82 }), ProblemType: 'classification' });
    expect(bare.unknown).toBe(true);
    expect(bare.canAct).toBe(false);
  });

  it('gates OFF an unmeasured model (fail-safe, never fail-open)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: null, Metrics: null, ProblemType: 'classification' });
    expect(v.unknown).toBe(true);
    expect(v.canAct).toBe(false);
    expect(v.gateReason).toMatch(/locked/i);
  });

  it('tolerates garbage metric JSON (→ unknown → gated off)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: 'not json', ProblemType: 'classification' });
    expect(v.unknown).toBe(true);
    expect(v.canAct).toBe(false);
  });

  it('words the regression headline as an association, never as a cause (F-UI-1)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ r2: 0.31 }), ProblemType: 'regression' });
    expect(v.oneLiner).toBe('Accounts for about 31% of the variation in the outcome — an association, not a cause.');
  });

  /** A stored evaluation record; `MajorityBaselineRule` optional because records written before D2-C5d lack it. */
  type StoredEvaluation = Omit<EvaluationRecord, 'MajorityBaselineRule'> & { MajorityBaselineRule?: MajorityBaselineRule };
  const withEvaluation = (evaluation: StoredEvaluation): string => JSON.stringify({ pipelineId: 'p', [EvaluationLineage.Key]: evaluation });

  it('never grades a majority-class model from accuracy alone (F-TR-1: accuracy 0.95, f1 0)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ accuracy: 0.95, f1: 0 }), ProblemType: 'classification' });
    expect(v.canAct).toBe(false);
    expect(v.grade).toBe('Poor');
  });

  it('does not grade a one-row holdout (F-TR-2: accuracy 1, n = 1)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ accuracy: 1 }), ProblemType: 'classification' });
    expect(v.canAct).toBe(false);
  });

  it('ignores in-sample training metrics when no holdout exists (F-TR-3)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ Metrics: JSON.stringify({ auc: 1.0, accuracy: 1.0 }), ProblemType: 'classification' });
    expect(v.unknown).toBe(true);
    expect(v.canAct).toBe(false);
  });

  it('uses validation metrics when the evaluation record says they are out-of-sample', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({
      Metrics: JSON.stringify({ auc: 0.75 }), ProblemType: 'classification',
      Lineage: withEvaluation({ ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null }),
    });
    expect(v.grade).toBe('Good');
    expect(v.canAct).toBe(true);
  });

  it('grades a classifier at or below the majority rate Poor (W7 s42 and s43)', () => {
    const s42 = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.6241, accuracy: 0.905, baseline_accuracy: 0.921, predicted_classes: 2 }), ProblemType: 'classification' });
    const s43 = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.8279, accuracy: 0.921, baseline_accuracy: 0.968, predicted_classes: 2 }), ProblemType: 'classification' });
    for (const v of [s42, s43]) {
      expect(v.grade).toBe('Poor');
      expect(v.canAct).toBe(false);
      expect(v.gateReason).toMatch(/most common outcome/);
      expect(v.majorityBaseline).toMatchObject({ rule: 'enforce', enforced: true });
    }
  });

  it('grades a constant predictor Poor even with a high AUC', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.9, accuracy: 0.95, baseline_accuracy: 0.95, predicted_classes: 1 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Poor');
  });

  it('keeps a classifier that beats the majority rate', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: JSON.stringify({ auc: 0.78, accuracy: 0.85, baseline_accuracy: 0.8, predicted_classes: 2 }), ProblemType: 'classification' });
    expect(v.grade).toBe('Good');
    expect(v.canAct).toBe(true);
    expect(v.majorityBaseline).toBeNull();
  });

  // The W1-signal s42 logistic model (§9 risk R-b): holdout accuracy = the holdout renewal rate, AUC 0.723.
  const w1Logistic = JSON.stringify({ auc: 0.723, accuracy: 0.7957, baseline_accuracy: 0.7957, predicted_classes: 2 });
  const ruleLineage = (rule: MajorityBaselineRule): string =>
    withEvaluation({ ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null, MajorityBaselineRule: rule });

  it('enforce (the default, and when the lineage names it) grades the W1 logistic model Poor (D2-C5d)', () => {
    for (const lineage of [null, ruleLineage('enforce')]) {
      const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: w1Logistic, ProblemType: 'classification', Lineage: lineage });
      expect(v).toMatchObject({ grade: 'Poor', canAct: false });
      expect(v.majorityBaseline).toEqual({
        rule: 'enforce', enforced: true, accuracy: 0.7957, baselineAccuracy: 0.7957, predictedClasses: 2,
        note: 'Right 79.6% of the time; always guessing the most common outcome is right 79.6% of the time.',
      });
    }
  });

  it('warn grades the same model by AUC and keeps the finding visible (D2-C5d)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({ HoldoutMetrics: w1Logistic, ProblemType: 'classification', Lineage: ruleLineage('warn') });
    expect(v).toMatchObject({ grade: 'Good', canAct: true, gateReason: null, headlineMetric: { key: 'AUC', value: 0.723 } });
    expect(v.majorityBaseline).toMatchObject({ rule: 'warn', enforced: false, accuracy: 0.7957, baselineAccuracy: 0.7957 });
  });

  it('warn never rescues an accuracy-only verdict (F-TR-1 stays contained)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({
      HoldoutMetrics: JSON.stringify({ accuracy: 0.95, baseline_accuracy: 0.95, predicted_classes: 1 }), ProblemType: 'classification',
      Lineage: ruleLineage('warn'),
    });
    expect(v).toMatchObject({ grade: 'Poor', canAct: false });
    expect(v.majorityBaseline).toMatchObject({ rule: 'warn', enforced: true, note: 'Predicts the same outcome for every record.' });
  });

  it('withholds a time-indexed model and returns the stored reason (T4 → S6.5)', () => {
    const v = TrustVerdicts.DeriveTrustVerdict({
      HoldoutMetrics: JSON.stringify({ r2: 0.7775 }), ProblemType: 'regression',
      Lineage: withEvaluation({ ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast }),
    });
    expect(v).toMatchObject({ grade: 'Poor', canAct: false, withheldReason: EvaluationLineage.NotEvaluatedAsForecast });
    expect(v.gateReason).toMatch(/later/);
  });
});

describe('TrustVerdicts.TrustEvidenceLine / TrustDots', () => {
  it('builds the evidence line with a real count, and never fabricates one', () => {
    expect(TrustVerdicts.TrustEvidenceLine({ count: 2137, noun: 'members' })).toBe('Checked against 2,137 past members it had never seen.');
    expect(TrustVerdicts.TrustEvidenceLine()).toBe('Checked against past records it had never seen.');
  });

  it('maps grades to filled dots', () => {
    expect(TrustDots('Excellent')).toBe(5);
    expect(TrustDots('Good')).toBe(4);
    expect(TrustDots('Fair')).toBe(3);
    expect(TrustDots('Poor')).toBe(1);
  });
});
