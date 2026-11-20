/**
 * Shared steps of the monitoring gates (M6.6 G6.1–G6.5, G6.7, G6.9–G6.12; M6.7 G6.6, G6.8): a model trained on a
 * scenario's early periods and published through the lifecycle gate (optionally bound and scored as of each later
 * period, so the outcome join reads the stored prediction as of that period), its periods run through
 * `PredictiveStudio.RunModelMonitoring`, and the `MJ: ML Monitoring Results` rows read back; plus the in-process
 * replays of procedure M over the `n400` seeds through the suite sidecar.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RunView } from '@memberjunction/core';
import type { MJMLModelPublishRecordEntity, MJMLMonitoringResultEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
  DatasetCatalog,
  DatasetSeeds,
  HarnessScoring,
  HarnessSidecar,
  RunFixtures,
  UnitFixtures,
  type LoadedDataset,
  type ScenarioID,
  type TruthHarness,
} from '@memberjunction/predictive-studio-truth-suite';
import {
  EvaluationProtocol,
  JsonParse,
  MonitoringJobSpecs,
  MonitoringResultSchemas,
  type MonitorDriftInput,
  type RetrainTrigger,
  type TaskType,
} from '@memberjunction/predictive-studio-core';

/** How a dataset's periods map to monitoring periods: one calendar year (D1c, D1r, D2) or one month (T4) per index. */
export type PeriodCalendar = { readonly Kind: 'year'; readonly BaseYear: number } | { readonly Kind: 'month'; readonly BaseYear: number };

/** A published model under monitoring. */
export interface MonitoredGateModel {
  readonly ModelID: string;
  readonly PipelineID: string;
  /** The test binding the later periods were scored through; null when the model is monitored by shadow Predict. */
  readonly BindingID: string | null;
  readonly Dataset: LoadedDataset;
  readonly Calendar: PeriodCalendar;
  /** The monitored periods arrive into the pipeline's snapshot before they are monitored ({@link PublishOnPeriodsOptions.Challenger}). */
  readonly Arriving: boolean;
}

/** One monitored period as its `MJ: ML Monitoring Results` row stores it. */
export interface MonitoredGatePeriod {
  readonly Index: number;
  readonly Start: string;
  readonly ResultID: string | null;
  readonly State: MJMLMonitoringResultEntity['State'] | 'not-run';
  readonly ErrorMessage: string | null;
  readonly ScoredRows: number;
  readonly JoinedRows: number;
  readonly ExcludedInTrainingRows: number;
  /** Predictions of the period whose label window closed: scored, less the training rows. */
  readonly ClosedWindowPredictions: number;
  readonly PrimaryValue: number | null;
  readonly PrimaryLower: number | null;
  readonly PrimaryUpper: number | null;
  /** The tracked positive rate (from the realised labels) with its 95% bounds; null when the row tracks none. */
  readonly PositiveRate: { readonly Value: number; readonly Lower: number; readonly Upper: number } | null;
  readonly TriggersFired: readonly string[];
  readonly ChallengerRunID: string | null;
  /** `ChallengerResult.outcome` (`none`, `waiting`, `published`, `withheld`, `stopped`, `failed`); null when absent. */
  readonly ChallengerOutcome: string | null;
  /** `RollbackCheck.kind`; null when absent. */
  readonly RollbackKind: string | null;
  /** `Parity.passed`; null when the row stores no parity. */
  readonly ParityPassed: boolean | null;
  readonly ParityMaxAbsDifference: number | null;
}

/** How a monitored gate model is set up. */
export interface PublishOnPeriodsOptions {
  readonly Scenario: ScenarioID;
  readonly Task: TaskType;
  readonly Calendar: PeriodCalendar;
  /** The retrain triggers of the model's protocol (default: one outcome-degradation trigger, margin 0.01, one period). */
  readonly Triggers?: readonly RetrainTrigger[];
  /** Bind the model and score these later periods through the binding, each as of its period's first day. */
  readonly ScorePeriods?: readonly number[];
  /**
   * A challenger gate: before `RunPeriods` the monitored periods arrive (the unit's fixed censoring cutoff — the
   * fixture's clock — moves past them, `UnitFixtures.AdvanceCensoring`), so a fired trigger's challenger snapshots
   * them; the monitoring job re-carves the protocol's date-carved holdout over them (`ChallengerProtocol`, P-F2), so
   * the challenger trains on the later periods and is compared with the incumbent on the newest one.
   */
  readonly Challenger?: boolean;
}

