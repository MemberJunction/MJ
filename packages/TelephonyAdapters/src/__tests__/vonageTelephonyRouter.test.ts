import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';
import type { WebSocket } from 'ws';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));
vi.mock('../telephony/runAsIdentity.js', () => ({ ResolveInboundContext: vi.fn() }));

import { LogError } from '@memberjunction/core';
import { ComputeVonageSignature } from '@memberjunction/ai-bridge-vonage';
import { ResolveInboundContext } from '../telephony/runAsIdentity.js';
import {
    HandleVonageCallEvent,
    HandleVonageInboundAnswer,
    WireVonageMediaSocket,
    type VonageTelephonyServiceLike,
} from '../telephony/VonageTelephonyRouter.js';
import { VonageCallMediaRegistry } from '../telephony/vonageMediaRegistry.js';
import type { VonageTelephonyConfig } from '../types.js';

const SECRET = 'vonage-signature-secret';
const CONFIG: VonageTelephonyConfig = {
    mediaPublicUrl: 'wss://api.acme.com/telephony/vonage/media',
    signatureSecret: SECRET,
    inboundRunAsUserEmail: 'phone-bot@acme.com',
};
const USER = { ID: 'u1' } as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;

interface FakeRes {
    statusCode?: number;
    body?: unknown;
    ended: boolean;
}

function fakeRes(): Response & FakeRes {
    const res: FakeRes & Record<string, unknown> = { ended: false };
    res['status'] = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res['type'] = () => res;
    res['json'] = (b: unknown) => {
        res.body = b;
        return res;
    };
    res['end'] = () => {
        res.ended = true;
        return res;
    };
    return res as unknown as Response & FakeRes;
}

/** A request signed the way Vonage signs it (HMAC `sig` param), or with a forged signature. */
function signedReq(params: Record<string, string>, signed = true): Request {
    const body = { ...params, sig: signed ? ComputeVonageSignature(SECRET, params) : 'FORGED' };
    return { body, get: () => undefined } as unknown as Request;
}

function fakeService(overrides: Partial<VonageTelephonyServiceLike> = {}): VonageTelephonyServiceLike & { [K in keyof VonageTelephonyServiceLike]: ReturnType<typeof vi.fn> } {
    return {
        HandleInboundCall: vi.fn(async () => ({ accepted: true, MediaToken: 'TOK123' })),
        HandleCallEvent: vi.fn(async () => undefined),
        ...overrides,
    } as never;
}

const ANSWER_PARAMS = { uuid: 'CALL-1', from: '14155550123', to: '18005550100' };

beforeEach(() => {
    vi.mocked(LogError).mockClear();
    vi.mocked(ResolveInboundContext).mockReset();
    vi.mocked(ResolveInboundContext).mockReturnValue({ Ok: true, User: USER, Provider: PROVIDER });
});

