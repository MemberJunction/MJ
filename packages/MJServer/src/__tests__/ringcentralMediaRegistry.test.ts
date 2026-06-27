import { describe, it, expect, vi } from 'vitest';
import { RingCentralCallMediaRegistry, type ITelephonyMediaSocket } from '../telephony/ringcentralMediaRegistry.js';
import type { RingCentralMediaFrame } from '@memberjunction/ai-bridge-ringcentral';

/** A fake media socket capturing sends + tracking close. */
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

const mediaFrame = (data: string): RingCentralMediaFrame => ({ event: 'media', sessionId: 'S1', media: { data } });

describe('RingCentralCallMediaRegistry', () => {
    describe('outbound buffering', () => {
        it('buffers outbound frames before the socket connects, then flushes on AttachSocket in order', () => {
            const reg = new RingCentralCallMediaRegistry();
            reg.RegisterCall('S1');
            reg.Send('S1', mediaFrame('a'));
            reg.Send('S1', mediaFrame('b'));

            const sock = fakeSocket();
            reg.AttachSocket('S1', sock);

            expect(sock.sent).toHaveLength(2);
            expect(JSON.parse(sock.sent[0]).media.data).toBe('a');
            expect(JSON.parse(sock.sent[1]).media.data).toBe('b');
        });

        it('sends immediately once the socket is attached', () => {
            const reg = new RingCentralCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('S1', sock);
            reg.Send('S1', mediaFrame('c'));
            expect(sock.sent).toHaveLength(1);
            expect(JSON.parse(sock.sent[0]).media.data).toBe('c');
        });
    });

    describe('inbound dispatch', () => {
        it('delivers inbound frames to handlers registered before the socket existed', () => {
            const reg = new RingCentralCallMediaRegistry();
            const received: RingCentralMediaFrame[] = [];
            reg.OnFrame('S1', (f) => received.push(f));

            reg.DispatchInbound('S1', mediaFrame('in'));

            expect(received).toHaveLength(1);
            expect(received[0].media?.data).toBe('in');
        });

        it('drops inbound frames for an unknown session (no channel) without throwing', () => {
            const reg = new RingCentralCallMediaRegistry();
            expect(() => reg.DispatchInbound('UNKNOWN', mediaFrame('x'))).not.toThrow();
        });

        it('fans out to multiple handlers (audio + dtmf + status all registered on one session)', () => {
            const reg = new RingCentralCallMediaRegistry();
            const h1 = vi.fn();
            const h2 = vi.fn();
            reg.OnFrame('S1', h1);
            reg.OnFrame('S1', h2);
            reg.DispatchInbound('S1', mediaFrame('y'));
            expect(h1).toHaveBeenCalledTimes(1);
            expect(h2).toHaveBeenCalledTimes(1);
        });

        it('dispatches dtmf and stop event frames to handlers', () => {
            const reg = new RingCentralCallMediaRegistry();
            const received: RingCentralMediaFrame[] = [];
            reg.OnFrame('S1', (f) => received.push(f));
            reg.DispatchInbound('S1', { event: 'dtmf', sessionId: 'S1', dtmf: { digit: '5' } });
            reg.DispatchInbound('S1', { event: 'stop', sessionId: 'S1' });
            expect(received).toHaveLength(2);
            expect(received[0].dtmf?.digit).toBe('5');
            expect(received[1].event).toBe('stop');
        });
    });

    describe('lifecycle', () => {
        it('EndCall closes the socket and forgets the channel', () => {
            const reg = new RingCentralCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('S1', sock);
            expect(reg.HasCall('S1')).toBe(true);

            reg.EndCall('S1');

            expect(sock.closed).toBe(true);
            expect(reg.HasCall('S1')).toBe(false);
        });

        it('EndCall on an unknown session is a no-op', () => {
            const reg = new RingCentralCallMediaRegistry();
            expect(() => reg.EndCall('NOPE')).not.toThrow();
        });
    });
});
