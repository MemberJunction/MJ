/**
 * @fileoverview Express + WSS wiring for the Vonage telephony ingress.
 *
 * Public surfaces (a carrier cannot present an MJ JWT — the signed webhook is the gate):
 *   - `POST /telephony/vonage/answer` — inbound answer webhook. Verifies the signature, resolves the run-as
 *     user, admits the call and returns the connect-websocket NCCO IMMEDIATELY; the bridge session starts in
 *     the background.
 *   - `POST /telephony/vonage/event`  — signed call-lifecycle events; a terminal status ends the call's session
 *     (an unanswered outbound call never opens a media socket).
 *   - `WSS /telephony/vonage/media`   — the media websocket. The upgrade URL must carry the call's identity
 *     (`call_uuid` inbound / `mj_cid` outbound) and its per-call `mj_token`; only then is the socket attached.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Router, urlencoded, json, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { RegisterMediaUpgradeRoute } from '@memberjunction/server-extensions-core';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    verifyVonageSignature,
    verifyVonageJwt,
    resolveInboundCall,
    buildInboundAnswerNcco,
    parseVonageControlEvent,
    BuildVonageMediaUrl,
    VONAGE_MEDIA_CALL_UUID_PARAM,
    VONAGE_MEDIA_CORRELATION_PARAM,
    VONAGE_MEDIA_TOKEN_PARAM,
} from '@memberjunction/ai-bridge-vonage';
import type { VonageTelephonyConfig } from '../types.js';
import { VonageCallMediaRegistry } from './vonageMediaRegistry.js';
import { VonageTelephonyService } from './VonageTelephonyService.js';
import { ResolveInboundContext } from './runAsIdentity.js';

/** The mount path for the Vonage telephony public router. */
export const VONAGE_TELEPHONY_MOUNT_PATH = '/telephony/vonage';

/** The media websocket path Vonage's `connect`-websocket NCCO connects to. */
export const VONAGE_MEDIA_WSS_PATH = '/telephony/vonage/media';

/** A polite NCCO returned when no agent is available for the dialed number. */
const NO_AGENT_NCCO = [{ action: 'talk', text: 'Sorry, no agent is available to take this call.' }];

/** A polite NCCO returned when MJ cannot admit the call (no run-as user, malformed webhook, …). */
const UNAVAILABLE_NCCO = [{ action: 'talk', text: 'Sorry, we are unable to take your call right now. Goodbye.' }];

/** What the public routes need from the telephony service (a structural subset, so tests inject a fake). */
export type VonageTelephonyServiceLike = Pick<VonageTelephonyService, 'HandleInboundCall' | 'HandleCallEvent'>;

/**
 * Builds the Vonage telephony handler: the public answer/event router + a function to attach the media
 * WSS to the shared HTTP server.
 */
export function CreateVonageTelephonyHandler(
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

    publicRouter.post('/answer', json(), urlencoded({ extended: false }), (req: Request, res: Response) => HandleVonageInboundAnswer(service, config, req, res));
    publicRouter.post('/event', json(), urlencoded({ extended: false }), (req: Request, res: Response) => HandleVonageCallEvent(service, config, req, res));

    return {
        publicRouter,
        attachMediaStreamServer: () => attachMediaStreamServer(registry),
        registry,
        service,
    };
}

/** @deprecated Use {@link CreateVonageTelephonyHandler}. */
export function createVonageTelephonyHandler(
    publicUrl: string,
    config: VonageTelephonyConfig,
): {
    publicRouter: Router;
    attachMediaStreamServer: () => void;
    registry: VonageCallMediaRegistry;
    service: VonageTelephonyService;
} {
    return CreateVonageTelephonyHandler(publicUrl, config);
}

/**
 * Handles the inbound answer webhook: verify → resolve run-as user → admit the call → return the
 * connect-websocket NCCO IMMEDIATELY (the bridge session finishes starting in the background).
 */
export async function HandleVonageInboundAnswer(
    service: VonageTelephonyServiceLike,
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
        res.status(200).type('application/json').json(UNAVAILABLE_NCCO);
        return;
    }

    const context = ResolveInboundContext(config.inboundRunAsUserEmail);
    if (!context.Ok) {
        LogError(`[Telephony][Vonage] rejecting inbound call ${resolved.callId} to ${resolved.to}: ${context.Reason}`);
        res.status(200).type('application/json').json(UNAVAILABLE_NCCO);
        return;
    }

    const result = await service.HandleInboundCall(resolved, context.User, context.Provider);
    if (!result.accepted || !result.MediaToken) {
        LogStatus(`[Telephony][Vonage] inbound ${resolved.callId} not accepted: ${result.reason ?? 'unknown'}`);
        res.status(200).type('application/json').json(NO_AGENT_NCCO);
        return;
    }
    const mediaUrl = BuildVonageMediaUrl(config.mediaPublicUrl, {
        [VONAGE_MEDIA_CALL_UUID_PARAM]: resolved.callId,
        [VONAGE_MEDIA_TOKEN_PARAM]: result.MediaToken,
    });
    res.status(200).type('application/json').json(buildInboundAnswerNcco(mediaUrl));
}

