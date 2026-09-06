/**
 * `Retry-After` parsing. RFC 9110 §10.2.3 defines exactly two forms — delay-seconds and HTTP-date —
 * and this reads both from wherever an HTTP client put the headers.
 *
 * The bound matters as much as the parsing. A vendor occasionally returns something unusable (a
 * Unix timestamp mistaken for delay-seconds, a date years out), and honouring it would freeze a
 * sync's token bucket for hours on the strength of one response. Anything past the cap is treated
 * as absent so the limiter's own multiplicative decrease applies instead — a worse number is worse
 * than no number.
 */
import { describe, it, expect } from 'vitest';
import {
    ParseRetryAfterValue,
    ExtractRetryAfterFromError,
    MAX_HONORED_RETRY_AFTER_MS,
} from '../RetryAfter';

const NOW = Date.parse('2026-08-17T12:00:00Z');

describe('ParseRetryAfterValue', () => {
    describe('delay-seconds', () => {
        it('converts whole seconds to milliseconds', () => {
            expect(ParseRetryAfterValue('30', NOW)).toBe(30_000);
            expect(ParseRetryAfterValue('1', NOW)).toBe(1_000);
        });

        it('tolerates surrounding whitespace', () => {
            expect(ParseRetryAfterValue('  15  ', NOW)).toBe(15_000);
        });

        it('rejects anything that is not a bare integer', () => {
            // Number() would coerce several of these into a plausible-looking value, which is
            // precisely the risk: a silently wrong delay is worse than no delay.
            for (const bad of ['1.5', '30s', 'soon', '-5', '1e3', '', '  ']) {
                expect(ParseRetryAfterValue(bad, NOW), `"${bad}" must not parse`).toBeUndefined();
            }
        });

        it('rejects zero — nothing to wait for is not a wait instruction', () => {
            expect(ParseRetryAfterValue('0', NOW)).toBeUndefined();
        });
    });

    describe('HTTP-date', () => {
        it('converts a future date to a delay', () => {
            expect(ParseRetryAfterValue('Mon, 17 Aug 2026 12:00:45 GMT', NOW)).toBe(45_000);
        });

        it('returns 0 for a date already past — "retry now", not a parse failure', () => {
            // Distinct from undefined: the vendor DID answer, and the answer was "go ahead".
            expect(ParseRetryAfterValue('Mon, 17 Aug 2026 11:59:00 GMT', NOW)).toBe(0);
        });

        it('rejects an unparseable date', () => {
            expect(ParseRetryAfterValue('next tuesday', NOW)).toBeUndefined();
        });

        it('accepts the obsolete forms RFC 9110 still requires recipients to read', () => {
            // RFC 850 and asctime. No server sends these for Retry-After in practice, but the
            // date-shape gate must not be the reason they fail.
            expect(ParseRetryAfterValue('Monday, 17-Aug-26 12:00:30 GMT', NOW)).toBe(30_000);
            expect(ParseRetryAfterValue('Mon Aug 17 12:00:30 2026', Date.parse('2026-08-17T12:00:00'))).toBe(30_000);
        });
    });

    describe('the sanity bound', () => {
        it('accepts a value at the cap', () => {
            expect(ParseRetryAfterValue(String(MAX_HONORED_RETRY_AFTER_MS / 1000), NOW)).toBe(MAX_HONORED_RETRY_AFTER_MS);
        });

        it('refuses a value past the cap rather than freezing the bucket', () => {
            expect(ParseRetryAfterValue(String(MAX_HONORED_RETRY_AFTER_MS / 1000 + 1), NOW)).toBeUndefined();
        });

        it('refuses a Unix timestamp sent as delay-seconds', () => {
            // A real vendor bug, and the reason the cap exists: honouring this would stall the
            // connection for ~55,000 years.
            expect(ParseRetryAfterValue('1786000000', NOW)).toBeUndefined();
        });

        it('refuses an absurd future date', () => {
            expect(ParseRetryAfterValue('Fri, 17 Aug 2035 12:00:00 GMT', NOW)).toBeUndefined();
        });
    });

    it('returns undefined for a missing value', () => {
        expect(ParseRetryAfterValue(undefined, NOW)).toBeUndefined();
    });
});

describe('ExtractRetryAfterFromError', () => {
    it('reads headers hung directly off the error', () => {
        const err = Object.assign(new Error('429'), { headers: { 'retry-after': '12' } });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(12_000);
    });

    it('reads an axios-style error.response.headers', () => {
        const err = Object.assign(new Error('Request failed with status code 429'), {
            response: { status: 429, headers: { 'retry-after': '20' } },
        });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(20_000);
    });

    it('reads a fetch Headers instance via its case-insensitive get()', () => {
        const headers = new Headers({ 'Retry-After': '7' });
        const err = Object.assign(new Error('429'), { response: { status: 429, headers } });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(7_000);
    });

    it('matches the header name case-insensitively on a plain object', () => {
        const err = Object.assign(new Error('429'), { headers: { 'Retry-After': '9' } });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(9_000);
    });

    it('takes the first value when a client hands back a repeated header as an array', () => {
        const err = Object.assign(new Error('429'), { headers: { 'retry-after': ['11', '99'] } });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(11_000);
    });

    it('accepts a numeric header value', () => {
        const err = Object.assign(new Error('429'), { headers: { 'retry-after': 5 } });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(5_000);
    });

    it('looks one level into error.cause, where a wrapper keeps the original', () => {
        const inner = Object.assign(new Error('429'), { response: { headers: { 'retry-after': '3' } } });
        const err = Object.assign(new Error('fetch failed'), { cause: inner });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(3_000);
    });

    it('skips a header container that carries an unusable value and keeps looking', () => {
        const err = Object.assign(new Error('429'), {
            headers: { 'retry-after': 'whenever' },
            response: { headers: { 'retry-after': '8' } },
        });
        expect(ExtractRetryAfterFromError(err, NOW)).toBe(8_000);
    });

    it('returns undefined when nothing carries the header', () => {
        expect(ExtractRetryAfterFromError(new Error('429 too many requests'), NOW)).toBeUndefined();
        expect(ExtractRetryAfterFromError(Object.assign(new Error('x'), { response: { status: 500 } }), NOW)).toBeUndefined();
    });

    it('returns undefined for non-object throws rather than guessing', () => {
        expect(ExtractRetryAfterFromError('429', NOW)).toBeUndefined();
        expect(ExtractRetryAfterFromError(null, NOW)).toBeUndefined();
        expect(ExtractRetryAfterFromError(undefined, NOW)).toBeUndefined();
    });
});
