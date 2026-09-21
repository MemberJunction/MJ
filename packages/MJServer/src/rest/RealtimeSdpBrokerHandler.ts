import express, { type Router, type Request, type Response, type NextFunction } from 'express';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeModel, RealtimeProxyRegistry, type RealtimeProxyTicketEntry } from '@memberjunction/ai';
import { LogError, LogStatus } from '@memberjunction/core';

/**
 * Middleware that extracts and consumes the realtime ticket from query parameters
 * BEFORE any request body parsing occurs. This prevents anonymous/unauthorized callers
 * from causing body-parser memory allocations.
 */
export function requireTicket(req: Request, res: Response, next: NextFunction): void {
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

    res.locals.ticketEntry = entry;
    res.locals.ticketId = ticketId;
    next();
}

/**
 * Builds the Express router handling the Realtime WebRTC SDP exchange:
 * `POST /realtime/sdp-exchange?ticket=<ticketId>`
 *
 * In the Realtime WebRTC topology (e.g. OpenAI Live), the browser never contacts the upstream
 * API directly and holds no project API key. Instead, the browser sends its offer SDP here using a
 * short-lived ticket minted by the provider driver. This broker validates and consumes the ticket
 * BEFORE body parsing, delegates to `driver.ExchangeWebRtcSdp` to exchange the SDP offer for an
 * answer with upstream using the server's API key, and returns the answer SDP.
 */
export function createRealtimeSdpBrokerRouter(): Router {
    const router = express.Router();

    router.post(
        '/',
        requireTicket,
        express.json({ limit: '2mb' }),
        async (req: Request, res: Response): Promise<void> => {
            const entry = res.locals.ticketEntry as RealtimeProxyTicketEntry;
            const ticketId = (res.locals.ticketId as string) || '';

            LogStatus(
                `RealtimeSdpBrokerHandler: processing ticket '${ticketId}' for user '${entry.UserID ?? 'anonymous'}', driver '${entry.DriverClass ?? 'OpenAILiveRealtime'}'`
            );

            const body = req.body as { sdp?: string } | undefined;
            const sdp = body?.sdp;
            if (!sdp || typeof sdp !== 'string') {
                res.status(400).json({ error: 'Missing or invalid sdp in request body' });
                return;
            }

            const apiKey = entry.UpstreamAuthHeader;
            if (!apiKey) {
                LogError(`RealtimeSdpBrokerHandler: ticket '${ticketId}' has no upstream auth credentials`);
                res.status(500).json({ error: 'Server configuration error: missing upstream credentials' });
                return;
            }

            try {
                const driverClass = entry.DriverClass || 'OpenAILiveRealtime';
                const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(
                    BaseRealtimeModel,
                    driverClass,
                    apiKey,
                    entry.UpstreamUrl
                );

                if (!driver || !driver.ExchangeWebRtcSdp) {
                    LogError(`RealtimeSdpBrokerHandler: driver '${driverClass}' does not support ExchangeWebRtcSdp`);
                    res.status(500).json({ error: `Driver '${driverClass}' does not support WebRTC SDP exchange` });
                    return;
                }

                LogStatus(`RealtimeSdpBrokerHandler: exchanging WebRTC SDP offer via ${driverClass}`);
                // Use authoritative session config recorded on ticket entry at mint time (prevents client tampering)
                const result = await driver.ExchangeWebRtcSdp(sdp, entry.SessionConfig);
                res.status(200).json(result);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                LogError(`RealtimeSdpBrokerHandler failed for ticket '${ticketId}': ${message}`);
                res.status(502).json({ error: 'Realtime WebRTC handshake failed' });
            }
        }
    );

    return router;
}

/**
 * @deprecated Use `createRealtimeSdpBrokerRouter` instead.
 */
export const createOpenAILiveBrokerRouter = createRealtimeSdpBrokerRouter;
