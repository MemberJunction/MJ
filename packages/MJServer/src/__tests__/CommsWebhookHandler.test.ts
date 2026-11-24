/**
 * Unit tests for CommsWebhookHandler public routes:
 * - POST /comms/webhooks/sendgrid/:credentialId & /comms/webhooks/sendgrid (raw-body ECDSA + 10-min replay)
 * - POST /comms/unsubscribe (UUIDv4 validation + durable await before 200)
 * - GET /comms/open/:token.gif (43-byte 1x1 GIF + no-store + Opened event)
 * - GET /comms/click/:token (HMAC open-redirect guard + 302 + Clicked event)
 * - Per-IP rate limiting
 */
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CreateCommsWebhookHandler,
    SignClickTrackingUrl,
    TRANSPARENT_GIF_1X1,
    type CommsActivityWorkPayload,
    type CommsWebhookHandlerOptions,
    type PreferenceCenterData,
} from '../rest/CommsWebhookHandler.js';
import { ComputeTrackingSignature } from '@memberjunction/communication-engine';

async function withServer(
    options: CommsWebhookHandlerOptions,
    fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
    const app = express();
    // These tests stand in for a host with its own storage, so they supply its token check too:
    // overriding PublishActivity alone no longer turns token verification off.
    app.use('/comms', CreateCommsWebhookHandler({ VerifyToken: async () => true, ...options }));
    const server = app.listen(0, '127.0.0.1');
    try {
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        const { port } = server.address() as AddressInfo;
        await fn(`http://127.0.0.1:${port}/comms`);
    } finally {
        server.close();
    }
}

