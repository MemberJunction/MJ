/**
 * @fileoverview Express + WSS wiring for the Twilio telephony ingress.
 *
 * Two public surfaces (carriers cannot present an MJ JWT — the X-Twilio-Signature HMAC is the gate):
 *   - `POST /telephony/twilio/voice`  — inbound voice webhook. Verifies the signature, resolves the
 *     dialed DID to a pinned agent, starts an inbound bridge session, and answers with the
 *     `<Connect><Stream>` TwiML that opens the Media-Streams socket.
 *   - `WSS /telephony/twilio/media`   — the bidirectional Media-Streams socket. Frames are routed to the
 *     active call's `RealTwilioBindings` via the shared {@link TwilioCallMediaRegistry}.
 *
 * Mirrors the magic-link / widget public-router pattern: mount the router BEFORE the unified auth
 * middleware and attach the WSS to the shared HTTP server at startup. The signature-verification gate +
 * inbound resolution use the offline-complete, unit-tested helpers from the Twilio provider package; this
 * module is thin HTTP/WS plumbing over them and the {@link TwilioTelephonyService}.
 *
 * @module @memberjunction/server/telephony
 */

import { Router, urlencoded, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { RegisterMediaUpgradeRoute } from './media-upgrade-router.js';
import { LogError, LogStatus, UserInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    verifyTwilioSignature,
    resolveInboundCall,
    buildInboundVoiceTwiML,
    type TwilioMediaFrame,
} from '@memberjunction/ai-bridge-twilio';
import type { TwilioTelephonyConfig } from '../config.js';
import { TwilioCallMediaRegistry } from './twilioMediaRegistry.js';
import { TwilioTelephonyService } from './TwilioTelephonyService.js';

/** The mount path for the Twilio telephony public router. */
export const TWILIO_TELEPHONY_MOUNT_PATH = '/telephony/twilio';

/** The Media-Streams websocket path Twilio's `<Connect><Stream>` connects to. */
export const TWILIO_MEDIA_WSS_PATH = '/telephony/twilio/media';

/** A polite TwiML response played when no agent is available for the dialed number. */
const NO_AGENT_TWIML =
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, no agent is available to take this call.</Say><Hangup/></Response>';

/** The minimal shape of a Twilio Media-Streams websocket message (a superset of TwilioMediaFrame). */
interface TwilioWsMessage extends TwilioMediaFrame {
    /** Present on the `start` frame: carries the Call SID + stream SID that key the call's media channel. */
    start?: { callSid?: string; streamSid?: string };
}

/**
 * Builds the Twilio telephony handler: the public webhook router + a function to attach the
 * Media-Streams WSS to the shared HTTP server. Returns the registry + service for observability/tests.
 */
export function createTwilioTelephonyHandler(
    publicUrl: string,
    config: TwilioTelephonyConfig,
): {
    publicRouter: Router;
    attachMediaStreamServer: () => void;
    registry: TwilioCallMediaRegistry;
    service: TwilioTelephonyService;
} {
    const registry = new TwilioCallMediaRegistry();
    const service = new TwilioTelephonyService(config, registry);
    const publicRouter = Router();

    // Twilio signs the form-urlencoded webhook body; parse it so we can both verify + resolve.
    publicRouter.post('/voice', urlencoded({ extended: false }), async (req: Request, res: Response) => {
        await handleInboundVoice(service, config, publicUrl, req, res);
    });

    return {
        publicRouter,
        attachMediaStreamServer: () => attachMediaStreamServer(registry),
        registry,
        service,
    };
}

/** Handles the inbound voice webhook: verify signature → resolve → start bridge → answer with stream TwiML. */
async function handleInboundVoice(
    service: TwilioTelephonyService,
    config: TwilioTelephonyConfig,
    publicUrl: string,
    req: Request,
    res: Response,
): Promise<void> {
    const params = coerceParams(req.body);
    const fullUrl = `${publicUrl.replace(/\/+$/, '')}${req.originalUrl}`;
    if (!config.authToken || !verifyTwilioSignature(config.authToken, req.get('X-Twilio-Signature'), fullUrl, params)) {
        res.status(403).type('text/plain').send('Invalid Twilio signature.');
        return;
    }

    const { callSid, from, to } = resolveInboundCall(params);
    const context = resolveServerContext();
    if (!context) {
        LogError('[Telephony][Twilio] no server context user available; cannot start inbound call.');
        res.status(200).type('text/xml').send(NO_AGENT_TWIML);
        return;
    }

    const result = await service.HandleInboundCall({ callSid, from, to }, context.user, context.provider);
    if (!result.accepted) {
        LogStatus(`[Telephony][Twilio] inbound ${callSid} not accepted: ${result.reason ?? 'unknown'}`);
        res.status(200).type('text/xml').send(NO_AGENT_TWIML);
        return;
    }
    res.status(200).type('text/xml').send(buildInboundVoiceTwiML(config.streamPublicUrl));
}

/**
 * Attaches the Media-Streams WSS to the shared HTTP server on {@link TWILIO_MEDIA_WSS_PATH}. Each socket
 * is mapped to its Call SID on the first `start` frame, then inbound frames are dispatched to the call's
 * bindings via the registry; the socket is also the registry's outbound pump for that call.
 */
function attachMediaStreamServer(registry: TwilioCallMediaRegistry): void {
    // noServer: the shared path-routing upgrade dispatcher (media-upgrade-router) owns the HTTP
    // 'upgrade' event — a second {server}-bound WS server would fight GraphQL's socket and 400 the
    // handshake (Twilio error 31920). We register our path and the dispatcher routes to it.
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (socket: WebSocket) => wireMediaSocket(socket, registry));
    RegisterMediaUpgradeRoute(TWILIO_MEDIA_WSS_PATH, wss);
    LogStatus(`[Telephony][Twilio] Media-Streams WSS route registered at ${TWILIO_MEDIA_WSS_PATH}`);
}

