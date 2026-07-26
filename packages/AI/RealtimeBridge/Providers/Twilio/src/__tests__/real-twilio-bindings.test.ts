import { describe, it, expect } from 'vitest';
import { muLawToPcm16Buffer, pcm16ToMuLawBuffer } from '@memberjunction/ai-bridge-base';
import {
    RealTwilioBindings,
    buildConnectStreamTwiML,
    buildDialTwiML,
    buildPlayDigitsTwiML,
    parseTwilioMediaFrame,
    encodeTwilioMediaFrame,
    ITwilioRestLike,
    ITwilioMediaPump,
    TwilioCreateCallParams,
    TwilioUpdateCallParams,
    TwilioMediaFrame,
} from '../real-twilio-bindings';

// ──────────────────────────────────────────────────────────────────────────────
// Fakes for the injected Twilio surfaces — no network, no `twilio` install.
// ──────────────────────────────────────────────────────────────────────────────

class FakeRest implements ITwilioRestLike {
    public Created?: TwilioCreateCallParams;
    public readonly Updates: Array<{ callSid: string; params: TwilioUpdateCallParams }> = [];

    public async CreateCall(params: TwilioCreateCallParams): Promise<string> {
        this.Created = params;
        return 'CA-created-1';
    }
    public async UpdateCall(callSid: string, params: TwilioUpdateCallParams): Promise<void> {
        this.Updates.push({ callSid, params });
    }
}

class FakeMediaPump implements ITwilioMediaPump {
    public readonly Sent: Array<{ callSid: string; frame: TwilioMediaFrame }> = [];
    private handlers = new Map<string, (frame: TwilioMediaFrame) => void>();
    private streamSids = new Map<string, string>();

    public Send(callSid: string, frame: TwilioMediaFrame): void {
        this.Sent.push({ callSid, frame });
    }
    public OnFrame(callSid: string, handler: (frame: TwilioMediaFrame) => void): void {
        this.handlers.set(callSid, handler);
    }
    public GetStreamSid(callSid: string): string {
        return this.streamSids.get(callSid) ?? `MZ-${callSid}`;
    }
    // drive helper: simulate an inbound frame for a call
    public Drive(callSid: string, frame: TwilioMediaFrame): void {
        this.handlers.get(callSid)?.(frame);
    }
    public SetStreamSid(callSid: string, streamSid: string): void {
        this.streamSids.set(callSid, streamSid);
    }
}

function makeBindings(streamUrl = 'wss://api.example/telephony/twilio/media'): {
    bindings: RealTwilioBindings;
    rest: FakeRest;
    pump: FakeMediaPump;
} {
    const rest = new FakeRest();
    const pump = new FakeMediaPump();
    const bindings = new RealTwilioBindings({ Rest: rest, MediaPump: pump, StreamUrl: streamUrl });
    return { bindings, rest, pump };
}

