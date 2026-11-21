import { describe, it, expect } from 'vitest';
import { EvaluationProtocol, ALLOWED_OUTCOMES, type EvaluationProtocolColumns } from '../evaluation-protocol';

function protocolRow(overrides: Partial<EvaluationProtocolColumns> = {}): EvaluationProtocolColumns {
  return {
    ID: 'P1', LineageRootID: 'P1', Version: 1, Name: 'Renewal grading',
    Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null }),
    InnerValidation: JSON.stringify({ kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 }),
    Seed: 0, HoldoutAccessBudget: 1,
    PrimaryScore: JSON.stringify({ family: 'binary', metric: 'log-loss' }),
    SecondaryMetrics: JSON.stringify(['auc', 'calibration-slope']),
    Baselines: JSON.stringify([{ kind: 'dummy', name: 'base-rate' }, { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, { kind: 'glm', family: 'logistic', penalty: 'l2' }]),
    Calibration: JSON.stringify({ kind: 'auto', thresholdRows: 1000, fitOn: 'disjoint-calibration-fold' }),
    Resampling: JSON.stringify({ kind: 'none' }),
    Intervals: JSON.stringify({ level: 0.95, method: 'bootstrap', resamples: 1000, pairedTest: 'paired-bootstrap' }),
    Promotion: JSON.stringify({ comparators: [], incumbent: 'current-published', margin: 0, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' }),
    AllowedOutcomes: JSON.stringify(ALLOWED_OUTCOMES),
    LeakageAudit: JSON.stringify({ singleFeatureHeldOutAucMax: 0.9, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true }),
    Exclusions: JSON.stringify({ denyFields: ['Renewed2'], denySources: [] }),
    Slices: JSON.stringify({ outOfTime: true, subgroups: ['Region'] }),
    PredictionIntervals: null, ResidualDiagnostics: null,
    RetrainTriggers: JSON.stringify([]),
    SearchStrategy: JSON.stringify({ kind: 'random', candidates: 3 }),
    Budgets: JSON.stringify({ maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true }),
    MinMinorityClassRows: 20, GuardFieldsEditableBy: 'non-agent',
    AuthoredBy: JSON.stringify({ kind: 'human', userId: 'U1' }),
    ...overrides,
  };
}

describe('ParseEvaluationProtocolRow', () => {
  it('parses a complete binary protocol row into EvaluationProtocolSpec', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow());
    expect(r.Ok).toBe(true);
    if (r.Ok === false) return;
    expect(r.Value.holdout).toEqual({ kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null });
    expect(r.Value.primaryScore).toEqual({ family: 'binary', metric: 'log-loss' });
    expect(r.Value.search).toEqual({ kind: 'random', candidates: 3 });
    expect(r.Value.exclusions.denyFields).toEqual(['Renewed2']);
    expect(r.Value.minMinorityClassRows).toBe(20);
    expect(r.Value.guardFieldsEditableBy).toBe('non-agent');
    expect(r.Value.authoredBy).toEqual({ kind: 'human', userId: 'U1' });
    expect(r.Value.allowedOutcomes).toEqual(['model', 'keep-simple-baseline', 'no-signal']);
  });

  it('reads a missing holdoutEnd as null', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({ Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'D', cutoff: '2024-01-01', newEntityReport: null }) }));
    expect(r.Ok && r.Value.holdout.kind === 'date-carved' && r.Value.holdout.holdoutEnd).toBe(null);
  });

  it('reports every problem of a bad row', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({
      InnerValidation: JSON.stringify({ kind: 'leave-one-out' }),
      Baselines: JSON.stringify([{ kind: 'oracle' }]),
      SearchStrategy: '{not json',
      AuthoredBy: JSON.stringify({ kind: 'robot' }),
    }));
    expect(r.Ok).toBe(false);
    if (r.Ok === true) return;
    expect(r.Errors).toContain('InnerValidation must be repeated-stratified-kfold {folds>=2, repeats>=1}, grouped-kfold {folds>=2, repeats>=1, groupKey} or blocked-time {folds>=2, gapPeriods>=0, groupKey|null}');
    expect(r.Errors).toContain('Baselines[0] must be dummy, one-feature, glm, naive, seasonal-naive or incumbent-heuristic');
    expect(r.Errors.some((e) => e.startsWith('SearchStrategy is not valid JSON'))).toBe(true);
    expect(r.Errors.some((e) => e.startsWith('AuthoredBy must be an Actor'))).toBe(true);
  });

  it('refuses a nominal coverage outside (0, 1)', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({ PredictionIntervals: JSON.stringify({ method: 'split-conformal', nominalCoverage: [0.8, 1.2] }) }));
    expect(r.Ok).toBe(false);
    if (r.Ok === false) expect(r.Errors).toContain('PredictionIntervals.nominalCoverage must be a non-empty array of numbers strictly between 0 and 1');
  });

  it('refuses a newEntityReport that is present but not an object', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({ Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'D', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: 'yes' }) }));
    expect(r.Ok).toBe(false);
    if (r.Ok === false) expect(r.Errors).toContain('HoldoutSplit.newEntityReport must be null or {groupKey, holdoutFraction in (0,1)}');
  });

  it('refuses Promotion without a comparators array', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({ Promotion: JSON.stringify({ incumbent: 'none', margin: 0, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' }) }));
    expect(r.Ok).toBe(false);
    if (r.Ok === false) expect(r.Errors).toContain('Promotion.comparators must be an array of baseline specs');
  });

  it('refuses a negative or fractional Seed and a Version below 1, naming each column', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({ Seed: -1, Version: 0 }));
    expect(r.Ok).toBe(false);
    if (r.Ok === false) {
      expect(r.Errors).toContain('Seed must be an integer >= 0');
      expect(r.Errors).toContain('Version must be an integer >= 1');
    }
    const fractional = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({ Seed: 1.5 }));
    expect(fractional.Ok === false && fractional.Errors.includes('Seed must be an integer >= 0')).toBe(true);
  });

  it('reports an invalid GuardFieldsEditableBy once', () => {
    const r = EvaluationProtocol.ParseEvaluationProtocolRow(protocolRow({ GuardFieldsEditableBy: 'anyone' }));
    expect(r.Ok).toBe(false);
    if (r.Ok === false) expect(r.Errors.filter((e) => e.startsWith('GuardFieldsEditableBy'))).toEqual(['GuardFieldsEditableBy must be non-agent or human-only']);
  });
});
