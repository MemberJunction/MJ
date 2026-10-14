import { describe, it, expect } from 'vitest';
import {
    AbortableDelay,
    BuildCancellationErrorInfo,
    CreateCancellationError,
    DescribeCancellation,
    IsAbortError,
    IsCancellationErrorInfo,
    IsTimeoutAbort,
    ThrowIfAborted,
} from '../generic/cancellation';
import { ErrorAnalyzer } from '../generic/errorAnalyzer';

function aborted(reason?: unknown): AbortSignal {
    const controller = new AbortController();
    controller.abort(reason);
    return controller.signal;
}

describe('cancellation helpers', () => {
    it('IsAbortError recognizes abort errors by name and by class name, and nothing else', () => {
        class APIUserAbortError extends Error {}
        expect(IsAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
        expect(IsAbortError(new APIUserAbortError('Request was aborted.'))).toBe(true);
        expect(IsAbortError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(false);
        expect(IsAbortError(new Error('aborted'))).toBe(false);
        expect(IsAbortError('AbortError')).toBe(false);
        expect(IsAbortError(null)).toBe(false);
    });

    it('IsTimeoutAbort tells a timeout reason from a caller reason', () => {
        expect(IsTimeoutAbort(aborted(Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })))).toBe(true);
        expect(IsTimeoutAbort(aborted(new Error('Prompt "X" timed out after 30000ms')))).toBe(true);
        expect(IsTimeoutAbort(aborted('user stopped'))).toBe(false);
        expect(IsTimeoutAbort(aborted())).toBe(false);
        expect(IsTimeoutAbort(new AbortController().signal)).toBe(false);
    });

    it('BuildCancellationErrorInfo is Cancelled for a caller abort and a retriable NetworkError for a timeout', () => {
        expect(BuildCancellationErrorInfo({ signal: aborted('stop') })).toMatchObject({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false, providerErrorCode: 'request_cancelled' });
        expect(BuildCancellationErrorInfo({ signal: aborted(Object.assign(new Error('t'), { name: 'TimeoutError' })) })).toMatchObject({ errorType: 'NetworkError', severity: 'Retriable', canFailover: true, providerErrorCode: 'request_timeout' });
    });

    it('IsCancellationErrorInfo accepts the Cancelled type and the older request_cancelled shape', () => {
        expect(IsCancellationErrorInfo({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false })).toBe(true);
        expect(IsCancellationErrorInfo({ errorType: 'Unknown', severity: 'Fatal', canFailover: false, providerErrorCode: 'request_cancelled' })).toBe(true);
        expect(IsCancellationErrorInfo({ errorType: 'Unknown', severity: 'Transient', canFailover: true })).toBe(false);
        expect(IsCancellationErrorInfo(undefined)).toBe(false);
    });

    it('CreateCancellationError carries its classification, which ErrorAnalyzer honours', () => {
        const error = CreateCancellationError({ signal: aborted('stop') });
        expect(error.name).toBe('AbortError');
        expect(error.message).toBe('Request was cancelled: stop');
        expect(ErrorAnalyzer.AnalyzeError(error).errorType).toBe('Cancelled');
    });

    it('DescribeCancellation names the reason and says when it was a timeout', () => {
        expect(DescribeCancellation(aborted('stop'), 'Anthropic request')).toBe('Anthropic request was cancelled: stop');
        expect(DescribeCancellation(aborted())).toMatch(/^Request was cancelled/);
        expect(DescribeCancellation(undefined)).toBe('Request was cancelled');
        expect(DescribeCancellation(aborted(Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })))).toBe('Request timed out: signal timed out');
    });

    it('ThrowIfAborted throws only for an aborted signal', () => {
        expect(() => ThrowIfAborted(aborted('stop'))).toThrow('Request was cancelled: stop');
        expect(() => ThrowIfAborted(new AbortController().signal)).not.toThrow();
        expect(() => ThrowIfAborted(undefined)).not.toThrow();
    });

    it('AbortableDelay resolves after its time, and rejects as soon as the signal aborts', async () => {
        await expect(AbortableDelay(1)).resolves.toBeUndefined();
        const controller = new AbortController();
        const waiting = AbortableDelay(60_000, controller.signal);
        controller.abort('stop');
        await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
        await expect(AbortableDelay(1, aborted('already'))).rejects.toMatchObject({ name: 'AbortError' });
    });
});
