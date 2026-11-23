import type { CallOptions, protos } from '@google-cloud/pubsub';
import { FormatGcpSubscriptionPath, FormatGcpTopicPath } from '../config';
import { BodyAsString } from '../envelope';
import { GRPC_STATUS, GrpcStatusCode, IsAbortError, IsStaleAckError, ToGatewayError } from './errors';
import type {
    PubSubAckRequest,
    PubSubGateway,
    PubSubModifyAckDeadlineRequest,
    PubSubOutgoingMessage,
    PubSubPublishEntryResult,
    PubSubPullRequest,
    PubSubReceivedRecord,
} from './PubSubGateway';

export interface PubSubPublisherClientLike {
    publish(
        request: protos.google.pubsub.v1.IPublishRequest,
        options?: CallOptions,
    ): Promise<[protos.google.pubsub.v1.IPublishResponse, ...unknown[]]>;
    close?(): Promise<void>;
}

export interface PubSubSubscriberClientLike {
    pull(
        request: protos.google.pubsub.v1.IPullRequest,
        options?: CallOptions,
    ): Promise<[protos.google.pubsub.v1.IPullResponse, ...unknown[]]>;
    acknowledge(
        request: protos.google.pubsub.v1.IAcknowledgeRequest,
        options?: CallOptions,
    ): Promise<[protos.google.protobuf.IEmpty, ...unknown[]]>;
    modifyAckDeadline(
        request: protos.google.pubsub.v1.IModifyAckDeadlineRequest,
        options?: CallOptions,
    ): Promise<[protos.google.protobuf.IEmpty, ...unknown[]]>;
    close?(): Promise<void>;
}

export interface SdkPubSubGatewayDeps {
    ProjectId: string;
    Publisher: PubSubPublisherClientLike;
    Subscriber: PubSubSubscriberClientLike;
    Close?: () => Promise<void>;
}

function toProtoMessage(message: PubSubOutgoingMessage): protos.google.pubsub.v1.IPubsubMessage {
    return {
        data: Buffer.from(message.Data, 'utf8'),
        attributes: { ...message.Attributes },
        ...(message.OrderingKey ? { orderingKey: message.OrderingKey } : {}),
    };
}

function readAttributes(source: Record<string, string> | null | undefined): Record<string, string> {
    if (!source) {
        return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'string') {
            result[key] = value;
        }
    }
    return result;
}

function parsePublishTimeMs(timestamp: protos.google.protobuf.ITimestamp | null | undefined): number | null {
    if (!timestamp) {
        return null;
    }
    const seconds = Number(timestamp.seconds ?? 0);
    const nanos = Number(timestamp.nanos ?? 0);
    if (!Number.isFinite(seconds) || !Number.isFinite(nanos)) {
        return null;
    }
    return Math.round(seconds * 1000 + nanos / 1_000_000);
}

function toReceivedRecord(
    received: protos.google.pubsub.v1.IReceivedMessage,
    ackDeadlineSeconds: number,
    nowMs: number,
): PubSubReceivedRecord {
    const msg = received.message;
    const ackId = received.ackId ?? '';
    const serverId = msg?.messageId ?? ackId;
    const attempt = typeof received.deliveryAttempt === 'number' && received.deliveryAttempt > 0
        ? received.deliveryAttempt
        : 1;
    return {
        ServerMessageId: serverId,
        AckId: ackId,
        Data: BodyAsString(msg?.data),
        DeliveryAttempt: attempt,
        OrderingKey: msg?.orderingKey ? String(msg.orderingKey) : null,
        PublishTimeMs: parsePublishTimeMs(msg?.publishTime),
        AckDeadlineExpiresAtMs: nowMs + ackDeadlineSeconds * 1000,
        Attributes: readAttributes(msg?.attributes),
    };
}

export class SdkPubSubGateway implements PubSubGateway {
    constructor(
        private readonly deps: SdkPubSubGatewayDeps,
        private readonly now: () => number = Date.now,
    ) {}

    public async Publish(topicName: string, message: PubSubOutgoingMessage): Promise<string> {
        const topic = FormatGcpTopicPath(this.deps.ProjectId, topicName);
        try {
            const [response] = await this.deps.Publisher.publish({
                topic,
                messages: [toProtoMessage(message)],
            });
            return response.messageIds?.[0] ?? message.MessageId;
        } catch (error) {
            throw ToGatewayError(error, 'PubSub publish');
        }
    }

