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
import type { RealtimeAvatarUnavailableReason } from '@memberjunction/ai';
import type { CapturedDisplaySurface, MediaDeviceKind, MediaParticipant } from '@memberjunction/ai-realtime-client/media';

/**
 * The connection lifecycle of a LiveKit room as the core normalizes it. Maps the livekit-client
 * `ConnectionState` plus the pre-connect / post-disconnect edges into one stable union.
 */
export type LiveKitConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

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

/** A camera background effect (requires `@livekit/track-processors`). */
export type LiveKitBackgroundEffect = { Kind: 'none' } | { Kind: 'blur'; Radius?: number } | { Kind: 'image'; ImageUrl: string };

/** End-to-end-encryption options. The host supplies the worker (bundler-specific) + a shared passphrase. */
export interface LiveKitE2EEOptions {
  /** The shared passphrase all participants derive the room key from. */
  Passphrase: string;
  /** The E2EE web worker (e.g. `new Worker(new URL('livekit-client/e2ee-worker', import.meta.url))`). */
  Worker: Worker;
}

/**
 * A participant's media from outside LiveKit, in the `/media` vocabulary: videos by kind, and a level reader. The
 * preview room's camera, screen share and levels come this way, since nothing there passes through LiveKit.
 */
export type LiveKitParticipantMedia = Partial<Pick<MediaParticipant, 'Video' | 'GetAudioLevel'>>;

/**
 * An agent whose voice reaches the meeting without its avatar: its bot's `mj.agentAvatar` attribute
 * (`REALTIME_AGENT_AVATAR_ATTRIBUTE` in `@memberjunction/ai`) says audio only.
 */
export interface LiveKitAvatarAudioOnly {
  /** Why, when the bot gave a reason this room knows; absent for one it doesn't (a newer bot's). */
  Reason?: RealtimeAvatarUnavailableReason;
}

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
   * Whether an agent can see this participant's camera and shared screen: they allowed it (`AllowsAgentVision` in
   * `@memberjunction/ai`) and an agent in the room watches ({@link LiveKitRoomState.AgentWatching}). Absent means no.
   */
  AgentCanSee?: boolean;
  /**
   * Set on an agent whose avatar the meeting can't show, from its bot's attribute. Absent while the avatar shows, when
   * the agent asked for none, and on anyone who is not an agent. The avatar itself is the bot's camera track named
   * `REALTIME_AGENT_AVATAR_TRACK_NAME` (`@memberjunction/ai`), which `ToMediaParticipant` shows as the avatar.
   */
  AvatarAudioOnly?: LiveKitAvatarAudioOnly;
  /**
   * The underlying livekit-client participant, exposed ONLY so a UI layer can attach media tracks
   * (`view.Raw.getTrackPublication(...)?.track?.attach(el)`). Do not mutate it directly — drive the
   * room through its controller ({@link import('./livekit-room-controller').ILiveKitRoomController}) instead.
   */
  Raw: Participant;
  /**
   * Media from outside LiveKit, which `ToMediaParticipant` shows in place of {@link Raw}'s tracks and level: a
   * video of a kind here replaces that kind's track, and a level reader replaces `Raw.audioLevel`. Absent for a
   * participant whose media comes through LiveKit.
   */
  Media?: LiveKitParticipantMedia;
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
  /**
   * A stable category for programmatic handling. `'agent-vision'`: the server could not record whether the user lets
   * agents see their camera and shared screen.
   */
  Kind: 'connect' | 'device' | 'publish' | 'data' | 'disconnect' | 'agent-vision' | 'unknown';
  /** A human-readable message. */
  Message: string;
  /** The original error, when available. */
  Cause?: unknown;
  /**
   * For a `device` error about one device: which, and what the user asked of it. Absent on other errors, and on a
   * device error about no one device (listing the devices).
   */
  Device?: LiveKitErrorDevice;
}

/**
 * The device a `device` error is about, and what the user asked of it, so a UI can say so in its own words (the
 * meeting room's notice does).
 */
export interface LiveKitErrorDevice {
  /** The microphone, the camera, the screen share, or the speaker (where the room's sound plays). */
  Media: MediaDeviceKind | 'screen';
  /**
   * What the user asked: to turn it on or off, or to switch to another device of its kind. Absent when the room can't
   * tell, as for a failure LiveKit reports on its own (its `MediaDevicesError`).
   */
  Change?: 'on' | 'off' | 'switch';
}

/** The current local-media toggle state (what the human is publishing). */
export interface LiveKitLocalMediaState {
  /** Whether the local microphone is enabled (publishing audio). */
  MicrophoneEnabled: boolean;
  /** Whether the local camera is enabled (publishing video). */
  CameraEnabled: boolean;
  /** Whether the local participant is sharing their screen. */
  ScreenShareEnabled: boolean;
  /** What the local participant is sharing (an entire screen, a window or a tab), while they share. */
  ScreenShareSurface?: CapturedDisplaySurface;
  /**
   * The shared panel's name, while the local participant shares one panel of the page that was given a name
   * (`DisplayCaptureOptions.PanelLabel`). The share preview names it.
   */
  ScreenSharePanelLabel?: string;
  /**
   * Whether the local participant lets agents see their camera and shared screen: their own choice, whether or not an
   * agent watches now. Absent means no.
   */
  AgentVisionOn?: boolean;
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
  /** Start with the Krisp noise filter enabled (LiveKit Cloud; requires `@livekit/krisp-noise-filter`). */
  NoiseFilterEnabled?: boolean;
  /** Start with a camera background effect (requires `@livekit/track-processors`). */
  BackgroundEffect?: LiveKitBackgroundEffect;
  /** Enable end-to-end encryption for this connection. */
  E2EE?: LiveKitE2EEOptions;
  /** Preferred microphone device id. */
  MicrophoneDeviceId?: string;
  /** Preferred camera device id. */
  CameraDeviceId?: string;
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
  /** Whether browser autoplay policy is blocking remote audio (the UI should prompt to enable sound). */
  AudioPlaybackBlocked: boolean;
  /** Whether the Krisp noise filter is currently applied to the local microphone. */
  NoiseFilterEnabled: boolean;
  /** The active camera background effect. */
  BackgroundEffect: LiveKitBackgroundEffect;
  /** Whether end-to-end encryption is enabled for this connection. */
  E2EEEnabled: boolean;
  /** The reason for disconnect, once disconnected. */
  DisconnectReason?: LiveKitDisconnectReason;
  /**
   * Whether an agent in the room watches the cameras and screens people let it see (`IsAgentWatching` in
   * `@memberjunction/ai`, on its bot's attributes). The room offers the choice only then. Absent means no.
   */
  AgentWatching?: boolean;
}

/** Maps a livekit-client `Track.Source` to a normalized {@link LiveKitTrackKind}. */
export type LiveKitTrackSourceMapper = (source: Track.Source) => LiveKitTrackKind;
