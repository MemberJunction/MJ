import type { WorkJson, WorkPayloadRef } from './envelope';

export interface PublishRequest<TPayload extends WorkJson = WorkJson> {
    MessageID?: string;
    PartitionKey?: string;
    Attributes?: Record<string, string>;
    Payload?: TPayload;
    PayloadRef?: WorkPayloadRef;
    CorrelationID?: string;
    /** Suppresses a second publish with the same key to the same topic inside the TTL window. */
    DeduplicationKey?: string;
    /** Default: topic DefaultDeduplicationTTLSeconds. */
    DeduplicationTTLSeconds?: number;
}

export type PublishStatus = 'Accepted' | 'Duplicate' | 'Rejected';

export interface PublishError {
    Code: string;
    Message: string;
    Retryable: boolean;
}

export interface PublishResult {
    /** For Duplicate: the MessageID of the publish that owns the key (or the existing MessageID). */
    MessageID: string;
    Status: PublishStatus;
    Error?: PublishError;
}

export interface IWorkPublisher {
    /** Batch publish. Results are positionally aligned with requests. Partial success is possible. */
    Publish<TPayload extends WorkJson>(topic: string, requests: PublishRequest<TPayload>[]): Promise<PublishResult[]>;
}

/**
 * Every publish error code used anywhere in the work queue (spec 03 §1.1). Core produces the
 * envelope codes; the engine, drivers, REST extension and API client produce the rest.
 */
export const PublishErrorCodes = {
    PayloadTooLarge: 'PayloadTooLarge',
    InvalidAttributes: 'InvalidAttributes',
    InvalidPayload: 'InvalidPayload',
    InvalidPartitionKey: 'InvalidPartitionKey',
    InvalidMessageID: 'InvalidMessageID',
    InvalidDeduplication: 'InvalidDeduplication',
    TopicNotFound: 'TopicNotFound',
    TopicDisabled: 'TopicDisabled',
    TopicNotExternallyPublishable: 'TopicNotExternallyPublishable',
    Forbidden: 'Forbidden',
    TopicUnbound: 'TopicUnbound',
    MessageIDConflict: 'MessageIDConflict',
    DeduplicationPending: 'DeduplicationPending',
    TransportUnavailable: 'TransportUnavailable',
    TransportRejected: 'TransportRejected',
    BadRequest: 'BadRequest',
    Unauthorized: 'Unauthorized',
    InvalidResponse: 'InvalidResponse',
} as const;

export type PublishErrorCode = (typeof PublishErrorCodes)[keyof typeof PublishErrorCodes];

const RETRYABLE_PUBLISH_ERROR_CODES: ReadonlySet<string> = new Set<string>([
    PublishErrorCodes.TopicUnbound,
    PublishErrorCodes.DeduplicationPending,
    PublishErrorCodes.TransportUnavailable,
    PublishErrorCodes.InvalidResponse,
]);

export function IsRetryablePublishErrorCode(code: string): boolean {
    return RETRYABLE_PUBLISH_ERROR_CODES.has(code);
}

export function CreatePublishError(code: string, message: string): PublishError {
    return { Code: code, Message: message, Retryable: IsRetryablePublishErrorCode(code) };
}

export function RejectedPublishResult(messageID: string, code: string, message: string): PublishResult {
    return { MessageID: messageID, Status: 'Rejected', Error: CreatePublishError(code, message) };
}
