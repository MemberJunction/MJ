/** The lineage refusal measured in TypeScript: a completed result whose CodeVersion lacks a library version or a thread count is refused and the run is not Completed. */
import type { CodeVersion, TrainerCompleted } from '@memberjunction/predictive-studio-core';
import { TrainerRunRecorder, TrainerLineageRefusedError, type TrainerRunTarget } from '@memberjunction/predictive-studio';
import type { GateMeasurement } from '@memberjunction/predictive-studio-truth-suite';

/** One probe's outcome: whether the expected gap was refused and the status the run was left in. */
interface RefusalProbe { readonly Refused: boolean; readonly RunStatus: TrainerRunTarget['Status'] }

const COMPLETE_LIBRARIES: CodeVersion['libraryVersions'] = { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' };

/** Gate measurements of the trainer's result handling on the engine side. */
export class SidecarGates {
  /**
   * Records two completed results with lineage gaps, one without scikit-learn's version and one with a thread count
   * of 0; passes when each is refused naming its gap and its run is left Failed.
   */
  public static MeasureCodeVersionRefusal(): GateMeasurement {
    const withoutSklearn: CodeVersion['libraryVersions'] = Object.fromEntries(Object.entries(COMPLETE_LIBRARIES).filter(([lib]) => lib !== 'scikit-learn'));
    const library = SidecarGates.probe({ psGitSha: 'x', sidecarVersion: 'x', threads: 1, seed: 0, libraryVersions: withoutSklearn }, 'libraryVersions.scikit-learn');
    const threads = SidecarGates.probe({ psGitSha: 'x', sidecarVersion: 'x', threads: 0, seed: 0, libraryVersions: COMPLETE_LIBRARIES }, 'threads');
    return {
      Passed: library.Refused && library.RunStatus === 'Failed' && threads.Refused && threads.RunStatus === 'Failed',
      Measured: { lineageRefused: library.Refused, runStatus: library.RunStatus, threadsRefused: threads.Refused, threadsRunStatus: threads.RunStatus },
      Detail: `a lineage without scikit-learn refused: ${library.Refused}; a lineage with 0 threads refused: ${threads.Refused}`,
    };
  }

  /** Applies a completed result carrying `codeVersion` to a fresh run; refused when the thrown gaps include `gap`. */
  private static probe(codeVersion: CodeVersion, gap: string): RefusalProbe {
    const run: TrainerRunTarget = { Status: 'Running', CompletedAt: null, ComputeSeconds: null, ComputeCost: null, Notes: null, CodeVersion: null };
    let refused = false;
    try {
      TrainerRunRecorder.ApplyTrainerResultToRun(run, SidecarGates.completedResult(codeVersion), null);
    } catch (e) {
      refused = e instanceof TrainerLineageRefusedError && e.Gaps.includes(gap);
    }
    return { Refused: refused, RunStatus: run.Status };
  }

  /** A minimal completed trainer result; only its code version varies between probes. */
  private static completedResult(codeVersion: CodeVersion): TrainerCompleted {
    const mwi = { metric: 'log-loss' as const, value: 0.5, interval: { level: 0.95, lower: 0.4, upper: 0.6 }, n: 10 };
    return {
      status: 'completed', trainingRunId: 'refusal-probe', computeSeconds: 1, codeVersion,
      innerScores: [], finalist: 'm', holdoutAccess: { accessedAt: '2026-10-12T00:00:00Z', count: 1, finalist: 'm' },
      holdout: { primary: mwi, secondary: [] }, baselines: [], comparisons: {},
      gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
      artifacts: [], incumbentDiff: null, calibration: null, slices: [], operatingPoint: null,
      cost: { computeSeconds: 1, tokens: 0, usd: 0, budget: { maxComputeSeconds: 60, maxTokens: 0, maxCandidates: 1, hardStop: true }, stoppedByBudget: false },
      importance: [], leakageFlags: [], predictionIntervalCoverage: [], residualDiagnostics: null, forecast: null, innerSplitContrast: null,
    };
  }
}
