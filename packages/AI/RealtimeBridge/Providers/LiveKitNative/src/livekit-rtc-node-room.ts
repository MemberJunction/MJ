/**
 * @fileoverview The **real** native LiveKit room client — wraps `@livekit/rtc-node` (LiveKit's Node
 * WebRTC participant) behind the `NativeRoomModule` / `NativeRoomClient` contract that
 * `@memberjunction/ai-bridge-livekit`'s `LiveKitNativeMeetingSdk` expects. Pointing the bridge's
 * `LiveKitNativeSdkConfig.NativeModuleSpecifier` at this package makes the agent **talk and hear** in a
 * real LiveKit room:
 *
 * - **Voice out** — `publishAudio(pcm)` captures the agent's synthesized PCM onto a published audio track
 *   (a LiveKit `AudioSource` → `LocalAudioTrack`), so other participants hear the agent.
 * - **Hearing in** — each remote participant's subscribed audio track is read via an `AudioStream` and
 *   surfaced as a diarized `NativeRoomAudioFrame` (`{ data, participantIdentity, name }`). Screen-share audio (a shared
 *   tab's or screen's sound) is not the participant's speech: it is unsubscribed as it arrives and never reaches the model.
 *   Each stream is read through a reader the client keeps, and cancelled when its track is unsubscribed, its participant
 *   leaves, or the bot leaves the room; in rtc-node 0.13.29 none of these ends the stream by itself.
 * - **Seeing in** — when the client is created with video options (the agent watches the meeting), a
 *   {@link RoomVideoWatcher} reads the cameras and screens of people who let agents see them, as many at once as the
 *   model takes (one today), picked by a ranking: a shared screen first, else the active speaker's camera after a short
 *   hold, else the camera already in view. Frames are sampled to the session's rate and encoded as JPEG
 *   (`NativeRoomVideoFrame`): on the encode worker's own thread for clients the module factory builds
 *   ({@link VideoEncodeWorkerHost}), in-process otherwise. In EVERY meeting, video the bot does not read is unsubscribed
 *   as it arrives.
 * - **Roster / data** — participant connect/disconnect events + the reliable data channel ("chat").
 *
 * ## Sample rates (THE most common live-test failure — read this)
 * The realtime model emits/consumes PCM at a **specific** rate. `@livekit/rtc-node` resamples for us **iff
 * we tell it the right rate**: the outbound `AudioSource` is created at the model's OUTPUT rate, and each
 * inbound `AudioStream` is constructed with the model's INPUT rate so frames arrive already resampled.
 * Defaults are **24 kHz mono** (OpenAI-Realtime-compatible: xAI Grok Voice, etc.). **Gemini Live wants
 * 16 kHz inbound** — override via {@link CreateLiveKitRtcNodeModuleOptions}. A mismatch here is what
 * produces chipmunk / garbled audio in a live test, not a logic bug.
 *
 * ## Optionality + testability
 * `@livekit/rtc-node` is a **native addon** (`optionalDependency`); it is loaded **lazily** behind an
 * injectable {@link RtcNodeLoader}, so this package builds and unit-tests with **no addon and no network**
 * (tests inject a fake module). The structural {@link RtcNodeModule} surface below is the only thing this
 * file assumes about the SDK — none of its real types leak.
 *
 * Every spot that assumes a `@livekit/rtc-node` API shape carries a `// VERIFY against @livekit/rtc-node`
 * note; a live test against a real LiveKit server should confirm them.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 * @author MemberJunction.com
 */

import { LogError, LogStatus, LogStatusEx } from '@memberjunction/core';
import { performance } from 'node:perf_hooks';
import type {
    NativeAvatarMediaChunk,
    NativeAvatarStatus,
    NativeAvatarVideoSupport,
    NativeRoomModule,
    NativeRoomClient,
    NativeRoomClientOptions,
    NativeConnectArgs,
    NativeConnectResult,
    NativeRoomAudioFrame,
    NativeRoomParticipant,
    NativeRoomVideoFrame,
    NativeRoomVideoOptions,
    NativeRoomVideoSourceEnd,
} from '@memberjunction/ai-bridge-livekit';
import { AgentAvatarAudioOnlyAttributes } from '@memberjunction/ai';
import { AvatarPublisher, type AvatarPublisherOptions, type AvatarVoiceQueue } from './avatar-publisher';
import { RtcNodeAvatarOutlet } from './avatar-room-outlet';
import { FfmpegLocator, type FfmpegProbeResult } from './ffmpeg-locator';
import { LiveKitWorkerRoomClient } from './livekit-worker-room-client';
import type { IMediaWorker } from './media-worker-types';
import { DropVideoSubscription, RoomVideoWatcher, type RoomVideoWatcherTimer } from './room-video-watcher';
import type { IRoomVideoFrameEncoder } from './video-frame-encoder';
import { VideoEncodeWorkerHost } from './video-encode-worker-host';
import {
    GetModuleEventLoopMonitor,
    ReadEventLoop,
    type InboundFrameGapHistogram,
    type OutboundAudioTelemetry,
    type RoomAudioTelemetrySnapshot,
} from './room-telemetry';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal `@livekit/rtc-node` surface this wrapper depends on — declared locally
// so NONE of the SDK's types leak and the package compiles WITHOUT the addon installed.
// VERIFY against @livekit/rtc-node (https://github.com/livekit/node-sdks).
// ──────────────────────────────────────────────────────────────────────────────

/** Default outbound/inbound PCM rate (Hz) — OpenAI-Realtime-compatible models (xAI Grok Voice, etc.). */
export const DEFAULT_SAMPLE_RATE = 24000;
/** Default channel count for agent audio (mono). */
export const DEFAULT_CHANNELS = 1;

/** One PCM audio frame as `@livekit/rtc-node` represents it. VERIFY: `frame.data` is an `Int16Array`. */
export interface RtcAudioFrame {
    /** Interleaved 16-bit PCM samples. */
    data: Int16Array;
    /** Sample rate of this frame (Hz). */
    sampleRate: number;
    /** Channel count. */
    channels: number;
    /** Samples per channel in this frame. */
    samplesPerChannel: number;
}

/** A participant as `@livekit/rtc-node` reports it. VERIFY: `identity` / `name` / `attributes` / `trackPublications`. */
export interface RtcParticipant {
    /** The participant's stable application identity. */
    identity: string;
    /** The participant's display name. */
    name?: string;
    /**
     * The participant's attributes (where a person's `mj.agentCanSee` consent lives). VERIFY against @livekit/rtc-node:
     * `Participant.attributes`, updated BEFORE `ParticipantAttributesChanged` is emitted.
     */
    attributes?: Record<string, string>;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** The participant's publications keyed by track sid. VERIFY against @livekit/rtc-node: `Participant.trackPublications`. */
    trackPublications?: Map<string, RtcTrackPublication>;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
}

/** A subscribed media track. VERIFY: `kind` compared against `TrackKind.KIND_AUDIO` / `KIND_VIDEO`. */
export interface RtcTrack {
    /** The track kind (audio/video). */
    kind: number;
}

/**
 * A remote participant's published track, subscribed or not. VERIFY against @livekit/rtc-node: `RemoteTrackPublication`
 * (`sid`, `source`, `muted` getters; the SDK keeps one object per publication and passes it to every event).
 */
export interface RtcTrackPublication {
    /** The track sid. */
    readonly sid?: string;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** The track source (`TrackSource`: camera and screen share are video; microphone and screen-share audio are not). */
    readonly source?: number;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** Whether the publisher muted it. VERIFY: updated BEFORE `TrackMuted` / `TrackUnmuted` is emitted. */
    readonly muted?: boolean;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /**
     * Asks the server to send (or stop sending) this track to the bot; the SDK answers with `TrackSubscribed` /
     * `TrackUnsubscribed`. Remote publications only. VERIFY against @livekit/rtc-node: `RemoteTrackPublication.setSubscribed`.
     */
    setSubscribed?(subscribed: boolean): void;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
}

