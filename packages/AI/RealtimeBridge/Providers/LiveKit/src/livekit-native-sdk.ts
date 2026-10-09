/**
 * @fileoverview `LiveKitNativeMeetingSdk` — a **real, two-way** {@link ILiveKitRoomSdk} binding over the
 * **native LiveKit server/agents SDK** (the Node room-participant build: `livekit-server-sdk` for token
 * minting + admin, plus a room client such as `@livekit/rtc-node` that publishes/subscribes media). It
 * gives the agent both **hearing** (each remote participant's subscribed audio track → a diarized
 * {@link LiveKitAudioFrame}) and a **voice** ({@link publishAudioFrame} forwards the agent's synthesized
 * PCM onto the bot's published audio track), plus full video/screen publish and the data-channel "chat".
 *
 * ## Why a native binding
 * Publishing audio *into* a LiveKit room requires a real WebRTC participant — there is no receive-only
 * shortcut as there is for some 3rd-party platforms. The native LiveKit room client exposes a
 * publish-track **send** path alongside per-participant subscribed-track **receive** callbacks, so a
 * single binding carries **bidirectional** media. This is the binding a two-way "agent talks in the
 * room" deployment uses.
 *
 * ## The native module seam (no SDK types leak)
 * The real LiveKit Node SDK is loaded **lazily** behind an injectable {@link NativeModuleLoader}, so this
 * package builds and unit-tests with **no SDK installed and no network**. The adapter depends ONLY on the
 * small structural {@link NativeRoomModule} / {@link NativeRoomClient} surface declared below — none of
 * LiveKit's real types leak into the package. Tests inject a fake module; production points
 * {@link LiveKitNativeSdkConfig.NativeModuleSpecifier} at the real room-client wrapper.
 *
 * ## Auth (deployment responsibility)
 * The bot joins with a signed LiveKit **access token** (room name + grants) minted upstream by MJ's
 * token/credential layer from the API **key/secret**. The ws URL + key/secret resolve **upstream** (MJ
 * credential system / provider `Configuration`) and are **never inlined** at a call site. When a
 * pre-signed token is supplied via {@link LiveKitConnectArgs.AccessToken} the adapter forwards it; when a
 * deployment lets the native module mint the token, the resolved key/secret + ws URL are handed to
 * {@link NativeRoomModule.createRoomClient}.
 *
 * Every spot where the native module's exact surface is assumed carries a `// VERIFY against the native
 * LiveKit Node SDK wrapper` note so a live test can confirm it.
 *
 * @module @memberjunction/ai-bridge-livekit
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
    ILiveKitRoomSdk,
    LiveKitAudioFrame,
    LiveKitAvatarMediaChunk,
    LiveKitAvatarStatus,
    LiveKitConnectArgs,
    LiveKitConnectResult,
    LiveKitParticipant,
    LiveKitParticipantRole,
    LiveKitVideoFrame,
    LiveKitVideoSourceEnd,
} from './livekit-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// The minimal native-LiveKit-SDK surface this adapter depends on (a local
// structural type so NONE of the SDK's types leak and the package compiles WITHOUT
// the SDK installed). VERIFY against the native LiveKit Node SDK wrapper you ship.
// ──────────────────────────────────────────────────────────────────────────────

/** One subscribed per-participant audio frame the native room client surfaces (inbound hearing + diarization). */
export interface NativeRoomAudioFrame {
    /** Raw PCM bytes for this frame (`Uint8Array` view or standalone `ArrayBuffer`). */
    data: Uint8Array | ArrayBuffer;
    /** The LiveKit participant identity that produced the audio (the diarization speaker label). */
    participantIdentity: string;
    /** The participant's display name at capture time, when the client provides it. */
    name?: string;
    /** Optional epoch-ms capture timestamp. */
    timestampMs?: number;
}

/** Which of a participant's video sources the native client read: their camera or a screen they share. */
export type NativeRoomVideoSourceKind = 'camera' | 'screen';

/**
 * One sampled camera or screen frame the native room client surfaces, from a person who lets agents see them. Encoded
 * (JPEG) and paced to the session's rate by the client. Mapped onto {@link LiveKitVideoFrame}.
 */
export interface NativeRoomVideoFrame {
    /** The encoded image. */
    data: ArrayBuffer;  // case-violation-ok-legacy-back-compat: the native frame types use the native SDK's lower-case vocabulary, like NativeRoomAudioFrame
    /** The image format. */
    mimeType: 'image/jpeg';  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** The participant whose camera or screen this is. */
    participantIdentity: string;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** Their display name, when the client has it. */
    name?: string;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** Which of their sources this is. */
    source: NativeRoomVideoSourceKind;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** The encoded image's width in pixels. */
    width: number;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** The encoded image's height in pixels. */
    height: number;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** Epoch-ms capture timestamp. */
    timestampMs: number;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
}

