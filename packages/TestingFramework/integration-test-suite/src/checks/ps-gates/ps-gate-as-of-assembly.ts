/**
 * As-of assembly gate measurements (W4 → S2.1 #2, T3 → S-T.1, W1 → S7.5 #2, C1 → S3.1). Training runs go through MJAPI
 * exactly as a user's would (`h.Train`); the assembled matrices are also built in-process through the product's own
 * training and scoring assembly paths, on the harness's client provider. Each returns a GateMeasurement and throws only
 * when it cannot measure.
 */
import { UUIDMap } from '@memberjunction/global';
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { TrainingRunResultsParser, type AssemblyRefusal } from '@memberjunction/predictive-studio-core';
import {
  BuildProductionMLInferenceDeps, MLModelInferenceProcessor, TrainingDelegation, TrainingEngine,
  type AsOfAssembledMatrix, type AssembledRow, type SourceRow, type UnitTrainingAssembly,
} from '@memberjunction/predictive-studio';
import { UnitFixtures, W4StatusHistory, type GateMeasurement, type StatusTimeline, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The catalog algorithms a refused as-of column must be refused for, one training run each. */
const CATALOG = ['Logistic Regression', 'XGBoost', 'LightGBM', 'Random Forest'] as const;

/** How many rows the train/serve parity check compares. */
const PARITY_SAMPLE = 100;

/** The as-of assembly gate bodies (G1.4, G1.5, G1.9, G1.12), as static members on one owner class. */
export class AsOfAssemblyGates {
  /** The assembly refusal a training run stored, or null when the run was not refused at the assembly stage. */
  private static assemblyRefusal(run: MJMLTrainingRunEntity): AssemblyRefusal | null {
    const r = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    return r.Ok && r.Value.status === 'refused' && r.Value.refusal.stage === 'assembly' ? r.Value.refusal.reason : null;
  }

  /** The training path's matrix for a pipeline, assembled in-process with the production training deps. */
  private static async assembleForTraining(h: TruthHarness, pipelineId: string): Promise<UnitTrainingAssembly> {
    return new TrainingEngine().AssembleForTraining(pipelineId, await TrainingDelegation.BuildTrainingDeps(h.Provider, h.User));
  }

  /** How many of the catalog algorithms refuse the current-value column PersonStatusNow as uncovered history. */
  private static async countPersonStatusNowRefused(h: TruthHarness): Promise<number> {
    let refused = 0;
    for (const algorithm of CATALOG) {
      const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W4-pit', { Features: ['EventsAttended', 'AutoRenew', 'IncomeK', 'PersonStatusNow'], Algorithm: algorithm });
      await h.Train(pipeline);
      const reason = AsOfAssemblyGates.assemblyRefusal(await UnitFixtures.LatestRun(h, pipeline.ID));
      if (reason !== null && reason.kind === 'decision-date-before-change-history' && reason.field === 'PersonStatusNow') refused++;
    }
    return refused;
  }

  /** How many assembled rows carry the Person.Status the dated history says was in force on their decision day. */
  private static countAsOfEqual(assembly: UnitTrainingAssembly, matrix: AsOfAssembledMatrix, timeline: StatusTimeline): number {
    const statusCol = matrix.Columns.findIndex((c) => c.FeatureName === 'Status');
    const byRow = new UUIDMap<UnitTrainingAssembly['UnitRead']['Rows'][number]>();
    for (const r of assembly.UnitRead.Rows) byRow.Set(r.RowId, r);
    let equal = 0;
    for (const row of matrix.Rows) {
      const unitRow = byRow.Get(row.RowId);
      if (unitRow && statusCol >= 0 && row.Values[statusCol] === W4StatusHistory.ExpectedStatusAt(timeline, String(unitRow.Source.PersonID), unitRow.DecisionDate)) equal++;
    }
    return equal;
  }

  /** G1.4 W4 → S2.1 #2 */
  public static async MeasureW4AsOfStatus(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'world', ID: 'W4-pit', Seed: 42 });
    // Person.Status history: Active from the first cycle, Lapsed from 1 January after the first cycle not renewed.
    const timeline = await W4StatusHistory.WriteW4StatusHistory(h);
    const excluded = await AsOfAssemblyGates.countPersonStatusNowRefused(h);
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W4-pit', { Features: ['EventsAttended', 'AutoRenew', 'IncomeK'], PersonStatus: true });
    const assembly = await AsOfAssemblyGates.assembleForTraining(h, pipeline.ID);
    if (assembly.Assembled.Status !== 'assembled') return { Passed: false, Measured: { excludedOrFlagged: excluded }, Detail: `the person-status assembly was refused: ${JSON.stringify(assembly.Assembled.Refusal)}` };
    const matrix = assembly.Assembled;
    const equal = AsOfAssemblyGates.countAsOfEqual(assembly, matrix, timeline);
    const total = matrix.Rows.length;
    const coverage = matrix.Coverage.find((c) => c.field === 'Status');
    const mismatched = coverage ? coverage.continuity.recordsMismatched : -1;
    return {
      Passed: excluded === CATALOG.length && total > 0 && equal === total && total === assembly.UnitRead.Rows.length,
      Measured: { excludedOrFlagged: excluded, asOfEqual: equal, rows: total, unitRows: assembly.UnitRead.Rows.length, recordsMismatched: mismatched },
      Detail: `PersonStatusNow refused for ${excluded} of ${CATALOG.length}; ${equal} of ${total} as-of values equal the dated history (${assembly.UnitRead.Rows.length} unit rows); Person.Status history continuity mismatches: ${mismatched}`,
    };
  }

  /** G1.5 T3 → S-T.1 */
  public static async MeasureT3SamePeriodRefused(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'scenario', ID: 'T3', Seed: UnitFixtures.ScenarioBaseSeed('T3') });
    const same = await UnitFixtures.ProvisionT3Pipeline(h, { Columns: ['SamePeriodTarget'], PeriodOffsets: {} });
    await h.Train(same.Pipeline);
    const reason = AsOfAssemblyGates.assemblyRefusal(await UnitFixtures.LatestRun(h, same.Pipeline.ID));
    const refusedByName = reason !== null && reason.kind === 'future-period-lag' && reason.column === 'SamePeriodTarget';
    const lag = await UnitFixtures.ProvisionT3Pipeline(h, { Columns: ['LagTarget'], PeriodOffsets: { LagTarget: 1 } });
    await h.Train(lag.Pipeline);
    const lagRun = await UnitFixtures.LatestRun(h, lag.Pipeline.ID);
    const accepted = lagRun.Status === 'Completed';
    return {
      Passed: refusedByName && accepted,
      Measured: { sameRefused: refusedByName, sameRefusal: reason === null ? 'none' : reason.kind, lagAccepted: accepted, lagRunStatus: lagRun.Status },
      Detail: `SamePeriodTarget ${refusedByName ? 'refused by name (future-period-lag)' : `not refused by name (${reason === null ? 'no assembly refusal' : reason.kind})`}; LagTarget run ${lagRun.Status}`,
    };
  }

  /** G1.9 W1 → S7.5 #2 */
  public static async MeasureW1StringAsNumericRefused(h: TruthHarness): Promise<GateMeasurement> {
    await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W1-signal', { Features: ['EventsAttended', 'Region'], Encodings: { Region: 'numeric' } });
    const attempt = await h.Train(pipeline);
    const message = attempt.Ok ? '' : (attempt.ErrorMessage || '');
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const reason = AsOfAssemblyGates.assemblyRefusal(run);
    // The stored refusal is checked by its fields; the message check is the gate's own criterion (the user sees the column).
    const named = reason !== null && reason.kind === 'non-numeric-in-numeric-column' && reason.column === 'Region' && message.includes('Region');
    // "0 values are coerced to 0.0": the run stopped before the sidecar, so no model and no matrix exist.
    const modelCreated = run.ResultingModelID !== null;
    return { Passed: named && !modelCreated, Measured: { stoppedNamingColumn: named, modelCreated }, Detail: message || `the run was not refused (status ${run.Status})` };
  }

  /** Every `step`-th assembled row (step from the matrix size) up to the parity sample size. */
  private static paritySample(rows: readonly AssembledRow[]): AssembledRow[] {
    const step = Math.max(1, Math.floor(rows.length / PARITY_SAMPLE));
    return rows.filter((_, i) => i % step === 0).slice(0, PARITY_SAMPLE);
  }

  /** The sampled rows whose scoring-path vector is missing or differs from the training-path vector. */
  private static countMismatches(sample: readonly AssembledRow[], scored: AsOfAssembledMatrix): number {
    const byId = new UUIDMap<AssembledRow>();
    for (const r of scored.Rows) byId.Set(r.RowId, r);
    return sample.filter((r) => {
      const s = byId.Get(r.RowId);
      return !s || JSON.stringify(s.Values) !== JSON.stringify(r.Values);
    }).length;
  }

  /** G1.12 C1 → S3.1. The model is promoted to Validated before the scoring path loads it: the scoring processor refuses Draft models. */
  public static async MeasureC1TrainScoreParity(h: TruthHarness): Promise<GateMeasurement> {
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1AssemblyPipeline(h);
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    if (!run.ResultingModelID) return { Passed: false, Measured: {}, Detail: `training run ${run.ID} produced no model: ${run.Notes || ''}` };
    const promoted = await h.Promote(run.ResultingModelID, 'Validated', 'G1.12: scoring-path assembly');
    if (!promoted.Promoted) return { Passed: false, Measured: { modelStatus: promoted.Status }, Detail: `model ${run.ResultingModelID} could not be validated for scoring` };
    const training = await AsOfAssemblyGates.assembleForTraining(h, pipeline.ID);
    if (training.Assembled.Status !== 'assembled') return { Passed: false, Measured: {}, Detail: `training assembly refused: ${JSON.stringify(training.Assembled.Refusal)}` };
    const sample = AsOfAssemblyGates.paritySample(training.Assembled.Rows);
    if (sample.length < PARITY_SAMPLE) return { Passed: false, Measured: { compared: sample.length }, Detail: `only ${sample.length} assembled rows to compare; the gate needs ${PARITY_SAMPLE}` };
    const keyField = training.UnitRead.RowEntity.PrimaryKey;
    const records: SourceRow[] = sample.map((r) => ({ [keyField]: r.RowId }));
    const scoring = new MLModelInferenceProcessor({ modelId: run.ResultingModelID, deps: BuildProductionMLInferenceDeps() });
    const scored = await scoring.AssembleForScoring(records, { ContextUser: h.User, Provider: h.Provider }, 'unit-rule');
    if (scored.Status !== 'assembled') return { Passed: false, Measured: { compared: sample.length }, Detail: `scoring assembly refused: ${JSON.stringify(scored.Refusal)}` };
    const mismatches = AsOfAssemblyGates.countMismatches(sample, scored);
    return { Passed: mismatches === 0, Measured: { compared: sample.length, mismatches }, Detail: `${mismatches} mismatches of ${sample.length}` };
  }
}
