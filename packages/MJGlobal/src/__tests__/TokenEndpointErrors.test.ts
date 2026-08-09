import { describe, it, expect } from 'vitest';
import { describeTokenEndpointFailure } from '../TokenEndpointErrors';

/** Credentials a token endpoint could echo back in an error body. */
const ACCESS_TOKEN = 'ya29.LIVE-ACCESS-TOKEN';
const CLIENT_SECRET = 'cs-LIVE-CLIENT-SECRET';
const REFRESH_TOKEN = 'rt-LIVE-REFRESH-TOKEN';

describe('describeTokenEndpointFailure', () => {
    describe('withholds credentials the body may carry', () => {
        it('withholds a body that is a bare token response', () => {
            // Reached when a caller guards `!response.ok || !parsed.access_token` and the
            // token was nested somewhere the parser did not look — the body IS the token.
            const out = describeTokenEndpointFailure(JSON.stringify({ data: { access_token: ACCESS_TOKEN } }));
            expect(out).not.toContain(ACCESS_TOKEN);
            expect(out).toBe(' — response body withheld (may contain credentials)');
        });

        it('withholds an echoed request carrying client_secret', () => {
            // The common real-world case: the endpoint echoes the failing request.
            const out = describeTokenEndpointFailure(
                JSON.stringify({ request: { client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN } }),
            );
            expect(out).not.toContain(CLIENT_SECRET);
            expect(out).not.toContain(REFRESH_TOKEN);
        });

        it('withholds a body that is not JSON at all', () => {
            const out = describeTokenEndpointFailure(`<html>error: token=${ACCESS_TOKEN}</html>`);
            expect(out).not.toContain(ACCESS_TOKEN);
            expect(out).toBe(' — response body withheld (may contain credentials)');
        });

        it('withholds a JSON body carrying only non-standard fields', () => {
            const out = describeTokenEndpointFailure(JSON.stringify({ detail: ACCESS_TOKEN }));
            expect(out).not.toContain(ACCESS_TOKEN);
        });
    });

    describe('surfaces the RFC 6749 §5.2 fields, which carry no credentials', () => {
        it('returns both error and error_description when present', () => {
            const out = describeTokenEndpointFailure(
                JSON.stringify({ error: 'invalid_client', error_description: 'Client authentication failed' }),
            );
            expect(out).toBe(' — invalid_client: Client authentication failed');
        });

        it('returns error alone when there is no description', () => {
            expect(describeTokenEndpointFailure(JSON.stringify({ error: 'invalid_grant' })))
                .toBe(' — invalid_grant');
        });

        it('returns the description alone when there is no code', () => {
            expect(describeTokenEndpointFailure(JSON.stringify({ error_description: 'Token expired' })))
                .toBe(' — Token expired');
        });

        it('ignores the rest of the body while surfacing the safe fields', () => {
            const out = describeTokenEndpointFailure(
                JSON.stringify({ error: 'invalid_grant', access_token: ACCESS_TOKEN }),
            );
            expect(out).toBe(' — invalid_grant');
            expect(out).not.toContain(ACCESS_TOKEN);
        });
    });

    describe('is defensive about hostile or absent input', () => {
        it('returns empty string for an absent body', () => {
            expect(describeTokenEndpointFailure(undefined)).toBe('');
            expect(describeTokenEndpointFailure(null)).toBe('');
            expect(describeTokenEndpointFailure('')).toBe('');
        });

        it('caps an over-long description so a hostile endpoint cannot flood the log', () => {
            const out = describeTokenEndpointFailure(
                JSON.stringify({ error_description: 'x'.repeat(5000) }),
            );
            expect(out.length).toBeLessThan(300);
            expect(out.endsWith('…')).toBe(true);
        });

        it('withholds when the JSON body is not an object', () => {
            expect(describeTokenEndpointFailure(JSON.stringify(ACCESS_TOKEN))).not.toContain(ACCESS_TOKEN);
            expect(describeTokenEndpointFailure('null')).toBe(' — response body withheld (may contain credentials)');
        });

        it('ignores non-string error fields rather than coercing them', () => {
            expect(describeTokenEndpointFailure(JSON.stringify({ error: { nested: ACCESS_TOKEN } })))
                .not.toContain(ACCESS_TOKEN);
        });
    });
});
