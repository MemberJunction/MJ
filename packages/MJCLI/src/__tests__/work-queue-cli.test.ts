import { describe, it, expect } from 'vitest';
import type { WorkQueueDeadLetterRow, WorkQueuePartitionStateRow } from '@memberjunction/core-entities';
import {
    FormatBacklog, FormatBindingIssues, FormatDeadLetters, FormatPartitions, FormatStatsTable, FormatTable, HasBindingErrors, ParseBindingImport,
    RequireOperationOutput, ToPartitionCondition,
} from '../lib/work-queue/queue-format.js';

const DEAD_LETTER: WorkQueueDeadLetterRow = {
    DeliveryID: 'DDDDDDDD-4444-4444-8444-000000000001', PartitionKey: 'venue-42', Attempts: 5, Reason: 'MaxAttemptsExceeded',
    LastError: 'bad row 12', DeadLetteredAt: '2026-09-16T11:30:00.000Z', BlocksKey: true,
    Message: { MessageID: 'EEEEEEEE-5555-4555-8555-000000000001', Topic: 'integration.batch-ready', Attributes: {}, PayloadJSON: null, PublishedAt: '2026-09-16T11:00:00.000Z' },
};

const PARTITION: WorkQueuePartitionStateRow = {
    PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: 'DDDDDDDD-4444-4444-8444-000000000001', WaitingItems: 3,
};

describe('queue formatting', () => {
    it('pads table columns to the widest cell', () => {
        expect(FormatTable(['A', 'Long header'], [['wide cell', 'x']])).toBe('A          Long header\n---------  -----------\nwide cell  x');
    });

    it('renders stats with dashes for unknown values and lists failures', () => {
        const text = FormatStatsTable([{
            SubscriptionName: 'email.unsubscribe', Pending: 2, InFlight: 0, DeadLettered: 1, BlockedKeys: null,
            OldestPendingAgeSeconds: null, CompletedLastHour: 40, AsOf: '2026-09-16T12:00:00.000Z',
        }], [{ subscriptionName: 'email.dashboard', error: 'Stats are unavailable for this subscription' }]);
        expect(text).toContain('email.unsubscribe  2        0          1     —             —                   40');
        expect(text).toContain('! email.dashboard: Stats are unavailable for this subscription');
        expect(FormatStatsTable([], [])).toBe('No subscriptions.');
    });

    it('renders dead letters, empty pages and unsupported transports', () => {
        expect(FormatDeadLetters({ supported: false, items: [], nextCursor: null })).toBe("This subscription's transport cannot list dead letters.");
        expect(FormatDeadLetters({ supported: true, items: [], nextCursor: null })).toBe('No dead letters.');
        const text = FormatDeadLetters({ supported: true, items: [DEAD_LETTER], nextCursor: 'cursor-2' });
        expect(text).toContain('DDDDDDDD-4444-4444-8444-000000000001  venue-42       5         MaxAttemptsExceeded  yes');
        expect(text.endsWith('More: --cursor cursor-2')).toBe(true);
    });

    it('renders partitions', () => {
        const text = FormatPartitions({ supported: true, items: [PARTITION], nextCursor: null });
        expect(text).toContain('venue-42       Blocked    DDDDDDDD-4444-4444-8444-000000000001  3');
        expect(FormatPartitions({ supported: false, items: [], nextCursor: null })).toBe("This subscription's transport cannot list partitions.");
    });

    it('renders the backlog, marking capped counts', () => {
        expect(FormatBacklog({ supported: true, claimable: 7, inFlight: 2, total: 9, capped: false })).toBe('claimable 7 · in flight 2 · total 9');
        expect(FormatBacklog({ supported: true, claimable: 1000, inFlight: 2, total: 1002, capped: true })).toBe('claimable 1000 · in flight 2 · total 1002 (capped at 1000 — the real backlog is at least this large)');
        expect(FormatBacklog({ supported: false, claimable: 0, inFlight: 0, total: 0, capped: false })).toBe("This subscription's transport reports no backlog; scale from the transport's own metrics.");
    });

    it('renders binding issues and detects errors', () => {
        const issues = [
            { Severity: 'Warning' as const, Subject: 'email.events', Message: 'IsFifo should be 1' },
            { Severity: 'Error' as const, Subject: 'email.unsubscribe', Message: 'queue not found' },
        ];
        expect(FormatBindingIssues(issues)).toBe('⚠ Warning email.events: IsFifo should be 1\n✖ Error email.unsubscribe: queue not found');
        expect(HasBindingErrors(issues)).toBe(true);
        expect(HasBindingErrors(issues.slice(0, 1))).toBe(false);
        expect(FormatBindingIssues([])).toBe('No binding issues.');
    });
});

describe('queue input helpers', () => {
    it('parses a binding import and rejects malformed files', () => {
        const json = JSON.stringify({
            ManifestVersion: 1,
            Topics: [{ Name: 'email.events', BindingConfig: { SnsTopicArn: 'arn:aws:sns:us-east-1:1:mj-email-events.fifo' } }],
            Subscriptions: [{ Name: 'email.unsubscribe', BindingConfig: { QueueUrl: 'https://sqs/x', IsFifo: true } }],
        });
        expect(ParseBindingImport(json).Subscriptions[0]).toEqual({ Name: 'email.unsubscribe', BindingConfig: { QueueUrl: 'https://sqs/x', IsFifo: true } });
        expect(() => ParseBindingImport('{')).toThrow('not valid JSON');
        expect(() => ParseBindingImport('{"ManifestVersion":2,"Topics":[],"Subscriptions":[]}')).toThrow('ManifestVersion');
        expect(() => ParseBindingImport('{"ManifestVersion":1,"Topics":[{"Name":"x"}],"Subscriptions":[]}')).toThrow('Topics[0] must have a string Name and an object BindingConfig');
    });

    it('returns operation output or throws with the result code', () => {
        expect(RequireOperationOutput({ Success: true, Output: { n: 1 } }, 'WorkQueue.X')).toEqual({ n: 1 });
        expect(() => RequireOperationOutput({ Success: false, ResultCode: 'EXECUTION_ERROR', ErrorMessage: 'pageSize must be an integer between 1 and 500' }, 'WorkQueue.ListDeadLetters'))
            .toThrow('WorkQueue.ListDeadLetters failed (EXECUTION_ERROR): pageSize must be an integer between 1 and 500');
    });

    it('narrows a condition flag to the operation union', () => {
        expect(ToPartitionCondition(undefined)).toBeUndefined();
        expect(ToPartitionCondition('Blocked')).toBe('Blocked');
        expect(() => ToPartitionCondition('Stuck')).toThrow('--condition must be one of Idle, InFlight, Blocked');
    });
});
