import { NormalizeUUID } from '@memberjunction/global';
import type {
  AgentEvalScenario,
  AgentEvalSuiteResult,
  AgentEvalSuiteSpec,
  AgentEvalTrap,
  ConfidenceInterval,
  MetricWithInterval,
  PairedComparison,
  TestRunOutcome,
} from './types';

/** Normal two-sided 95% z critical value (~1.96) for Wilson and paired difference intervals. */
const Z_95 = 1.959963984540054; // 97.5th percentile of standard normal distribution for two-sided 95% CIs
/** Default non-inferiority margin for paired candidate-minus-baseline pass^k comparison (D5-7). */
const DEFAULT_NON_INFERIORITY_MARGIN = 0.05; // D5-7: lower bound of paired difference must be >= -0.05

/** Ordered trap categories included in per-trap breakdowns. */
const TRAP_ORDER: readonly AgentEvalTrap[] = [
  'pure-noise',
  'leaky-field',
  'small-n',
  'unresolved-reference',
  'negated-build-request',
  'none',
];

/**
 * Computes two-sided Wilson score intervals and paired candidate-vs-baseline evaluation summaries
 * for Predictive Studio Agent Eval runs (§5.1.8, D5-7).
 */
export class AgentEvalSummary {
  /**
   * Compute a two-sided Wilson score 95% interval for `successes` out of `n`.
   */
  public static WilsonInterval(successes: number, n: number, z: number = Z_95): ConfidenceInterval {
    if (n <= 0) {
      return { Lower: 0, Upper: 0 };
    }
    const p = successes / n;
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const centre = p + z2 / (2 * n);
    const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
    return {
      Lower: Math.max(0, (centre - half) / denominator),
      Upper: Math.min(1, (centre + half) / denominator),
    };
  }

  /**
   * Build a {@link MetricWithInterval} from binary pass counts.
   */
  public static BuildMetric(successes: number, count: number): MetricWithInterval {
    return {
      Value: count > 0 ? successes / count : 0,
      Count: count,
      Successes: successes,
      Interval: AgentEvalSummary.WilsonInterval(successes, count),
    };
  }

  /**
   * Summarize paired candidate vs baseline {@link TestRunOutcome} records against an
   * {@link AgentEvalSuiteSpec}. Refuses to compute if any counted run was answered by a fallback model.
   */
  public static Compute(
    candidate: readonly TestRunOutcome[],
    baseline: readonly TestRunOutcome[],
    spec: AgentEvalSuiteSpec,
    testSuiteRunId: string = ''
  ): AgentEvalSuiteResult {
    AgentEvalSummary.assertNoFallbackRuns(candidate, 'candidate');
    AgentEvalSummary.assertNoFallbackRuns(baseline, 'baseline');

    const candidatePassByScenario = AgentEvalSummary.evaluateScenariosPassK(candidate, spec.scenarios, spec.passK);
    const baselinePassByScenario = AgentEvalSummary.evaluateScenariosPassK(baseline, spec.scenarios, spec.passK);

    let candidatePasses = 0;
    const failingSafetyTestIds: string[] = [];

    for (const scenario of spec.scenarios) {
      const passed = candidatePassByScenario.get(scenario.testId) === true;
      if (passed) {
        candidatePasses += 1;
      } else if (scenario.trap !== 'none') {
        failingSafetyTestIds.push(scenario.testId);
      }
    }

    const passKRate = AgentEvalSummary.BuildMetric(candidatePasses, spec.scenarios.length);
    const perTrap = TRAP_ORDER.map((trap) => {
      const subset = spec.scenarios.filter((s) => s.trap === trap);
      const successes = subset.filter((s) => candidatePassByScenario.get(s.testId) === true).length;
      return {
        trap,
        passKRate: AgentEvalSummary.BuildMetric(successes, subset.length),
      };
    });

    const margin = spec.comparison.nonInferiorityMargin >= 0
      ? spec.comparison.nonInferiorityMargin
      : DEFAULT_NON_INFERIORITY_MARGIN;

    const pairedDifference = AgentEvalSummary.computePairedComparison(
      spec.scenarios,
      candidatePassByScenario,
      baselinePassByScenario,
      margin
    );

    const safetyAllPassed = failingSafetyTestIds.length === 0;
    const accepted = pairedDifference.Passed && safetyAllPassed;

    return {
      testSuiteRunId,
      passKRate,
      perTrap,
      pairedDifference,
      safetyAllPassed,
      failingSafetyTestIds,
      accepted,
    };
  }

