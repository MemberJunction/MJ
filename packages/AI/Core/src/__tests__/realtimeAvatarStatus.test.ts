import { describe, it, expect } from 'vitest';
import { ParseRealtimeAvatarStatus, REALTIME_AVATAR_UNAVAILABLE_REASONS } from '../generic/realtimeAvatarStatus';
import type { RealtimeAvatarUnavailableReason } from '../generic/baseRealtime';

const EVERY_REASON: RealtimeAvatarUnavailableReason[] = [
    'endpoint',
    'bridged',
    'phone',
    'custom-disabled',
    'unknown-avatar',
    'no-binding',
    'host',
    'browser',
    'decoder-missing',
    'decoder-failed',
    'publish-failed',
];

describe('ParseRealtimeAvatarStatus', () => {
    it('reads a granted status, and an audio-only one with its reason', () => {
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":true}')).toEqual({ Requested: true, Granted: true });
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":false,"Reason":"endpoint"}')).toEqual({
            Requested: true,
            Granted: false,
            Reason: 'endpoint',
        });
    });

    it("reads a phone call's status: asked for, not granted, because the caller sees no video", () => {
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":false,"Reason":"phone"}')).toEqual({ Requested: true, Granted: false, Reason: 'phone' });
    });

    it('reads every reason this version knows, and treats a null reason as none', () => {
        for (const reason of EVERY_REASON) {
            expect(ParseRealtimeAvatarStatus(JSON.stringify({ Requested: true, Granted: false, Reason: reason }))?.Reason, reason).toBe(reason);
        }
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":false,"Reason":null}')).toEqual({ Requested: true, Granted: false });
    });

    it('lists every reason it reads, from the same table (a meeting bot reads its attribute back with the list)', () => {
        expect([...REALTIME_AVATAR_UNAVAILABLE_REASONS].sort()).toEqual([...EVERY_REASON].sort());
    });

    it('reads no status from a reason it does not know, including the retired "downgraded"', () => {
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":false,"Reason":"downgraded"}')).toBeNull();
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":false,"Reason":"a-future-reason"}')).toBeNull();
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":false,"Reason":7}')).toBeNull();
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":false,"Reason":"toString"}')).toBeNull();
    });

    it('reads no status when a field is missing or of the wrong type', () => {
        expect(ParseRealtimeAvatarStatus('{"Granted":true}')).toBeNull();
        expect(ParseRealtimeAvatarStatus('{"Requested":true}')).toBeNull();
        expect(ParseRealtimeAvatarStatus('{"Requested":"true","Granted":true}')).toBeNull();
        expect(ParseRealtimeAvatarStatus('{"Requested":true,"Granted":1}')).toBeNull();
    });

    it('reads no status from malformed JSON, a value that is not an object, or nothing', () => {
        expect(ParseRealtimeAvatarStatus('{"Requested":true,')).toBeNull();
        expect(ParseRealtimeAvatarStatus('[true,true]')).toBeNull();
        expect(ParseRealtimeAvatarStatus('"granted"')).toBeNull();
        expect(ParseRealtimeAvatarStatus('null')).toBeNull();
        expect(ParseRealtimeAvatarStatus('')).toBeNull();
        expect(ParseRealtimeAvatarStatus(null)).toBeNull();
        expect(ParseRealtimeAvatarStatus(undefined)).toBeNull();
    });
});
