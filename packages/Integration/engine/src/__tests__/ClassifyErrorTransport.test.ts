import { describe, it, expect } from 'vitest';
import { ClassifyError, IsRetryableError } from '../types.js';

/**
 * `fetch` (undici) reports every transport failure as the bare message `fetch failed` and puts
 * the real reason in `error.cause`. Classifying on the top-level message alone matched no
 * pattern, fell through to UNKNOWN_ERROR/Critical, and was therefore NOT retryable — so a
 * routine network blip ended an object's fetch loop and the sync stopped early while reporting
 * success on a partial pull. Measured on a long-running production sync: every 30-60 minutes.
 */
describe('ClassifyError — transport failures are retryable', () => {
    const undiciError = (code: string, causeMessage = '') => {
        const cause = new Error(causeMessage || code) as Error & { code?: string };
        cause.code = code;
        const err = new Error('fetch failed') as Error & { cause?: unknown };
        err.cause = cause;
        return err;
    };

    it('the bare `fetch failed` wrapper is retryable even with no cause attached', () => {
        const { Code, Severity } = ClassifyError(new Error('fetch failed'));
        expect(Code).toBe('NETWORK_TIMEOUT');
        expect(Severity).toBe('Warning');
        expect(IsRetryableError(Code)).toBe(true);
    });

    it.each([
        ['ECONNRESET', ''],
        ['ENOTFOUND', ''],
        ['EAI_AGAIN', ''],
        ['EPIPE', ''],
        ['ETIMEDOUT', ''],
        ['UND_ERR_SOCKET', 'other side closed'],
        ['UND_ERR_CONNECT_TIMEOUT', ''],
    ])('reads the cause chain: %s under `fetch failed` is retryable', (code, msg) => {
        const { Code } = ClassifyError(undiciError(code, msg));
        expect(Code).toBe('NETWORK_TIMEOUT');
        expect(IsRetryableError(Code)).toBe(true);
    });

    it('classifies `socket hang up` and undici stream `terminated`', () => {
        expect(ClassifyError(new Error('socket hang up')).Code).toBe('NETWORK_TIMEOUT');
        expect(ClassifyError(new Error('terminated')).Code).toBe('NETWORK_TIMEOUT');
    });

    it('a transport failure is not shadowed by a keyword deeper in the cause chain', () => {
        // The nested text mentions "validation", which would otherwise classify as a
        // deterministic VALIDATION_ERROR and stop the retry — but the request never reached a
        // server verdict, so the transport reading must win.
        const cause = new Error('while posting validation payload') as Error & { code?: string };
        cause.code = 'ECONNRESET';
        const err = new Error('fetch failed') as Error & { cause?: unknown };
        err.cause = cause;
        expect(ClassifyError(err).Code).toBe('NETWORK_TIMEOUT');
    });

    it('still classifies genuinely deterministic errors as before — no over-broadening', () => {
        expect(ClassifyError(new Error('Violation of UNIQUE constraint on primary key')).Code).toBe('DUPLICATE_KEY');
        expect(ClassifyError(new Error('FK_Contact_Account reference constraint failed')).Code).toBe('FK_CONSTRAINT_VIOLATION');
        expect(ClassifyError(new Error('no rows returned from spCreateContact read-back')).Code).toBe('WRITE_VERIFICATION_ERROR');
        expect(IsRetryableError(ClassifyError(new Error('some unmapped condition')).Code)).toBe(false);
    });

    it('handles non-Error inputs and cyclic cause chains without hanging', () => {
        expect(ClassifyError('fetch failed').Code).toBe('NETWORK_TIMEOUT');
        const a = new Error('outer') as Error & { cause?: unknown };
        const b = new Error('inner') as Error & { cause?: unknown };
        a.cause = b; b.cause = a; // cycle: the walk is depth-capped, so this must return
        expect(() => ClassifyError(a)).not.toThrow();
    });
});
