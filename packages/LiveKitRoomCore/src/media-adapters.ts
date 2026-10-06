/**
 * @fileoverview Adapters from LiveKit's views to the generic `/media` models that `@memberjunction/ng-realtime-media`
 * renders, so the meeting room and the realtime overlay share one tile, meter and device menu.
 *
 * Both are memoized: the controller rebuilds its views on every state change, and a tile must see the same
 * participant and the same video source until something actually changes, or it would reattach its video.
 *
 * @module @memberjunction/livekit-room-core
 */

import { Track, type TrackPublication } from 'livekit-client';
import type {
    MediaDevice,
    MediaDeviceKind,
    MediaParticipant,
    MediaVideoSource,
} from '@memberjunction/ai-realtime-client/media';
import type { LiveKitDevice, LiveKitParticipantView } from './types';

/** One source per track: LiveKit attaches the track to the element, keeping its own autoplay handling. */
const videoSources = new WeakMap<Track, MediaVideoSource>();

/** One participant per view: a view is a snapshot, so the same view always maps to the same participant. */
const participants = new WeakMap<LiveKitParticipantView, MediaParticipant>();

const DEVICE_KINDS: Record<LiveKitDevice['Kind'], MediaDeviceKind> = {
    audioinput: 'microphone',
    videoinput: 'camera',
    audiooutput: 'speaker',
};

/**
 * A LiveKit participant as a `/media` participant. The camera and the shared screen become element sources,
 * absent while unpublished or muted; the tile prefers the screen while one is shared, as the LiveKit tile did.
 */
export function ToMediaParticipant(view: LiveKitParticipantView): MediaParticipant {
    let participant = participants.get(view);
    if (!participant) {
        participant = buildMediaParticipant(view);
        participants.set(view, participant);
    }
    return participant;
}

/** A LiveKit device as a `/media` device. LiveKit does not report device groups. */
export function ToMediaDevice(device: LiveKitDevice): MediaDevice {
    return { DeviceID: device.DeviceId, Kind: DEVICE_KINDS[device.Kind], Label: device.Label, GroupID: '' };
}

/** The LiveKit device kind for a `/media` one, for handing a device-menu choice back to the controller. */
export function ToLiveKitDeviceKind(kind: MediaDeviceKind): LiveKitDevice['Kind'] {
    switch (kind) {
        case 'microphone':
            return 'audioinput';
        case 'camera':
            return 'videoinput';
        default:
            return 'audiooutput';
    }
}

function buildMediaParticipant(view: LiveKitParticipantView): MediaParticipant {
    const camera = videoSourceOf(view.Raw.getTrackPublication(Track.Source.Camera));
    const screen = videoSourceOf(view.Raw.getTrackPublication(Track.Source.ScreenShare));
    const raw = view.Raw;
    return {
        Identity: view.Identity,
        DisplayName: view.DisplayName,
        Role: view.IsLocal ? 'self' : view.Role,
        IsSpeaking: view.IsSpeaking,
        Video: { ...(camera ? { camera } : {}), ...(screen ? { screen } : {}) },
        PreferredVideo: view.IsScreenSharing ? 'screen' : 'camera',
        IsMuted: !view.HasAudio,
        ConnectionQuality: view.ConnectionQuality,
        // The live level, not the view's snapshot: a meter reads it on every frame.
        GetAudioLevel: () => raw.audioLevel,
    };
}

/** The publication's track as an element source, or `undefined` when there is no live track to show. */
function videoSourceOf(publication: TrackPublication | undefined): MediaVideoSource | undefined {
    const track = publication?.track;
    if (!track || publication.isMuted) {
        return undefined;
    }
    let source = videoSources.get(track);
    if (!source) {
        source = {
            Kind: 'element',
            Attach: (element: HTMLVideoElement) => {
                track.attach(element);
                return () => {
                    track.detach(element);
                };
            },
        };
        videoSources.set(track, source);
    }
    return source;
}
