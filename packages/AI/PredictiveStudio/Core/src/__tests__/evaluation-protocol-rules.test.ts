import { describe, it, expect } from 'vitest';
import {
  EvaluationProtocol, MIN_ROLLING_ORIGINS,
  type Actor, type EvaluationProtocolSpec, type HoldoutSplit, type PredictionUnitSpec, type TaskType, type TemporalSpec, type UnitRows,
} from '../index';
import {
  EvaluationProtocolRules,
  type EvaluationProtocolDraft,
  type ProtocolRefusal,
} from '../evaluation-protocol-rules';

const human: Actor = { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' };
const agent: Actor = { kind: 'agent', agentRunId: '9A1D2C3B-4E5F-4A6B-8C7D-0E1F2A3B4C5D' };
const job: Actor = { kind: 'scheduled-job', scheduledJobRunId: 'J1' };
const binary: TaskType = { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 };
const forecastTask: TaskType = { kind: 'forecast', valueKind: 'continuous' };
const monthly: TemporalSpec = {
  timeColumn: 'Month', horizonPeriods: 3, lags: [3, 12],
  rollingWindows: [{ endLag: 3, periods: 6, aggregate: 'mean' }], period: 'month', seasonality: 12,
};
const dateCarved: HoldoutSplit = { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null };
const seededRandom: HoldoutSplit = { kind: 'seeded-random', fraction: 0.25 };
const rolling = (origins: number, horizonPeriods = 3): HoldoutSplit => ({ kind: 'rolling-origin', origins, horizonPeriods, gapPeriods: 0, minTrainPeriods: 24, window: 'expanding' });
const columnRows: UnitRows = { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] };
const fixedRows: UnitRows = { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] };
const panelRows: UnitRows = { kind: 'grain-x-periods', grainEntity: 'Stores', childEntity: 'Store Months', foreignKey: 'StoreID', periodDate: 'Month', filter: [] };

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

function draftFor(u: PredictionUnitSpec, holdout: HoldoutSplit = dateCarved): EvaluationProtocolDraft {
  return EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: u, Holdout: holdout, Candidates: 3, Seed: 42, Name: 'default' });
}

function protocol(d: EvaluationProtocolDraft, version = 1, authoredBy: Actor = human): EvaluationProtocolSpec {
  return { ...d, id: version === 1 ? 'P1' : `P${version}`, lineageRootId: 'P1', version, authoredBy };
}

const series = unit(forecastTask, monthly);

describe('DefaultEvaluationProtocolDraft', () => {
  it('passes both rule sets for a matching unit of every task kind', () => {
    const cases: { readonly Unit: PredictionUnitSpec; readonly Holdout: HoldoutSplit }[] = [
      ...[binary, { kind: 'multiclass', classOrder: ['A', 'B', 'C'], adverseIndices: [2] } as const,
        { kind: 'continuous' } as const, { kind: 'count' } as const, { kind: 'non-negative', tweediePower: 1.5 } as const]
        .map((task: TaskType) => ({ Unit: unit(task), Holdout: dateCarved })),
      { Unit: unit(binary, null, columnRows, 'HouseholdID'), Holdout: dateCarved },
      { Unit: series, Holdout: rolling(MIN_ROLLING_ORIGINS) },
      { Unit: unit({ kind: 'forecast', valueKind: 'count' }, { ...monthly, seasonality: null }), Holdout: rolling(MIN_ROLLING_ORIGINS) },
      { Unit: unit(binary, null, fixedRows), Holdout: seededRandom },
    ];
    for (const c of cases) {
      const p = protocol(draftFor(c.Unit, c.Holdout));
      expect(EvaluationProtocolRules.ValidateProtocolForUnit(p, c.Unit)).toEqual([]);
      expect(EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: p, Previous: null, AuthoredBy: human })).toEqual([]);
    }
  });

  it('gives a forecast block-bootstrap intervals, no prediction intervals, no slices and a seasonal-naive season of 1 when the unit declares no seasonality', () => {
    const d = draftFor(unit(forecastTask, { ...monthly, seasonality: null }), rolling(MIN_ROLLING_ORIGINS));
    expect(d.intervals.method).toBe('block-bootstrap');
    expect(d.predictionIntervals).toBeNull();
    expect(d.slices).toEqual({ outOfTime: false, subgroups: [] });
    expect(d.baselines).toContainEqual({ kind: 'seasonal-naive', season: 1 });
    expect(draftFor(series, rolling(MIN_ROLLING_ORIGINS)).baselines).toContainEqual({ kind: 'seasonal-naive', season: 12 });
  });
});

