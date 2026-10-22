import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('../../config.js', () => ({
    configInfo: { realtime: { identityVerification: { rateLimits: { redeemWindowMs: 60_000, redeemPerIp: 5 } } } },
}));
// The router only needs the service's RedeemLink; keep the heavy service module out of this test.
vi.mock('../../realtimeSessions/RealtimeSessionVerificationService.js', () => ({ RealtimeSessionVerificationService: { Instance: {} } }));

import { CreateRealtimeVerifyRouter, REALTIME_VERIFY_MOUNT_PATH } from '../../realtimeSessions/RealtimeVerifyRouter.js';
import type { VerificationOperationResult } from '../../realtimeSessions/verificationWorkflow.js';

const TOKEN = `mj_rv_${'a'.repeat(32)}_${'b'.repeat(64)}`;

describe('RealtimeVerifyRouter', () => {
    let server: Server;
    let base: string;
    const redeemLink = vi.fn<(token: string, clientIp?: string) => Promise<VerificationOperationResult>>();

    beforeEach(async () => {
        redeemLink.mockReset();
        const app = express();
        app.use(REALTIME_VERIFY_MOUNT_PATH, CreateRealtimeVerifyRouter({ RedeemLink: redeemLink }));
        await new Promise<void>((resolve) => {
            server = app.listen(0, '127.0.0.1', resolve);
        });
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${REALTIME_VERIFY_MOUNT_PATH}`;
    });

    afterEach(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    const post = (token: string) =>
        fetch(base, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() });

    describe('GET /:token', () => {
        it('renders the confirmation page and NEVER redeems (mail scanners GET every link)', async () => {
            const res = await fetch(`${base}/${TOKEN}`);
            expect(res.status).toBe(200);
            const html = await res.text();
            expect(html).toContain('Confirm your email address');
            expect(html).toContain(`name="token" value="${TOKEN}"`);
            expect(redeemLink).not.toHaveBeenCalled();
        });

        it('does the same for a garbage token — the page cannot tell a real link from a fake one', async () => {
            const real = await (await fetch(`${base}/${TOKEN}`)).text();
            const fake = await (await fetch(`${base}/not-a-token`)).text();
            expect(fake.replace('not-a-token', TOKEN)).toBe(real);
            expect(redeemLink).not.toHaveBeenCalled();
        });

        it('escapes a hostile token', async () => {
            const res = await fetch(`${base}/${encodeURIComponent('"><script>alert(1)</script>')}`);
            expect(await res.text()).not.toContain('<script>');
        });

        it('sends the hardening headers on every response', async () => {
            const res = await fetch(`${base}/${TOKEN}`);
            expect(res.headers.get('cache-control')).toBe('no-store');
            expect(res.headers.get('referrer-policy')).toBe('no-referrer');
            expect(res.headers.get('x-frame-options')).toBe('DENY');
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
            expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
            expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
            expect(res.headers.get('content-type')).toContain('text/html');
        });
    });

    describe('POST /', () => {
        it('redeems the token from the form body and renders the success page', async () => {
            redeemLink.mockResolvedValue({ Success: true, VerificationState: 'verified' });
            const res = await post(TOKEN);
            expect(res.status).toBe(200);
            expect(await res.text()).toContain("You're verified");
            expect(redeemLink).toHaveBeenCalledWith(TOKEN, expect.any(String));
        });

        it('renders ONE uniform 410 page for every refusal — the response reveals nothing about any session', async () => {
            const bodies: string[] = [];
            for (const code of ['invalid_link', 'verification_unavailable', 'session_not_found'] as const) {
                redeemLink.mockResolvedValueOnce({ Success: false, VerificationState: 'unverified', ErrorCode: code });
                const res = await post(TOKEN);
                expect(res.status).toBe(410);
                bodies.push(await res.text());
            }
            expect(new Set(bodies).size).toBe(1);
            expect(bodies[0]).toContain('no longer valid');
        });

        it('says "try again" (500) when a valid link could not be recorded', async () => {
            redeemLink.mockResolvedValue({ Success: false, VerificationState: 'unverified', ErrorCode: 'persist_failed' });
            const res = await post(TOKEN);
            expect(res.status).toBe(500);
            expect(await res.text()).toContain('open the link from your email again');
        });

        it('survives the service throwing', async () => {
            redeemLink.mockRejectedValue(new Error('db down'));
            const res = await post(TOKEN);
            expect(res.status).toBe(500);
            expect(await res.text()).not.toContain('db down');
        });

        it('passes an empty token through rather than inventing one, and ignores a query-string token', async () => {
            redeemLink.mockResolvedValue({ Success: false, VerificationState: 'unverified', ErrorCode: 'invalid_link' });
            await fetch(`${base}?token=${TOKEN}`, { method: 'POST' });
            expect(redeemLink).toHaveBeenCalledWith('', expect.any(String));
        });

        it('rejects an oversized body', async () => {
            const res = await post('x'.repeat(10_000));
            expect(res.status).toBeGreaterThanOrEqual(400);
            expect(redeemLink).not.toHaveBeenCalled();
        });
    });

    it('throttles per IP and answers with the failure page', async () => {
        redeemLink.mockResolvedValue({ Success: true, VerificationState: 'verified' });
        const statuses: number[] = [];
        for (let i = 0; i < 7; i++) {
            statuses.push((await post(TOKEN)).status);
        }
        expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
        expect(statuses.slice(5)).toEqual([429, 429]);
        expect(redeemLink).toHaveBeenCalledTimes(5);
    });
});
