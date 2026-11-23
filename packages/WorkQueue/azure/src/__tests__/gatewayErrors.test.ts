import { describe, it, expect } from 'vitest';
import { AzureGatewayError, ErrorCode, IsAbortError, IsNotFoundError, IsStaleLockError, ToGatewayError } from '../gateway/errors';

describe('Azure gateway error helpers', () => {
    it('classifies retryable, not-found, stale-lock, and abort errors', () => {
        const busy = Object.assign(new Error('busy'), { code: 'ServiceBusy', retryable: true });
        expect(ToGatewayError(busy, 'Receive')).toMatchObject({
            Code: 'ServiceBusy',
            Retryable: true,
        });

        const throttledHttp = Object.assign(new Error('429'), { statusCode: 429 });
        expect(ToGatewayError(throttledHttp, 'Admin')).toMatchObject({ Retryable: true });

        const unauth = Object.assign(new Error('denied'), { code: 'UnauthorizedAccess', retryable: false });
        expect(ToGatewayError(unauth, 'Send')).toMatchObject({ Code: 'UnauthorizedAccess', Retryable: false });

        expect(IsNotFoundError(Object.assign(new Error('missing'), { code: 'MessagingEntityNotFound' }))).toBe(true);
        expect(IsNotFoundError(Object.assign(new Error('404'), { statusCode: 404 }))).toBe(true);
        expect(IsStaleLockError(Object.assign(new Error('expired'), { code: 'MessageLockLost' }))).toBe(true);
        expect(IsStaleLockError(Object.assign(new Error('session lost'), { code: 'SessionLockLost' }))).toBe(true);
        expect(IsAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
        expect(ErrorCode(new Error('plain'))).toBe('Error');

        const existing = new AzureGatewayError('already', 'ServiceTimeout', true);
        expect(ToGatewayError(existing, 'Op')).toBe(existing);
    });
});
