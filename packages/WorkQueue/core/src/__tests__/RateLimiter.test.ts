import { describe, it, expect, vi } from 'vitest';
import {
    BuildWorkMessage,
    ConsumerRuntime,
    ExtractRateLimitKey,
    InMemoryTransport,
    KeyedRateLimiter,
    Outcome,
    ValidatePublishRequest,
} from '../index';
import type { ITransportConsumer, ReceivedDelivery, SettleResult, SubscriptionBinding, TopicBinding, WorkMessage } from '../index';
import { ManualClock } from '../testing';
import { RecordingLogger } from './fakes';

const TOPIC: TopicBinding = {
    TopicName: 'email.send',
    IsFifo: false,
    MaxPayloadBytes: 65536,
    Config: {},
};

function makeSubscription(rateLimit?: SubscriptionBinding['Policy']['RateLimit']): SubscriptionBinding {
    return {
        Policy: {
            SubscriptionName: 'email.worker',
            TopicName: 'email.send',
            PartitionMode: 'None',
            MaxAttempts: 5,
            BackoffBaseSeconds: 10,
            BackoffMaxSeconds: 900,
            LeaseSeconds: 60,
            HeartbeatMode: 'Auto',
            ...(rateLimit ? { RateLimit: rateLimit } : {}),
        },
        Filter: null,
        HostType: 'MJWorker',
        Config: {},
    };
}

