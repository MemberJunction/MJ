/** A message as the messaging gateway hands it to the consumer or operator. */
export interface ServiceBusReceivedEnvelope {
    MessageId: string;
    /** Envelope JSON: a string, or the object the SDK already parsed. */
    Body: unknown;
    ApplicationProperties: Record<string, unknown>;
    SessionId: string | null;
    CorrelationId: string | null;
    /** Service Bus DeliveryCount (1 on the first delivery of a copy). */
    DeliveryCount: number;
    /** Epoch ms, null when the service did not report it. */
    EnqueuedTimeUtc: number | null;
    /** Epoch ms of the peek-lock expiry; null for peeked messages. */
    LockedUntilUtc: number | null;
    /** Null for peeked messages (no lock). */
    LockToken: string | null;
    /** Decimal string of the Service Bus SequenceNumber (a 64-bit value). */
    SequenceNumber: string;
    DeadLetterReason: string | null;
    DeadLetterErrorDescription: string | null;
    /** Opaque handle of the receiver that owns this message's lock (a session receiver for session subscriptions). */
    Receiver: string;
}

export interface ServiceBusOutboundMessage {
    MessageId: string;
    Body: string;
    ApplicationProperties: Record<string, string>;
    SessionId?: string;
    CorrelationId?: string;
    ContentType?: string;
}

export interface ServiceBusReceiveRequest {
    TopicName: string;
    SubscriptionName: string;
    /** Receive one message from up to MaxMessages sessions (Exclusive) instead of MaxMessages from one receiver. */
    RequiresSession: boolean;
    /** Clamped to 1–100 (per receiver) — on session subscriptions the number of sessions to accept. */
    MaxMessages: number;
    /** Long-poll wait; 0 returns what is immediately available. */
    WaitMs: number;
    /** Receive from the subscription's dead-letter subqueue (never sessions). */
    DeadLetter?: boolean;
    Signal?: AbortSignal;
}

export interface ServiceBusPeekRequest {
    TopicName: string;
    SubscriptionName: string;
    DeadLetter: boolean;
    /** Decimal SequenceNumber to start from; null starts at the head. */
    FromSequenceNumber: string | null;
    MaxMessages: number;
}

export interface ServiceBusDeadLetterRequest {
    Reason: string;
    Description: string;
    /** Application properties added to the dead-lettered copy. */
    Properties: Record<string, string>;
}

/**
 * Messaging operations the driver needs, with SDK objects hidden behind string handles so the consumer, operator and
 * fakes share one surface. Settle calls resolve false when the lock (or session lock) is no longer held — the
 * transport's fence — and throw AzureGatewayError for everything else.
 */
export interface ServiceBusGateway {
    /** Sends immediately. The batch is atomic: the whole call fails or succeeds. */
    Send(topicName: string, messages: ServiceBusOutboundMessage[]): Promise<void>;
    /** Enqueues at `enqueueAt` (scheduled messages are not visible until then). */
    Schedule(topicName: string, messages: ServiceBusOutboundMessage[], enqueueAt: Date): Promise<void>;
    /** Peek-lock receive. Returns [] when the signal aborts the wait. */
    Receive(request: ServiceBusReceiveRequest): Promise<ServiceBusReceivedEnvelope[]>;
    Complete(message: ServiceBusReceivedEnvelope): Promise<boolean>;
    /** Releases the lock; the service redelivers immediately and increments DeliveryCount. */
    Abandon(message: ServiceBusReceivedEnvelope): Promise<boolean>;
    DeadLetter(message: ServiceBusReceivedEnvelope, request: ServiceBusDeadLetterRequest): Promise<boolean>;
    /** New lock expiry (epoch ms), or null when the lock was lost. Renews the session lock too on session receivers. */
    RenewLock(message: ServiceBusReceivedEnvelope): Promise<number | null>;
    /** Non-destructive browse in SequenceNumber order. */
    Peek(request: ServiceBusPeekRequest): Promise<ServiceBusReceivedEnvelope[]>;
    /**
     * Closes a session receiver so its session lock is released and the next message of that key can be received
     * (by any consumer). A no-op for the shared non-session receivers.
     */
    ReleaseReceiver(handle: string): Promise<void>;
}