/** The monitoring gates' fixture steps. */
export class MonitoringFixture {
  /** q(3) of procedure M for the 3-look D1c design (§3.3 C7; q(12) is `MonitoringJobSpecs.DEFAULT_DRIFT_Q`). */
  public static readonly Q3 = 0.0171;
  /** No-drift replays behind each statistical look's empirical p-value. */
  public static readonly STAT_REPLAYS = 2000;
  /** The trigger the monitoring gates' protocols carry: one period whose (period − reference) loss lower bound beats 0.01. */
  public static readonly DEGRADATION: RetrainTrigger = { kind: 'outcome-degradation', margin: EvaluationProtocol.ToNonNegative(0.01), consecutivePeriods: 1 };

  /** The first day of period `index` under the calendar, `YYYY-MM-DD`. */
  public static PeriodStart(calendar: PeriodCalendar, index: number): string {
    const d = calendar.Kind === 'year' ? new Date(Date.UTC(calendar.BaseYear + index, 0, 1)) : new Date(Date.UTC(calendar.BaseYear, index, 1));
    return d.toISOString().slice(0, 10);
  }

  /**
   * A model trained on the dataset's `periods` only (the unit censors every row dated from the period after the last),
   * evaluated and published through the lifecycle gate; with `ScorePeriods`, bound and scored as of each of them.
   */
  public static async PublishOnPeriods(h: TruthHarness, dataset: LoadedDataset, periods: readonly number[], o: PublishOnPeriodsOptions): Promise<MonitoredGateModel> {
    const trainThrough = MonitoringFixture.PeriodStart(o.Calendar, Math.max(...periods) + 1);
    const triggers = o.Triggers || [MonitoringFixture.DEGRADATION];
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionMonitoredScenarioPipeline(h, o.Scenario, o.Task, trainThrough, triggers);
    const trained = await h.Train(pipeline);
    if (!trained.ModelID) {
      const run = trained.Ok ? await UnitFixtures.LatestRun(h, pipeline.ID) : null;
      const why = run === null ? trained.ErrorMessage || 'no model' : `run ${run.ID} ${run.Status}, no model: ${(run.Notes || '').slice(0, 600)} ${(run.ValidationResults || '').slice(0, 600)}`;
      throw new Error(`monitoring fixture: training ${o.Scenario} failed (${trained.RefusalCode || 'no refusal code'}): ${why}`);
    }
    await RunFixtures.PublishModel(h, trained.ModelID, `monitoring ${o.Scenario}`);
    const scored = o.ScorePeriods || [];
    const arriving = o.Challenger === true;
    if (scored.length === 0) return { ModelID: trained.ModelID, PipelineID: pipeline.ID, BindingID: null, Dataset: dataset, Calendar: o.Calendar, Arriving: arriving };
    const binding = await HarnessScoring.Binding(h, trained.ModelID, `PS monitoring ${o.Scenario} ${h.RunID}`);
    for (const p of scored) {
      const day = MonitoringFixture.PeriodStart(o.Calendar, p);
      const r = await h.Score(trained.ModelID, { bindingId: binding, scope: { filter: { entityName: dataset.Entity.Name, extraFilter: `T = '${EscapeSQLString(day)}'` } }, asOfDate: `${day}T00:00:00.000Z` });
      if (!r.Ok) throw new Error(`monitoring fixture: scoring period ${p} of ${o.Scenario} failed: ${r.ErrorMessage || 'no message'}`);
    }
    return { ModelID: trained.ModelID, PipelineID: pipeline.ID, BindingID: binding, Dataset: dataset, Calendar: o.Calendar, Arriving: arriving };
  }

