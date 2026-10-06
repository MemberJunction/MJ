import { describe, it, expect, vi, afterEach } from 'vitest';
import { TwilioCallMediaRegistry, type ITelephonyMediaSocket } from '../telephony/twilioMediaRegistry.js';
import type { TwilioMediaFrame } from '@memberjunction/ai-bridge-twilio';

/** A fake Media-Streams socket capturing sends + tracking close. */
function fakeSocket(): ITelephonyMediaSocket & { sent: string[]; closed: boolean } {
    const sent: string[] = [];
    return {
        sent,
        closed: false,
        send(data: string) {
            sent.push(data);
        },
        close() {
            (this as { closed: boolean }).closed = true;
        },
    };
}

const mediaFrame = (payload: string): TwilioMediaFrame => ({ event: 'media', streamSid: 'MZ1', media: { payload } });

const TOKEN = 'a'.repeat(64);

/** Registers the call as expected and attaches the socket with the right token (asserting success). */
function attach(reg: TwilioCallMediaRegistry, callSid: string, socket: ITelephonyMediaSocket, streamSid: string): void {
    reg.ExpectCall(callSid, TOKEN);
    expect(reg.TryAttachSocket(callSid, TOKEN, socket, streamSid)).toEqual({ Ok: true });
}

describe('TwilioCallMediaRegistry', () => {
    describe('outbound buffering', () => {
        it('buffers outbound frames before the socket connects, then flushes on AttachSocket in order', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.RegisterCall('CA1');
            reg.Send('CA1', mediaFrame('a'));
            reg.Send('CA1', mediaFrame('b'));

            const sock = fakeSocket();
            attach(reg, 'CA1', sock, 'MZ1');

            expect(sock.sent).toHaveLength(2);
            expect(JSON.parse(sock.sent[0]).media.payload).toBe('a');
            expect(JSON.parse(sock.sent[1]).media.payload).toBe('b');
        });

        it('sends immediately once the socket is attached', () => {
            const reg = new TwilioCallMediaRegistry();
            const sock = fakeSocket();
            attach(reg, 'CA1', sock, 'MZ1');
            reg.Send('CA1', mediaFrame('c'));
            expect(sock.sent).toHaveLength(1);
            expect(JSON.parse(sock.sent[0]).media.payload).toBe('c');
        });

        it('discards buffered frames when a clear event arrives before socket connects', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.RegisterCall('CA1');
            reg.Send('CA1', mediaFrame('pre-clear'));
            reg.Send('CA1', { event: 'clear', streamSid: 'MZ1' });

            const sock = fakeSocket();
            attach(reg, 'CA1', sock, 'MZ1');

            expect(sock.sent).toHaveLength(0);
        });

        it('sends clear frame immediately when socket is attached', () => {
            const reg = new TwilioCallMediaRegistry();
            const sock = fakeSocket();
            attach(reg, 'CA1', sock, 'MZ1');
            reg.Send('CA1', { event: 'clear', streamSid: 'MZ1' });

            expect(sock.sent).toHaveLength(1);
            expect(JSON.parse(sock.sent[0])).toEqual({ event: 'clear', streamSid: 'MZ1' });
        });
    });

    describe('inbound dispatch', () => {
        it('delivers inbound frames to handlers registered before the socket existed', () => {
            const reg = new TwilioCallMediaRegistry();
            const received: TwilioMediaFrame[] = [];
            reg.OnFrame('CA1', (f) => received.push(f));

            reg.DispatchInbound('CA1', mediaFrame('in'));

            expect(received).toHaveLength(1);
            expect(received[0].media?.payload).toBe('in');
        });

        it('captures the stream SID from a start frame and exposes it via GetStreamSid', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.RegisterCall('CA1');
            expect(reg.GetStreamSid('CA1')).toBe('');
            reg.DispatchInbound('CA1', { event: 'start', streamSid: 'MZ-XYZ' });
            expect(reg.GetStreamSid('CA1')).toBe('MZ-XYZ');
        });

        it('drops inbound frames for an unknown call (no channel) without throwing', () => {
            const reg = new TwilioCallMediaRegistry();
            expect(() => reg.DispatchInbound('UNKNOWN', mediaFrame('x'))).not.toThrow();
        });

        it('fans out to multiple handlers (audio + dtmf + status all registered on one call)', () => {
            const reg = new TwilioCallMediaRegistry();
            const h1 = vi.fn();
            const h2 = vi.fn();
            reg.OnFrame('CA1', h1);
            reg.OnFrame('CA1', h2);
            reg.DispatchInbound('CA1', mediaFrame('y'));
            expect(h1).toHaveBeenCalledTimes(1);
            expect(h2).toHaveBeenCalledTimes(1);
        });
    });

    describe('lifecycle', () => {
        it('EndCall closes the socket and forgets the channel', () => {
            const reg = new TwilioCallMediaRegistry();
            const sock = fakeSocket();
            attach(reg, 'CA1', sock, 'MZ1');
            expect(reg.HasCall('CA1')).toBe(true);

            reg.EndCall('CA1');

            expect(sock.closed).toBe(true);
            expect(reg.HasCall('CA1')).toBe(false);
        });

        it('EndCall on an unknown call is a no-op', () => {
            const reg = new TwilioCallMediaRegistry();
            expect(() => reg.EndCall('NOPE')).not.toThrow();
        });
    });

    describe('media-socket authentication', () => {
        it('attaches a socket that presents the registered token', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.ExpectCall('CA1', TOKEN);
            const sock = fakeSocket();
            expect(reg.TryAttachSocket('CA1', TOKEN, sock, 'MZ1')).toEqual({ Ok: true });
            expect(reg.GetStreamSid('CA1')).toBe('MZ1');
        });

        it('refuses a call that was never registered, and creates no channel for it', () => {
            const reg = new TwilioCallMediaRegistry();
            const sock = fakeSocket();
            expect(reg.TryAttachSocket('CA-UNKNOWN', TOKEN, sock, 'MZ1')).toEqual({ Ok: false, Reason: 'unknown-call' });
            expect(reg.HasCall('CA-UNKNOWN')).toBe(false);
            expect(sock.sent).toHaveLength(0);
        });

        it('refuses a wrong token', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.ExpectCall('CA1', TOKEN);
            expect(reg.TryAttachSocket('CA1', 'b'.repeat(64), fakeSocket(), 'MZ1')).toEqual({ Ok: false, Reason: 'bad-token' });
        });

        it('refuses a missing token', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.ExpectCall('CA1', TOKEN);
            expect(reg.TryAttachSocket('CA1', undefined, fakeSocket(), 'MZ1')).toEqual({ Ok: false, Reason: 'bad-token' });
        });

        it('never replaces an attached socket: a second socket with the right token is refused and the first keeps the call', () => {
            const reg = new TwilioCallMediaRegistry();
            const first = fakeSocket();
            attach(reg, 'CA1', first, 'MZ1');

            const second = fakeSocket();
            expect(reg.TryAttachSocket('CA1', TOKEN, second, 'MZ2')).toEqual({ Ok: false, Reason: 'already-attached' });

            reg.Send('CA1', mediaFrame('x'));
            expect(first.sent).toHaveLength(1);
            expect(second.sent).toHaveLength(0);
            expect(reg.GetStreamSid('CA1')).toBe('MZ1');
        });

        it('a refused socket leaves a pending call attachable by the legitimate socket afterwards', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.ExpectCall('CA1', TOKEN);
            reg.TryAttachSocket('CA1', 'wrong', fakeSocket(), 'MZ-evil');
            const legit = fakeSocket();
            expect(reg.TryAttachSocket('CA1', TOKEN, legit, 'MZ1')).toEqual({ Ok: true });
        });
    });

    describe('connect TTL', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('drops an expectation whose socket never connects, frees its channel and notifies the listener', () => {
            vi.useFakeTimers();
            const reg = new TwilioCallMediaRegistry({ ExpectationTtlMs: 1000 });
            const timedOut: string[] = [];
            reg.OnConnectTimeout((sid) => timedOut.push(sid));
            reg.ExpectCall('CA1', TOKEN);

            vi.advanceTimersByTime(1001);

            expect(timedOut).toEqual(['CA1']);
            expect(reg.HasCall('CA1')).toBe(false);
            expect(reg.TryAttachSocket('CA1', TOKEN, fakeSocket(), 'MZ1')).toEqual({ Ok: false, Reason: 'unknown-call' });
        });

        it('does not time out a call whose socket attached in time', () => {
            vi.useFakeTimers();
            const reg = new TwilioCallMediaRegistry({ ExpectationTtlMs: 1000 });
            const timedOut: string[] = [];
            reg.OnConnectTimeout((sid) => timedOut.push(sid));
            reg.ExpectCall('CA1', TOKEN);
            reg.TryAttachSocket('CA1', TOKEN, fakeSocket(), 'MZ1');

            vi.advanceTimersByTime(5000);

            expect(timedOut).toEqual([]);
            expect(reg.HasCall('CA1')).toBe(true);
        });

        it('EndCall cancels the pending TTL so it cannot fire later', () => {
            vi.useFakeTimers();
            const reg = new TwilioCallMediaRegistry({ ExpectationTtlMs: 1000 });
            const timedOut: string[] = [];
            reg.OnConnectTimeout((sid) => timedOut.push(sid));
            reg.ExpectCall('CA1', TOKEN);
            reg.EndCall('CA1');

            vi.advanceTimersByTime(5000);

            expect(timedOut).toEqual([]);
        });

        it('announces a call the moment it is registered', () => {
            const reg = new TwilioCallMediaRegistry();
            const seen: string[] = [];
            reg.OnCallRegistered((sid) => seen.push(sid));
            reg.ExpectCall('CA9', TOKEN);
            expect(seen).toEqual(['CA9']);
        });
    });

    describe('first-words fix: streamSid rewrite + outbound buffer cap', () => {
        it('re-addresses frames buffered before the socket connected to the real streamSid (they were encoded with an empty one)', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.RegisterCall('CA1');
            reg.Send('CA1', { event: 'media', streamSid: '', media: { payload: 'hello' } });

            const sock = fakeSocket();
            attach(reg, 'CA1', sock, 'MZ-REAL');

            expect(JSON.parse(sock.sent[0]).streamSid).toBe('MZ-REAL');
            expect(JSON.parse(sock.sent[0]).media.payload).toBe('hello');
        });

        it('caps the pre-attach outbound buffer, dropping the OLDEST frames', () => {
            const reg = new TwilioCallMediaRegistry({ MaxOutboundBufferFrames: 3 });
            reg.RegisterCall('CA1');
            for (const p of ['1', '2', '3', '4', '5']) {
                reg.Send('CA1', mediaFrame(p));
            }

            const sock = fakeSocket();
            attach(reg, 'CA1', sock, 'MZ1');

            expect(sock.sent.map((s) => JSON.parse(s).media.payload)).toEqual(['3', '4', '5']);
        });
    });

    describe('inbound audio that arrives before the bridge registers its handlers', () => {
        it('replays buffered frames, in order, to the handler as it registers', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.ExpectCall('CA1', TOKEN);
            reg.DispatchInbound('CA1', mediaFrame('a'));
            reg.DispatchInbound('CA1', mediaFrame('b'));

            const received: string[] = [];
            reg.OnFrame('CA1', (f) => received.push(f.media?.payload ?? ''));

            expect(received).toEqual(['a', 'b']);
        });

        it('delivers live once a handler exists (not buffered again)', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.ExpectCall('CA1', TOKEN);
            const received: string[] = [];
            reg.OnFrame('CA1', (f) => received.push(f.media?.payload ?? ''));
            reg.DispatchInbound('CA1', mediaFrame('live'));
            expect(received).toEqual(['live']);
        });

        it('caps the early inbound buffer, keeping the most recent frames', () => {
            const reg = new TwilioCallMediaRegistry({ MaxEarlyInboundFrames: 2 });
            reg.ExpectCall('CA1', TOKEN);
            for (const p of ['a', 'b', 'c', 'd']) {
                reg.DispatchInbound('CA1', mediaFrame(p));
            }
            const received: string[] = [];
            reg.OnFrame('CA1', (f) => received.push(f.media?.payload ?? ''));
            expect(received).toEqual(['c', 'd']);
        });

        it('replays to every handler registered during the same tick (audio + dtmf + status), each once', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.ExpectCall('CA1', TOKEN);
            reg.DispatchInbound('CA1', mediaFrame('a'));
            const h1 = vi.fn();
            const h2 = vi.fn();
            reg.OnFrame('CA1', h1);
            reg.OnFrame('CA1', h2);
            expect(h1).toHaveBeenCalledTimes(1);
            expect(h2).toHaveBeenCalledTimes(1);
        });
    });
});
