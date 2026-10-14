import { AIErrorInfo } from './errorTypes.js';

/**
 * The `providerErrorCode` a cancelled request carries. `errorType: 'Cancelled'` is the classification
 * to test; the code is kept so callers that read it before the type existed still recognize one.
 */
export const REQUEST_CANCELLED_CODE = 'request_cancelled';

/** The `providerErrorCode` of a request ended by a timeout composed into its abort signal. */
export const REQUEST_TIMEOUT_CODE = 'request_timeout';

/**
 * The error names SDKs and `fetch` give an aborted request: the DOM `AbortError`, the Stainless SDKs'
 * `APIUserAbortError` (OpenAI, Anthropic, Groq, Cerebras), and Mistral's `RequestAbortedError`.
 * `TimeoutError` is deliberately absent: `AbortSignal.timeout()` is a timeout, which is retriable.
 */
const ABORT_ERROR_NAMES: ReadonlySet<string> = new Set(['AbortError', 'APIUserAbortError', 'RequestAbortedError']);

/** A value with the fields an error is recognized by, without assuming it is an `Error`. */
interface ErrorLike {
    name?: unknown;
    message?: unknown;
    constructor?: { name?: unknown };
}

function asErrorLike(value: unknown): ErrorLike | undefined {
    return value !== null && typeof value === 'object' ? value as ErrorLike : undefined;
}

/**
 * Whether an error is the abort of a request, by its name or its class name. A driver whose SDK raises
 * some other class for an abort recognizes it itself (see `BaseLLM.IsProviderAbortError`).
 */
export function IsAbortError(error: unknown): boolean {
    const e = asErrorLike(error);
    if (!e) {
        return false;
    }
    const name = typeof e.name === 'string' ? e.name : '';
    const className = typeof e.constructor?.name === 'string' ? e.constructor.name : '';
    return ABORT_ERROR_NAMES.has(name) || ABORT_ERROR_NAMES.has(className);
}

/**
 * Whether an aborted signal was aborted by a timeout rather than by its caller: its reason is a
 * `TimeoutError` (what `AbortSignal.timeout()` raises), or an error or string that says it timed out
 * (what a runner composing its own timeout into the signal raises).
 */
export function IsTimeoutAbort(signal: AbortSignal | null | undefined): boolean {
    if (!signal?.aborted) {
        return false;
    }
    const reason: unknown = signal.reason;
    const e = asErrorLike(reason);
    if (e && e.name === 'TimeoutError') {
        return true;
    }
    const text = typeof reason === 'string' ? reason : typeof e?.message === 'string' ? e.message : '';
    return /\btime(?:d)?\s?out\b/i.test(text);
}

/**
 * Whether a request ended because it was aborted: its signal is aborted, or the error is an abort.
 * Whether that abort was a cancellation or a timeout is {@link BuildCancellationErrorInfo}'s concern.
 */
export function IsRequestAborted(error: unknown, signal?: AbortSignal | null): boolean {
    return signal?.aborted === true || IsAbortError(error);
}

/**
 * The classification of an aborted request. A caller cancellation is `Cancelled`: Fatal, and never
 * failed over, since retrying or switching vendors would defeat it. An abort caused by a timeout is a
 * `NetworkError`: Retriable and eligible for failover, as any other timeout is.
 *
 * @param options.error The error the abort raised, if any.
 * @param options.signal The request's abort signal, read for why it was aborted.
 * @param options.provider The driver or provider name, for the error's context.
 */
export function BuildCancellationErrorInfo(options: { error?: unknown; signal?: AbortSignal | null; provider?: string } = {}): AIErrorInfo {
    const timedOut = IsTimeoutAbort(options.signal);
    const reason: unknown = options.signal?.aborted ? options.signal.reason : undefined;
    return {
        error: options.error,
        errorType: timedOut ? 'NetworkError' : 'Cancelled',
        severity: timedOut ? 'Retriable' : 'Fatal',
        canFailover: timedOut,
        providerErrorCode: timedOut ? REQUEST_TIMEOUT_CODE : REQUEST_CANCELLED_CODE,
        context: {
            provider: options.provider,
            cancelled: !timedOut,
            reason: typeof reason === 'string' ? reason : asErrorLike(reason)?.message,
        },
    };
}

/**
 * Whether an error classification says the caller cancelled the request: `errorType: 'Cancelled'`, or
 * the older shape drivers built before the type existed (not eligible for failover, with the
 * `request_cancelled` code).
 */
export function IsCancellationErrorInfo(errorInfo: Partial<AIErrorInfo> | null | undefined): boolean {
    if (!errorInfo) {
        return false;
    }
    return errorInfo.errorType === 'Cancelled'
        || (errorInfo.canFailover === false && errorInfo.providerErrorCode === REQUEST_CANCELLED_CODE);
}

/**
 * A message for an aborted request, naming the signal's reason when it has one.
 *
 * @param subject What was aborted, e.g. `'Request'` or `'Anthropic request'`.
 */
export function DescribeCancellation(signal?: AbortSignal | null, subject = 'Request'): string {
    const verb = IsTimeoutAbort(signal) ? 'timed out' : 'was cancelled';
    const reason: unknown = signal?.aborted ? signal.reason : undefined;
    const detail = typeof reason === 'string' ? reason : asErrorLike(reason)?.message;
    return typeof detail === 'string' && detail.length > 0 ? `${subject} ${verb}: ${detail}` : `${subject} ${verb}`;
}

/**
 * An error for an aborted request, carrying its classification on `errorInfo` so `ErrorAnalyzer` and
 * the failover loop honour it. Named `AbortError`, as `fetch` names one.
 */
export function CreateCancellationError(options: { signal?: AbortSignal | null; message?: string; provider?: string } = {}): Error & { errorInfo: AIErrorInfo } {
    const error = new Error(options.message ?? DescribeCancellation(options.signal)) as Error & { errorInfo: AIErrorInfo };
    error.name = 'AbortError';
    error.errorInfo = BuildCancellationErrorInfo({ error, signal: options.signal, provider: options.provider });
    return error;
}

/** Throws a cancellation error when the signal is already aborted, so no request is opened. */
export function ThrowIfAborted(signal: AbortSignal | null | undefined, provider?: string): void {
    if (signal?.aborted) {
        throw CreateCancellationError({ signal, provider });
    }
}

/**
 * Waits `ms` milliseconds, rejecting with a cancellation error as soon as the signal aborts. For retry
 * backoff and polling loops, which must not keep a cancelled request alive while they sleep.
 */
export function AbortableDelay(ms: number, signal?: AbortSignal | null): Promise<void> {
    if (signal?.aborted) {
        return Promise.reject(CreateCancellationError({ signal }));
    }
    return new Promise<void>((resolve, reject) => {
        const onAbort = (): void => {
            clearTimeout(timer);
            reject(CreateCancellationError({ signal }));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