    public async PublishBatch(topicName: string, messages: PubSubOutgoingMessage[]): Promise<PubSubPublishEntryResult[]> {
        if (messages.length === 0) {
            return [];
        }
        const topic = FormatGcpTopicPath(this.deps.ProjectId, topicName);
        try {
            const [response] = await this.deps.Publisher.publish({
                topic,
                messages: messages.map(toProtoMessage),
            });
            const ids = response.messageIds ?? [];
            return messages.map((msg, idx) => ({
                Id: msg.MessageId,
                Kind: 'Published',
                ServerMessageId: ids[idx] ?? msg.MessageId,
            }));
        } catch (error) {
            throw ToGatewayError(error, 'PubSub publishBatch');
        }
    }

    public async Pull(request: PubSubPullRequest): Promise<PubSubReceivedRecord[]> {
        if (request.Signal?.aborted) {
            return [];
        }
        const subscription = FormatGcpSubscriptionPath(this.deps.ProjectId, request.SubscriptionName);
        const callOptions: CallOptions = {};
        if (request.Signal) {
            callOptions.signal = request.Signal;
        }
        if (request.MaxWaitTimeMs > 0) {
            callOptions.timeout = Math.max(1000, request.MaxWaitTimeMs);
        }
        try {
            const [response] = await this.deps.Subscriber.pull(
                {
                    subscription,
                    maxMessages: Math.max(1, Math.floor(request.MaxMessages)),
                },
                callOptions,
            );
            const nowMs = this.now();
            return (response.receivedMessages ?? [])
                .filter((m) => typeof m.ackId === 'string' && m.ackId !== '')
                .map((m) => toReceivedRecord(m, request.AckDeadlineSeconds, nowMs));
        } catch (error) {
            if (IsAbortError(error) || request.Signal?.aborted || GrpcStatusCode(error) === GRPC_STATUS.DEADLINE_EXCEEDED) {
                return [];
            }
            throw ToGatewayError(error, 'PubSub pull');
        }
    }

    public async Acknowledge(request: PubSubAckRequest): Promise<boolean> {
        if (request.AckIds.length === 0) {
            return true;
        }
        const subscription = FormatGcpSubscriptionPath(this.deps.ProjectId, request.SubscriptionName);
        try {
            await this.deps.Subscriber.acknowledge({
                subscription,
                ackIds: request.AckIds,
            });
            return true;
        } catch (error) {
            if (IsStaleAckError(error)) {
                return false;
            }
            throw ToGatewayError(error, 'PubSub acknowledge');
        }
    }

    public async ModifyAckDeadline(request: PubSubModifyAckDeadlineRequest): Promise<boolean> {
        if (request.AckIds.length === 0) {
            return true;
        }
        const subscription = FormatGcpSubscriptionPath(this.deps.ProjectId, request.SubscriptionName);
        try {
            await this.deps.Subscriber.modifyAckDeadline({
                subscription,
                ackIds: request.AckIds,
                ackDeadlineSeconds: Math.max(0, Math.min(600, Math.ceil(request.AckDeadlineSeconds))),
            });
            return true;
        } catch (error) {
            if (IsStaleAckError(error)) {
                return false;
            }
            throw ToGatewayError(error, 'PubSub modifyAckDeadline');
        }
    }

    public PullDeadLetters(deadLetterSubscriptionName: string, maxMessages: number): Promise<PubSubReceivedRecord[]> {
        return this.Pull({
            TopicName: '',
            SubscriptionName: deadLetterSubscriptionName,
            MaxMessages: Math.max(1, Math.floor(maxMessages)),
            MaxWaitTimeMs: 1000,
            AckDeadlineSeconds: 30,
        });
    }

    public AcknowledgeDeadLetter(deadLetterSubscriptionName: string, ackId: string): Promise<boolean> {
        return this.Acknowledge({
            SubscriptionName: deadLetterSubscriptionName,
            AckIds: [ackId],
        });
    }

    public NackDeadLetter(deadLetterSubscriptionName: string, ackId: string): Promise<boolean> {
        return this.ModifyAckDeadline({
            SubscriptionName: deadLetterSubscriptionName,
            AckIds: [ackId],
            AckDeadlineSeconds: 0,
        });
    }

    public async Close(): Promise<void> {
        if (this.deps.Close) {
            await this.deps.Close();
            return;
        }
        await Promise.all([
            this.deps.Publisher.close?.().catch(() => undefined),
            this.deps.Subscriber.close?.().catch(() => undefined),
        ]);
    }
}
