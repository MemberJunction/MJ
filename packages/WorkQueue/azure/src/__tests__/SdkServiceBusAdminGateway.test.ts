import { describe, it, expect, vi } from 'vitest';
import type { HttpResponse, PagedAsyncIterableIterator } from '@azure/service-bus';
import type {
    NamespaceProperties,
    RuleProperties,
    SubscriptionProperties,
    SubscriptionRuntimeProperties,
    TopicProperties,
    WithResponse,
} from '@azure/service-bus';
import {
    FormatIsoDurationSeconds,
    ParseIsoDurationSeconds,
    SdkServiceBusAdminGateway,
    type ServiceBusAdminClientLike,
} from '../gateway/SdkServiceBusAdminGateway';

const DUMMY_RESPONSE: HttpResponse = {
    status: 200,
    headers: {
        get: () => undefined,
        set: () => undefined,
        has: () => false,
        delete: () => undefined,
        rawHeaders: () => ({}),
        toJSON: () => ({}),
        [Symbol.iterator]: function* () { /* empty */ },
    },
    request: {
        url: 'https://example.servicebus.windows.net',
        method: 'GET',
        headers: {
            get: () => undefined,
            set: () => undefined,
            has: () => false,
            delete: () => undefined,
            rawHeaders: () => ({}),
            toJSON: () => ({}),
            [Symbol.iterator]: function* () { /* empty */ },
        },
        timeout: 0,
        withCredentials: false,
        requestId: 'req-1',
        clone: function () { return this; },
    },
};

function withResp<T extends object>(value: T): WithResponse<T> {
    return Object.assign(value, { _response: DUMMY_RESPONSE });
}

function notFoundError(): Error {
    return Object.assign(new Error('Not found'), { code: 'MessagingEntityNotFound', statusCode: 404 });
}

function emptyPagedRules(rules: RuleProperties[]): PagedAsyncIterableIterator<RuleProperties> {
    async function* iter(): AsyncIterableIterator<RuleProperties> {
        for (const r of rules) {
            yield r;
        }
    }
    const base = iter();
    return Object.assign(base, {
        byPage: async function* () {
            yield Object.assign([...rules], { _response: DUMMY_RESPONSE });
        },
    }) as PagedAsyncIterableIterator<RuleProperties>;
}

describe('SdkServiceBusAdminGateway', () => {
    it('parses and formats ISO-8601 durations accurately', () => {
        expect(ParseIsoDurationSeconds('PT1M')).toBe(60);
        expect(ParseIsoDurationSeconds('PT30S')).toBe(30);
        expect(ParseIsoDurationSeconds('PT2M15S')).toBe(135);
        expect(FormatIsoDurationSeconds(90)).toBe('PT90S');
    });

    it('reads namespace, topic, subscription, runtime properties, and rules', async () => {
        const ns: NamespaceProperties = {
            name: 'mj-wq-prod',
            messagingSku: 'Standard',
            messagingUnits: undefined,
            createdAt: new Date(),
            modifiedAt: new Date(),
        };
        const topic: TopicProperties = {
            name: 'email-events',
            requiresDuplicateDetection: false,
            supportOrdering: false,
            defaultMessageTimeToLive: 'P14D',
            duplicateDetectionHistoryTimeWindow: 'PT10M',
            enableBatchedOperations: true,
            maxSizeInMegabytes: 1024,
            status: 'Active',
            userMetadata: '',
            autoDeleteOnIdle: 'P10675199D',
            enablePartitioning: false,
            enableExpress: false,
            availabilityStatus: 'Available',
        };
        const sub: SubscriptionProperties = {
            topicName: 'email-events',
            subscriptionName: 'sub-a',
            requiresSession: true,
            maxDeliveryCount: 10,
            lockDuration: 'PT1M',
            defaultMessageTimeToLive: 'P14D',
            deadLetteringOnMessageExpiration: true,
            deadLetteringOnFilterEvaluationExceptions: true,
            enableBatchedOperations: true,
            status: 'Active',
            autoDeleteOnIdle: 'P10675199D',
        };
        const runtime: SubscriptionRuntimeProperties = {
            topicName: 'email-events',
            subscriptionName: 'sub-a',
            totalMessageCount: 5,
            activeMessageCount: 3,
            deadLetterMessageCount: 1,
            transferMessageCount: 0,
            transferDeadLetterMessageCount: 0,
            createdAt: new Date(),
            modifiedAt: new Date(),
            accessedAt: new Date(),
        };

        const client: ServiceBusAdminClientLike = {
            getNamespaceProperties: vi.fn(async () => withResp(ns)),
            getTopic: vi.fn(async () => withResp(topic)),
            createTopic: vi.fn(async () => withResp(topic)),
            deleteTopic: vi.fn(async () => withResp({})),
            getSubscription: vi.fn(async () => withResp(sub)),
            getSubscriptionRuntimeProperties: vi.fn(async () => withResp(runtime)),
            createSubscription: vi.fn(async () => withResp(sub)),
            deleteSubscription: vi.fn(async () => withResp({})),
            listRules: vi.fn(() => emptyPagedRules([{ name: '$Default', filter: { sqlExpression: "user.[k] = 'v'" }, action: {} }])),
            getRule: vi.fn(async () => withResp<RuleProperties>({ name: '$Default', filter: { sqlExpression: '1=1' }, action: {} })),
            updateRule: vi.fn(async (_t, _s, rule) => rule),
            createRule: vi.fn(async () => withResp<RuleProperties>({ name: '$Default', filter: { sqlExpression: '1=1' }, action: {} })),
        };

        const admin = new SdkServiceBusAdminGateway(client);
        expect(await admin.GetNamespaceProperties()).toEqual({ Name: 'mj-wq-prod', MessagingSku: 'Standard' });
        expect(await admin.GetTopic('email-events')).toMatchObject({ Name: 'email-events', RequiresDuplicateDetection: false });
        expect(await admin.GetSubscription('email-events', 'sub-a')).toMatchObject({ RequiresSession: true, LockDurationSeconds: 60, MaxDeliveryCount: 10 });
        expect(await admin.GetSubscriptionRuntimeProperties('email-events', 'sub-a')).toMatchObject({
            ActiveMessageCount: 3,
            DeadLetterMessageCount: 1,
            ScheduledMessageCount: 1,
            TotalMessageCount: 5,
        });
        expect(await admin.ListRules('email-events', 'sub-a')).toEqual([{ Name: '$Default', SqlExpression: "user.[k] = 'v'" }]);
        await admin.EnsureRule('email-events', 'sub-a', '$Default', "user.[k] = 'v2'");
        expect(client.updateRule).toHaveBeenCalledTimes(1);

        vi.mocked(client.getTopic).mockRejectedValueOnce(notFoundError());
        expect(await admin.GetTopic('missing')).toBeNull();
    });
});
