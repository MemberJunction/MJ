/**
 * @fileoverview Adapters from LiveKit's views to the generic `/media` models that `@memberjunction/ng-realtime-media`
 * renders, so the meeting room and the realtime overlay share one tile, meter and device menu.
 *
 * Both are memoized: the controller rebuilds its views on every state change, and a tile must see the same
 * participant and the same video source until something actually changes, or it would reattach its video.
 *
 * `ToScreenShareCaptureOptions` goes the other way: the kind of surface a user picked from the Share menu, as
 * LiveKit's screen-share options.
 *
 * @module @memberjunction/livekit-room-core
 */

import { Track, type ScreenShareCaptureOptions, type TrackPublication } from 'livekit-client';
import type {
    DisplayCaptureSurface,
    MediaDevice,
    MediaDeviceKind,
    MediaParticipant,
    MediaVideoSource,
} from '@memberjunction/ai-realtime-client/media';
import { IsAgentAvatarTrack } from './agent-avatar';
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

/** The `displaySurface` values LiveKit hands to `getDisplayMedia`. */
type LiveKitDisplaySurface = NonNullable<Exclude<ScreenShareCaptureOptions['video'], boolean | undefined>['displaySurface']>;

/** The browser's name for each kind of display surface. */
const DISPLAY_SURFACES: Record<DisplayCaptureSurface, LiveKitDisplaySurface> = {
    screen: 'monitor',
    window: 'window',
    tab: 'browser',
};

/**
 * A LiveKit participant as a `/media` participant. The camera and the shared screen become element sources,
 * absent while unpublished or muted; the tile prefers the screen while one is shared, as the LiveKit tile did. An
 * agent's avatar, which its bot publishes as a camera track of its own name, is the participant's avatar, not a camera,
 * so a tile labels it as generated video. Media the view carries from outside LiveKit (`Media`) replaces the tracks and
 * level it covers.
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
    return { DeviceID: device.DeviceId, Kind: ToMediaDeviceKind(device.Kind), Label: device.Label, GroupID: '' };
}

/** The `/media` device kind for a LiveKit one. */
export function ToMediaDeviceKind(kind: LiveKitDevice['Kind']): MediaDeviceKind {
    return DEVICE_KINDS[kind];
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

/**
 * LiveKit's screen-share options for a `/media` surface preference: the kind of surface the browser's picker offers
 * first. A hint: only Chromium browsers read it, and the user can still pick another kind. No preference gives no
 * options, so LiveKit asks as it always has.
 */
export function ToScreenShareCaptureOptions(surface?: DisplayCaptureSurface): ScreenShareCaptureOptions | undefined {
    return surface ? { video: { displaySurface: DISPLAY_SURFACES[surface] } } : undefined;
}

function buildMediaParticipant(view: LiveKitParticipantView): MediaParticipant {
    const video = videosOf(view);
    const raw = view.Raw;
    return {
        Identity: view.Identity,
        DisplayName: view.DisplayName,
        Role: view.IsLocal ? 'self' : view.Role,
        IsSpeaking: view.IsSpeaking,
        Video: video,
        PreferredVideo: view.IsScreenSharing ? 'screen' : video.avatar ? 'avatar' : 'camera',
        IsMuted: !view.HasAudio,
        ConnectionQuality: view.ConnectionQuality,
        // The live level, not the view's snapshot: a meter reads it on every frame.
        GetAudioLevel: view.Media?.GetAudioLevel ?? (() => raw.audioLevel),
        ...(view.AgentCanSee ? { AgentCanSee: true } : {}),
    };
}

/** The participant's videos by kind: an agent's avatar track is its avatar, any other camera track its camera. */
function videosOf(view: LiveKitParticipantView): MediaParticipant['Video'] {
    const cameraPublication = view.Raw.getTrackPublication(Track.Source.Camera);
    const camera = videoSourceOf(cameraPublication);
    const screen = videoSourceOf(view.Raw.getTrackPublication(Track.Source.ScreenShare));
    const cameraKind = IsAgentAvatarTrack(view.Role, cameraPublication?.trackName) ? 'avatar' : 'camera';
    return { ...(camera ? { [cameraKind]: camera } : {}), ...(screen ? { screen } : {}), ...view.Media?.Video };
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