function makeMessage(overrides: Partial<WorkMessage> = {}): WorkMessage {
    return {
        MessageID: '00000000-0000-0000-0000-000000000001',
        Topic: 'email.send',
        Attributes: {},
        PublishedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('ScheduledAt validation and InMemoryTransport', () => {
    it('validates ScheduledAt and maps it to ISO-8601 on WorkMessage', () => {
        const scheduledAt = new Date('2026-06-01T12:00:00.000Z');
        expect(ValidatePublishRequest(TOPIC, { Payload: { ok: true }, ScheduledAt: scheduledAt })).toBeNull();
        expect(ValidatePublishRequest(TOPIC, { Payload: { ok: true }, ScheduledAt: new Date('not-a-date') })).toMatchObject({
            Code: 'BadRequest',
        });

        const msg = BuildWorkMessage('email.send', { Payload: { ok: true }, ScheduledAt: scheduledAt }, new Date('2026-06-01T11:00:00.000Z'), () => 'id-1');
        expect(msg.ScheduledAt).toBe('2026-06-01T12:00:00.000Z');
    });

    it('defers InMemoryTransport deliveries until ScheduledAt', async () => {
        const clock = new ManualClock(Date.parse('2026-06-01T10:00:00.000Z'));
        const transport = new InMemoryTransport({ Now: () => clock.Now() });
        const sub = makeSubscription();
        const future = BuildWorkMessage(
            'email.send',
            { Payload: { id: 1 }, ScheduledAt: new Date('2026-06-01T10:05:00.000Z') },
            new Date(clock.Now()),
            () => '00000000-0000-0000-0000-000000000010',
        );
        await transport.Publish(TOPIC, [future], [sub]);
        const consumer = transport.OpenConsumer(sub);
        const signal = new AbortController().signal;

        expect(await consumer.Receive(10, 0, signal)).toHaveLength(0);
        clock.Advance(4 * 60_000);
        expect(await consumer.Receive(10, 0, signal)).toHaveLength(0);
        clock.Advance(60_000);
        const claimed = await consumer.Receive(10, 0, signal);
        expect(claimed).toHaveLength(1);
        expect(claimed[0].Message.MessageID).toBe(future.MessageID);
    });
});

describe('ExtractRateLimitKey', () => {
    it('extracts from Attributes, Payload (flat and nested), PartitionKey, or default', () => {
        expect(ExtractRateLimitKey(makeMessage({ Attributes: { CredentialID: 'cred-attr' } }), 'CredentialID')).toBe('cred-attr');
        expect(ExtractRateLimitKey(makeMessage({ Payload: { SendingDomain: 'example.com' } }), 'SendingDomain')).toBe('example.com');
        expect(ExtractRateLimitKey(makeMessage({ Payload: { meta: { CommunicationSenderID: 'sender-42' } } }), 'meta.CommunicationSenderID')).toBe('sender-42');
        expect(ExtractRateLimitKey(makeMessage({ PartitionKey: 'tenant-1' }), 'CredentialID')).toBe('tenant-1');
        expect(ExtractRateLimitKey(makeMessage({ PartitionKey: 'tenant-1' }))).toBe('tenant-1');
        expect(ExtractRateLimitKey(makeMessage())).toBe('__default__');
    });
});

describe('KeyedRateLimiter', () => {
    it('enforces MaxPerWindow per key within WindowMs and computes RetryAfterMs', () => {
        const limiter = new KeyedRateLimiter({ MaxPerWindow: 2, WindowMs: 10_000 });

        expect(limiter.TryAcquire('k1', 1000)).toEqual({ Allowed: true });
        expect(limiter.TryAcquire('k1', 2000)).toEqual({ Allowed: true });
        expect(limiter.TryAcquire('k1', 3000)).toEqual({ Allowed: false, RetryAfterMs: 8000 });
        expect(limiter.TryAcquire('k2', 3000)).toEqual({ Allowed: true });

        // Once the oldest (1000) expires at 11000, k1 is allowed again
        expect(limiter.TryAcquire('k1', 11000)).toEqual({ Allowed: true });
    });
});

describe('ConsumerRuntime rate-limit enforcement', () => {
    it('defers excess deliveries per key in ProcessBatch without dropping or invoking the handler', async () => {
        const handled: string[] = [];
        const deferred: Array<{ DeliveryID: string; DelaySeconds: number; Reason: string }> = [];
        const clock = new ManualClock(100_000);
        const sub = makeSubscription({ MaxPerWindow: 2, WindowMs: 10_000, KeyPath: 'CredentialID' });

        const consumer: ITransportConsumer = {
            Receive: vi.fn(async () => []),
            ExtendLease: vi.fn(async () => 'Held' as const),
            Complete: vi.fn(async (d): Promise<SettleResult> => ({ Kind: 'Settled', DeliveryID: d.DeliveryID, Status: 'Completed' })),
            Retry: vi.fn(async (d): Promise<SettleResult> => ({ Kind: 'Settled', DeliveryID: d.DeliveryID, Status: 'Pending' })),
            DeadLetter: vi.fn(async (d): Promise<SettleResult> => ({ Kind: 'Settled', DeliveryID: d.DeliveryID, Status: 'DeadLettered' })),
            Release: vi.fn(async (d): Promise<SettleResult> => ({ Kind: 'Settled', DeliveryID: d.DeliveryID, Status: 'Pending' })),
            Defer: vi.fn(async (d, delaySeconds, reason): Promise<SettleResult> => {
                deferred.push({ DeliveryID: d.DeliveryID, DelaySeconds: delaySeconds, Reason: reason });
                return { Kind: 'Settled', DeliveryID: d.DeliveryID, Status: 'Pending' };
            }),
            AcknowledgeCancel: vi.fn(async (d): Promise<SettleResult> => ({ Kind: 'LeaseLost', DeliveryID: d.DeliveryID })),
            Close: vi.fn(async () => undefined),
        };

        const runtime = new ConsumerRuntime(
            consumer,
            () => ({
                Handle: async (msg) => {
                    handled.push(msg.MessageID);
                    return Outcome.Complete();
                },
            }),
            sub.Policy,
            { Concurrency: 4, ReceiveBatchSize: 10, IdlePollMinMs: 10, IdlePollMaxMs: 50, ShutdownDrainMs: 100 },
            new RecordingLogger(),
            () => clock.Now(),
        );

        const makeDelivery = (id: string, cred: string): ReceivedDelivery => ({
            DeliveryID: id,
            LeaseToken: `tok-${id}`,
            Attempt: 1,
            IsReplay: false,
            LeaseExpiresAt: new Date(clock.Now() + 60_000),
            Message: makeMessage({ MessageID: id, Payload: { CredentialID: cred } }),
        });

        const results = await runtime.ProcessBatch([
            makeDelivery('d1', 'cred-A'),
            makeDelivery('d2', 'cred-A'),
            makeDelivery('d3', 'cred-A'),
            makeDelivery('d4', 'cred-B'),
        ]);

        expect(handled).toEqual(['d1', 'd2', 'd4']);
        expect(deferred).toEqual([{ DeliveryID: 'd3', DelaySeconds: 10, Reason: 'Rate limit exceeded; deferred 10s' }]);
        expect(results[2]).toEqual({ Kind: 'Settled', DeliveryID: 'd3', Status: 'Pending' });
    });
});
