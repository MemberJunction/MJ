import { describe, it, expect, beforeEach } from 'vitest';
import { Outcome, type SubscriptionBinding, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateCloudRunPushHandler, type CloudRunPushHandlerOptions } from '../cloudrun/CreateCloudRunPushHandler';
import { FakePubSubGateway } from '../testing/fakes';
import { TestGcpResources, TestGcpSubscriptionBinding, TestMessage } from '../testing/fixtures';

let fake: FakePubSubGateway;
let binding: SubscriptionBinding;
let calls: string[];
let script: Map<string, WorkOutcome>;
let metrics: string[];

class ScriptedHandler implements WorkHandler {
    public async Handle(message: WorkMessage): Promise<WorkOutcome> {
        calls.push(message.MessageID);
        return script.get(message.MessageID) ?? Outcome.Complete();
    }
}

function makePushRequest(
    message: WorkMessage | string,
    overrides: {
        messageId?: string;
        deliveryAttempt?: number;
        orderingKey?: string;
        headers?: Record<string, string>;
    } = {},
) {
    const rawJson = typeof message === 'string' ? message : JSON.stringify(message);
    return {
        Headers: overrides.headers ?? {},
        Body: {
            message: {
                data: Buffer.from(rawJson, 'utf8').toString('base64'),
                messageId: overrides.messageId ?? (typeof message === 'string' ? 'raw-1' : message.MessageID),
                publishTime: '2026-09-16T12:00:00.000Z',
                attributes: typeof message === 'string' ? {} : message.Attributes,
                ...(overrides.orderingKey ? { orderingKey: overrides.orderingKey } : {}),
            },
            subscription: `projects/mj-wq-test/subscriptions/${TestGcpResources(false).SubscriptionName}`,
            deliveryAttempt: overrides.deliveryAttempt ?? 1,
        },
    };
}

function createHandler(extra: Partial<CloudRunPushHandlerOptions> = {}) {
    return CreateCloudRunPushHandler(() => new ScriptedHandler(), {
        Binding: binding,
        Gateway: fake,
        Now: () => fake.Now,
        EmitMetrics: (line) => metrics.push(line),
        ...extra,
    });
}

beforeEach(() => {
    const r = TestGcpResources(false);
    fake = new FakePubSubGateway()
        .AddTopic(r.TopicName)
        .AddTopic(r.DeadLetterTopicName)
        .AddSubscription(r.DeadLetterTopicName, r.DeadLetterSubscriptionName, { EnableMessageOrdering: false })
        .AddSubscription(r.TopicName, r.SubscriptionName, {
            EnableMessageOrdering: false,
            DeadLetterTopicName: r.DeadLetterTopicName,
        });
    binding = TestGcpSubscriptionBinding(false);
    calls = [];
    script = new Map();
    metrics = [];
});

describe('CreateCloudRunPushHandler', () => {
    it('acknowledges completed messages with HTTP 200/204 and emits Cloud Logging telemetry', async () => {
        const msg = TestMessage(1);
        const res = await createHandler()(makePushRequest(msg));
        expect(res.StatusCode).toBe(200);
        expect(res.Body).toMatchObject({ Status: 'Completed', MessageID: msg.MessageID, Subscription: 'email.unsubscribe' });
        expect(calls).toEqual([msg.MessageID]);
        expect(JSON.parse(metrics[0])).toMatchObject({ Subscription: 'email.unsubscribe', Processed: 1, Completed: 1 });

        const res204 = await createHandler({ AckStatusCode: 204 })(makePushRequest(TestMessage(2)));
        expect(res204.StatusCode).toBe(204);
    });

    it('returns HTTP 503 with Retry-After for retryable outcomes so Pub/Sub redelivers', async () => {
        const msg = TestMessage(3);
        script.set(msg.MessageID, Outcome.Retry('downstream 503', 45));
        const res = await createHandler({ Gateway: undefined })(makePushRequest(msg));
        expect(res.StatusCode).toBe(503);
        expect(res.Headers['retry-after']).toBe('45');
        expect(res.Body.Status).toBe('Retry');
    });

    it('dead-letters explicit DeadLetter and invalid poison envelopes and returns ACK status', async () => {
        const msg = TestMessage(4);
        script.set(msg.MessageID, Outcome.DeadLetter('bad address'));
        const dlqRes = await createHandler()(makePushRequest(msg));
        expect(dlqRes.StatusCode).toBe(200);
        expect(dlqRes.Body.Status).toBe('DeadLettered');

        const poisonRes = await createHandler()(makePushRequest('not-valid-json', { messageId: 'poison-1' }));
        expect(poisonRes.StatusCode).toBe(200);
        expect(poisonRes.Body.Status).toBe('DeadLettered');

        const dlqMsgs = fake.Messages(TestGcpResources(false).DeadLetterSubscriptionName);
        expect(dlqMsgs).toHaveLength(2);
    });

    it('enforces RequireBearerToken, VerifyAuth OIDC hooks, malformed push bodies, and MJ_WQ_SUBSCRIPTION env', async () => {
        const authHandler = createHandler({
            RequireBearerToken: true,
            VerifyAuth: ({ BearerToken }) => BearerToken === 'valid-oidc-jwt',
        });
        expect((await authHandler(makePushRequest(TestMessage(5)))).StatusCode).toBe(401);
        expect((await authHandler(makePushRequest(TestMessage(5), { headers: { authorization: 'Bearer wrong' } }))).StatusCode).toBe(403);
        expect((await authHandler(makePushRequest(TestMessage(5), { headers: { Authorization: 'Bearer valid-oidc-jwt' } }))).StatusCode).toBe(200);

        expect((await createHandler()({ Body: { notMessage: true } })).StatusCode).toBe(400);

        const fromEnv = CreateCloudRunPushHandler(() => new ScriptedHandler(), {
            Env: { MJ_WQ_SUBSCRIPTION: JSON.stringify(binding) },
            Gateway: fake,
            EmitMetrics: () => undefined,
        });
        expect((await fromEnv(makePushRequest(TestMessage(6)))).StatusCode).toBe(200);
    });
});