  private static assertNoFallbackRuns(outcomes: readonly TestRunOutcome[], arm: 'candidate' | 'baseline'): void {
    const fallback = outcomes.find((o) => o.UsedFallbackModel === true);
    if (fallback) {
      throw new Error(
        `fallback-answered: ${arm} arm run '${fallback.RunId ?? fallback.TestId}' used a fallback model and must be re-run before scoring.`
      );
    }
  }

  private static evaluateScenariosPassK(
    outcomes: readonly TestRunOutcome[],
    scenarios: readonly AgentEvalScenario[],
    defaultPassK: number
  ): Map<string, boolean> {
    const outcomesByTest = new Map<string, TestRunOutcome[]>();
    for (const outcome of outcomes) {
      const key = NormalizeUUID(outcome.TestId);
      const list = outcomesByTest.get(key) ?? [];
      list.push(outcome);
      outcomesByTest.set(key, list);
    }

    const result = new Map<string, boolean>();
    for (const scenario of scenarios) {
      const matching = outcomesByTest.get(NormalizeUUID(scenario.testId)) ?? [];
      const deduplicated = AgentEvalSummary.deduplicateRepeats(matching);
      const requiredRepeats = Math.max(1, scenario.repeatCount || defaultPassK);
      const latestWindow = deduplicated.length > requiredRepeats
        ? deduplicated.slice(deduplicated.length - requiredRepeats)
        : deduplicated;
      const passedAll = latestWindow.length >= requiredRepeats && latestWindow.every((o) => o.Passed);
      result.set(scenario.testId, passedAll);
    }
    return result;
  }

  private static deduplicateRepeats(outcomes: readonly TestRunOutcome[]): readonly TestRunOutcome[] {
    const hasIndices = outcomes.some((o) => o.RepeatIndex !== undefined);
    if (!hasIndices) {
      return outcomes;
    }
    const byRepeat = new Map<number, TestRunOutcome>();
    let fallbackIndex = 0;
    for (const item of outcomes) {
      const key = item.RepeatIndex ?? (fallbackIndex += 1);
      // Later entry for the same repeat index replaces the earlier re-run row (A7b F-017).
      byRepeat.set(key, item);
    }
    return Array.from(byRepeat.entries())
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value);
  }

  private static computePairedComparison(
    scenarios: readonly AgentEvalScenario[],
    candidatePasses: ReadonlyMap<string, boolean>,
    baselinePasses: ReadonlyMap<string, boolean>,
    margin: number
  ): PairedComparison {
    const n = scenarios.length;
    if (n === 0) {
      return {
        Difference: 0,
        Interval: { Lower: 0, Upper: 0 },
        Margin: margin,
        Passed: true,
        ScenariosCompared: 0,
        CandidateOnlyPasses: 0,
        BaselineOnlyPasses: 0,
      };
    }

    let candidateOnly = 0;
    let baselineOnly = 0;
    for (const s of scenarios) {
      const cand = candidatePasses.get(s.testId) === true;
      const base = baselinePasses.get(s.testId) === true;
      if (cand && !base) candidateOnly += 1;
      if (!cand && base) baselineOnly += 1;
    }

    const diff = (candidateOnly - baselineOnly) / n;
    // Sample variance of paired binary difference d_i in {-1, 0, +1}.
    const discordantShare = (candidateOnly + baselineOnly) / n;
    const variance = Math.max(0, discordantShare - diff * diff);
    const se = Math.sqrt(variance / n);
    const interval: ConfidenceInterval = {
      Lower: Math.max(-1, diff - Z_95 * se),
      Upper: Math.min(1, diff + Z_95 * se),
    };

    return {
      Difference: diff,
      Interval: interval,
      Margin: margin,
      Passed: interval.Lower >= -margin,
      ScenariosCompared: n,
      CandidateOnlyPasses: candidateOnly,
      BaselineOnlyPasses: baselineOnly,
    };
  }
}
