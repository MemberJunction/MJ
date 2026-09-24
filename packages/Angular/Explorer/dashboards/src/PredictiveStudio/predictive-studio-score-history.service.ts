import { Injectable } from '@angular/core';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ParseRowDrivers, type RowDriver } from './at-risk.view-models';
import {
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
  provider: IMetadataProvider;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  User?: UserInfo;
  entityId?: string | null;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  recordId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  modelId?: string | null;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  MaxRuns?: number;
  OutcomeConfig?: OutcomeConfig | null;
  ProblemType?: string | null;
}

function bandForScore(score: number): 'high' | 'medium' | 'low' {
  return score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';
}

/**
 * Service for retrieving and formatting the complete historical trendline of model prediction
 * results for a specific entity record from `MJ: Process Run Details`.
 */
@Injectable({
  providedIn: 'root',
})
export class PredictiveStudioScoreHistoryService {
  /**
   * Load the history of predictions for a specific record across all runs (ordered oldest to newest).
   */
  public async LoadRecordScoreHistory(params: LoadScoreHistoryParams): Promise<ModelScoreHistoryPoint[]> {
    const { provider, User: user, entityId, recordId, modelId, MaxRuns: maxRuns = 50, OutcomeConfig: outcomeConfig, ProblemType: problemType } = params;
    if (!recordId) return [];

    let extraFilter = `RecordID = '${recordId.replace(/'/g, "''")}'`;
    if (entityId) {
      extraFilter += ` AND EntityID = '${entityId.replace(/'/g, "''")}'`;
    }

    try {
      const rv = RunView.FromMetadataProvider(provider);
      const res = await rv.RunView<MJProcessRunDetailEntity>(
        {
          EntityName: 'MJ: Process Run Details',
          ExtraFilter: extraFilter,
          OrderBy: '__mj_CreatedAt ASC',
          MaxRows: maxRuns,
          ResultType: 'entity_object',
        },
        user,
      );

      if (!res.Success || !res.Results) return [];

      const points: ModelScoreHistoryPoint[] = [];
      let previousScore: number | null = null;

      for (const d of res.Results) {
        if (!d.ResultPayload) continue;

        let parsed: {
          modelId?: string;
          score?: number;
          class?: string;
          drivers?: unknown;
          scoredAt?: string;
          output?: { modelId?: string; score?: number; class?: string; drivers?: unknown; scoredAt?: string };
        };

        try {
          parsed = JSON.parse(d.ResultPayload);
        } catch {
          continue;
        }

        const p = parsed.output ?? parsed;
        if (typeof p.score !== 'number' || !Number.isFinite(p.score)) continue;

        const effectiveModelId = p.modelId ?? parsed.modelId;
        if (modelId && effectiveModelId && !UUIDsEqual(effectiveModelId, modelId)) {
          continue;
        }

        const score = p.score;
        const delta = previousScore !== null ? score - previousScore : null;
        previousScore = score;

        const runDate = d.CompletedAt ?? d.__mj_CreatedAt ?? new Date();

        const resolvedBand = outcomeConfig ? resolveScoreBand(score, outcomeConfig) : null;

        points.push({
          runId: d.ProcessRunID,
          RunDate: runDate instanceof Date ? runDate : new Date(runDate),
          score,
          ScoreFormatted: formatPredictionScore(score, outcomeConfig, problemType),
          riskPct: Math.round(score * 100),
          class: p.class ?? null,
          band: resolvedBand?.Key ?? bandForScore(score),
          status: resolvedBand?.Label ?? d.Status ?? 'Completed',
          DurationMs: d.DurationMs ?? null,
          drivers: ParseRowDrivers(p.drivers) ?? [],
          Delta: delta,
        });
      }

      return points;
    } catch {
      return [];
    }
  }
}
