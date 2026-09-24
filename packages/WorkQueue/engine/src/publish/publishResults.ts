import type { PublishResult } from '@memberjunction/work-queue-core';

export function Accepted(messageID: string): PublishResult {
    return { MessageID: messageID, Status: 'Accepted' };
}

export function Duplicate(messageID: string): PublishResult {
    return { MessageID: messageID, Status: 'Duplicate' };
}

export function Rejected(messageID: string, code: string, message: string, retryable: boolean): PublishResult {
    return { MessageID: messageID, Status: 'Rejected', Error: { Code: code, Message: message, Retryable: retryable } };
}
