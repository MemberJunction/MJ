import type { MetricKey, MetricWithInterval, PairedComparison, TrainerCompleted } from '../../index';

/** Typed trainer-result fixtures the Core tests share. */
export class TrainerResultFixtures {
  /** One metric with a 95% interval (n defaults to C1's 1,205 holdout rows). */
  public static Mwi(metric: MetricKey, value: number, lower: number, upper: number, n = 1205): MetricWithInterval {
    return { metric, value, interval: { level: 0.95, lower, upper }, n };
  }

  /** A paired comparison that beats when its lower bound is above 0. */
  public static Cmp(value: number, lower: number, upper: number): PairedComparison {
    return { value, ci: [lower, upper], beats: lower > 0 };
  }

  /**
   * C1-shaped completed result. The GLM and one-feature holdout log losses are the reference pipeline's (0.3652 is the
   * TruthSuite's `fixtures/reference/p5-golden.json` C1 value; 0.3783 is the reference one-feature baseline on C1); the
   * dummy and finalist numbers are synthetic. The finalist (xgb) does not beat the dummy; both simple members do; the
   * GLM has the lower score, so the gate keeps the GLM.
   */
  public static C1KeepSimpleResult(): TrainerCompleted {
    return {
      status: 'completed',
      trainingRunId: '44444444-5555-4666-8777-888888888888',
      codeVersion: { psGitSha: 'c92d4a47f9', sidecarVersion: '6.2.0', libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' }, threads: 1, seed: 42 },
      computeSeconds: 12.5,
      innerScores: [
        { candidate: 'xgb', inner: TrainerResultFixtures.Mwi('log-loss', 0.371, 0.36, 0.382, 3298), folds: 15, optimistic: true },
        { candidate: 'rf', inner: TrainerResultFixtures.Mwi('log-loss', 0.378, 0.366, 0.39, 3298), folds: 15, optimistic: true },
      ],
      finalist: 'xgb',
      holdoutAccess: { accessedAt: '2026-10-12T12:00:00Z', count: 1, finalist: 'xgb' },
      holdout: { primary: TrainerResultFixtures.Mwi('log-loss', 0.3712, 0.333, 0.413), secondary: [TrainerResultFixtures.Mwi('auc', 0.64, 0.59, 0.688)] },
      baselines: [
        { baseline: { kind: 'dummy', name: 'base-rate' }, role: 'dummy', holdout: TrainerResultFixtures.Mwi('log-loss', 0.3891, 0.349, 0.431) },
        { baseline: { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, role: 'simple', holdout: TrainerResultFixtures.Mwi('log-loss', 0.3783, 0.34, 0.42) },
        { baseline: { kind: 'glm', family: 'logistic', penalty: 'l2' }, role: 'simple', holdout: TrainerResultFixtures.Mwi('log-loss', 0.3652, 0.328, 0.408) },
      ],
      comparisons: {
        modelVsDummy: TrainerResultFixtures.Cmp(0.0179, -0.002, 0.037),
        oneFeatureVsDummy: TrainerResultFixtures.Cmp(0.0108, 0.0021, 0.019),
        glmVsDummy: TrainerResultFixtures.Cmp(0.0239, 0.011, 0.036),
        'modelVs:glm': TrainerResultFixtures.Cmp(-0.006, -0.017, 0.005),
        'modelVs:oneFeature': TrainerResultFixtures.Cmp(0.0071, -0.004, 0.018),
      },
      gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null },
      artifacts: [],
      incumbentDiff: null,
      calibration: { method: 'platt', intercept: 0.121, slope: 0.826, reliability: [] },
      slices: [],
      operatingPoint: null,
      cost: { computeSeconds: 12.5, tokens: 0, usd: 0, budget: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 2, hardStop: true }, stoppedByBudget: false },
      importance: [],
      leakageFlags: [],
      predictionIntervalCoverage: [],
      residualDiagnostics: null,
      forecast: null,
      innerSplitContrast: null,
    };
  }

  /**
   * The C1 result with a finalist whose name is a simple member's key (`glm`). The sidecar refuses member names for
   * candidates, so a live run never produces this; it pins how a stored result with such a finalist maps to the gate's
   * delivered member. The model's comparison against the GLM is 0 [0, 0] (same predictions).
   */
  public static C1MemberNamedFinalistResult(): TrainerCompleted {
    const base = TrainerResultFixtures.C1KeepSimpleResult();
    return {
      ...base,
      finalist: 'glm',
      holdoutAccess: { ...base.holdoutAccess, finalist: 'glm' },
      comparisons: {
        ...base.comparisons,
        modelVsDummy: TrainerResultFixtures.Cmp(0.0239, 0.011, 0.036),
        'modelVs:glm': TrainerResultFixtures.Cmp(0, 0, 0),
        'modelVs:oneFeature': TrainerResultFixtures.Cmp(0.0131, 0.0015, 0.0229),
      },
    };
  }
}
