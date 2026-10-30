import { describe, it, expect } from 'vitest';
import { EvaluationProtocol, TRAINING_RUN_RESULTS_SCHEMA, TrainingRunResultsParser, type EvaluationProtocolSpec, type TaskType, type TrainerCompleted, type TrainingRunResults } from '../index';
import { GateRecords, type GateRecordArgs } from '../run-evaluation';
import { TrainerResultFixtures } from './fixtures/trainer-result';

const binary: TaskType = { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 };

/** Only the protocol fields the gate record reads matter here; the rest are the protocol parser's defaults for binary. */
const protocol: EvaluationProtocolSpec = {
  id: '33333333-4444-4555-8666-777777777777', lineageRootId: '33333333-4444-4555-8666-777777777777', version: 1, name: 'C1 default',
  holdout: { kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
  innerValidation: { kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 }, seed: 42, holdoutAccessBudget: 1,
  primaryScore: { family: 'binary', metric: 'log-loss' }, secondaryMetrics: ['auc'],
  baselines: [{ kind: 'dummy', name: 'base-rate' }, { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, { kind: 'glm', family: 'logistic', penalty: 'l2' }],
  calibration: { kind: 'auto', thresholdRows: 2000, fitOn: 'disjoint-calibration-fold' }, resampling: { kind: 'none' },
  intervals: { level: 0.95, method: 'bootstrap', resamples: 2000, pairedTest: 'paired-bootstrap' },
  promotion: { comparators: [], incumbent: 'current-published', margin: EvaluationProtocol.ToNonNegative(0), lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' },
  allowedOutcomes: ['model', 'keep-simple-baseline', 'no-signal'],
  leakageAudit: { singleFeatureHeldOutAucMax: 0.95, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true },
  exclusions: { denyFields: [], denySources: [] }, slices: { outOfTime: true, subgroups: [] },
  predictionIntervals: null, residualDiagnostics: null, retrainTriggers: [], search: { kind: 'random', candidates: 2 },
  budgets: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 2, hardStop: true }, minMinorityClassRows: 20,
  guardFieldsEditableBy: 'non-agent', authoredBy: { kind: 'human', userId: '5E3B0C2A-6E2F-4C55-9E1A-2B1D7F0A9C11' },
};

const COUNTS = { rowsRead: 10, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 10, dataCutoff: '2026-01-01' };

const carve = (lapsed: number, renewed: number) => ({ holdoutClassCounts: { Lapsed: lapsed, Renewed: renewed }, holdoutPeriods: ['2024-01-01', '2024-02-01'] });

const args = (over: Partial<GateRecordArgs> = {}): GateRecordArgs => ({ Result: TrainerResultFixtures.C1KeepSimpleResult(), Protocol: protocol, Task: binary, Carve: carve(300, 905), ...over });

/** The C1 result where the finalist beats the dummy and the GLM, so the sidecar and the table both ship the model. */
const modelWins = (): TrainerCompleted => {
  const base = TrainerResultFixtures.C1KeepSimpleResult();
  return {
    ...base,
    comparisons: { ...base.comparisons, modelVsDummy: TrainerResultFixtures.Cmp(0.03, 0.01, 0.05), 'modelVs:glm': TrainerResultFixtures.Cmp(0.01, 0.002, 0.018) },
    gate: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
  };
};

describe('GateRecords.BuildStoredGateRecord', () => {
  it('stores the C1 keep-simple-baseline decision, its reason and the intervals', () => {
    const b = GateRecords.BuildStoredGateRecord(args());
    expect(b.Ok).toBe(true);
    if (!b.Ok) return;
    expect(b.Record.decision).toEqual({ outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null });
    expect(b.Record.transcribed).toEqual(b.Record.decision);
    expect(b.Record.guardRefusal).toBeNull();
    expect(b.Record.reason.code).toBe('simple-baseline-carries-signal');
    expect(b.Record.margin).toBe(0);
    expect(b.Record.primaryMetric).toBe('log-loss');
    expect(b.Record.evaluationProtocolId).toBe(protocol.id);
    expect(b.Record.holdoutRows).toBe(1205);
    expect(b.Record.intervals.memberVsDummy['glm']).toEqual({ value: 0.0239, lower: 0.011, upper: 0.036 });
    expect(b.Record.guards).toEqual({ taskKind: 'binary', holdoutClassCounts: { Lapsed: 300, Renewed: 905 }, modelAucInterval: { level: 0.95, lower: 0.59, upper: 0.688 }, minMinorityClassRows: 20 });
    expect(b.Record.incumbentDiff).toBeNull();
    expect(Object.keys(b.Record)).not.toContain('artifacts');
  });

  it('refuses a run whose sidecar gate differs from the engine decision', () => {
    const result: TrainerCompleted = { ...TrainerResultFixtures.C1KeepSimpleResult(), gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null } };
    const b = GateRecords.BuildStoredGateRecord(args({ Result: result }));
    expect(b.Ok).toBe(false);
    if (!b.Ok) expect(b.Refusal).toEqual({ kind: 'sidecar-gate-mismatch', sidecar: result.gate, engine: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null } });
  });

  it('refuses a sidecar gate on the same branch that ships a different member', () => {
    const result: TrainerCompleted = { ...TrainerResultFixtures.C1KeepSimpleResult(), gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'oneFeature', shippedRole: 'simpleBaseline', note: null } };
    const b = GateRecords.BuildStoredGateRecord(args({ Result: result }));
    expect(b.Ok ? null : b.Refusal.kind).toBe('sidecar-gate-mismatch');
  });

  it('refuses a result that lacks a comparison the gate needs, naming it', () => {
    const base = TrainerResultFixtures.C1KeepSimpleResult();
    const { glmVsDummy: _dropped, ...comparisons } = base.comparisons;
    const b = GateRecords.BuildStoredGateRecord(args({ Result: { ...base, comparisons } }));
    expect(b.Ok ? null : b.Refusal).toEqual({ kind: 'missing-comparison', comparison: 'glmVsDummy' });
  });

  it("stores a model outcome with the model's holdout AUC interval as the guard input", () => {
    const b = GateRecords.BuildStoredGateRecord(args({ Result: modelWins() }));
    if (!b.Ok) throw new Error(b.Refusal.kind);
    expect(b.Record.guards.modelAucInterval).toEqual({ level: 0.95, lower: 0.59, upper: 0.688 });
    expect(b.Record.decision).toEqual({ outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null });
    expect(b.Record.reason.code).toBe('model-beats-best-simple');
  });

  it('stores no-signal for a model whose holdout AUC interval contains 0.5', () => {
    const base = modelWins();
    const result: TrainerCompleted = { ...base, holdout: { ...base.holdout, secondary: [TrainerResultFixtures.Mwi('auc', 0.55, 0.48, 0.62)] } };
    const b = GateRecords.BuildStoredGateRecord(args({ Result: result }));
    if (!b.Ok) throw new Error(b.Refusal.kind);
    expect(b.Record.transcribed.outcome).toBe('model');
    expect(b.Record.decision.outcome).toBe('no-signal');
    expect(b.Record.guardRefusal).toEqual({ kind: 'auc-interval-contains-chance', lower: 0.48, upper: 0.62 });
  });

  it('stores no-signal with the guard reason when the minority class is below MinMinorityClassRows', () => {
    const b = GateRecords.BuildStoredGateRecord(args({ Result: modelWins(), Carve: carve(12, 88) }));
    if (!b.Ok) throw new Error(b.Refusal.kind);
    expect(b.Record.transcribed.outcome).toBe('model');
    expect(b.Record.decision.outcome).toBe('no-signal');
    expect(b.Record.reason.code).toBe('minority-class-below-minimum');
  });

  it('records which declared slices and holdout periods are missing, and slices without a finite interval', () => {
    const withSlices: EvaluationProtocolSpec = { ...protocol, slices: { outOfTime: true, subgroups: ['Region', 'TenureBand'] } };
    const result: TrainerCompleted = {
      ...TrainerResultFixtures.C1KeepSimpleResult(),
      slices: [
        { slice: { kind: 'subgroup', field: 'Region', value: 'NA' }, primary: TrainerResultFixtures.Mwi('log-loss', 0.37, 0.33, 0.41, 400) },
        { slice: { kind: 'subgroup', field: 'Region', value: 'EU' }, primary: TrainerResultFixtures.Mwi('log-loss', 0.38, 0.31, Number.POSITIVE_INFINITY, 12) },
        { slice: { kind: 'out-of-time', period: '2024-01-01' }, primary: TrainerResultFixtures.Mwi('log-loss', 0.36, 0.31, 0.41, 300) },
      ],
    };
    const b = GateRecords.BuildStoredGateRecord(args({ Protocol: withSlices, Result: result }));
    if (!b.Ok) throw new Error(b.Refusal.kind);
    expect(b.Record.sliceCoverage).toEqual({ missingSubgroups: ['TenureBand'], missingPeriods: ['2024-02-01'], slicesWithoutInterval: 1 });
  });

  it('reports no missing periods when the protocol declares no out-of-time slices, or the run has no carve', () => {
    const noOutOfTime = GateRecords.BuildStoredGateRecord(args({ Protocol: { ...protocol, slices: { outOfTime: false, subgroups: [] } } }));
    expect(noOutOfTime.Ok ? noOutOfTime.Record.sliceCoverage.missingPeriods : null).toEqual([]);
    const noCarve = GateRecords.BuildStoredGateRecord(args({ Carve: null }));
    expect(noCarve.Ok ? [noCarve.Record.sliceCoverage.missingPeriods, noCarve.Record.guards.holdoutClassCounts] : null).toEqual([[], null]);
  });

  it('stores a gate record the run-results parser reads back, and refuses one with a wrong-typed member', () => {
    const b = GateRecords.BuildStoredGateRecord(args());
    if (!b.Ok) throw new Error(b.Refusal.kind);
    const envelope = (gate: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: COUNTS, legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: null, gate });
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(b.Record));
    expect(ok.Ok && ok.Value.status === 'completed' ? ok.Value.gate : null).toEqual(b.Record);
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ ...b.Record, reason: { code: 'made-up', text: 'x' } }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/gate\.reason\.code/);
  });

  it('reads back and refuses a gate refusal on a refused envelope', () => {
    const envelope = (reason: object) => JSON.stringify({ schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: { stage: 'gate', reason } });
    const gate = TrainerResultFixtures.C1KeepSimpleResult().gate;
    const mismatch = { kind: 'sidecar-gate-mismatch', sidecar: gate, engine: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null } };
    const ok = TrainingRunResultsParser.ParseTrainingRunResults(envelope(mismatch));
    expect(ok.Ok && ok.Value.status === 'refused' ? ok.Value.refusal : null).toEqual({ stage: 'gate', reason: mismatch });
    const missing = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ kind: 'missing-comparison', comparison: 'glmVsDummy' }));
    expect(missing.Ok).toBe(true);
    const bad = TrainingRunResultsParser.ParseTrainingRunResults(envelope({ kind: 'sidecar-gate-mismatch', sidecar: gate, engine: { outcome: 'maybe' } }));
    expect(bad.Ok ? null : bad.Errors.join('\n')).toMatch(/refusal\.reason/);
  });
});

describe('GateRecords.ParseStoredGateRecord', () => {
  it('reads the gate member of a v2 envelope and rejects legacy ValidationResults', () => {
    const b = GateRecords.BuildStoredGateRecord(args());
    if (!b.Ok) throw new Error(b.Refusal.kind);
    const envelope: TrainingRunResults = {
      schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
      unitResolution: { rowsRead: 6673, censoredRowsExcluded: 1756, labelKnownRowsExcluded: 44, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 4873, dataCutoff: '2026-07-30' },
      legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: null, gate: b.Record,
    };
    expect(GateRecords.ParseStoredGateRecord(JSON.stringify(envelope))?.decision.shipped).toBe('glm');
    expect(GateRecords.ParseStoredGateRecord(JSON.stringify({ ...envelope, gate: null }))).toBeNull();
    expect(GateRecords.ParseStoredGateRecord(JSON.stringify({ metrics: { auc: 0.8 }, holdoutMetrics: null }))).toBeNull();
    expect(GateRecords.ParseStoredGateRecord(null)).toBeNull();
    expect(GateRecords.ParseStoredGateRecord('  ')).toBeNull();
  });
});
