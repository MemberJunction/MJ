import { describe, it, expect } from 'vitest';
import { EvaluationProtocolRules, EvaluationProtocol, PredictionUnit, type PredictionUnitSpec } from '../index';
import { ProtocolRows, type EvaluationProtocolRowTarget, type PredictionUnitRowTarget, type UnitDraft } from '../protocol-rows';

const unit: PredictionUnitSpec = {
  id: '11111111-2222-4333-8444-555555555555', lineageRootId: '11111111-2222-4333-8444-555555555555', version: 3, name: 'Spend',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Spend' }, windowDays: 1, gapDays: 0, outcome: { kind: 'continuous' }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } }, history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'a', actorRole: 'r', capacityPerPeriod: null, period: 'year' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'system', component: 'C1-prediction-unit' },
};
const author = { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' } as const;
/** The ID a database default gave the row before the writer ran; a later version must leave it alone. */
const PRESET_ID = '99999999-8888-4777-8666-555555555555';

const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
  Unit: unit, Name: 'Spend protocol',
  Holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
  Candidates: 1, Seed: 7,
});

function emptyProtocolRow(id: string): EvaluationProtocolRowTarget {
  return {
    ID: id, LineageRootID: '', Version: 0, Name: '', Description: null, Holdout: '', InnerValidation: '', Seed: 0, HoldoutAccessBudget: 0,
    PrimaryScore: '', SecondaryMetrics: '', Baselines: '', Calibration: '', Resampling: '', Intervals: '', Promotion: '',
    AllowedOutcomes: '', LeakageAudit: '', Exclusions: '', Slices: '', PredictionIntervals: null, ResidualDiagnostics: null,
    RetrainTriggers: '', SearchStrategy: '', Budgets: '', MinMinorityClassRows: 0, GuardFieldsEditableBy: '', AuthoredBy: '',
  };
}

function emptyUnitRow(id: string): PredictionUnitRowTarget {
  return {
    ID: id, LineageRootID: '', Version: 0, LabelVersion: 0, Name: '', Description: null, UnitRows: '', LabelRule: '', LabelWindowDays: 0,
    LabelGapDays: 0, TaskType: '', Censoring: '', ChangeHistoryPolicy: '', GroupKey: null, TemporalSpec: null, DecisionSpec: '',
    IncumbentHeuristic: '', AuthoredBy: '',
  };
}

const unitDraft: UnitDraft = {
  Name: 'Spend', Description: 'Annual spend', UnitRows: unit.rows, LabelRule: unit.label.rule, LabelWindowDays: 30, LabelGapDays: 2,
  TaskType: unit.label.outcome, Censoring: unit.censoring, ChangeHistoryPolicy: unit.history, GroupKey: 'PersonID', TemporalSpec: null,
  DecisionSpec: unit.decision, IncumbentHeuristic: unit.incumbent,
};

describe('NewVersionRowID', () => {
  it('is an upper-case UUID, a new one each call', () => {
    const a = ProtocolRows.NewVersionRowID();
    expect(a).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
    expect(ProtocolRows.NewVersionRowID()).not.toBe(a);
  });
});

describe('ApplyProtocolDraftToRow', () => {
  it('writes every column of a version-1 row that is its own lineage root and parses back to the same protocol', () => {
    const row = emptyProtocolRow('');
    const id = ProtocolRows.NewVersionRowID();
    ProtocolRows.ApplyProtocolDraftToRow(row, draft, { ID: id, LineageRootID: id, Version: 1, AuthoredBy: author, Description: 'Spend v1' });
    expect(row.ID).toBe(id);
    expect(row.LineageRootID).toBe(id);
    expect(row.Name).toBe('Spend protocol');
    expect(row.Description).toBe('Spend v1');
    expect(JSON.parse(row.AllowedOutcomes)).toEqual(['model', 'keep-simple-baseline', 'no-signal']);
    expect(JSON.parse(row.PredictionIntervals || 'null')).toEqual({ method: 'split-conformal', nominalCoverage: [0.8, 0.9] });
    expect(EvaluationProtocol.GetEvaluationProtocolShapeProblems(row)).toEqual([]);
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
    expect(parsed.Ok && parsed.Value.holdout).toEqual(draft.holdout);
    expect(parsed.Ok && parsed.Value.authoredBy).toEqual(author);
  });
  it('leaves the row ID alone for a later version, which points at version 1', () => {
    const row = emptyProtocolRow(PRESET_ID);
    ProtocolRows.ApplyProtocolDraftToRow(row, draft, { ID: null, LineageRootID: '33333333-4444-4555-8666-777777777777', Version: 2, AuthoredBy: author, Description: null });
    expect(row.ID).toBe(PRESET_ID);
    expect([row.Version, row.LineageRootID, row.Description]).toEqual([2, '33333333-4444-4555-8666-777777777777', null]);
  });
});

describe('ApplyPredictionUnitDraftToRow', () => {
  it('writes every column of a version-1 row and parses back to the same unit', () => {
    const row = emptyUnitRow('');
    const id = ProtocolRows.NewVersionRowID();
    ProtocolRows.ApplyPredictionUnitDraftToRow(row, unitDraft, { ID: id, LineageRootID: id, Version: 1, LabelVersion: 1, AuthoredBy: author });
    expect([row.ID, row.LineageRootID, row.Version, row.LabelVersion]).toEqual([id, id, 1, 1]);
    expect([row.Name, row.Description, row.LabelWindowDays, row.LabelGapDays, row.GroupKey]).toEqual(['Spend', 'Annual spend', 30, 2, 'PersonID']);
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (!parsed.Ok) throw new Error(parsed.Errors.join('; '));
    expect(parsed.Value.rows).toEqual(unit.rows);
    expect(parsed.Value.label).toEqual({ rule: unit.label.rule, windowDays: 30, gapDays: 2, outcome: unit.label.outcome, labelVersion: 1 });
    expect(parsed.Value.authoredBy).toEqual(author);
  });
  it('leaves the row ID alone for a later version and writes its lineage, version and label version', () => {
    const row = emptyUnitRow(PRESET_ID);
    ProtocolRows.ApplyPredictionUnitDraftToRow(row, unitDraft, { ID: null, LineageRootID: unit.lineageRootId, Version: 4, LabelVersion: 2, AuthoredBy: author });
    expect([row.ID, row.LineageRootID, row.Version, row.LabelVersion]).toEqual([PRESET_ID, unit.lineageRootId, 4, 2]);
  });
});
