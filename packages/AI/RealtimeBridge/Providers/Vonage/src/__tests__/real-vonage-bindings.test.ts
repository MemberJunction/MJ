import { describe, it, expect } from 'vitest';
import { muLawToPcm16Buffer, pcm16ToMuLawBuffer } from '@memberjunction/ai-bridge-base';
import {
    RealVonageBindings,
    buildConnectNcco,
    buildTransferNccoAction,
    parseVonageMediaFrame,
    encodeVonageMediaFrame,
    IVonageVoiceLike,
    IVonageMediaPump,
    VonageCreateCallParams,
    VonageTransferParams,
    VonageMediaFrame,
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

class FakeMediaPump implements IVonageMediaPump {
    public readonly Sent: Array<{ callUuid: string; frame: VonageMediaFrame }> = [];
    private handlers = new Map<string, (frame: VonageMediaFrame) => void>();

    public Send(callUuid: string, frame: VonageMediaFrame): void {
        this.Sent.push({ callUuid, frame });
    }
    public OnFrame(callUuid: string, handler: (frame: VonageMediaFrame) => void): void {
        this.handlers.set(callUuid, handler);
    }
    public Drive(callUuid: string, frame: VonageMediaFrame): void {
        this.handlers.get(callUuid)?.(frame);
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

/** A base64 μ-law payload over a known μ-law byte run, for round-trip checks. */
function muLawBase64(bytes: number[]): string {
    return Buffer.from(Uint8Array.from(bytes)).toString('base64');
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
// Pure media-frame transcode via the T0 codec.
// ──────────────────────────────────────────────────────────────────────────────

describe('media-frame transcode (T0 codec)', () => {
    it('parseVonageMediaFrame decodes base64 μ-law to PCM16 matching the codec', () => {
        const mulawBytes = [0xff, 0x80, 0x00, 0x7f, 0x40];
        const frame: VonageMediaFrame = { event: 'media', payload: muLawBase64(mulawBytes) };
        const pcm = parseVonageMediaFrame(frame);
        expect(pcm).not.toBeNull();
        const expected = muLawToPcm16Buffer(Uint8Array.from(mulawBytes).buffer);
        expect(new Uint8Array(pcm!)).toEqual(new Uint8Array(expected));
    });

    it('parseVonageMediaFrame returns null for non-media events', () => {
        expect(parseVonageMediaFrame({ event: 'websocket:dtmf', dtmf: { digit: '1' } })).toBeNull();
        expect(parseVonageMediaFrame({ event: 'close' })).toBeNull();
        expect(parseVonageMediaFrame({ event: 'media' })).toBeNull();
    });

    it('encodeVonageMediaFrame encodes PCM16 to base64 μ-law matching the codec', () => {
        const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]).buffer;
        const frame = encodeVonageMediaFrame(pcm);
        expect(frame.event).toBe('media');
        const expectedMulaw = pcm16ToMuLawBuffer(pcm);
        expect(frame.payload).toBe(Buffer.from(new Uint8Array(expectedMulaw)).toString('base64'));
    });

    it('round-trips μ-law base64 → PCM16 → back through the codec (lossy-stable)', () => {
        const mulawBytes = [0x10, 0x20, 0x30, 0x40, 0x50, 0xaa, 0x55];
        const inFrame: VonageMediaFrame = { event: 'media', payload: muLawBase64(mulawBytes) };
        const pcm = parseVonageMediaFrame(inFrame)!;
        const outFrame = encodeVonageMediaFrame(pcm);
        expect(Buffer.from(outFrame.payload!, 'base64')).toEqual(Buffer.from(Uint8Array.from(mulawBytes)));
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
// RealVonageBindings → WebSocket media pump (audio + DTMF + ended).
// ──────────────────────────────────────────────────────────────────────────────

describe('RealVonageBindings — WebSocket media mapping', () => {
    it('pushWebsocketAudio encodes PCM16 to a μ-law media frame', () => {
        const { bindings, pump } = makeBindings();
        const pcm = new Int16Array([100, -100, 5000]).buffer;
        bindings.pushWebsocketAudio('von9', pcm);
        expect(pump.Sent.length).toBe(1);
        expect(pump.Sent[0].callUuid).toBe('von9');
        const expectedMulaw = pcm16ToMuLawBuffer(pcm);
        expect(pump.Sent[0].frame.payload).toBe(Buffer.from(new Uint8Array(expectedMulaw)).toString('base64'));
    });

    it('onWebsocketAudio delivers decoded PCM16 for media frames and ignores non-media', () => {
        const { bindings, pump } = makeBindings();
        const heard: ArrayBuffer[] = [];
        bindings.onWebsocketAudio('von9', (pcm) => heard.push(pcm));

        const mulawBytes = [0xff, 0x00, 0x7f];
        pump.Drive('von9', { event: 'media', payload: muLawBase64(mulawBytes) });
        pump.Drive('von9', { event: 'close' }); // ignored

        expect(heard.length).toBe(1);
        const expected = muLawToPcm16Buffer(Uint8Array.from(mulawBytes).buffer);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array(expected));
    });

    it('onDigits surfaces websocket:dtmf-event digits only', () => {
        const { bindings, pump } = makeBindings();
        const digits: string[] = [];
        bindings.onDigits('von9', (d) => digits.push(d));
        pump.Drive('von9', { event: 'websocket:dtmf', dtmf: { digit: '7' } });
        pump.Drive('von9', { event: 'media', payload: muLawBase64([0x00]) }); // not dtmf
        expect(digits).toEqual(['7']);
    });

    it('onCallStatus fires on the websocket close event', () => {
        const { bindings, pump } = makeBindings();
        let ended = false;
        bindings.onCallStatus('von9', () => (ended = true));
        pump.Drive('von9', { event: 'media', payload: muLawBase64([0x00]) });
        expect(ended).toBe(false);
        pump.Drive('von9', { event: 'close' });
        expect(ended).toBe(true);
    });
});