/**
 * One decoded video frame. VERIFY against @livekit/rtc-node: `VideoFrame` (I420 planes contiguous in `data`, strides equal
 * to the plane widths; `convert` is an FFI call that returns a new frame).
 */
export interface RtcVideoFrame {
    /** The pixel buffer. */
    data: Uint8Array;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** Width in pixels. */
    width: number;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** Height in pixels. */
    height: number;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** The buffer type (`VideoBufferType`). */
    type: number;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** Converts the frame to another buffer type. */
    convert(dstType: number): RtcVideoFrame;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
}

/** One frame a `VideoStream` yields. VERIFY against @livekit/rtc-node: `VideoFrameEvent { frame, timestampUs, rotation }`. */
export interface RtcVideoFrameEvent {
    /** The decoded frame. */
    frame: RtcVideoFrame;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** How far the frame must be turned clockwise to stand upright (`VideoRotation`). */
    rotation: number;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
}

/** What one `read()` of a video stream resolves to (the WHATWG `ReadableStreamReadResult`). */
export type RtcVideoReadResult =
    | { done: false; value: RtcVideoFrameEvent }  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
    | { done: true; value?: undefined };  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names

/**
 * The reader of a `VideoStream`. VERIFY against @livekit/rtc-node: `VideoStream` is a WHATWG `ReadableStream` that enqueues
 * every decoded frame with no backpressure, so the reader must keep draining; `cancel()` releases the native stream.
 */
export interface RtcVideoStreamReader {
    /** Resolves with the next frame, or `done` once the stream ended or was cancelled. */
    read(): Promise<RtcVideoReadResult>;  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
    /** Cancels the stream: a pending `read()` resolves `done`, and the native stream is released. */
    cancel(reason?: string): Promise<void>;  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
}

/** The decoded frames of one subscribed video track. VERIFY against @livekit/rtc-node: `new VideoStream(track)`. */
export interface RtcVideoStream {
    /** Locks the stream to a reader. */
    getReader(): RtcVideoStreamReader;  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
}

/** The audio source the bot publishes its voice through. VERIFY: `captureFrame(frame)` is async. */
export interface RtcAudioSource {
    /** Pushes one PCM frame onto the published track. */
    captureFrame(frame: RtcAudioFrame): Promise<void>;
    /** Drops all audio still queued in the source (used to flush on barge-in / interruption). */
    clearQueue(): void;
    /** Duration (in ms or s) of queued audio currently buffered in the source, if supported. */
    queuedDuration?: number | (() => number);
}

/** The bot's published local audio track. */
export interface RtcLocalAudioTrack {
    /** Marker — the concrete track object handed to `publishTrack`. */
    readonly __isLocalAudioTrack?: true;
}

/** What one `read()` of an audio stream resolves to (the WHATWG `ReadableStreamReadResult`). */
export type RtcAudioReadResult =
    | { done: false; value: RtcAudioFrame }  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
    | { done: true; value?: undefined };  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names

/**
 * The reader of an `AudioStream`. VERIFY against @livekit/rtc-node: `cancel()` runs the stream source's `cancel`, which
 * stops listening for the stream's frames and disposes its native handle (0.13.29's `AudioStreamSource.cancel`).
 */
export interface RtcAudioStreamReader {
    /** Resolves with the next frame, or `done` once the stream ended or was cancelled. */
    read(): Promise<RtcAudioReadResult>;  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
    /** Cancels the stream: a pending `read()` resolves `done`, queued frames are dropped, and the native stream is released. */
    cancel(reason?: string): Promise<void>;  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
}

/**
 * The PCM frames of one subscribed audio track. VERIFY against @livekit/rtc-node: `new AudioStream(track, sampleRate,
 * channels)` is a WHATWG `ReadableStream` (since 0.13.12) with no `close()`. Iterating it with `for await` locks it, and a
 * locked stream refuses `cancel()`, so the client reads it through a reader it keeps and stops it by cancelling that reader.
 * In 0.13.29 neither an unsubscribed track nor leaving the room ends the stream (0.13.32 ends it on unsubscribe).
 */
export interface RtcAudioStream {
    /** Locks the stream to a reader. */
    getReader(): RtcAudioStreamReader;  // case-violation-ok-legacy-back-compat: mirrors the WHATWG stream API's member names
}

/** The source the bot shows its avatar's frames through. VERIFY: `captureFrame(frame)` is synchronous. */
export interface RtcVideoSource {
    /** Shows one frame (timestamp 0: the native side stamps the capture time). */
    captureFrame(frame: RtcVideoFrame): void;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
}

/** The bot's published local video track (its avatar camera). */
export interface RtcLocalVideoTrack {
    /** Releases the track (and its source). VERIFY: `LocalVideoTrack.close(closeSource = true)`. */
    close?(closeSource?: boolean): Promise<void>;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
}

/** A track the bot published. VERIFY: `LocalTrackPublication.sid`. */
export interface RtcLocalTrackPublication {
    /** The track's sid, which unpublishing names. */
    readonly sid?: string;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
}

/** The bot's local participant — its publish surface. */
export interface RtcLocalParticipant {
    /** The bot's own identity. */
    identity: string;
    /** Publishes a track (the bot's voice, or its avatar camera). VERIFY: returns a publication / Promise. */
    publishTrack(track: RtcLocalAudioTrack | RtcLocalVideoTrack, options?: RtcTrackPublishOptions): Promise<RtcLocalTrackPublication>;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** Takes a published track down. VERIFY: `unpublishTrack(trackSid, stopOnUnpublish?)`. */
    unpublishTrack?(trackSid: string, stopOnUnpublish?: boolean): Promise<void>;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** Sets the bot's own attributes (its token must allow `canUpdateOwnMetadata`). VERIFY: `setAttributes(record)`. */
    setAttributes?(attributes: Record<string, string>): Promise<void>;  // case-violation-ok-legacy-back-compat: mirrors @livekit/rtc-node's own member name
    /** Publishes a reliable data message. VERIFY: `(payload: Uint8Array, options)`. */
    publishData(payload: Uint8Array, options?: unknownRecord): Promise<void>;
}

/** A loose record for SDK option bags we pass through but don't model field-by-field. */
type unknownRecord = Record<string, unknown>;

/** The LiveKit `Room` surface this wrapper drives. VERIFY against @livekit/rtc-node. */
export interface RtcRoom {
    /** The room name once connected. */
    name?: string;
    /** The bot's local participant. */
    localParticipant: RtcLocalParticipant;
    /** Remote participants keyed by identity (or an iterable of them). */
    remoteParticipants: Map<string, RtcParticipant> | RtcParticipant[];
    /** Connects to the room. VERIFY: `(url, token, options?)`. */
    connect(url: string, token: string, options?: unknownRecord): Promise<void>;
    /** Disconnects from the room. */
    disconnect(): Promise<void>;
    /** Subscribes to a room event. VERIFY: event names from `RoomEvent`. */
    on(event: string, listener: (...args: never[]) => void): void;
}

