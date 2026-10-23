import { describe, it, expect } from 'vitest';
import { EvaluationLineage, InvalidMajorityBaselineRuleError } from '../evaluation-record';

describe('evaluation record', () => {
  it('records out-of-sample validation and no withheld reason for an ordinary pipeline', () => {
    expect(EvaluationLineage.Build({ Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0.1 })).toEqual({
      ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null, MajorityBaselineRule: 'enforce', ImportanceKind: null,
    });
    expect(EvaluationLineage.Build({ Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0.1 }, { ValidationOutOfSample: false }).ValidationOutOfSample).toBe(false);
  });
  it('withholds the verdict when a time index is declared (not evaluated as a forecast)', () => {
    const record = EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' });
    expect(record).toEqual({ ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', EvaluatedAsForecast: false, WithheldReason: EvaluationLineage.NotEvaluatedAsForecast, MajorityBaselineRule: 'enforce', ImportanceKind: null });
  });
  it('round-trips through the Lineage JSON and tolerates lineage without it', () => {
    const record = EvaluationLineage.Build({ Strategy: 'holdout', LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex', MajorityBaselineRule: 'warn' });
    expect(EvaluationLineage.Read(JSON.stringify({ pipelineId: 'p', [EvaluationLineage.Key]: record }))).toEqual(record);
    expect(EvaluationLineage.Read(JSON.stringify({ pipelineId: 'p' }))).toBeNull();
    expect(EvaluationLineage.Read('not json')).toBeNull();
    expect(EvaluationLineage.Read(null)).toBeNull();
  });
  it("records the pipeline's majority-baseline rule, enforce when absent (D2-C5d)", () => {
    expect(EvaluationLineage.DefaultMajorityBaselineRule).toBe('enforce');
    expect(EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'warn' }).MajorityBaselineRule).toBe('warn');
    expect(EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'enforce' }).MajorityBaselineRule).toBe('enforce');
    // a record stored before the rule existed reads as the default
    const legacy = { ValidationOutOfSample: true, TimeIndexColumn: null, EvaluatedAsForecast: false, WithheldReason: null };
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: legacy }))?.MajorityBaselineRule).toBe('enforce');
  });
  it('refuses an unknown majority-baseline rule instead of ignoring it', () => {
    expect(EvaluationLineage.ParseMajorityBaselineRule(undefined)).toBe('enforce');
    expect(EvaluationLineage.ParseMajorityBaselineRule('')).toBe('enforce');
    expect(EvaluationLineage.ParseMajorityBaselineRule('warn')).toBe('warn');
    expect(() => EvaluationLineage.ParseMajorityBaselineRule('off')).toThrow(InvalidMajorityBaselineRuleError);
    expect(() => EvaluationLineage.ParseMajorityBaselineRule('off')).toThrow("ValidationStrategy.MajorityBaselineRule 'off' is not one of 'enforce', 'warn'");
  });
});