/** Handles a call-lifecycle event webhook: verify, then let the service end the session on a terminal status. */
export async function HandleVonageCallEvent(
    service: VonageTelephonyServiceLike,
    config: VonageTelephonyConfig,
    req: Request,
    res: Response,
): Promise<void> {
    const params = coerceParams(req.body);
    if (!verifyVonageRequest(config, req, params)) {
        res.status(403).type('application/json').json({ error: 'Invalid Vonage signature.' });
        return;
    }
    const status = params['status'] ?? params['event'];
    const callId = params['uuid'] ?? params['conversation_uuid'];
    LogStatus(`[Telephony][Vonage] event: ${status ?? 'unknown'} for ${callId ?? '?'}`);
    try {
        if (callId) {
            await service.HandleCallEvent(callId, status);
        }
    } catch (e) {
        LogError(`[Telephony][Vonage] event handling for ${callId ?? '?'} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
 * Attaches the media WSS to the shared HTTP server on {@link VONAGE_MEDIA_WSS_PATH}.
 */
function attachMediaStreamServer(registry: VonageCallMediaRegistry): void {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (socket: WebSocket, request: IncomingMessage) => WireVonageMediaSocket(socket, request, registry));
    RegisterMediaUpgradeRoute(VONAGE_MEDIA_WSS_PATH, wss);
    LogStatus(`[Telephony][Vonage] media WSS route registered at ${VONAGE_MEDIA_WSS_PATH}`);
}

/**
 * Wires one media socket: authenticate against the upgrade URL's call identity + `mj_token`, attach,
 * dispatch inbound frames, tear down on close. A refused socket (unknown call, bad/missing token, call
 * already has a socket) is closed and logged, and nothing is registered for it.
 */
export function WireVonageMediaSocket(socket: WebSocket, request: IncomingMessage, registry: VonageCallMediaRegistry): void {
    const claim = readSocketClaim(request);
    const adapter = {
        sendBinary: (data: Uint8Array) => socket.send(data),
        sendText: (data: string) => socket.send(data),
        close: () => socket.close(),
    };
    const verdict = registry.TryAttachSocket({ CallUuid: claim.CallUuid, CorrelationId: claim.CorrelationId }, claim.Token, adapter);
    if (!verdict.Ok) {
        LogError(`[Telephony][Vonage] refusing media socket for call ${claim.CallUuid ?? claim.CorrelationId ?? 'unknown'}: ${verdict.Reason}.`);
        socket.close();
        return;
    }
    const callKey = verdict.CallKey;

    socket.on('message', (raw: Buffer, isBinary: boolean) => {
        if (isBinary) {
            registry.DispatchInboundAudio(callKey, toArrayBuffer(raw));
            return;
        }
        const event = parseVonageControlEvent(raw.toString('utf8'));
        if (event) {
            registry.DispatchInboundEvent(callKey, event);
        }
    });
    socket.on('close', () => registry.EndCall(callKey));
}

/** Copies a Node `Buffer` into a standalone `ArrayBuffer`. */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
    const out = new ArrayBuffer(buf.byteLength);
    new Uint8Array(out).set(buf);
    return out;
}

/** What a connecting media socket claims on its upgrade URL. */
interface SocketClaim {
    CallUuid?: string;
    CorrelationId?: string;
    Token?: string;
}

/** Reads the call identity + token query params off the websocket upgrade request URL. */
function readSocketClaim(request: IncomingMessage): SocketClaim {
    try {
        const url = new URL(request.url ?? '', 'http://localhost');
        return {
            CallUuid: nonEmpty(url.searchParams.get(VONAGE_MEDIA_CALL_UUID_PARAM)),
            CorrelationId: nonEmpty(url.searchParams.get(VONAGE_MEDIA_CORRELATION_PARAM)),
            Token: nonEmpty(url.searchParams.get(VONAGE_MEDIA_TOKEN_PARAM)),
        };
    } catch {
        return {};
    }
}

/** Maps a missing or empty query value to `undefined`. */
function nonEmpty(value: string | null): string | undefined {
    return value && value.length > 0 ? value : undefined;
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
