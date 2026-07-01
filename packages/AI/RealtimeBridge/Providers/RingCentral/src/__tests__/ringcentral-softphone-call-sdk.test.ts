import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RingCentralSoftphoneCallSdk, bufferToArrayBuffer, type SoftphoneCallSource } from '../ringcentral-softphone-call-sdk';
import type { RtpConstructors, RtpHeaderInit, RtpPacketInstance, SoftphoneCallSession } from '../softphone-types';

const CODEC = { id: 109, packetSize: 640, timestampInterval: 320, name: 'OPUS/16000' as const };

/** A fake call session that records outbound packets + DTMF + lets tests fire inbound events. */
function fakeSession(callId = 'CALL-1') {
    const sent: RtpPacketInstance[] = [];
    const dtmfsSent: string[] = [];
    const transfers: string[] = [];
    let hungUp = false;
    const handlers: Record<string, ((arg: unknown) => void)[]> = {};
    const onceHandlers: Record<string, (() => void)[]> = {};
    const session: SoftphoneCallSession = {
        callId,
        remotePeer: '"Caller" <sip:+15551234567@sip.rc.com>;tag=abc',
        encoder: { encode: (pcm: Buffer) => pcm },
        sequenceNumber: 0,
        timestamp: 0,
        ssrc: 1,
        disposed: false,
        softphone: { codec: CODEC },
        sendPacket: (p: RtpPacketInstance) => sent.push(p),
        hangup: async () => {
            hungUp = true;
        },
        transfer: async (to: string) => {
            transfers.push(to);
        },
        sendDTMF: (c: string) => dtmfsSent.push(c),
        on: (event: string, handler: (arg: never) => void) => {
            (handlers[event] ??= []).push(handler as (arg: unknown) => void);
        },
        once: (event: string, handler: () => void) => {
            (onceHandlers[event] ??= []).push(handler);
        },
    };
    return {
        session,
        sent,
        dtmfsSent,
        transfers,
        isHungUp: () => hungUp,
        fireAudio: (payload: Buffer) => handlers['audioPacket']?.forEach((h) => h({ payload })),
        fireDtmf: (digit: string) => handlers['dtmf']?.forEach((h) => h(digit)),
        fireDisposed: () => onceHandlers['disposed']?.forEach((h) => h()),
        fireBusy: () => onceHandlers['busy']?.forEach((h) => h()),
    };
}

const RTP: RtpConstructors = {
    RtpHeader: class {
        constructor(init: RtpHeaderInit) {
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

function fakeSource(fake: ReturnType<typeof fakeSession>): SoftphoneCallSource {
    return {
        placeCall: async () => fake.session,
        answerCall: async () => fake.session,
        rtp: RTP,
    };
}

const pcm = (bytes: number, tag = 0): ArrayBuffer => {
    const b = new Uint8Array(bytes);
    if (bytes > 0) b[0] = tag;
    return b.buffer;
};

describe('RingCentralSoftphoneCallSdk', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('dial() places a call through the source and returns the SIP Call-ID', async () => {
        const fake = fakeSession('OUT-7');
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        const id = await sdk.dial('+15559998888', '+15551112222');
        expect(id).toBe('OUT-7');
        await sdk.hangup('OUT-7');
    });

    it('routes inbound audioPacket bytes to the registered onAudioFrame handler (verbatim)', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        const heard: ArrayBuffer[] = [];
        sdk.onAudioFrame((p) => heard.push(p));
        await sdk.answer('CALL-1');

        fake.fireAudio(Buffer.from([1, 2, 3, 4]));
        expect(heard).toHaveLength(1);
        expect(new Uint8Array(heard[0])).toEqual(new Uint8Array([1, 2, 3, 4]));
        await sdk.hangup('CALL-1');
    });

    it('paces queued outbound audio onto the session at one 640-byte frame per 20 ms', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        await sdk.dial('+1', '+2');

        sdk.sendAudioFrame(pcm(640, 0x11));
        sdk.sendAudioFrame(pcm(640, 0x22));
        expect(fake.sent).toHaveLength(0); // not yet — the clock hasn't ticked

        vi.advanceTimersByTime(20);
        expect(fake.sent).toHaveLength(1);
        expect(fake.sent[0].payload[0]).toBe(0x11);
        vi.advanceTimersByTime(20);
        expect(fake.sent).toHaveLength(2);
        expect(fake.sent[1].payload[0]).toBe(0x22);
        await sdk.hangup('x');
    });

    it('flushOutbound() drops queued audio so a barge-in silences the agent immediately', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        await sdk.dial('+1', '+2');
        sdk.sendAudioFrame(pcm(640 * 4));
        sdk.flushOutbound();
        vi.advanceTimersByTime(100);
        expect(fake.sent).toHaveLength(0);
        await sdk.hangup('x');
    });

    it('sends each DTMF digit individually over the live session', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        await sdk.answer('CALL-1');
        await sdk.sendDtmf('12#');
        expect(fake.dtmfsSent).toEqual(['1', '2', '#']);
        await sdk.hangup('CALL-1');
    });

    it('surfaces inbound DTMF to the registered handler', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        const digits: string[] = [];
        sdk.onDtmf((d) => digits.push(d));
        await sdk.answer('CALL-1');
        fake.fireDtmf('7');
        expect(digits).toEqual(['7']);
        await sdk.hangup('CALL-1');
    });

    it('fires onCallEnded when the session is disposed (either party hangs up)', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        let ended = false;
        sdk.onCallEnded(() => (ended = true));
        await sdk.answer('CALL-1');
        fake.fireDisposed();
        expect(ended).toBe(true);
    });

    it('fires onCallEnded on a busy outbound call', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        let ended = false;
        sdk.onCallEnded(() => (ended = true));
        await sdk.dial('+1', '+2');
        fake.fireBusy();
        expect(ended).toBe(true);
    });

    it('transfer() blind-transfers the live session', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        await sdk.answer('CALL-1');
        await sdk.transfer('CALL-1', '+15550001111');
        expect(fake.transfers).toEqual(['+15550001111']);
        await sdk.hangup('CALL-1');
    });

    it('hangup() hangs up the session and stops the outbound clock', async () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        await sdk.dial('+1', '+2');
        await sdk.hangup('x');
        expect(fake.isHungUp()).toBe(true);
        // After hangup the sender is gone — further audio + ticks send nothing.
        sdk.sendAudioFrame(pcm(640));
        vi.advanceTimersByTime(40);
        expect(fake.sent).toHaveLength(0);
    });

    it('sendAudioFrame / flushOutbound before a call are safe no-ops', () => {
        const fake = fakeSession();
        const sdk = new RingCentralSoftphoneCallSdk(fakeSource(fake));
        expect(() => sdk.sendAudioFrame(pcm(640))).not.toThrow();
        expect(() => sdk.flushOutbound()).not.toThrow();
    });

    it('bufferToArrayBuffer copies into a standalone ArrayBuffer (no aliasing of a pooled view)', () => {
        const buf = Buffer.from([9, 8, 7]);
        const ab = bufferToArrayBuffer(buf);
        expect(new Uint8Array(ab)).toEqual(new Uint8Array([9, 8, 7]));
        expect(ab.byteLength).toBe(3);
    });
});
