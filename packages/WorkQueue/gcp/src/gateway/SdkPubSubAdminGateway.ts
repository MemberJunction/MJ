import type { CallOptions, protos } from '@google-cloud/pubsub';
import {
    DEFAULT_ACK_DEADLINE_SECONDS,
    ExtractGcpResourceShortName,
    FormatGcpSubscriptionPath,
    FormatGcpTopicPath,
    GCP_MAX_ACK_DEADLINE_SECONDS,
    GCP_MIN_ACK_DEADLINE_SECONDS,
} from '../config';
import { IsAlreadyExistsError, IsNotFoundError, ToGatewayError } from './errors';
import type {
    EnsureGcpSubscriptionOptions,
    EnsureGcpTopicOptions,
    GcpSubscriptionProperties,
    GcpSubscriptionStatsProperties,
    GcpTopicProperties,
    PubSubAdminGateway,
} from './PubSubAdminGateway';

export interface PubSubAdminPublisherClientLike {
    listTopics(
        request: protos.google.pubsub.v1.IListTopicsRequest,
        options?: CallOptions,
    ): Promise<[protos.google.pubsub.v1.ITopic[], ...unknown[]]>;
    getTopic(
        request: protos.google.pubsub.v1.IGetTopicRequest,
        options?: CallOptions,
    ): Promise<[protos.google.pubsub.v1.ITopic, ...unknown[]]>;
    createTopic(
        request: protos.google.pubsub.v1.ITopic,
        options?: CallOptions,
    ): Promise<[protos.google.pubsub.v1.ITopic, ...unknown[]]>;
    deleteTopic(
        request: protos.google.pubsub.v1.IDeleteTopicRequest,
        options?: CallOptions,
    ): Promise<[protos.google.protobuf.IEmpty, ...unknown[]]>;
    close?(): Promise<void>;
}

export interface PubSubAdminSubscriberClientLike {
    getSubscription(
        request: protos.google.pubsub.v1.IGetSubscriptionRequest,
        options?: CallOptions,
    ): Promise<[protos.google.pubsub.v1.ISubscription, ...unknown[]]>;
    createSubscription(
        request: protos.google.pubsub.v1.ISubscription,
        options?: CallOptions,
    ): Promise<[protos.google.pubsub.v1.ISubscription, ...unknown[]]>;
    deleteSubscription(
        request: protos.google.pubsub.v1.IDeleteSubscriptionRequest,
        options?: CallOptions,
    ): Promise<[protos.google.protobuf.IEmpty, ...unknown[]]>;
    close?(): Promise<void>;
}

export interface SdkPubSubAdminGatewayDeps {
    ProjectId: string;
    Publisher: PubSubAdminPublisherClientLike;
    Subscriber: PubSubAdminSubscriberClientLike;
    Close?: () => Promise<void>;
}

function clampAckDeadline(seconds: number | undefined): number {
    if (seconds === undefined) {
        return DEFAULT_ACK_DEADLINE_SECONDS;
    }
    return Math.min(GCP_MAX_ACK_DEADLINE_SECONDS, Math.max(GCP_MIN_ACK_DEADLINE_SECONDS, Math.round(seconds)));
}

function toTopicProperties(topic: protos.google.pubsub.v1.ITopic): GcpTopicProperties {
    return {
        Name: ExtractGcpResourceShortName(topic.name ?? ''),
        ...(topic.labels ? { Labels: { ...topic.labels } } : {}),
    };
}

function toSubscriptionProperties(sub: protos.google.pubsub.v1.ISubscription): GcpSubscriptionProperties {
    const dlp = sub.deadLetterPolicy?.deadLetterTopic
        ? {
            DeadLetterTopic: ExtractGcpResourceShortName(sub.deadLetterPolicy.deadLetterTopic),
            MaxDeliveryAttempts: sub.deadLetterPolicy.maxDeliveryAttempts ?? 5,
        }
        : null;
    return {
        TopicName: ExtractGcpResourceShortName(sub.topic ?? ''),
        SubscriptionName: ExtractGcpResourceShortName(sub.name ?? ''),
        AckDeadlineSeconds: sub.ackDeadlineSeconds ?? DEFAULT_ACK_DEADLINE_SECONDS,
        EnableMessageOrdering: sub.enableMessageOrdering ?? false,
        Filter: sub.filter && sub.filter.trim() !== '' ? sub.filter : null,
        DeadLetterPolicy: dlp,
    };
}

export class SdkPubSubAdminGateway implements PubSubAdminGateway {
    constructor(private readonly deps: SdkPubSubAdminGatewayDeps) {}