/** A camera or screen the native room client stopped reading. Mapped onto {@link LiveKitVideoSourceEnd}. */
export interface NativeRoomVideoSourceEnd {
    /** The participant whose source it was. */
    participantIdentity: string;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** Their display name, when the client has it. */
    name?: string;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** Which of their sources ended. */
    source: NativeRoomVideoSourceKind;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
}

/** One piece of the agent's live avatar (fragmented MP4) for the native room client to decode and publish. */
export interface NativeAvatarMediaChunk {
    /** The piece's bytes. The client may transfer the buffer to another thread. */
    data: ArrayBuffer;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** Its MIME type, for example `'video/mp4'`. */
    mimeType: string;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
}

/** Why the native room client can no longer show the agent's avatar. */
export type NativeAvatarFailure = 'decoder-failed' | 'publish-failed';

/** A change in what the native room client shows of the avatar. Mapped onto {@link LiveKitAvatarStatus}. */
export interface NativeAvatarStatus {
    /** `'on'`: the avatar's camera track is published. `'audio-only'`: it was taken down; the voice goes on. */
    state: 'on' | 'audio-only';  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
    /** Why, when {@link state} is `'audio-only'`. */
    reason?: NativeAvatarFailure;  // case-violation-ok-legacy-back-compat: native lower-case vocabulary, like NativeRoomAudioFrame
}

/**
 * Whether a native module's room clients can publish an agent's avatar on this host: they can publish video (the room
 * SDK loads with its video classes) and a decoder is there (ffmpeg with H.264 and AAC decoders). When not, the reason a
 * meeting session asks for audio instead.
 */
export type NativeAvatarVideoSupport =
    | { Supported: true }
    | {
          Supported: false;
          /** `'decoder-missing'`: no usable decoder. `'bridged'`: the room client cannot publish video at all. */
          Reason: 'decoder-missing' | 'bridged';
          /** What the probe found, for the log. */
          Detail?: string;
      };

/**
 * What the native room client may read for the agent: present in {@link NativeRoomClientOptions.Video} only when the
 * agent watches the meeting. The client reads only people whose `mj.agentCanSee` attribute is `'true'`.
 */
export interface NativeRoomVideoOptions {
    /** How many sources the client reads at once: the session's inbound video stream count (1 today). */
    Streams: number;
    /** Frames per second each source is sampled to: the session's inbound video rate. Absent: the default, 1 fps. */
    Rate?: number;
    /** Whether cameras may be read (the provider's `VideoIn`). */
    Cameras: boolean;
    /** Whether shared screens may be read (the provider's `ScreenIn`). */
    Screens: boolean;
    /** Cap on a camera frame's longer side, in pixels. Default 640. */
    CameraMaxDimension?: number;
    /** Cap on a screen frame's longer side, in pixels. Default 1280, so text stays legible. */
    ScreenMaxDimension?: number;
    /** JPEG quality from 1 to 100. Default 80, the browser sampler's 0.8. */
    JpegQuality?: number;
    /**
     * How long (ms) a person must lead the room's active-speaker list before the agent's view moves to their camera, so a
     * short interjection doesn't move it. Default 1500.
     */
    SpeakerOnsetMs?: number;
    /**
     * How long (ms) a camera stays in view, counted from its first frame, before another camera may replace it. A shared
     * screen, a withdrawn consent or an ended source never waits. Default 4000.
     */
    SpeakerHoldMs?: number;
}

/** One participant as the native room client reports it. Mapped onto {@link LiveKitParticipant}. */
export interface NativeRoomParticipant {
    /** The native participant identity (stable, application-assigned). */
    identity: string;
    /** The participant's display name (LiveKit's `name` attribute). */
    name?: string;
    /** The participant's role as the client/metadata reports it (`host` / `cohost` / `participant`). */
    role?: string;
    /** Whether this participant is the bot itself (LiveKit's local participant). */
    isLocal?: boolean;
}

/** The arguments the native room client's `connect()` accepts. Mirrors {@link LiveKitConnectArgs}. */
export interface NativeConnectArgs {
    /** The LiveKit room server ws URL (e.g. `wss://livekit.myorg.com`). Resolved upstream. */
    url: string;
    /** The signed LiveKit access token authorizing the bot to join (resolved upstream; never inline). */
    token: string;
    /** The bot's display name in the participant list. */
    name: string;
}

/** What the native room client's `connect()` resolves to. */
export interface NativeConnectResult {
    /** The bot's own participant identity in the joined room. */
    localIdentity: string;
    /** The LiveKit room name the bot joined. */
    roomName: string;
}

/**
 * The live native room client the module hands back. The surface mirrors {@link ILiveKitRoomSdk} but in
 * the native SDK's own (lower-cased) vocabulary; this adapter maps between the two. VERIFY against the
 * native LiveKit Node SDK wrapper.
 */
