import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
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
import { ComputeTwilioSignature } from '@memberjunction/ai-bridge-twilio';
import { ResolveInboundContext } from '../telephony/runAsIdentity.js';
import {
    HandleTwilioAmdCallback,
    HandleTwilioInboundVoice,
    HandleTwilioStatusCallback,
    MEDIA_SOCKET_AUTH_DEADLINE_MS,
    WireTwilioMediaSocket,
    type TwilioTelephonyServiceLike,
} from '../telephony/TwilioTelephonyRouter.js';
import { TwilioCallMediaRegistry } from '../telephony/twilioMediaRegistry.js';
import type { TwilioTelephonyConfig } from '../types.js';

const AUTH_TOKEN = 'twilio-auth-token';
const PUBLIC_URL = 'https://api.acme.com';
const CONFIG: TwilioTelephonyConfig = {
    accountSid: 'AC1',
    authToken: AUTH_TOKEN,
    streamPublicUrl: 'wss://api.acme.com/telephony/twilio/media',
    inboundRunAsUserEmail: 'phone-bot@acme.com',
};
const USER = { ID: 'u1' } as unknown as UserInfo;
const PROVIDER = {} as unknown as IMetadataProvider;

interface FakeRes {
    statusCode?: number;
    contentType?: string;
    body?: unknown;
    ended: boolean;
}