describe('POST /answer (HandleVonageInboundAnswer)', () => {
    it('answers 403 and never touches the service when the signature is wrong', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleVonageInboundAnswer(service, CONFIG, signedReq(ANSWER_PARAMS, false), res);
        expect(res.statusCode).toBe(403);
        expect(service.HandleInboundCall).not.toHaveBeenCalled();
    });

    it('rejects the call with a polite NCCO and logs the dialed number when there is no run-as user', async () => {
        vi.mocked(ResolveInboundContext).mockReturnValue({ Ok: false, Reason: 'telephony.inboundRunAsUserEmail is not configured' });
        const service = fakeService();
        const res = fakeRes();

        await HandleVonageInboundAnswer(service, CONFIG, signedReq(ANSWER_PARAMS), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([{ action: 'talk', text: expect.stringContaining('unable to take your call') }]);
        expect(service.HandleInboundCall).not.toHaveBeenCalled();
        const logged = String(vi.mocked(LogError).mock.calls[0][0]);
        expect(logged).toContain('18005550100');
    });

    it('admits the call as the run-as user and returns a connect NCCO whose websocket URI carries call_uuid AND the per-call token', async () => {
        const service = fakeService();
        const res = fakeRes();

        await HandleVonageInboundAnswer(service, CONFIG, signedReq(ANSWER_PARAMS), res);

        expect(service.HandleInboundCall).toHaveBeenCalledWith({ callId: 'CALL-1', from: '14155550123', to: '18005550100' }, USER, PROVIDER);
        const ncco = res.body as Array<{ action: string; endpoint: Array<{ uri: string }> }>;
        expect(ncco[0].action).toBe('connect');
        const uri = new URL(ncco[0].endpoint[0].uri);
        expect(uri.searchParams.get('call_uuid')).toBe('CALL-1');
        expect(uri.searchParams.get('mj_token')).toBe('TOK123');
    });

    it('answers BEFORE the bridge session has finished starting (it never waits on the background start)', async () => {
        const never = new Promise<void>(() => undefined);
        const service = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: true, MediaToken: 'TOK', Started: never })) });
        const res = fakeRes();
        await HandleVonageInboundAnswer(service, CONFIG, signedReq(ANSWER_PARAMS), res);
        expect(JSON.stringify(res.body)).toContain('connect');
    });

    it('answers a polite "all agents are busy" NCCO (not "no agent") when the server is at its cap', async () => {
        const service = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: false, Busy: true, reason: 'All agent lines are busy.' })) });
        const res = fakeRes();
        await HandleVonageInboundAnswer(service, CONFIG, signedReq(ANSWER_PARAMS), res);
        expect(JSON.stringify(res.body)).toMatch(/busy/i);
        expect(JSON.stringify(res.body)).not.toContain('no agent is available');
    });

    it('answers a "no agent" NCCO when the call is not accepted, and never a connect without a token', async () => {
        const service = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: false, reason: 'No active agent identity' })) });
        const res = fakeRes();
        await HandleVonageInboundAnswer(service, CONFIG, signedReq(ANSWER_PARAMS), res);
        expect(JSON.stringify(res.body)).toContain('no agent is available');

        const tokenless = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: true })) });
        const res2 = fakeRes();
        await HandleVonageInboundAnswer(tokenless, CONFIG, signedReq(ANSWER_PARAMS), res2);
        expect(JSON.stringify(res2.body)).not.toContain('connect');
    });

    it('answers a polite NCCO (not a 500) for a webhook missing required params', async () => {
        const res = fakeRes();
        await HandleVonageInboundAnswer(fakeService(), CONFIG, signedReq({ uuid: 'CALL-1' }), res);
        expect(res.statusCode).toBe(200);
        expect(JSON.stringify(res.body)).toContain('talk');
    });
});

describe('POST /event (HandleVonageCallEvent)', () => {
    it('answers 403 and does nothing when the signature is wrong', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleVonageCallEvent(service, CONFIG, signedReq({ uuid: 'C1', status: 'completed' }, false), res);
        expect(res.statusCode).toBe(403);
        expect(service.HandleCallEvent).not.toHaveBeenCalled();
    });

    it('hands the call id and status to the service (which ends the session on a terminal status) and acknowledges', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleVonageCallEvent(service, CONFIG, signedReq({ uuid: 'C1', status: 'unanswered' }), res);
        expect(service.HandleCallEvent).toHaveBeenCalledWith('C1', 'unanswered');
        expect(res.statusCode).toBe(200);
        expect(res.ended).toBe(true);
    });

    it('still acknowledges when the service throws', async () => {
        const service = fakeService({ HandleCallEvent: vi.fn(async () => { throw new Error('boom'); }) });
        const res = fakeRes();
        await HandleVonageCallEvent(service, CONFIG, signedReq({ uuid: 'C1', status: 'failed' }), res);
        expect(res.statusCode).toBe(200);
        expect(LogError).toHaveBeenCalled();
    });

    it('falls back to conversation_uuid and ignores an event with no call id', async () => {
        const service = fakeService();
        await HandleVonageCallEvent(service, CONFIG, signedReq({ conversation_uuid: 'CONV-1', status: 'completed' }), fakeRes());
        expect(service.HandleCallEvent).toHaveBeenCalledWith('CONV-1', 'completed');

        const service2 = fakeService();
        await HandleVonageCallEvent(service2, CONFIG, signedReq({ status: 'completed' }), fakeRes());
        expect(service2.HandleCallEvent).not.toHaveBeenCalled();
    });
});

