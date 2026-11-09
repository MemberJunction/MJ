import { describe, it, expect } from 'vitest';
import type { PredictionUnitSpec } from '../index';
import { UnitEdits, type UnitEditForm } from '../unit-edit';

const form: UnitEditForm = {
  Name: 'Member renewal', GrainEntity: 'Membership Years', DecisionDateColumn: 'StartDate', LabelColumn: 'Renewed',
  WindowDays: 365, GapDays: 0, TaskKind: 'binary', ClassOrder: 'Lapsed, Renewed', AdverseClass: 'Lapsed', TweediePower: 1.5,
  CensoringMode: 'now', CensoringFixedAt: '', GroupKey: 'PersonID',
};

function asSpec(r: ReturnType<typeof UnitEdits.ApplyUnitEdits>, version: number): PredictionUnitSpec {
  if (!r.Ok) throw new Error(r.Error);
  const d = r.Draft;
  return {
    id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version, name: d.Name,
    rows: d.UnitRows, label: { rule: d.LabelRule, windowDays: d.LabelWindowDays, gapDays: d.LabelGapDays, outcome: d.TaskType, labelVersion: r.LabelVersion },
    censoring: d.Censoring, history: d.ChangeHistoryPolicy, groupKey: d.GroupKey, temporal: d.TemporalSpec, decision: d.DecisionSpec,
    incumbent: d.IncumbentHeuristic, authoredBy: { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' },
  };
}

describe('unit editing', () => {
  it('builds version 1 with label version 1 and the adverse class as an index into the class order', () => {
    const r = UnitEdits.ApplyUnitEdits(null, form);
    if (!r.Ok) throw new Error(r.Error);
    expect(r.Draft.TaskType).toEqual({ kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 });
    expect(r.Draft.LabelRule).toEqual({ kind: 'column', column: 'Renewed' });
    expect(r.Draft.UnitRows).toEqual({ kind: 'grain', grainEntity: 'Membership Years', decisionDate: { kind: 'column', column: 'StartDate' }, filter: [] });
    expect(r.LabelVersion).toBe(1);
    expect(r.Draft.GroupKey).toBe('PersonID');
  });
  it('bumps the label version when the outcome definition changes and keeps it otherwise', () => {
    const v1 = asSpec(UnitEdits.ApplyUnitEdits(null, form), 1);
    const relabel = UnitEdits.ApplyUnitEdits(v1, { ...UnitEdits.UnitEditFormFrom(v1), WindowDays: 400 });
    const regroup = UnitEdits.ApplyUnitEdits(v1, { ...UnitEdits.UnitEditFormFrom(v1), GroupKey: '' });
    const retask = UnitEdits.ApplyUnitEdits(v1, { ...UnitEdits.UnitEditFormFrom(v1), AdverseClass: 'Renewed' });
    expect(relabel.Ok && relabel.LabelVersion).toBe(2);
    expect(regroup.Ok && regroup.LabelVersion).toBe(1);
    expect(regroup.Ok && regroup.Draft.GroupKey).toBeNull();
    expect(retask.Ok && retask.LabelVersion).toBe(2);
  });
  it('reads a version back into the form it was built from', () => {
    const v1 = asSpec(UnitEdits.ApplyUnitEdits(null, form), 1);
    expect(UnitEdits.UnitEditFormFrom(v1)).toEqual(form);
  });
  it('refuses a binary unit whose class order is not two classes or whose adverse class is not one of them', () => {
    expect(UnitEdits.ApplyUnitEdits(null, { ...form, ClassOrder: 'A, B, C' })).toEqual({ Ok: false, Error: 'A binary outcome needs exactly two classes in artifact order, e.g. "Lapsed, Renewed".' });
    expect(UnitEdits.ApplyUnitEdits(null, { ...form, AdverseClass: 'Gone' })).toEqual({ Ok: false, Error: 'The adverse class "Gone" is not one of: Lapsed, Renewed.' });
  });
  it('builds a multiclass outcome with every adverse class as an index, and refuses an unknown adverse class', () => {
    const multi: UnitEditForm = { ...form, TaskKind: 'multiclass', ClassOrder: 'Gold, Silver, Bronze, None', AdverseClass: 'None, Bronze' };
    const r = UnitEdits.ApplyUnitEdits(null, multi);
    if (!r.Ok) throw new Error(r.Error);
    expect(r.Draft.TaskType).toEqual({ kind: 'multiclass', classOrder: ['Gold', 'Silver', 'Bronze', 'None'], adverseIndices: [3, 2] });
    expect(UnitEdits.ApplyUnitEdits(null, { ...multi, AdverseClass: 'Platinum' })).toEqual({ Ok: false, Error: 'Every adverse class must be one of: Gold, Silver, Bronze, None.' });
  });
  it('accepts a fixed censoring date that is a calendar day and refuses any other', () => {
    const fixed = UnitEdits.ApplyUnitEdits(null, { ...form, CensoringMode: 'fixed', CensoringFixedAt: '2026-06-30' });
    expect(fixed.Ok && fixed.Draft.Censoring).toEqual({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-06-30' } });
    expect(UnitEdits.ApplyUnitEdits(null, { ...form, CensoringMode: 'fixed', CensoringFixedAt: '2026-02-30' })).toEqual({ Ok: false, Error: 'The censoring date must be yyyy-mm-dd (got "2026-02-30").' });
  });
  it('refuses a window under one day, a negative gap and a blank name', () => {
    expect(UnitEdits.ApplyUnitEdits(null, { ...form, WindowDays: 0 })).toEqual({ Ok: false, Error: 'The outcome window must be a whole number of days, at least 1.' });
    expect(UnitEdits.ApplyUnitEdits(null, { ...form, GapDays: -1 })).toEqual({ Ok: false, Error: 'The gap must be a whole number of days, 0 or more.' });
    expect(UnitEdits.ApplyUnitEdits(null, { ...form, Name: ' ' })).toEqual({ Ok: false, Error: 'The unit needs a name.' });
  });
});
