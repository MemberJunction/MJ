import { describe, it, expect } from 'vitest';
import { RealtimeRtpSender } from '../realtime-rtp-sender';
import type { RtpConstructors, RtpHeaderInit, RtpPacketInstance, SoftphoneCallSession } from '../softphone-types';

// ──────────────────────────────────────────────────────────────────────────────
// Fakes — no werift-rtp, no ringcentral-softphone, no network. The sender's clock
// is driven via tick() so framing/counter logic is exercised deterministically.
// ──────────────────────────────────────────────────────────────────────────────

/** OPUS/16000 framing: 640-byte (320-sample) PCM16 frames, timestamp +320 per frame, payload id 109. */
const CODEC = { id: 109, packetSize: 640, timestampInterval: 320, name: 'OPUS/16000' as const };

/** Captures every RTP packet handed to `sendPacket`, plus the header init used to build it. */
function fakeSession(): {
    session: SoftphoneCallSession;
    sent: RtpPacketInstance[];
    headers: RtpHeaderInit[];
    setDisposed: (v: boolean) => void;
} {
    const sent: RtpPacketInstance[] = [];
    const headers: RtpHeaderInit[] = [];
    let disposed = false;
    const session: SoftphoneCallSession = {
        // Identity encoder so the encoded payload == the PCM frame bytes (lets us assert frame content).
        encoder: { encode: (pcm: Buffer) => pcm },
        sequenceNumber: 100,
        timestamp: 1000,
        ssrc: 42,
        get disposed() {
            return disposed;
        },
        softphone: { codec: CODEC },
        sendPacket: (p: RtpPacketInstance) => sent.push(p),
        hangup: async () => {},
        transfer: async () => {},
        sendDTMF: () => {},
        on: () => {},
        once: () => {},
    };
    return { session, sent, headers, setDisposed: (v: boolean) => (disposed = v) };
}

/** Fake werift-rtp constructors that record what they were built with. */
function fakeRtp(headers: RtpHeaderInit[]): RtpConstructors {
    return {
        RtpHeader: class {
            constructor(init: RtpHeaderInit) {
                headers.push(init);
                Object.assign(this, init);
            }
        } as RtpConstructors['RtpHeader'],
        RtpPacket: class {
            payload: Buffer;
            header: RtpHeaderInit;
            constructor(header: RtpHeaderInit, payload: Buffer) {
                this.header = header;
                this.payload = payload;
            }
        } as unknown as RtpConstructors['RtpPacket'],
    };
}

/** Builds an N-byte PCM buffer whose first byte is `tag`, so frames are distinguishable. */
const pcm = (bytes: number, tag = 0): ArrayBuffer => {
    const b = new Uint8Array(bytes);
    if (bytes > 0) b[0] = tag;
    return b.buffer;
};

describe('RealtimeRtpSender', () => {
    it('sends exactly one 640-byte frame per tick, advancing sequence + timestamp per frame', () => {
        const { session, sent, headers } = fakeSession();
        const sender = new RealtimeRtpSender(session, fakeRtp(headers));

        sender.enqueue(pcm(640, 0xaa));
        sender.enqueue(pcm(640, 0xbb));

        sender.tick();
        expect(sent).toHaveLength(1);
        expect(sent[0].payload).toHaveLength(640);
        expect(sent[0].payload[0]).toBe(0xaa);
        expect(headers[0]).toMatchObject({ payloadType: 109, sequenceNumber: 100, timestamp: 1000, ssrc: 42, marker: false });

        sender.tick();
        expect(sent).toHaveLength(2);
        expect(sent[1].payload[0]).toBe(0xbb);
        expect(headers[1]).toMatchObject({ sequenceNumber: 101, timestamp: 1320 }); // +1 seq, +320 ts
    });

    it('holds a sub-frame remainder across enqueues until a whole 640-byte frame accumulates', () => {
        const { session, sent } = fakeSession();
        const sender = new RealtimeRtpSender(session, fakeRtp([]));

        sender.enqueue(pcm(400)); // < one frame
        sender.tick();
        expect(sent).toHaveLength(0); // nothing sent yet

        sender.enqueue(pcm(300)); // 700 total → one whole 640 frame + 60 remainder
        sender.tick();
        expect(sent).toHaveLength(1);
        sender.tick();
        expect(sent).toHaveLength(1); // 60 leftover < frame — still nothing more
    });

    it('flush() drops queued audio so a barge-in goes silent immediately', () => {
        const { session, sent } = fakeSession();
        const sender = new RealtimeRtpSender(session, fakeRtp([]));
        sender.enqueue(pcm(640 * 3));
        sender.flush();
        sender.tick();
        expect(sent).toHaveLength(0);
    });

    it('wraps the sequence number at 65535 → 0', () => {
        const { session, headers } = fakeSession();
        session.sequenceNumber = 65535;
        const sender = new RealtimeRtpSender(session, fakeRtp(headers));
        sender.enqueue(pcm(640 * 2));
        sender.tick();
        sender.tick();
        expect(headers[0].sequenceNumber).toBe(65535);
        expect(session.sequenceNumber).toBe(1); // 65535 -> wrapped to 0 -> +1
    });

    it('does not send once the session is disposed', () => {
        const { session, sent, setDisposed } = fakeSession();
        const sender = new RealtimeRtpSender(session, fakeRtp([]));
        sender.enqueue(pcm(640));
        setDisposed(true);
        sender.tick();
        expect(sent).toHaveLength(0);
    });

    it('ignores empty enqueues', () => {
        const { session, sent } = fakeSession();
        const sender = new RealtimeRtpSender(session, fakeRtp([]));
        sender.enqueue(new ArrayBuffer(0));
        sender.tick();
        expect(sent).toHaveLength(0);
    });
});
