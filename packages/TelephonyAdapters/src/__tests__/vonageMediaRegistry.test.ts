import { describe, it, expect, vi, afterEach } from 'vitest';
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

const pcm = (sample: number): ArrayBuffer => {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, sample, true);
    return buf;
};

const FRAME_BYTES = 320;

const TOKEN = 'a'.repeat(64);

/** Registers the (inbound) call as expected and attaches the socket with the right token (asserting success). */
function attach(reg: VonageCallMediaRegistry, callUuid: string, socket: ITelephonyMediaSocket): void {
    reg.ExpectCall(callUuid, TOKEN);
    const verdict = reg.TryAttachSocket({ CallUuid: callUuid }, TOKEN, socket);
    expect(verdict).toEqual({ Ok: true, CallKey: callUuid });
}

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
            attach(reg, 'CALL-1', sock);

            expect(sock.sent).toHaveLength(2);
            expect(sock.sent[0]).toHaveLength(FRAME_BYTES);
            expect(sock.sent[0][0]).toBe(0xa1);
            expect(sock.sent[1][0]).toBe(0xb2);
        });

        it('slices an oversized delta into multiple 320-byte frames and carries the sub-frame remainder', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            attach(reg, 'CALL-1', sock);

            reg.SendAudio('CALL-1', audio(800));
            expect(sock.sent).toHaveLength(2);
            expect(sock.sent.every((f) => f.length === FRAME_BYTES)).toBe(true);

            reg.SendAudio('CALL-1', audio(160));
            expect(sock.sent).toHaveLength(3);
            expect(sock.sent[2]).toHaveLength(FRAME_BYTES);
        });

        it('holds a sub-frame delta until enough bytes accumulate', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            attach(reg, 'CALL-1', sock);
            reg.SendAudio('CALL-1', audio(100));
            expect(sock.sent).toHaveLength(0);
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

        it('drops inbound audio for an unknown call without throwing', () => {
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
        it('delivers parsed control events to event handlers, separate from audio', () => {
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
            attach(reg, 'CALL-1', sock);
            reg.Clear('CALL-1');
            expect(sock.text).toEqual([JSON.stringify({ action: 'clear' })]);
        });

        it('drops outbound frames buffered before the socket connected, sending nothing on attach', () => {
            const reg = new VonageCallMediaRegistry();
            reg.RegisterCall('CALL-1');
            reg.SendAudio('CALL-1', audio(FRAME_BYTES));
            reg.SendAudio('CALL-1', audio(100));
            reg.Clear('CALL-1');

            const sock = fakeSocket();
            attach(reg, 'CALL-1', sock);
            expect(sock.sent).toHaveLength(0);
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
            attach(reg, 'CALL-1', sock);
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

    describe('media-socket authentication', () => {
        it('refuses a call that was never registered, and creates no channel for it', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            expect(reg.TryAttachSocket({ CallUuid: 'NOPE' }, TOKEN, sock)).toEqual({ Ok: false, Reason: 'unknown-call' });
            expect(reg.HasCall('NOPE')).toBe(false);
        });

        it('refuses a socket that names no call at all', () => {
            const reg = new VonageCallMediaRegistry();
            expect(reg.TryAttachSocket({}, TOKEN, fakeSocket())).toEqual({ Ok: false, Reason: 'unknown-call' });
        });

        it('refuses a wrong or missing token', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectCall('CALL-1', TOKEN);
            expect(reg.TryAttachSocket({ CallUuid: 'CALL-1' }, 'x'.repeat(64), fakeSocket())).toEqual({ Ok: false, Reason: 'bad-token' });
            expect(reg.TryAttachSocket({ CallUuid: 'CALL-1' }, undefined, fakeSocket())).toEqual({ Ok: false, Reason: 'bad-token' });
        });

        it('never replaces an attached socket', () => {
            const reg = new VonageCallMediaRegistry();
            const first = fakeSocket();
            attach(reg, 'CALL-1', first);

            const second = fakeSocket();
            expect(reg.TryAttachSocket({ CallUuid: 'CALL-1' }, TOKEN, second)).toEqual({ Ok: false, Reason: 'already-attached' });

            reg.SendAudio('CALL-1', audio(FRAME_BYTES));
            expect(first.sent).toHaveLength(1);
            expect(second.sent).toHaveLength(0);
        });
    });

    describe('outbound correlation (UUID unknown until createCall resolves)', () => {
        it('socket connects BEFORE the UUID is bound: attaches under the correlation id, then follows the call to its UUID', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectOutboundCall('CID-1', TOKEN);
            const sock = fakeSocket();

            const verdict = reg.TryAttachSocket({ CorrelationId: 'CID-1' }, TOKEN, sock);
            expect(verdict).toEqual({ Ok: true, CallKey: 'CID-1' });

            reg.BindOutboundCall('CID-1', 'UUID-1');

            // The bridge now drives the call by UUID and reaches the already-connected socket.
            reg.SendAudio('UUID-1', audio(FRAME_BYTES, 0x7f));
            expect(sock.sent).toHaveLength(1);
            expect(sock.sent[0][0]).toBe(0x7f);
            // Frames the socket dispatches under the old correlation id reach handlers registered by UUID.
            const received: number[] = [];
            reg.OnAudio('UUID-1', (p) => received.push(new DataView(p).getInt16(0, true)));
            reg.DispatchInboundAudio('CID-1', pcm(9));
            expect(received).toEqual([9]);
        });

        it('socket connects AFTER the UUID is bound: the correlation id still authenticates and resolves to the UUID', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectOutboundCall('CID-2', TOKEN);
            reg.BindOutboundCall('CID-2', 'UUID-2');

            const sock = fakeSocket();
            expect(reg.TryAttachSocket({ CorrelationId: 'CID-2' }, TOKEN, sock)).toEqual({ Ok: true, CallKey: 'UUID-2' });
            reg.SendAudio('UUID-2', audio(FRAME_BYTES));
            expect(sock.sent).toHaveLength(1);
        });

        it('audio the agent produced before the socket existed is flushed once the socket attaches under the correlation id', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectOutboundCall('CID-3', TOKEN);
            reg.BindOutboundCall('CID-3', 'UUID-3');
            reg.SendAudio('UUID-3', audio(FRAME_BYTES, 0x11));

            const sock = fakeSocket();
            reg.TryAttachSocket({ CorrelationId: 'CID-3' }, TOKEN, sock);

            expect(sock.sent).toHaveLength(1);
            expect(sock.sent[0][0]).toBe(0x11);
        });

        it('announces the UUID to the registered listener when it is bound', () => {
            const reg = new VonageCallMediaRegistry();
            const seen: string[] = [];
            reg.OnCallRegistered((id) => seen.push(id));
            reg.ExpectOutboundCall('CID-4', TOKEN);
            expect(seen).toEqual([]);
            reg.BindOutboundCall('CID-4', 'UUID-4');
            expect(seen).toEqual(['UUID-4']);
        });

        it('a failed createCall abandons the expectation: the correlation id can no longer attach', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectOutboundCall('CID-5', TOKEN);
            reg.AbandonOutboundCall('CID-5');
            expect(reg.TryAttachSocket({ CorrelationId: 'CID-5' }, TOKEN, fakeSocket())).toEqual({ Ok: false, Reason: 'unknown-call' });
        });

        it('ending the call drops its correlation alias', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectOutboundCall('CID-6', TOKEN);
            reg.BindOutboundCall('CID-6', 'UUID-6');
            reg.EndCall('UUID-6');
            expect(reg.TryAttachSocket({ CorrelationId: 'CID-6' }, TOKEN, fakeSocket())).toEqual({ Ok: false, Reason: 'unknown-call' });
        });
    });

    describe('connect TTL', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('drops an expectation whose socket never connects, frees its channel and notifies the listener', () => {
            vi.useFakeTimers();
            const reg = new VonageCallMediaRegistry({ ExpectationTtlMs: 1000 });
            const timedOut: string[] = [];
            reg.OnConnectTimeout((id) => timedOut.push(id));
            reg.ExpectCall('CALL-1', TOKEN);

            vi.advanceTimersByTime(1001);

            expect(timedOut).toEqual(['CALL-1']);
            expect(reg.HasCall('CALL-1')).toBe(false);
        });
    });

    describe('bounded buffers', () => {
        it('caps the pre-attach outbound buffer, dropping the OLDEST frames', () => {
            const reg = new VonageCallMediaRegistry({ MaxOutboundBufferFrames: 2 });
            reg.RegisterCall('CALL-1');
            for (const tag of [1, 2, 3, 4]) {
                reg.SendAudio('CALL-1', audio(FRAME_BYTES, tag));
            }
            const sock = fakeSocket();
            attach(reg, 'CALL-1', sock);
            expect(sock.sent.map((f) => f[0])).toEqual([3, 4]);
        });

        it('replays inbound audio that arrived before the first audio handler registered', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectCall('CALL-1', TOKEN);
            reg.DispatchInboundAudio('CALL-1', pcm(1));
            reg.DispatchInboundAudio('CALL-1', pcm(2));

            const received: number[] = [];
            reg.OnAudio('CALL-1', (p) => received.push(new DataView(p).getInt16(0, true)));
            expect(received).toEqual([1, 2]);
        });

        it('caps early inbound audio by bytes, keeping the most recent', () => {
            const reg = new VonageCallMediaRegistry({ MaxEarlyInboundBytes: 4 });
            reg.ExpectCall('CALL-1', TOKEN);
            for (const n of [1, 2, 3, 4]) {
                reg.DispatchInboundAudio('CALL-1', pcm(n)); // 2 bytes each
            }
            const received: number[] = [];
            reg.OnAudio('CALL-1', (p) => received.push(new DataView(p).getInt16(0, true)));
            expect(received).toEqual([3, 4]);
        });

        it('replays early control events (e.g. an early DTMF) to the event handler', () => {
            const reg = new VonageCallMediaRegistry();
            reg.ExpectCall('CALL-1', TOKEN);
            reg.DispatchInboundEvent('CALL-1', { event: 'websocket:dtmf', digit: '1' });
            const events: VonageControlEvent[] = [];
            reg.OnEvent('CALL-1', (e) => events.push(e));
            expect(events.map((e) => e.digit)).toEqual(['1']);
        });
    });
});
