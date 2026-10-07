export interface SqsReceivedMessage {
    MessageId: string;
    ReceiptHandle: string;
    Body: string;
    /** ApproximateReceiveCount. */
    ReceiveCount: number;
    /** FIFO queues only. */
    MessageGroupId: string | null;
    SentTimestamp: number | null;
    /** String message attributes. */
    Attributes: Record<string, string>;
}

export interface SqsReceiveRequest {
    QueueUrl: string;
    /** Clamped to 1–10. */
    MaxMessages: number;
    /** Clamped to 0–20. */
    WaitTimeSeconds: number;
    /** Null uses the queue's default visibility timeout. */
    VisibilityTimeoutSeconds: number | null;
    Signal?: AbortSignal;
}

export interface SqsSendRequest {
    QueueUrl: string;
    Body: string;
    Attributes?: Record<string, string>;
    MessageGroupId?: string;
    MessageDeduplicationId?: string;
}

export interface SqsGateway {
    /** Returns [] when the signal aborts the long poll. */
    Receive(request: SqsReceiveRequest): Promise<SqsReceivedMessage[]>;
    /** Returns the new SQS MessageId. */
    Send(request: SqsSendRequest): Promise<string>;
    /** False when the receipt handle no longer owns an in-flight message. */
    ChangeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<boolean>;
    /** False when the receipt handle is no longer valid. */
    Delete(queueUrl: string, receiptHandle: string): Promise<boolean>;
    /** All queue attributes; null when the queue does not exist. */
    GetAttributes(queueUrl: string): Promise<Record<string, string> | null>;
}
