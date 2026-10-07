import { describe, it, expect } from 'vitest';
import { CreatePublishError, IsRetryablePublishErrorCode, PublishErrorCodes, RejectedPublishResult } from '../publishing';

describe('publish error helpers', () => {
    it('marks only transient transport codes as retryable', () => {
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.TopicUnbound)).toBe(true);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.TransportUnavailable)).toBe(true);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.InvalidResponse)).toBe(true);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.DeduplicationPending)).toBe(true);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.TransportRejected)).toBe(false);
        expect(IsRetryablePublishErrorCode(PublishErrorCodes.PayloadTooLarge)).toBe(false);
        expect(IsRetryablePublishErrorCode('SomethingElse')).toBe(false);
    });

    it('builds errors and rejected results with the retryable flag derived from the code', () => {
        expect(CreatePublishError('TransportUnavailable', 'down')).toEqual({ Code: 'TransportUnavailable', Message: 'down', Retryable: true });
        expect(RejectedPublishResult('m-1', 'InvalidAttributes', 'bad')).toEqual({
            MessageID: 'm-1',
            Status: 'Rejected',
            Error: { Code: 'InvalidAttributes', Message: 'bad', Retryable: false },
        });
    });
});