/** The subset of the `@livekit/rtc-node` module this wrapper constructs from. VERIFY ctor signatures. */
export interface RtcNodeModule {
    /** `new Room()`. */
    Room: new () => RtcRoom;
    /** `new AudioSource(sampleRate, channels)`. */
    AudioSource: new (sampleRate: number, channels: number) => RtcAudioSource;
    /** `new AudioFrame(data, sampleRate, channels, samplesPerChannel)`. */
    AudioFrame: new (data: Int16Array, sampleRate: number, channels: number, samplesPerChannel: number) => RtcAudioFrame;
    /** `new AudioStream(track, sampleRate, channels)` — resamples inbound to the requested rate. */
    AudioStream: new (track: RtcTrack, sampleRate?: number, channels?: number) => RtcAudioStream;
    /** `LocalAudioTrack.createAudioTrack(name, source)`. */
    LocalAudioTrack: { createAudioTrack(name: string, source: RtcAudioSource): RtcLocalAudioTrack };
    /**
     * `new VideoStream(track)` — the decoded frames of one subscribed video track. VERIFY against @livekit/rtc-node: takes
     * no options in 0.13.x, and copies every frame into JavaScript at the publisher's rate, so only tracks the bot reads
     * get one.
     */
    VideoStream: new (track: RtcTrack) => RtcVideoStream;
    /** Video buffer-type constants. VERIFY: `VideoBufferType.I420`. */
    VideoBufferType: { I420: number };
    /** `new VideoSource(width, height)`: where the bot's avatar frames go. Optional: without it the bot publishes no video. */
    VideoSource?: new (width: number, height: number) => RtcVideoSource;
    /** `new VideoFrame(data, width, height, type)`: one frame to capture. Optional, like {@link VideoSource}. */
    VideoFrame?: new (data: Uint8Array, width: number, height: number, type: number) => RtcVideoFrame;
    /** `LocalVideoTrack.createVideoTrack(name, source)`. Optional, like {@link VideoSource}. */
    LocalVideoTrack?: { createVideoTrack(name: string, source: RtcVideoSource): RtcLocalVideoTrack };
    /** Video rotation constants. VERIFY: `VideoRotation.VIDEO_ROTATION_*` (WebRTC's clockwise convention). */
    VideoRotation: { VIDEO_ROTATION_0: number; VIDEO_ROTATION_90: number; VIDEO_ROTATION_180: number; VIDEO_ROTATION_270: number };
    /** Event-name constants. VERIFY exact member names. */
    RoomEvent: {
        TrackSubscribed: string;
        TrackUnsubscribed: string;
        TrackSubscriptionFailed: string;
        TrackPublished: string;
        TrackUnpublished: string;
        TrackMuted: string;
        TrackUnmuted: string;
        ParticipantConnected: string;
        ParticipantDisconnected: string;
        ParticipantAttributesChanged: string;
        ActiveSpeakersChanged: string;
        Disconnected: string;
    };
    /** Track-kind constants. VERIFY: `KIND_AUDIO`, `KIND_VIDEO`. */
    TrackKind: { KIND_AUDIO: number; KIND_VIDEO: number };
    /**
     * `new TrackPublishOptions({ source })` — the publish-options protobuf message. REQUIRED by
     * `publishTrack`: passing a plain object leaves `source` unset and the track improperly bound, so the
     * native `AudioSource.captureFrame` rejects every frame with `InvalidState`. Construct the real proto.
     */
    TrackPublishOptions: new (data?: { source?: number; dtx?: boolean; red?: boolean; stream?: string; simulcast?: boolean }) => RtcTrackPublishOptions;
    /**
     * Track-source constants — `SOURCE_MICROPHONE` tags the bot's published voice track; `SOURCE_CAMERA` and
     * `SOURCE_SCREENSHARE` tell a participant's camera from a screen they share; `SOURCE_SCREENSHARE_AUDIO` marks the
     * sound of a shared tab or screen, which the bot does not hear. A track published without a source reports
     * `SOURCE_UNKNOWN` (0), which the bot hears.
     */
    TrackSource: { SOURCE_MICROPHONE: number; SOURCE_CAMERA: number; SOURCE_SCREENSHARE: number; SOURCE_SCREENSHARE_AUDIO: number };
}

/** Opaque marker for a constructed `TrackPublishOptions` proto handed to `publishTrack`. */
export interface RtcTrackPublishOptions {
    /** The track source (e.g. `SOURCE_MICROPHONE`). */
    readonly source?: number;
}

/** The injectable loader for `@livekit/rtc-node` (tests inject a fake; production lazy-imports the addon). */
export type RtcNodeLoader = () => Promise<RtcNodeModule>;

/** Settings of {@link LiveKitRtcNodeRoomClient} beyond its audio rates. */
export interface LiveKitRtcNodeRoomClientOptions {
    /**
     * What to read for the agent when it watches the meeting (from `NativeRoomClientOptions.Video`). Absent: the
     * client reads no video. Either way, video the bot does not read is unsubscribed.
     */
    Video?: NativeRoomVideoOptions;
    /**
     * Where participant video is encoded. Default: in-process, on the thread that hosts the room. The module factory
     * passes this thread's {@link VideoEncodeWorkerHost} unless the encode worker is turned off.
     */
    VideoEncoder?: IRoomVideoFrameEncoder;
    /**
     * Monotonic millisecond clock for video pacing, the speaker hold, the encode round trip and the in-process encoder's
     * timing (tests inject one). Default `performance.now()`.
     */
    Now?: () => number;
    /**
     * Schedules the ranking a delayed switch of video source needs, on the {@link Now} clock (tests inject one). Default:
     * an `unref`'d `setTimeout`.
     */
    Timer?: RoomVideoWatcherTimer;
    /**
     * Where the agent's avatar stands when the client joins: a media worker rejoining after the avatar was taken down
     * passes `audio-only`, so the bot re-applies its attribute and publishes no avatar. Absent: a fresh join.
     */
    AvatarStatus?: NativeAvatarStatus;
    /** How the avatar finds ffmpeg and creates its decoders (tests pass fakes). Default: the real ones. */
    Avatar?: Pick<AvatarPublisherOptions, 'Probe' | 'Decoders' | 'Now' | 'LeadMs'>;
}

