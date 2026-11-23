export const GCP_METRICS_NAMESPACE = 'MJ/WorkQueue';

export interface InvocationMetrics {
    Processed: number;
    Completed: number;
    Retried: number;
    DeadLettered: number;
    Failed: number;
    DurationMs: number;
}

/** Formats one structured Cloud Logging JSON line for a Cloud Run Pub/Sub HTTP push invocation. */
export function FormatTelemetryLine(subscriptionName: string, metrics: InvocationMetrics, timestamp: number): string {
    return JSON.stringify({
        namespace: GCP_METRICS_NAMESPACE,
        timestamp,
        Subscription: subscriptionName,
        ...metrics,
    });
}
