import { describe, it, expect } from 'vitest';
import type { ClientRealtimeSessionConfig, JSONValue, RealtimeAvatarStatus } from '@memberjunction/ai';
import { RequestsAgentVideo, ResolveAvatarNotice } from '../session/avatar-notice';

const GRANTED: RealtimeAvatarStatus = { Requested: true, Granted: true };

describe('ResolveAvatarNotice', () => {
    it.each<[string, RealtimeAvatarStatus | null, boolean, boolean, string | null]>([
        ['no status', null, true, false, null],
        ['no avatar asked for', { Requested: false, Granted: false }, true, false, null],
        ['no avatar asked for, with a stray reason', { Requested: false, Granted: false, Reason: 'endpoint' }, true, false, null],
        ['not granted: the status reason', { Requested: true, Granted: false, Reason: 'endpoint' }, true, true, 'endpoint'],
        ['not granted: the reason wins over the browser', { Requested: true, Granted: false, Reason: 'no-binding' }, true, false, 'no-binding'],
        ['not granted without a reason', { Requested: true, Granted: false }, false, false, null],
        ['granted, the app asked for no agent video', GRANTED, false, false, 'host'],
        ['granted, asked for, not live', GRANTED, true, false, 'browser'],
        ['granted, asked for, live', GRANTED, true, true, null],
    ])('%s', (_case, status, requested, established, reason) => {
        expect(ResolveAvatarNotice(status, requested, established)).toEqual(reason ? { Reason: reason } : null);
    });
});

describe('RequestsAgentVideo', () => {
    const config = (requestedTracks?: JSONValue): ClientRealtimeSessionConfig => ({
        Provider: 'p',
        Model: 'm',
        EphemeralToken: 't',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfig: requestedTracks === undefined ? {} : { requestedTracks },
    });

    it("is true when an outbound video track is requested, whatever the modality's case or spacing", () => {
        expect(RequestsAgentVideo(config([{ Modality: 'audio', Direction: 'inbound' }, { Modality: 'video', Direction: 'outbound' }]))).toBe(true);
        expect(RequestsAgentVideo(config([{ Modality: ' Video ', Direction: 'outbound' }]))).toBe(true);
    });

    it('is false without requested tracks, with inbound video only, or with entries it cannot read', () => {
        expect(RequestsAgentVideo(config())).toBe(false);
        expect(RequestsAgentVideo(config([{ Modality: 'video', Direction: 'inbound' }]))).toBe(false);
        expect(RequestsAgentVideo(config([{ Modality: 'audio', Direction: 'outbound' }]))).toBe(false);
        expect(RequestsAgentVideo(config([null, 'video', ['outbound'], { Modality: 7, Direction: 'outbound' }]))).toBe(false);
        expect(RequestsAgentVideo(config({ Modality: 'video', Direction: 'outbound' }))).toBe(false);
    });
});
