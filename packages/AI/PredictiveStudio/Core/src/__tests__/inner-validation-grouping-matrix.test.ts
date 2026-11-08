// The leaking combinations here are the ones `Sidecar/src/python/tests/test_folds.py::test_fold_leakage_matrix_names_which_builders_keep_a_group_together`
// shows leak; change one and the other.
import { describe, it, expect } from 'vitest';
import {
  type Actor, type EvaluationProtocolSpec, type HoldoutSplit, type InnerValidation, type PredictionUnitSpec, type TaskType, type TemporalSpec, type UnitRows,
} from '../index';
import { EvaluationProtocolRules, type EvaluationProtocolDraft, type ProtocolRefusal } from '../evaluation-protocol-rules';

const human: Actor = { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' };
const binary: TaskType = { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 };
const forecastTask: TaskType = { kind: 'forecast', valueKind: 'continuous' };
const monthly: TemporalSpec = {
  timeColumn: 'Month', horizonPeriods: 3, lags: [3, 12],
  rollingWindows: [{ endLag: 3, periods: 6, aggregate: 'mean' }], period: 'month', seasonality: 12,
};
const dateCarved: HoldoutSplit = { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null };
const rolling = (origins: number, horizonPeriods = 3): HoldoutSplit => ({ kind: 'rolling-origin', origins, horizonPeriods, gapPeriods: 0, minTrainPeriods: 24, window: 'expanding' });
const columnRows: UnitRows = { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] };

/** A unit version as the Prediction Unit parser returns it (shape of the test unit). */
function unit(outcome: TaskType, temporal: TemporalSpec | null = null, rows: UnitRows = columnRows, groupKey: string | null = null): PredictionUnitSpec {
  return {
    id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version: 1, name: 'members',
    rows,
    label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome, labelVersion: 1 },
    censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
    history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
    groupKey, temporal,
    decision: { action: 'call the member', actorRole: 'membership team', capacityPerPeriod: null, period: 'month' },
    incumbent: { kind: 'none' }, authoredBy: human,
  };
}

function holdoutFor(u: PredictionUnitSpec): HoldoutSplit {
  return u.label.outcome.kind === 'forecast' ? rolling(5) : dateCarved;
}

function draftFor(u: PredictionUnitSpec, holdout: HoldoutSplit): EvaluationProtocolDraft {
  return EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: u, Holdout: holdout, Candidates: 3, Seed: 42, Name: 'default' });
}

function protocol(d: EvaluationProtocolDraft): EvaluationProtocolSpec {
  return { ...d, id: 'P1', lineageRootId: 'P1', version: 1, authoredBy: human };
}

const plainBinary = unit(binary);
const groupedBinary = unit(binary, null, columnRows, 'HouseholdID');
const series = unit(forecastTask, monthly);
const groupedSeries = unit(forecastTask, monthly, columnRows, 'HouseholdID');

const cases: { readonly Name: string; readonly Inner: InnerValidation; readonly Grouped: boolean; readonly Expect: ProtocolRefusal['Kind'] | null }[] = [
  { Name: 'stratified on ungrouped', Inner: { kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 }, Grouped: false, Expect: null },
  { Name: 'stratified on grouped', Inner: { kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 }, Grouped: true, Expect: 'inner-validation-ungrouped' },
  { Name: 'grouped-kfold by the unit key', Inner: { kind: 'grouped-kfold', folds: 5, repeats: 3, groupKey: 'householdid' }, Grouped: true, Expect: null },
  { Name: 'grouped-kfold by another key', Inner: { kind: 'grouped-kfold', folds: 5, repeats: 3, groupKey: 'PersonID' }, Grouped: true, Expect: 'group-key-mismatch' },
  { Name: 'grouped-kfold on ungrouped', Inner: { kind: 'grouped-kfold', folds: 5, repeats: 3, groupKey: 'PersonID' }, Grouped: false, Expect: 'group-key-mismatch' },
  { Name: 'blocked-time without a key on grouped (forecast)', Inner: { kind: 'blocked-time', folds: 5, gapPeriods: 3, groupKey: null }, Grouped: true, Expect: 'inner-validation-ungrouped' },
  { Name: 'blocked-time by the unit key on grouped (forecast)', Inner: { kind: 'blocked-time', folds: 5, gapPeriods: 3, groupKey: 'HOUSEHOLDID' }, Grouped: true, Expect: null },
  { Name: 'blocked-time by another key on grouped (forecast)', Inner: { kind: 'blocked-time', folds: 5, gapPeriods: 3, groupKey: 'PersonID' }, Grouped: true, Expect: 'group-key-mismatch' },
  { Name: 'blocked-time without a key on ungrouped (forecast)', Inner: { kind: 'blocked-time', folds: 5, gapPeriods: 3, groupKey: null }, Grouped: false, Expect: null },
];

function unitFor(c: (typeof cases)[number]): PredictionUnitSpec {
  if (c.Inner.kind === 'blocked-time') return c.Grouped ? groupedSeries : series;
  return c.Grouped ? groupedBinary : plainBinary;
}

describe('inner validation × unit grouping', () => {
  it('refuses exactly the combinations that let one group\'s rows fall on both sides of an inner split (S2.6)', () => {
    for (const c of cases) {
      const u = unitFor(c);
      const p = protocol({ ...draftFor(u, holdoutFor(u)), innerValidation: c.Inner });
      const kinds = EvaluationProtocolRules.ValidateProtocolForUnit(p, u)
        .filter((r) => r.Kind === 'inner-validation-ungrouped' || r.Kind === 'group-key-mismatch')
        .map((r) => r.Kind);
      expect(kinds, c.Name).toEqual(c.Expect === null ? [] : [c.Expect]);
    }
  });
});
