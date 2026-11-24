export const AZURE_METRICS_NAMESPACE = 'MJ/WorkQueue';

export interface InvocationMetrics {
    Processed: number;
    Completed: number;
    Retried: number;
    DeadLettered: number;
    Failed: number;
    NotStarted: number;
    DurationMs: number;
}

/** Formats one structured Application Insights / Log Analytics telemetry line for an Azure Functions invocation. */
export function FormatTelemetryLine(subscriptionName: string, metrics: InvocationMetrics, timestamp: number): string {
    return JSON.stringify({
        namespace: AZURE_METRICS_NAMESPACE,
        timestamp,
        Subscription: subscriptionName,
        ...metrics,
    });
}