function fakeRes(): Response & FakeRes {
    const res: FakeRes & Record<string, unknown> = { ended: false };
    res['status'] = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res['type'] = (t: string) => {
        res.contentType = t;
        return res;
    };
    res['send'] = (b: unknown) => {
        res.body = b;
        return res;
    };
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

/** A request signed the way Twilio signs it (or with a bad signature when `signed` is false). */
function signedReq(path: string, params: Record<string, string>, signed = true): Request {
    const signature = signed ? ComputeTwilioSignature(AUTH_TOKEN, `${PUBLIC_URL}${path}`, params) : 'forged';
    return { body: params, originalUrl: path, get: (h: string) => (h === 'X-Twilio-Signature' ? signature : undefined) } as unknown as Request;
}

function fakeService(overrides: Partial<TwilioTelephonyServiceLike> = {}): TwilioTelephonyServiceLike & { [K in keyof TwilioTelephonyServiceLike]: ReturnType<typeof vi.fn> } {
    return {
        HandleInboundCall: vi.fn(async () => ({ accepted: true, MediaToken: 'TOK123' })),
        HandleStatusCallback: vi.fn(async () => undefined),
        HandleAnsweringMachine: vi.fn(async () => undefined),
        ...overrides,
    } as never;
}

const VOICE_PARAMS = { CallSid: 'CA1', From: '+14155550123', To: '+18005550100' };

beforeEach(() => {
    vi.mocked(LogError).mockClear();
    vi.mocked(ResolveInboundContext).mockReset();
    vi.mocked(ResolveInboundContext).mockReturnValue({ Ok: true, User: USER, Provider: PROVIDER });
});

describe('signature URL', () => {
    it('is the public ORIGIN plus the request path, even when the public URL carries the GraphQL path', async () => {
        const service = fakeService();
        const publicUrl = 'https://api.acme.com/graphql';
        const path = '/telephony/twilio/status';
        const params = { CallSid: 'CA1', CallStatus: 'completed' };
        const signature = ComputeTwilioSignature(AUTH_TOKEN, `https://api.acme.com${path}`, params);
        const req = { body: params, originalUrl: path, get: (h: string) => (h === 'X-Twilio-Signature' ? signature : undefined) } as unknown as Request;
        const res = fakeRes();
        await HandleTwilioStatusCallback(service, CONFIG, publicUrl, req, res);
        expect(res.statusCode).not.toBe(403);
        expect(service.HandleStatusCallback).toHaveBeenCalledWith('CA1', 'completed');
    });
});

describe('POST /voice (HandleTwilioInboundVoice)', () => {
    it('answers 403 and never touches the service when the signature is wrong', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleTwilioInboundVoice(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS, false), res);
        expect(res.statusCode).toBe(403);
        expect(service.HandleInboundCall).not.toHaveBeenCalled();
        expect(ResolveInboundContext).not.toHaveBeenCalled();
    });

    it('answers 403 when the auth token is not configured (it can never verify)', async () => {
        const res = fakeRes();
        await HandleTwilioInboundVoice(fakeService(), { ...CONFIG, authToken: undefined }, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), res);
        expect(res.statusCode).toBe(403);
    });

    it('rejects the call with a polite TwiML and logs the dialed number when there is no run-as user', async () => {
        vi.mocked(ResolveInboundContext).mockReturnValue({ Ok: false, Reason: 'telephony.inboundRunAsUserEmail is not configured' });
        const service = fakeService();
        const res = fakeRes();

        await HandleTwilioInboundVoice(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), res);

        expect(res.statusCode).toBe(200);
        expect(String(res.body)).toContain('<Say>');
        expect(String(res.body)).toContain('<Hangup/>');
        expect(String(res.body)).not.toContain('<Connect>');
        expect(service.HandleInboundCall).not.toHaveBeenCalled();
        const logged = String(vi.mocked(LogError).mock.calls[0][0]);
        expect(logged).toContain('+18005550100');
        expect(logged).toContain('inboundRunAsUserEmail');
    });

    it('resolves the run-as user from the configured email', async () => {
        await HandleTwilioInboundVoice(fakeService(), CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), fakeRes());
        expect(ResolveInboundContext).toHaveBeenCalledWith('phone-bot@acme.com');
    });

    it('admits the call as the run-as user and answers with the stream TwiML carrying the per-call token', async () => {
        const service = fakeService();
        const res = fakeRes();

        await HandleTwilioInboundVoice(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), res);

        expect(service.HandleInboundCall).toHaveBeenCalledWith({ callSid: 'CA1', from: '+14155550123', to: '+18005550100' }, USER, PROVIDER);
        expect(res.statusCode).toBe(200);
        expect(res.contentType).toBe('text/xml');
        const twiml = String(res.body);
        expect(twiml).toContain('<Stream url="wss://api.acme.com/telephony/twilio/media">');
        expect(twiml).toContain('<Parameter name="mjToken" value="TOK123"/>');
    });

    it('answers BEFORE the bridge session has finished starting (it never waits on the background start)', async () => {
        const never = new Promise<void>(() => undefined);
        const service = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: true, MediaToken: 'TOK', Started: never })) });
        const res = fakeRes();

        await HandleTwilioInboundVoice(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), res);

        expect(String(res.body)).toContain('<Connect>'); // handler returned and responded although `Started` is still pending
    });

    it('answers with the "no agent" TwiML when the service does not accept the call', async () => {
        const service = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: false, reason: 'No active agent identity' })) });
        const res = fakeRes();
        await HandleTwilioInboundVoice(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), res);
        expect(String(res.body)).toContain('no agent is available');
        expect(String(res.body)).not.toContain('<Connect>');
    });

    it('never emits a stream TwiML without a token, even if the service claims acceptance', async () => {
        const service = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: true })) });
        const res = fakeRes();
        await HandleTwilioInboundVoice(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), res);
        expect(String(res.body)).not.toContain('<Connect>');
    });

    it('answers a polite hang-up (not a 500) for a webhook missing required params', async () => {
        const res = fakeRes();
        await HandleTwilioInboundVoice(fakeService(), CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', { CallSid: 'CA1' }), res);
        expect(res.statusCode).toBe(200);
        expect(String(res.body)).toContain('<Hangup/>');
    });
});

