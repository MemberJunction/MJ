import { describe, it, expect } from 'vitest';
import {
    RealVonageBindings,
    buildConnectNcco,
    buildTransferNccoAction,
    parseVonageControlEvent,
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

    public async CreateCall(params: VonageCreateCallParams): Promise<string> {
        this.Created = params;
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
        const ncco = buildConnectNcco('wss://h/media');
        expect(ncco).toHaveLength(1);
        expect(ncco[0].action).toBe('connect');
        expect(ncco[0].endpoint?.[0]).toMatchObject({
            type: 'websocket',
            uri: 'wss://h/media',
            'content-type': 'audio/l16;rate=8000',
        });
    });

    it('buildConnectNcco honors a custom content-type + forwards headers', () => {
        const ncco = buildConnectNcco('wss://h/media', 'audio/l16;rate=16000', { callId: 'abc' });
        expect(ncco[0].endpoint?.[0]['content-type']).toBe('audio/l16;rate=16000');
        expect(ncco[0].endpoint?.[0].headers).toEqual({ callId: 'abc' });
    });

    it('buildTransferNccoAction connects to a phone endpoint for the transfer destination', () => {
        const ncco = buildTransferNccoAction('+15551112222');
        expect(ncco[0].action).toBe('connect');
        expect(ncco[0].endpoint?.[0]).toMatchObject({ type: 'phone', number: '+15551112222' });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure control-event parsing — the JSON text frames (audio is binary, never JSON).
// ──────────────────────────────────────────────────────────────────────────────

describe('parseVonageControlEvent', () => {
    it('parses a DTMF event with the digit at the TOP level (not nested under dtmf)', () => {
        const event = parseVonageControlEvent('{"event":"websocket:dtmf","digit":"5","duration":260}');
        expect(event).not.toBeNull();
        expect(event!.event).toBe('websocket:dtmf');
        expect(event!.digit).toBe('5');
        expect(event!.duration).toBe(260);
    });

    it('parses the connected + close lifecycle events', () => {
        expect(parseVonageControlEvent('{"event":"websocket:connected"}')!.event).toBe('websocket:connected');
        expect(parseVonageControlEvent('{"event":"close"}')!.event).toBe('close');
    });

    it('returns null for non-JSON, non-object JSON, or an object with no event string', () => {
        expect(parseVonageControlEvent('not json')).toBeNull();
        expect(parseVonageControlEvent('123')).toBeNull();
        expect(parseVonageControlEvent('{"foo":"bar"}')).toBeNull();
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
        expect(voice.Created?.Ncco[0].endpoint?.[0].uri).toBe('wss://api.example/media');
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
