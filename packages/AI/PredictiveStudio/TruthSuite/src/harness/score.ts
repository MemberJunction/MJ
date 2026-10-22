import { RunView } from '@memberjunction/core';
import {
  type MJProcessRunDetailEntity,
  type MJProcessRunEntity,
  PredictiveStudioCreateScoringProcessOperation,
  PredictiveStudioScoreRecordSetOperation,
  RecordProcessRunNowOperation,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { RunContext } from './run-fixtures';
import type { LoadedDataset, RecordProcessScoring, ScoreAttempt, ScoreRequest } from './types';

type PrdRow = Pick<MJProcessRunDetailEntity, 'RecordID' | 'Status' | 'ResultPayload' | 'ErrorMessage'>;
type ProcessRunRow = Pick<
  MJProcessRunEntity,
  'ID' | 'Status' | 'StartTime' | 'EndTime' | 'ProcessedItems' | 'SuccessCount' | 'ErrorCount' | 'SkippedCount' | 'ErrorMessage'
>;
const TERMINAL_RUN_STATUSES: ReadonlySet<MJProcessRunEntity['Status']> = new Set(['Completed', 'Failed', 'Cancelled']);

function bareId(raw: string): string {
  const s = raw.trim();
  const eq = s.indexOf('=');
  return (eq >= 0 ? s.slice(eq + 1) : s).trim();
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Scoring operation and record-process scoring wrappers for the truth harness. */
export class HarnessScoring {
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
      Scored: out.scored,
      Failed: out.failed,
      Skipped: out.skipped,
      WroteBack: out.wroteBack,
      Predictions: (out.predictions || []).map((p) => ({
        RecordID: bareId(p.recordId || ''),
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
    // A RunNow that drops at the transport (Success=false, no processRunID) leaves the run going server-side, so poll for it.
    let processRunId: string | null = null;
    let status: MJProcessRunEntity['Status'] = 'Failed';
    if (rn.Output && rn.Output.processRunID) {
      processRunId = rn.Output.processRunID;
      status = rn.Output.status;
    } else {
      for (let i = 0; i < 480; i++) {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<ProcessRunRow>(
          {
            EntityName: 'MJ: Process Runs',
            ExtraFilter: `RecordProcessID='${EscapeSQLString(recordProcessId)}' AND StartTime >= '${new Date(since.getTime() - 5000).toISOString()}'`,
            Fields: ['ID', 'Status', 'StartTime', 'EndTime', 'ProcessedItems', 'SuccessCount', 'ErrorCount', 'SkippedCount', 'ErrorMessage'],
            OrderBy: 'StartTime DESC',
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
          },
          ctx.User,
        );
        if (!res.Success) throw new Error(`read process runs: ${res.ErrorMessage}`);
        const run = res.Results[0];
        if (run && TERMINAL_RUN_STATUSES.has(run.Status)) {
          processRunId = run.ID;
          status = run.Status;
          break;
        }
        await sleep(5_000);
      }
      if (!processRunId) {
        throw new Error(`RecordProcess.RunNow for ${recordProcessId} failed: ${rn.ErrorMessage || 'no processRunID'}`);
      }
    }

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
        RecordID: bareId(d.RecordID),
        Status: d.Status,
        ResultPayload: d.ResultPayload ?? null,
      })),
    };
  }
}
