/**
 * @fileoverview Framework-agnostic types for the LiveKit room core. These are the vocabulary the
 * MJ-native realtime room UX binds to — deliberately free of any UI-framework or LiveKit SDK type in
 * their *public* shape, so consumers (Angular, React, plain TS) program against a stable surface.
 *
 * The one intentional exception is {@link LiveKitParticipantView.Raw}, which carries the underlying
 * livekit-client `Participant` so a UI layer can call `track.attach(element)` to render media — the SDK
 * owns the DOM-attach mechanics and there is no value in re-implementing them.
 *
 * @module @memberjunction/livekit-room-core
 */

import type { Participant, RoomOptions, Track } from 'livekit-client';

/**
 * The connection lifecycle of a LiveKit room as the core normalizes it. Maps the livekit-client
 * `ConnectionState` plus the pre-connect / post-disconnect edges into one stable union.
 */
export type LiveKitConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'error';

/** Why a room disconnected — normalized from the livekit-client `DisconnectReason`. */
export type LiveKitDisconnectReason =
    | 'client-initiated'
    | 'server-shutdown'
    | 'participant-removed'
    | 'room-deleted'
    | 'connection-lost'
    | 'duplicate-identity'
    | 'unknown';

/** The role a participant holds in the room, derived from LiveKit participant metadata. */
export type LiveKitParticipantRole = 'host' | 'agent' | 'participant';

/** The kind of a media track, normalized from `Track.Kind`. */
export type LiveKitTrackKind = 'audio' | 'video' | 'screen' | 'screen-audio' | 'unknown';

/**
 * A normalized view of one room participant. This is what a UI grid renders — one tile per view.
 * {@link Raw} is included so the UI can attach the participant's video/audio tracks to DOM elements.
 */
export interface LiveKitParticipantView {
    /** Stable, application-assigned participant identity (the diarization / addressing key). */
    Identity: string;
    /** The participant's display name (`name`), when set; falls back to {@link Identity}. */
    DisplayName: string;
    /** Whether this is the local participant (the human running this client). */
    IsLocal: boolean;
    /** The participant's room role, derived from metadata (the agent bot reports as `'agent'`). */
    Role: LiveKitParticipantRole;
    /** Whether the participant is currently speaking (LiveKit voice-activity detection). */
    IsSpeaking: boolean;
    /** Smoothed audio level in 0..1 for meters, sourced from LiveKit's per-participant audio level. */
    AudioLevel: number;
    /** Whether the participant currently has a published, unmuted microphone track. */
    HasAudio: boolean;
    /** Whether the participant currently has a published, unmuted camera track. */
    HasVideo: boolean;
    /** Whether the participant is currently sharing their screen. */
    IsScreenSharing: boolean;
    /** Connection quality bucket as LiveKit reports it. */
    ConnectionQuality: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
    /**
     * The underlying livekit-client participant, exposed ONLY so a UI layer can attach media tracks
     * (`view.Raw.getTrackPublication(...)?.track?.attach(el)`). Do not mutate it directly — drive the
     * room through {@link import('./livekit-room-controller').LiveKitRoomController} instead.
     */
    Raw: Participant;
}

/** A message received on the LiveKit data channel (the room-native "chat" / app payload). */
export interface LiveKitDataMessage {
    /** The decoded text payload (UTF-8). For binary payloads use {@link Bytes}. */
    Text: string;
    /** The raw bytes as received (for non-text payloads). */
    Bytes: Uint8Array;
    /** The optional topic the message was published under. */
    Topic?: string;
    /** The sender's participant identity, when the message came from a remote participant. */
    FromIdentity?: string;
    /** The sender's display name, when known. */
    FromDisplayName?: string;
    /** Epoch-ms receive timestamp. */
    ReceivedAt: number;
}

/** A normalized error surfaced by the room (connection failure, device error, publish failure). */
export interface LiveKitRoomError {
    /** A stable category for programmatic handling. */
    Kind: 'connect' | 'device' | 'publish' | 'data' | 'disconnect' | 'unknown';
    /** A human-readable message. */
    Message: string;
    /** The original error, when available. */
    Cause?: unknown;
}

/** The current local-media toggle state (what the human is publishing). */
export interface LiveKitLocalMediaState {
    /** Whether the local microphone is enabled (publishing audio). */
    MicrophoneEnabled: boolean;
    /** Whether the local camera is enabled (publishing video). */
    CameraEnabled: boolean;
    /** Whether the local participant is sharing their screen. */
    ScreenShareEnabled: boolean;
}

/** A media input/output device the user can pick (microphone, camera, speaker). */
export interface LiveKitDevice {
    /** The `deviceId` to pass to {@link import('./livekit-room-controller').LiveKitRoomController.SwitchDevice}. */
    DeviceId: string;
    /** The human-readable device label. */
    Label: string;
    /** The device kind. */
    Kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

/** Options for opening a room connection. */
export interface LiveKitRoomConnectOptions {
    /** Start with the microphone enabled (default: true). */
    EnableMicrophone?: boolean;
    /** Start with the camera enabled (default: false — voice-first). */
    EnableCamera?: boolean;
    /** The display name to publish as the local participant's `name`. */
    DisplayName?: string;
    /** Advanced livekit-client room options merged into the constructed `Room`. */
    RoomOptions?: RoomOptions;
}

/** A snapshot of the whole room state, emitted whenever anything material changes. */
export interface LiveKitRoomState {
    /** The connection lifecycle status. */
    Status: LiveKitConnectionStatus;
    /** The room name once connected. */
    RoomName?: string;
    /** The local participant's view, once connected. */
    Local?: LiveKitParticipantView;
    /** All remote participants. */
    Remote: LiveKitParticipantView[];
    /** Identities currently flagged as active speakers, most-recent first. */
    ActiveSpeakerIdentities: string[];
    /** The local-media toggle state. */
    LocalMedia: LiveKitLocalMediaState;
    /** The reason for disconnect, once disconnected. */
    DisconnectReason?: LiveKitDisconnectReason;
}

/** Maps a livekit-client `Track.Source` to a normalized {@link LiveKitTrackKind}. */
export type LiveKitTrackSourceMapper = (source: Track.Source) => LiveKitTrackKind;
