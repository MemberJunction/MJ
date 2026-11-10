import { describe, it, expect, beforeEach, vi } from 'vitest';
import type express from 'express';

/**
 * Audit finding (MJ#6240): /esignature/webhook/:driverKey is pre-auth, so the handler must not
 * acknowledge an event the engine refused for lack of a webhook secret, and must pass the
 * local-development opt-out to the engine only when the config sets it.
 */

const mocks = vi.hoisted(() => ({
    recordWebhookEvent: vi.fn(),
    config: { eSignature: { allowUnverifiedWebhooks: false } } as { eSignature?: { allowUnverifiedWebhooks?: boolean } },
}));

vi.mock('@memberjunction/esignature/server', () => ({
    SignatureEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            RecordWebhookEvent: mocks.recordWebhookEvent,
        },
    },
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => ({ ID: 'system-user' }) } },
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('../config.js', () => ({
    get configInfo() {
        return mocks.config;
    },
}));

import { CreateSignatureWebhookHandler } from '../rest/SignatureWebhookHandler.js';

type RouteHandler = (req: express.Request, res: express.Response) => Promise<void>;
interface RouterLayer {
    route?: { path: string; stack: Array<{ handle: RouteHandler }> };
}

/** The route's final handler (after the body parser), reached through the router's own stack. */
function webhookHandler(): RouteHandler {
    const router = CreateSignatureWebhookHandler() as unknown as { stack: RouterLayer[] };
    const layer = router.stack.find((l) => l.route?.path === '/webhook/:driverKey');
    if (!layer?.route) {
        throw new Error('webhook route not registered');
    }
    return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function post(): Promise<{ status: number; body: Record<string, unknown> }> {
    const captured = { status: 0, body: {} as Record<string, unknown> };
    const res = {
        status(code: number) {
            captured.status = code;
            return res;
        },
        json(body: Record<string, unknown>) {
            captured.body = body;
            return res;
        },
    };
    const req = { params: { driverKey: 'DocuSign' }, headers: { 'x-test': '1' }, body: { status: 'completed' }, rawBody: Buffer.from('{}') };
    await webhookHandler()(req as unknown as express.Request, res as unknown as express.Response);
    return captured;
}

describe('SignatureWebhookHandler', () => {
    beforeEach(() => {
        mocks.recordWebhookEvent.mockReset();
        mocks.config = { eSignature: { allowUnverifiedWebhooks: false } };
    });

    it('answers 503 (so the provider retries) when no webhook secret is configured', async () => {
        mocks.recordWebhookEvent.mockResolvedValue({ Success: false, Rejection: 'VerificationNotConfigured', ErrorMessage: 'no secret' });
        const result = await post();
        expect(result.status).toBe(503);
        expect(result.body).toMatchObject({ actioned: false, message: 'no secret' });
    });

    it('does not allow unverified webhooks by default', async () => {
        mocks.recordWebhookEvent.mockResolvedValue({ Success: true, event: { status: 'Completed' } });
        await post();
        expect(mocks.recordWebhookEvent.mock.calls[0][6]).toEqual({ AllowUnverified: false });
    });

    it('does not allow unverified webhooks when the config section is absent', async () => {
        mocks.config = {};
        mocks.recordWebhookEvent.mockResolvedValue({ Success: true, event: { status: 'Completed' } });
        await post();
        expect(mocks.recordWebhookEvent.mock.calls[0][6]).toEqual({ AllowUnverified: false });
    });

    it('passes the local-development opt-out through to the engine when configured', async () => {
        mocks.config = { eSignature: { allowUnverifiedWebhooks: true } };
        mocks.recordWebhookEvent.mockResolvedValue({ Success: true, event: { status: 'Completed' } });
        const result = await post();
        expect(mocks.recordWebhookEvent.mock.calls[0][6]).toEqual({ AllowUnverified: true });
        expect(result.status).toBe(200);
    });

    it('still answers 202 / not actioned for an invalid signature', async () => {
        mocks.recordWebhookEvent.mockResolvedValue({ Success: false, Rejection: 'VerificationFailed', ErrorMessage: 'Webhook signature verification failed.' });
        const result = await post();
        expect(result.status).toBe(202);
        expect(result.body).toMatchObject({ received: true, actioned: false });
    });

    it('answers 200 for a verified, applied event', async () => {
        mocks.recordWebhookEvent.mockResolvedValue({ Success: true, event: { status: 'Completed' } });
        const result = await post();
        expect(result.status).toBe(200);
        expect(result.body).toMatchObject({ actioned: true, status: 'Completed' });
    });
});
