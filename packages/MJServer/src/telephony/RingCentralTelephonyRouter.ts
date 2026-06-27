/**
 * @fileoverview Express + WSS wiring for the RingCentral telephony ingress.
 *
 * Two public surfaces (carriers cannot present an MJ JWT — RingCentral's token model is the gate):
 *   - `POST /telephony/ringcentral/webhook` — Call-Control subscription notifications. FIRST honors the
 *     `Validation-Token` registration handshake (echoes the header back); otherwise verifies the delivery
 *     `verification-token`, maps the telephony-session notification to an inbound call, and starts a bridge
 *     session whose media leg streams over the media WSS.
 *   - `WSS /telephony/ringcentral/media` — the bidirectional media stream. Frames are routed to the active
 *     call's `RealRingCentralBindings` via the shared {@link RingCentralCallMediaRegistry}.
 *
 * Mirrors the Twilio telephony router: mount the router BEFORE the unified auth middleware and attach the
 * WSS to the shared HTTP server at startup. The validation-handshake / verification-token gate + inbound
 * resolution use the offline-complete, unit-tested helpers from the RingCentral provider package; this
 * module is thin HTTP/WS plumbing over them and the {@link RingCentralTelephonyService}.
 *
 * @module @memberjunction/server/telephony
 */

import { Router, json, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { RegisterMediaUpgradeRoute } from './media-upgrade-router.js';
import { LogError, LogStatus, UserInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    handleValidationToken,
    verifyRingCentralWebhook,
    resolveInboundCall,
    type RingCentralNotificationBody,
    type RingCentralMediaFrame,
} from '@memberjunction/ai-bridge-ringcentral';
import type { RingCentralTelephonyConfig } from '../config.js';
import { RingCentralTelephonyService } from './RingCentralTelephonyService.js';
import { RingCentralCallMediaRegistry } from './ringcentralMediaRegistry.js';

/** The mount path for the RingCentral telephony public router. */
export const RINGCENTRAL_TELEPHONY_MOUNT_PATH = '/telephony/ringcentral';

/** The media websocket path the RingCentral session's media leg connects to. */
export const RINGCENTRAL_MEDIA_WSS_PATH = '/telephony/ringcentral/media';

/** The `Validation-Token` request/response header name (case-insensitive) for the registration handshake. */
const VALIDATION_TOKEN_HEADER = 'validation-token';

/** The `verification-token` request header name (case-insensitive) carried on each delivery. */
const VERIFICATION_TOKEN_HEADER = 'verification-token';

/** The minimal shape of a RingCentral notification envelope (the subset we read). */
interface RingCentralWebhookEnvelope {
    /** The telephony-session notification body carrying `telephonySessionId` + `parties`. */
    body?: RingCentralNotificationBody;
}

/** The minimal shape of a RingCentral media-stream websocket message (a superset of the media frame). */
interface RingCentralWsMessage extends RingCentralMediaFrame {
    /** Present on the `start` frame: carries the telephony session id that keys the media channel. */
    start?: { sessionId?: string };
}

/**
 * Builds the RingCentral telephony handler: the public webhook router + a function to attach the media WSS
 * to the shared HTTP server. Returns the registry + service for observability/tests.
 */
export function createRingCentralTelephonyHandler(
    config: RingCentralTelephonyConfig,
): {
    publicRouter: Router;
    attachMediaStreamServer: () => void;
    registry: RingCentralCallMediaRegistry;
    service: RingCentralTelephonyService;
} {
    const registry = new RingCentralCallMediaRegistry();
    const service = new RingCentralTelephonyService(config, registry);
    const publicRouter = Router();

    // RingCentral posts JSON notifications; parse the body so we can verify + resolve.
    publicRouter.post('/webhook', json(), async (req: Request, res: Response) => {
        await handleWebhook(service, config, req, res);
    });

    return {
        publicRouter,
        attachMediaStreamServer: () => attachMediaStreamServer(registry),
        registry,
        service,
    };
}

/**
 * Handles the Call-Control webhook: validation-token handshake first, then verification-token gate →
 * resolve → start bridge. The handshake (subscription registration) must echo the incoming
 * `Validation-Token` header back with a 200 to prove endpoint ownership.
 */
async function handleWebhook(
    service: RingCentralTelephonyService,
    config: RingCentralTelephonyConfig,
    req: Request,
    res: Response,
): Promise<void> {
    const validation = handleValidationToken(headerValue(req, VALIDATION_TOKEN_HEADER));
    if (validation) {
        res.setHeader('Validation-Token', validation.ValidationToken);
        res.status(200).end();
        return;
    }

    if (!config.webhookVerificationToken || !verifyRingCentralWebhook(config.webhookVerificationToken, headerValue(req, VERIFICATION_TOKEN_HEADER))) {
        res.status(403).type('text/plain').send('Invalid RingCentral verification token.');
        return;
    }

    await processNotification(service, req, res);
}

/** Maps the notification to an inbound call, resolves the server context, and starts the bridge. */
async function processNotification(service: RingCentralTelephonyService, req: Request, res: Response): Promise<void> {
    const body = (req.body as RingCentralWebhookEnvelope | undefined)?.body;
    if (!body) {
        res.status(200).end();
        return;
    }

    let resolved: { sessionId: string; from: string; to: string };
    try {
        resolved = resolveInboundCall(body);
    } catch (e) {
        LogStatus(`[Telephony][RingCentral] ignoring non-inbound notification: ${e instanceof Error ? e.message : String(e)}`);
        res.status(200).end();
        return;
    }

    const context = resolveServerContext();
    if (!context) {
        LogError('[Telephony][RingCentral] no server context user available; cannot start inbound call.');
        res.status(200).end();
        return;
    }

    const result = await service.HandleInboundCall(resolved, context.user, context.provider);
    if (!result.accepted) {
        LogStatus(`[Telephony][RingCentral] inbound ${resolved.sessionId} not accepted: ${result.reason ?? 'unknown'}`);
    }
    res.status(200).end();
}

/**
 * Attaches the media WSS to the shared HTTP server on {@link RINGCENTRAL_MEDIA_WSS_PATH}. Each socket is
 * mapped to its telephony session id on the first `start` frame, then inbound frames are dispatched to the
 * call's bindings via the registry; the socket is also the registry's outbound pump for that session.
 */
function attachMediaStreamServer(registry: RingCentralCallMediaRegistry): void {
    // noServer: the shared path-routing upgrade dispatcher owns the HTTP 'upgrade' event — a second
    // {server}-bound WS server would fight GraphQL's socket and 400 the handshake.
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (socket: WebSocket) => wireMediaSocket(socket, registry));
    RegisterMediaUpgradeRoute(RINGCENTRAL_MEDIA_WSS_PATH, wss);
    LogStatus(`[Telephony][RingCentral] media WSS route registered at ${RINGCENTRAL_MEDIA_WSS_PATH}`);
}

