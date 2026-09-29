/**
 * cost-and-time.ts — wall time, cost and latency per pipeline type.
 *
 * Pure. Wall time comes from the rig's clock around each `ProcessBatch` call. Cost and latency come from
 * each record's `MJ: AI Prompt Runs` row, read after its saves finished: cost is `TotalCost` (own plus
 * descendant cost), falling back to `Cost`. A run whose cost is unknown adds nothing and is counted, so
 * the report can say its per-1,000 figure is a lower bound.
 */
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { NearestRankQuantile } from './metrics';
import type { BatchTiming, MeasuredPipelineType, PromptRunCost, RecordPrediction } from './types';

/** The `MJ: AI Prompt Runs` columns the rig reads for cost and latency. */
export type PromptRunCostRow = Pick<MJAIPromptRunEntity, 'ID' | 'Status' | 'TotalCost' | 'Cost' | 'CostCurrency' | 'ExecutionTimeMS'>;

/** The columns of {@link PromptRunCostRow}, for `RunView`'s `Fields`. */
export const PROMPT_RUN_COST_FIELDS: ReadonlyArray<keyof PromptRunCostRow> = ['ID', 'Status', 'TotalCost', 'Cost', 'CostCurrency', 'ExecutionTimeMS'];

/** The statuses a prompt run's finalize save leaves it in. The same save sets its cost. */
const FINISHED_PROMPT_RUN_STATUSES: ReadonlyArray<MJAIPromptRunEntity['Status']> = ['Completed', 'Failed', 'Cancelled'];

/** Whether a prompt run's row has had its finalize save (a terminal status), so its cost is final. */
export function IsPromptRunFinished(row: PromptRunCostRow | undefined): boolean {
    return !!row && FINISHED_PROMPT_RUN_STATUSES.includes(row.Status);
}

/** A prompt run's cost (`TotalCost`, falling back to `Cost`) and latency; all null when its row was not found. */
export function ToPromptRunCost(promptRunID: string, row: PromptRunCostRow | undefined): PromptRunCost {
    return {
        PromptRunID: promptRunID,
        Cost: row?.TotalCost ?? row?.Cost ?? null,
        Currency: row?.CostCurrency ?? null,
        ExecutionTimeMS: row?.ExecutionTimeMS ?? null,
        Finished: IsPromptRunFinished(row),
    };
}

/** A type's wall time over all its `ProcessBatch` calls. */
export interface WallTimeSummary {
    Records: number;
    TotalWallMs: number;
    MsPer1000: number | null;
}

/** A type's cost over its prompt runs. */
export interface CostSummary {
    /** Answers the cost is spread over. */
    Records: number;
    /** Distinct prompt runs behind them. */
    Runs: number;
    /** Runs whose cost was known. */
    RunsWithCost: number;
    TotalCost: number;
    /** Null when no run's cost was known; otherwise a lower bound when `RunsWithCost` < `Runs`. */
    CostPer1000: number | null;
    Currencies: string[];
}

/** A type's per-record model latency, from each prompt run's `ExecutionTimeMS`. */
export interface LatencySummary {
    Known: number;
    P50Ms: number | null;
    P90Ms: number | null;
}

/** `total` per 1,000 records, or null when there were none. */
export function Per1000(total: number, records: number): number | null {
    return records > 0 ? (total / records) * 1000 : null;
}

/** The known cost of an answer's prompt run, or null. */
export function PredictionCost(prediction: RecordPrediction | undefined, costs: ReadonlyMap<string, PromptRunCost>): number | null {
    return prediction?.PromptRunID ? costs.get(prediction.PromptRunID)?.Cost ?? null : null;
}

/** A type's total wall time and its rate per 1,000 records. */
export function SummarizeWallTime(timings: readonly BatchTiming[], type: MeasuredPipelineType): WallTimeSummary {
    const own = timings.filter((t) => t.Type === type);
    const records = own.reduce((sum, t) => sum + t.RecordCount, 0);
    const totalWallMs = own.reduce((sum, t) => sum + t.WallMs, 0);
    return { Records: records, TotalWallMs: totalWallMs, MsPer1000: Per1000(totalWallMs, records) };
}

/** A type's cost per 1,000 answers, over its distinct prompt runs. */
export function SummarizeCost(predictions: readonly RecordPrediction[], costs: ReadonlyMap<string, PromptRunCost>): CostSummary {
    const runIDs = [...new Set(predictions.map((p) => p.PromptRunID).filter((id): id is string => !!id))];
    const known = runIDs.map((id) => costs.get(id)).filter((c): c is PromptRunCost & { Cost: number } => typeof c?.Cost === 'number');
    const totalCost = known.reduce((sum, c) => sum + c.Cost, 0);
    return {
        Records: predictions.length,
        Runs: runIDs.length,
        RunsWithCost: known.length,
        TotalCost: totalCost,
        CostPer1000: known.length === 0 ? null : Per1000(totalCost, predictions.length),
        Currencies: [...new Set(known.map((c) => c.Currency).filter((c): c is string => !!c))],
    };
}

/** The median and 90th percentile (nearest rank) of a type's prompt-run latencies. */
export function SummarizeLatency(predictions: readonly RecordPrediction[], costs: ReadonlyMap<string, PromptRunCost>): LatencySummary {
    const latencies = predictions
        .map((p) => (p.PromptRunID ? costs.get(p.PromptRunID)?.ExecutionTimeMS : null))
        .filter((ms): ms is number => typeof ms === 'number')
        .sort((a, b) => a - b);
    if (latencies.length === 0) {
        return { Known: 0, P50Ms: null, P90Ms: null };
    }
    return { Known: latencies.length, P50Ms: NearestRankQuantile(latencies, 0.5), P90Ms: NearestRankQuantile(latencies, 0.9) };
}
