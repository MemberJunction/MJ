import { describe, it, expect } from 'vitest';
import type { CodeVersion, TrainerCompleted, TrainerFailed } from '@memberjunction/predictive-studio-core';
import { TrainerRunRecorder, TrainerLineageRefusedError, type TrainerRunTarget } from '../trainer-result';
import { ComputePricing } from '../compute-cost';

function blankRun(): TrainerRunTarget {
  return { Status: 'Running', CompletedAt: null, ComputeSeconds: null, ComputeCost: null, Notes: null, CodeVersion: null };
}

const RUN = '00000000-0000-0000-0000-000000000004';
const failed: TrainerFailed = {
  status: 'failed', trainingRunId: RUN, stage: 'budget-exceeded',
  message: "compute budget of 60s exceeded during inner CV of 'xgb'", computeSeconds: 61.25,
};

function completed(codeVersion: CodeVersion): TrainerCompleted {
  const mwi = { metric: 'log-loss' as const, value: 0.5, interval: { level: 0.95, lower: 0.45, upper: 0.55 }, n: 100 };
  return {
    status: 'completed', trainingRunId: RUN, codeVersion, computeSeconds: 3.5,
    innerScores: [{ candidate: 'glm', inner: mwi, folds: 5, optimistic: true }], finalist: 'glm',
    holdoutAccess: { accessedAt: '2026-10-12T00:00:00Z', count: 1, finalist: 'glm' },
    holdout: { primary: mwi, secondary: [] }, baselines: [], comparisons: {},
    gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
    artifacts: [], incumbentDiff: null, calibration: null, slices: [], operatingPoint: null,
    cost: { computeSeconds: 3.5, tokens: 0, usd: 0, budget: { maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true }, stoppedByBudget: false },
    importance: [], leakageFlags: [], predictionIntervalCoverage: [], residualDiagnostics: null, forecast: null, innerSplitContrast: null,
  };
}

const fullVersion: CodeVersion = {
  psGitSha: 'x', sidecarVersion: '6.2.0', threads: 1, seed: 0,
  libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' },
};

describe('ComputeCostFor / ReadComputeRate', () => {
  it('prices seconds at the configured rate, 0 at rate 0, and is unknown without a rate', () => {
    expect(ComputePricing.ComputeCostFor(10, 0.002)).toBeCloseTo(0.02, 12);
    expect(ComputePricing.ComputeCostFor(10, 0)).toBe(0);
    expect(ComputePricing.ComputeCostFor(10, null)).toBeNull();
    expect(ComputePricing.ReadComputeRate({ PS_COMPUTE_USD_PER_SECOND: '0' })).toBe(0);
    expect(ComputePricing.ReadComputeRate({})).toBeNull();
    expect(() => ComputePricing.ReadComputeRate({ PS_COMPUTE_USD_PER_SECOND: '-1' })).toThrow(RangeError);
    expect(() => ComputePricing.ReadComputeRate({ PS_COMPUTE_USD_PER_SECOND: 'Infinity' })).toThrow(RangeError);
  });

  it("rounds to the run columns' scales: seconds to 3 places, then the cost of those seconds to 6", () => {
    expect(ComputePricing.RoundSeconds(3.14159)).toBe(3.142);
    // 1.23456 s → 1.235 s; 1.235 × 0.1234567 = 0.15246902… → 0.152469
    expect(ComputePricing.ComputeCostFor(1.23456, 0.1234567)).toBe(0.152469);
  });
});

describe('ApplyTrainerResultToRun', () => {
  it('records real compute and the failure stage, and no metrics, for a failed trainer result', () => {
    const run = blankRun();
    TrainerRunRecorder.ApplyTrainerResultToRun(run, failed, null);
    expect(run.Status).toBe('Failed');
    expect(run.ComputeSeconds).toBe(61.25);
    expect(run.ComputeCost).toBeNull();
    expect(run.Notes).toContain("stage 'budget-exceeded'");
    expect(run.CodeVersion).toBeNull();
  });

  it('prices a completed run and records its code version', () => {
    const run = blankRun();
    TrainerRunRecorder.ApplyTrainerResultToRun(run, completed(fullVersion), 0);
    expect(run.Status).toBe('Completed');
    expect([run.ComputeSeconds, run.ComputeCost]).toEqual([3.5, 0]);
    expect(run.Notes).toBe("Trainer completed: finalist 'glm'.");
    expect(run.CodeVersion).toBe(JSON.stringify(fullVersion));
  });

  it('refuses a completed result whose CodeVersion lacks library versions: a lineage that cannot be reproduced', () => {
    const run = blankRun();
    expect(() => TrainerRunRecorder.ApplyTrainerResultToRun(run, completed({ ...fullVersion, libraryVersions: { python: '3.11.15' } }), null))
      .toThrow(TrainerLineageRefusedError);
    expect(run.Status).toBe('Failed');
    expect(run.ComputeSeconds).toBe(3.5);
    expect(run.Notes).toBe('Trainer result refused: CodeVersion lacks libraryVersions.numpy, libraryVersions.scikit-learn, libraryVersions.xgboost, libraryVersions.lightgbm');
    expect(run.CodeVersion).toBeNull();
  });

  it('names every missing library and a thread count below 1 in the refusal', () => {
    const run = blankRun();
    let refusal: TrainerLineageRefusedError | null = null;
    try {
      TrainerRunRecorder.ApplyTrainerResultToRun(run, completed({ ...fullVersion, threads: 0, libraryVersions: { ...fullVersion.libraryVersions, xgboost: ' ' } }), null);
    } catch (err) {
      if (err instanceof TrainerLineageRefusedError) refusal = err;
    }
    expect(refusal?.Gaps).toEqual(['libraryVersions.xgboost', 'threads']);
    expect(run.Status).toBe('Failed');
    expect(run.Notes).toBe('Trainer result refused: CodeVersion lacks libraryVersions.xgboost, threads');
  });

  it("stores the trainer's seconds at the column's scale and prices those seconds", () => {
    const run = blankRun();
    TrainerRunRecorder.ApplyTrainerResultToRun(run, { ...failed, computeSeconds: 61.25049 }, 0.01);
    expect([run.ComputeSeconds, run.ComputeCost]).toEqual([61.25, 0.6125]);
  });
});
