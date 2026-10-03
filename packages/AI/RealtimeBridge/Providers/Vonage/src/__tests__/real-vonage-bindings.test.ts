import { describe, it, expect } from 'vitest';
import {
    RealVonageBindings,
    BuildVonageMediaUrl,
    GenerateVonageMediaToken,
    VONAGE_MEDIA_CORRELATION_PARAM,
    VONAGE_MEDIA_TOKEN_PARAM,
    BuildConnectNcco,
    BuildTransferNccoAction,
    ParseVonageControlEvent,
    IVonageVoiceLike,
    IVonageMediaPump,
    VonageCreateCallParams,
    VonageTransferParams,
    VonageControlEvent,
} from '../real-vonage-bindings';

// ──────────────────────────────────────────────────────────────────────────────
// Fakes for the injected Vonage surfaces — no network, no `@vonage/server-sdk` install.
// ──────────────────────────────────────────────────────────────────────────────

class FakeVoice implements IVonageVoiceLike {
    public Created?: VonageCreateCallParams;
    public readonly HungUp: string[] = [];
    public readonly Transfers: Array<{ callUuid: string; params: VonageTransferParams }> = [];
    public readonly Dtmfs: Array<{ callUuid: string; digits: string }> = [];

    public OnCreate?: () => void;
    public FailWith?: Error;
    public async CreateCall(params: VonageCreateCallParams): Promise<string> {
        this.Created = params;
        this.OnCreate?.();
        if (this.FailWith) {
            throw this.FailWith;
        }
        return 'von-created-1';
    }
    public async HangupCall(callUuid: string): Promise<void> {
        this.HungUp.push(callUuid);
    }
    public async TransferCall(callUuid: string, params: VonageTransferParams): Promise<void> {
        this.Transfers.push({ callUuid, params });
    }
    public async SendDtmf(callUuid: string, digits: string): Promise<void> {
        this.Dtmfs.push({ callUuid, digits });
    }
}

/** Fake pump modeling Vonage's binary-audio / text-event split (no envelope, no transcode). */
class FakeMediaPump implements IVonageMediaPump {
    public readonly SentAudio: Array<{ callUuid: string; pcm: ArrayBuffer }> = [];
    public readonly Cleared: string[] = [];
    public readonly Calls: string[] = [];
    public readonly Expected: Array<{ correlationId: string; token: string }> = [];
    public readonly Bound: Array<{ correlationId: string; callUuid: string }> = [];
    public readonly Abandoned: string[] = [];
    private audioHandlers = new Map<string, (pcm: ArrayBuffer) => void>();
    private eventHandlers = new Map<string, (event: VonageControlEvent) => void>();

    public SendAudio(callUuid: string, pcm: ArrayBuffer): void {
        this.SentAudio.push({ callUuid, pcm });
    }
    public OnAudio(callUuid: string, handler: (pcm: ArrayBuffer) => void): void {
        this.audioHandlers.set(callUuid, handler);
    }
    public OnEvent(callUuid: string, handler: (event: VonageControlEvent) => void): void {
        this.eventHandlers.set(callUuid, handler);
    }
    public Clear(callUuid: string): void {
        this.Cleared.push(callUuid);
    }
    public ExpectOutboundCall(correlationId: string, token: string): void {
        this.Calls.push('expect');
        this.Expected.push({ correlationId, token });
    }
    public BindOutboundCall(correlationId: string, callUuid: string): void {
        this.Calls.push('bind');
        this.Bound.push({ correlationId, callUuid });
    }
    public AbandonOutboundCall(correlationId: string): void {
        this.Calls.push('abandon');
        this.Abandoned.push(correlationId);
    }
    public DriveAudio(callUuid: string, pcm: ArrayBuffer): void {
        this.audioHandlers.get(callUuid)?.(pcm);
    }
    public DriveEvent(callUuid: string, event: VonageControlEvent): void {
        this.eventHandlers.get(callUuid)?.(event);
    }
}

