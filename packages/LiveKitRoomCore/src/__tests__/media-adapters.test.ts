import { describe, it, expect } from 'vitest';
import { Track, type Participant } from 'livekit-client';
import type { MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { ToLiveKitDeviceKind, ToMediaDevice, ToMediaDeviceKind, ToMediaParticipant, ToScreenShareCaptureOptions } from '../media-adapters';
import type { LiveKitParticipantView } from '../types';

/** A track that records what it was attached to and detached from. */
class FakeTrack {
    public readonly Attached: HTMLVideoElement[] = [];
    public readonly Detached: HTMLVideoElement[] = [];
    public attach(element: HTMLVideoElement): HTMLVideoElement {
        this.Attached.push(element);
        return element;
    }
    public detach(element: HTMLVideoElement): HTMLVideoElement {
        this.Detached.push(element);
        return element;
    }
}

/** A livekit-client participant reduced to what the adapter reads: its publications and its live level. */
function fakeRaw(publications: Partial<Record<Track.Source, { track?: FakeTrack; isMuted: boolean }>>): Participant {
    return {
        audioLevel: 0,
        getTrackPublication: (source: Track.Source) => publications[source],
    } as unknown as Participant;
}

function view(raw: Participant, over: Partial<LiveKitParticipantView> = {}): LiveKitParticipantView {
    return {
        Identity: 'ada',
        DisplayName: 'Ada Lovelace',
        IsLocal: false,
        Role: 'participant',
        IsSpeaking: false,
        AudioLevel: 0,
        HasAudio: true,
        HasVideo: false,
        IsScreenSharing: false,
        ConnectionQuality: 'good',
        Raw: raw,
        ...over,
    };
}

const element = {} as HTMLVideoElement;

describe('ToMediaParticipant', () => {
    it('makes the camera and the shared screen element sources that LiveKit attaches', () => {
        const camera = new FakeTrack();
        const screen = new FakeTrack();
        const participant = ToMediaParticipant(
            view(fakeRaw({ [Track.Source.Camera]: { track: camera, isMuted: false }, [Track.Source.ScreenShare]: { track: screen, isMuted: false } }))
        );

        const source = participant.Video.camera;
        expect(source?.Kind).toBe('element');
        const detach = source?.Kind === 'element' ? source.Attach(element) : (): void => undefined;
        expect(camera.Attached).toEqual([element]);
        detach();
        expect(camera.Detached).toEqual([element]);
        expect(participant.Video.screen?.Kind).toBe('element');
    });

    it('leaves out a muted or unpublished track', () => {
        const participant = ToMediaParticipant(view(fakeRaw({ [Track.Source.Camera]: { track: new FakeTrack(), isMuted: true } })));
        expect(participant.Video).toEqual({});
    });

    it('gives the same source for the same track across views, so a tile does not reattach', () => {
        const camera = new FakeTrack();
        const raw = fakeRaw({ [Track.Source.Camera]: { track: camera, isMuted: false } });
        expect(ToMediaParticipant(view(raw)).Video.camera).toBe(ToMediaParticipant(view(raw, { IsSpeaking: true })).Video.camera);
    });

    it('gives the same participant for the same view', () => {
        const same = view(fakeRaw({}));
        expect(ToMediaParticipant(same)).toBe(ToMediaParticipant(same));
    });

    it('maps the role, mute, quality and preferred video as the LiveKit tile showed them', () => {
        const local = ToMediaParticipant(view(fakeRaw({}), { IsLocal: true, Role: 'host', HasAudio: false, ConnectionQuality: 'poor' }));
        expect(local.Role).toBe('self');
        expect(local.IsMuted).toBe(true);
        expect(local.ConnectionQuality).toBe('poor');
        expect(local.PreferredVideo).toBe('camera');

        const agent = ToMediaParticipant(view(fakeRaw({}), { Role: 'agent', IsScreenSharing: true }));
        expect(agent.Role).toBe('agent');
        expect(agent.PreferredVideo).toBe('screen');
    });

    it('reads the live audio level, not the snapshot', () => {
        const live = { audioLevel: 0.2, getTrackPublication: (): undefined => undefined };
        const participant = ToMediaParticipant(view(live as unknown as Participant, { AudioLevel: 0.9 }));
        expect(participant.GetAudioLevel?.()).toBe(0.2);
        live.audioLevel = 0.7;
        expect(participant.GetAudioLevel?.()).toBe(0.7);
    });

    it('shows media from outside LiveKit in place of the tracks and the level it covers', () => {
        const raw = fakeRaw({
            [Track.Source.Camera]: { track: new FakeTrack(), isMuted: false },
            [Track.Source.ScreenShare]: { track: new FakeTrack(), isMuted: false },
        });
        const camera: MediaVideoSource = { Kind: 'stream', Stream: {} as MediaStream };
        const participant = ToMediaParticipant(view(raw, { Media: { Video: { camera }, GetAudioLevel: () => 0.6 } }));
        expect(participant.Video.camera).toBe(camera);
        // A kind it does not cover still comes from LiveKit.
        expect(participant.Video.screen?.Kind).toBe('element');
        expect(participant.GetAudioLevel?.()).toBe(0.6);
    });
});

describe('device mapping', () => {
    it('maps LiveKit device kinds to /media kinds and back', () => {
        expect(ToMediaDevice({ DeviceId: 'mic-1', Kind: 'audioinput', Label: 'USB Mic' })).toEqual({ DeviceID: 'mic-1', Kind: 'microphone', Label: 'USB Mic', GroupID: '' });
        expect(ToMediaDevice({ DeviceId: 'cam-1', Kind: 'videoinput', Label: '' }).Kind).toBe('camera');
        expect(ToMediaDevice({ DeviceId: 'spk-1', Kind: 'audiooutput', Label: '' }).Kind).toBe('speaker');
        expect(ToLiveKitDeviceKind('microphone')).toBe('audioinput');
        expect(ToLiveKitDeviceKind('camera')).toBe('videoinput');
        expect(ToLiveKitDeviceKind('speaker')).toBe('audiooutput');
        expect(ToMediaDeviceKind('audioinput')).toBe('microphone');
        expect(ToMediaDeviceKind('videoinput')).toBe('camera');
        expect(ToMediaDeviceKind('audiooutput')).toBe('speaker');
    });
});

describe('ToScreenShareCaptureOptions', () => {
    it("asks LiveKit for the browser's display surface of each kind", () => {
        expect(ToScreenShareCaptureOptions('screen')).toEqual({ video: { displaySurface: 'monitor' } });
        expect(ToScreenShareCaptureOptions('window')).toEqual({ video: { displaySurface: 'window' } });
        expect(ToScreenShareCaptureOptions('tab')).toEqual({ video: { displaySurface: 'browser' } });
    });

    it('gives no options without a preference, so LiveKit asks as it always has', () => {
        expect(ToScreenShareCaptureOptions()).toBeUndefined();
    });
});
