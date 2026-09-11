import express, { type Router, type Request, type Response } from 'express';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeModel, RealtimeProxyRegistry } from '@memberjunction/ai';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Builds the Express router handling the OpenAI Live WebRTC SDP exchange:
 * `POST /realtime/openai-live/sdp-exchange?ticket=<ticketId>`
 *
 * In the OpenAI Live WebRTC topology, the browser never contacts api.openai.com directly
 * and holds no project API key. Instead, the browser sends its offer SDP here using a
 * short-lived ticket minted by `OpenAILiveRealtime.CreateClientSession`. This broker validates
 * and consumes the ticket, delegates to `driver.ExchangeWebRtcSdp` to exchange the SDP offer
 * for an answer with OpenAI using the server's API key, and returns the answer SDP.
 */
export function createOpenAILiveBrokerRouter(): Router {
    const router = express.Router();

    router.post('/', async (req: Request, res: Response): Promise<void> => {
        const ticketId = (req.query['ticket'] as string) || '';
        if (!ticketId) {
            res.status(401).json({ error: 'Unauthorized: missing ticket' });
            return;
        }

        const entry = RealtimeProxyRegistry.Instance.Consume(ticketId);
        if (!entry) {
            res.status(401).json({ error: 'Unauthorized: invalid or expired ticket' });
            return;
        }

        const body = req.body as { sdp?: string; session?: Record<string, unknown> } | undefined;
        const sdp = body?.sdp;
        if (!sdp || typeof sdp !== 'string') {
            res.status(400).json({ error: 'Missing or invalid sdp in request body' });
            return;
        }

        try {
            const driverClass = entry.DriverClass || 'OpenAILiveRealtime';
            const apiKey = entry.UpstreamAuthHeader ?? '';
            const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(
                BaseRealtimeModel,
                driverClass,
                apiKey,
                entry.UpstreamUrl
            );

            if (!driver || !driver.ExchangeWebRtcSdp) {
                LogError(`OpenAILiveBrokerHandler: driver '${driverClass}' does not support ExchangeWebRtcSdp`);
                res.status(500).json({ error: `Driver '${driverClass}' does not support WebRTC SDP exchange` });
                return;
            }

            LogStatus(`OpenAILiveBrokerHandler: exchanging WebRTC SDP offer via ${driverClass}`);
            const result = await driver.ExchangeWebRtcSdp(sdp, body?.session);
            res.status(200).json(result);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`OpenAILiveBrokerHandler failed: ${message}`);
            res.status(502).json({ error: `OpenAI Live WebRTC handshake failed: ${message}` });
        }
    });

    return router;
}
