/**
 * @fileoverview Express + WSS wiring for the Vonage telephony ingress.
 *
 * Three public surfaces (carriers cannot present an MJ JWT — Vonage's signed-request HMAC or webhook JWT
 * is the gate):
 *   - `POST /telephony/vonage/answer` — inbound answer webhook. Verifies the signature/JWT, resolves the
 *     dialed DID to a pinned agent, starts an inbound bridge session, and returns the `connect`-websocket
 *     NCCO that opens the bidirectional media leg.
 *   - `POST /telephony/vonage/event`  — call-lifecycle event webhook (verified, acknowledged 200).
 *   - `WSS  /telephony/vonage/media`  — the bidirectional `audio/l16;rate=8000` media socket. Frames are
 *     routed to the active call's `RealVonageBindings` via the shared {@link VonageCallMediaRegistry}.
 *
 * Vonage media frames do not carry the call UUID, so the answer NCCO embeds it on the media URL as a
 * `?call_uuid=…` query param; the WSS reads it from the upgrade request URL to key the socket.
 *
 * Mirrors the Twilio / magic-link / widget public-router pattern: mount the router BEFORE the unified auth
 * middleware and attach the WSS to the shared HTTP server at startup. The signature/JWT-verification gate +
 * inbound resolution use the offline-complete, unit-tested helpers from the Vonage provider package; this
 * module is thin HTTP/WS plumbing over them and the {@link VonageTelephonyService}.
 *
 * @module @memberjunction/server/telephony
 */

