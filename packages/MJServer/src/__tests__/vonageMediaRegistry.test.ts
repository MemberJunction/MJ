import { describe, it, expect, vi } from 'vitest';
import { VonageCallMediaRegistry, type ITelephonyMediaSocket } from '../telephony/vonageMediaRegistry.js';
import type { VonageMediaFrame } from '@memberjunction/ai-bridge-vonage';

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

const mediaFrame = (payload: string): VonageMediaFrame => ({ event: 'media', payload });

describe('VonageCallMediaRegistry', () => {
    describe('outbound buffering', () => {
        it('buffers outbound frames before the socket connects, then flushes on AttachSocket in order', () => {
            const reg = new VonageCallMediaRegistry();
            reg.RegisterCall('CALL-1');
            reg.Send('CALL-1', mediaFrame('a'));
            reg.Send('CALL-1', mediaFrame('b'));

            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);

            expect(sock.sent).toHaveLength(2);
            expect(JSON.parse(sock.sent[0]).payload).toBe('a');
            expect(JSON.parse(sock.sent[1]).payload).toBe('b');
        });

        it('sends immediately once the socket is attached', () => {
            const reg = new VonageCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('CALL-1', sock);
            reg.Send('CALL-1', mediaFrame('c'));
            expect(sock.sent).toHaveLength(1);
            expect(JSON.parse(sock.sent[0]).payload).toBe('c');
        });
    });

    describe('inbound dispatch', () => {
        it('delivers inbound frames to handlers registered before the socket existed', () => {
            const reg = new VonageCallMediaRegistry();
            const received: VonageMediaFrame[] = [];
            reg.OnFrame('CALL-1', (f) => received.push(f));

            reg.DispatchInbound('CALL-1', mediaFrame('in'));

            expect(received).toHaveLength(1);
            expect(received[0].payload).toBe('in');
        });

        it('drops inbound frames for an unknown call (no channel) without throwing', () => {
            const reg = new VonageCallMediaRegistry();
            expect(() => reg.DispatchInbound('UNKNOWN', mediaFrame('x'))).not.toThrow();
        });

        it('fans out to multiple handlers (audio + dtmf + status all registered on one call)', () => {
            const reg = new VonageCallMediaRegistry();
            const h1 = vi.fn();
            const h2 = vi.fn();
            reg.OnFrame('CALL-1', h1);
            reg.OnFrame('CALL-1', h2);
            reg.DispatchInbound('CALL-1', mediaFrame('y'));
            expect(h1).toHaveBeenCalledTimes(1);
            expect(h2).toHaveBeenCalledTimes(1);
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