export interface NativeRoomClient {
    /** Connects to the room (async — the native connect handshake is network-bound). */
    connect(args: NativeConnectArgs): Promise<NativeConnectResult>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Disconnects from the room and releases native resources. */
    disconnect(): Promise<void>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Publishes one raw PCM frame on the bot's audio track (the agent's voice). */
    publishAudio(pcm: ArrayBuffer): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Drops all pending/queued outbound audio — flushes the agent's voice on barge-in. */
    flushOutbound(): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Publishes one raw frame on the bot's camera/video track. */
    publishVideo(frame: ArrayBuffer): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Publishes one raw frame on the bot's screen-share track. */
    publishScreen(frame: ArrayBuffer): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Registers the inbound per-participant subscribed-audio callback. "Latest handler wins." */
    onAudioFrame(cb: (frame: NativeRoomAudioFrame) => void): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Registers the participant-connected callback. */
    onParticipantConnected(cb: (participant: NativeRoomParticipant) => void): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Registers the participant-disconnected callback (identity of the participant that left). */
    onParticipantDisconnected(cb: (participantIdentity: string) => void): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Returns the current participant roster (including the bot). */
    getParticipants(): Promise<NativeRoomParticipant[]>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Publishes a reliable message on the room data channel (the room-native "chat"). */
    publishData(text: string): Promise<void>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Registers the room-disconnected callback (SFU closed / the bot was removed); `reason` is the disconnect reason when known. */
    onDisconnected(cb: (reason?: string) => void): void;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /**
     * Registers the inbound video callback: sampled frames from people who let agents see them. Fires only when the
     * client was created with {@link NativeRoomClientOptions.Video}. Optional: a wrapper without video omits it.
     * "Latest handler wins."
     */
    onVideoFrame?(cb: (frame: NativeRoomVideoFrame) => void): void;  // case-violation-ok-legacy-back-compat: a new member of this lower-case seam; the seam's other members are lower-case, and an interface has no runtime carrier for a stub
    /** Registers the callback for a camera or screen the client stopped reading. Optional. "Latest handler wins." */
    onVideoSourceEnded?(cb: (source: NativeRoomVideoSourceEnd) => void): void;  // case-violation-ok-legacy-back-compat: a new member of this lower-case seam; the seam's other members are lower-case, and an interface has no runtime carrier for a stub
    /**
     * Decodes and publishes one piece of the agent's live avatar: the face on a camera track published at its first
     * frame, the voice on the bot's audio track, paced together. Optional: a wrapper without avatars omits it.
     */
    publishAvatarMedia?(chunk: NativeAvatarMediaChunk): void;  // case-violation-ok-legacy-back-compat: a new member of this lower-case seam; the seam's other members are lower-case, and an interface has no runtime carrier for a stub
    /** Registers the callback for a change in what the client shows of the avatar. Optional. "Latest handler wins." */
    onAvatarStatus?(cb: (status: NativeAvatarStatus) => void): void;  // case-violation-ok-legacy-back-compat: a new member of this lower-case seam; the seam's other members are lower-case, and an interface has no runtime carrier for a stub
}

/** The native room module surface — a factory that constructs a {@link NativeRoomClient}. */
export interface NativeRoomModule {
    /**
     * Constructs a native room client from resolved options (credentials already resolved upstream).
     * VERIFY against the native LiveKit Node SDK wrapper (`createRoomClient` vs a `Room` constructor).
     */
    createRoomClient(options: NativeRoomClientOptions): NativeRoomClient;
    /**
     * Says whether this module's room clients can publish an agent's avatar on this host. The room coordinator asks
     * before it opens a meeting session, so a host that cannot show the avatar never asks the model for it. Optional: a
     * module without it publishes no avatars.
     */
    describeAvatarVideo?(): Promise<NativeAvatarVideoSupport>;  // case-violation-ok-legacy-back-compat: a new member of this lower-case seam; the seam's other members are lower-case, and an interface has no runtime carrier for a stub
}

/** Options passed to {@link NativeRoomModule.createRoomClient}. Credentials are resolved upstream. */
export interface NativeRoomClientOptions {
    /** The LiveKit room server ws URL (resolved upstream). */
    Url?: string;
    /** The LiveKit API key (resolved upstream; used to mint the join token when not pre-signed). */
    ApiKey?: string;
    /** The LiveKit API secret (resolved upstream). Used only to sign the join token. */
    ApiSecret?: string;
    /**
     * PCM rate (Hz) the agent's model CONSUMES — the rate inbound room audio is resampled to. Default 24000
     * (OpenAI); Gemini Live = 16000. A wrapper that ignores this stays on its constructed default.
     */
    InboundSampleRate?: number;
    /** PCM rate (Hz) the agent's model EMITS — the bot's published voice-track rate. Default 24000. */
    OutboundSampleRate?: number;
    /** What to read for the agent, when it watches the meeting. Absent: the client reads no video. */
    Video?: NativeRoomVideoOptions;
}

/**
 * Resolved configuration for {@link LiveKitNativeMeetingSdk}. Credentials resolve **upstream** (MJ
 * credential system / provider `Configuration`) — this object carries already-resolved values; **never
 * inline secrets** at a call site.
 */
