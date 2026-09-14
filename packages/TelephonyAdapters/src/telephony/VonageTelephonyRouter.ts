/**
 * @fileoverview Express + WSS wiring for the Vonage telephony ingress.
 *
 * @module @memberjunction/telephony-adapters
 */

import { Router, urlencoded, json, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { RegisterMediaUpgradeRoute } from '@memberjunction/server-extensions-core';
import { LogError, LogStatus, UserInfo, IMetadataProvider, Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    verifyVonageSignature,
    verifyVonageJwt,
    resolveInboundCall,
    buildInboundAnswerNcco,
    parseVonageControlEvent,
} from '@memberjunction/ai-bridge-vonage';
import type { VonageTelephonyConfig } from '../types.js';
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
 * WSS to the shared HTTP server.
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

/** Handles a call-lifecycle event webhook: verify then acknowledge. */
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
 * Attaches the media WSS to the shared HTTP server on {@link VONAGE_MEDIA_WSS_PATH}.
 */
function attachMediaStreamServer(registry: VonageCallMediaRegistry): void {
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

/** Copies a Node `Buffer` into a standalone `ArrayBuffer`. */
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

/** Resolves the server-side principal + provider for the public webhook. */
function resolveServerContext(): { user: UserInfo; provider: IMetadataProvider } | null {
    const user = UserCache.Instance.GetSystemUser() ?? UserCache.Users.find((u) => u.IsActive && u.Type?.trim().toLowerCase() === 'owner') ?? null;
    const provider = Metadata.Provider; // global-provider-ok: inbound telephony webhook runs in server-global provider context
    if (!user || !provider) {
        return null;
    }
    return { user, provider };
}
