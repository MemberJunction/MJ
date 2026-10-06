export const EMF_NAMESPACE = 'MJ/WorkQueue';

export interface InvocationMetrics {
    Processed: number;
    Completed: number;
    Retried: number;
    DeadLettered: number;
    Failed: number;
    NotStarted: number;
    DurationMs: number;
}

const COUNT_METRICS: (keyof InvocationMetrics)[] = ['Processed', 'Completed', 'Retried', 'DeadLettered', 'Failed', 'NotStarted'];

/** One CloudWatch Embedded Metric Format log line; Lambda's log pipeline turns it into metrics. */
export function FormatEmfLine(subscriptionName: string, metrics: InvocationMetrics, timestamp: number): string {
    return JSON.stringify({
        _aws: {
            Timestamp: timestamp,
            CloudWatchMetrics: [{
                Namespace: EMF_NAMESPACE,
                Dimensions: [['Subscription']],
                Metrics: [...COUNT_METRICS.map((name) => ({ Name: name, Unit: 'Count' })), { Name: 'DurationMs', Unit: 'Milliseconds' }],
            }],
        },
        Subscription: subscriptionName,
        ...metrics,
    });
}
