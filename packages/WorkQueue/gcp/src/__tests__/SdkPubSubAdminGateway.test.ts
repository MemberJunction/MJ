import { describe, it, expect, vi } from 'vitest';
import { GRPC_STATUS } from '../gateway/errors';
import {
    SdkPubSubAdminGateway,
    type PubSubAdminPublisherClientLike,
    type PubSubAdminSubscriberClientLike,
} from '../gateway/SdkPubSubAdminGateway';

function notFoundError(): Error {
    return Object.assign(new Error('Not found'), { code: GRPC_STATUS.NOT_FOUND });
}

describe('SdkPubSubAdminGateway', () => {
    it('provisions, reads, and deletes topics and subscriptions and checks health', async () => {
        const publisher: PubSubAdminPublisherClientLike = {
            listTopics: vi.fn(async () => [[]]),
            getTopic: vi.fn(async () => [{ name: 'projects/proj-1/topics/email-events', labels: { env: 'prod' } }]),
            createTopic: vi.fn(async () => [{ name: 'projects/proj-1/topics/email-events' }]),
            deleteTopic: vi.fn(async () => [{}]),
        };
        const subscriber: PubSubAdminSubscriberClientLike = {
            getSubscription: vi.fn(async () => [{
                name: 'projects/proj-1/subscriptions/email-sub',
                topic: 'projects/proj-1/topics/email-events',
                ackDeadlineSeconds: 60,
                enableMessageOrdering: true,
                filter: 'attributes.eventType = "unsubscribe"',
                deadLetterPolicy: {
                    deadLetterTopic: 'projects/proj-1/topics/email-events-dlq',
                    maxDeliveryAttempts: 10,
                },
            }]),
            createSubscription: vi.fn(async () => [{
                name: 'projects/proj-1/subscriptions/email-sub',
                topic: 'projects/proj-1/topics/email-events',
                ackDeadlineSeconds: 60,
                enableMessageOrdering: true,
                filter: '',
                deadLetterPolicy: null,
            }]),
            deleteSubscription: vi.fn(async () => [{}]),
        };

        const admin = new SdkPubSubAdminGateway({ ProjectId: 'proj-1', Publisher: publisher, Subscriber: subscriber });
        expect(await admin.CheckHealth()).toBe(true);
        expect(await admin.GetTopic('email-events')).toEqual({ Name: 'email-events', Labels: { env: 'prod' } });
        expect(await admin.GetSubscription('email-sub')).toEqual({
            TopicName: 'email-events',
            SubscriptionName: 'email-sub',
            AckDeadlineSeconds: 60,
            EnableMessageOrdering: true,
            Filter: 'attributes.eventType = "unsubscribe"',
            DeadLetterPolicy: { DeadLetterTopic: 'email-events-dlq', MaxDeliveryAttempts: 10 },
        });
        expect(await admin.GetSubscriptionStats('email-sub', null)).toEqual({
            SubscriptionName: 'email-sub',
            UndeliveredMessageCount: 0,
            DeadLetterMessageCount: 0,
        });

        vi.mocked(publisher.getTopic).mockRejectedValueOnce(notFoundError());
        expect(await admin.GetTopic('missing')).toBeNull();

        vi.mocked(subscriber.getSubscription).mockRejectedValueOnce(notFoundError());
        const created = await admin.EnsureSubscription('email-events', 'new-sub', {
            AckDeadlineSeconds: 5,
            EnableMessageOrdering: true,
            DeadLetterTopicName: 'email-events-dlq',
            MaxDeliveryAttempts: 8,
        });
        expect(created.SubscriptionName).toBe('email-sub');
        expect(subscriber.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
            ackDeadlineSeconds: 10,
            enableMessageOrdering: true,
        }));

        expect(await admin.DeleteSubscription('email-sub')).toBe(true);
        expect(await admin.DeleteTopic('email-events')).toBe(true);
    });
});