describe('CommsWebhookHandler', () => {
    let publicKeyPem: string;
    let privateKeyPem: string;
    let published: CommsActivityWorkPayload[];

    beforeEach(() => {
        published = [];
        const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
        privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    });

    function signSendGridBody(rawBody: string, tsSec: number): { signature: string; timestamp: string } {
        const timestamp = String(tsSec);
        const signer = crypto.createSign('SHA256');
        signer.update(timestamp);
        signer.update(rawBody);
        signer.end();
        return { signature: signer.sign(privateKeyPem, 'base64'), timestamp };
    }

    it('POST /webhooks/sendgrid/:credentialId verifies raw-body ECDSA, publishes 1 batch message, returns 202', async () => {
        const nowSec = 1_700_000_000;
        const rawBody = JSON.stringify([{ event: 'delivered', email: 'a@b.com', sg_event_id: 'e1' }]);
        const { signature, timestamp } = signSendGridBody(rawBody, nowSec);
        const resolveKey = vi.fn().mockResolvedValue(publicKeyPem);

        await withServer(
            {
                ResolveWebhookKey: resolveKey,
                PublishActivity: async (p) => { published.push(p); },
                NowSeconds: () => nowSec,
            },
            async (baseUrl) => {
                const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-123`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-twilio-email-event-webhook-signature': signature,
                        'x-twilio-email-event-webhook-timestamp': timestamp,
                    },
                    body: rawBody,
                });

                expect(res.status).toBe(202);
                expect(resolveKey).toHaveBeenCalledWith('cred-123');
                expect(published).toHaveLength(1);
                expect(published[0]).toMatchObject({
                    Source: 'sendgrid-webhook',
                    CredentialID: 'cred-123',
                    RawBody: rawBody,
                });
            },
        );
    });

    it('POST /webhooks/sendgrid (default route) rejects tampered signature and stale timestamp with 401', async () => {
        const nowSec = 1_700_000_000;
        const rawBody = JSON.stringify([{ event: 'open', sg_event_id: 'e2' }]);
        const { signature, timestamp } = signSendGridBody(rawBody, nowSec);
        const stale = signSendGridBody(rawBody, nowSec - 601);

        await withServer(
            {
                ResolveWebhookKey: async () => publicKeyPem,
                PublishActivity: async (p) => { published.push(p); },
                NowSeconds: () => nowSec,
            },
            async (baseUrl) => {
                const tamperedRes = await fetch(`${baseUrl}/webhooks/sendgrid`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-twilio-email-event-webhook-signature': signature,
                        'x-twilio-email-event-webhook-timestamp': timestamp,
                    },
                    body: `${rawBody} `,
                });
                expect(tamperedRes.status).toBe(401);

                const staleRes = await fetch(`${baseUrl}/webhooks/sendgrid`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-twilio-email-event-webhook-signature': stale.signature,
                        'x-twilio-email-event-webhook-timestamp': stale.timestamp,
                    },
                    body: rawBody,
                });
                expect(staleRes.status).toBe(401);
                expect(published).toHaveLength(0);
            },
        );
    });

    it('POST /unsubscribe validates UUIDv4 and awaits durable publish before returning 200', async () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        let resolvePublish!: () => void;
        let publishCompleted = false;

        await withServer(
            {
                PublishActivity: async (p) => {
                    await new Promise<void>((r) => { resolvePublish = r; });
                    publishCompleted = true;
                    published.push(p);
                },
            },
            async (baseUrl) => {
                const badRes = await fetch(`${baseUrl}/unsubscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: 'not-a-uuid' }),
                });
                expect(badRes.status).toBe(400);

                const reqPromise = fetch(`${baseUrl}/unsubscribe?token=${validUuid}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'List-Unsubscribe=One-Click',
                });

                // Give request a tick to reach PublishActivity, verify it hasn't resolved yet
                await new Promise((r) => setTimeout(r, 20));
                expect(publishCompleted).toBe(false);
                resolvePublish();

                const okRes = await reqPromise;
                expect(okRes.status).toBe(200);
                expect(publishCompleted).toBe(true);
                expect(published[0]).toMatchObject({
                    Source: 'unsubscribe',
                    EventType: 'Unsubscribed',
                    UnsubscribeToken: validUuid,
                });
            },
        );
    });

    it('GET /open/:token.gif serves 43-byte GIF with no-store headers and publishes Opened event', async () => {
        expect(TRANSPARENT_GIF_1X1.length).toBe(43);
        const validUuid = '22222222-3333-4444-8555-666666666666';

        await withServer(
            {
                PublishActivity: async (p) => { published.push(p); },
            },
            async (baseUrl) => {
                const res = await fetch(`${baseUrl}/open/${validUuid}.gif`);
                expect(res.status).toBe(200);
                expect(res.headers.get('content-type')).toBe('image/gif');
                expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
                const buf = Buffer.from(await res.arrayBuffer());
                expect(buf.length).toBe(43);
                expect(buf.equals(TRANSPARENT_GIF_1X1)).toBe(true);
                expect(published[0]).toMatchObject({
                    Source: 'open-pixel',
                    EventType: 'Opened',
                    TrackingToken: validUuid,
                });
            },
        );
    });

    it('GET /click/:token verifies HMAC sig, rejects tampered u with 400, and redirects 302 when valid', async () => {
        const secret = 'test-hmac-secret-32-chars-minimum';
        const token = '33333333-4444-4555-8666-777777777777';
        const target = 'https://example.com/landing?a=1';
        const sig = SignClickTrackingUrl(secret, token, target);

        await withServer(
            {
                HmacSecret: secret,
                PublishActivity: async (p) => { published.push(p); },
            },
            async (baseUrl) => {
                const badSigRes = await fetch(
                    `${baseUrl}/click/${token}?u=${encodeURIComponent('https://evil.example.com')}&sig=${sig}`,
                    { redirect: 'manual' },
                );
                expect(badSigRes.status).toBe(400);

                const jsSchemeSig = SignClickTrackingUrl(secret, token, 'javascript:alert(1)');
                const jsRes = await fetch(
                    `${baseUrl}/click/${token}?u=${encodeURIComponent('javascript:alert(1)')}&sig=${jsSchemeSig}`,
                    { redirect: 'manual' },
                );
                expect(jsRes.status).toBe(400);
                expect(published).toHaveLength(0);

                const okRes = await fetch(
                    `${baseUrl}/click/${token}?u=${encodeURIComponent(target)}&sig=${sig}`,
                    { redirect: 'manual' },
                );
                expect(okRes.status).toBe(302);
                expect(okRes.headers.get('location')).toBe(target);
                expect(published[0]).toMatchObject({
                    Source: 'click-redirect',
                    EventType: 'Clicked',
                    TrackingToken: token,
                    TargetURL: target,
                });
            },
        );
    });

    it('POST /unsubscribe/:token and GET /unsubscribe/:token accept path-parameter tokens', async () => {
        const validUuid = '11111111-2222-4333-8444-555555555555';
        await withServer(
            {
                PublishActivity: async (p) => { published.push(p); },
                ResolveUnsubscribeRedirect: async () => 'https://prefs.example.com',
            },
            async (baseUrl) => {
                const postRes = await fetch(`${baseUrl}/unsubscribe/${validUuid}`, { method: 'POST' });
                expect(postRes.status).toBe(200);
                expect(published[0]).toMatchObject({
                    Source: 'unsubscribe',
                    EventType: 'Unsubscribed',
                    UnsubscribeToken: validUuid,
                });

                const getRes = await fetch(`${baseUrl}/unsubscribe/${validUuid}`, { redirect: 'manual' });
                expect(getRes.status).toBe(302);
                expect(getRes.headers.get('location')).toBe(`https://prefs.example.com?token=${validUuid}`);
            },
        );
    });

    it('GET /click/:token verifies signatures produced by V2SendService.ComputeTrackingSignature', async () => {
        const secret = 'shared-comms-secret-32-characters';
        const token = 'track-v2-roundtrip';
        const target = 'https://memberjunction.org/guide';
        const sig = ComputeTrackingSignature(token, target, secret);

        await withServer(
            {
                HmacSecret: secret,
                PublishActivity: async (p) => { published.push(p); },
            },
            async (baseUrl) => {
                const res = await fetch(
                    `${baseUrl}/click/${token}?u=${encodeURIComponent(target)}&sig=${sig}`,
                    { redirect: 'manual' },
                );
                expect(res.status).toBe(302);
                expect(res.headers.get('location')).toBe(target);
            },
        );
    });

    it('enforces per-IP rate limiting on /comms/* routes', async () => {
        await withServer(
            {
                PublishActivity: async (p) => { published.push(p); },
                RateLimit: { enabled: true, windowMs: 60_000, maxRequests: 2 },
            },
            async (baseUrl) => {
                expect((await fetch(`${baseUrl}/open/t1.gif`)).status).toBe(200);
                expect((await fetch(`${baseUrl}/open/t2.gif`)).status).toBe(200);
                expect((await fetch(`${baseUrl}/open/t3.gif`)).status).toBe(429);
            },
        );
    });

    it('skips publishing when VerifyToken returns false or token is not a UUIDv4', async () => {
        const validUuid = '44444444-5555-4666-8777-888888888888';
        const secret = 'verify-token-secret-32-characters!';
        const sig = SignClickTrackingUrl(secret, validUuid, 'https://example.com');

        await withServer(
            {
                HmacSecret: secret,
                PublishActivity: async (p) => { published.push(p); },
                VerifyToken: async () => false,
            },
            async (baseUrl) => {
                const openRes = await fetch(`${baseUrl}/open/${validUuid}.gif`);
                expect(openRes.status).toBe(200);

                const clickRes = await fetch(
                    `${baseUrl}/click/${validUuid}?u=${encodeURIComponent('https://example.com')}&sig=${sig}`,
                    { redirect: 'manual' },
                );
                expect(clickRes.status).toBe(302);

                const unsubRes = await fetch(`${baseUrl}/unsubscribe/${validUuid}`, { method: 'POST' });
                expect(unsubRes.status).toBe(404);
                expect(unsubRes.headers.get('cache-control')).toBe('no-store');

                expect(published).toHaveLength(0);
            },
        );
    });

    it('sets Cache-Control: no-store on token-bearing JSON endpoints', async () => {
        const validUuid = '55555555-6666-4777-8888-999999999999';
        await withServer(
            {
                ResolvePreferenceCenterData: async (token): Promise<PreferenceCenterData> => ({
                    Token: token,
                    Sender: { ID: 'sender-1', Name: 'Acme', TemplateContext: { BrandName: 'Acme' } },
                    Preferences: [],
                    CanUnsubscribeAll: true,
                }),
                ConfirmDoubleOptIn: async () => ({ Found: true, Confirmed: true }),
            },
            async (baseUrl) => {
                const prefRes = await fetch(`${baseUrl}/preferences/${validUuid}`, {
                    headers: { Accept: 'application/json' },
                });
                expect(prefRes.status).toBe(200);
                expect(prefRes.headers.get('cache-control')).toBe('no-store');

                const confirmRes = await fetch(`${baseUrl}/confirm/${validUuid}`, {
                    method: 'POST',
                    headers: { Accept: 'application/json' },
                });
                expect(confirmRes.status).toBe(200);
                expect(confirmRes.headers.get('cache-control')).toBe('no-store');
            },
        );
    });

    // ─── Failure modes of the injected hooks ─────────────────────────────────

    describe('when a hook fails', () => {
        const nowSec = 1_700_000_000;
        const rawBody = JSON.stringify([{ event: 'delivered', email: 'a@b.com', sg_event_id: 'e1' }]);
        const validUuid = '66666666-7777-4888-8999-aaaaaaaaaaaa';
        const failingPublish = async (): Promise<void> => {
            throw new Error('WorkQueue publish rejected (TopicDisabled): comms.activity is disabled');
        };

        function signedHeaders(): Record<string, string> {
            const { signature, timestamp } = signSendGridBody(rawBody, nowSec);
            return {
                'Content-Type': 'application/json',
                'x-twilio-email-event-webhook-signature': signature,
                'x-twilio-email-event-webhook-timestamp': timestamp,
            };
        }

        it('POST /webhooks/sendgrid answers 401 and publishes nothing when no verification key resolves', async () => {
            await withServer(
                { ResolveWebhookKey: async () => undefined, PublishActivity: async (p) => { published.push(p); }, NowSeconds: () => nowSec },
                async (baseUrl) => {
                    const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-unknown`, { method: 'POST', headers: signedHeaders(), body: rawBody });

                    expect(res.status).toBe(401);
                    expect(await res.json()).toEqual({ error: 'Webhook verification key not configured' });
                    expect(published).toHaveLength(0);
                },
            );
        });

        it('POST /webhooks/sendgrid answers 503 when a correctly signed batch cannot be published, so SendGrid retries it', async () => {
            await withServer(
                { ResolveWebhookKey: async () => publicKeyPem, PublishActivity: failingPublish, NowSeconds: () => nowSec },
                async (baseUrl) => {
                    const res = await fetch(`${baseUrl}/webhooks/sendgrid`, { method: 'POST', headers: signedHeaders(), body: rawBody });

                    expect(res.status).toBe(503);
                    expect(await res.json()).toEqual({ error: 'Failed to enqueue webhook batch' });
                },
            );
        });

        it('POST /webhooks/sendgrid never reaches the publisher for an unsigned or unverifiable request', async () => {
            const publish = vi.fn(failingPublish);
            await withServer(
                { ResolveWebhookKey: async () => publicKeyPem, PublishActivity: publish, NowSeconds: () => nowSec },
                async (baseUrl) => {
                    const unsigned = await fetch(`${baseUrl}/webhooks/sendgrid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: rawBody });
                    const garbage = await fetch(`${baseUrl}/webhooks/sendgrid`, {
                        method: 'POST',
                        headers: { ...signedHeaders(), 'x-twilio-email-event-webhook-signature': 'not-base64-der' },
                        body: rawBody,
                    });

                    expect([unsigned.status, garbage.status]).toEqual([401, 401]);
                    expect(publish).not.toHaveBeenCalled();
                },
            );
        });

        it('POST /unsubscribe answers 503, not 200, when the unsubscribe cannot be published', async () => {
            await withServer({ PublishActivity: failingPublish }, async (baseUrl) => {
                const res = await fetch(`${baseUrl}/unsubscribe/${validUuid}`, { method: 'POST' });

                expect(res.status).toBe(503);
                expect(await res.json()).toEqual({ error: 'Failed to process unsubscribe' });
            });
        });

        it('POST /unsubscribe answers 503 and publishes nothing when token verification throws', async () => {
            await withServer(
                {
                    PublishActivity: async (p) => { published.push(p); },
                    VerifyToken: async () => {
                        throw new Error('token store unavailable');
                    },
                },
                async (baseUrl) => {
                    const res = await fetch(`${baseUrl}/unsubscribe/${validUuid}`, { method: 'POST' });

                    expect(res.status).toBe(503);
                    expect(published).toHaveLength(0);
                },
            );
        });

        it('GET /open still serves the pixel when publishing or token verification fails', async () => {
            await withServer({ PublishActivity: failingPublish }, async (baseUrl) => {
                const res = await fetch(`${baseUrl}/open/${validUuid}.gif`);

                expect(res.status).toBe(200);
                expect(Buffer.from(await res.arrayBuffer()).equals(TRANSPARENT_GIF_1X1)).toBe(true);
            });
            await withServer(
                {
                    PublishActivity: async (p) => { published.push(p); },
                    VerifyToken: async () => {
                        throw new Error('token store unavailable');
                    },
                },
                async (baseUrl) => {
                    expect((await fetch(`${baseUrl}/open/${validUuid}.gif`)).status).toBe(200);
                    expect(published).toHaveLength(0);
                },
            );
        });

        it('GET /click still redirects a correctly signed link when publishing fails', async () => {
            const secret = 'failure-mode-secret-32-characters!';
            const target = 'https://example.com/landing';
            const sig = SignClickTrackingUrl(secret, validUuid, target);

            await withServer({ HmacSecret: secret, PublishActivity: failingPublish }, async (baseUrl) => {
                const res = await fetch(`${baseUrl}/click/${validUuid}?u=${encodeURIComponent(target)}&sig=${sig}`, { redirect: 'manual' });

                expect(res.status).toBe(302);
                expect(res.headers.get('location')).toBe(target);
            });
        });

        it('GET /click rejects a signature made for another token, and a link with no signature', async () => {
            const secret = 'failure-mode-secret-32-characters!';
            const target = 'https://example.com/landing';
            const sigForOtherToken = SignClickTrackingUrl(secret, '77777777-8888-4999-8aaa-bbbbbbbbbbbb', target);

            await withServer({ HmacSecret: secret, PublishActivity: async (p) => { published.push(p); } }, async (baseUrl) => {
                const swapped = await fetch(`${baseUrl}/click/${validUuid}?u=${encodeURIComponent(target)}&sig=${sigForOtherToken}`, { redirect: 'manual' });
                const unsigned = await fetch(`${baseUrl}/click/${validUuid}?u=${encodeURIComponent(target)}`, { redirect: 'manual' });

                expect([swapped.status, unsigned.status]).toEqual([400, 400]);
                expect(published).toHaveLength(0);
            });
        });

        it('GET /unsubscribe falls back to the built-in preference page when the redirect lookup throws', async () => {
            await withServer(
                {
                    ResolveUnsubscribeRedirect: async () => {
                        throw new Error('sender lookup failed');
                    },
                },
                async (baseUrl) => {
                    const res = await fetch(`${baseUrl}/unsubscribe/${validUuid}`, { redirect: 'manual' });

                    expect(res.status).toBe(302);
                    expect(res.headers.get('location')).toBe(`/comms/preferences/${validUuid}`);
                },
            );
        });
    });
});
