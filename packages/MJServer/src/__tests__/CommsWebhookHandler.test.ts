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
} from '../rest/CommsWebhookHandler.js';
import { ComputeTrackingSignature } from '@memberjunction/communication-engine';

async function withServer(
    options: CommsWebhookHandlerOptions,
    fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
    const app = express();
    app.use('/comms', CreateCommsWebhookHandler(options));
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

        await withServer(
            {
                PublishActivity: async (p) => { published.push(p); },
            },
            async (baseUrl) => {
                const res = await fetch(`${baseUrl}/open/tok-abc-123.gif`);
                expect(res.status).toBe(200);
                expect(res.headers.get('content-type')).toBe('image/gif');
                expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
                const buf = Buffer.from(await res.arrayBuffer());
                expect(buf.length).toBe(43);
                expect(buf.equals(TRANSPARENT_GIF_1X1)).toBe(true);
                expect(published[0]).toMatchObject({
                    Source: 'open-pixel',
                    EventType: 'Opened',
                    TrackingToken: 'tok-abc-123',
                });
            },
        );
    });

    it('GET /click/:token verifies HMAC sig, rejects tampered u with 400, and redirects 302 when valid', async () => {
        const secret = 'test-hmac-secret-32-chars-minimum';
        const token = 'track-tok-999';
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
});
