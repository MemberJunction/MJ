import { describe, it, expect } from 'vitest';
import { EvaluationProtocolRules, type EvaluationProtocolSpec, type PredictionUnitSpec } from '../index';
import { ProtocolEdits, type ProtocolEditForm } from '../protocol-edit';

const unit: PredictionUnitSpec = {
  id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version: 1, name: 'Event visits',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Visits' }, windowDays: 365, gapDays: 0, outcome: { kind: 'count' }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } }, history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'month' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' },
};
const base: EvaluationProtocolSpec = {
  ...EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
    Unit: unit, Name: 'Visits protocol',
    Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
    Candidates: 3, Seed: 42,
  }),
  id: '33333333-4444-4555-8666-777777777777', lineageRootId: '33333333-4444-4555-8666-777777777777', version: 1,
  authoredBy: { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' },
};

function edited(changes: Partial<ProtocolEditForm>): ReturnType<typeof ProtocolEdits.ApplyProtocolEdits> {
  return ProtocolEdits.ApplyProtocolEdits(base, { ...ProtocolEdits.ProtocolEditFormFrom(base), ...changes });
}

describe('protocol editing (a new version from the previous one)', () => {
  it('offers only primary scores of the protocol family (no RMSE for a count protocol)', () => {
    expect(ProtocolEdits.PrimaryMetricOptions(base.primaryScore.family)).toEqual(['poisson-deviance']);
  });
  it('applies the form-editable fields and keeps the rest of the previous version', () => {
    const r = edited({ Cutoff: '2023-07-01', HoldoutEnd: '2024-07-01', Margin: 0.002, MaxCandidates: 6, GuardFieldsEditableBy: 'human-only' });
    if (!r.Ok) throw new Error(r.Error);
    expect(r.Draft.holdout).toEqual({ ...base.holdout, cutoff: '2023-07-01', holdoutEnd: '2024-07-01' });
    expect(r.Draft.promotion.margin).toBe(0.002);
    expect(r.Draft.budgets).toEqual({ ...base.budgets, maxCandidates: 6 });
    expect(r.Draft.guardFieldsEditableBy).toBe('human-only');
    expect(ProtocolEdits.ProtocolEditFormFrom(base).GuardFieldsEditableBy).toBe('non-agent');
    expect(r.Draft.baselines).toEqual(base.baselines);
    expect(r.Draft.exclusions).toEqual(base.exclusions);
    expect(Object.keys(r.Draft)).not.toContain('id');
    expect(Object.keys(r.Draft)).not.toContain('authoredBy');
  });
  it('applies folds and repeats to the inner validation and trims the name', () => {
    const r = edited({ Folds: 7, Repeats: 2, Name: '  Visits protocol v2  ' });
    if (!r.Ok) throw new Error(r.Error);
    expect(r.Draft.innerValidation).toMatchObject({ folds: 7, repeats: 2 });
    expect(r.Draft.name).toBe('Visits protocol v2');
  });
  it('refuses a negative margin, a malformed date and a metric from another family', () => {
    expect(edited({ Margin: -0.1 })).toEqual({ Ok: false, Error: 'The margin must be a number >= 0 (got -0.1).' });
    expect(edited({ Cutoff: '2024-1-1' })).toEqual({ Ok: false, Error: 'The test-set start must be a date yyyy-mm-dd (got "2024-1-1").' });
    expect(edited({ PrimaryMetric: 'rmse' })).toEqual({ Ok: false, Error: 'rmse is not a count score; choose one of: poisson-deviance.' });
  });
  it('refuses a test-set end on or before the start, and a malformed end', () => {
    const error = (end: string): string => `The test-set end must be a date yyyy-mm-dd after the start (got "${end}").`;
    expect(edited({ HoldoutEnd: '2023-12-31' })).toEqual({ Ok: false, Error: error('2023-12-31') });
    expect(edited({ HoldoutEnd: '2024-01-01' })).toEqual({ Ok: false, Error: error('2024-01-01') });
    expect(edited({ HoldoutEnd: '2024-13-01' })).toEqual({ Ok: false, Error: error('2024-13-01') });
  });
  it('refuses fewer than two folds and fewer than one repeat', () => {
    const error = { Ok: false, Error: 'Folds must be a whole number of at least 2 and repeats at least 1.' };
    expect(edited({ Folds: 1 })).toEqual(error);
    expect(edited({ Folds: 2.5 })).toEqual(error);
    expect(edited({ Repeats: 0 })).toEqual(error);
  });
  it('refuses a budget without a candidate or without compute seconds', () => {
    const error = { Ok: false, Error: 'The budget needs at least one candidate and a positive number of compute seconds.' };
    expect(edited({ MaxCandidates: 0 })).toEqual(error);
    expect(edited({ MaxComputeSeconds: 0 })).toEqual(error);
  });
  it('refuses a blank name', () => {
    expect(edited({ Name: '   ' })).toEqual({ Ok: false, Error: 'The protocol needs a name.' });
  });
});
