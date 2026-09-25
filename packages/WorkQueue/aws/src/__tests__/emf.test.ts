import { describe, it, expect } from 'vitest';
import { FormatEmfLine } from '../lambda/emf';

describe('FormatEmfLine', () => {
    it('emits an embedded-metric-format record with one dimension', () => {
        const line = FormatEmfLine('email.unsubscribe', { Processed: 3, Completed: 2, Retried: 1, DeadLettered: 0, Failed: 0, NotStarted: 0, DurationMs: 120 }, 1800000000000);
        expect(JSON.parse(line)).toEqual({
            _aws: {
                Timestamp: 1800000000000,
                CloudWatchMetrics: [{
                    Namespace: 'MJ/WorkQueue',
                    Dimensions: [['Subscription']],
                    Metrics: [
                        { Name: 'Processed', Unit: 'Count' }, { Name: 'Completed', Unit: 'Count' }, { Name: 'Retried', Unit: 'Count' },
                        { Name: 'DeadLettered', Unit: 'Count' }, { Name: 'Failed', Unit: 'Count' }, { Name: 'NotStarted', Unit: 'Count' },
                        { Name: 'DurationMs', Unit: 'Milliseconds' },
                    ],
                }],
            },
            Subscription: 'email.unsubscribe', Processed: 3, Completed: 2, Retried: 1, DeadLettered: 0, Failed: 0, NotStarted: 0, DurationMs: 120,
        });
    });
});
