import { describe, it, expect, vi } from 'vitest';
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

describe('TwilioCallMediaRegistry', () => {
    describe('outbound buffering', () => {
        it('buffers outbound frames before the socket connects, then flushes on AttachSocket in order', () => {
            const reg = new TwilioCallMediaRegistry();
            reg.RegisterCall('CA1');
            reg.Send('CA1', mediaFrame('a'));
            reg.Send('CA1', mediaFrame('b'));

            const sock = fakeSocket();
            reg.AttachSocket('CA1', sock, 'MZ1');

            expect(sock.sent).toHaveLength(2);
            expect(JSON.parse(sock.sent[0]).media.payload).toBe('a');
            expect(JSON.parse(sock.sent[1]).media.payload).toBe('b');
        });

        it('sends immediately once the socket is attached', () => {
            const reg = new TwilioCallMediaRegistry();
            const sock = fakeSocket();
            reg.AttachSocket('CA1', sock, 'MZ1');
            reg.Send('CA1', mediaFrame('c'));
            expect(sock.sent).toHaveLength(1);
            expect(JSON.parse(sock.sent[0]).media.payload).toBe('c');
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
            reg.AttachSocket('CA1', sock, 'MZ1');
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
});
