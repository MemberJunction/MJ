/**
 * @fileoverview Shared types for the `/media` entry point: the local devices and capture state that the
 * media controllers and the UI exchange.
 *
 * @module @memberjunction/ai-realtime-client/media
 */

/** A kind of local device the user captures from. */
export type LocalMediaKind = 'camera' | 'microphone';

/** What a device does: a camera or a microphone the user captures from, or a speaker that plays sound. */
export type MediaDeviceKind = LocalMediaKind | 'speaker';

/** One device. */
export interface MediaDevice {
    /** The browser's id for the device, stable for this site until the user clears its data. */
    DeviceID: string;
    Kind: MediaDeviceKind;
    /** The device's name. Browsers leave it empty until the user has allowed this site that kind of device. */
    Label: string;
    /** Devices on the same physical product (a webcam's camera and microphone) share a group id. */
    GroupID: string;
}

/** Why a local device could not be used. */
export type LocalMediaFailure =
    /** The user, the operating system or the page's permissions policy refused access. */
    | 'denied'
    /** There is no device of that kind, or not the one asked for. */
    | 'not-found'
    /** The device exists, but another application is using it. */
    | 'in-use'
    /** The browser cannot capture at all (no `getUserMedia`). */
    | 'unsupported'
    /** Anything else; see the message. */
    | 'error';

/** One kind of local capture. */
export interface LocalTrackState {
    Status: 'off' | 'starting' | 'on' | 'failed';
    /** The device in use, while `on`. */
    DeviceID?: string;
    /** That device's name, while `on`. */
    Label?: string;
    /** Why capture failed, while `failed`. */
    Failure?: LocalMediaFailure;
    /** The browser's message for the failure. */
    Message?: string;
}

/** Everything captured locally, as the `LocalMediaController` reports it. */
export interface LocalMediaState {
    Camera: LocalTrackState;
    Microphone: LocalTrackState;
    /** The input devices the browser lists now. */
    Devices: MediaDevice[];
}

/** The outcome of starting or switching a local device. It always resolves; it never rejects. */
export type LocalMediaResult =
    | { Status: 'started'; Stream: MediaStream }
    | { Status: 'failed'; Reason: LocalMediaFailure; Message: string };

/**
 * A source of video to show: a live `MediaStream` (a camera, a shared screen, a WebRTC track), or a player that
 * must own the `<video>` element (MSE or WebCodecs playout of encoded video, such as an avatar). Renderers show
 * either with `AttachVideoSource`.
 */
export type MediaVideoSource =
    /** A live stream, shown muted: its audio is played elsewhere. */
    | { Kind: 'stream'; Stream: MediaStream }
    /** A player that takes over the element and returns a function that releases it. */
    | { Kind: 'element'; Attach(element: HTMLVideoElement): () => void };

/**
 * What a participant's video shows. Open vocabulary. These are on-screen kinds; the video source arbiter's
 * `VideoSourceKind` is a different list, of what the model is shown.
 */
export type MediaSourceKind = 'camera' | 'screen' | 'avatar' | (string & {});

/** Where a surface appears: the main stage, a picture-in-picture tile, a tab, or nowhere. */
export type MediaPlacement = 'stage' | 'pip' | 'tab' | 'hidden';

/** Every placement, in the order a displaced surface falls back through them. */
export const MEDIA_PLACEMENTS: readonly MediaPlacement[] = ['stage', 'pip', 'tab', 'hidden'];

/** One person or agent in a session, as the media stage and its tiles see them. */
export interface MediaParticipant {
    /** Stable identity within the session. */
    Identity: string;
    DisplayName: string;
    /** `'self'` is the local user. */
    Role: 'self' | 'agent' | 'host' | 'participant';
    /** Whether the participant is speaking now. */
    IsSpeaking: boolean;
    /** The participant's videos, by kind: a camera, a shared screen, an avatar. */
    Video: Partial<Record<MediaSourceKind, MediaVideoSource>>;
    /** Which video a tile shows when there are several. Defaults to a shared screen, then the camera, then the avatar. */
    PreferredVideo?: MediaSourceKind;
    /** Whether the participant's microphone is off. */
    IsMuted?: boolean;
    /** The connection's quality, when the platform reports one. */
    ConnectionQuality?: MediaConnectionQuality;
    /** Reads the participant's current audio level, 0..1, for a meter. Called on every animation frame. */
    GetAudioLevel?: () => number;
    /**
     * Whether an agent can see this participant's camera and shared screen: they allowed it, and an agent is there to
     * watch. A tile shows "Agent can see". Absent means no.
     */
    AgentCanSee?: boolean;
}

/** A participant's connection quality. */
export type MediaConnectionQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

/** The agent's conversational state, for an indicator. */
export type MediaAgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** The state of a session's connection, for an overlay. */
export type MediaConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

/** Why a session ended. */
export type MediaDisconnectReason =
    | 'client-initiated'
    | 'server-shutdown'
    | 'participant-removed'
    | 'room-deleted'
    | 'connection-lost'
    | 'duplicate-identity'
    | 'unknown';

/** A device the user picked in a device menu. */
export interface MediaDeviceSelection {
    Kind: MediaDeviceKind;
    DeviceID: string;
}

/**
 * Something that can be placed: a channel's surface (a whiteboard, a remote browser) or a participant's video
 * (the avatar, the user's camera, a shared screen).
 */
export interface MediaSurface {
    /** Stable key, usually the channel key. The user's moves are recorded against it. */
    Key: string;
    Label: string;
    /** Where it goes unless the user moved it. */
    DefaultPlacement: MediaPlacement;
    /** Where the user may move it. Defaults to every placement. */
    AllowedPlacements?: readonly MediaPlacement[];
    /** The participant video it shows, when it is one; absent for a component surface such as a whiteboard. */
    Video?: { ParticipantIdentity: string; Kind: MediaSourceKind };
}

/** One move the user made: a surface to a placement. */
export interface MediaPlacementMove {
    SurfaceKey: string;
    Placement: MediaPlacement;
}

/** A picture-in-picture box as fractions of the stage (0 to 1), so it survives a resized window: what a host saves. */
export interface MediaPipRect {
    X: number;
    Y: number;
    W: number;
    H: number;
}
