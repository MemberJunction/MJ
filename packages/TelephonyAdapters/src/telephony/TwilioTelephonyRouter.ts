/**
 * @fileoverview Express + WSS wiring for the Twilio telephony ingress.
 *
 * Two public surfaces (carriers cannot present an MJ JWT — the X-Twilio-Signature HMAC is the gate):
 *   - `POST /telephony/twilio/voice`  — inbound voice webhook. Verifies the signature, resolves the run-as
 *     user, admits the call (pinned agent + per-call media token) and answers IMMEDIATELY with the
 *     `<Connect><Stream>` TwiML that opens the Media-Streams socket; the bridge session starts in the
 *     background.
 *   - `POST /telephony/twilio/status` — signature-verified call-status callback; a terminal status ends the
 *     call's session (an unanswered outbound call never opens a media socket).
 *   - `POST /telephony/twilio/amd`    — signature-verified async answering-machine verdict.
 *   - `WSS /telephony/twilio/media`   — the bidirectional Media-Streams socket. The `start` frame must carry
 *     the per-call `mjToken`; only then are frames routed to the call's `RealTwilioBindings` via the shared
 *     {@link TwilioCallMediaRegistry}.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Router, urlencoded, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { RegisterMediaUpgradeRoute } from '@memberjunction/server-extensions-core';
import { LogError, LogStatus, UserInfo, IMetadataProvider } from '@memberjunction/core';
import {
    verifyTwilioSignature,
    resolveInboundCall,
    BuildInboundVoiceTwiML,
    TWILIO_MEDIA_TOKEN_PARAMETER,
    type TwilioMediaFrame,
} from '@memberjunction/ai-bridge-twilio';
import type { TwilioTelephonyConfig } from '../types.js';
import { TwilioCallMediaRegistry } from './twilioMediaRegistry.js';
import { TwilioTelephonyService } from './TwilioTelephonyService.js';
import { ResolveInboundContext } from './runAsIdentity.js';
import { PublicOrigin } from './telephonySettings.js';
import { CoerceWebhookParams } from './webhookParams.js';

/** The mount path for the Twilio telephony public router. */
export const TWILIO_TELEPHONY_MOUNT_PATH = '/telephony/twilio';

/** The Media-Streams websocket path Twilio's `<Connect><Stream>` connects to. */
export const TWILIO_MEDIA_WSS_PATH = '/telephony/twilio/media';

/** A polite TwiML response played when no agent is available for the dialed number. */
const NO_AGENT_TWIML =
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, no agent is available to take this call.</Say><Hangup/></Response>';

/** A polite TwiML response played when every agent line is in use (the server is at its concurrent-call cap). */
const BUSY_TWIML =
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, all of our agents are busy right now. Please try again in a few minutes.</Say><Hangup/></Response>';

/** A polite TwiML response played when MJ cannot admit the call (no run-as user, malformed webhook, …). */
const UNAVAILABLE_TWIML =
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we are unable to take your call right now. Goodbye.</Say><Hangup/></Response>';

/** The minimal shape of a Twilio Media-Streams websocket message (a superset of TwilioMediaFrame). */
interface TwilioWsMessage extends TwilioMediaFrame {
    start?: {
        callSid?: string;
        streamSid?: string;
        /** The `<Parameter>` name/value pairs from the TwiML `<Stream>` — carries MJ's per-call `mjToken`. */
        customParameters?: Record<string, string>;
    };
}

/** What the public routes need from the telephony service (a structural subset, so tests inject a fake). */
export type TwilioTelephonyServiceLike = Pick<TwilioTelephonyService, 'HandleInboundCall' | 'HandleStatusCallback' | 'HandleAnsweringMachine'>;

/**
 * Creates the public router + the Media-Streams WSS attachment function for Twilio telephony.
 */
export function CreateTwilioTelephonyHandler(
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
    const form = urlencoded({ extended: false }); // Twilio signs the form-urlencoded body; parse it to verify + resolve.

    publicRouter.post('/voice', form, (req: Request, res: Response) => HandleTwilioInboundVoice(service, config, publicUrl, req, res));
    publicRouter.post('/status', form, (req: Request, res: Response) => HandleTwilioStatusCallback(service, config, publicUrl, req, res));
    publicRouter.post('/amd', form, (req: Request, res: Response) => HandleTwilioAmdCallback(service, config, publicUrl, req, res));

    return {
        publicRouter,
        attachMediaStreamServer: () => attachMediaStreamServer(registry),
        registry,
        service,
    };
}

