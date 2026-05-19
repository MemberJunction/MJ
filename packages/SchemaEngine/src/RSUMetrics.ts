/**
 * RSU Pipeline Metrics — tracks pipeline execution statistics for observability.
 * Singleton that accumulates metrics across pipeline runs.
 */
import { BaseSingleton } from '@memberjunction/global';

export interface PipelineRunMetric {
    Timestamp: Date;
    DurationMs: number;
    Success: boolean;
    StepDurations: Record<string, number>;
    ErrorStep?: string;
    Description: string;
    AffectedTables: string[];
    RetryCount: number;
}

export interface RSUMetricsSummary {
    TotalRuns: number;
    SuccessfulRuns: number;
    FailedRuns: number;
    SuccessRate: number;
    AverageDurationMs: number;
    MedianDurationMs: number;
    P95DurationMs: number;
    MostCommonErrorStep: string | null;
    RecentRuns: PipelineRunMetric[];
    StepAverageDurations: Record<string, number>;
}

export class RSUMetrics extends BaseSingleton<RSUMetrics> {
    protected constructor() {
        super();
    }

    public static get Instance(): RSUMetrics {
        return super.getInstance<RSUMetrics>();
    }

    private runs: PipelineRunMetric[] = [];
    private readonly MAX_HISTORY = 100;

    /**
     * Record a completed pipeline run.
     */
    RecordRun(metric: PipelineRunMetric): void {
        this.runs.push(metric);
        if (this.runs.length > this.MAX_HISTORY) {
            this.runs = this.runs.slice(-this.MAX_HISTORY);
        }
    }

    /**
     * Get a summary of all recorded metrics.
     */
    GetSummary(): RSUMetricsSummary {
        const total = this.runs.length;
        if (total === 0) {
            return {
                TotalRuns: 0,
                SuccessfulRuns: 0,
                FailedRuns: 0,
                SuccessRate: 0,
                AverageDurationMs: 0,
                MedianDurationMs: 0,
                P95DurationMs: 0,
                MostCommonErrorStep: null,
                RecentRuns: [],
                StepAverageDurations: {},
            };
        }

        const successful = this.runs.filter(r => r.Success).length;
        const durations = this.runs.map(r => r.DurationMs).sort((a, b) => a - b);

        const mostCommonErrorStep = this.FindMostCommonErrorStep();
        const stepAverageDurations = this.ComputeStepAverages();

        return {
            TotalRuns: total,
            SuccessfulRuns: successful,
            FailedRuns: total - successful,
            SuccessRate: Math.round((successful / total) * 100) / 100,
            AverageDurationMs: Math.round(durations.reduce((a, b) => a + b, 0) / total),
            MedianDurationMs: durations[Math.floor(total / 2)],
            P95DurationMs: durations[Math.floor(total * 0.95)],
            MostCommonErrorStep: mostCommonErrorStep,
            RecentRuns: this.runs.slice(-10).reverse(),
            StepAverageDurations: stepAverageDurations,
        };
    }

    private FindMostCommonErrorStep(): string | null {
        const counts = new Map<string, number>();
        for (const run of this.runs) {
            if (run.ErrorStep) {
                counts.set(run.ErrorStep, (counts.get(run.ErrorStep) ?? 0) + 1);
            }
        }
        let best: string | null = null;
        let bestCount = 0;
        for (const [step, count] of counts) {
            if (count > bestCount) {
                bestCount = count;
                best = step;
            }
        }
        return best;
    }

    private ComputeStepAverages(): Record<string, number> {
        const totals = new Map<string, { sum: number; count: number }>();
        for (const run of this.runs) {
            for (const [step, duration] of Object.entries(run.StepDurations)) {
                const existing = totals.get(step) ?? { sum: 0, count: 0 };
                existing.sum += duration;
                existing.count += 1;
                totals.set(step, existing);
            }
        }
        const result: Record<string, number> = {};
        for (const [step, data] of totals) {
            result[step] = Math.round(data.sum / data.count);
        }
        return result;
    }

    /** Clear all recorded metrics. */
    Clear(): void {
        this.runs = [];
    }

    /** Get raw run history. */
    GetHistory(): ReadonlyArray<PipelineRunMetric> {
        return this.runs;
    }
}