export interface LiveKitNativeSdkConfig {
    /** The LiveKit room server ws URL (resolved upstream). */
    Url?: string;
    /** The LiveKit API key (resolved upstream). Used to mint the join token when not pre-signed. */
    ApiKey?: string;
    /** The LiveKit API secret (resolved upstream). Used only to sign the join token. */
    ApiSecret?: string;
    /** A pre-signed LiveKit access token, when the deployment mints it out-of-band instead of via key/secret. */
    AccessToken?: string;
    /** The bot's display name (defaults applied by the bridge when absent). */
    BotDisplayName?: string;
    /**
     * The module specifier of the native LiveKit room-client wrapper to load (e.g. an internal wrapper
     * package name or an absolute path to a sidecar entry). Required in production; tests inject a loader.
     */
    NativeModuleSpecifier?: string;
    /**
     * PCM rate (Hz) the agent's realtime model **consumes** — the rate inbound room audio is resampled to
     * before reaching the model. Threaded from the model via the engine (`IRealtimeSession.InputSampleRate`).
     * Default 24000 (OpenAI); Gemini Live = 16000. Mismatch = the agent never hears the user on the bridge.
     */
    InboundSampleRate?: number;
    /** PCM rate (Hz) the agent's model **emits** — the bot's published voice track rate. Default 24000. */
    OutboundSampleRate?: number;
    /**
     * Whether the agent watches the meeting: set by the room coordinator when the agent's setting is on and its session
     * takes video. Only then does the room client read anyone's camera or screen (and only people who allow it).
     */
    AgentVision?: boolean;
    /** How many inbound video streams the session takes, threaded from the model by the engine. `0` or absent: none. */
    InboundVideoStreams?: number;
    /** The session's inbound video rate (frames per second), threaded from the model by the engine. */
    InboundVideoRate?: number;
    /** Whether the provider allows camera video in (its `VideoIn` flag), passed down by the bridge. */
    VideoIn?: boolean;
    /** Whether the provider allows shared screens in (its `ScreenIn` flag), passed down by the bridge. */
    ScreenIn?: boolean;
    /** Override of the camera frame size cap (longer side, px). */
    VideoCameraMaxDimension?: number;
    /** Override of the screen frame size cap (longer side, px). */
    VideoScreenMaxDimension?: number;
    /** Override of the JPEG quality (1-100). */
    VideoJpegQuality?: number;
    /** Override of how long (ms) a person must lead the active-speaker list before the view moves to their camera. */
    VideoSpeakerOnsetMs?: number;
    /** Override of how long (ms) a camera stays in view, from its first frame, before another camera may replace it. */
    VideoSpeakerHoldMs?: number;
}

/**
 * The video options for the native room client, or `undefined` when the agent does not watch: the coordinator did not
 * turn agent vision on, the session takes no video, or the provider allows neither cameras nor screens. Pure, so it is
 * tested directly.
 */
export function NativeVideoOptionsFor(config: LiveKitNativeSdkConfig): NativeRoomVideoOptions | undefined {
    const streams = config.InboundVideoStreams ?? 0;
    const cameras = config.VideoIn === true;
    const screens = config.ScreenIn === true;
    if (config.AgentVision !== true || streams <= 0 || (!cameras && !screens)) {
        return undefined;
    }
    return {
        Streams: streams,
        Rate: config.InboundVideoRate,
        Cameras: cameras,
        Screens: screens,
        CameraMaxDimension: config.VideoCameraMaxDimension,
        ScreenMaxDimension: config.VideoScreenMaxDimension,
        JpegQuality: config.VideoJpegQuality,
        SpeakerOnsetMs: config.VideoSpeakerOnsetMs,
        SpeakerHoldMs: config.VideoSpeakerHoldMs,
    };
}

/** Normalizes the native client's free-form role string onto the seam's {@link LiveKitParticipantRole}. */
export function MapNativeRole(role?: string): LiveKitParticipantRole {
    switch ((role ?? '').trim().toLowerCase()) {
        case 'host':
            return 'Host';
        case 'cohost':
        case 'co-host':
            return 'CoHost';
        default:
            return 'Participant';
    }
}

/** @deprecated Use {@link MapNativeRole}. */
export function mapNativeRole(role?: string): LiveKitParticipantRole {
    return MapNativeRole(role);
}

/**
 * **Pure mapping** of one native participant onto the seam's {@link LiveKitParticipant}. Isolated from the
 * native client and from I/O so it is unit-tested directly.
 */
export function MapNativeParticipant(p: NativeRoomParticipant): LiveKitParticipant {
    return {
        Identity: String(p.identity),
        DisplayName: p.name,
        Role: MapNativeRole(p.role),
        IsLocal: p.isLocal,
    };
}

/** @deprecated Use {@link MapNativeParticipant}. */
export function mapNativeParticipant(p: NativeRoomParticipant): LiveKitParticipant {
    return MapNativeParticipant(p);
}

