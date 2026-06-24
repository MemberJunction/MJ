import { describe, it, expect } from 'vitest';
import { muLawToPcm16Buffer, pcm16ToMuLawBuffer } from '@memberjunction/ai-bridge-base';
import {
    RealRingCentralBindings,
    buildCreateSessionPayload,
    buildTransferPartyPayload,
    parseRingCentralMediaFrame,
    encodeRingCentralMediaFrame,
    IRingCentralCallControlLike,
    IRingCentralMediaPump,
    CreateSessionPayload,
    TransferPartyPayload,
    RingCentralMediaFrame,
} from '../real-ringcentral-bindings';

// ──────────────────────────────────────────────────────────────────────────────
// Fakes for the injected RingCentral surfaces — no network, no `@ringcentral/sdk` install.
// ──────────────────────────────────────────────────────────────────────────────

class FakeCallControl implements IRingCentralCallControlLike {
    public Created?: CreateSessionPayload;
    public readonly Answered: string[] = [];
    public readonly Dropped: string[] = [];
    public readonly Dtmfs: Array<{ sessionId: string; digits: string }> = [];
    public readonly Transfers: Array<{ sessionId: string; payload: TransferPartyPayload }> = [];

    public async CreateSession(payload: CreateSessionPayload): Promise<string> {
        this.Created = payload;
        return 'rc-session-1';
    }
    public async AnswerParty(sessionId: string): Promise<void> {
        this.Answered.push(sessionId);
    }
    public async DropSession(sessionId: string): Promise<void> {
        this.Dropped.push(sessionId);
    }
    public async PlayDigits(sessionId: string, digits: string): Promise<void> {
        this.Dtmfs.push({ sessionId, digits });
    }
    public async TransferParty(sessionId: string, payload: TransferPartyPayload): Promise<void> {
        this.Transfers.push({ sessionId, payload });
    }
}

class FakeMediaPump implements IRingCentralMediaPump {
    public readonly Sent: Array<{ sessionId: string; frame: RingCentralMediaFrame }> = [];
    private handlers = new Map<string, (frame: RingCentralMediaFrame) => void>();

    public Send(sessionId: string, frame: RingCentralMediaFrame): void {
        this.Sent.push({ sessionId, frame });
    }
    public OnFrame(sessionId: string, handler: (frame: RingCentralMediaFrame) => void): void {
        this.handlers.set(sessionId, handler);
    }
    public Drive(sessionId: string, frame: RingCentralMediaFrame): void {
        this.handlers.get(sessionId)?.(frame);
    }
}

function makeBindings(streamUrl = 'wss://api.example/telephony/ringcentral/media'): {
    bindings: RealRingCentralBindings;
    cc: FakeCallControl;
    pump: FakeMediaPump;
} {
    const cc = new FakeCallControl();
    const pump = new FakeMediaPump();
    const bindings = new RealRingCentralBindings({ CallControl: cc, MediaPump: pump, StreamUrl: streamUrl });
    return { bindings, cc, pump };
}