/** Options for {@link CreateLiveKitRtcNodeModule}. */
export interface CreateLiveKitRtcNodeModuleOptions {
    /** Outbound PCM rate the agent's model EMITS (Hz). Default {@link DEFAULT_SAMPLE_RATE} (24 kHz). */
    OutboundSampleRate?: number;
    /** Inbound PCM rate the agent's model CONSUMES (Hz). Default {@link DEFAULT_SAMPLE_RATE}; Gemini Live = 16000. */
    InboundSampleRate?: number;
    /** Channel count (default {@link DEFAULT_CHANNELS} = mono). */
    Channels?: number;
    /** Loader override (tests inject a fake `@livekit/rtc-node`). */
    Loader?: RtcNodeLoader;
    /**
     * Whether to isolate media-plane processing in a dedicated worker thread (experimental). Default: OFF;
     * enabled by `process.env.MJ_LIVEKIT_WORKER_MEDIA` = `on` / `true` / `1`. A custom {@link Loader}
     * always implies in-process unless this is set explicitly (a loader function cannot cross the thread
     * boundary). An explicit value here overrides the env. If the worker cannot be spawned or dies before the room is
     * joined, the client falls back to the in-process room client.
     */
    UseWorker?: boolean;
    /** Outbound pre-buffer duration in milliseconds when worker mode is enabled (default: 150ms). */
    PreBufferMs?: number;
    /** Optional factory for custom IMediaWorker instances (useful for testing). */
    WorkerFactory?: () => IMediaWorker;
    /**
     * Whether participant video is encoded on its own worker thread ({@link VideoEncodeWorkerHost}, one per thread that
     * hosts rooms) rather than on the thread that hosts the room. Default: ON; `process.env.MJ_LIVEKIT_VIDEO_ENCODE_WORKER`
     * = `off` / `false` / `0` turns it off. An explicit value here overrides the env. Applies to every client this module
     * builds: the in-process client, the worker client's in-process fallback, and the media worker's client.
     */
    VideoEncodeWorker?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested directly)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw little-endian 16-bit PCM `ArrayBuffer` (what the bridge forwards from the realtime
 * model's output) into an `Int16Array` view suitable for a LiveKit `AudioFrame`. An odd byte length is
 * truncated to whole samples (a defensive guard — a half sample is never valid PCM16).
 */
export function PcmToInt16(pcm: ArrayBuffer): Int16Array {
    const wholeSamples = Math.floor(pcm.byteLength / 2);
    return new Int16Array(pcm, 0, wholeSamples);
}

/** @deprecated Use {@link PcmToInt16}. */
export function pcmToInt16(pcm: ArrayBuffer): Int16Array {
    return PcmToInt16(pcm);
}

/**
 * Copies an `Int16Array` (an inbound LiveKit frame's `data`) to a standalone little-endian PCM
 * `ArrayBuffer` for the bridge. Copied (not aliased) so a recycled SDK buffer can't mutate bytes the
 * model is still reading.
 */
export function Int16ToArrayBuffer(samples: Int16Array): ArrayBuffer {
    const copy = new Int16Array(samples.length);
    copy.set(samples);
    return copy.buffer;
}

/** @deprecated Use {@link Int16ToArrayBuffer}. */
export function int16ToArrayBuffer(samples: Int16Array): ArrayBuffer {
    return Int16ToArrayBuffer(samples);
}

/** Normalizes the SDK's `remoteParticipants` (Map or array) to an array. */
export function ParticipantsToArray(
    remote: Map<string, RtcParticipant> | RtcParticipant[],
): RtcParticipant[] {
    return Array.isArray(remote) ? remote : Array.from(remote.values());
}

/** @deprecated Use {@link ParticipantsToArray}. */
export function participantsToArray(
    remote: Map<string, RtcParticipant> | RtcParticipant[],
): RtcParticipant[] {
    return ParticipantsToArray(remote);
}

// ──────────────────────────────────────────────────────────────────────────────
// The real client
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The default lazy loader for `@livekit/rtc-node` (category: optional peer dependency — a native addon we
 * must not force on installs). Throws an actionable error when absent so a misconfigured deployment fails
 * loudly. VERIFY: the module's default/namespace interop shape.
 */
export const DefaultRtcNodeLoader: RtcNodeLoader = async (): Promise<RtcNodeModule> => {
    try {
        const mod = (await import(/* @vite-ignore */ '@livekit/rtc-node')) as unknownRecord;
        const resolved = (mod.default && typeof mod.default === 'object' ? mod.default : mod) as unknown as RtcNodeModule;
        if (typeof resolved.Room !== 'function') {
            throw new Error('resolved @livekit/rtc-node has no Room constructor');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "LiveKitRtcNodeRoomClient could not load '@livekit/rtc-node'. Install it (npm i @livekit/rtc-node — " +
                `a native addon) on the server that runs the agent bot. Underlying error: ${message}`,
        );
    }
};

/** @deprecated Use {@link DefaultRtcNodeLoader}. */
export const defaultRtcNodeLoader: RtcNodeLoader = DefaultRtcNodeLoader;

/** One subscribed audio track the client reads: the reader that stops it, and whose track it is. */
interface InboundAudioStream {
    /** The track's publication: `TrackUnsubscribed` names it again. */
    publication: RtcTrackPublication;
    participant: RtcParticipant;
    reader: RtcAudioStreamReader;
    /** Set once the client cancels the stream: a frame read before that but not yet handled is dropped, and the loop ends. */
    cancelled: boolean;
}

/**
 * A real {@link NativeRoomClient} over `@livekit/rtc-node`. One instance per room session. Constructed by
 * {@link CreateLiveKitRtcNodeModule}'s `createRoomClient`, driven by `LiveKitNativeMeetingSdk`.
 */
export class LiveKitRtcNodeRoomClient implements NativeRoomClient {
    private readonly loadRtc: RtcNodeLoader;
    private readonly outboundRate: number;
    private readonly inboundRate: number;
    private readonly channels: number;

    /** The loaded SDK module + live room, set on {@link connect}. */
    private rtc: RtcNodeModule | null = null;
    private room: RtcRoom | null = null;
    private audioSource: RtcAudioSource | null = null;
    /**
     * The published outbound track. MUST be retained for the session's lifetime: it owns the FFI handle
     * that binds the {@link audioSource} to the room. If only the source is kept and the track is left to
     * GC, its handle is finalized, the rust-side track drops, and every `captureFrame` then rejects with
     * `InvalidState` (the agent generates audio but is never heard).
     */
    private audioTrack: RtcLocalAudioTrack | null = null;
    /** The inbound audio streams being read. A stream leaves when it is cancelled or ends. */
    private readonly inboundStreams = new Set<InboundAudioStream>();
    /** Set when the bot leaves the room (`disconnect()`, or the room's `Disconnected`): no audio stream opens after that. */
    private leftRoom = false;

    /**
     * Outbound audio is fed through a SERIAL queue, not fired concurrently. The realtime model emits its
     * reply as a fast burst (seconds of audio in a fraction of a second), and `AudioSource.captureFrame`
     * is NOT concurrency-safe — it mutates shared playout-timing state (queue size, last-capture clock)
     * on every call. Firing the burst as overlapping `captureFrame` promises clobbers that accounting, so
     * frames play out of pace and overlap/chop. Draining one frame at a time (awaiting each) keeps the
     * timing correct and lets the source's own backpressure pace playout to real time.
     */
    private readonly outboundQueue: Int16Array[] = [];
    private draining = false;

    private readonly inboundGaps = new Map<string, InboundFrameGapHistogram>();
    /** Participants whose screen-share audio the bot has logged not hearing: one line per participant while in the room. */
    private readonly screenShareAudioLogged = new Set<string>();
    private readonly outboundTelemetry: OutboundAudioTelemetry = {
        captureCount: 0,
        underrunCount: 0,
    };
    private lastCaptureFinishMs?: number;

    private audioHandler?: (frame: NativeRoomAudioFrame) => void;
    private participantConnectedHandler?: (p: NativeRoomParticipant) => void;
    private participantDisconnectedHandler?: (identity: string) => void;
    private disconnectedHandler?: (reason?: string) => void;
    private videoFrameHandler?: (frame: NativeRoomVideoFrame) => void;
    private videoSourceEndedHandler?: (source: NativeRoomVideoSourceEnd) => void;

    /** What the agent may read; absent when it does not watch the meeting. */
    private readonly videoOptions?: NativeRoomVideoOptions;
    private readonly videoEncoder?: IRoomVideoFrameEncoder;
    private readonly now?: () => number;
    private readonly videoTimer?: RoomVideoWatcherTimer;
    /** Reads participant video while connected; null when the agent does not watch (or after disconnect). */
    private videoWatcher: RoomVideoWatcher | null = null;

    /** The agent's live avatar, created at its first piece; null when none came. */
    private avatarPublisher: AvatarPublisher | null = null;
    private avatarStatusHandler?: (status: NativeAvatarStatus) => void;
    /** Where the avatar stood when this client joined (a media worker rejoining after it was taken down). */
    private readonly initialAvatarStatus?: NativeAvatarStatus;
    /** Set when the client joined with its avatar already taken down: avatar pieces are dropped. */
    private avatarTakenDown = false;
    private readonly avatarOptions?: LiveKitRtcNodeRoomClientOptions['Avatar'];
    /** Audio (ms) the voice queue has taken in all, flushed audio excluded: positions on the avatar's clock. */
    private enqueuedMs = 0;
    /** Audio (ms) handed to the audio source in all. */
    private capturedMs = 0;

    /**
     * @param outboundRate Outbound PCM rate (Hz) — the AudioSource rate (model output rate).
     * @param inboundRate Inbound PCM rate (Hz) — each AudioStream's resample target (model input rate).
     * @param channels Channel count.
     * @param loadRtc The `@livekit/rtc-node` loader.
     * @param options Video settings (see {@link LiveKitRtcNodeRoomClientOptions}); omit for a voice-only bot.
     */
    constructor(outboundRate: number, inboundRate: number, channels: number, loadRtc: RtcNodeLoader, options: LiveKitRtcNodeRoomClientOptions = {}) {
        this.outboundRate = outboundRate;
        this.inboundRate = inboundRate;
        this.channels = channels;
        this.loadRtc = loadRtc;
        this.videoOptions = options.Video;
        this.videoEncoder = options.VideoEncoder;
        this.now = options.Now;
        this.videoTimer = options.Timer;
        this.initialAvatarStatus = options.AvatarStatus;
        this.avatarOptions = options.Avatar;
    }

    /** Connects to the room, publishes the bot's audio track, and wires inbound audio, video + roster events. */
    public async connect(args: NativeConnectArgs): Promise<NativeConnectResult> {
        // Ensure module-level event-loop monitor is initialized (best-effort)
        GetModuleEventLoopMonitor();

        const rtc = await this.loadRtc();
        const room = new rtc.Room();
        this.videoWatcher = this.createVideoWatcher(rtc, room);
        this.wireRoomEvents(rtc, room);

        // VERIFY against @livekit/rtc-node: connect(url, token, { autoSubscribe, dynacast }).
        await room.connect(args.url, args.token, { autoSubscribe: true, dynacast: true });

        // Publish the bot's outbound audio track (the agent's voice). The options MUST be a real
        // TrackPublishOptions proto with `source` set — a plain `{ name }` bag leaves the track unbound and
        // every captureFrame() then fails with `InvalidState` (the agent generates audio but is never heard).
        const source = new rtc.AudioSource(this.outboundRate, this.channels);
        const track = rtc.LocalAudioTrack.createAudioTrack('agent-voice', source);
        const publishOptions = new rtc.TrackPublishOptions({ source: rtc.TrackSource.SOURCE_MICROPHONE });
        await room.localParticipant.publishTrack(track, publishOptions);

        this.rtc = rtc;
        this.room = room;
        this.audioSource = source;
        this.audioTrack = track; // retain — see field doc: losing this to GC orphans the source (InvalidState)
        await this.applyInitialAvatarStatus(room);

        return { localIdentity: room.localParticipant.identity, roomName: room.name ?? '' };
    }

    /**
     * Disconnects: stops reading participant video and audio (every inbound audio stream is cancelled, and none opens
     * after this), then releases the room. Tolerant of teardown errors.
     */
    public async disconnect(): Promise<void> {
        const room = this.room;
        const monitor = GetModuleEventLoopMonitor();
        if (monitor) {
            try {
                const p99 = monitor.percentile(99) / 1e6;
                LogStatusEx({
                    message: `[LiveKitRtcNodeRoomClient][telemetry] event loop delay p99=${p99.toFixed(2)}ms (room ${room?.name ?? 'unknown'})`,
                    verboseOnly: true,
                });
            } catch {
                // Intentionally best-effort telemetry
            }
        }

        this.videoWatcher?.Stop(); // cancels every video reader; the bot leaving is not a source ending
        this.videoWatcher = null;
        this.avatarPublisher?.Dispose(); // ends the decoders; the room's teardown takes the camera track down
        this.avatarPublisher = null;
        this.stopHearing('the bot left the room');
        this.inboundGaps.clear();
        this.screenShareAudioLogged.clear();
        this.lastCaptureFinishMs = undefined;
        this.outboundQueue.length = 0; // stop the drain loop (it bails when audioSource is null)
        this.room = null;
        this.audioSource = null;
        this.audioTrack = null;
        this.rtc = null;
        if (room) {
            try {
                await room.disconnect();
            } catch (err) {
                LogError(`[LiveKitRtcNodeRoomClient] disconnect() failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Enqueues one PCM frame for the bot's audio track (the agent's voice). The sync seam contract is
     * preserved (never throws), but the frame is fed through {@link drainOutbound} so captures are
     * serialized — see {@link outboundQueue} for why concurrent captures corrupt playout pacing.
     */
    public publishAudio(pcm: ArrayBuffer): void {
        if (!this.rtc || !this.audioSource) {
            return; // not connected yet — drop (matches the seam's pre-connect no-op contract)
        }
        if (this.avatarPublisher?.IsAudioOnly) {
            // The audio-only session that replaced a failed avatar is speaking: the avatar's decoders are done.
            this.avatarPublisher.Retire();
        }
        this.enqueueOutbound(PcmToInt16(pcm));
    }

    /** Queues PCM for the voice track (the model's PCM, or the avatar's decoded voice) and keeps the drain running. */
    private enqueueOutbound(samples: Int16Array): void {
        this.outboundQueue.push(samples);
        this.enqueuedMs += (samples.length / (this.channels * this.outboundRate)) * 1000;
        void this.drainOutbound();
    }

    /**
     * Drains the {@link outboundQueue} one frame at a time, awaiting each `captureFrame` so exactly one
     * capture is ever in flight. Re-entrancy-guarded by {@link draining}; frames enqueued during a drain
     * are picked up by the loop (or a tail re-trigger). Bails immediately if the session disconnects.
     */
    private async drainOutbound(): Promise<void> {
        if (this.draining) {
            return; // a drain is already running — it will consume what we just enqueued
        }
        this.draining = true;
        try {
            while (this.outboundQueue.length > 0) {
                const rtc = this.rtc;
                const source = this.audioSource;
                if (!rtc || !source) {
                    this.outboundQueue.length = 0; // disconnected mid-drain — drop the rest
                    break;
                }
                const samples = this.outboundQueue.shift()!;
                const frame = new rtc.AudioFrame(samples, this.outboundRate, this.channels, samples.length / this.channels);

                // Track underrun: if last capture finished more than 2 frame durations ago while actively speaking
                const frameDurationMs = (samples.length / (this.channels * this.outboundRate)) * 1000;
                const now = performance.now();
                if (this.lastCaptureFinishMs !== undefined && (now - this.lastCaptureFinishMs) > (frameDurationMs * 2)) {
                    this.outboundTelemetry.underrunCount++;
                }

                this.capturedMs += frameDurationMs; // before the capture, as the source counts its queue
                await source.captureFrame(frame);
                this.lastCaptureFinishMs = performance.now();
                this.outboundTelemetry.captureCount++;

                let qd: number | undefined;
                if (typeof source.queuedDuration === 'function') {
                    qd = source.queuedDuration();
                } else if (typeof source.queuedDuration === 'number') {
                    qd = source.queuedDuration;
                }
                if (qd !== undefined) {
                    this.outboundTelemetry.lastQueuedDuration = qd;
                }

                if (this.outboundTelemetry.captureCount % 200 === 0) {
                    LogStatusEx({
                        message: `[LiveKitRtcNodeRoomClient][telemetry] outbound stats: captures=${this.outboundTelemetry.captureCount} underruns=${this.outboundTelemetry.underrunCount} queuedDuration=${qd ?? 'n/a'}`,
                        verboseOnly: true,
                    });
                }
            }
        } catch (err: unknown) {
            LogError(`[LiveKitRtcNodeRoomClient] captureFrame failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.draining = false;
            // A frame may have arrived after the loop's last length check — pick it up.
            if (this.outboundQueue.length > 0 && this.rtc && this.audioSource) {
                void this.drainOutbound();
            } else {
                // Outbound queue fully drained: reset lastCaptureFinishMs so the silence gap between turns
                // is not counted as an audio buffer underrun when the next turn begins.
                this.lastCaptureFinishMs = undefined;
            }
        }
    }

    /**
     * Flushes all pending outbound audio — both our pre-capture {@link outboundQueue} and the audio
     * already buffered inside the LiveKit `AudioSource`. Called on barge-in (the user interrupts the
     * agent): without it, the agent keeps talking from buffered audio after the model has stopped
     * generating, so interruption appears not to work. Never throws.
     */
    public flushOutbound(): void {
        this.outboundQueue.length = 0;
        this.enqueuedMs = this.capturedMs; // the dropped audio never plays
        this.lastCaptureFinishMs = undefined;
        try {
            this.audioSource?.clearQueue();
        } catch (err: unknown) {
            LogError(`[LiveKitRtcNodeRoomClient] flushOutbound clearQueue failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        // The avatar's queued frames and in-flight decodes go too; its last frame stays on screen.
        this.avatarPublisher?.Flush();
    }

    /**
     * Decodes and publishes one piece of the agent's live avatar ({@link AvatarPublisher}, created at the first piece):
     * the face on a camera track published at its first frame, the voice through this client's voice queue, paced by
     * the voice. It is the bot's only video out (through {@link RtcNodeAvatarOutlet}); the client publishes no raw camera
     * frames and no screen share. Dropped before connect, and after the avatar was taken down before this client joined.
     */
    public publishAvatarMedia(chunk: NativeAvatarMediaChunk): void {
        const rtc = this.rtc;
        const room = this.room;
        if (!rtc || !room || this.avatarTakenDown) {
            return;
        }
        if (!this.avatarPublisher) {
            this.avatarPublisher = this.createAvatarPublisher(rtc, room);
        }
        this.avatarPublisher.Accept(chunk);
    }

    /** Registers the handler for a change in what the room is shown of the avatar. "Latest handler wins." */
    public onAvatarStatus(cb: (status: NativeAvatarStatus) => void): void {
        this.avatarStatusHandler = cb;
    }

    /** Registers the inbound per-participant audio handler. "Latest handler wins." */
    public onAudioFrame(cb: (frame: NativeRoomAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    /** Registers the participant-connected handler. */
    public onParticipantConnected(cb: (participant: NativeRoomParticipant) => void): void {
        this.participantConnectedHandler = cb;
    }

    /** Registers the participant-disconnected handler. */
    public onParticipantDisconnected(cb: (participantIdentity: string) => void): void {
        this.participantDisconnectedHandler = cb;
    }

    /** Returns the current roster (remote participants — the bot excludes itself from addressing). */
    public async getParticipants(): Promise<NativeRoomParticipant[]> {
        const room = this.room;
        if (!room) {
            return [];
        }
        return ParticipantsToArray(room.remoteParticipants).map((p) => ({ identity: p.identity, name: p.name }));
    }

    /** Publishes a reliable text message on the room data channel (the room-native "chat"). */
    public async publishData(text: string): Promise<void> {
        const room = this.room;
        if (!room) {
            return;
        }
        // VERIFY against @livekit/rtc-node: publishData(payload: Uint8Array, { reliable: true }).
        await room.localParticipant.publishData(new TextEncoder().encode(text), { reliable: true });
    }

    /** Registers the room-disconnected handler. */
    public onDisconnected(cb: (reason?: string) => void): void {
        this.disconnectedHandler = cb;
    }

    /**
     * Registers the inbound video handler: sampled JPEG frames from people who let agents see them. Fires only when
     * the client was created with video options. "Latest handler wins."
     */
    public onVideoFrame(cb: (frame: NativeRoomVideoFrame) => void): void {
        this.videoFrameHandler = cb;
    }

    /** Registers the handler for a camera or screen that stopped being read after sending frames. "Latest handler wins." */
    public onVideoSourceEnded(cb: (source: NativeRoomVideoSourceEnd) => void): void {
        this.videoSourceEndedHandler = cb;
    }

    // ── internals ──────────────────────────────────────────────────────────────

    /** The avatar's publisher over this room: its camera track, this client's voice queue, the voice track's rate. */
    private createAvatarPublisher(rtc: RtcNodeModule, room: RtcRoom): AvatarPublisher {
        const voice: AvatarVoiceQueue = {
            EnqueuedMs: () => this.enqueuedMs,
            PlayedMs: () => this.capturedMs - this.sourceQueuedMs(),
            Enqueue: (samples) => this.enqueueOutbound(samples),
        };
        return new AvatarPublisher({
            ...this.avatarOptions,
            Voice: voice,
            Video: new RtcNodeAvatarOutlet(rtc, room.localParticipant),
            SampleRate: this.outboundRate,
            OnStatus: (status) => this.avatarStatusHandler?.(status),
        });
    }

    /**
     * A client joining with its avatar already taken down (a media worker rejoining with the original token, whose
     * attribute still says `on`) re-applies the audio-only attribute and publishes no avatar.
     */
    private async applyInitialAvatarStatus(room: RtcRoom): Promise<void> {
        const status = this.initialAvatarStatus;
        if (status?.state !== 'audio-only' || !status.reason) {
            return;
        }
        this.avatarTakenDown = true;
        try {
            await room.localParticipant.setAttributes?.(AgentAvatarAudioOnlyAttributes(status.reason));
        } catch (err) {
            LogError(`[LiveKitRtcNodeRoomClient] re-applying the avatar attribute after a rejoin failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** What the audio source still holds (ms), by its own estimate. */
    private sourceQueuedMs(): number {
        const source = this.audioSource;
        const queued = typeof source?.queuedDuration === 'function' ? source.queuedDuration() : source?.queuedDuration;
        return typeof queued === 'number' && queued > 0 ? queued : 0;
    }

    /** The video watcher for this session, or null when the agent does not watch the meeting. */
    private createVideoWatcher(rtc: RtcNodeModule, room: RtcRoom): RoomVideoWatcher | null {
        if (!this.videoOptions) {
            return null;
        }
        return new RoomVideoWatcher({
            Video: this.videoOptions,
            Rtc: rtc,
            ListParticipants: () => ParticipantsToArray(room.remoteParticipants),
            OnFrame: (frame) => this.videoFrameHandler?.(frame),
            OnSourceEnded: (source) => this.videoSourceEndedHandler?.(source),
            Encoder: this.videoEncoder,
            Now: this.now,
            Timer: this.videoTimer,
        });
    }

    /**
     * Wires room-level events: a subscribed track goes to inbound audio or video, and an unsubscribed one ends what read
     * it; participant and disconnect events. VERIFY against @livekit/rtc-node: `(track, publication, participant)` for
     * TrackSubscribed and TrackUnsubscribed; and, as LiveKit's Rust SDK reads, a participant who leaves has each subscribed
     * track unsubscribed before `ParticipantDisconnected`, while the bot leaving the room unsubscribes nothing.
     */
    private wireRoomEvents(rtc: RtcNodeModule, room: RtcRoom): void {
        room.on(rtc.RoomEvent.TrackSubscribed, ((track: RtcTrack, publication: RtcTrackPublication, participant: RtcParticipant) => {
            if (track.kind === rtc.TrackKind.KIND_AUDIO) {
                this.routeInboundAudio(rtc, track, publication, participant);
            } else if (track.kind === rtc.TrackKind.KIND_VIDEO) {
                this.routeInboundVideo(track, publication, participant);
            }
        }) as (...args: never[]) => void);

        room.on(rtc.RoomEvent.TrackUnsubscribed, ((_track: RtcTrack, publication: RtcTrackPublication, participant: RtcParticipant) => {
            this.cancelInboundAudioOf(publication, participant, 'track unsubscribed');
            this.videoWatcher?.HandleTrackUnsubscribed(publication, participant);
        }) as (...args: never[]) => void);

        room.on(rtc.RoomEvent.ParticipantConnected, ((participant: RtcParticipant) => {
            this.participantConnectedHandler?.({ identity: participant.identity, name: participant.name });
        }) as (...args: never[]) => void);

        room.on(rtc.RoomEvent.ParticipantDisconnected, ((participant: RtcParticipant) => {
            this.cancelInboundAudioFrom(participant, 'participant left'); // any track not unsubscribed first
            this.inboundGaps.delete(participant.identity);
            this.screenShareAudioLogged.delete(participant.identity);
            this.videoWatcher?.HandleParticipantDisconnected(participant);
            this.participantDisconnectedHandler?.(participant.identity);
        }) as (...args: never[]) => void);

        room.on(rtc.RoomEvent.Disconnected, ((reason?: unknown) => {
            this.stopHearing('the room disconnected');
            this.videoWatcher?.Stop();
            this.disconnectedHandler?.(reason === undefined ? undefined : String(reason));
        }) as (...args: never[]) => void);

        if (this.videoWatcher) {
            this.wireVideoEvents(rtc, room, this.videoWatcher);
        }
    }

    /**
     * Hears a subscribed audio track as its participant's speech, unless it is screen-share audio
     * (`SOURCE_SCREENSHARE_AUDIO`, the sound of a shared tab or screen): that is not the person speaking, and tab or system
     * audio is not model input. It is unsubscribed, as video the bot does not read is. Every other source is heard,
     * `SOURCE_UNKNOWN` and a missing source included: clients built on LiveKit's Rust SDK (rtc-node, the Python SDK)
     * publish audio as `SOURCE_UNKNOWN` unless they name a source, so hearing only microphones would silence them. Once the
     * bot has left the room, nothing is heard.
     */
    private routeInboundAudio(rtc: RtcNodeModule, track: RtcTrack, publication: RtcTrackPublication, participant: RtcParticipant): void {
        if (this.leftRoom) {
            return;
        }
        if (publication.source === rtc.TrackSource.SOURCE_SCREENSHARE_AUDIO) {
            this.dropScreenShareAudio(publication, participant);
            return;
        }
        this.consumeInboundAudio(rtc, track, publication, participant);
    }

    /**
     * Stops the server sending a participant's screen-share audio to the bot (best-effort, like
     * {@link DropVideoSubscription}). The first such track per participant is logged, so an operator can tell why the agent
     * did not react to a shared video's sound.
     */
    private dropScreenShareAudio(publication: RtcTrackPublication, participant: RtcParticipant): void {
        if (!this.screenShareAudioLogged.has(participant.identity)) {
            this.screenShareAudioLogged.add(participant.identity);
            LogStatus(`[LiveKitRtcNodeRoomClient] not hearing screen-share audio from '${participant.identity}': a shared tab's or screen's sound is not their speech`);
        }
        try {
            publication.setSubscribed?.(false);
        } catch (err) {
            LogError(`[LiveKitRtcNodeRoomClient] unsubscribing the screen-share audio of '${participant.identity}' failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * A subscribed video track goes to the watcher when the agent watches; otherwise it is unsubscribed at once (the
     * bot joins with `autoSubscribe` for its hearing, and must not keep receiving video it never reads).
     */
    private routeInboundVideo(track: RtcTrack, publication: RtcTrackPublication, participant: RtcParticipant): void {
        if (this.videoWatcher) {
            this.videoWatcher.HandleTrackSubscribed(track, publication, participant);
        } else {
            DropVideoSubscription(publication);
        }
    }

    /**
     * Wires the events that end, open or rank a video source; TrackUnsubscribed reaches the watcher through
     * {@link wireRoomEvents}. VERIFY against @livekit/rtc-node: listener arities — `(trackSid, participant, error)` for
     * TrackSubscriptionFailed (as rtc-node 0.13.29's room.ts emits it), `(publication, participant)` for TrackPublished /
     * TrackUnpublished / TrackMuted / TrackUnmuted (TrackPublished's participant may be undefined when the SDK can't find
     * it), `(changedAttributes, participant)` for ParticipantAttributesChanged, and `(speakers)` for ActiveSpeakersChanged
     * (the bot itself included when the agent speaks; the watcher drops it).
     */
    private wireVideoEvents(rtc: RtcNodeModule, room: RtcRoom, watcher: RoomVideoWatcher): void {
        room.on(rtc.RoomEvent.TrackSubscriptionFailed, ((trackSid: string, participant: RtcParticipant, error?: string) =>
            watcher.HandleTrackSubscriptionFailed(trackSid, participant, error)) as (...args: never[]) => void);
        room.on(rtc.RoomEvent.TrackPublished, ((publication: RtcTrackPublication, participant: RtcParticipant | undefined) =>
            watcher.HandleTrackPublished(publication, participant)) as (...args: never[]) => void);
        room.on(rtc.RoomEvent.TrackUnpublished, ((publication: RtcTrackPublication, participant: RtcParticipant) =>
            watcher.HandleTrackUnpublished(publication, participant)) as (...args: never[]) => void);
        room.on(rtc.RoomEvent.TrackMuted, ((publication: RtcTrackPublication, participant: RtcParticipant) =>
            watcher.HandleTrackMuted(publication, participant)) as (...args: never[]) => void);
        room.on(rtc.RoomEvent.TrackUnmuted, ((publication: RtcTrackPublication, participant: RtcParticipant) =>
            watcher.HandleTrackUnmuted(publication, participant)) as (...args: never[]) => void);
        room.on(rtc.RoomEvent.ParticipantAttributesChanged, ((_changed: Record<string, string>, participant: RtcParticipant) =>
            watcher.HandleAttributesChanged(participant)) as (...args: never[]) => void);
        room.on(rtc.RoomEvent.ActiveSpeakersChanged, ((speakers: RtcParticipant[]) =>
            watcher.HandleActiveSpeakersChanged(speakers ?? [])) as (...args: never[]) => void);
    }

    /**
     * Reads one subscribed audio track via an `AudioStream` (constructed at the model's INPUT rate so frames
     * arrive resampled) and forwards each frame as a diarized {@link NativeRoomAudioFrame}. The stream is read through a
     * reader the client keeps, which is how it is stopped ({@link cancelInboundStream}).
     */
    private consumeInboundAudio(rtc: RtcNodeModule, track: RtcTrack, publication: RtcTrackPublication, participant: RtcParticipant): void {
        let reader: RtcAudioStreamReader;
        try {
            reader = new rtc.AudioStream(track, this.inboundRate, this.channels).getReader();
        } catch (err) {
            LogError(`[LiveKitRtcNodeRoomClient] could not open the audio stream of '${participant.identity}': ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        const stream: InboundAudioStream = { publication, participant, reader, cancelled: false };
        this.inboundStreams.add(stream);
        void this.pumpAudioStream(stream);
    }

    /**
     * Reads an inbound stream until it ends or the client cancels it, mapping each frame to the diarized seam frame. A
     * frame whose read finished just before a cancel is dropped, not handled after it. However the loop ends, the stream is
     * cancelled and leaves the list, so a loop that an error stopped releases its native stream too (on a stream that
     * ended, the cancel does nothing).
     */
    private async pumpAudioStream(stream: InboundAudioStream): Promise<void> {
        const participant = stream.participant;
        const hist = this.inboundGapHistogram(participant.identity);
        try {
            for (;;) {
                const result = await stream.reader.read();
                if (result.done || stream.cancelled) {
                    break;
                }
                this.recordInboundGap(participant.identity, hist);
                this.audioHandler?.({
                    data: Int16ToArrayBuffer(result.value.data),
                    participantIdentity: participant.identity,
                    name: participant.name,
                });
            }
        } catch (err) {
            if (!stream.cancelled) {
                LogError(`[LiveKitRtcNodeRoomClient] inbound audio stream for '${participant.identity}' ended with error: ${err instanceof Error ? err.message : String(err)}`);
            }
        } finally {
            this.cancelInboundStream(stream, 'reading stopped');
        }
    }

    /** The participant's inbound frame-gap histogram, created when their first stream opens. */
    private inboundGapHistogram(identity: string): InboundFrameGapHistogram {
        let hist = this.inboundGaps.get(identity);
        if (!hist) {
            hist = { lt10ms: 0, b10_20ms: 0, b20_30ms: 0, b30_50ms: 0, b50_100ms: 0, gte100ms: 0, totalFrames: 0 };
            this.inboundGaps.set(identity, hist);
        }
        return hist;
    }

    /** Counts the gap since the previous inbound frame, and logs the histogram every 500 frames (verbose only). */
    private recordInboundGap(identity: string, hist: InboundFrameGapHistogram): void {
        const now = performance.now();
        if (hist.lastFrameMs !== undefined) {
            const gap = now - hist.lastFrameMs;
            hist.totalFrames++;
            if (gap < 10) hist.lt10ms++;
            else if (gap < 20) hist.b10_20ms++;
            else if (gap < 30) hist.b20_30ms++;
            else if (gap < 50) hist.b30_50ms++;
            else if (gap < 100) hist.b50_100ms++;
            else hist.gte100ms++;
        }
        hist.lastFrameMs = now;

        if (hist.totalFrames > 0 && hist.totalFrames % 500 === 0) {
            LogStatusEx({
                message: `[LiveKitRtcNodeRoomClient][telemetry] inbound frame gap histogram for '${identity}': ` +
                    `total=${hist.totalFrames} <10ms=${hist.lt10ms} 10-20ms=${hist.b10_20ms} 20-30ms=${hist.b20_30ms} ` +
                    `30-50ms=${hist.b30_50ms} 50-100ms=${hist.b50_100ms} >=100ms=${hist.gte100ms}`,
                verboseOnly: true,
            });
        }
    }

    /**
     * Cancels one inbound stream, once, and drops it from the list: a pending `read()` resolves `done`, queued frames are
     * dropped, and the SDK releases the native stream. Best-effort: a failure is logged.
     */
    private cancelInboundStream(stream: InboundAudioStream, reason: string): void {
        this.inboundStreams.delete(stream);
        if (stream.cancelled) {
            return;
        }
        stream.cancelled = true;
        const logFailure = (err: unknown): void =>
            LogError(`[LiveKitRtcNodeRoomClient] cancelling the audio stream of '${stream.participant.identity}' failed: ${err instanceof Error ? err.message : String(err)}`);
        try {
            stream.reader.cancel(reason).catch(logFailure);
        } catch (err) {
            logFailure(err);
        }
    }

    /** Cancels the inbound streams that match. */
    private cancelInboundStreams(reason: string, matches: (stream: InboundAudioStream) => boolean): void {
        for (const stream of Array.from(this.inboundStreams)) {
            if (matches(stream)) {
                this.cancelInboundStream(stream, reason);
            }
        }
    }

    /** A track was unsubscribed: cancels the streams of its publication (the same object, or the same participant and track sid). */
    private cancelInboundAudioOf(publication: RtcTrackPublication, participant: RtcParticipant, reason: string): void {
        this.cancelInboundStreams(reason, (stream) =>
            stream.publication === publication ||
            (publication.sid !== undefined && stream.publication.sid === publication.sid && stream.participant.identity === participant.identity));
    }

    /** A participant left: cancels every stream of theirs. */
    private cancelInboundAudioFrom(participant: RtcParticipant, reason: string): void {
        this.cancelInboundStreams(reason, (stream) => stream.participant.identity === participant.identity);
    }

    /** The bot is leaving the room: cancels every inbound stream, and none opens after this. Idempotent. */
    private stopHearing(reason: string): void {
        this.leftRoom = true;
        this.cancelInboundStreams(reason, () => true);
    }

    /**
     * Returns a snapshot of room telemetry (inbound gaps, outbound underruns/captures, event-loop p99, and the
     * participant-video counters while the agent watches the meeting).
     */
    public GetTelemetry(): RoomAudioTelemetrySnapshot {
        const inboundGaps: Record<string, InboundFrameGapHistogram> = {};
        for (const [k, v] of this.inboundGaps.entries()) {
            inboundGaps[k] = { ...v };
        }
        const loop = ReadEventLoop();
        const snapshot: RoomAudioTelemetrySnapshot = {
            inboundGaps,
            outbound: { ...this.outboundTelemetry },
            eventLoopDelayP99Ms: loop?.P99Ms,
            eventLoopWindowMs: loop?.WindowMs,
        };
        if (this.videoWatcher) {
            snapshot.video = this.videoWatcher.GetTelemetry();
        }
        return snapshot;
    }
}

/**
 * Resolves the `MJ_LIVEKIT_WORKER_MEDIA` switch. The worker media plane is experimental and OFF by
 * default: only an explicit `on` / `true` / `1` (case-insensitive) enables it; anything else, including
 * unset, means in-process.
 */
export function IsWorkerMediaEnabled(envValue: string | undefined): boolean {
    const v = (envValue ?? '').trim().toLowerCase();
    return v === 'on' || v === 'true' || v === '1';
}

/**
 * Resolves the `MJ_LIVEKIT_VIDEO_ENCODE_WORKER` switch. Participant video is encoded on its own worker thread by
 * default: only an explicit `off` / `false` / `0` (case-insensitive) turns that off; anything else, including unset,
 * means on.
 */
export function IsVideoEncodeWorkerEnabled(envValue: string | undefined): boolean {
    const v = (envValue ?? '').trim().toLowerCase();
    return !(v === 'off' || v === 'false' || v === '0');
}

/**
 * Whether this host's room clients can publish an agent's avatar: `@livekit/rtc-node` loads with its video classes, and
 * ffmpeg is usable ({@link FfmpegLocator}). The room coordinator asks before it opens a meeting session.
 *
 * @param loader Loads `@livekit/rtc-node`.
 * @param probe Finds ffmpeg. Default: this thread's {@link FfmpegLocator}.
 */
export async function DescribeAvatarVideo(loader: RtcNodeLoader, probe: () => Promise<FfmpegProbeResult> = () => FfmpegLocator.Instance.Probe()): Promise<NativeAvatarVideoSupport> {
    let rtc: RtcNodeModule;
    try {
        rtc = await loader();
    } catch (err) {
        return { Supported: false, Reason: 'bridged', Detail: `@livekit/rtc-node could not be loaded: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!RtcNodeAvatarOutlet.CanPublishVideo(rtc)) {
        return { Supported: false, Reason: 'bridged', Detail: '@livekit/rtc-node has no video publishing (VideoSource, VideoFrame, LocalVideoTrack)' };
    }
    const ffmpeg = await probe();
    return ffmpeg.Available === true ? { Supported: true } : { Supported: false, Reason: 'decoder-missing', Detail: ffmpeg.Reason };
}

/**
 * Builds a {@link NativeRoomModule} backed by `@livekit/rtc-node`. The bridge's
 * `LiveKitNativeMeetingSdk` calls `createRoomClient(options)` and then `client.connect(...)`.
 *
 * @param opts Sample-rate / channel / loader overrides (see {@link CreateLiveKitRtcNodeModuleOptions}).
 * @returns The native room module.
 */
export function CreateLiveKitRtcNodeModule(opts: CreateLiveKitRtcNodeModuleOptions = {}): NativeRoomModule {
    const outbound = opts.OutboundSampleRate ?? DEFAULT_SAMPLE_RATE;
    const inbound = opts.InboundSampleRate ?? DEFAULT_SAMPLE_RATE;
    const channels = opts.Channels ?? DEFAULT_CHANNELS;
    const loader = opts.Loader ?? DefaultRtcNodeLoader;
    const useWorker = opts.UseWorker ?? (opts.Loader === undefined && IsWorkerMediaEnabled(process.env.MJ_LIVEKIT_WORKER_MEDIA));
    const preBufferMs = opts.PreBufferMs ?? 150;
    const workerFactory = opts.WorkerFactory;
    const useEncodeWorker = opts.VideoEncodeWorker ?? IsVideoEncodeWorkerEnabled(process.env.MJ_LIVEKIT_VIDEO_ENCODE_WORKER);

    return {
        describeAvatarVideo: () => DescribeAvatarVideo(loader),
        createRoomClient(options: NativeRoomClientOptions): NativeRoomClient {
            // Credentials (Url/ApiKey/ApiSecret) are not needed here — the bridge hands a pre-signed access
            // token to client.connect(args). The PER-SESSION sample rates ARE used: the agent's realtime
            // model dictates them (OpenAI 24 kHz; Gemini Live 16 kHz IN), threaded down from the engine, so
            // inbound room audio is resampled to what THIS model consumes. Fall back to the module defaults.
            // `Video` is present only when the agent watches the meeting; it reaches whichever client hosts the room,
            // and so does the encode-worker switch (the host is per thread; getting it starts nothing).
            const outRate = options.OutboundSampleRate ?? outbound;
            const inRate = options.InboundSampleRate ?? inbound;
            const video = options.Video;
            const inProcessClient = (): LiveKitRtcNodeRoomClient =>
                new LiveKitRtcNodeRoomClient(outRate, inRate, channels, loader, {
                    Video: video,
                    VideoEncoder: video && useEncodeWorker ? VideoEncodeWorkerHost.Instance : undefined,
                });
            if (useWorker) {
                return new LiveKitWorkerRoomClient({
                    sampleRate: outRate,
                    inboundSampleRate: inRate,
                    channels,
                    preBufferMs,
                    video,
                    videoEncodeWorker: useEncodeWorker,
                    workerFactory,
                    fallbackFactory: inProcessClient,
                });
            }
            return inProcessClient();
        },
    };
}