  /** How many of the dataset's rows are dated `day` (`T`), the rows a period's binding run scored. */
  public static async RowsDatedAt(h: Pick<TruthHarness, 'Provider' | 'User'>, dataset: LoadedDataset, day: string): Promise<number> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<{ ID: string }>({ EntityName: dataset.Entity.Name, ExtraFilter: `T = '${EscapeSQLString(day)}'`, Fields: ['ID'], ResultType: 'simple', IgnoreMaxRows: true }, h.User);
    if (!r.Success) throw new Error(`reading ${dataset.Entity.Name} rows dated ${day} failed: ${r.ErrorMessage}`);
    return r.Results.length;
  }

  /** Runs `PredictiveStudio.RunModelMonitoring` for each period in order and reads each period's row back. */
  public static async RunPeriods(h: TruthHarness, model: MonitoredGateModel, periods: readonly number[]): Promise<MonitoredGatePeriod[]> {
    const out: MonitoredGatePeriod[] = [];
    if (model.Arriving) await UnitFixtures.AdvanceCensoring(h, model.PipelineID, MonitoringFixture.PeriodStart(model.Calendar, Math.max(...periods) + 1));
    for (const index of periods) {
      const start = MonitoringFixture.PeriodStart(model.Calendar, index);
      const attempt = await h.RunMonitoring(model.ModelID, new Date(`${start}T00:00:00.000Z`));
      const period = attempt.Periods[0];
      if (!attempt.Ok || !period) {
        out.push(MonitoringFixture.notRun(index, start, attempt.ErrorMessage || attempt.Skipped || 'no period was returned'));
        continue;
      }
      out.push(await MonitoringFixture.ReadPeriod(h, index, period.monitoringResultId));
    }
    return out;
  }

  /** One period row read back, its JSON columns parsed. */
  public static async ReadPeriod(h: Pick<TruthHarness, 'Provider' | 'User'>, index: number, resultId: string): Promise<MonitoredGatePeriod> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<MJMLMonitoringResultEntity>({ EntityName: 'MJ: ML Monitoring Results', ExtraFilter: `ID='${EscapeSQLString(resultId)}'`, ResultType: 'entity_object', BypassCache: true }, h.User); // pk-filter-ok: MJ core entity keyed by ID
    const row = r.Results[0];
    if (!r.Success || !row) throw new Error(`monitoring fixture: period row ${resultId} not read: ${r.ErrorMessage}`);
    const triggers = MonitoringResultSchemas.ParseTriggersFired(row.TriggersFired);
    return {
      Index: index, Start: new Date(row.Period).toISOString().slice(0, 10), ResultID: row.ID, State: row.State, ErrorMessage: row.ErrorMessage,
      ScoredRows: row.ScoredRows, JoinedRows: row.JoinedRows, ExcludedInTrainingRows: row.ExcludedInTrainingRows, ClosedWindowPredictions: row.ScoredRows - row.ExcludedInTrainingRows,
      PrimaryValue: row.PrimaryValue, PrimaryLower: row.PrimaryLower, PrimaryUpper: row.PrimaryUpper,
      PositiveRate: MonitoringFixture.positiveRate(row.TrackedMetrics),
      TriggersFired: triggers.Ok ? triggers.Value.map((t) => t.kind) : [],
      ChallengerRunID: row.ChallengerRunID,
      ChallengerOutcome: MonitoringFixture.member(row.ChallengerResult, 'ChallengerResult', 'outcome'),
      RollbackKind: MonitoringFixture.member(row.RollbackCheck, 'RollbackCheck', 'kind'),
      ParityPassed: MonitoringFixture.parity(row.Parity).Passed,
      ParityMaxAbsDifference: MonitoringFixture.parity(row.Parity).MaxAbsDifference,
    };
  }

  /** The upper bound of the model's holdout primary score, frozen in its `publish` record's evidence (the pre-shift band). */
  public static async ReferenceUpper(h: Pick<TruthHarness, 'Provider' | 'User'>, modelId: string): Promise<number | null> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<MJMLModelPublishRecordEntity>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND Kind='publish'`, OrderBy: 'RecordedAt DESC', MaxRows: 1, ResultType: 'entity_object', BypassCache: true,
    }, h.User);
    const evidence = r.Success && r.Results[0] ? r.Results[0].EvidenceObject : null;
    return evidence === null ? null : evidence.holdoutPrimary.interval.upper;
  }

  /** The pipeline's model a challenger run trained, with its status; null when the run shipped none. */
  public static async ChallengerModel(h: Pick<TruthHarness, 'Provider' | 'User'>, trainingRunId: string): Promise<Pick<MJMLModelEntity, 'ID' | 'Status'> | null> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelEntity, 'ID' | 'Status'>>({
      EntityName: 'MJ: ML Models', ExtraFilter: `TrainingRunID='${EscapeSQLString(trainingRunId)}'`, Fields: ['ID', 'Status'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    return r.Success && r.Results[0] ? r.Results[0] : null;
  }

  /** A model's status now. */
  public static async StatusOf(h: Pick<TruthHarness, 'Provider' | 'User'>, modelId: string): Promise<MJMLModelEntity['Status'] | null> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelEntity, 'ID' | 'Status'>>({
      EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'Status'], ResultType: 'simple', BypassCache: true, // pk-filter-ok: MJ core entity keyed by ID
    }, h.User);
    return r.Success && r.Results[0] ? r.Results[0].Status : null;
  }

  // ----- the statistical replays (M6.7) -----------------------------------------------------------------------------

  /** The `n400` seeds of a scenario (`DatasetSeeds.SeedSet`). */
  public static Seeds(scenario: ScenarioID): readonly number[] {
    return DatasetSeeds.SeedSet('scenario', scenario, 'n400');
  }

  /** One seed's generated rows (`rows.csv`, generated once into the dataset cache), by column. */
  public static async SeedRows(scenario: ScenarioID, seed: number): Promise<ReadonlyMap<string, readonly string[]>> {
    const dir = await DatasetCatalog.EnsureGenerated(DatasetCatalog.Find('scenario', scenario), seed);
    const [header, ...lines] = readFileSync(path.join(dir, 'rows.csv'), 'utf8').trim().split('\n');
    const cols = header.split(',');
    const cells = lines.map((l) => l.split(','));
    return new Map(cols.map((c, i) => [c, cells.map((r) => r[i])]));
  }

  /** One look of procedure M on the suite sidecar; the flagged inputs' names. */
  public static async Look(inputs: MonitorDriftInput[], look: number, q: number, seed: number): Promise<readonly string[]> {
    const r = await HarnessSidecar.SuiteMonitorDrift({ inputs, look, q, replays: MonitoringFixture.STAT_REPLAYS, seed });
    return r.alarms.map((a) => a.input);
  }

  /** q(12), the 12-look design's level (G6.6). */
  public static Q12(): number {
    return MonitoringJobSpecs.DEFAULT_DRIFT_Q;
  }

  private static notRun(index: number, start: string, reason: string): MonitoredGatePeriod {
    return {
      Index: index, Start: start, ResultID: null, State: 'not-run', ErrorMessage: reason, ScoredRows: 0, JoinedRows: 0, ExcludedInTrainingRows: 0, ClosedWindowPredictions: 0,
      PrimaryValue: null, PrimaryLower: null, PrimaryUpper: null, PositiveRate: null, TriggersFired: [], ChallengerRunID: null, ChallengerOutcome: null, RollbackKind: null,
      ParityPassed: null, ParityMaxAbsDifference: null,
    };
  }

  /** A string member of a stored JSON object column; null when the column or the member is absent. */
  private static member(text: string | null, column: string, key: string): string | null {
    if (text === null) return null;
    const json = JsonParse.ParseJsonText(text, column);
    return json.Ok && JsonParse.IsJsonObject(json.Value) ? JsonParse.JsonString(json.Value, key) : null;
  }

  /** The stored parity's `passed` and `maxAbsDifference`. */
  private static parity(text: string | null): { readonly Passed: boolean | null; readonly MaxAbsDifference: number | null } {
    const json = text === null ? null : JsonParse.ParseJsonText(text, 'Parity');
    if (json === null || !json.Ok || !JsonParse.IsJsonObject(json.Value)) return { Passed: null, MaxAbsDifference: null };
    return { Passed: JsonParse.JsonBoolean(json.Value, 'passed'), MaxAbsDifference: JsonParse.JsonNumber(json.Value, 'maxAbsDifference') };
  }

  /** The `positive-rate` entry of the stored tracked metrics, with its interval. */
  private static positiveRate(text: string | null): { readonly Value: number; readonly Lower: number; readonly Upper: number } | null {
    const json = text === null ? null : JsonParse.ParseJsonText(text, 'TrackedMetrics');
    if (json === null || !json.Ok || !Array.isArray(json.Value)) return null;
    for (const m of json.Value) {
      if (!JsonParse.IsJsonObject(m) || JsonParse.JsonString(m, 'metric') !== 'positive-rate') continue;
      const interval = JsonParse.JsonObjectField(m, 'interval');
      const value = JsonParse.JsonNumber(m, 'value');
      const lower = interval === null ? null : JsonParse.JsonNumber(interval, 'lower');
      const upper = interval === null ? null : JsonParse.JsonNumber(interval, 'upper');
      if (value !== null && lower !== null && upper !== null) return { Value: value, Lower: lower, Upper: upper };
    }
    return null;
  }
}
