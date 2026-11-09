/**
 * The trainer's lineage on the engine side: a real training run stores its CodeVersion (library versions and thread
 * count) on its `MJ: ML Training Runs` row, and a completed result whose CodeVersion lacks a library version or a thread
 * count is refused and the run is not Completed.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { JsonParse, type CodeVersion, type TrainerCompleted } from '@memberjunction/predictive-studio-core';
import { TrainerRunRecorder, TrainerLineageRefusedError, type TrainerRunTarget } from '@memberjunction/predictive-studio';
import type { GateMeasurement, TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGateSpecs } from './ps-gate-specs';

/** The stored run fields the lineage gate reads. */
type StoredRunLineage = Pick<MJMLTrainingRunEntity, 'ID' | 'Status' | 'CodeVersion'>;

/** One probe's outcome: whether the expected gap was refused and the status the run was left in. */
interface RefusalProbe { readonly Refused: boolean; readonly RunStatus: TrainerRunTarget['Status'] }

const COMPLETE_LIBRARIES: CodeVersion['libraryVersions'] = { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' };

/**
 * The libraries a stored CodeVersion must name. Listed here, not read from Core's list, so the gate does not judge the
 * stored lineage by the rule that wrote it.
 */
const LINEAGE_LIBRARIES = Object.keys(COMPLETE_LIBRARIES);

/** Gate measurements of the trainer's result handling on the engine side. */
export class SidecarGates {
  /**
   * Trains W1-signal s42 once through the product's training operation and reads the run's stored `CodeVersion`; passes
   * when the run completed and its CodeVersion names every library version and a thread count of at least 1.
   */
  public static async MeasureW1StoredCodeVersion(h: TruthHarness): Promise<GateMeasurement> {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const t = await h.Train(await h.CreatePipeline(PsGateSpecs.W(h, 'G2.32 W1 s42', w1)));
    if (!t.TrainingRunID) {
      return { Passed: false, Measured: { trainError: t.ErrorMessage }, Detail: `the W1 training returned no run (${t.ErrorMessage || 'no error message'})` };
    }
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<StoredRunLineage>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(t.TrainingRunID)}'`, Fields: ['ID', 'Status', 'CodeVersion'], ResultType: 'simple',
    }, h.User);
    const run = r.Success ? r.Results[0] : undefined;
    if (run === undefined) {
      return { Passed: false, Measured: { trainingRunId: t.TrainingRunID }, Detail: `training run ${t.TrainingRunID} could not be read (${r.ErrorMessage || 'no row'})` };
    }
    const verdict = SidecarGates.StoredCodeVersionVerdict(run.CodeVersion);
    return {
      Passed: run.Status === 'Completed' && verdict.Passed,
      Measured: { storedRunStatus: run.Status, ...verdict.Measured },
      Detail: `the W1 run ${run.ID} is ${run.Status}; ${verdict.Detail}`,
    };
  }

  /** Whether a run row's stored `CodeVersion` text names every library version and a thread count of at least 1. */
  public static StoredCodeVersionVerdict(codeVersionText: string | null): GateMeasurement {
    const parsed = codeVersionText === null ? null : JsonParse.ParseJsonText(codeVersionText, 'CodeVersion');
    const cv = parsed !== null && parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : null;
    const libraries = cv !== null && JsonParse.IsJsonObject(cv['libraryVersions']) ? cv['libraryVersions'] : null;
    const missing = LINEAGE_LIBRARIES.filter((lib) => libraries === null || JsonParse.JsonString(libraries, lib) === null);
    const threads = cv === null ? null : JsonParse.JsonInteger(cv, 'threads');
    const threadsOk = threads !== null && threads >= 1;
    return {
      Passed: cv !== null && missing.length === 0 && threadsOk,
      Measured: { storedCodeVersion: cv !== null, missingLibraries: missing.join(' ') || 'none', threads },
      Detail: cv === null
        ? 'the run stored no readable CodeVersion'
        : `its stored CodeVersion lacks ${missing.length === 0 ? 'no library version' : missing.join(', ')} and records ${threads === null ? 'no integer' : threads} thread(s)`,
    };
  }

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