    public async CheckHealth(): Promise<boolean> {
        try {
            await this.deps.Publisher.listTopics({
                project: `projects/${this.deps.ProjectId}`,
                pageSize: 1,
            });
            return true;
        } catch {
            return false;
        }
    }

    public async GetTopic(topicName: string): Promise<GcpTopicProperties | null> {
        try {
            const [topic] = await this.deps.Publisher.getTopic({
                topic: FormatGcpTopicPath(this.deps.ProjectId, topicName),
            });
            return toTopicProperties(topic);
        } catch (error) {
            if (IsNotFoundError(error)) {
                return null;
            }
            throw ToGatewayError(error, 'PubSub getTopic');
        }
    }

    public async EnsureTopic(topicName: string, options: EnsureGcpTopicOptions = {}): Promise<GcpTopicProperties> {
        const existing = await this.GetTopic(topicName);
        if (existing) {
            return existing;
        }
        try {
            const [created] = await this.deps.Publisher.createTopic({
                name: FormatGcpTopicPath(this.deps.ProjectId, topicName),
                ...(options.Labels ? { labels: { ...options.Labels } } : {}),
            });
            return toTopicProperties(created);
        } catch (error) {
            if (IsAlreadyExistsError(error)) {
                const retry = await this.GetTopic(topicName);
                if (retry) {
                    return retry;
                }
            }
            throw ToGatewayError(error, 'PubSub createTopic');
        }
    }

    public async DeleteTopic(topicName: string): Promise<boolean> {
        try {
            await this.deps.Publisher.deleteTopic({
                topic: FormatGcpTopicPath(this.deps.ProjectId, topicName),
            });
            return true;
        } catch (error) {
            if (IsNotFoundError(error)) {
                return false;
            }
            throw ToGatewayError(error, 'PubSub deleteTopic');
        }
    }

    public async GetSubscription(subscriptionName: string): Promise<GcpSubscriptionProperties | null> {
        try {
            const [sub] = await this.deps.Subscriber.getSubscription({
                subscription: FormatGcpSubscriptionPath(this.deps.ProjectId, subscriptionName),
            });
            return toSubscriptionProperties(sub);
        } catch (error) {
            if (IsNotFoundError(error)) {
                return null;
            }
            throw ToGatewayError(error, 'PubSub getSubscription');
        }
    }

    public async GetSubscriptionStats(
        subscriptionName: string,
        _deadLetterSubscriptionName: string | null,
    ): Promise<GcpSubscriptionStatsProperties | null> {
        const sub = await this.GetSubscription(subscriptionName);
        if (!sub) {
            return null;
        }
        // Native Pub/Sub admin API does not expose backlog counts synchronously without Cloud Monitoring.
        return {
            SubscriptionName: sub.SubscriptionName,
            UndeliveredMessageCount: 0,
            DeadLetterMessageCount: 0,
        };
    }

    public async EnsureSubscription(
        topicName: string,
        subscriptionName: string,
        options: EnsureGcpSubscriptionOptions = {},
    ): Promise<GcpSubscriptionProperties> {
        const existing = await this.GetSubscription(subscriptionName);
        if (existing) {
            return existing;
        }
        try {
            const request: protos.google.pubsub.v1.ISubscription = {
                name: FormatGcpSubscriptionPath(this.deps.ProjectId, subscriptionName),
                topic: FormatGcpTopicPath(this.deps.ProjectId, topicName),
                ackDeadlineSeconds: clampAckDeadline(options.AckDeadlineSeconds),
                enableMessageOrdering: options.EnableMessageOrdering ?? false,
                ...(options.Filter ? { filter: options.Filter } : {}),
                ...(options.DeadLetterTopicName
                    ? {
                        deadLetterPolicy: {
                            deadLetterTopic: FormatGcpTopicPath(this.deps.ProjectId, options.DeadLetterTopicName),
                            maxDeliveryAttempts: Math.max(5, options.MaxDeliveryAttempts ?? 5),
                        },
                    }
                    : {}),
            };
            const [created] = await this.deps.Subscriber.createSubscription(request);
            return toSubscriptionProperties(created);
        } catch (error) {
            if (IsAlreadyExistsError(error)) {
                const retry = await this.GetSubscription(subscriptionName);
                if (retry) {
                    return retry;
                }
            }
            throw ToGatewayError(error, 'PubSub createSubscription');
        }
    }

    public async DeleteSubscription(subscriptionName: string): Promise<boolean> {
        try {
            await this.deps.Subscriber.deleteSubscription({
                subscription: FormatGcpSubscriptionPath(this.deps.ProjectId, subscriptionName),
            });
            return true;
        } catch (error) {
            if (IsNotFoundError(error)) {
                return false;
            }
            throw ToGatewayError(error, 'PubSub deleteSubscription');
        }
    }
}
