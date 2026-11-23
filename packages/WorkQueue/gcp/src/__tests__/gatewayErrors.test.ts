import { describe, it, expect } from 'vitest';
import {
    GcpGatewayError,
    GRPC_STATUS,
    IsAbortError,
    IsAlreadyExistsError,
    IsNotFoundError,
    IsStaleAckError,
    ToGatewayError,
} from '../gateway/errors';

describe('GCP Pub/Sub gateway error mapping', () => {
    it('classifies abort, not found, already exists, and stale ack errors', () => {
        expect(IsAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
        expect(IsAbortError(Object.assign(new Error('cancelled'), { code: GRPC_STATUS.CANCELLED }))).toBe(true);
        expect(IsNotFoundError(Object.assign(new Error('not found'), { code: GRPC_STATUS.NOT_FOUND }))).toBe(true);
        expect(IsAlreadyExistsError(Object.assign(new Error('exists'), { code: GRPC_STATUS.ALREADY_EXISTS }))).toBe(true);
        expect(IsStaleAckError(Object.assign(new Error('invalid ack_id'), { code: GRPC_STATUS.INVALID_ARGUMENT }))).toBe(true);
        expect(IsStaleAckError(new Error('ack expired'))).toBe(true);
    });

    it('maps gRPC transient vs permanent errors to GcpGatewayError', () => {
        const transient = ToGatewayError(Object.assign(new Error('unavailable'), { code: GRPC_STATUS.UNAVAILABLE }), 'PubSub pull');
        expect(transient).toBeInstanceOf(GcpGatewayError);
        expect(transient.Retryable).toBe(true);
        expect(transient.Code).toBe('GRPC_14');

        const permanent = ToGatewayError(Object.assign(new Error('denied'), { code: GRPC_STATUS.PERMISSION_DENIED }), 'PubSub publish');
        expect(permanent.Retryable).toBe(false);
        expect(ToGatewayError(permanent, 'again')).toBe(permanent);
    });
});