/**
 * Coerces a `Uint8Array` view or `ArrayBuffer` into a standalone `ArrayBuffer`, **copying** the exact
 * window of a view (so the result never aliases a larger backing buffer). The LiveKit package has no
 * pre-existing PCM-coercion helper to reuse, so this is defined here; it is the single such export.
 */
export function ToArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
}

/** @deprecated Use {@link ToArrayBuffer}. */
export function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    return ToArrayBuffer(data);
}

/**
 * **Pure mapping** of one native inbound audio frame onto the seam's diarized {@link LiveKitAudioFrame}.
 * Copies the PCM (see {@link toArrayBuffer}) and resolves the speaker label. Isolated for direct testing.
 */
export function MapNativeAudioFrame(frame: NativeRoomAudioFrame): LiveKitAudioFrame {
    return {
        Pcm: ToArrayBuffer(frame.data),
        ParticipantIdentity: String(frame.participantIdentity),
        DisplayName: frame.name,
        TimestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : Date.now(),
    };
}

/** @deprecated Use {@link MapNativeAudioFrame}. */
export function mapNativeAudioFrame(frame: NativeRoomAudioFrame): LiveKitAudioFrame {
    return MapNativeAudioFrame(frame);
}

/** **Pure mapping** of one native sampled video frame onto the seam's {@link LiveKitVideoFrame}. */
export function MapNativeVideoFrame(frame: NativeRoomVideoFrame): LiveKitVideoFrame {
    return {
        Bytes: frame.data,
        MimeType: frame.mimeType,
        ParticipantIdentity: String(frame.participantIdentity),
        DisplayName: frame.name,
        Source: frame.source,
        Width: frame.width,
        Height: frame.height,
        TimestampMs: frame.timestampMs,
    };
}

/** **Pure mapping** of a native avatar status change onto the seam's {@link LiveKitAvatarStatus}. */
export function MapNativeAvatarStatus(status: NativeAvatarStatus): LiveKitAvatarStatus {
    return status.reason ? { State: status.state, Reason: status.reason } : { State: status.state };
}

/** **Pure mapping** of a native ended video source onto the seam's {@link LiveKitVideoSourceEnd}. */
export function MapNativeVideoSourceEnd(source: NativeRoomVideoSourceEnd): LiveKitVideoSourceEnd {
    return {
        ParticipantIdentity: String(source.participantIdentity),
        DisplayName: source.name,
        Source: source.source,
    };
}

/**
 * The injectable loader for the native LiveKit room module — overridable so unit tests supply a fake
 * module with no SDK and no network. Production leaves it as {@link defaultNativeLoader}, which lazily
 * imports the configured {@link LiveKitNativeSdkConfig.NativeModuleSpecifier}.
 */
export type NativeModuleLoader = (specifier: string) => Promise<NativeRoomModule>;

/** Structural guard: a value is a {@link NativeRoomModule} when it exposes a `createRoomClient` function. */
function isNativeModule(value: unknown): value is NativeRoomModule {
    return (
        value != null &&
        typeof value === 'object' &&
        typeof (value as { createRoomClient?: unknown }).createRoomClient === 'function'
    );
}

/** Unwraps a `{ default }` interop wrapper (CJS-with-default), returning the inner value or the input. */
function unwrapDefault(mod: unknown): unknown {
    if (mod && typeof mod === 'object' && 'default' in mod) {
        const inner = (mod as { default: unknown }).default;
        if (isNativeModule(inner)) {
            return inner;
        }
    }
    return mod;
}

/** Global-object-store key for the process-wide native room module registry. */
const NATIVE_MODULE_REGISTRY_KEY = '__MJ_LIVEKIT_NATIVE_ROOM_MODULES__';

/**
 * Returns the process-wide registry (specifier to module). Held in the global object store so duplicate copies
 * of this package in one process (common in monorepos) still share one registry.
 */
function nativeModuleRegistry(): Map<string, NativeRoomModule> {
    const store = GetGlobalObjectStore();
    if (!store) {
        return fallbackRegistry;
    }
    const existing: unknown = store[NATIVE_MODULE_REGISTRY_KEY];
    if (existing instanceof Map) {
        return existing as Map<string, NativeRoomModule>;
    }
    const registry = new Map<string, NativeRoomModule>();
    store[NATIVE_MODULE_REGISTRY_KEY] = registry;
    return registry;
}

const fallbackRegistry = new Map<string, NativeRoomModule>();

/**
 * Registers an already-imported native room module under `specifier`, so {@link DefaultNativeLoader} returns it
 * without a dynamic `import()`. A package that declares the native wrapper as a dependency (e.g.
 * `@memberjunction/livekit-room-server`) imports it statically and registers it here; this package cannot import
 * the wrapper itself (that would be a dependency cycle) and a bare specifier does not resolve from here under
 * pnpm's strict layout.
 */
