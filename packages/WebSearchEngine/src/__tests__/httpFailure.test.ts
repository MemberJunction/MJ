/**
 * @fileoverview Failure classification — the decision that drives engine failover.
 *
 * The rule under test: `permanent` means *this query is rejected everywhere*, so the engine stops
 * rather than paying every remaining vendor to say the same thing. Anything specific to one vendor
 * — including a rejected credential — is `transient`, so the engine moves on.
 *
 * Status alone cannot make that call. Google Custom Search answers an invalid key with **HTTP 400**
 * (`reason: keyInvalid`) while Perplexity and Exa answer with 401, so a status-only rule sent a
 * dead Google key down the "stop everything" path and a dead Perplexity key down the correct one.
 */
import { describe, expect, it } from 'vitest';
import { HttpError } from '@memberjunction/network-utils';
import { classifyHttpFailure } from '../providers/httpFailure';

/**
 * Build a real {@link HttpError} — `IsHttpError` narrows with `instanceof`, so a structural
 * look-alike silently falls through to the "never reached the vendor" branch and every assertion
 * about status handling passes for the wrong reason.
 */
function httpError(status: number, data: unknown, message = 'request failed'): HttpError {
    return new HttpError(message, {
        Status: status,
        Data: data,
        Url: 'https://vendor.example/search',
        Method: 'POST',
    });
}

describe('classifyHttpFailure', () => {
    describe('a 400 that is really an auth failure', () => {
        it("treats Google's keyInvalid 400 as transient so the engine fails over", () => {
            // The shape Google actually returns, verbatim in structure.
            const result = classifyHttpFailure(
                httpError(400, {
                    error: {
                        code: 400,
                        message: 'API key not valid. Please pass a valid API key.',
                        errors: [{ message: 'API key not valid.', reason: 'keyInvalid', domain: 'global' }],
                        status: 'INVALID_ARGUMENT',
                    },
                }),
                'Google Custom Search',
            );

            expect(result.FailureKind).toBe('transient');
            expect(result.ErrorMessage).toContain('rejected the API key');
            expect(result.ErrorMessage).toContain('HTTP 400');
        });

        it('finds the verdict in a machine-readable reason the detail extractor never reaches', () => {
            // `message` here says nothing about credentials; only `reason` does.
            const result = classifyHttpFailure(
                httpError(400, {
                    error: {
                        message: 'Request contains an invalid argument.',
                        errors: [{ reason: 'keyExpired' }],
                    },
                }),
                'Google Custom Search',
            );

            expect(result.FailureKind).toBe('transient');
        });

        it('classifies a string body too', () => {
            const result = classifyHttpFailure(httpError(400, 'Invalid API key'), 'Some Vendor');
            expect(result.FailureKind).toBe('transient');
        });
    });

    describe('a 400 that is really a bad request', () => {
        it('stays permanent so the engine stops instead of paying every vendor', () => {
            const result = classifyHttpFailure(
                httpError(400, { error: { message: 'query too long: 8000 characters exceeds limit' } }),
                'Some Vendor',
            );

            expect(result.FailureKind).toBe('permanent');
            expect(result.ErrorMessage).toContain('rejected the request');
        });

        it('does not fire on a query that merely mentions the words', () => {
            // A search FOR the phrase must not be mistaken for a verdict ABOUT the key.
            const result = classifyHttpFailure(
                httpError(400, { error: { message: "unsupported operator in query: 'api key rotation'" } }),
                'Some Vendor',
            );

            expect(result.FailureKind).toBe('permanent');
        });

        it('treats 422 the same way', () => {
            const result = classifyHttpFailure(
                httpError(422, { detail: 'max_results must be between 1 and 20' }),
                'Perplexity',
            );

            expect(result.FailureKind).toBe('permanent');
        });
    });

    describe('the statuses that were already unambiguous', () => {
        it('401 is transient', () => {
            const result = classifyHttpFailure(httpError(401, { error: 'Invalid API key' }), 'Perplexity');
            expect(result.FailureKind).toBe('transient');
            expect(result.ErrorMessage).toContain('rejected the API key');
        });

        it('403 is transient', () => {
            expect(classifyHttpFailure(httpError(403, {}), 'Exa').FailureKind).toBe('transient');
        });

        it('429 is transient and names the quota', () => {
            const result = classifyHttpFailure(httpError(429, { message: 'rate limit exceeded' }), 'Brave');
            expect(result.FailureKind).toBe('transient');
            expect(result.ErrorMessage).toContain('rate limit or quota');
        });

        it('5xx is transient', () => {
            expect(classifyHttpFailure(httpError(503, {}), 'Tavily').FailureKind).toBe('transient');
        });
    });

    describe('errors that never reached the vendor', () => {
        it('treats a non-HTTP error as transient', () => {
            const result = classifyHttpFailure(new Error('socket hang up'), 'Brave');
            expect(result.FailureKind).toBe('transient');
            expect(result.ErrorMessage).toContain('socket hang up');
        });

        it('survives an unserialisable body rather than throwing', () => {
            const circular: Record<string, unknown> = {};
            circular.self = circular;
            const result = classifyHttpFailure(httpError(400, circular, 'bad request'), 'Some Vendor');
            expect(result.FailureKind).toBe('permanent');
        });
    });

    it('never reports a classified failure as a success', () => {
        for (const status of [400, 401, 403, 422, 429, 500]) {
            const result = classifyHttpFailure(httpError(status, {}), 'Vendor');
            expect(result.Success).toBe(false);
            expect(result.Hits).toEqual([]);
        }
    });
});