/** A base64 μ-law payload over a known μ-law byte run, for round-trip checks. */
function muLawBase64(bytes: number[]): string {
    return Buffer.from(Uint8Array.from(bytes)).toString('base64');
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure TwiML helpers.
// ──────────────────────────────────────────────────────────────────────────────

describe('TwiML pure helpers', () => {
    it('buildConnectStreamTwiML emits a bidirectional <Connect><Stream> with the escaped url', () => {
        const twiml = buildConnectStreamTwiML('wss://h/media?x=1&y=2');
        expect(twiml).toContain('<Connect>');
        expect(twiml).toContain('<Stream url="wss://h/media?x=1&amp;y=2" />');
        expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('buildPlayDigitsTwiML emits <Play digits>', () => {
        expect(buildPlayDigitsTwiML('12#')).toContain('<Play digits="12#" />');
    });

    it('buildDialTwiML emits <Dial>destination</Dial>', () => {
        expect(buildDialTwiML('+15551112222')).toContain('<Dial>+15551112222</Dial>');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure media-frame transcode via the T0 codec.
// ──────────────────────────────────────────────────────────────────────────────

describe('media-frame transcode (T0 codec)', () => {
    it('parseTwilioMediaFrame decodes base64 μ-law to PCM16 matching the codec', () => {
        const mulawBytes = [0xff, 0x80, 0x00, 0x7f, 0x40];
        const frame: TwilioMediaFrame = { event: 'media', streamSid: 'MZ1', media: { payload: muLawBase64(mulawBytes) } };
        const pcm = parseTwilioMediaFrame(frame);
        expect(pcm).not.toBeNull();
        const expected = muLawToPcm16Buffer(Uint8Array.from(mulawBytes).buffer);
        expect(new Uint8Array(pcm!)).toEqual(new Uint8Array(expected));
    });

    it('parseTwilioMediaFrame returns null for non-media events', () => {
        expect(parseTwilioMediaFrame({ event: 'start', streamSid: 'MZ1' })).toBeNull();
        expect(parseTwilioMediaFrame({ event: 'stop' })).toBeNull();
        expect(parseTwilioMediaFrame({ event: 'media' })).toBeNull();
    });

    it('encodeTwilioMediaFrame encodes PCM16 to base64 μ-law matching the codec', () => {
        const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]).buffer;
        const frame = encodeTwilioMediaFrame(pcm, 'MZ1');
        expect(frame.event).toBe('media');
        expect(frame.streamSid).toBe('MZ1');
        const expectedMulaw = pcm16ToMuLawBuffer(pcm);
        expect(frame.media!.payload).toBe(Buffer.from(new Uint8Array(expectedMulaw)).toString('base64'));
    });

    it('round-trips μ-law base64 → PCM16 → back through the codec (lossy-stable)', () => {
        const mulawBytes = [0x10, 0x20, 0x30, 0x40, 0x50, 0xaa, 0x55];
        // base64 μ-law IN → PCM16
        const inFrame: TwilioMediaFrame = { event: 'media', media: { payload: muLawBase64(mulawBytes) } };
        const pcm = parseTwilioMediaFrame(inFrame)!;
        // PCM16 → base64 μ-law OUT
        const outFrame = encodeTwilioMediaFrame(pcm, 'MZ1');
        // μ-law is companded; decode→encode is idempotent on μ-law codes → identical bytes back.
        expect(Buffer.from(outFrame.media!.payload, 'base64')).toEqual(Buffer.from(Uint8Array.from(mulawBytes)));
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealTwilioBindings → injected REST surface.
// ──────────────────────────────────────────────────────────────────────────────

describe('RealTwilioBindings — REST mapping', () => {
    it('createCall calls REST with To/From and the <Connect><Stream> TwiML, returning the SID', async () => {
        const { bindings, rest } = makeBindings('wss://api.example/media');
        const sid = await bindings.createCall('+15551234567', '+15559876543');
        expect(sid).toBe('CA-created-1');
        expect(rest.Created?.To).toBe('+15551234567');
        expect(rest.Created?.From).toBe('+15559876543');
        expect(rest.Created?.Twiml).toContain('<Stream url="wss://api.example/media" />');
        expect(rest.Created?.StatusCallback).toBeUndefined();
    });

    it('createCall forwards a StatusCallback from args', async () => {
        const { bindings, rest } = makeBindings();
        await bindings.createCall('+1', '+2', { StatusCallback: 'https://cb/status' });
        expect(rest.Created?.StatusCallback).toBe('https://cb/status');
    });

    it('completeCall issues a completed status update', async () => {
        const { bindings, rest } = makeBindings();
        await bindings.completeCall('CA9');
        expect(rest.Updates).toEqual([{ callSid: 'CA9', params: { Status: 'completed' } }]);
    });

    it('redirectCall updates with <Dial> transfer TwiML', async () => {
        const { bindings, rest } = makeBindings();
        await bindings.redirectCall('CA9', '+15550001111');
        expect(rest.Updates[0].callSid).toBe('CA9');
        expect(rest.Updates[0].params.Twiml).toContain('<Dial>+15550001111</Dial>');
    });

    it('playDigits updates with <Play digits> TwiML', async () => {
        const { bindings, rest } = makeBindings();
        await bindings.playDigits('CA9', '456#');
        expect(rest.Updates[0].params.Twiml).toContain('<Play digits="456#" />');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealTwilioBindings → Media-Streams pump (audio + DTMF + ended).
// ──────────────────────────────────────────────────────────────────────────────

describe('RealTwilioBindings — Media Streams mapping', () => {
    it('pushStreamAudio encodes PCM16 to a μ-law frame addressed to the stream SID', () => {
        const { bindings, pump } = makeBindings();
        pump.SetStreamSid('CA9', 'MZ-abc');
        const pcm = new Int16Array([100, -100, 5000]).buffer;
        bindings.pushStreamAudio('CA9', pcm);
        expect(pump.Sent.length).toBe(1);
        expect(pump.Sent[0].callSid).toBe('CA9');
        expect(pump.Sent[0].frame.streamSid).toBe('MZ-abc');
        const expectedMulaw = pcm16ToMuLawBuffer(pcm);
        expect(pump.Sent[0].frame.media!.payload).toBe(
            Buffer.from(new Uint8Array(expectedMulaw)).toString('base64'),
        );
    });

    it('onStreamAudio delivers decoded PCM16 for inbound media frames and ignores non-media', () => {
        const { bindings, pump } = makeBindings();
        const heard: ArrayBuffer[] = [];
        bindings.onStreamAudio('CA9', (pcm) => heard.push(pcm));

        const mulawBytes = [0xff, 0x00, 0x7f];
        pump.Drive('CA9', { event: 'media', media: { payload: muLawBase64(mulawBytes) } });
        pump.Drive('CA9', { event: 'start', streamSid: 'MZ1' }); // ignored

        expect(heard.length).toBe(1);
        const expected = muLawToPcm16Buffer(Uint8Array.from(mulawBytes).buffer);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array(expected));
    });

    it('onDigits surfaces dtmf-event digits only', () => {
        const { bindings, pump } = makeBindings();
        const digits: string[] = [];
        bindings.onDigits('CA9', (d) => digits.push(d));
        pump.Drive('CA9', { event: 'dtmf', dtmf: { digit: '7' } });
        pump.Drive('CA9', { event: 'media', media: { payload: muLawBase64([0x00]) } }); // not dtmf
        expect(digits).toEqual(['7']);
    });

    it('onCallStatus fires on the stream stop event', () => {
        const { bindings, pump } = makeBindings();
        let ended = false;
        bindings.onCallStatus('CA9', () => (ended = true));
        pump.Drive('CA9', { event: 'media', media: { payload: muLawBase64([0x00]) } });
        expect(ended).toBe(false);
        pump.Drive('CA9', { event: 'stop', streamSid: 'MZ1' });
        expect(ended).toBe(true);
    });

    it('acceptInbound is a no-op (no REST call — the webhook already connected the stream)', async () => {
        const { bindings, rest } = makeBindings();
        await bindings.acceptInbound('CA-inbound-1');
        expect(rest.Updates.length).toBe(0);
        expect(rest.Created).toBeUndefined();
    });
});
