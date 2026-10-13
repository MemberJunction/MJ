import { LogError } from '@memberjunction/core';
import { ChartDataStatus } from './geometry.types';

export type ChartLogSink = (message: string) => void;

/**
 * Routes a chart's developer-facing problems to LogError without spamming it:
 * a resize recomputes layout many times, but each problem is reported once.
 */
export class ChartIssueLog {
    private readonly onceKeys = new Set<string>();
    private lastStatusKey: string | null = null;

    constructor(private readonly sink: ChartLogSink = (message: string) => LogError(message)) {}

    /** Logs `message` the first time `key` is seen. Returns true when it logged. */
    public Once(key: string, message: string): boolean {
        if (this.onceKeys.has(key)) {
            return false;
        }
        this.onceKeys.add(key);
        this.sink(message);
        return true;
    }

    /**
     * Logs an invalid status when its Code + Detail differ from the last one reported.
     * ok/empty reset the memory, so a problem that comes back is reported again.
     */
    public ReportStatus(status: ChartDataStatus, context: string): boolean {
        if (status.Kind !== 'invalid') {
            this.lastStatusKey = null;
            return false;
        }
        const key = `${status.Code}|${status.Detail}`;
        if (key === this.lastStatusKey) {
            return false;
        }
        this.lastStatusKey = key;
        this.sink(`${context}: invalid chart data (${status.Code}) — ${status.Detail}.`);
        return true;
    }
}