export function RegisterNativeRoomModule(specifier: string, mod: NativeRoomModule): void {
    nativeModuleRegistry().set(specifier, unwrapDefaultModule(mod));
}

/** Returns the module registered under `specifier`, if any. */
export function GetRegisteredNativeRoomModule(specifier: string): NativeRoomModule | undefined {
    return nativeModuleRegistry().get(specifier);
}

/** Resolves a namespace-import or `{ default }` wrapper to the object that has `createRoomClient`. */
function unwrapDefaultModule(mod: NativeRoomModule): NativeRoomModule {
    const resolved = unwrapDefault(mod);
    return isNativeModule(resolved) ? resolved : mod;
}

/**
 * Lazily loads the native LiveKit room module at the given specifier (category: runtime plugin discovery
 * from config — the wrapper path is deployment-supplied and not known at build time, hence the
 * `@vite-ignore` on the dynamic import). Throws a precise, actionable error when it can't be loaded so a
 * misconfigured deployment fails loudly, not silently.
 *
 * VERIFY against the native LiveKit Node SDK wrapper: the module's default/namespace interop + that it
 * exposes `createRoomClient`.
 */
export const DefaultNativeLoader: NativeModuleLoader = async (specifier: string): Promise<NativeRoomModule> => {
    const registered = GetRegisteredNativeRoomModule(specifier);
    if (registered) {
        return registered;
    }
    try {
        const mod: unknown = await import(/* @vite-ignore */ specifier);
        const resolved = unwrapDefault(mod);
        if (!isNativeModule(resolved)) {
            throw new Error('resolved module has no createRoomClient() factory');
        }
        return resolved;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `LiveKitNativeMeetingSdk could not load the native LiveKit room module at '${specifier}'. Build/install ` +
                'the native LiveKit Node room-client wrapper (livekit-server-sdk + a room client like @livekit/rtc-node) ' +
                `and set LiveKitNativeSdkConfig.NativeModuleSpecifier to it. Underlying error: ${message}`,
        );
    }
};

/** @deprecated Use {@link DefaultNativeLoader}. */
export const defaultNativeLoader: NativeModuleLoader = DefaultNativeLoader;

/**
 * A **real, two-way** {@link ILiveKitRoomSdk} over the native LiveKit Node room SDK (publish + subscribe).
 *
 * Gives the agent both **hearing** (per-participant subscribed audio → diarized {@link LiveKitAudioFrame}s)
 * and a **voice** ({@link publishAudioFrame} → the native publish path), plus working video/screen publish,
 * the data-channel chat, and roster events. Construct via {@link BindLiveKitNative} (the factory the
 * bridge's `SetSdkFactory` wants), not directly, so config resolution + the lazy loader wire consistently.
 */
export class LiveKitNativeMeetingSdk implements ILiveKitRoomSdk {
    /** Resolved config (credentials + the native module specifier). */
    private readonly config: LiveKitNativeSdkConfig;

    /** The native-module loader (overridable for tests). */
    private readonly loadModule: NativeModuleLoader;

    /** The live native room client once {@link connect} succeeds. */
    private client: NativeRoomClient | null = null;

    /** The inbound per-participant audio handler registered by the bridge. */
    private audioHandler?: (frame: LiveKitAudioFrame) => void;

    /** The participant-join handler. */
    private joinHandler?: (participant: LiveKitParticipant) => void;

    /** The participant-leave handler. */
    private leaveHandler?: (participantIdentity: string) => void;

    /** The room-disconnected handler. */
    private disconnectedHandler?: (reason?: string) => void;

    /** The inbound video handler (sampled frames from people who let agents see them). */
    private videoHandler?: (frame: LiveKitVideoFrame) => void;

    /** The handler for a camera or screen the room client stopped reading. */
    private videoSourceEndedHandler?: (source: LiveKitVideoSourceEnd) => void;

    /** The handler for a change in what the room client shows of the avatar. */
    private avatarStatusHandler?: (status: LiveKitAvatarStatus) => void;

    /**
     * @param config Resolved credentials + the native module specifier.
     * @param loadModule The native-module loader (defaults to the lazy specifier loader).
     */
    constructor(config: LiveKitNativeSdkConfig, loadModule: NativeModuleLoader = DefaultNativeLoader) {
        this.config = config;
        this.loadModule = loadModule;
    }

    // ── ILiveKitRoomSdk — lifecycle ──────────────────────────────────────────────────