/** @deprecated Use {@link CreateTwilioTelephonyHandler}. */
export function createTwilioTelephonyHandler(
    publicUrl: string,
    config: TwilioTelephonyConfig,
): {
    publicRouter: Router;
    attachMediaStreamServer: () => void;
    registry: TwilioCallMediaRegistry;
    service: TwilioTelephonyService;
} {
    return CreateTwilioTelephonyHandler(publicUrl, config);
}

/**
 * Verifies the `X-Twilio-Signature` of a public webhook. On failure answers 403 and returns `null`; on success
 * returns the coerced form params. Shared by every Twilio webhook route.
 */
function verifyTwilioRequest(config: TwilioTelephonyConfig, publicUrl: string, req: Request, res: Response): Record<string, string> | null {
    const params = CoerceWebhookParams(req.body);
    // Extension routes mount at the app root, so the signed URL is the public ORIGIN + the request's own path;
    // the public URL's own path (e.g. `/graphql`) must not be counted twice.
    const fullUrl = `${PublicOrigin(publicUrl)}${req.originalUrl}`;
    if (!config.authToken || !verifyTwilioSignature(config.authToken, req.get('X-Twilio-Signature'), fullUrl, params)) {
        res.status(403).type('text/plain').send('Invalid Twilio signature.');
        return null;
    }
    return params;
}

/**
 * Handles the inbound voice webhook: verify signature → resolve run-as user → admit the call → answer
 * IMMEDIATELY with the stream TwiML (the bridge session finishes starting in the background).
 */
export async function HandleTwilioInboundVoice(
    service: TwilioTelephonyServiceLike,
    config: TwilioTelephonyConfig,
    publicUrl: string,
    req: Request,
    res: Response,
): Promise<void> {
    const params = verifyTwilioRequest(config, publicUrl, req, res);
    if (!params) {
        return;
    }
    let call: { callSid: string; from: string; to: string };
    try {
        call = resolveInboundCall(params);
    } catch (e) {
        LogError(`[Telephony][Twilio] voice webhook unparseable: ${e instanceof Error ? e.message : String(e)}`);
        res.status(200).type('text/xml').send(UNAVAILABLE_TWIML);
        return;
    }
    const context = ResolveInboundContext(config.inboundRunAsUserEmail);
    if (!context.Ok) {
        LogError(`[Telephony][Twilio] rejecting inbound call ${call.callSid} to ${call.to}: ${context.Reason}`);
        res.status(200).type('text/xml').send(UNAVAILABLE_TWIML);
        return;
    }
    await admitAndAnswer(service, config, call, context.User, context.Provider, res);
}

/** Admits the call with the service and writes the stream TwiML (or a polite refusal) as the response. */
async function admitAndAnswer(
    service: TwilioTelephonyServiceLike,
    config: TwilioTelephonyConfig,
    call: { callSid: string; from: string; to: string },
    user: UserInfo,
    provider: IMetadataProvider,
    res: Response,
): Promise<void> {
    const result = await service.HandleInboundCall(call, user, provider);
    if (!result.accepted || !result.MediaToken) {
        LogStatus(`[Telephony][Twilio] inbound ${call.callSid} not accepted: ${result.reason ?? 'unknown'}`);
        res.status(200).type('text/xml').send(result.Busy ? BUSY_TWIML : NO_AGENT_TWIML);
        return;
    }
    res.status(200).type('text/xml').send(BuildInboundVoiceTwiML(config.streamPublicUrl, { [TWILIO_MEDIA_TOKEN_PARAMETER]: result.MediaToken }));
}

