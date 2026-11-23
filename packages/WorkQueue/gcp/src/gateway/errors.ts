/** A failed Google Cloud Pub/Sub call. Retryable failures map to TransportUnavailable and settle retries. */
export class GcpGatewayError extends Error {
    constructor(message: string, public readonly Code: string, public readonly Retryable: boolean) {
        super(message);
        this.name = 'GcpGatewayError';
    }
}

/** gRPC status codes (0..16) returned by @google-cloud/pubsub / google-gax. */
export const GRPC_STATUS = {
    CANCELLED: 1,
    UNKNOWN: 2,
    INVALID_ARGUMENT: 3,
    DEADLINE_EXCEEDED: 4,
    NOT_FOUND: 5,
    ALREADY_EXISTS: 6,
    PERMISSION_DENIED: 7,
    RESOURCE_EXHAUSTED: 8,
    FAILED_PRECONDITION: 9,
    ABORTED: 10,
    UNAVAILABLE: 14,
    DATA_LOSS: 15,
    UNAUTHENTICATED: 16,
} as const;

const RETRYABLE_GRPC_CODES = new Set<number>([
    GRPC_STATUS.UNKNOWN,
    GRPC_STATUS.DEADLINE_EXCEEDED,
    GRPC_STATUS.RESOURCE_EXHAUSTED,
    GRPC_STATUS.ABORTED,
    GRPC_STATUS.UNAVAILABLE,
]);

const RETRYABLE_STRING_CODES = new Set([
    'UNAVAILABLE',
    'DEADLINE_EXCEEDED',
    'RESOURCE_EXHAUSTED',
    'ABORTED',
    'INTERNAL',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
]);

function readString(source: unknown, key: string): string | null {
    if (typeof source !== 'object' || source === null) {
        return null;
    }
    const value: unknown = Reflect.get(source, key);
    return typeof value === 'string' ? value : null;
}

function readNumber(source: unknown, key: string): number | null {
    if (typeof source !== 'object' || source === null) {
        return null;
    }
    const value: unknown = Reflect.get(source, key);
    return typeof value === 'number' ? value : null;
}

export function GrpcStatusCode(error: unknown): number | null {
    const code = readNumber(error, 'code');
    if (code !== null) {
        return code;
    }
    const status = readNumber(error, 'status');
    return status;
}

/** The SDK error code or name (or Node error code), 'Unknown' when neither exists. */
export function ErrorCode(error: unknown): string {
    const numCode = readNumber(error, 'code');
    if (numCode !== null) {
        return `GRPC_${numCode}`;
    }
    return readString(error, 'code') ?? readString(error, 'name') ?? 'Unknown';
}

export function IsAbortError(error: unknown): boolean {
    const code = ErrorCode(error);
    return code === 'AbortError' || readString(error, 'name') === 'AbortError' || GrpcStatusCode(error) === GRPC_STATUS.CANCELLED;
}

export function IsNotFoundError(error: unknown): boolean {
    if (GrpcStatusCode(error) === GRPC_STATUS.NOT_FOUND) {
        return true;
    }
    const code = ErrorCode(error);
    return code === 'NOT_FOUND' || readNumber(error, 'statusCode') === 404;
}

export function IsAlreadyExistsError(error: unknown): boolean {
    if (GrpcStatusCode(error) === GRPC_STATUS.ALREADY_EXISTS) {
        return true;
    }
    const code = ErrorCode(error);
    return code === 'ALREADY_EXISTS' || readNumber(error, 'statusCode') === 409;
}

export function IsStaleAckError(error: unknown): boolean {
    const grpc = GrpcStatusCode(error);
    if (grpc === GRPC_STATUS.INVALID_ARGUMENT || grpc === GRPC_STATUS.NOT_FOUND || grpc === GRPC_STATUS.FAILED_PRECONDITION) {
        const message = readString(error, 'message') ?? '';
        if (/ack|expired|invalid|not found|already/i.test(message)) {
            return true;
        }
    }
    const message = readString(error, 'message') ?? '';
    return /ack(?:nowledg(?:e|ment))?.*(?:expired|invalid|stale)|invalid ack_id/i.test(message);
}

export function ToGatewayError(error: unknown, operation: string): GcpGatewayError {
    if (error instanceof GcpGatewayError) {
        return error;
    }
    const code = ErrorCode(error);
    const grpc = GrpcStatusCode(error);
    const message = readString(error, 'message') ?? String(error);
    const httpStatus = readNumber(error, 'statusCode');
    const retryable = (grpc !== null && RETRYABLE_GRPC_CODES.has(grpc))
        || RETRYABLE_STRING_CODES.has(code)
        || (httpStatus !== null && (httpStatus === 429 || httpStatus >= 500));
    return new GcpGatewayError(`${operation} failed: ${message}`, code, retryable);
}