    /**
     * Loads the native module, constructs a room client, wires its callbacks, and connects to the room
     * with the resolved access token. Brings BOTH hearing and the agent's voice online.
     *
     * @param args The bridge's connect args (room ws URL, signed access token, bot name).
     * @returns The bot/room identifiers.
     * @throws When the native module specifier is missing or the module can't be loaded.
     */
    public async connect(args: LiveKitConnectArgs): Promise<LiveKitConnectResult> {
        const specifier = this.config.NativeModuleSpecifier;
        if (!specifier) {
            throw new Error(
                'LiveKitNativeMeetingSdk.connect: no NativeModuleSpecifier configured. Set it to the native LiveKit ' +
                    'Node room-client wrapper in the session Configuration. See the README.',
            );
        }
        const mod = await this.loadModule(specifier);
        const client = mod.createRoomClient({
            Url: args.RoomUrl || this.config.Url,
            ApiKey: this.config.ApiKey,
            ApiSecret: this.config.ApiSecret,
            // The model's audio format (threaded from IRealtimeSession via the engine) — so inbound room
            // audio is resampled to what the model consumes (OpenAI 24 kHz; Gemini Live 16 kHz).
            InboundSampleRate: this.config.InboundSampleRate,
            OutboundSampleRate: this.config.OutboundSampleRate,
            // Only when the agent watches: the client then reads the cameras and screens of people who allow it.
            Video: NativeVideoOptionsFor(this.config),
        });
        this.wireClient(client);

        const result = await client.connect({
            url: args.RoomUrl || this.config.Url || '',
            token: args.AccessToken || this.config.AccessToken || '',
            name: args.BotDisplayName || this.config.BotDisplayName || 'AI Agent',
        });
        this.client = client;

        return {
            BotIdentity: String(result.localIdentity),
            RoomName: result.roomName,
        };
    }

