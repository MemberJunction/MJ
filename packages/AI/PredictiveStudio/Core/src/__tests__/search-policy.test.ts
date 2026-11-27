import { describe, it, expect } from 'vitest';
import { EvaluationProtocol, ALLOWED_OUTCOMES, type EvaluationProtocolColumns, type EvaluationProtocolSpec, type SearchStrategy } from '../evaluation-protocol';
import { EvaluationProtocolRules, GUARD_FIELDS, type Actor } from '../evaluation-protocol-rules';
import { SearchPolicy, type EqualCostComparison } from '../search-policy';

function minimalProtocolRow(overrides: Partial<EvaluationProtocolColumns> = {}): EvaluationProtocolColumns {
  return {
    ID: 'P1',
    LineageRootID: 'P1',
    Version: 1,
    Name: 'Renewal grading',
    Holdout: JSON.stringify({ kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null }),
    InnerValidation: JSON.stringify({ kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 }),
    Seed: 0,
    HoldoutAccessBudget: 1,
    PrimaryScore: JSON.stringify({ family: 'binary', metric: 'log-loss' }),
    SecondaryMetrics: JSON.stringify(['auc', 'calibration-slope']),
    Baselines: JSON.stringify([
      { kind: 'dummy', name: 'base-rate' },
      { kind: 'one-feature', selection: 'best-single-feature-inner-cv' },
      { kind: 'glm', family: 'logistic', penalty: 'l2' },
    ]),
    Calibration: JSON.stringify({ kind: 'auto', thresholdRows: 1000, fitOn: 'disjoint-calibration-fold' }),
    Resampling: JSON.stringify({ kind: 'none' }),
    Intervals: JSON.stringify({ level: 0.95, method: 'bootstrap', resamples: 1000, pairedTest: 'paired-bootstrap' }),
    Promotion: JSON.stringify({ comparators: [], incumbent: 'current-published', margin: 0, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' }),
    AllowedOutcomes: JSON.stringify(ALLOWED_OUTCOMES),
    LeakageAudit: JSON.stringify({ singleFeatureHeldOutAucMax: 0.9, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true }),
    Exclusions: JSON.stringify({ denyFields: ['Renewed2'], denySources: [] }),
    Slices: JSON.stringify({ outOfTime: true, subgroups: ['Region'] }),
    PredictionIntervals: null,
    ResidualDiagnostics: null,
    RetrainTriggers: JSON.stringify([]),
    SearchStrategy: JSON.stringify({ kind: 'random', candidates: 3 }),
    Budgets: JSON.stringify({ maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true }),
    MinMinorityClassRows: 20,
    GuardFieldsEditableBy: 'non-agent',
    AuthoredBy: JSON.stringify({ kind: 'human', userId: 'U-1' }),
    ...overrides,
  };
}

const COMPARISON_ID = 'A1111111-1111-4111-8111-111111111111';
const HUMAN: Actor = { kind: 'human', userId: 'U-1' };
const AGENT: Actor = { kind: 'agent', agentRunId: 'AR-1' };

function makeComparison(overrides: Partial<EqualCostComparison> = {}): EqualCostComparison {
  return {
    ID: COMPARISON_ID,
    Method: 'bayesian',
    ComputeBudgetSecondsPerArm: 120,
    Datasets: [
      { Dataset: 'W1-signal', Seeds: [42, 43, 44] },
      { Dataset: 'C1', Seeds: [1, 2, 3] },
    ],
    PairedDifference: {
      'W1-signal': { value: 0.08, ci: [0.05, 0.11], beats: true },
      'C1': { value: 0.04, ci: [0.02, 0.06], beats: true },
    },
    LowerBoundMin: 0.02,
    Passed: true,
    ...overrides,
  };
}

function parseBaselineProtocol(): EvaluationProtocolSpec {
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(minimalProtocolRow());
  if (parsed.Ok === false) {
    throw new Error(`minimalProtocolRow fixture failed to parse: ${parsed.Errors.join('; ')}`);
  }
  return parsed.Value;
}

describe('B4 SearchPolicy — Attack 1 (guided comparison validation)', () => {
  const guidedBayesian: SearchStrategy = {
    kind: 'guided',
    method: 'bayesian',
    equalCostComparisonId: COMPARISON_ID,
  };

  it('refuses guided search when the comparison row is missing (null)', () => {
    expect(SearchPolicy.Decide(guidedBayesian, 'BayesianWaveStrategist', null)).toEqual({
      kind: 'guided-without-comparison',
      method: 'bayesian',
    });
  });

  it('refuses guided search when comparison ID or method does not match', () => {
    expect(SearchPolicy.Decide(guidedBayesian, 'BayesianWaveStrategist', makeComparison({ Method: 'successive-halving' }))).toEqual({
      kind: 'guided-without-comparison',
      method: 'bayesian',
    });
    expect(SearchPolicy.Decide(guidedBayesian, 'BayesianWaveStrategist', makeComparison({ ID: 'B2222222-2222-4222-8222-222222222222' }))).toEqual({
      kind: 'guided-without-comparison',
      method: 'bayesian',
    });
  });

  it('refuses guided search when LowerBoundMin = 0 (> 0, not >= 0)', () => {
    const boundaryZero = makeComparison({
      PairedDifference: {
        'W1-signal': { value: 0.03, ci: [0.0, 0.06], beats: false },
        'C1': { value: 0.04, ci: [0.02, 0.06], beats: true },
      },
      LowerBoundMin: 0,
      Passed: false,
    });
    expect(SearchPolicy.Decide(guidedBayesian, 'BayesianWaveStrategist', boundaryZero)).toEqual({
      kind: 'comparison-not-passed',
      comparisonId: COMPARISON_ID,
      lowerBoundMin: 0,
    });

    // Even if Passed was tampered true on a LowerBoundMin = 0 row, Decide still refuses strictly > 0.
    expect(SearchPolicy.Decide(guidedBayesian, 'BayesianWaveStrategist', { ...boundaryZero, Passed: true })).toEqual({
      kind: 'comparison-not-passed',
      comparisonId: COMPARISON_ID,
      lowerBoundMin: 0,
    });
    expect(SearchPolicy.ComputePassed(0)).toBe(false);
  });

  it('refuses guided search when a required dataset (W1-signal or C1) is absent', () => {
    const missingC1 = makeComparison({
      Datasets: [{ Dataset: 'W1-signal', Seeds: [42, 43] }],
      PairedDifference: {
        'W1-signal': { value: 0.08, ci: [0.05, 0.11], beats: true },
      },
      LowerBoundMin: 0.05,
      Passed: true,
    });
    const refusal = SearchPolicy.Decide(guidedBayesian, 'BayesianWaveStrategist', missingC1);
    expect(refusal?.kind).toBe('comparison-not-passed');
  });

  it('accepts guided search when comparison matches method, covers W1-signal and C1, and LowerBoundMin > 0', () => {
    expect(SearchPolicy.Decide(guidedBayesian, 'BayesianWaveStrategist', makeComparison())).toBeNull();
  });

  it('EvaluationProtocol.ValidateSearchPolicy delegates guided and random enforcement to SearchPolicy.Decide', () => {
    const row = minimalProtocolRow({
      SearchStrategy: JSON.stringify(guidedBayesian),
    });
    const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(row);
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    expect(parsed.Value.ValidateSearchPolicy(null)).toEqual({
      kind: 'guided-without-comparison',
      method: 'bayesian',
    });
    expect(parsed.Value.ValidateSearchPolicy(makeComparison({ LowerBoundMin: 0, Passed: false }))).toEqual({
      kind: 'comparison-not-passed',
      comparisonId: COMPARISON_ID,
      lowerBoundMin: 0,
    });
    expect(parsed.Value.ValidateSearchPolicy(makeComparison())).toBeNull();
  });

  it('refuses non-random strategist under a random protocol', () => {
    const randomStrategy: SearchStrategy = { kind: 'random', candidates: 3 };
    expect(SearchPolicy.Decide(randomStrategy, 'PlanOrderWaveStrategist', null)).toEqual({
      kind: 'strategist-not-random',
      strategist: 'PlanOrderWaveStrategist',
    });
    expect(SearchPolicy.Decide(randomStrategy, SearchPolicy.SeededRandomStrategistName, null)).toBeNull();
  });
});

describe('B4 SearchPolicy — Attack 4 (SearchStrategy governed as guard field)', () => {
  it('includes search in GUARD_FIELDS and refuses agent changes when GuardFieldsEditableBy is unchanged from PR 3 (non-agent)', () => {
    expect(GUARD_FIELDS).toContain('search');

    const prev = parseBaselineProtocol();
    const nextSpec: EvaluationProtocolSpec = {
      ...prev,
      version: 2,
      authoredBy: AGENT,
      search: { kind: 'guided', method: 'bayesian', equalCostComparisonId: COMPARISON_ID },
    };

    const changed = EvaluationProtocolRules.ChangedGuardFields(prev, nextSpec);
    expect(changed).toContain('search');

    const refusals = EvaluationProtocolRules.ValidateEvaluationProtocol({
      Protocol: nextSpec,
      Previous: prev,
      AuthoredBy: AGENT,
    });
    expect(refusals).toEqual([
      {
        Kind: 'guard-field-edited-by-disallowed-author',
        Fields: ['search'],
        Author: 'agent',
        Setting: 'non-agent',
      },
    ]);

    const humanRefusals = EvaluationProtocolRules.ValidateEvaluationProtocol({
      Protocol: { ...nextSpec, authoredBy: HUMAN },
      Previous: prev,
      AuthoredBy: HUMAN,
    });
    expect(humanRefusals).toEqual([]);
  });
});

describe('B4 SearchPolicy — Attack 5 (LowerBoundMin uses minimum across datasets, never average)', () => {
  it('computes LowerBoundMin = -0.01 (not +0.02 average) when W1-signal is +0.05 and C1 is -0.01, and refuses', () => {
    const paired = {
      'W1-signal': { value: 0.08, ci: [0.05, 0.11] as const, beats: true },
      'C1': { value: 0.02, ci: [-0.01, 0.05] as const, beats: false },
    };

    const minBound = SearchPolicy.ComputeLowerBoundMin(paired);
    expect(minBound).toBe(-0.01);
    expect(SearchPolicy.ComputePassed(minBound!)).toBe(false);

    // Even if a caller supplies an averaged LowerBoundMin (+0.02), Decide sees C1 ci[0] = -0.01 and refuses.
    const tamperedComparison = makeComparison({
      PairedDifference: paired,
      LowerBoundMin: 0.02,
      Passed: false,
    });
    const refusal = SearchPolicy.Decide(
      { kind: 'guided', method: 'bayesian', equalCostComparisonId: COMPARISON_ID },
      'BayesianWaveStrategist',
      tamperedComparison,
    );
    expect(refusal).toEqual({
      kind: 'comparison-not-passed',
      comparisonId: COMPARISON_ID,
      lowerBoundMin: -0.01,
    });
  });
});