describe('ValidateProtocolForUnit', () => {
  it('refuses ranking a Tweedie target by RMSE', () => {
    const u = unit({ kind: 'non-negative', tweediePower: 1.5 });
    const p = protocol({ ...draftFor(u), primaryScore: { family: 'continuous', metric: 'rmse' } });
    const refusals = EvaluationProtocolRules.ValidateProtocolForUnit(p, u);
    expect(refusals).toEqual([{ Kind: 'primary-score-family-mismatch', Declared: 'continuous', UnitTask: 'non-negative' }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
      'The primary score is a continuous score but the Prediction Unit\'s task is non-negative; candidates may only be ranked by a non-negative score.',
    );
  });

  it('refuses a lag and a rolling window that end inside the horizon', () => {
    const u = unit(forecastTask, { ...monthly, lags: [1, 12], rollingWindows: [{ endLag: 2, periods: 6, aggregate: 'sum' }] });
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(u, rolling(5))), u)).toEqual([
      { Kind: 'lag-inside-horizon', Lag: 1, HorizonPeriods: 3 },
      { Kind: 'rolling-window-inside-horizon', EndLag: 2, HorizonPeriods: 3 },
    ]);
  });

  it('accepts a lag and a window end equal to the horizon and refuses one period less', () => {
    const at = unit(forecastTask, { ...monthly, lags: [3], rollingWindows: [{ endLag: 3, periods: 6, aggregate: 'mean' }] });
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(at, rolling(5))), at)).toEqual([]);
    const below = unit(forecastTask, { ...monthly, lags: [2], rollingWindows: [{ endLag: 2, periods: 6, aggregate: 'mean' }] });
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(below, rolling(5))), below)).toEqual([
      { Kind: 'lag-inside-horizon', Lag: 2, HorizonPeriods: 3 },
      { Kind: 'rolling-window-inside-horizon', EndLag: 2, HorizonPeriods: 3 },
    ]);
  });

  it('refuses a rolling-origin horizon other than the unit\'s, and the lags it would then read inside', () => {
    const u = unit(forecastTask, { ...monthly, horizonPeriods: 1, lags: [1, 12], rollingWindows: [] });
    const refusals = EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(u, rolling(5, 3))), u);
    expect(refusals).toEqual([
      { Kind: 'horizon-mismatch', ProtocolHorizonPeriods: 3, UnitHorizonPeriods: 1 },
      { Kind: 'lag-inside-horizon', Lag: 1, HorizonPeriods: 3 },
    ]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
      'The rolling-origin backtest scores a 3-period horizon but the Prediction Unit forecasts 1 period ahead; the two horizons must be equal.',
    );
  });

  it('refuses a rolling-origin horizon shorter than the unit\'s', () => {
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(series, rolling(5, 1))), series)).toEqual([
      { Kind: 'horizon-mismatch', ProtocolHorizonPeriods: 1, UnitHorizonPeriods: 3 },
    ]);
  });

  it('refuses blocked-time folds grouped by a key when the unit has no group key, naming that it has none', () => {
    const p = protocol({ ...draftFor(series, rolling(5)), innerValidation: { kind: 'blocked-time', folds: 5, gapPeriods: 3, groupKey: 'PersonID' } });
    const refusals = EvaluationProtocolRules.ValidateProtocolForUnit(p, series);
    expect(refusals).toEqual([{ Kind: 'group-key-mismatch', ProtocolGroupKey: 'PersonID', UnitGroupKey: null }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
      'The protocol groups its inner validation by "PersonID", but the Prediction Unit has no group key (its rows are grouped by their entity key); the folds would not be grouped the way the protocol says.',
    );
  });

  it('refuses a blocked-time inner gap shorter than the horizon', () => {
    const p = protocol({ ...draftFor(series, rolling(5)), innerValidation: { kind: 'blocked-time', folds: 5, gapPeriods: 1, groupKey: null } });
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(p, series)).toEqual([{ Kind: 'inner-gap-below-horizon', GapPeriods: 1, HorizonPeriods: 3 }]);
  });

  it('refuses a holdout kind that does not fit the unit', () => {
    const countSeries = unit({ kind: 'forecast', valueKind: 'count' }, monthly);
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(countSeries, dateCarved)), countSeries)).toContainEqual({ Kind: 'holdout-kind-mismatch', Holdout: 'date-carved', UnitTask: 'forecast' });
    const tabular = unit(binary);
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(tabular, rolling(5))), tabular)).toContainEqual({ Kind: 'holdout-kind-mismatch', Holdout: 'rolling-origin', UnitTask: 'binary' });
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(tabular, seededRandom)), tabular)).toContainEqual({ Kind: 'holdout-kind-mismatch', Holdout: 'seeded-random', UnitTask: 'binary' });
    const crossSectional = unit(binary, null, fixedRows);
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(crossSectional, dateCarved)), crossSectional)).toContainEqual({ Kind: 'holdout-kind-mismatch', Holdout: 'date-carved', UnitTask: 'binary' });
  });

  it('refuses inner folds grouped by a key other than the unit\'s group key, compared without case', () => {
    const grouped = unit(binary, null, columnRows, 'HouseholdID');
    const byPerson = protocol({ ...draftFor(grouped), innerValidation: { kind: 'grouped-kfold', folds: 5, repeats: 3, groupKey: 'PersonID' } });
    const refusals = EvaluationProtocolRules.ValidateProtocolForUnit(byPerson, grouped);
    expect(refusals).toEqual([{ Kind: 'group-key-mismatch', ProtocolGroupKey: 'PersonID', UnitGroupKey: 'HouseholdID' }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
      'The protocol groups its inner validation by "PersonID", but the Prediction Unit groups its rows by "HouseholdID"; the folds would not be grouped the way the protocol says.',
    );
    const sameKey = protocol({ ...draftFor(grouped), innerValidation: { kind: 'grouped-kfold', folds: 5, repeats: 3, groupKey: 'householdid' } });
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(sameKey, grouped)).toEqual([]);
    const ungrouped = unit(binary);
    expect(EvaluationProtocolRules.ValidateProtocolForUnit({ ...byPerson }, ungrouped)).toEqual([
      { Kind: 'group-key-mismatch', ProtocolGroupKey: 'PersonID', UnitGroupKey: null },
    ]);
  });

  it('refuses a new-entity report grouped by a key other than the unit\'s group key, compared without case', () => {
    const grouped = unit(binary, null, columnRows, 'HouseholdID');
    const report = (groupKey: string): HoldoutSplit => ({ ...dateCarved, newEntityReport: { groupKey, holdoutFraction: 0.2 } });
    const refusals = EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(grouped, report('PersonID'))), grouped);
    expect(refusals).toEqual([{ Kind: 'new-entity-group-key-mismatch', ReportGroupKey: 'PersonID', UnitGroupKey: 'HouseholdID' }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
      'The new-entity report holds out whole groups by "PersonID", but the Prediction Unit groups its rows by "HouseholdID"; the report would not hold out the groups the protocol names.',
    );
    expect(EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(grouped, report(' householdid '))), grouped)).toEqual([]);
    const ungrouped = unit(binary);
    const unnamed = EvaluationProtocolRules.ValidateProtocolForUnit(protocol(draftFor(ungrouped, report('PersonID'))), ungrouped);
    expect(unnamed).toEqual([{ Kind: 'new-entity-group-key-mismatch', ReportGroupKey: 'PersonID', UnitGroupKey: null }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(unnamed[0])).toBe(
      'The new-entity report holds out whole groups by "PersonID", but the Prediction Unit has no group key (its rows are grouped by their entity key); the report would not hold out the groups the protocol names.',
    );
  });

  describe('a forecast unit', () => {
    const forecastProtocol = (changes: Partial<EvaluationProtocolDraft>): EvaluationProtocolSpec => protocol({ ...draftFor(series, rolling(5)), ...changes });
    const only = (p: EvaluationProtocolSpec, u: PredictionUnitSpec = series): readonly ProtocolRefusal[] => EvaluationProtocolRules.ValidateProtocolForUnit(p, u);

    it('refuses declared prediction intervals', () => {
      const refusals = only(forecastProtocol({ predictionIntervals: { method: 'split-conformal', nominalCoverage: [0.8, 0.9] } }));
      expect(refusals).toEqual([{ Kind: 'forecast-prediction-intervals', Method: 'split-conformal' }]);
      expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
        'Forecast prediction-interval coverage is not available; this protocol declares split-conformal prediction intervals.',
      );
    });

    it('refuses declared slices', () => {
      const refusals = only(forecastProtocol({ slices: { outOfTime: true, subgroups: ['Region'] } }));
      expect(refusals).toEqual([{ Kind: 'forecast-slices', OutOfTime: true, Subgroups: ['Region'] }]);
      expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
        'Forecast slices are not available; this protocol declares out-of-time and subgroups Region.',
      );
    });

    it('refuses declared subgroup slices without an out-of-time slice', () => {
      const refusals = only(forecastProtocol({ slices: { outOfTime: false, subgroups: ['Region'] } }));
      expect(refusals).toEqual([{ Kind: 'forecast-slices', OutOfTime: false, Subgroups: ['Region'] }]);
      expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe('Forecast slices are not available; this protocol declares subgroups Region.');
    });

    it('refuses a protocol without a seasonal-naive baseline', () => {
      const d = draftFor(series, rolling(5));
      const refusals = only(forecastProtocol({ baselines: d.baselines.filter((b) => b.kind !== 'seasonal-naive') }));
      expect(refusals).toEqual([{ Kind: 'forecast-no-seasonal-naive' }]);
      expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
        'A forecast needs a declared seasonal-naive baseline: its season sets the MASE scale and it is a member of the publishing gate.',
      );
    });

    it('refuses intervals that do not resample whole rolling origins', () => {
      const refusals = only(forecastProtocol({ intervals: { level: 0.95, method: 'bootstrap', resamples: 2000, pairedTest: 'paired-bootstrap' } }));
      expect(refusals).toEqual([{ Kind: 'forecast-interval-method', Method: 'bootstrap' }]);
      expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
        'A forecast\'s intervals resample whole rolling origins (block-bootstrap); this protocol declares bootstrap.',
      );
    });

    it('refuses a unit with one series per grain record, naming the one-series limit', () => {
      const panel = unit(forecastTask, monthly, panelRows);
      const refusals = only(protocol(draftFor(panel, rolling(5))), panel);
      expect(refusals).toEqual([{ Kind: 'forecast-multiple-series', GrainEntity: 'Stores' }]);
      expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe(
        'A forecast trains one series per snapshot; this Prediction Unit has a row per Stores record per period, one series per Stores record (panel forecasts are not available).',
      );
    });
  });
});

