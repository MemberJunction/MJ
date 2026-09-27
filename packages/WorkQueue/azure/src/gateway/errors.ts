/** A failed Service Bus call. Retryable failures map to the TransportUnavailable publish error and to settle retries. */
export class AzureGatewayError extends Error {
    constructor(message: string, public readonly Code: string, public readonly Retryable: boolean) {
        super(message);
        this.name = 'AzureGatewayError';
    }
}

/** ServiceBusErrorCode values (and Node network codes) after which the same call can succeed. */
const RETRYABLE_CODES = new Set([
    'ServiceBusy', 'ServiceTimeout', 'ServiceCommunicationProblem', 'QuotaExceeded', 'GeneralError',
    'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'TimeoutError',
]);
const LOCK_LOST_CODES = new Set(['MessageLockLost', 'SessionLockLost', 'MessageNotFound']);
const NOT_FOUND_CODES = new Set(['MessagingEntityNotFound']);

function readString(source: unknown, key: string): string | null {
    if (typeof source !== 'object' || source === null) {
        return null;
    }
    const value: unknown = Reflect.get(source, key);
    return typeof value === 'string' ? value : null;
}

function readBoolean(source: unknown, key: string): boolean | null {
    if (typeof source !== 'object' || source === null) {
        return null;
    }
    const value: unknown = Reflect.get(source, key);
    return typeof value === 'boolean' ? value : null;
}

/** The ServiceBusError code, else the error name or Node code, 'Unknown' when none exists. */
export function ErrorCode(error: unknown): string {
    return readString(error, 'code') ?? readString(error, 'name') ?? 'Unknown';
}

export function IsAbortError(error: unknown): boolean {
    return ErrorCode(error) === 'AbortError' || readString(error, 'name') === 'AbortError';
}

/** The lock (or session lock) behind a settle or renewal is gone: another receiver owns the message now. */
export function IsLockLost(error: unknown): boolean {
    return LOCK_LOST_CODES.has(ErrorCode(error));
}

export function IsEntityNotFound(error: unknown): boolean {
    return NOT_FOUND_CODES.has(ErrorCode(error)) || readString(error, 'name') === 'RestError' && Reflect.get(error as object, 'statusCode') === 404;
}

export function ToGatewayError(error: unknown, operation: string): AzureGatewayError {
    if (error instanceof AzureGatewayError) {
        return error;
    }
    const code = ErrorCode(error);
    const message = readString(error, 'message') ?? String(error);
    // ServiceBusError carries its own verdict; GeneralError without one is treated as transient.
    const retryable = readBoolean(error, 'retryable') ?? RETRYABLE_CODES.has(code);
    return new AzureGatewayError(`${operation} failed: ${message}`, code, retryable);
}
