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
 * @module @memberjunction/telephony-adapters
 */

import { Router, urlencoded, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { RegisterMediaUpgradeRoute } from '@memberjunction/server-extensions-core';
import { LogError, LogStatus, UserInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    verifyTwilioSignature,
    resolveInboundCall,
    buildInboundVoiceTwiML,
    type TwilioMediaFrame,
} from '@memberjunction/ai-bridge-twilio';
import type { TwilioTelephonyConfig } from '../types.js';
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
    start?: {
        callSid?: string;
        streamSid?: string;
    };
}

/**
 * Creates the public router + the Media-Streams WSS attachment function for Twilio telephony.
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
 * Attaches the Media-Streams WSS to the shared HTTP server on {@link TWILIO_MEDIA_WSS_PATH}.
 */
function attachMediaStreamServer(registry: TwilioCallMediaRegistry): void {
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

    socket.on('error', (err) => {
        LogError(`[Telephony][Twilio] media socket error for call ${callSid ?? 'unknown'}: ${err.message}`);
        if (callSid) {
            registry.EndCall(callSid);
        }
    });
}

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

/** Resolves the server-side principal + provider for the public webhook. */
function resolveServerContext(): { user: UserInfo; provider: IMetadataProvider } | null {
    const user = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive && u.Type?.trim().toLowerCase() === 'owner') ?? null;
    const provider = Metadata.Provider; // global-provider-ok: inbound telephony webhook runs in server-global provider context
    if (!user || !provider) {
        return null;
    }
    return { user, provider };
}
