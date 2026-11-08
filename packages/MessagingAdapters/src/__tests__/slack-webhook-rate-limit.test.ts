/**
 * The Slack HTTP webhook routes are unauthenticated (signature-checked per request), so they carry a
 * per-IP limiter (#5568): on by default, configurable, removable. Real Express app, ephemeral port.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CreateSlackWebhookLimiter, DEFAULT_SLACK_WEBHOOK_RATE_LIMIT } from '../slack/SlackMessagingExtension.js';

let server: Server | undefined;

afterEach(async () => {
    if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = undefined;
    }
});

async function statusesFor(limiter: express.RequestHandler[], count: number): Promise<number[]> {
    const app = express();
    const router = express.Router();
    if (limiter.length > 0) {
        router.use(...limiter);
    }
    router.post('/', (_req, res) => { res.status(200).send('ok'); });
    app.use('/webhook/slack', router);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook/slack`;
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
        const res = await fetch(url, { method: 'POST', body: '{}' });
        await res.arrayBuffer();
        result.push(res.status);
    }
    return result;
}

describe('CreateSlackWebhookLimiter', () => {
    it('is on by default with a generous budget', () => {
        expect(DEFAULT_SLACK_WEBHOOK_RATE_LIMIT.Enabled).toBe(true);
        expect(DEFAULT_SLACK_WEBHOOK_RATE_LIMIT.MaxRequests).toBeGreaterThanOrEqual(600);
        expect(CreateSlackWebhookLimiter()).toHaveLength(1);
    });

    it('answers 429 past the configured max', async () => {
        expect(await statusesFor(CreateSlackWebhookLimiter({ MaxRequests: 2 }), 3)).toEqual([200, 200, 429]);
    });

    it('mounts nothing when disabled', async () => {
        expect(CreateSlackWebhookLimiter({ Enabled: false })).toHaveLength(0);
        expect(await statusesFor(CreateSlackWebhookLimiter({ Enabled: false, MaxRequests: 1 }), 3)).toEqual([200, 200, 200]);
    });
});
