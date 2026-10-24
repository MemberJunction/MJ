import { Injectable } from '@angular/core';
import { LogError, RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
  AtRiskRules,
  type RowDriver,
  formatPredictionScore,
  resolveScoreBand,
  type OutcomeConfig,
} from '@memberjunction/predictive-studio-core';

/** One historical score point for an entity record produced by a model run. */
export interface ModelScoreHistoryPoint {
  runId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  RunDate: Date;
  score: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  ScoreFormatted: string;
  riskPct: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  class: string | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  band: 'high' | 'medium' | 'low' | string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  status: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  DurationMs: number | null;
  drivers: RowDriver[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  /** Score delta compared to previous run (e.g. +0.05 or -0.12), or null for the first run. */
  Delta: number | null;
}

export interface LoadScoreHistoryParams {
  /** The provider the history is read through. Required: a dropped provider is a compile error, not an empty panel. */
  provider: IMetadataProvider;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  User?: UserInfo;
  entityId?: string | null;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  recordId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  /** When set, only the runs of this model's Record Processes are read (filtered in the query, not after it). */
  modelId?: string | null;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  /** The most recent runs to read (default 50). */
  MaxRuns?: number;
  OutcomeConfig?: OutcomeConfig | null;
  ProblemType?: string | null;
  InvertedRisk: boolean;
}

/** The Process Run Detail columns the history reads. */
type ScoreHistoryDetailRow = Pick<MJProcessRunDetailEntity, 'ProcessRunID' | 'ResultPayload' | 'Status' | 'CompletedAt' | '__mj_CreatedAt' | 'DurationMs'>;

/** The prediction fields of a stored result payload (write-back runs nest them under `output`). */
interface ScoredPayload {
  score?: number;
  class?: string;
  // unknown: the raw per-record drivers; AtRiskRules.ParseRowDrivers narrows them
  drivers?: unknown;
}

/**
 * Service for retrieving and formatting the complete historical trendline of model prediction
 * results for a specific entity record from `MJ: Process Run Details`.
 */
@Injectable({
  providedIn: 'root',
})
export class PredictiveStudioScoreHistoryService {
  /** The fields {@link LoadRecordScoreHistory} reads; display-only, so the read is `simple`. */
  private static readonly historyFields: Array<keyof ScoreHistoryDetailRow> = ['ProcessRunID', 'ResultPayload', 'Status', 'CompletedAt', '__mj_CreatedAt', 'DurationMs'];

  /**
   * Load the most recent predictions for a record (up to `MaxRuns`), returned oldest to newest. Read failures are logged
   * and return an empty history.
   */
  public async LoadRecordScoreHistory(params: LoadScoreHistoryParams): Promise<ModelScoreHistoryPoint[]> {
    if (!params.recordId) return [];
    try {
      const res = await this.CreateRunView(params.provider).RunView<ScoreHistoryDetailRow>(
        {
          EntityName: 'MJ: Process Run Details',
          ExtraFilter: this.BuildHistoryFilter(params),
          // Newest first so MaxRuns keeps the latest window; reversed below for the oldest-to-newest trendline.
          OrderBy: '__mj_CreatedAt DESC',
          MaxRows: params.MaxRuns ?? 50,
          ResultType: 'simple',
          Fields: PredictiveStudioScoreHistoryService.historyFields,
        },
        params.User,
      );
      if (!res.Success) {
        LogError(`PredictiveStudioScoreHistoryService.LoadRecordScoreHistory: ${res.ErrorMessage}`);
        return [];
      }
      return this.ToHistoryPoints([...(res.Results ?? [])].reverse(), params);
    } catch (err) {
      LogError(`PredictiveStudioScoreHistoryService.LoadRecordScoreHistory: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** The RunView the history reads through. Tests override this to serve fixture rows. */
  protected CreateRunView(provider: IMetadataProvider): Pick<RunView, 'RunView' | 'RunViews'> {
    return RunView.FromMetadataProvider(provider);
  }

  /**
   * The detail filter: the record (and entity, when known) and, when a model is given, only the runs of Record Processes
   * whose configuration names that model. Schema and view names come from the provider's metadata.
   */
  protected BuildHistoryFilter(params: LoadScoreHistoryParams): string {
    let filter = `RecordID = '${EscapeSQLString(params.recordId)}'`;
    if (params.entityId) {
      filter += ` AND EntityID = '${EscapeSQLString(params.entityId)}'`;
    }
    if (params.modelId) {
      filter += ` AND ${this.BuildModelRunsPredicate(params.provider, params.modelId)}`;
    }
    return filter;
  }

  /** `ProcessRunID IN (…)` over the runs of the Record Processes configured for `modelId`. */
  protected BuildModelRunsPredicate(provider: IMetadataProvider, modelId: string): string {
    const runs = provider.EntityByName('MJ: Process Runs');
    const processes = provider.EntityByName('MJ: Record Processes');
    if (!runs || !processes) {
      throw new Error("The 'MJ: Process Runs' or 'MJ: Record Processes' entity is not in this provider's metadata.");
    }
    return (
      `ProcessRunID IN (SELECT pr.ID FROM ${runs.SchemaName}.${runs.BaseView} pr ` +
      `INNER JOIN ${processes.SchemaName}.${processes.BaseView} rp ON rp.ID = pr.RecordProcessID ` +
      `WHERE JSON_VALUE(rp.Configuration, '$.modelId') = '${EscapeSQLString(modelId)}')`
    );
  }

  /** Turn the oldest-to-newest detail rows into trendline points, skipping rows without a usable score. */
  protected ToHistoryPoints(rows: ScoreHistoryDetailRow[], params: LoadScoreHistoryParams): ModelScoreHistoryPoint[] {
    const points: ModelScoreHistoryPoint[] = [];
    let previousScore: number | null = null;
    for (const d of rows) {
      const p = this.parsePayload(d.ResultPayload);
      if (!p || typeof p.score !== 'number' || !Number.isFinite(p.score)) continue;
      const score = p.score;
      const delta = previousScore !== null ? score - previousScore : null;
      previousScore = score;
      const runDate = d.CompletedAt ?? d.__mj_CreatedAt ?? new Date();
      const resolvedBand = params.OutcomeConfig ? resolveScoreBand(score, params.OutcomeConfig) : null;
      // Risk and its band follow the same rule as the at-risk list, so a renewal model's history is not inverted
      // relative to its list; the outcome band supplies only the status label.
      const risk = AtRiskRules.RiskOf(score, params.InvertedRisk);
      points.push({
        runId: d.ProcessRunID,
        RunDate: runDate instanceof Date ? runDate : new Date(runDate),
        score,
        ScoreFormatted: formatPredictionScore(score, params.OutcomeConfig, params.ProblemType),
        riskPct: Math.round(risk * 100),
        class: p.class ?? null,
        band: AtRiskRules.RiskBandFor(risk),
        status: resolvedBand?.Label || d.Status || 'Completed',
        DurationMs: d.DurationMs ?? null,
        drivers: AtRiskRules.ParseRowDrivers(p.drivers, params.InvertedRisk) ?? [],
        Delta: delta,
      });
    }
    return points;
  }

  /** Parse a stored payload to its prediction fields; null when it is missing or not JSON. */
  private parsePayload(payload: string | null): ScoredPayload | null {
    if (!payload) return null;
    try {
      const parsed: ScoredPayload & { output?: ScoredPayload } = JSON.parse(payload);
      return parsed.output ?? parsed;
    } catch {
      return null;
    }
  }
}