describe('POST /voice — concurrent-call cap', () => {
    it('answers a polite "all agents are busy" (not "no agent") when the server is at its cap', async () => {
        const service = fakeService({ HandleInboundCall: vi.fn(async () => ({ accepted: false, Busy: true, reason: 'All agent lines are busy.' })) });
        const res = fakeRes();
        await HandleTwilioInboundVoice(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/voice', VOICE_PARAMS), res);
        expect(res.statusCode).toBe(200);
        expect(String(res.body)).toMatch(/busy/i);
        expect(String(res.body)).toContain('<Hangup/>');
        expect(String(res.body)).not.toContain('no agent is available');
    });
});

describe('POST /status (HandleTwilioStatusCallback)', () => {
    it('answers 403 and does nothing when the signature is wrong', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleTwilioStatusCallback(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/status', { CallSid: 'CA1', CallStatus: 'completed' }, false), res);
        expect(res.statusCode).toBe(403);
        expect(service.HandleStatusCallback).not.toHaveBeenCalled();
    });

    it('hands the call SID and status to the service (which ends the session on a terminal status) and acknowledges', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleTwilioStatusCallback(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/status', { CallSid: 'CA1', CallStatus: 'no-answer' }), res);
        expect(service.HandleStatusCallback).toHaveBeenCalledWith('CA1', 'no-answer');
        expect(res.statusCode).toBe(200);
        expect(res.ended).toBe(true);
    });

    it('still acknowledges when the service throws (so Twilio does not retry a poisoned callback forever)', async () => {
        const service = fakeService({ HandleStatusCallback: vi.fn(async () => { throw new Error('boom'); }) });
        const res = fakeRes();
        await HandleTwilioStatusCallback(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/status', { CallSid: 'CA1', CallStatus: 'failed' }), res);
        expect(res.statusCode).toBe(200);
        expect(LogError).toHaveBeenCalled();
    });

    it('ignores a callback with no CallSid', async () => {
        const service = fakeService();
        await HandleTwilioStatusCallback(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/status', { CallStatus: 'completed' }), fakeRes());
        expect(service.HandleStatusCallback).not.toHaveBeenCalled();
    });
});

describe('POST /amd (HandleTwilioAmdCallback)', () => {
    it('answers 403 and does nothing when the signature is wrong', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleTwilioAmdCallback(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/amd', { CallSid: 'CA1', AnsweredBy: 'machine_start' }, false), res);
        expect(res.statusCode).toBe(403);
        expect(service.HandleAnsweringMachine).not.toHaveBeenCalled();
    });

    it('hands the verdict to the service and acknowledges', async () => {
        const service = fakeService();
        const res = fakeRes();
        await HandleTwilioAmdCallback(service, CONFIG, PUBLIC_URL, signedReq('/telephony/twilio/amd', { CallSid: 'CA1', AnsweredBy: 'machine_end_beep' }), res);
        expect(service.HandleAnsweringMachine).toHaveBeenCalledWith('CA1', 'machine_end_beep');
        expect(res.statusCode).toBe(200);
    });
});

/** A fake `ws` socket: an EventEmitter with `send`/`close` spies. */
function fakeSocket(): WebSocket & EventEmitter & { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
    const socket = new EventEmitter() as WebSocket & EventEmitter & { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
    socket.send = vi.fn();
    socket.close = vi.fn();
    return socket;
}

const TOKEN = 't'.repeat(64);
const startFrame = (callSid: string, token: string | undefined, streamSid = 'MZ1') =>
    JSON.stringify({ event: 'start', start: { callSid, streamSid, customParameters: token === undefined ? {} : { mjToken: token } } });
const mediaFrame = (payload: string) => JSON.stringify({ event: 'media', media: { payload } });

describe('Media-Streams socket (WireTwilioMediaSocket)', () => {
    it('attaches on a `start` frame carrying the call\'s token, then routes frames to the call\'s handlers', () => {
        const registry = new TwilioCallMediaRegistry();
        registry.ExpectCall('CA1', TOKEN);
        const received: string[] = [];
        registry.OnFrame('CA1', (f) => received.push(f.event));
        const socket = fakeSocket();
        WireTwilioMediaSocket(socket, registry);

        socket.emit('message', startFrame('CA1', TOKEN));
        socket.emit('message', mediaFrame('abc'));

        expect(socket.close).not.toHaveBeenCalled();
        expect(received).toEqual(['media']);
        expect(registry.GetStreamSid('CA1')).toBe('MZ1');
    });

    it('closes a socket whose `start` frame carries a WRONG token, and routes nothing from it', () => {
        const registry = new TwilioCallMediaRegistry();
        registry.ExpectCall('CA1', TOKEN);
        const received: string[] = [];
        registry.OnFrame('CA1', (f) => received.push(f.event));
        const socket = fakeSocket();
        WireTwilioMediaSocket(socket, registry);

        socket.emit('message', startFrame('CA1', 'wrong'));
        socket.emit('message', mediaFrame('injected'));

        expect(socket.close).toHaveBeenCalledTimes(1);
        expect(received).toEqual([]);
        expect(LogError).toHaveBeenCalled();
    });

    it('closes a socket whose `start` frame carries NO token', () => {
        const registry = new TwilioCallMediaRegistry();
        registry.ExpectCall('CA1', TOKEN);
        const socket = fakeSocket();
        WireTwilioMediaSocket(socket, registry);
        socket.emit('message', startFrame('CA1', undefined));
        expect(socket.close).toHaveBeenCalledTimes(1);
    });

    it('closes a socket claiming a call SID MJ never registered, and creates no channel for it', () => {
        const registry = new TwilioCallMediaRegistry();
        const socket = fakeSocket();
        WireTwilioMediaSocket(socket, registry);
        socket.emit('message', startFrame('CA-NEVER-SEEN', TOKEN));
        expect(socket.close).toHaveBeenCalledTimes(1);
        expect(registry.HasCall('CA-NEVER-SEEN')).toBe(false);
    });

    it('a second socket for an already-attached call is refused, does not replace the first, and its close does not end the call', () => {
        const registry = new TwilioCallMediaRegistry();
        registry.ExpectCall('CA1', TOKEN);
        const first = fakeSocket();
        const second = fakeSocket();
        WireTwilioMediaSocket(first, registry);
        WireTwilioMediaSocket(second, registry);
        first.emit('message', startFrame('CA1', TOKEN));

        second.emit('message', startFrame('CA1', TOKEN, 'MZ-attacker'));
        second.emit('close'); // the refused socket going away must not tear the live call down

        expect(second.close).toHaveBeenCalledTimes(1);
        expect(first.close).not.toHaveBeenCalled();
        expect(registry.HasCall('CA1')).toBe(true);
        expect(registry.GetStreamSid('CA1')).toBe('MZ1');
        registry.Send('CA1', { event: 'media', streamSid: 'MZ1', media: { payload: 'agent voice' } });
        expect(first.send).toHaveBeenCalledTimes(1);
        expect(second.send).not.toHaveBeenCalled();
    });

    it('ignores a repeated `start` on an authenticated socket (it is not re-authenticated and not closed)', () => {
        const registry = new TwilioCallMediaRegistry();
        registry.ExpectCall('CA1', TOKEN);
        const socket = fakeSocket();
        WireTwilioMediaSocket(socket, registry);
        socket.emit('message', startFrame('CA1', TOKEN));
        socket.emit('message', startFrame('CA1', TOKEN));
        expect(socket.close).not.toHaveBeenCalled();
    });

    it('ends the call when its authenticated socket closes', () => {
        const registry = new TwilioCallMediaRegistry();
        registry.ExpectCall('CA1', TOKEN);
        const socket = fakeSocket();
        WireTwilioMediaSocket(socket, registry);
        socket.emit('message', startFrame('CA1', TOKEN));
        socket.emit('close');
        expect(registry.HasCall('CA1')).toBe(false);
    });

    it('ignores non-JSON frames and frames before `start`', () => {
        const registry = new TwilioCallMediaRegistry();
        registry.ExpectCall('CA1', TOKEN);
        const received: string[] = [];
        registry.OnFrame('CA1', (f) => received.push(f.event));
        const socket = fakeSocket();
        WireTwilioMediaSocket(socket, registry);
        socket.emit('message', 'not json');
        socket.emit('message', mediaFrame('early'));
        expect(received).toEqual([]);
        expect(socket.close).not.toHaveBeenCalled();
    });

    describe('auth deadline', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('closes and logs a socket that never sends a `start` frame', () => {
            const socket = fakeSocket();
            WireTwilioMediaSocket(socket, new TwilioCallMediaRegistry());
            vi.advanceTimersByTime(MEDIA_SOCKET_AUTH_DEADLINE_MS - 1);
            expect(socket.close).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(socket.close).toHaveBeenCalledTimes(1);
            expect(LogError).toHaveBeenCalled();
        });

        it('does not close an authenticated socket when the deadline passes', () => {
            const registry = new TwilioCallMediaRegistry();
            registry.ExpectCall('CA1', TOKEN);
            const socket = fakeSocket();
            WireTwilioMediaSocket(socket, registry);
            socket.emit('message', startFrame('CA1', TOKEN));
            expect(vi.getTimerCount()).toBe(0);
            vi.advanceTimersByTime(MEDIA_SOCKET_AUTH_DEADLINE_MS * 2);
            expect(socket.close).not.toHaveBeenCalled();
        });

        it('clears the pending deadline when the socket closes or errors before authenticating', () => {
            const closed = fakeSocket();
            WireTwilioMediaSocket(closed, new TwilioCallMediaRegistry());
            closed.emit('close');
            expect(vi.getTimerCount()).toBe(0);

            const errored = fakeSocket();
            WireTwilioMediaSocket(errored, new TwilioCallMediaRegistry());
            errored.emit('error', new Error('boom'));
            expect(vi.getTimerCount()).toBe(0);
            vi.advanceTimersByTime(MEDIA_SOCKET_AUTH_DEADLINE_MS * 2);
            expect(errored.close).not.toHaveBeenCalled();
        });
    });
});
