import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { EvaluationLineage, InvalidMajorityBaselineRuleError } from '../evaluation-record';
import { IMPORTANCE_KINDS } from '../sidecar-contract';

/** The members of the sidecar's `ImportanceKind = Literal[...]` in `schemas.py`, in declaration order. */
function pythonImportanceKinds(source: string): string[] {
  const literal = /^ImportanceKind = Literal\[(.*)\]$/m.exec(source);
  if (!literal) throw new Error('schemas.py declares no ImportanceKind Literal');
  return [...literal[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('evaluation record', () => {
  it('records what the caller says about out-of-sample validation, and no withheld reason for an ordinary pipeline', () => {
    expect(EvaluationLineage.Build({ Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0.1 }, { ValidationOutOfSample: true })).toEqual({
      ValidationOutOfSample: true, TimeIndexColumn: null, WithheldReason: null, MajorityBaselineRule: 'enforce', ImportanceKind: null,
    });
    expect(EvaluationLineage.Build({ Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0.1 }, { ValidationOutOfSample: false }).ValidationOutOfSample).toBe(false);
  });
  it('withholds the verdict when a time index is declared (not evaluated as a forecast)', () => {
    const record = EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex' }, { ValidationOutOfSample: true });
    expect(record).toEqual({ ValidationOutOfSample: true, TimeIndexColumn: 'MonthIndex', WithheldReason: EvaluationLineage.NotEvaluatedAsForecast, MajorityBaselineRule: 'enforce', ImportanceKind: null });
  });
  it('round-trips through the Lineage JSON and tolerates lineage without it', () => {
    const record = EvaluationLineage.Build({ Strategy: 'holdout', LockedHoldoutFraction: 0.2, TimeIndexColumn: 'MonthIndex', MajorityBaselineRule: 'warn' }, { ValidationOutOfSample: true, ImportanceKind: 'none' });
    expect(EvaluationLineage.Read(JSON.stringify({ pipelineId: 'p', [EvaluationLineage.Key]: record }))).toEqual(record);
    expect(EvaluationLineage.Read(JSON.stringify({ pipelineId: 'p' }))).toBeNull();
    expect(EvaluationLineage.Read('not json')).toBeNull();
    expect(EvaluationLineage.Read(null)).toBeNull();
  });
  it('reads an evaluation that is an array or a string as absent', () => {
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: [{ ValidationOutOfSample: true }] }))).toBeNull();
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: 'out of sample' }))).toBeNull();
    expect(EvaluationLineage.Read(JSON.stringify([{ [EvaluationLineage.Key]: {} }]))).toBeNull();
  });
  it('reads a record stored before ImportanceKind existed with a null kind, and the other fields intact', () => {
    const legacy = { ValidationOutOfSample: true, TimeIndexColumn: null, WithheldReason: null, MajorityBaselineRule: 'warn' };
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: legacy }))).toEqual({
      ValidationOutOfSample: true, TimeIndexColumn: null, WithheldReason: null, MajorityBaselineRule: 'warn', ImportanceKind: null,
    });
  });
  it("reads ImportanceKind 'held_out_permutation'", () => {
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: { ImportanceKind: 'held_out_permutation' } }))?.ImportanceKind).toBe(
      'held_out_permutation',
    );
  });
  it('accepts exactly the importance kinds the sidecar declares in schemas.py', () => {
    const pythonFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../Sidecar/src/python/app/schemas.py');
    const python = pythonImportanceKinds(readFileSync(pythonFile, 'utf8'));
    // `ImportanceKind` is derived from IMPORTANCE_KINDS, so this holds the type to the Python literal too.
    expect([...IMPORTANCE_KINDS].sort()).toEqual([...python].sort());
  });
  it("reads ImportanceKind 'none' and drops an unknown kind", () => {
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: { ImportanceKind: 'none' } }))?.ImportanceKind).toBe('none');
    expect(EvaluationLineage.Read(JSON.stringify({ [EvaluationLineage.Key]: { ImportanceKind: 'shap' } }))?.ImportanceKind).toBeNull();
  });
  it("records the pipeline's majority-baseline rule, enforce when absent (D2-C5d)", () => {
    expect(EvaluationLineage.DefaultMajorityBaselineRule).toBe('enforce');
    expect(EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'warn' }, { ValidationOutOfSample: true }).MajorityBaselineRule).toBe('warn');
    expect(EvaluationLineage.Build({ Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2, MajorityBaselineRule: 'enforce' }, { ValidationOutOfSample: true }).MajorityBaselineRule).toBe('enforce');
    // a record stored before the rule existed reads as the default
    const legacy = { ValidationOutOfSample: true, TimeIndexColumn: null, WithheldReason: null };
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