/** Wires one media socket: bind on `start`, dispatch inbound frames, tear down on close. */
function wireMediaSocket(socket: WebSocket, registry: RingCentralCallMediaRegistry): void {
    let sessionId: string | null = null;
    const adapter = { send: (data: string) => socket.send(data), close: () => socket.close() };

    socket.on('message', (raw: unknown) => {
        const message = parseWsMessage(raw);
        if (!message) {
            return;
        }
        if (message.event === 'start' && message.start?.sessionId) {
            sessionId = message.start.sessionId;
            registry.AttachSocket(sessionId, adapter);
            return;
        }
        if (sessionId) {
            registry.DispatchInbound(sessionId, message);
        }
    });
    socket.on('close', () => {
        if (sessionId) {
            registry.EndCall(sessionId);
        }
    });
}

/** Parses a raw WS payload (Buffer/string) into a RingCentral message, or null when unparseable. */
function parseWsMessage(raw: unknown): RingCentralWsMessage | null {
    try {
        const text = typeof raw === 'string' ? raw : raw instanceof Buffer ? raw.toString('utf8') : String(raw);
        return JSON.parse(text) as RingCentralWsMessage;
    } catch {
        return null;
    }
}

/** Reads a single header value (lowercased name), normalizing the string|string[] Express shape. */
function headerValue(req: Request, name: string): string | undefined {
    const value = req.headers[name];
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}

/** Resolves the server-side principal + provider for the public webhook (no MJ JWT on a carrier request). */
function resolveServerContext(): { user: UserInfo; provider: IMetadataProvider } | null {
    const user = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive && u.Type?.trim().toLowerCase() === 'owner') ?? null;
    const provider = Metadata.Provider as unknown as IMetadataProvider | undefined;
    if (!user || !provider) {
        return null;
    }
    return { user, provider };
}
