import { describe, it, expect, vi } from 'vitest';
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

    it('IsTimeoutAbort decides by the reason\'s type: a TimeoutError or a reason flagged IsTimeout', () => {
        expect(IsTimeoutAbort(aborted(Object.assign(new Error('signal timed out'), { name: 'TimeoutError' })))).toBe(true);
        expect(IsTimeoutAbort(aborted(Object.assign(new Error('Prompt "X" exceeded its TimeoutMS'), { IsTimeout: true })))).toBe(true);
        expect(IsTimeoutAbort(aborted('user stopped'))).toBe(false);
        expect(IsTimeoutAbort(aborted())).toBe(false);
        expect(IsTimeoutAbort(new AbortController().signal)).toBe(false);
    });

    describe('a caller reason that mentions a timeout is still the caller cancelling', () => {
        it.each([
            ['a string', 'Cancel the request; it timed out on my side'],
            ['an Error', new Error('The UI timed out; stop now')],
        ])('a caller abort whose reason is %s saying "timed out" is Cancelled: Fatal, never failed over', (_kind, reason) => {
            const signal = aborted(reason);

            expect(IsTimeoutAbort(signal)).toBe(false);
            expect(BuildCancellationErrorInfo({ signal })).toMatchObject({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false, providerErrorCode: 'request_cancelled' });
        });

        it('a genuine AbortSignal.timeout() is a retriable NetworkError', async () => {
            const deadline = AbortSignal.timeout(1);
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(deadline.aborted).toBe(true);
            expect(IsTimeoutAbort(deadline)).toBe(true);
            expect(BuildCancellationErrorInfo({ signal: deadline })).toMatchObject({ errorType: 'NetworkError', severity: 'Retriable', canFailover: true, providerErrorCode: 'request_timeout' });
        });

        it('a plain caller cancel is Cancelled', () => {
            expect(BuildCancellationErrorInfo({ signal: aborted('user stopped') })).toMatchObject({ errorType: 'Cancelled', canFailover: false });
        });
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

    it('AbortableDelay leaves no abort listener on a token reused across delays', async () => {
        const controller = new AbortController();
        const added = vi.spyOn(controller.signal, 'addEventListener');
        const removed = vi.spyOn(controller.signal, 'removeEventListener');

        for (let i = 0; i < 50; i++) {
            await AbortableDelay(0, controller.signal);
        }

        expect(added).toHaveBeenCalledTimes(50);
        expect(removed).toHaveBeenCalledTimes(50);
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