function makeBindings(mediaWssUrl = 'wss://api.example/telephony/vonage/media'): {
    bindings: RealVonageBindings;
    voice: FakeVoice;
    pump: FakeMediaPump;
} {
    const voice = new FakeVoice();
    const pump = new FakeMediaPump();
    const bindings = new RealVonageBindings({ Voice: voice, MediaPump: pump, MediaWssUrl: mediaWssUrl });
    return { bindings, voice, pump };
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure NCCO helpers — the Vonage delta vs Twilio TwiML.
// ──────────────────────────────────────────────────────────────────────────────

describe('NCCO pure helpers', () => {
    it('buildConnectNcco emits a connect action with a websocket endpoint + default content-type', () => {
        const ncco = BuildConnectNcco('wss://h/media');
        expect(ncco).toHaveLength(1);
        expect(ncco[0].action).toBe('connect');
        expect(ncco[0].endpoint?.[0]).toMatchObject({
            type: 'websocket',
            uri: 'wss://h/media',
            'content-type': 'audio/l16;rate=8000',
        });
    });

    it('buildConnectNcco honors a custom content-type + forwards headers', () => {
        const ncco = BuildConnectNcco('wss://h/media', 'audio/l16;rate=16000', { callId: 'abc' });
        expect(ncco[0].endpoint?.[0]['content-type']).toBe('audio/l16;rate=16000');
        expect(ncco[0].endpoint?.[0].headers).toEqual({ callId: 'abc' });
    });

    it('buildTransferNccoAction connects to a phone endpoint for the transfer destination', () => {
        const ncco = BuildTransferNccoAction('+15551112222');
        expect(ncco[0].action).toBe('connect');
        expect(ncco[0].endpoint?.[0]).toMatchObject({ type: 'phone', number: '+15551112222' });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure control-event parsing — the JSON text frames (audio is binary, never JSON).
// ──────────────────────────────────────────────────────────────────────────────

describe('parseVonageControlEvent', () => {
    it('parses a DTMF event with the digit at the TOP level (not nested under dtmf)', () => {
        const event = ParseVonageControlEvent('{"event":"websocket:dtmf","digit":"5","duration":260}');
        expect(event).not.toBeNull();
        expect(event!.event).toBe('websocket:dtmf');
        expect(event!.digit).toBe('5');
        expect(event!.duration).toBe(260);
    });

    it('parses the connected + close lifecycle events', () => {
        expect(ParseVonageControlEvent('{"event":"websocket:connected"}')!.event).toBe('websocket:connected');
        expect(ParseVonageControlEvent('{"event":"close"}')!.event).toBe('close');
    });

    it('returns null for non-JSON, non-object JSON, or an object with no event string', () => {
        expect(ParseVonageControlEvent('not json')).toBeNull();
        expect(ParseVonageControlEvent('123')).toBeNull();
        expect(ParseVonageControlEvent('{"foo":"bar"}')).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealVonageBindings → injected Voice API surface.
// ──────────────────────────────────────────────────────────────────────────────

describe('RealVonageBindings — Voice API mapping', () => {
    it('createCall calls Voice with To/From and the connect-websocket NCCO, returning the UUID', async () => {
        const { bindings, voice } = makeBindings('wss://api.example/media');
        const uuid = await bindings.createCall('+15551234567', '+15559876543');
        expect(uuid).toBe('von-created-1');
        expect(voice.Created?.To).toBe('+15551234567');
        expect(voice.Created?.From).toBe('+15559876543');
        expect(voice.Created?.Ncco[0].action).toBe('connect');
        const uri = new URL(voice.Created?.Ncco[0].endpoint?.[0].uri ?? '');
        expect(`${uri.origin}${uri.pathname}`).toBe('wss://api.example/media');
        expect(voice.Created?.EventUrl).toBeUndefined();
    });

    it('createCall forwards an EventUrl from args', async () => {
        const { bindings, voice } = makeBindings();
        await bindings.createCall('+1', '+2', { EventUrl: 'https://cb/event' });
        expect(voice.Created?.EventUrl).toBe('https://cb/event');
    });

    it('hangupCall hangs up by UUID', async () => {
        const { bindings, voice } = makeBindings();
        await bindings.hangupCall('von9');
        expect(voice.HungUp).toEqual(['von9']);
    });

    it('transferCall transfers with a connect-phone NCCO', async () => {
        const { bindings, voice } = makeBindings();
        await bindings.transferCall('von9', '+15550001111');
        expect(voice.Transfers[0].callUuid).toBe('von9');
        expect(voice.Transfers[0].params.Ncco[0].endpoint?.[0]).toMatchObject({
            type: 'phone',
            number: '+15550001111',
        });
    });

    it('playDigits sends DTMF via the Voice API', async () => {
        const { bindings, voice } = makeBindings();
        await bindings.playDigits('von9', '456#');
        expect(voice.Dtmfs).toEqual([{ callUuid: 'von9', digits: '456#' }]);
    });

    it('acceptInbound is a no-op (no Voice call — the answer webhook already returned the connect NCCO)', async () => {
        const { bindings, voice } = makeBindings();
        await bindings.acceptInbound('von-inbound-1');
        expect(voice.Created).toBeUndefined();
        expect(voice.HungUp.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealVonageBindings → WebSocket media pump (binary audio + text-event DTMF/ended).
// ──────────────────────────────────────────────────────────────────────────────

describe('RealVonageBindings — WebSocket media mapping', () => {
    it('pushWebsocketAudio forwards PCM16 straight through as binary (no μ-law, no envelope)', () => {
        const { bindings, pump } = makeBindings();
        const pcm = new Int16Array([100, -100, 5000]).buffer;
        bindings.pushWebsocketAudio('von9', pcm);
        expect(pump.SentAudio.length).toBe(1);
        expect(pump.SentAudio[0].callUuid).toBe('von9');
        expect(new Uint8Array(pump.SentAudio[0].pcm)).toEqual(new Uint8Array(pcm));
    });

    it('onWebsocketAudio delivers inbound binary PCM16 frames verbatim', () => {
        const { bindings, pump } = makeBindings();
        const heard: ArrayBuffer[] = [];
        bindings.onWebsocketAudio('von9', (pcm) => heard.push(pcm));

        const pcm = new Int16Array([1, -1, 32767, -32768]).buffer;
        pump.DriveAudio('von9', pcm);

        expect(heard.length).toBe(1);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array(pcm));
    });

    it('onDigits surfaces websocket:dtmf-event digits (top-level digit) only', () => {
        const { bindings, pump } = makeBindings();
        const digits: string[] = [];
        bindings.onDigits('von9', (d) => digits.push(d));
        pump.DriveEvent('von9', { event: 'websocket:dtmf', digit: '7', duration: 100 });
        pump.DriveEvent('von9', { event: 'websocket:connected' }); // not dtmf
        expect(digits).toEqual(['7']);
    });

    it('onCallStatus fires on the websocket close event', () => {
        const { bindings, pump } = makeBindings();
        let ended = false;
        bindings.onCallStatus('von9', () => (ended = true));
        pump.DriveEvent('von9', { event: 'websocket:connected' });
        expect(ended).toBe(false);
        pump.DriveEvent('von9', { event: 'close' });
        expect(ended).toBe(true);
    });

    it('flushOutbound clears the call’s queued audio (barge-in)', () => {
        const { bindings, pump } = makeBindings();
        bindings.flushOutbound('von9');
        expect(pump.Cleared).toEqual(['von9']);
    });
});

describe('BuildVonageMediaUrl', () => {
    it('appends URL-encoded params', () => {
        expect(BuildVonageMediaUrl('wss://h/media', { call_uuid: 'a b', mj_token: 'x&y' })).toBe('wss://h/media?call_uuid=a%20b&mj_token=x%26y');
    });

    it('preserves an existing query string', () => {
        expect(BuildVonageMediaUrl('wss://h/media?region=eu', { mj_token: 't' })).toBe('wss://h/media?region=eu&mj_token=t');
    });

    it('returns the URL untouched when there is nothing to append', () => {
        expect(BuildVonageMediaUrl('wss://h/media', {})).toBe('wss://h/media');
    });
});

describe('GenerateVonageMediaToken', () => {
    it('yields 256 bits of hex that never repeats', () => {
        const a = GenerateVonageMediaToken();
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(GenerateVonageMediaToken()).not.toBe(a);
    });
});

describe('RealVonageBindings — outbound media correlation (the no-audio fix)', () => {
    it('puts a correlation id AND a token on the OUTBOUND websocket URI, so the media router can identify the call', async () => {
        const { bindings, voice, pump } = makeBindings('wss://api.example/telephony/vonage/media');

        await bindings.createCall('+15551234567', '+15559876543');

        const uri = new URL(voice.Created?.Ncco[0].endpoint?.[0].uri ?? '');
        expect(uri.searchParams.get(VONAGE_MEDIA_CORRELATION_PARAM)).toMatch(/^[0-9a-f-]{36}$/);
        expect(uri.searchParams.get(VONAGE_MEDIA_TOKEN_PARAM)).toMatch(/^[0-9a-f]{64}$/);
        expect(pump.Expected).toEqual([
            { correlationId: uri.searchParams.get(VONAGE_MEDIA_CORRELATION_PARAM), token: uri.searchParams.get(VONAGE_MEDIA_TOKEN_PARAM) },
        ]);
    });

    it('registers the expectation BEFORE createCall is issued, and binds the UUID AFTER it resolves', async () => {
        const { bindings, voice, pump } = makeBindings();
        const orderAtCreate: string[] = [];
        voice.OnCreate = () => orderAtCreate.push(...pump.Calls);

        const uuid = await bindings.createCall('+1', '+2');

        expect(orderAtCreate).toEqual(['expect']); // already registered when the REST call went out (a socket may connect first)
        expect(pump.Calls).toEqual(['expect', 'bind']);
        expect(pump.Bound).toEqual([{ correlationId: pump.Expected[0].correlationId, callUuid: uuid }]);
    });

    it('abandons the expectation when createCall fails, and rethrows', async () => {
        const { bindings, voice, pump } = makeBindings();
        voice.FailWith = new Error('vonage 429');

        await expect(bindings.createCall('+1', '+2')).rejects.toThrow('vonage 429');

        expect(pump.Calls).toEqual(['expect', 'abandon']);
        expect(pump.Abandoned).toEqual([pump.Expected[0].correlationId]);
        expect(pump.Bound).toEqual([]);
    });

    it('every call gets its own correlation id and token', async () => {
        const { bindings, pump } = makeBindings();
        await bindings.createCall('+1', '+2');
        await bindings.createCall('+1', '+2');
        expect(pump.Expected[0].correlationId).not.toBe(pump.Expected[1].correlationId);
        expect(pump.Expected[0].token).not.toBe(pump.Expected[1].token);
    });

    it('tolerates a media pump that does not authenticate sockets (no outbound-correlation hooks)', async () => {
        const voice = new FakeVoice();
        const pump = new FakeMediaPump();
        (pump as { ExpectOutboundCall?: unknown }).ExpectOutboundCall = undefined;
        (pump as { BindOutboundCall?: unknown }).BindOutboundCall = undefined;
        const bindings = new RealVonageBindings({ Voice: voice, MediaPump: pump, MediaWssUrl: 'wss://x' });
        await expect(bindings.createCall('+1', '+2')).resolves.toBe('von-created-1');
    });

    it('passes machine detection through to createCall when configured, and omits it otherwise', async () => {
        const voice = new FakeVoice();
        const withMd = new RealVonageBindings({ Voice: voice, MediaPump: new FakeMediaPump(), MediaWssUrl: 'wss://x', MachineDetection: 'hangup' });
        await withMd.createCall('+1', '+2');
        expect(voice.Created?.MachineDetection).toBe('hangup');

        const { bindings, voice: voice2 } = makeBindings();
        await bindings.createCall('+1', '+2');
        expect(voice2.Created?.MachineDetection).toBeUndefined();
    });
});
