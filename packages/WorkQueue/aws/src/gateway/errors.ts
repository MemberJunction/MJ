/** A failed AWS call. Retryable failures map to the TransportUnavailable publish error and to settle retries. */
export class AwsGatewayError extends Error {
    constructor(message: string, public readonly Code: string, public readonly Retryable: boolean) {
        super(message);
        this.name = 'AwsGatewayError';
    }
}

const RETRYABLE_CODES = new Set([
    'Throttling', 'ThrottlingException', 'ThrottledException', 'RequestThrottled', 'RequestThrottledException',
    'TooManyRequestsException', 'KMSThrottlingException', 'ServiceUnavailable', 'InternalError', 'InternalFailure',
    'RequestTimeout', 'RequestTimeoutException', 'TimeoutError', 'NetworkingError', 'ECONNRESET', 'ETIMEDOUT',
]);

function readString(source: unknown, key: string): string | null {
    if (typeof source !== 'object' || source === null) {
        return null;
    }
    const value: unknown = Reflect.get(source, key);
    return typeof value === 'string' ? value : null;
}

/** The SDK error name (or Node error code), 'Unknown' when neither exists. */
export function ErrorCode(error: unknown): string {
    return readString(error, 'name') ?? readString(error, 'code') ?? 'Unknown';
}

export function IsAbortError(error: unknown): boolean {
    return ErrorCode(error) === 'AbortError';
}

export function ToGatewayError(error: unknown, operation: string): AwsGatewayError {
    if (error instanceof AwsGatewayError) {
        return error;
    }
    const code = ErrorCode(error);
    const message = readString(error, 'message') ?? String(error);
    const retryable = RETRYABLE_CODES.has(code) || readString(error, '$fault') === 'server';
    return new AwsGatewayError(`${operation} failed: ${message}`, code, retryable);
}
