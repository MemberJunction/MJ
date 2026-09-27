export const METRICS_NAMESPACE = 'MJ/WorkQueue';

export interface InvocationMetrics {
    Processed: number;
    Completed: number;
    Retried: number;
    DeadLettered: number;
    Failed: number;
    DurationMs: number;
}

/** One structured log line per invocation; Application Insights turns customDimensions into queryable metrics. */
export function FormatMetricsLine(subscriptionName: string, metrics: InvocationMetrics, timestamp: number): string {
    return JSON.stringify({ Namespace: METRICS_NAMESPACE, Timestamp: timestamp, Subscription: subscriptionName, ...metrics });
}
