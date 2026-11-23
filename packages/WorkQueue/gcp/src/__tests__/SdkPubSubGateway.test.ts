import { describe, it, expect, vi } from 'vitest';
import { GRPC_STATUS } from '../gateway/errors';
import {
    SdkPubSubGateway,
    type PubSubPublisherClientLike,
    type PubSubSubscriberClientLike,
} from '../gateway/SdkPubSubGateway';

describe('SdkPubSubGateway', () => {
    it('publishes single and batch messages with full resource paths and ordering keys', async () => {
        const publishMock = vi.fn(async () => [{ messageIds: ['srv-1', 'srv-2'] }]);
        const publisher: PubSubPublisherClientLike = {
            publish: publishMock,
            close: vi.fn(async () => undefined),
        };
        const subscriber: PubSubSubscriberClientLike = {
            pull: vi.fn(async () => [{ receivedMessages: [] }]),
            acknowledge: vi.fn(async () => [{}]),
            modifyAckDeadline: vi.fn(async () => [{}]),
            close: vi.fn(async () => undefined),
        };

        const gateway = new SdkPubSubGateway({ ProjectId: 'proj-1', Publisher: publisher, Subscriber: subscriber });
        expect(await gateway.Publish('topic-a', {
            MessageId: 'm-0',
            Data: '{"hello":1}',
            Attributes: { k: 'v' },
            OrderingKey: 'key-1',
        })).toBe('srv-1');

        const batchRes = await gateway.PublishBatch('topic-a', [
            { MessageId: 'm-1', Data: '{"a":1}', Attributes: {} },
            { MessageId: 'm-2', Data: '{"a":2}', Attributes: {} },
        ]);
        expect(batchRes).toEqual([
            { Id: 'm-1', Kind: 'Published', ServerMessageId: 'srv-1' },
            { Id: 'm-2', Kind: 'Published', ServerMessageId: 'srv-2' },
        ]);
        expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
            topic: 'projects/proj-1/topics/topic-a',
        }));
        await gateway.Close();
    });

    it('pulls, acknowledges, modifies ack deadline, and maps stale ack errors to false', async () => {
        const pullMock = vi.fn(async () => [{
            receivedMessages: [{
                ackId: 'ack-1',
                deliveryAttempt: 2,
                message: {
                    messageId: 'srv-1',
                    data: Buffer.from('{"MessageID":"m-1","Topic":"t","Attributes":{},"PublishedAt":"2026-09-16T00:00:00Z"}', 'utf8'),
                    attributes: { eventType: 'click' },
                    orderingKey: 'k-1',
                    publishTime: { seconds: 1_800_000_000, nanos: 0 },
                },
            }],
        }]);
        const acknowledgeMock = vi.fn(async () => [{}]);
        const modifyAckMock = vi.fn(async () => [{}]);
        const gateway = new SdkPubSubGateway({
            ProjectId: 'proj-1',
            Publisher: { publish: vi.fn() },
            Subscriber: { pull: pullMock, acknowledge: acknowledgeMock, modifyAckDeadline: modifyAckMock },
        }, () => 1_800_000_000_000);

        const records = await gateway.Pull({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-a',
            MaxMessages: 5,
            MaxWaitTimeMs: 2000,
            AckDeadlineSeconds: 60,
        });
        expect(records).toEqual([{
            ServerMessageId: 'srv-1',
            AckId: 'ack-1',
            Data: '{"MessageID":"m-1","Topic":"t","Attributes":{},"PublishedAt":"2026-09-16T00:00:00Z"}',
            DeliveryAttempt: 2,
            OrderingKey: 'k-1',
            PublishTimeMs: 1_800_000_000_000,
            AckDeadlineExpiresAtMs: 1_800_000_060_000,
            Attributes: { eventType: 'click' },
        }]);

        expect(await gateway.Acknowledge({ SubscriptionName: 'sub-a', AckIds: ['ack-1'] })).toBe(true);
        expect(await gateway.ModifyAckDeadline({ SubscriptionName: 'sub-a', AckIds: ['ack-1'], AckDeadlineSeconds: 30 })).toBe(true);

        acknowledgeMock.mockRejectedValueOnce(Object.assign(new Error('invalid ack_id'), { code: GRPC_STATUS.INVALID_ARGUMENT }));
        expect(await gateway.Acknowledge({ SubscriptionName: 'sub-a', AckIds: ['ack-stale'] })).toBe(false);

        pullMock.mockRejectedValueOnce(Object.assign(new Error('deadline exceeded'), { code: GRPC_STATUS.DEADLINE_EXCEEDED }));
        expect(await gateway.Pull({
            TopicName: 'topic-a',
            SubscriptionName: 'sub-a',
            MaxMessages: 1,
            MaxWaitTimeMs: 1000,
            AckDeadlineSeconds: 60,
        })).toEqual([]);
    });
});
