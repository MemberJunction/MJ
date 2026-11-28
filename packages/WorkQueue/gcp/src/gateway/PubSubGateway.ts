export interface PubSubOutgoingMessage {
    /** Envelope MessageID (also stored in Attributes when useful). */
    MessageId: string;
    /** Serialized WorkMessage JSON payload. */
    Data: string;
    /** String attributes used for Pub/Sub subscription filtering and WorkQueue metadata. */
    Attributes: Record<string, string>;
    /** Ordering key set when topic EnableMessageOrdering / IsFifo is true. */
    OrderingKey?: string;
}

export type PubSubPublishEntryResult =
    | { Id: string; Kind: 'Published'; ServerMessageId?: string }
    | { Id: string; Kind: 'Failed'; Code: string; Message: string; SenderFault: boolean };

export interface PubSubReceivedRecord {
    /** Pub/Sub server message ID (or envelope MessageID in fakes). */
    ServerMessageId: string;
    /** Unique ackId token used for Acknowledge and ModifyAckDeadline. */
    AckId: string;
    /** Raw decoded UTF-8 message data string. */
    Data: string;
    /** Total delivery attempt count (1-based). */
    DeliveryAttempt: number;
    OrderingKey: string | null;
    PublishTimeMs: number | null;
    AckDeadlineExpiresAtMs: number | null;
    Attributes: Record<string, string>;
}

export interface PubSubPullRequest {
    TopicName: string;
    SubscriptionName: string;
    MaxMessages: number;
    /** Optional max wait duration in ms for pull polling. */
    MaxWaitTimeMs: number;
    /** Subscription AckDeadlineSeconds used to compute initial lease expiry. */
    AckDeadlineSeconds: number;
    Signal?: AbortSignal;
}

export interface PubSubAckRequest {
    SubscriptionName: string;
    AckIds: string[];
}

export interface PubSubModifyAckDeadlineRequest {
    SubscriptionName: string;
    AckIds: string[];
    AckDeadlineSeconds: number;
}

export interface PubSubGateway {
    /** Publishes a single message to a Pub/Sub topic and returns the server message ID. */
    Publish(topicName: string, message: PubSubOutgoingMessage): Promise<string>;
    /** Publishes a batch of messages to a Pub/Sub topic with per-message result alignment. */
    PublishBatch(topicName: string, messages: PubSubOutgoingMessage[]): Promise<PubSubPublishEntryResult[]>;
    /** Pulls messages synchronously from a Pub/Sub subscription. */
    Pull(request: PubSubPullRequest): Promise<PubSubReceivedRecord[]>;
    /** Acknowledges one or more deliveries. Returns false if the ack token was stale or invalid. */
    Acknowledge(request: PubSubAckRequest): Promise<boolean>;
    /** Extends (seconds > 0) or nacks (seconds = 0) ack deadlines for one or more deliveries. */
    ModifyAckDeadline(request: PubSubModifyAckDeadlineRequest): Promise<boolean>;
    /** Pulls messages from a subscription's dead-letter subscription for operator inspection/replay/discard. */
    PullDeadLetters(deadLetterSubscriptionName: string, maxMessages: number): Promise<PubSubReceivedRecord[]>;
    /** Acknowledges (removes) a message pulled from the dead-letter subscription. */
    AcknowledgeDeadLetter(deadLetterSubscriptionName: string, ackId: string): Promise<boolean>;
    /** Immediately nacks (restores visibility) of a message pulled from the dead-letter subscription. */
    NackDeadLetter(deadLetterSubscriptionName: string, ackId: string): Promise<boolean>;
    /** Gracefully flushes publishers and closes underlying gRPC clients. */
    Close(): Promise<void>;
}