/** Handles a call-status callback: verify, then let the service end the session on a terminal status. */
export async function HandleTwilioStatusCallback(
    service: TwilioTelephonyServiceLike,
    config: TwilioTelephonyConfig,
    publicUrl: string,
    req: Request,
    res: Response,
): Promise<void> {
    const params = verifyTwilioRequest(config, publicUrl, req, res);
    if (!params) {
        return;
    }
    try {
        if (params['CallSid']) {
            await service.HandleStatusCallback(params['CallSid'], params['CallStatus']);
        }
    } catch (e) {
        LogError(`[Telephony][Twilio] status callback for ${params['CallSid'] ?? '?'} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    res.status(200).end();
}

/** Handles the async answering-machine verdict callback: verify, then let the service act on a machine/fax. */
export async function HandleTwilioAmdCallback(
    service: TwilioTelephonyServiceLike,
    config: TwilioTelephonyConfig,
    publicUrl: string,
    req: Request,
    res: Response,
): Promise<void> {
    const params = verifyTwilioRequest(config, publicUrl, req, res);
    if (!params) {
        return;
    }
    try {
        if (params['CallSid']) {
            await service.HandleAnsweringMachine(params['CallSid'], params['AnsweredBy']);
        }
    } catch (e) {
        LogError(`[Telephony][Twilio] AMD callback for ${params['CallSid'] ?? '?'} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    res.status(200).end();
}

/**
 * Attaches the Media-Streams WSS to the shared HTTP server on {@link TWILIO_MEDIA_WSS_PATH}.
 */
function attachMediaStreamServer(registry: TwilioCallMediaRegistry): void {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (socket: WebSocket) => WireTwilioMediaSocket(socket, registry));
    RegisterMediaUpgradeRoute(TWILIO_MEDIA_WSS_PATH, wss);
    LogStatus(`[Telephony][Twilio] Media-Streams WSS route registered at ${TWILIO_MEDIA_WSS_PATH}`);
}

/**
 * How long a freshly-upgraded Media-Streams socket may stay open without presenting a valid `start` frame.
 * Twilio sends `connected` then `start` within milliseconds, so anything slower is not a real stream; the
 * deadline stops unauthenticated clients from parking idle sockets on the shared HTTP server.
 */
export const MEDIA_SOCKET_AUTH_DEADLINE_MS = 10 * 1000;

/**
 * Wires one Media-Streams socket: authenticate + bind on `start`, dispatch inbound frames, tear down on close.
 * A socket whose `start` frame names an unknown call, carries a bad/missing `mjToken`, or targets a call that
 * already has a socket is closed and logged — and its later `close` does NOT end the (legitimate) call.
 * A socket that never sends a valid `start` within {@link MEDIA_SOCKET_AUTH_DEADLINE_MS} is closed and logged.
 */
export function WireTwilioMediaSocket(socket: WebSocket, registry: TwilioCallMediaRegistry): void {
    let callSid: string | null = null;
    const adapter = { send: (data: string) => socket.send(data), close: () => socket.close() };

    let authTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        authTimer = null;
        if (!callSid) {
            LogError(`[Telephony][Twilio] closing media socket: no valid start frame within ${MEDIA_SOCKET_AUTH_DEADLINE_MS}ms.`);
            socket.close();
        }
    }, MEDIA_SOCKET_AUTH_DEADLINE_MS);
    const clearAuthTimer = (): void => {
        if (authTimer) {
            clearTimeout(authTimer);
            authTimer = null;
        }
    };

    socket.on('message', (raw: unknown) => {
        const message = parseWsMessage(raw);
        if (!message) {
            return;
        }
        if (message.event === 'start' && message.start?.callSid) {
            if (!callSid) {
                callSid = authenticateStart(socket, registry, adapter, message.start) ? message.start.callSid : null;
                if (callSid) {
                    clearAuthTimer();
                }
            }
            return; // a repeated `start` on an authenticated socket is ignored — never re-authenticated or dispatched
        }
        if (callSid) {
            registry.DispatchInbound(callSid, message);
        }
    });

    socket.on('close', () => {
        clearAuthTimer();
        if (callSid) {
            registry.EndCall(callSid);
        }
    });

    socket.on('error', (err) => {
        clearAuthTimer();
        LogError(`[Telephony][Twilio] media socket error for call ${callSid ?? 'unknown'}: ${err.message}`);
        if (callSid) {
            registry.EndCall(callSid);
        }
    });
}

/**
 * Authenticates a `start` frame against the registry. Returns `true` when the socket was attached; otherwise
 * logs why, closes the socket, and returns `false`.
 */
function authenticateStart(
    socket: WebSocket,
    registry: TwilioCallMediaRegistry,
    adapter: { send: (data: string) => void; close: () => void },
    start: NonNullable<TwilioWsMessage['start']>,
): boolean {
    const callSid = start.callSid as string;
    const token = start.customParameters?.[TWILIO_MEDIA_TOKEN_PARAMETER];
    const verdict = registry.TryAttachSocket(callSid, token, adapter, start.streamSid ?? '');
    if (verdict.Ok) {
        return true;
    }
    LogError(`[Telephony][Twilio] refusing media socket for call ${callSid}: ${verdict.Reason}.`);
    socket.close();
    return false;
}

function parseWsMessage(raw: unknown): TwilioWsMessage | null {
    try {
        const text = typeof raw === 'string' ? raw : raw instanceof Buffer ? raw.toString('utf8') : String(raw);
        return JSON.parse(text) as TwilioWsMessage;
    } catch {
        return null;
    }
}
