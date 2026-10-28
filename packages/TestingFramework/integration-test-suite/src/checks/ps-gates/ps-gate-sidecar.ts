/** The lineage refusal measured in TypeScript: a completed result whose CodeVersion lacks scikit-learn is refused and the run is not Completed. */
import type { TrainerCompleted } from '@memberjunction/predictive-studio-core';
import { TrainerRunRecorder, TrainerLineageRefusedError, type TrainerRunTarget } from '@memberjunction/predictive-studio';
import type { GateMeasurement } from '@memberjunction/predictive-studio-truth-suite';

/** Gate measurements of the trainer's result handling on the engine side. */
export class SidecarGates {
  /** Records a completed result whose lineage omits scikit-learn; passes when it is refused and the run left Failed. */
  public static async MeasureCodeVersionRefusal(): Promise<GateMeasurement> {
    const run: TrainerRunTarget = { Status: 'Running', CompletedAt: null, ComputeSeconds: null, ComputeCost: null, Notes: null, CodeVersion: null };
    const mwi = { metric: 'log-loss' as const, value: 0.5, interval: { level: 0.95, lower: 0.4, upper: 0.6 }, n: 10 };
    const result: TrainerCompleted = {
      status: 'completed', trainingRunId: 'refusal-probe', computeSeconds: 1,
      codeVersion: { psGitSha: 'x', sidecarVersion: 'x', threads: 1, seed: 0, libraryVersions: { python: '3.11.15', numpy: '1.26.4', xgboost: '2.0.3', lightgbm: '4.3.0' } },
      innerScores: [], finalist: 'm', holdoutAccess: { accessedAt: '2026-10-12T00:00:00Z', count: 1, finalist: 'm' },
      holdout: { primary: mwi, secondary: [] }, baselines: [], comparisons: {},
      gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
      artifacts: [], incumbentDiff: null, calibration: null, slices: [], operatingPoint: null,
      cost: { computeSeconds: 1, tokens: 0, usd: 0, budget: { maxComputeSeconds: 60, maxTokens: 0, maxCandidates: 1, hardStop: true }, stoppedByBudget: false },
      importance: [], leakageFlags: [], predictionIntervalCoverage: [], residualDiagnostics: null, forecast: null, innerSplitContrast: null,
    };
    let refused = false;
    try {
      TrainerRunRecorder.ApplyTrainerResultToRun(run, result, null);
    } catch (e) {
      refused = e instanceof TrainerLineageRefusedError && e.Gaps.includes('libraryVersions.scikit-learn');
    }
    return { Passed: refused && run.Status === 'Failed', Measured: { lineageRefused: refused, runStatus: run.Status }, Detail: `a lineage without scikit-learn refused: ${refused}` };
  }
}
