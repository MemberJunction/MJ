/** A failed Azure Service Bus call. Retryable failures map to TransportUnavailable and settle retries. */
export class AzureGatewayError extends Error {
    constructor(message: string, public readonly Code: string, public readonly Retryable: boolean) {
        super(message);
        this.name = 'AzureGatewayError';
    }
}

const RETRYABLE_CODES = new Set([
    'ServiceBusy',
    'ServiceTimeout',
    'ServiceCommunicationProblem',
    'GeneralError',
    'ServerBusyError',
    'ServiceError',
    'TimeoutError',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ENOTFOUND',
]);

const NOT_FOUND_CODES = new Set([
    'MessagingEntityNotFound',
    'MessageEntityNotFoundError',
    'MessagingEntityNotFoundError',
    'MessageNotFound',
]);

const STALE_LOCK_CODES = new Set([
    'MessageLockLost',
    'SessionLockLost',
    'MessageNotFound',
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

function readBoolean(source: unknown, key: string): boolean | null {
    if (typeof source !== 'object' || source === null) {
        return null;
    }
    const value: unknown = Reflect.get(source, key);
    return typeof value === 'boolean' ? value : null;
}

/** The SDK error code or name (or Node error code), 'Unknown' when neither exists. */
export function ErrorCode(error: unknown): string {
    return readString(error, 'code') ?? readString(error, 'name') ?? 'Unknown';
}

export function IsAbortError(error: unknown): boolean {
    const code = ErrorCode(error);
    return code === 'AbortError' || readString(error, 'name') === 'AbortError';
}

export function IsNotFoundError(error: unknown): boolean {
    const code = ErrorCode(error);
    if (NOT_FOUND_CODES.has(code) || NOT_FOUND_CODES.has(readString(error, 'name') ?? '')) {
        return true;
    }
    return readNumber(error, 'statusCode') === 404;
}

export function IsStaleLockError(error: unknown): boolean {
    const code = ErrorCode(error);
    if (STALE_LOCK_CODES.has(code) || STALE_LOCK_CODES.has(readString(error, 'name') ?? '')) {
        return true;
    }
    const message = readString(error, 'message') ?? '';
    return /lock (?:token|lost|expired)|already settled/i.test(message);
}

export function ToGatewayError(error: unknown, operation: string): AzureGatewayError {
    if (error instanceof AzureGatewayError) {
        return error;
    }
    const code = ErrorCode(error);
    const message = readString(error, 'message') ?? String(error);
    const status = readNumber(error, 'statusCode');
    const retryableFlag = readBoolean(error, 'retryable');
    const retryable = retryableFlag === true || RETRYABLE_CODES.has(code) || (status !== null && (status === 429 || status >= 500));
    return new AzureGatewayError(`${operation} failed: ${message}`, code, retryable);
}