describe('ValidateEvaluationProtocol', () => {
  it('refuses a protocol without a dummy baseline', () => {
    const d = draftFor(unit(binary));
    const refusals = EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: protocol({ ...d, baselines: d.baselines.filter((x) => x.kind !== 'dummy') }), Previous: null, AuthoredBy: human });
    expect(refusals).toEqual([{ Kind: 'no-dummy-baseline' }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refusals[0])).toBe('A dummy baseline (base rate or mean) is required: it is the "no signal" yardstick of the gate.');
  });

  it('lets every non-agent author change guard fields under the default non-agent setting, and refuses an agent tool call', () => {
    const u = unit(binary);
    const v1 = protocol(draftFor(u), 1, { kind: 'system', component: 'default-protocol' });
    expect(v1.guardFieldsEditableBy).toBe('non-agent');
    const margin = { ...v1.promotion, margin: EvaluationProtocol.ToNonNegative(0.01) };
    for (const author of [human, job, { kind: 'system', component: 'shipped-metadata' } as const]) {
      expect(EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: protocol({ ...draftFor(u), promotion: margin }, 2, author), Previous: v1, AuthoredBy: author })).toEqual([]);
    }
    const refused = EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: protocol({ ...draftFor(u), promotion: margin }, 2, agent), Previous: v1, AuthoredBy: agent });
    expect(refused).toEqual([{ Kind: 'guard-field-edited-by-disallowed-author', Fields: ['promotion'], Author: 'agent', Setting: 'non-agent' }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refused[0])).toBe(
      'An agent tool call cannot change the guard fields promotion; they are set in protocol configuration (UI, a non-agent API caller, a scheduled job or shipped metadata).',
    );
    expect(EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: protocol({ ...draftFor(u), guardFieldsEditableBy: 'human-only' }, 2, agent), Previous: v1, AuthoredBy: agent })).toEqual([
      { Kind: 'guard-field-edited-by-disallowed-author', Fields: ['guardFieldsEditableBy'], Author: 'agent', Setting: 'non-agent' },
    ]);
    const seedOnly = protocol({ ...draftFor(u), seed: 7 }, 2, agent);
    expect(EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: seedOnly, Previous: v1, AuthoredBy: agent })).toEqual([]);
  });

  it('in a human-only lineage accepts guard-field changes and the switch back to non-agent only from a user', () => {
    const u = unit(binary);
    const v1 = protocol({ ...draftFor(u), guardFieldsEditableBy: 'human-only' }, 1);
    const v2 = protocol({ ...draftFor(u), guardFieldsEditableBy: 'human-only', promotion: { ...v1.promotion, margin: EvaluationProtocol.ToNonNegative(0.01) } }, 2, job);
    const refused = EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: v2, Previous: v1, AuthoredBy: job });
    expect(refused).toEqual([{ Kind: 'guard-field-edited-by-disallowed-author', Fields: ['promotion'], Author: 'scheduled-job', Setting: 'human-only' }]);
    expect(EvaluationProtocolRules.DescribeProtocolRefusal(refused[0])).toBe(
      'This protocol is set to human-only guard fields: only a version authored by a user may change promotion; this version was authored by: scheduled-job.',
    );
    expect(EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: { ...v2, authoredBy: human }, Previous: v1, AuthoredBy: human })).toEqual([]);
    const relaxed = protocol({ ...draftFor(u), guardFieldsEditableBy: 'non-agent' }, 2, job);
    expect(EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: relaxed, Previous: v1, AuthoredBy: job })).toEqual([
      { Kind: 'guard-field-edited-by-disallowed-author', Fields: ['guardFieldsEditableBy'], Author: 'scheduled-job', Setting: 'human-only' },
    ]);
    expect(EvaluationProtocolRules.ValidateEvaluationProtocol({ Protocol: { ...relaxed, authoredBy: human }, Previous: v1, AuthoredBy: human })).toEqual([]);
  });
});