    /** Disconnects from the room and releases the native client. Tolerant of teardown errors. */
    public async disconnect(): Promise<void> {
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.disconnect();
            } catch (err) {
                LogError(
                    `[LiveKitNativeMeetingSdk] disconnect() failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }
    }

    // ── ILiveKitRoomSdk — two-way media (real) ───────────────────────────────────────

    /**
     * Publishes one raw PCM frame on the bot's audio track — **the agent's real voice into the room**, via
     * the native publish path. No-ops (without throwing) before {@link connect} so an early model frame
     * never crashes the session.
     *
     * @param pcm The PCM audio bytes to publish into the room.
     */
    public publishAudioFrame(pcm: ArrayBuffer): void {
        this.client?.publishAudio(pcm);
    }

    /** Flushes the agent's queued outbound audio (barge-in). No-ops before connect. */
    public flushOutboundAudio(): void {
        this.client?.flushOutbound();
    }

    /**
     * Publishes one raw video frame on the bot's camera track via the native publish path. No-ops before
     * {@link connect}.
     *
     * @param frame The video frame bytes to publish.
     */
    public publishVideoFrame(frame: ArrayBuffer): void {
        this.client?.publishVideo(frame);
    }

    /**
     * Publishes one raw screen-share frame on the bot's screen track via the native publish path. No-ops
     * before {@link connect}.
     *
     * @param frame The screen frame bytes to publish.
     */
    public publishScreenFrame(frame: ArrayBuffer): void {
        this.client?.publishScreen(frame);
    }

    /**
     * Hands one piece of the agent's live avatar to the native room client, which decodes and publishes it. Dropped
     * before {@link connect} or when the wrapper publishes no avatars.
     *
     * @param chunk The avatar piece.
     */
    public publishAvatarMedia(chunk: LiveKitAvatarMediaChunk): void {
        this.client?.publishAvatarMedia?.({ data: chunk.Bytes, mimeType: chunk.MimeType });
    }

    /** Registers the handler for a change in what the room client shows of the avatar. */
    public onAvatarStatus(cb: (status: LiveKitAvatarStatus) => void): void {
        this.avatarStatusHandler = cb;
    }

    /** Registers the inbound per-participant audio handler (the diarized hearing path). */
    public onAudioTrack(cb: (frame: LiveKitAudioFrame) => void): void {
        this.audioHandler = cb;
    }

    /** Registers the inbound video handler: sampled frames from people who let agents see them (the seeing path). */
    public onVideoTrack(cb: (frame: LiveKitVideoFrame) => void): void {
        this.videoHandler = cb;
    }

    /** Registers the handler for a camera or screen the room client stopped reading. */
    public onVideoSourceEnded(cb: (source: LiveKitVideoSourceEnd) => void): void {
        this.videoSourceEndedHandler = cb;
    }

    // ── ILiveKitRoomSdk — roster + signals ───────────────────────────────────────────

    /** Registers the participant-join handler. */
    public onParticipantJoin(cb: (participant: LiveKitParticipant) => void): void {
        this.joinHandler = cb;
    }

    /** Registers the participant-leave handler. */
    public onParticipantLeave(cb: (participantIdentity: string) => void): void {
        this.leaveHandler = cb;
    }

    /** Returns the current roster from the native client, mapped to {@link LiveKitParticipant}. */
    public async getParticipants(): Promise<LiveKitParticipant[]> {
        if (!this.client) {
            return [];
        }
        const natives = await this.client.getParticipants();
        return natives.map(MapNativeParticipant);
    }

    /** Registers the room-disconnected handler. */
    public onDisconnected(cb: (reason?: string) => void): void {
        this.disconnectedHandler = cb;
    }

    // ── ILiveKitRoomSdk — data channel (real) ────────────────────────────────────────

    /**
     * Sends a reliable text message on the room data channel via the native client — the room-native
     * "chat". No-ops (without throwing) before {@link connect}.
     *
     * @param text The data/chat message text.
     */
    public async sendDataMessage(text: string): Promise<void> {
        await this.client?.publishData(text);
    }

    // ── internals ────────────────────────────────────────────────────────────────────

    /** Wires the native client's callbacks to this adapter's handlers, mapping native shapes to the seam. */
    private wireClient(client: NativeRoomClient): void {
        client.onAudioFrame((frame) => this.audioHandler?.(MapNativeAudioFrame(frame)));
        client.onParticipantConnected((p) => this.joinHandler?.(MapNativeParticipant(p)));
        client.onParticipantDisconnected((id) => this.leaveHandler?.(String(id)));
        client.onDisconnected((reason) => this.disconnectedHandler?.(reason));
        // Optional on the native seam: a wrapper without inbound video simply never reports any.
        client.onVideoFrame?.((frame) => this.videoHandler?.(MapNativeVideoFrame(frame)));
        client.onVideoSourceEnded?.((source) => this.videoSourceEndedHandler?.(MapNativeVideoSourceEnd(source)));
        client.onAvatarStatus?.((status) => this.avatarStatusHandler?.(MapNativeAvatarStatus(status)));
    }
}

/**
 * Builds the {@link import('./livekit-sdk').LiveKitRoomSdkFactory}-shaped factory that constructs a
 * {@link LiveKitNativeMeetingSdk} from the bridge's per-session `Configuration`. Pass the result to
 * `LiveKitBridge.SetSdkFactory(...)` so a deployment activates **two-way native LiveKit media** without
 * code changes to the driver.
 *
 * Reads the ws URL / API key/secret / pre-signed token + bot name + the native module specifier out of
 * the config map the engine passes at connect (credentials resolved upstream — **never inline secrets**).
 *
 * @example
 * // Where bridge drivers are configured (creds already resolved from the MJ credential system):
 * bridge.SetSdkFactory(BindLiveKitNative());
 *
 * @param loadModule Optional native-module loader override (tests inject a fake; production omits it).
 * @returns A factory `(config) => LiveKitNativeMeetingSdk`.
 */
export function BindLiveKitNative(
    loadModule: NativeModuleLoader = DefaultNativeLoader,
): (config?: Record<string, unknown>) => LiveKitNativeMeetingSdk {
    return (config?: Record<string, unknown>) => new LiveKitNativeMeetingSdk(ReadNativeConfig(config), loadModule);
}

/**
 * Extracts a {@link LiveKitNativeSdkConfig} from the engine's loosely-typed `Configuration` map without
 * ever widening to `any`. Each field is read + type-checked individually so a malformed config yields a
 * clean, partially-resolved object (and {@link LiveKitNativeMeetingSdk.connect} then throws a precise
 * error if the required specifier is absent) rather than a half-typed blob.
 */
export function ReadNativeConfig(config?: Record<string, unknown>): LiveKitNativeSdkConfig {
    const cfg = config ?? {};
    return {
        Url: readString(cfg.Url),
        ApiKey: readString(cfg.ApiKey),
        ApiSecret: readString(cfg.ApiSecret),
        AccessToken: readString(cfg.AccessToken),
        BotDisplayName: readString(cfg.BotDisplayName),
        NativeModuleSpecifier: readString(cfg.NativeModuleSpecifier),
        InboundSampleRate: readNumber(cfg.InboundSampleRate),
        OutboundSampleRate: readNumber(cfg.OutboundSampleRate),
        AgentVision: readBoolean(cfg.AgentVision),
        InboundVideoStreams: readNumber(cfg.InboundVideoStreams),
        InboundVideoRate: readNumber(cfg.InboundVideoRate),
        VideoIn: readBoolean(cfg.VideoIn),
        ScreenIn: readBoolean(cfg.ScreenIn),
        VideoCameraMaxDimension: readNumber(cfg.VideoCameraMaxDimension),
        VideoScreenMaxDimension: readNumber(cfg.VideoScreenMaxDimension),
        VideoJpegQuality: readNumber(cfg.VideoJpegQuality),
        VideoSpeakerOnsetMs: readNumber(cfg.VideoSpeakerOnsetMs),
        VideoSpeakerHoldMs: readNumber(cfg.VideoSpeakerHoldMs),
    };
}

/** @deprecated Use {@link ReadNativeConfig}. */
export function readNativeConfig(config?: Record<string, unknown>): LiveKitNativeSdkConfig {
    return ReadNativeConfig(config);
}

/** Reads a value as a non-empty string, or `undefined`. */
function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Reads a positive finite number from a free-form config value, or `undefined`. */
function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Reads a boolean from a free-form config value, or `undefined` (only real booleans count, never `'true'`). */
function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}
