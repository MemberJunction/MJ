import { RunView, type RemoteOpResult } from '@memberjunction/core';
import {
  type MJProcessRunDetailEntity,
  type MJProcessRunEntity,
  PredictiveStudioCreateScoringProcessOperation,
  PredictiveStudioScoreRecordSetOperation,
  RecordProcessRunNowOperation,
  type RecordProcessRunNowOutput,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { PredictiveStudioRefusalCodes } from '@memberjunction/predictive-studio-core';
import type { RunContext } from './run-fixtures';
import type { LoadedDataset, RecordProcessScoring, ScoreAttempt, ScoreRequest } from './types';

type PrdRow = Pick<MJProcessRunDetailEntity, 'RecordID' | 'Status' | 'ResultPayload' | 'ErrorMessage'>;
type ProcessRunRow = Pick<MJProcessRunEntity, 'ID' | 'Status'>;
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
    const r = await new PredictiveStudioScoreRecordSetOperation().Execute(
      { modelId, ...req },
      { provider: ctx.Provider, user: ctx.User },
    );
    const durationMs = Date.now() - t0;
    if (!r.Success || !r.Output) {
      return {
        Ok: false,
        ErrorMessage: r.ErrorMessage || null,
        RefusalCode: PredictiveStudioRefusalCodes.IsRefusal(r.ResultCode) ? r.ResultCode : null,
        Scored: 0,
        Failed: 0,
        Skipped: 0,
        WroteBack: false,
        Predictions: [],
        DurationMs: durationMs,
      };
    }
    const out = r.Output;
    return {
      Ok: true,
      ErrorMessage: null,
      RefusalCode: null,
      Scored: out.scored,
      Failed: out.failed,
      Skipped: out.skipped,
      WroteBack: out.wroteBack,
      Predictions: (out.predictions || []).map((p) => ({
        RecordID: HarnessScoring.bareId(p.recordId || ''),
        Score: p.score,
        Class: p.class ?? null,
      })),
      DurationMs: durationMs,
    };
  }

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