/** A base64 μ-law payload over a known μ-law byte run, for round-trip checks. */
function muLawBase64(bytes: number[]): string {
    return Buffer.from(Uint8Array.from(bytes)).toString('base64');
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure Call-Control payload helpers — the RingCentral session-vocabulary delta.
// ──────────────────────────────────────────────────────────────────────────────

describe('Call-Control payload pure helpers', () => {
    it('buildCreateSessionPayload carries to/from numbers + the media stream URL', () => {
        const payload = buildCreateSessionPayload('+15551234567', '+15559876543', 'wss://h/media');
        expect(payload).toEqual({
            to: { phoneNumber: '+15551234567' },
            from: { phoneNumber: '+15559876543' },
            streamUrl: 'wss://h/media',
        });
    });

    it('buildTransferPartyPayload carries the transfer destination', () => {
        expect(buildTransferPartyPayload('+15551112222')).toEqual({ phoneNumber: '+15551112222' });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Pure media-frame transcode via the T0 codec.
// ──────────────────────────────────────────────────────────────────────────────

describe('media-frame transcode (T0 codec)', () => {
    it('parseRingCentralMediaFrame decodes base64 μ-law to PCM16 matching the codec', () => {
        const mulawBytes = [0xff, 0x80, 0x00, 0x7f, 0x40];
        const frame: RingCentralMediaFrame = { event: 'media', sessionId: 'rc1', media: { data: muLawBase64(mulawBytes) } };
        const pcm = parseRingCentralMediaFrame(frame);
        expect(pcm).not.toBeNull();
        const expected = muLawToPcm16Buffer(Uint8Array.from(mulawBytes).buffer);
        expect(new Uint8Array(pcm!)).toEqual(new Uint8Array(expected));
    });

    it('parseRingCentralMediaFrame returns null for non-media events', () => {
        expect(parseRingCentralMediaFrame({ event: 'dtmf', dtmf: { digit: '1' } })).toBeNull();
        expect(parseRingCentralMediaFrame({ event: 'stop' })).toBeNull();
        expect(parseRingCentralMediaFrame({ event: 'media' })).toBeNull();
    });

    it('encodeRingCentralMediaFrame encodes PCM16 to base64 μ-law matching the codec', () => {
        const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]).buffer;
        const frame = encodeRingCentralMediaFrame(pcm, 'rc1');
        expect(frame.event).toBe('media');
        expect(frame.sessionId).toBe('rc1');
        const expectedMulaw = pcm16ToMuLawBuffer(pcm);
        expect(frame.media!.data).toBe(Buffer.from(new Uint8Array(expectedMulaw)).toString('base64'));
    });

    it('round-trips μ-law base64 → PCM16 → back through the codec (lossy-stable)', () => {
        const mulawBytes = [0x10, 0x20, 0x30, 0x40, 0x50, 0xaa, 0x55];
        const inFrame: RingCentralMediaFrame = { event: 'media', media: { data: muLawBase64(mulawBytes) } };
        const pcm = parseRingCentralMediaFrame(inFrame)!;
        const outFrame = encodeRingCentralMediaFrame(pcm, 'rc1');
        expect(Buffer.from(outFrame.media!.data, 'base64')).toEqual(Buffer.from(Uint8Array.from(mulawBytes)));
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealRingCentralBindings → injected Call-Control surface.
// ──────────────────────────────────────────────────────────────────────────────

describe('RealRingCentralBindings — Call-Control mapping', () => {
    it('createSession creates a session with to/from + the stream URL, returning the session id', async () => {
        const { bindings, cc } = makeBindings('wss://api.example/media');
        const id = await bindings.createSession('+15551234567', '+15559876543');
        expect(id).toBe('rc-session-1');
        expect(cc.Created).toEqual({
            to: { phoneNumber: '+15551234567' },
            from: { phoneNumber: '+15559876543' },
            streamUrl: 'wss://api.example/media',
        });
    });

    it('answerSession answers the inbound party', async () => {
        const { bindings, cc } = makeBindings();
        await bindings.answerSession('rc-inbound-9');
        expect(cc.Answered).toEqual(['rc-inbound-9']);
        expect(cc.Created).toBeUndefined();
    });

    it('dropSession ends the session', async () => {
        const { bindings, cc } = makeBindings();
        await bindings.dropSession('rc9');
        expect(cc.Dropped).toEqual(['rc9']);
    });

    it('transferSession transfers the party to the destination', async () => {
        const { bindings, cc } = makeBindings();
        await bindings.transferSession('rc9', '+15550001111');
        expect(cc.Transfers).toEqual([{ sessionId: 'rc9', payload: { phoneNumber: '+15550001111' } }]);
    });

    it('playDigits sends DTMF via Call-Control', async () => {
        const { bindings, cc } = makeBindings();
        await bindings.playDigits('rc9', '456#');
        expect(cc.Dtmfs).toEqual([{ sessionId: 'rc9', digits: '456#' }]);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// RealRingCentralBindings → media stream (audio + DTMF + ended).
// ──────────────────────────────────────────────────────────────────────────────

describe('RealRingCentralBindings — media-stream mapping', () => {
    it('pushStreamAudio encodes PCM16 to a μ-law frame addressed to the session id', () => {
        const { bindings, pump } = makeBindings();
        const pcm = new Int16Array([100, -100, 5000]).buffer;
        bindings.pushStreamAudio('rc9', pcm);
        expect(pump.Sent.length).toBe(1);
        expect(pump.Sent[0].sessionId).toBe('rc9');
        expect(pump.Sent[0].frame.sessionId).toBe('rc9');
        const expectedMulaw = pcm16ToMuLawBuffer(pcm);
        expect(pump.Sent[0].frame.media!.data).toBe(Buffer.from(new Uint8Array(expectedMulaw)).toString('base64'));
    });

    it('onStreamAudio delivers decoded PCM16 for media frames and ignores non-media', () => {
        const { bindings, pump } = makeBindings();
        const heard: ArrayBuffer[] = [];
        bindings.onStreamAudio('rc9', (pcm) => heard.push(pcm));

        const mulawBytes = [0xff, 0x00, 0x7f];
        pump.Drive('rc9', { event: 'media', media: { data: muLawBase64(mulawBytes) } });
        pump.Drive('rc9', { event: 'stop' }); // ignored

        expect(heard.length).toBe(1);
        const expected = muLawToPcm16Buffer(Uint8Array.from(mulawBytes).buffer);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array(expected));
    });

    it('onDigits surfaces dtmf-event digits only', () => {
        const { bindings, pump } = makeBindings();
        const digits: string[] = [];
        bindings.onDigits('rc9', (d) => digits.push(d));
        pump.Drive('rc9', { event: 'dtmf', dtmf: { digit: '7' } });
        pump.Drive('rc9', { event: 'media', media: { data: muLawBase64([0x00]) } }); // not dtmf
        expect(digits).toEqual(['7']);
    });

    it('onSessionStatus fires on the media-stream stop event', () => {
        const { bindings, pump } = makeBindings();
        let ended = false;
        bindings.onSessionStatus('rc9', () => (ended = true));
        pump.Drive('rc9', { event: 'media', media: { data: muLawBase64([0x00]) } });
        expect(ended).toBe(false);
        pump.Drive('rc9', { event: 'stop' });
        expect(ended).toBe(true);
    });
});
