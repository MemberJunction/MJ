/**
 * @fileoverview Inbound eSignature webhook handler (DocuSign Connect, Adobe events, …).
 *
 * Unauthenticated by design — external signature providers call this endpoint without an MJ bearer
 * token. Payload authenticity is verified by the provider DRIVER's `ParseWebhookEvent` (HMAC /
 * signature), not by MJ auth. Must be registered BEFORE the unified auth middleware.
 *
 * Endpoint:
 *   - POST /esignature/webhook/:driverKey
 *
 * @module @memberjunction/server/rest/SignatureWebhookHandler
 */

import express from 'express';
import BodyParser from 'body-parser';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { SignatureEngine } from '@memberjunction/esignature/server';

/**
 * Build an Express router exposing the eSignature webhook. Mount it unauthenticated:
 * `app.use('/esignature', createSignatureWebhookHandler())`.
 */
export function createSignatureWebhookHandler(): express.Router {
    const router = express.Router();

    // Capture the raw body so drivers that HMAC-verify over the exact bytes can do so.
    router.post(
        '/webhook/:driverKey',
        BodyParser.json({ limit: '25mb', verify: captureRawBody }),
        async (req: express.Request, res: express.Response) => {
            await handleWebhook(req, res);
        },
    );

    return router;
}

/** Stash the raw request bytes on the request for signature verification by the driver. */
function captureRawBody(req: express.Request, _res: express.Response, buf: Buffer): void {
    (req as RawBodyRequest).rawBody = buf;
}

async function handleWebhook(req: express.Request, res: express.Response): Promise<void> {
    const rawDriverKey = req.params.driverKey;
    if (!rawDriverKey) {
        res.status(400).json({ error: 'Missing driver key in path.' });
        return;
    }
    const driverKey: string = Array.isArray(rawDriverKey) ? rawDriverKey[0] : rawDriverKey;

    const contextUser = getSystemUser();
    if (!contextUser) {
        LogError('[eSignature webhook] No system user available; cannot process webhook.');
        res.status(503).json({ error: 'Server not ready to process webhooks.' });
        return;
    }

    try {
        await SignatureEngine.Instance.Config(false, contextUser);
        const headers = normalizeHeaders(req.headers);
        const rawBody = (req as RawBodyRequest).rawBody;
        const result = await SignatureEngine.Instance.RecordWebhookEvent(driverKey, req.body, headers, contextUser, rawBody);

        if (!result.Success) {
            // 202: we received it but couldn't act (e.g. unrecognized payload / no matching envelope).
            // Returning 2xx prevents most providers from aggressively retrying a payload we'll never match.
            LogStatus(`[eSignature webhook] ${driverKey}: not actioned — ${result.ErrorMessage}`);
            res.status(202).json({ received: true, actioned: false, message: result.ErrorMessage });
            return;
        }

        res.status(200).json({ received: true, actioned: true, status: result.event?.status });
    } catch (e) {
        LogError(`[eSignature webhook] ${driverKey}: ${e instanceof Error ? e.message : String(e)}`);
        res.status(500).json({ error: 'Failed to process webhook.' });
    }
}

/** Flatten Express header values to a simple string map for the driver. */
function normalizeHeaders(headers: express.Request['headers']): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
            out[key] = value;
        } else if (Array.isArray(value)) {
            out[key] = value.join(', ');
        }
    }
    return out;
}

function getSystemUser(): UserInfo | null {
    try {
        return UserCache.Instance.GetSystemUser() ?? null;
    } catch {
        return null;
    }
}

/** Express request augmented with the captured raw body. */
interface RawBodyRequest extends express.Request {
    rawBody?: Buffer;
}