import { Router, urlencoded, json, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { RegisterMediaUpgradeRoute } from './media-upgrade-router.js';
import { LogError, LogStatus, UserInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import {
    verifyVonageSignature,
    verifyVonageJwt,
    resolveInboundCall,
    buildInboundAnswerNcco,
    parseVonageControlEvent,
} from '@memberjunction/ai-bridge-vonage';
import type { VonageTelephonyConfig } from '../config.js';
import { VonageCallMediaRegistry } from './vonageMediaRegistry.js';
import { VonageTelephonyService } from './VonageTelephonyService.js';

/** The mount path for the Vonage telephony public router. */
export const VONAGE_TELEPHONY_MOUNT_PATH = '/telephony/vonage';

/** The media websocket path Vonage's `connect`-websocket NCCO connects to. */
export const VONAGE_MEDIA_WSS_PATH = '/telephony/vonage/media';

/** A polite NCCO returned when no agent is available for the dialed number. */
const NO_AGENT_NCCO = [{ action: 'talk', text: 'Sorry, no agent is available to take this call.' }];

/**
 * Builds the Vonage telephony handler: the public answer/event router + a function to attach the media
 * WSS to the shared HTTP server. Returns the registry + service for observability/tests.
 */
export function createVonageTelephonyHandler(
    publicUrl: string,
    config: VonageTelephonyConfig,
): {
    publicRouter: Router;
    attachMediaStreamServer: () => void;
    registry: VonageCallMediaRegistry;
    service: VonageTelephonyService;
} {
    const registry = new VonageCallMediaRegistry();
    const service = new VonageTelephonyService(config, registry);
    const publicRouter = Router();

    // Vonage posts JSON webhook bodies; also accept urlencoded for signed-request `sig` schemes.
    publicRouter.post('/answer', json(), urlencoded({ extended: false }), async (req: Request, res: Response) => {
        await handleInboundAnswer(service, config, req, res);
    });
    publicRouter.post('/event', json(), urlencoded({ extended: false }), (req: Request, res: Response) => {
        handleCallEvent(config, req, res);
    });

    return {
        publicRouter,
        attachMediaStreamServer: () => attachMediaStreamServer(registry),
        registry,
        service,
    };
}

/** Handles the inbound answer webhook: verify → resolve → start bridge → return the connect-websocket NCCO. */
async function handleInboundAnswer(
    service: VonageTelephonyService,
    config: VonageTelephonyConfig,
    req: Request,
    res: Response,
): Promise<void> {
    const params = coerceParams(req.body);
    if (!verifyVonageRequest(config, req, params)) {
        res.status(403).type('application/json').json({ error: 'Invalid Vonage signature.' });
        return;
    }

    let resolved: { callId: string; from: string; to: string };
    try {
        resolved = resolveInboundCall(params);
    } catch (e) {
        LogError(`[Telephony][Vonage] answer webhook unparseable: ${e instanceof Error ? e.message : String(e)}`);
        res.status(200).type('application/json').json(NO_AGENT_NCCO);
        return;
    }

    const context = resolveServerContext();
    if (!context) {
        LogError('[Telephony][Vonage] no server context user available; cannot start inbound call.');
        res.status(200).type('application/json').json(NO_AGENT_NCCO);
        return;
    }

    const result = await service.HandleInboundCall(resolved, context.user, context.provider);
    if (!result.accepted) {
        LogStatus(`[Telephony][Vonage] inbound ${resolved.callId} not accepted: ${result.reason ?? 'unknown'}`);
        res.status(200).type('application/json').json(NO_AGENT_NCCO);
        return;
    }
    const mediaUrl = appendCallUuid(config.mediaPublicUrl, resolved.callId);
    res.status(200).type('application/json').json(buildInboundAnswerNcco(mediaUrl));
}

/** Handles a call-lifecycle event webhook: verify then acknowledge (the bridge tracks state via the media socket). */
function handleCallEvent(config: VonageTelephonyConfig, req: Request, res: Response): void {
    const params = coerceParams(req.body);
    if (!verifyVonageRequest(config, req, params)) {
        res.status(403).type('application/json').json({ error: 'Invalid Vonage signature.' });
        return;
    }
    LogStatus(`[Telephony][Vonage] event: ${params['status'] ?? params['event'] ?? 'unknown'} for ${params['uuid'] ?? params['conversation_uuid'] ?? '?'}`);
    res.status(200).end();
}

/** Verifies a public Vonage webhook via the webhook JWT (preferred) or the signed-request `sig` HMAC. */
function verifyVonageRequest(config: VonageTelephonyConfig, req: Request, params: Record<string, string>): boolean {
    const secret = config.signatureSecret;
    if (!secret) {
        return false;
    }
    const jwtClaims = verifyVonageJwt(secret, req.get('Authorization'), Math.floor(Date.now() / 1000));
    if (jwtClaims) {
        return true;
    }
    return verifyVonageSignature(secret, params['sig'], params);
}

/**
 * Attaches the media WSS to the shared HTTP server on {@link VONAGE_MEDIA_WSS_PATH}. Each socket is mapped
 * to its call UUID from the `?call_uuid=…` query param the answer NCCO embedded on the media URL, then
 * inbound frames are dispatched to the call's bindings via the registry; the socket is also the registry's
 * outbound pump for that call.
 */
function attachMediaStreamServer(registry: VonageCallMediaRegistry): void {
    // noServer: the shared path-routing upgrade dispatcher owns the HTTP 'upgrade' event (a second
    // {server}-bound WS server would fight GraphQL's socket and 400 the handshake). The dispatcher
    // passes the original request through, so the call-UUID query on the media URL is preserved.
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (socket: WebSocket, request: IncomingMessage) => wireMediaSocket(socket, request, registry));
    RegisterMediaUpgradeRoute(VONAGE_MEDIA_WSS_PATH, wss);
    LogStatus(`[Telephony][Vonage] media WSS route registered at ${VONAGE_MEDIA_WSS_PATH}`);
}

/** Wires one media socket: key on the `call_uuid` query param, attach, dispatch inbound frames, tear down on close. */
function wireMediaSocket(socket: WebSocket, request: IncomingMessage, registry: VonageCallMediaRegistry): void {
    const callUuid = readCallUuid(request);
    if (!callUuid) {
        LogError('[Telephony][Vonage] media socket connected with no call_uuid; closing.');
        socket.close();
        return;
    }
    const adapter = {
        sendBinary: (data: Uint8Array) => socket.send(data),
        sendText: (data: string) => socket.send(data),
        close: () => socket.close(),
    };
    registry.AttachSocket(callUuid, adapter);

    // Vonage splits the media leg by frame type: BINARY frames carry raw L16 PCM audio; TEXT frames carry
    // JSON control events (websocket:connected / websocket:dtmf / close). `ws` reports which via isBinary.
    socket.on('message', (raw: Buffer, isBinary: boolean) => {
        if (isBinary) {
            registry.DispatchInboundAudio(callUuid, toArrayBuffer(raw));
            return;
        }
        const event = parseVonageControlEvent(raw.toString('utf8'));
        if (event) {
            registry.DispatchInboundEvent(callUuid, event);
        }
    });
    socket.on('close', () => registry.EndCall(callUuid));
}

/** Copies a Node `Buffer` into a standalone `ArrayBuffer` (respecting byteOffset/length, never aliasing the pool). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
    const out = new ArrayBuffer(buf.byteLength);
    new Uint8Array(out).set(buf);
    return out;
}

/** Reads the `call_uuid` query param off the websocket upgrade request URL, or null when absent. */
function readCallUuid(request: IncomingMessage): string | null {
    try {
        const url = new URL(request.url ?? '', 'http://localhost');
        const value = url.searchParams.get('call_uuid');
        return value && value.length > 0 ? value : null;
    } catch {
        return null;
    }
}

/** Appends the call UUID as a `call_uuid` query param to the media URL so the WSS can key the socket. */
function appendCallUuid(mediaUrl: string, callUuid: string): string {
    const sep = mediaUrl.includes('?') ? '&' : '?';
    return `${mediaUrl}${sep}call_uuid=${encodeURIComponent(callUuid)}`;
}

/** Coerces an Express body (JSON object or urlencoded) to the `Record<string,string>` the verifiers expect. */
function coerceParams(body: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (body && typeof body === 'object') {
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
            if (typeof value === 'string') {
                out[key] = value;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                out[key] = String(value);
            }
        }
    }
    return out;
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