describe('MayEditGuardFields', () => {
  it('lets every author but an agent edit under non-agent, and only a user under human-only', () => {
    const system: Actor = { kind: 'system', component: 'shipped-metadata' };
    expect([human, agent, job, system].map((a) => EvaluationProtocolRules.MayEditGuardFields(a, 'non-agent'))).toEqual([true, false, true, true]);
    expect([human, agent, job, system].map((a) => EvaluationProtocolRules.MayEditGuardFields(a, 'human-only'))).toEqual([true, false, false, false]);
  });
});

describe('ChangedGuardFields', () => {
  it('ignores key order inside a guard field', () => {
    const u = unit(binary);
    const v1 = protocol(draftFor(u), 1);
    const reordered = protocol({ ...draftFor(u), budgets: { hardStop: true, maxCandidates: v1.budgets.maxCandidates, maxTokens: v1.budgets.maxTokens, maxComputeSeconds: v1.budgets.maxComputeSeconds } }, 2);
    expect(EvaluationProtocolRules.ChangedGuardFields(v1, reordered)).toEqual([]);
  });
});

describe('EvaluationProtocolColumnsFromDraft', () => {
  it('writes columns that the protocol parser reads back to the same protocol, for every holdout kind', () => {
    const drafts = [draftFor(unit(binary)), draftFor(unit(binary, null, fixedRows), seededRandom), draftFor(series, rolling(5))];
    for (const d of drafts) {
      const columns = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(d, { ID: 'P1', LineageRootID: 'P1', Version: 1, AuthoredBy: human });
      expect(EvaluationProtocol.ParseEvaluationProtocolRow(columns)).toEqual({ Ok: true, Value: { ...d, id: 'P1', lineageRootId: 'P1', version: 1, authoredBy: human } });
      expect(EvaluationProtocolRules.DraftFromProtocolSpec(protocol(d))).toEqual(d);
    }
  });

  it('is refused by the shape check and the parser below five rolling origins and for a seeded-random fraction outside (0, 1)', () => {
    expect(MIN_ROLLING_ORIGINS).toBe(5);
    const columnsOf = (holdout: HoldoutSplit) => EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft({ ...draftFor(unit(binary, null, fixedRows), seededRandom), holdout }, { ID: 'P1', LineageRootID: 'P1', Version: 1, AuthoredBy: human });
    const tooFew = columnsOf(rolling(4));
    expect(EvaluationProtocol.GetEvaluationProtocolShapeProblems(tooFew)).toEqual(['Holdout rolling-origin needs at least 5 origins (4 given)']);
    const parsedTooFew = EvaluationProtocol.ParseEvaluationProtocolRow(tooFew);
    expect(parsedTooFew.Ok === false && parsedTooFew.Errors).toContain('Holdout rolling-origin needs origins>=5, horizonPeriods>=1, gapPeriods>=0, minTrainPeriods>=1, window expanding|sliding');
    for (const fraction of [0, 1, 1.5]) {
      const bad = columnsOf({ kind: 'seeded-random', fraction });
      expect(EvaluationProtocol.GetEvaluationProtocolShapeProblems(bad)).toEqual(['Holdout seeded-random needs a fraction strictly between 0 and 1']);
      const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(bad);
      expect(parsed.Ok === false && parsed.Errors.includes('Holdout seeded-random needs a fraction strictly between 0 and 1')).toBe(true);
    }
    const unknown = { ...columnsOf(seededRandom), Holdout: JSON.stringify({ kind: 'k-fold' }) };
    expect(EvaluationProtocol.GetEvaluationProtocolShapeProblems(unknown)).toEqual(['Holdout kind must be date-carved, rolling-origin or seeded-random']);
  });
});
