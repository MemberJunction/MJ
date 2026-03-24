/**
 * Unit tests for Slack webhook signature verification.
 *
 * Tests HMAC-SHA256 verification, replay attack protection,
 * and edge cases for malformed requests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { Request } from 'express';
import { verifySlackSignature } from '../slack/slack-routes.js';

const SIGNING_SECRET = 'test-signing-secret-12345';

/** Helper: create a properly signed mock request. */
function createSignedRequest(
    body: Record<string, unknown>,
    timestampOverride?: string
): Request {
    const timestamp = timestampOverride ?? Math.floor(Date.now() / 1000).toString();
    const rawBody = JSON.stringify(body);
    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const hmac = crypto.createHmac('sha256', SIGNING_SECRET).update(sigBasestring).digest('hex');
    const signature = `v0=${hmac}`;

    return {
        headers: {
            'x-slack-request-timestamp': timestamp,
            'x-slack-signature': signature,
        },
        body
    } as unknown as Request;
}

describe('verifySlackSignature', () => {
    let dateNowSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Fix time for deterministic tests
        dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000); // Nov 14, 2023
    });

    afterEach(() => {
        dateNowSpy.mockRestore();
    });

    describe('valid requests', () => {
        it('should accept a correctly signed request', () => {
            const timestamp = '1700000000'; // Matches Date.now mock
            const req = createSignedRequest({ type: 'event_callback', event: {} }, timestamp);
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(true);
        });

        it('should accept a request within the 5-minute window', () => {
            const timestamp = (1700000000 - 200).toString(); // 200 seconds ago
            const req = createSignedRequest({ type: 'event_callback' }, timestamp);
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(true);
        });
    });

    describe('replay attack protection', () => {
        it('should reject requests older than 5 minutes', () => {
            const timestamp = (1700000000 - 600).toString(); // 10 minutes ago
            const req = createSignedRequest({ type: 'event_callback' }, timestamp);
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });

        it('should reject requests with exactly 5 minutes + 1 second age', () => {
            const timestamp = (1700000000 - 301).toString(); // Just over 5 minutes
            const req = createSignedRequest({ type: 'event_callback' }, timestamp);
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });
    });

    describe('invalid signatures', () => {
        it('should reject a request with a wrong signature', () => {
            const timestamp = '1700000000';
            const req = {
                headers: {
                    'x-slack-request-timestamp': timestamp,
                    'x-slack-signature': 'v0=invalidhexvalue',
                },
                body: { type: 'event_callback' }
            } as unknown as Request;
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });

        it('should reject a request signed with a different secret', () => {
            const timestamp = '1700000000';
            const body = { type: 'event_callback' };
            const rawBody = JSON.stringify(body);
            const sigBasestring = `v0:${timestamp}:${rawBody}`;
            const hmac = crypto.createHmac('sha256', 'wrong-secret').update(sigBasestring).digest('hex');

            const req = {
                headers: {
                    'x-slack-request-timestamp': timestamp,
                    'x-slack-signature': `v0=${hmac}`,
                },
                body
            } as unknown as Request;

            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });
    });

    describe('missing headers', () => {
        it('should reject a request with no timestamp header', () => {
            const req = {
                headers: {
                    'x-slack-signature': 'v0=something',
                },
                body: {}
            } as unknown as Request;
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });

        it('should reject a request with no signature header', () => {
            const req = {
                headers: {
                    'x-slack-request-timestamp': '1700000000',
                },
                body: {}
            } as unknown as Request;
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });

        it('should reject a request with no headers at all', () => {
            const req = {
                headers: {},
                body: {}
            } as unknown as Request;
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });
    });

    describe('malformed timestamp', () => {
        it('should reject a request with a non-numeric timestamp', () => {
            const req = {
                headers: {
                    'x-slack-request-timestamp': 'not-a-number',
                    'x-slack-signature': 'v0=something',
                },
                body: {}
            } as unknown as Request;
            expect(verifySlackSignature(req, SIGNING_SECRET)).toBe(false);
        });
    });
});
