export interface ServiceBusOutgoingMessage {
    /** Application-supplied unique message ID (envelope MessageID). */
    MessageId: string;
    /** Serialized envelope JSON. */
    Body: string;
    /** String application properties used for subscription SQL filters and WorkQueue metadata. */
    ApplicationProperties: Record<string, string>;
    /** Set for session-enabled (Exclusive) subscriptions. */
    SessionId?: string;
    /** Optional partition key for partitioned namespaces. */
    PartitionKey?: string;
    /** Optional correlation ID from the envelope. */
    CorrelationId?: string;
    /** Content type metadata (e.g. 'application/json'). */
    ContentType?: string;
    /** Optional UTC scheduled enqueue time for delayed retries. */
    ScheduledEnqueueTimeUtc?: Date;
}

export type ServiceBusSendEntryResult =
    | { Id: string; Kind: 'Published' }
    | { Id: string; Kind: 'Failed'; Code: string; Message: string; SenderFault: boolean };

export interface ServiceBusReceivedRecord {
    MessageId: string;
    LockToken: string;
    SequenceNumber: string;
    Body: string;
    /** Total delivery count including any scheduled retry offset tracked in ApplicationProperties. */
    DeliveryCount: number;
    SessionId: string | null;
    EnqueuedTimeUtc: number | null;
    LockedUntilUtc: number | null;
    ApplicationProperties: Record<string, string>;
    DeadLetterReason?: string | null;
    DeadLetterErrorDescription?: string | null;
}

export interface ServiceBusReceiveRequest {
    TopicName: string;
    SubscriptionName: string;
    RequiresSession: boolean;
    MaxMessages: number;
    MaxWaitTimeMs: number;
    Signal?: AbortSignal;
}

export interface ServiceBusSettleRequest {
    TopicName: string;
    SubscriptionName: string;
    RequiresSession: boolean;
    LockToken: string;
    SessionId: string | null;
    PropertiesToModify?: Record<string, string>;
}

export interface ServiceBusDeadLetterRequest extends ServiceBusSettleRequest {
    Reason: string;
    ErrorDescription: string;
}

export interface ServiceBusScheduleRequest {
    TopicName: string;
    Message: ServiceBusOutgoingMessage;
    ScheduledEnqueueTimeUtc: Date;
}

export interface ServiceBusGateway {
    /** Sends messages in one or more size-bounded Service Bus batches. */
    SendBatch(topicName: string, messages: ServiceBusOutgoingMessage[]): Promise<ServiceBusSendEntryResult[]>;
    /** Sends a single message to a topic and returns its MessageId. */
    Send(topicName: string, message: ServiceBusOutgoingMessage): Promise<string>;
    /** Schedules a message for future delivery (used for delayed retries) and returns its sequence number string. */
    Schedule(request: ServiceBusScheduleRequest): Promise<string>;
    /** Receives messages in peekLock mode. Returns [] when signal aborts or no messages are available. */
    Receive(request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedRecord[]>;
    /** Completes (acks) a peek-locked message. Returns false if the lock was lost or expired. */
    Complete(request: ServiceBusSettleRequest): Promise<boolean>;
    /** Abandons (nacks) a peek-locked message, returning it to the subscription immediately. Returns false if lock lost. */
    Abandon(request: ServiceBusSettleRequest): Promise<boolean>;
    /** Moves a peek-locked message to the subscription's dead-letter subqueue. Returns false if lock lost. */
    DeadLetter(request: ServiceBusDeadLetterRequest): Promise<boolean>;
    /** Renews the message or session lock. Returns the new UTC expiration Date, or null if the lock was lost. */
    RenewLock(request: ServiceBusSettleRequest): Promise<Date | null>;
    /** Non-destructively peeks messages in the subscription's $DeadLetterQueue subqueue. */
    PeekDeadLetters(topicName: string, subscriptionName: string, maxMessages: number): Promise<ServiceBusReceivedRecord[]>;
    /** Receives messages from the subscription's $DeadLetterQueue subqueue in peekLock mode for replay/discard. */
    ReceiveDeadLetters(topicName: string, subscriptionName: string, maxMessages: number, maxWaitTimeMs: number): Promise<ServiceBusReceivedRecord[]>;
    /** Completes (removes) a message received from $DeadLetterQueue. */
    CompleteDeadLetter(topicName: string, subscriptionName: string, lockToken: string): Promise<boolean>;
    /** Abandons a message received from $DeadLetterQueue so it remains dead-lettered. */
    AbandonDeadLetter(topicName: string, subscriptionName: string, lockToken: string): Promise<boolean>;
    /** Gracefully closes cached senders, receivers, and underlying AMQP connections. */
    Close(): Promise<void>;
}
