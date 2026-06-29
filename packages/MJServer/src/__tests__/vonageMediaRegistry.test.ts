import { describe, it, expect, vi } from 'vitest';
import { VonageCallMediaRegistry, type ITelephonyMediaSocket } from '../telephony/vonageMediaRegistry.js';
import type { VonageControlEvent } from '@memberjunction/ai-bridge-vonage';

/** A fake media socket capturing outbound BINARY audio + TEXT control frames + tracking close. */
function fakeSocket(): ITelephonyMediaSocket & { sent: Uint8Array[]; text: string[]; closed: boolean } {
    const sent: Uint8Array[] = [];
    const text: string[] = [];
    return {
        sent,
        text,
        closed: false,
        sendBinary(data: Uint8Array) {
            sent.push(data);
        },
        sendText(data: string) {
            text.push(data);
        },
        close() {
            (this as { closed: boolean }).closed = true;
        },
    };
}

/** A small PCM16 ArrayBuffer carrying one recognizable little-endian sample, for ordering/round-trip checks. */
const pcm = (sample: number): ArrayBuffer => {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, sample, true);
    return buf;
};

/** Vonage's outbound frame size: 20 ms @ 8 kHz / 16-bit = 320 bytes. */
const FRAME_BYTES = 320;

/** Builds an N-byte PCM ArrayBuffer whose first byte is `tag`, so frames are distinguishable. */
const audio = (bytes: number, tag = 0): ArrayBuffer => {
    const buf = new Uint8Array(bytes);
    if (bytes > 0) buf[0] = tag;
    return buf.buffer;
};

describe('VonageCallMediaRegistry', () => {
    describe('outbound audio framing (20 ms / 320-byte slices)', () => {
        it('buffers whole 320-byte frames before the socket connects, then flushes them on AttachSocket in order', () => {
            const reg = new VonageCallMediaRegistry();
            reg.RegisterCall('CALL-1');
            reg.SendAudio('CALL-1', audio(FRAME_BYTES, 0xa1));
            reg.SendAudio('CALL-1', audio(FRAME_BYTES, 0xb2));

            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);

            expect(sock.sent).toHaveLength(2);
            expect(sock.sent[0]).toHaveLength(FRAME_BYTES);
            expect(sock.sent[0][0]).toBe(0xa1);
            expect(sock.sent[1][0]).toBe(0xb2);
        });

        it('slices an oversized delta into multiple 320-byte frames and carries the sub-frame remainder', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);

            // 800 bytes = two whole frames + 160 left over (held, not sent).
            reg.SendAudio('CALL-1', audio(800));
            expect(sock.sent).toHaveLength(2);
            expect(sock.sent.every((f) => f.length === FRAME_BYTES)).toBe(true);

            // Another 160 bytes completes the carried remainder into a third whole frame.
            reg.SendAudio('CALL-1', audio(160));
            expect(sock.sent).toHaveLength(3);
            expect(sock.sent[2]).toHaveLength(FRAME_BYTES);
        });

        it('holds a sub-frame delta until enough bytes accumulate (no silence-padded partial frame)', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);
            reg.SendAudio('CALL-1', audio(100));
            expect(sock.sent).toHaveLength(0); // < one frame — nothing sent yet
        });
    });

    describe('inbound audio dispatch', () => {
        it('delivers inbound audio to handlers registered before the socket existed', () => {
            const reg = new VonageCallMediaRegistry();
            const received: number[] = [];
            reg.OnAudio('CALL-1', (p) => received.push(new DataView(p).getInt16(0, true)));

            reg.DispatchInboundAudio('CALL-1', pcm(42));

            expect(received).toEqual([42]);
        });

        it('drops inbound audio for an unknown call (no channel) without throwing', () => {
            const reg = new VonageCallMediaRegistry();
            expect(() => reg.DispatchInboundAudio('UNKNOWN', pcm(1))).not.toThrow();
        });

        it('fans out audio to multiple handlers registered on one call', () => {
            const reg = new VonageCallMediaRegistry();
            const h1 = vi.fn();
            const h2 = vi.fn();
            reg.OnAudio('CALL-1', h1);
            reg.OnAudio('CALL-1', h2);
            reg.DispatchInboundAudio('CALL-1', pcm(7));
            expect(h1).toHaveBeenCalledTimes(1);
            expect(h2).toHaveBeenCalledTimes(1);
        });
    });

    describe('inbound control-event dispatch', () => {
        it('delivers parsed control events (DTMF / close) to event handlers, separate from audio', () => {
            const reg = new VonageCallMediaRegistry();
            const events: VonageControlEvent[] = [];
            const audio = vi.fn();
            reg.OnEvent('CALL-1', (e) => events.push(e));
            reg.OnAudio('CALL-1', audio);

            reg.DispatchInboundEvent('CALL-1', { event: 'websocket:dtmf', digit: '5', duration: 260 });
            reg.DispatchInboundEvent('CALL-1', { event: 'close' });

            expect(audio).not.toHaveBeenCalled();
            expect(events).toHaveLength(2);
            expect(events[0].digit).toBe('5');
            expect(events[1].event).toBe('close');
        });

        it('drops inbound events for an unknown call without throwing', () => {
            const reg = new VonageCallMediaRegistry();
            expect(() => reg.DispatchInboundEvent('UNKNOWN', { event: 'close' })).not.toThrow();
        });
    });

    describe('barge-in flush (Clear)', () => {
        it('sends Vonage {"action":"clear"} on the live socket and drops locally-buffered audio', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);
            reg.Clear('CALL-1');
            expect(sock.text).toEqual([JSON.stringify({ action: 'clear' })]);
        });

        it('drops outbound frames buffered before the socket connected, sending nothing on attach', () => {
            const reg = new VonageCallMediaRegistry();
            reg.RegisterCall('CALL-1');
            reg.SendAudio('CALL-1', audio(FRAME_BYTES)); // a whole frame, buffered (no socket yet)
            reg.SendAudio('CALL-1', audio(100)); // sub-frame remainder, held in partial
            reg.Clear('CALL-1'); // barge-in before the media socket connected

            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);
            expect(sock.sent).toHaveLength(0); // both the buffered frame and the partial were cleared
        });

        it('Clear on an unknown call is a no-op', () => {
            const reg = new VonageCallMediaRegistry();
            expect(() => reg.Clear('NOPE')).not.toThrow();
        });
    });

    describe('lifecycle', () => {
        it('EndCall closes the socket and forgets the channel', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);
            expect(reg.HasCall('CALL-1')).toBe(true);

            reg.EndCall('CALL-1');

            expect(sock.closed).toBe(true);
            expect(reg.HasCall('CALL-1')).toBe(false);
        });

        it('EndCall on an unknown call is a no-op', () => {
            const reg = new VonageCallMediaRegistry();
            expect(() => reg.EndCall('NOPE')).not.toThrow();
        });
    });
});
