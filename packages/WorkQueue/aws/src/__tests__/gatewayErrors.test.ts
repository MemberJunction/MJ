import { describe, it, expect } from 'vitest';
import { AwsGatewayError, IsAbortError, ToGatewayError } from '../gateway/errors';

function awsError(name: string, fault?: 'client' | 'server'): Error {
    const error = new Error(`${name} happened`);
    error.name = name;
    return fault ? Object.assign(error, { $fault: fault }) : error;
}

describe('ToGatewayError', () => {
    it('marks throttling and server faults as retryable', () => {
        expect(ToGatewayError(awsError('ThrottlingException'), 'SNS PublishBatch').Retryable).toBe(true);
        expect(ToGatewayError(awsError('SomethingNew', 'server'), 'SQS SendMessage').Retryable).toBe(true);
    });

    it('marks client faults as not retryable and keeps the code and operation', () => {
        const mapped = ToGatewayError(awsError('AccessDenied', 'client'), 'SQS SendMessage');
        expect(mapped).toBeInstanceOf(AwsGatewayError);
        expect(mapped.Code).toBe('AccessDenied');
        expect(mapped.Retryable).toBe(false);
        expect(mapped.message).toBe('SQS SendMessage failed: AccessDenied happened');
    });

    it('recognises abort errors and passes gateway errors through', () => {
        expect(IsAbortError(awsError('AbortError'))).toBe(true);
        expect(IsAbortError(new Error('x'))).toBe(false);
        const original = new AwsGatewayError('boom', 'X', true);
        expect(ToGatewayError(original, 'op')).toBe(original);
    });
});