/** Wires one Media-Streams socket: bind on `start`, dispatch inbound frames, tear down on close. */
function wireMediaSocket(socket: WebSocket, registry: TwilioCallMediaRegistry): void {
    let callSid: string | null = null;
    const adapter = { send: (data: string) => socket.send(data), close: () => socket.close() };

    socket.on('message', (raw: unknown) => {
        const message = parseWsMessage(raw);
        if (!message) {
            return;
        }
        if (message.event === 'start' && message.start?.callSid) {
            callSid = message.start.callSid;
            registry.AttachSocket(callSid, adapter, message.start.streamSid ?? '');
            return;
        }
        if (callSid) {
            registry.DispatchInbound(callSid, message);
        }
    });
    socket.on('close', () => {
        if (callSid) {
            registry.EndCall(callSid);
        }
    });
}

/** Parses a raw WS payload (Buffer/string) into a Twilio message, or null when unparseable. */
function parseWsMessage(raw: unknown): TwilioWsMessage | null {
    try {
        const text = typeof raw === 'string' ? raw : raw instanceof Buffer ? raw.toString('utf8') : String(raw);
        return JSON.parse(text) as TwilioWsMessage;
    } catch {
        return null;
    }
}

/** Coerces an Express urlencoded body to the `Record<string,string>` the signature verifier expects. */
function coerceParams(body: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (body && typeof body === 'object') {
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
            if (typeof value === 'string') {
                out[key] = value;
            }
        }
    }
    return out;
}

/** Resolves the server-side principal + provider for the public webhook (no MJ JWT on a carrier request). */
function resolveServerContext(): { user: UserInfo; provider: IMetadataProvider } | null {
    const user = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive && u.Type?.trim().toLowerCase() === 'owner') ?? null;
    const provider = Metadata.Provider as unknown as IMetadataProvider | undefined; // global-provider-ok: public carrier webhook has no MJ JWT / per-request provider; the server's single default provider is correct
    if (!user || !provider) {
        return null;
    }
    return { user, provider };
}
