import { describe, it, expect } from 'vitest';
import {
    createRingCentralSoftphone,
    parseInvite,
    getHeader,
    extractSipNumber,
    type InboundInviteInfo,
} from '../ringcentral-softphone-handle';
import type { RtpConstructors, SoftphoneCallSession, SoftphoneClient, SoftphoneInviteMessage } from '../softphone-types';

const RTP = {} as RtpConstructors; // the handle only stores + forwards it; never invoked in these tests.

const CODEC = { id: 109, packetSize: 640, timestampInterval: 320, name: 'OPUS/16000' as const };

/** A fake Softphone that lets a test fire an inbound INVITE and records register/answer/decline/call. */
function fakeClient() {
    let inviteHandler: ((m: SoftphoneInviteMessage) => void) | undefined;
    const answered: SoftphoneInviteMessage[] = [];
    const declined: SoftphoneInviteMessage[] = [];
    const placed: string[] = [];
    let registered = false;
    const session = { callId: 'S1', softphone: { codec: CODEC } } as unknown as SoftphoneCallSession;
    const client: SoftphoneClient = {
        codec: CODEC,
        register: async () => {
            registered = true;
        },
        call: async (to: string) => {
            placed.push(to);
            return session;
        },
        answer: async (m: SoftphoneInviteMessage) => {
            answered.push(m);
            return session;
        },
        decline: async (m: SoftphoneInviteMessage) => {
            declined.push(m);
        },
        on: (_event: 'invite', handler: (m: SoftphoneInviteMessage) => void) => {
            inviteHandler = handler;
        },
    };
    return {
        client,
        answered,
        declined,
        placed,
        isRegistered: () => registered,
        fireInvite: (m: SoftphoneInviteMessage) => inviteHandler?.(m),
    };
}

const invite = (callId: string, from: string, to: string): SoftphoneInviteMessage => ({
    headers: { 'Call-ID': callId, From: `<sip:${from}@sip.rc.com>;tag=x`, To: `<sip:${to}@sip.rc.com>` },
});

describe('RingCentralSoftphoneHandle', () => {
    it('register() delegates to the client', async () => {
        const fake = fakeClient();
        const handle = await createRingCentralSoftphone({} as never, { createClient: () => fake.client, rtp: RTP });
        await handle.register();
        expect(fake.isRegistered()).toBe(true);
    });

    it('parks an inbound INVITE and notifies onInvite listeners with parsed identity', async () => {
        const fake = fakeClient();
        const handle = await createRingCentralSoftphone({} as never, { createClient: () => fake.client, rtp: RTP });
        const seen: InboundInviteInfo[] = [];
        handle.onInvite((i) => seen.push(i));

        fake.fireInvite(invite('CID-9', '+15551234567', '+15559998888'));

        expect(seen).toHaveLength(1);
        expect(seen[0]).toEqual({ callId: 'CID-9', from: '+15551234567', to: '+15559998888' });
    });

    it('answerCall() answers the parked INVITE for a call id, once', async () => {
        const fake = fakeClient();
        const handle = await createRingCentralSoftphone({} as never, { createClient: () => fake.client, rtp: RTP });
        fake.fireInvite(invite('CID-9', '+1', '+2'));

        await handle.answerCall('CID-9');
        expect(fake.answered).toHaveLength(1);

        // Parked entry consumed — a second answer throws (already answered / expired).
        await expect(handle.answerCall('CID-9')).rejects.toThrow(/no parked INVITE/);
    });

    it('answerCall() throws for an unknown call id', async () => {
        const fake = fakeClient();
        const handle = await createRingCentralSoftphone({} as never, { createClient: () => fake.client, rtp: RTP });
        await expect(handle.answerCall('NOPE')).rejects.toThrow(/no parked INVITE/);
    });

    it('declineCall() declines + forgets a parked INVITE; no-op for unknown', async () => {
        const fake = fakeClient();
        const handle = await createRingCentralSoftphone({} as never, { createClient: () => fake.client, rtp: RTP });
        fake.fireInvite(invite('CID-9', '+1', '+2'));
        await handle.declineCall('CID-9');
        expect(fake.declined).toHaveLength(1);
        await expect(handle.declineCall('CID-9')).resolves.toBeUndefined(); // already gone — safe
    });

    it('placeCall() forwards the destination to the client', async () => {
        const fake = fakeClient();
        const handle = await createRingCentralSoftphone({} as never, { createClient: () => fake.client, rtp: RTP });
        await handle.placeCall('+15550001111');
        expect(fake.placed).toEqual(['+15550001111']);
    });

    it('ignores an INVITE with no Call-ID rather than crashing the registration', async () => {
        const fake = fakeClient();
        const handle = await createRingCentralSoftphone({} as never, { createClient: () => fake.client, rtp: RTP });
        const seen: InboundInviteInfo[] = [];
        handle.onInvite((i) => seen.push(i));
        fake.fireInvite({ headers: { From: '<sip:+1@h>', To: '<sip:+2@h>' } });
        expect(seen).toHaveLength(0);
    });
});

describe('parseInvite / getHeader / extractSipNumber (pure)', () => {
    it('parseInvite pulls callId/from/to from SIP headers', () => {
        const info = parseInvite(invite('C1', '+15551112222', '+15553334444'));
        expect(info).toEqual({ callId: 'C1', from: '+15551112222', to: '+15553334444' });
    });

    it('parseInvite returns null without a Call-ID', () => {
        expect(parseInvite({ headers: { From: '<sip:+1@h>' } })).toBeNull();
    });

    it('getHeader is case-insensitive', () => {
        const headers = { 'CALL-id': 'abc', from: 'x' };
        expect(getHeader(headers, 'Call-ID')).toBe('abc');
        expect(getHeader(headers, 'From')).toBe('x');
        expect(getHeader(headers, 'Missing')).toBe('');
    });

    it('extractSipNumber handles display-name, angle brackets, bare sip:, and tel:', () => {
        expect(extractSipNumber('"Jane Doe" <sip:+15551234567@sip.rc.com>;tag=9')).toBe('+15551234567');
        expect(extractSipNumber('<sip:+15551234567@sip.rc.com>')).toBe('+15551234567');
        expect(extractSipNumber('sip:1001@pbx.local')).toBe('1001');
        expect(extractSipNumber('tel:+15559998888')).toBe('+15559998888');
        expect(extractSipNumber('')).toBe('');
        expect(extractSipNumber('garbage')).toBe('');
    });
});
