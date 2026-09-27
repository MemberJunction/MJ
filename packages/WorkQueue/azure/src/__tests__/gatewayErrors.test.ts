import { describe, it, expect } from 'vitest';
import { AzureGatewayError, ErrorCode, IsAbortError, IsEntityNotFound, IsLockLost, ToGatewayError } from '../gateway/errors';

class FakeServiceBusError extends Error {
    constructor(message: string, public readonly code: string, public readonly retryable: boolean) {
        super(message);
        this.name = 'ServiceBusError';
    }
}

describe('ToGatewayError', () => {
    it('keeps the SDK verdict on retryability', () => {
        const busy = ToGatewayError(new FakeServiceBusError('busy', 'ServiceBusy', true), 'send');
        expect(busy).toBeInstanceOf(AzureGatewayError);
        expect(busy).toMatchObject({ Code: 'ServiceBusy', Retryable: true, message: 'send failed: busy' });
        expect(ToGatewayError(new FakeServiceBusError('gone', 'MessagingEntityNotFound', false), 'get').Retryable).toBe(false);
    });

    it('classifies errors without a verdict by code', () => {
        expect(ToGatewayError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }), 'receive').Retryable).toBe(true);
        expect(ToGatewayError(new Error('plain'), 'receive').Retryable).toBe(false);
        expect(ErrorCode(new Error('plain'))).toBe('Error');
        expect(ToGatewayError(new AzureGatewayError('x', 'Y', true), 'op').Code).toBe('Y');
    });

    it('recognises lock loss, aborts and missing entities', () => {
        expect(IsLockLost(new FakeServiceBusError('lost', 'MessageLockLost', false))).toBe(true);
        expect(IsLockLost(new FakeServiceBusError('lost', 'SessionLockLost', false))).toBe(true);
        expect(IsLockLost(new Error('x'))).toBe(false);
        expect(IsAbortError(Object.assign(new Error('a'), { name: 'AbortError' }))).toBe(true);
        expect(IsEntityNotFound(new FakeServiceBusError('gone', 'MessagingEntityNotFound', false))).toBe(true);
        expect(IsEntityNotFound(Object.assign(new Error('404'), { name: 'RestError', statusCode: 404 }))).toBe(true);
        expect(IsEntityNotFound(Object.assign(new Error('500'), { name: 'RestError', statusCode: 500 }))).toBe(false);
    });
});