/** A fake `ws` socket: an EventEmitter with `send`/`close` spies. */
function fakeSocket(): WebSocket & EventEmitter & { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
    const socket = new EventEmitter() as WebSocket & EventEmitter & { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    socket.send = vi.fn();
    socket.close = vi.fn();
    return socket;
}

const upgrade = (query: string): IncomingMessage => ({ url: `/telephony/vonage/media?${query}` }) as unknown as IncomingMessage;
const TOKEN = 't'.repeat(64);

describe('media websocket (WireVonageMediaSocket)', () => {
    it('attaches an INBOUND socket that presents call_uuid + the right token, and routes its audio', () => {
        const registry = new VonageCallMediaRegistry();
        registry.ExpectCall('CALL-1', TOKEN);
        const audio: number[] = [];
        registry.OnAudio('CALL-1', (p) => audio.push(p.byteLength));
        const socket = fakeSocket();

        WireVonageMediaSocket(socket, upgrade(`call_uuid=CALL-1&mj_token=${TOKEN}`), registry);
        socket.emit('message', Buffer.from(new Uint8Array(320)), true);

        expect(socket.close).not.toHaveBeenCalled();
        expect(audio).toEqual([320]);
    });

    it('attaches an OUTBOUND socket by correlation id, even before the call UUID is known, then follows the UUID', () => {
        const registry = new VonageCallMediaRegistry();
        registry.ExpectOutboundCall('CID-1', TOKEN);
        const socket = fakeSocket();

        WireVonageMediaSocket(socket, upgrade(`mj_cid=CID-1&mj_token=${TOKEN}`), registry);
        registry.BindOutboundCall('CID-1', 'UUID-1'); // createCall resolves after the socket connected

        const events: string[] = [];
        registry.OnEvent('UUID-1', (e) => events.push(e.event));
        socket.emit('message', Buffer.from(JSON.stringify({ event: 'websocket:connected' })), false);

        expect(socket.close).not.toHaveBeenCalled();
        expect(events).toEqual(['websocket:connected']);
        registry.SendAudio('UUID-1', new ArrayBuffer(320));
        expect(socket.send).toHaveBeenCalledTimes(1);
    });

    it('closes a socket with a wrong token and attaches nothing', () => {
        const registry = new VonageCallMediaRegistry();
        registry.ExpectCall('CALL-1', TOKEN);
        const socket = fakeSocket();
        WireVonageMediaSocket(socket, upgrade('call_uuid=CALL-1&mj_token=wrong'), registry);
        expect(socket.close).toHaveBeenCalledTimes(1);
        expect(LogError).toHaveBeenCalled();
        socket.emit('close');
        expect(registry.HasCall('CALL-1')).toBe(true); // a refused socket must not end the legitimate call
    });

    it('closes a socket with no token', () => {
        const registry = new VonageCallMediaRegistry();
        registry.ExpectCall('CALL-1', TOKEN);
        const socket = fakeSocket();
        WireVonageMediaSocket(socket, upgrade('call_uuid=CALL-1'), registry);
        expect(socket.close).toHaveBeenCalledTimes(1);
    });

    it('closes a socket that names no call at all (the pre-existing no-call_uuid case)', () => {
        const registry = new VonageCallMediaRegistry();
        const socket = fakeSocket();
        WireVonageMediaSocket(socket, upgrade(`mj_token=${TOKEN}`), registry);
        expect(socket.close).toHaveBeenCalledTimes(1);
    });

    it('closes a socket claiming a call UUID MJ never registered, and creates no channel for it', () => {
        const registry = new VonageCallMediaRegistry();
        const socket = fakeSocket();
        WireVonageMediaSocket(socket, upgrade(`call_uuid=NEVER&mj_token=${TOKEN}`), registry);
        expect(socket.close).toHaveBeenCalledTimes(1);
        expect(registry.HasCall('NEVER')).toBe(false);
    });

    it('a second socket for an already-attached call is refused and does not replace the first', () => {
        const registry = new VonageCallMediaRegistry();
        registry.ExpectCall('CALL-1', TOKEN);
        const first = fakeSocket();
        const second = fakeSocket();
        WireVonageMediaSocket(first, upgrade(`call_uuid=CALL-1&mj_token=${TOKEN}`), registry);
        WireVonageMediaSocket(second, upgrade(`call_uuid=CALL-1&mj_token=${TOKEN}`), registry);

        expect(second.close).toHaveBeenCalledTimes(1);
        expect(first.close).not.toHaveBeenCalled();
        registry.SendAudio('CALL-1', new ArrayBuffer(320));
        expect(first.send).toHaveBeenCalledTimes(1);
        expect(second.send).not.toHaveBeenCalled();
    });

    it('ends the call when its authenticated socket closes', () => {
        const registry = new VonageCallMediaRegistry();
        registry.ExpectCall('CALL-1', TOKEN);
        const socket = fakeSocket();
        WireVonageMediaSocket(socket, upgrade(`call_uuid=CALL-1&mj_token=${TOKEN}`), registry);
        socket.emit('close');
        expect(registry.HasCall('CALL-1')).toBe(false);
    });
});
