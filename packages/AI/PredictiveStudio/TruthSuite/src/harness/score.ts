import { RunView, type EntityInfo, type RemoteOpResult } from '@memberjunction/core';
import {
  type MJMLModelEntity,
  type MJMLTrainingPipelineEntity,
  type MJProcessRunDetailEntity,
  type MJProcessRunEntity,
  PredictiveStudioCreateScoringProcessOperation,
  PredictiveStudioScoreRecordSetOperation,
  type PredictiveStudioScoreRecordSetOutput,
  RecordProcessRunNowOperation,
  type RecordProcessRunNowOutput,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { MetadataEntityFactory, ScoringBindings, UnitModelLineageParser, type ScoringBindingInput } from '@memberjunction/predictive-studio';
import { PredictiveStudioRefusalCodes } from '@memberjunction/predictive-studio-core';
import type { RunContext } from './run-fixtures';
import type { LoadedDataset, RecordProcessScoring, ScoreAttempt, ScoreRequest, TruthHarness } from './types';

type PrdRow = Pick<MJProcessRunDetailEntity, 'RecordID' | 'Status' | 'ResultPayload' | 'ErrorMessage'>;
type ProcessRunRow = Pick<MJProcessRunEntity, 'ID' | 'Status'>;
/** The model columns a test binding is built from. */
export type BindingModelRow = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Lineage'>;
/** How {@link HarnessScoring.Binding} builds a test binding beyond its model and feature name. */
export interface BindingOptions {
  /** The binding's target entity; omitted: the entity the model's records are read from. */
  readonly EntityName?: string;
}
/** The pipeline column a test binding falls back to for a model whose lineage names no unit. */
type BindingPipelineRow = Pick<MJMLTrainingPipelineEntity, 'ID' | 'TargetEntity'>;
const TERMINAL_RUN_STATUSES: ReadonlySet<MJProcessRunEntity['Status']> = new Set(['Completed', 'Failed', 'Cancelled']);
/** The result codes GraphQLDataProvider.RouteOperation returns when the call itself failed, not the operation. */
const TRANSPORT_DROP_CODES: ReadonlySet<string> = new Set(['TRANSPORT_ERROR', 'NO_RESPONSE']);
const POLL_ATTEMPTS = 480;
const POLL_INTERVAL_MS = 5_000;

/** Scoring operation and record-process scoring wrappers for the truth harness. */
export class HarnessScoring {
  /** The bare record id of a `Field=value` composite-key string (or the string itself when it has no `=`). */
  private static bareId(raw: string): string {
    const s = raw.trim();
    const eq = s.indexOf('=');
    return (eq >= 0 ? s.slice(eq + 1) : s).trim();
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Execute `PredictiveStudio.ScoreRecordSet` and return a `ScoreAttempt` (never throws for a product refusal). */
  public static async Score(ctx: RunContext, modelId: string, req: ScoreRequest): Promise<ScoreAttempt> {
    const t0 = Date.now();
    const r = await new PredictiveStudioScoreRecordSetOperation().Execute({ modelId, ...req }, { provider: ctx.Provider, user: ctx.User });
    return HarnessScoring.AttemptOf(r, Date.now() - t0);
  }

  /**
   * The attempt of one operation result. A completed run is the output; a refused or failed run is read from its code
   * and message (the operation returns no output then): the scoring run it names and, for a failed run, its counts.
   */
  public static AttemptOf(r: RemoteOpResult<PredictiveStudioScoreRecordSetOutput>, durationMs: number): ScoreAttempt {
    if (r.Success && r.Output) {
      const out = r.Output;
      return {
        Ok: true, ErrorMessage: null, RefusalCode: null, ScoringRunID: out.scoringRunId, Status: out.status, Total: out.total, Written: out.written, Failed: 0,
        Predictions: (out.predictions || []).map((p) => ({ RecordID: HarnessScoring.bareId(p.recordId), Score: p.score, Class: p.class || null })),
        DurationMs: durationMs,
      };
    }
    const message = r.ErrorMessage || '';
    const refusalCode = PredictiveStudioRefusalCodes.IsRefusal(r.ResultCode) ? r.ResultCode : null;
    const runId = HarnessScoring.RUN_IN_MESSAGE.exec(message)?.[1] || null;
    const counts = HarnessScoring.FAILED_COUNTS.exec(message);
    return {
      Ok: false, ErrorMessage: message || null, RefusalCode: refusalCode, ScoringRunID: runId,
      Status: runId === null ? null : refusalCode === 'SCORING_RUN_FAILED' ? 'failed' : 'refused',
      Total: counts ? Number(counts[2]) : 0, Written: 0, Failed: counts ? Number(counts[1]) : 0, Predictions: [], DurationMs: durationMs,
    };
  }

  /**
   * Creates a test scoring binding of `modelId`'s pipeline through `ScoringBindings.Upsert` (the binding editor's
   * writer): feature `featureName`, the seeded default view authorization (`ScoringBindings.ResolveViewAuthorizationID`,
   * which the harness user holds, D4-153), no Record Process, no column, `OnDemand`. Its target entity is
   * `options.EntityName` when given (G5.1 tries a copy entity, which the binding's save refuses: D4-168), else the entity a Score
   * Record Set call of the model reads its records from ({@link BindingEntityName}). The binding is deleted with its
   * pipeline by `RunFixtures.CleanupRun`. Returns the binding's ID.
   *
   * @throws when the model or its pipeline cannot be read, the entity is not in the provider's metadata, or the save fails
   */
  public static async Binding(h: Pick<TruthHarness, 'Provider' | 'User'>, modelId: string, featureName: string, options: BindingOptions = {}): Promise<string> {
    const factory = new MetadataEntityFactory(h.Provider);
    const model = await HarnessScoring.readBindingModel(h, modelId);
    const entityName = options.EntityName || HarnessScoring.BindingEntityName(model, await HarnessScoring.pipelineTargetEntity(h, model));
    const entity = h.Provider.EntityByName(entityName);
    if (!entity) throw new Error(`HarnessScoring.Binding: the entity '${entityName}' of ML Model ${modelId} is not in the provider's metadata`);
    const input = HarnessScoring.BindingInput(model, entity, featureName, ScoringBindings.ResolveViewAuthorizationID(null, h.Provider));
    return (await ScoringBindings.Upsert(input, factory, h.User)).ID;
  }

  /**
   * The entity a binding of the model scores: its Prediction Unit's row entity when its lineage names a unit (the
   * entity Score Record Set reads a unit model's records from), else `pipelineTargetEntity`. Pure.
   *
   * @throws when the lineage names a unit but cannot be read, or the model has neither entity
   */
  public static BindingEntityName(model: BindingModelRow, pipelineTargetEntity: string | null): string {
    if (UnitModelLineageParser.NamesUnit(model.Lineage)) {
      const lineage = UnitModelLineageParser.ParseUnitModelLineage(model.Lineage);
      if (lineage.Ok === false) throw new Error(`HarnessScoring.Binding: ML Model ${model.ID} names a Prediction Unit but its lineage cannot be read: ${lineage.Errors.join('; ')}`);
      return lineage.Value.unitRowEntity;
    }
    if (!pipelineTargetEntity) throw new Error(`HarnessScoring.Binding: ML Model ${model.ID} names no unit and its pipeline ${model.PipelineID} no target entity`);
    return pipelineTargetEntity;
  }

  /** The create input of a test binding of `model`'s pipeline on `entity`. Pure. */
  public static BindingInput(model: BindingModelRow, entity: Pick<EntityInfo, 'ID'>, featureName: string, viewAuthorizationId: string): ScoringBindingInput {
    return {
      mlTrainingPipelineId: model.PipelineID, featureName, viewAuthorizationId, targetEntityId: entity.ID,
      recordProcessId: null, targetColumn: null, targetColumnSource: null, mode: 'OnDemand',
    };
  }

  /** The model row a binding is built from; throws when it is missing. */
  private static async readBindingModel(h: Pick<TruthHarness, 'Provider' | 'User'>, modelId: string): Promise<BindingModelRow> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<BindingModelRow>({
      EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'PipelineID', 'Lineage'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    const row = r.Success ? r.Results[0] : undefined;
    if (row === undefined) throw new Error(`HarnessScoring.Binding: reading ML Model ${modelId} failed: ${r.ErrorMessage || 'no row'}`);
    return row;
  }

  /** The model's pipeline's target entity name (null when it names none); throws when the pipeline cannot be read. */
  private static async pipelineTargetEntity(h: Pick<TruthHarness, 'Provider' | 'User'>, model: BindingModelRow): Promise<string | null> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<BindingPipelineRow>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(model.PipelineID)}'`, Fields: ['ID', 'TargetEntity'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    const row = r.Success ? r.Results[0] : undefined;
    if (row === undefined) throw new Error(`HarnessScoring.Binding: reading ML Training Pipeline ${model.PipelineID} failed: ${r.ErrorMessage || 'no row'}`);
    return row.TargetEntity;
  }

  /** The scoring run a refusal's message names (`… (scoring run <id>…`). */
  private static readonly RUN_IN_MESSAGE = /scoring run ([0-9A-Fa-f-]{36})/;
  /** A failed run's counts in its message (`<failed> of <total> records failed`). */
  private static readonly FAILED_COUNTS = /(\d+) of (\d+) records failed/;

  /** Create an on-demand scoring Record Process, run it now, and read back all `MJ: Process Run Details` rows. */
  public static async ScoreViaRecordProcess(
    ctx: RunContext,
    modelId: string,
    dataset: LoadedDataset,
    extraFilter: string,
  ): Promise<RecordProcessScoring> {
    const cs = await new PredictiveStudioCreateScoringProcessOperation().Execute(
      {
        modelId,
        targetEntityName: dataset.Entity.Name,
        scope: extraFilter.trim().length > 0 ? { filter: extraFilter } : { all: true },
        name: `PSTruth: scoring ${modelId} ${ctx.RunID}`,
      },
      { provider: ctx.Provider, user: ctx.User },
    );
    if (!cs.Success || !cs.Output) {
      throw new Error(`CreateScoringProcess failed: ${cs.ErrorMessage || 'no output'}`);
    }
    const recordProcessId = cs.Output.recordProcessId;
    const since = new Date();
    const rn = await new RecordProcessRunNowOperation().Execute(
      { recordProcessID: recordProcessId },
      { provider: ctx.Provider, user: ctx.User },
    );
    const { ID: processRunId, Status: status } = await HarnessScoring.finishedRun(ctx, recordProcessId, rn, since);

    const detailsRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<PrdRow>(
      {
        EntityName: 'MJ: Process Run Details',
        ExtraFilter: `ProcessRunID='${EscapeSQLString(processRunId)}'`,
        Fields: ['RecordID', 'Status', 'ResultPayload', 'ErrorMessage'],
        // A fixed order: callers sum and rank the details, so the same run must read back the same way every time.
        OrderBy: 'RecordID ASC, ID ASC',
        ResultType: 'simple',
        IgnoreMaxRows: true,
        BypassCache: true,
      },
      ctx.User,
    );
    if (!detailsRes.Success) throw new Error(`read process run details: ${detailsRes.ErrorMessage}`);
    return {
      ProcessRunID: processRunId,
      Status: status,
      Details: detailsRes.Results.map((d) => ({
        RecordID: HarnessScoring.bareId(d.RecordID),
        Status: d.Status,
        ResultPayload: d.ResultPayload ?? null,
      })),
    };
  }

  /**
   * The finished process run of a RunNow call. A RunNow that returned its run is polled by run ID until the run's status
   * is terminal (`Pending`, `Running` and `Paused` are legal answers). A RunNow that dropped at the transport
   * (`TRANSPORT_ERROR`/`NO_RESPONSE`, no run ID) may still be running server-side, so the record process's newest run
   * is polled for. Any other failure is a refusal or a validation error that started nothing, and throws at once.
   */
  private static async finishedRun(
    ctx: RunContext,
    recordProcessId: string,
    rn: RemoteOpResult<RecordProcessRunNowOutput>,
    since: Date,
  ): Promise<{ ID: string; Status: MJProcessRunEntity['Status'] }> {
    const runId = rn.Output?.processRunID;
    if (runId) {
      if (rn.Output && TERMINAL_RUN_STATUSES.has(rn.Output.status)) return { ID: runId, Status: rn.Output.status };
      return HarnessScoring.pollRun(ctx, `ID='${EscapeSQLString(runId)}'`, `process run ${runId}`);
    }
    if (rn.ResultCode && TRANSPORT_DROP_CODES.has(rn.ResultCode)) {
      const startedAfter = new Date(since.getTime() - 5000).toISOString();
      const filter = `RecordProcessID='${EscapeSQLString(recordProcessId)}' AND StartTime >= '${startedAfter}'`;
      return HarnessScoring.pollRun(ctx, filter, `the run of record process ${recordProcessId}`);
    }
    throw new Error(`RecordProcess.RunNow for ${recordProcessId} failed (${rn.ResultCode || 'no result code'}): ${rn.ErrorMessage || 'no processRunID'}`);
  }

  /** Poll the newest `MJ: Process Runs` row matching `filter` until its status is terminal (480 × 5 s). */
  private static async pollRun(ctx: RunContext, filter: string, what: string): Promise<{ ID: string; Status: MJProcessRunEntity['Status'] }> {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<ProcessRunRow>(
        {
          EntityName: 'MJ: Process Runs',
          ExtraFilter: filter,
          Fields: ['ID', 'Status'],
          OrderBy: 'StartTime DESC',
          MaxRows: 1,
          SkipTotalRowCount: true,
          BypassCache: true,
        },
        ctx.User,
      );
      if (!res.Success) throw new Error(`read process runs: ${res.ErrorMessage}`);
      const run = res.Results[0];
      if (run && TERMINAL_RUN_STATUSES.has(run.Status)) return { ID: run.ID, Status: run.Status };
      await HarnessScoring.sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`${what} did not finish within ${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60_000} minutes`);
  }
}
