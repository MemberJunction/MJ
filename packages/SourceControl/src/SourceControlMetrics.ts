/**
 * SourceControlMetrics — singleton for tracking source control API and git CLI usage.
 *
 * Uses BaseSingleton to ensure a single instance across the process,
 * even when ESBuild/Vite code-splits and loads the module multiple times.
 */
import { BaseSingleton } from '@memberjunction/global';
import type {
    SCMetricsSummary,
    SCAPICallRecord,
    SCGitOperationRecord,
} from './interfaces.js';

/** Maximum number of records to keep in the rolling history. */
const MAX_HISTORY = 500;

export class SourceControlMetrics extends BaseSingleton<SourceControlMetrics> {
    protected constructor() {
        super();
    }

    public static get Instance(): SourceControlMetrics {
        return super.getInstance<SourceControlMetrics>();
    }

    private apiCalls: SCAPICallRecord[] = [];
    private gitOperations: SCGitOperationRecord[] = [];

    // ─── Recording ────────────────────────────────────────────────

    /** Record a platform API call (GitHub, GitLab, etc.). */
    RecordAPICall(platform: string, endpoint: string, method: string, statusCode: number, durationMs: number): void {
        this.apiCalls.push({
            Platform: platform,
            Endpoint: endpoint,
            Method: method,
            StatusCode: statusCode,
            DurationMs: durationMs,
            Timestamp: new Date().toISOString(),
        });
        if (this.apiCalls.length > MAX_HISTORY) {
            this.apiCalls.splice(0, this.apiCalls.length - MAX_HISTORY);
        }
    }

    /** Record a local git CLI operation. */
    RecordGitOperation(operation: string, durationMs: number, success: boolean): void {
        this.gitOperations.push({
            Operation: operation,
            DurationMs: durationMs,
            Success: success,
            Timestamp: new Date().toISOString(),
        });
        if (this.gitOperations.length > MAX_HISTORY) {
            this.gitOperations.splice(0, this.gitOperations.length - MAX_HISTORY);
        }
    }

    // ─── Summary ──────────────────────────────────────────────────

    /** Compute summary metrics from the recorded history. */
    GetSummary(): SCMetricsSummary {
        const totalAPI = this.apiCalls.length;
        const totalGit = this.gitOperations.length;
        const totalOps = totalAPI + totalGit;

        const successfulAPI = this.apiCalls.filter(c => c.StatusCode >= 200 && c.StatusCode < 400).length;
        const successfulGit = this.gitOperations.filter(o => o.Success).length;
        const successRate = totalOps > 0 ? (successfulAPI + successfulGit) / totalOps : 1;

        const rateLimitHits = this.apiCalls.filter(c => c.StatusCode === 403 || c.StatusCode === 429).length;

        const totalLatency = this.apiCalls.reduce((sum, c) => sum + c.DurationMs, 0);
        const averageLatency = totalAPI > 0 ? totalLatency / totalAPI : 0;

        const callsByPlatform: Record<string, number> = {};
        for (const call of this.apiCalls) {
            callsByPlatform[call.Platform] = (callsByPlatform[call.Platform] ?? 0) + 1;
        }

        return {
            TotalAPICalls: totalAPI,
            TotalGitOperations: totalGit,
            SuccessRate: successRate,
            RateLimitHits: rateLimitHits,
            AverageLatencyMs: Math.round(averageLatency),
            CallsByPlatform: callsByPlatform,
        };
    }

    // ─── Access ───────────────────────────────────────────────────

    /** Get the raw API call history. */
    get APICalls(): ReadonlyArray<SCAPICallRecord> {
        return this.apiCalls;
    }

    /** Get the raw git operation history. */
    get GitOperations(): ReadonlyArray<SCGitOperationRecord> {
        return this.gitOperations;
    }

    /** Clear all recorded metrics. */
    Reset(): void {
        this.apiCalls = [];
        this.gitOperations = [];
    }
}
