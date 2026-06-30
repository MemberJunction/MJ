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
 *   surfaced as a diarized `NativeRoomAudioFrame` (`{ data, participantIdentity, name }`).
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

import { LogError, LogStatus } from '@memberjunction/core';
import type {
    NativeRoomModule,
    NativeRoomClient,
    NativeRoomClientOptions,
    NativeConnectArgs,
    NativeConnectResult,
    NativeRoomAudioFrame,
    NativeRoomParticipant,
} from '@memberjunction/ai-bridge-livekit';

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

/** A participant as `@livekit/rtc-node` reports it. VERIFY: `identity` / `name`. */
export interface RtcParticipant {
    /** The participant's stable application identity. */
    identity: string;
    /** The participant's display name. */
    name?: string;
}

/** A subscribed media track. VERIFY: `kind` compared against `TrackKind.KIND_AUDIO`. */
export interface RtcTrack {
    /** The track kind (audio/video). */
    kind: number;
}

/** The audio source the bot publishes its voice through. VERIFY: `captureFrame(frame)` is async. */
export interface RtcAudioSource {
    /** Pushes one PCM frame onto the published track. */
    captureFrame(frame: RtcAudioFrame): Promise<void>;
    /** Drops all audio still queued in the source (used to flush on barge-in / interruption). */
    clearQueue(): void;
}

/** The bot's published local audio track. */
export interface RtcLocalAudioTrack {
    /** Marker — the concrete track object handed to `publishTrack`. */
    readonly __isLocalAudioTrack?: true;
}

/** An async stream of inbound PCM frames for one subscribed audio track. VERIFY: async-iterable. */
export type RtcAudioStream = AsyncIterable<RtcAudioFrame> & {
    /** Closes the stream and releases resources. */
    close?(): void;
};

/** The bot's local participant — its publish surface. */
export interface RtcLocalParticipant {
    /** The bot's own identity. */
    identity: string;
    /** Publishes a track (the bot's audio). VERIFY: returns a publication / Promise. */
    publishTrack(track: RtcLocalAudioTrack, options?: RtcTrackPublishOptions): Promise<unknownRecord>;
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
    /** Event-name constants. VERIFY exact member names. */
    RoomEvent: {
        TrackSubscribed: string;
        ParticipantConnected: string;
        ParticipantDisconnected: string;
        Disconnected: string;
    };
    /** Track-kind constants. VERIFY: `KIND_AUDIO`. */
    TrackKind: { KIND_AUDIO: number };
    /**
     * `new TrackPublishOptions({ source })` — the publish-options protobuf message. REQUIRED by
     * `publishTrack`: passing a plain object leaves `source` unset and the track improperly bound, so the
     * native `AudioSource.captureFrame` rejects every frame with `InvalidState`. Construct the real proto.
     */
    TrackPublishOptions: new (data?: { source?: number; dtx?: boolean; red?: boolean; stream?: string }) => RtcTrackPublishOptions;
    /** Track-source constants — `SOURCE_MICROPHONE` tags the bot's published voice track. */
    TrackSource: { SOURCE_MICROPHONE: number };
}

/** Opaque marker for a constructed `TrackPublishOptions` proto handed to `publishTrack`. */
export interface RtcTrackPublishOptions {
    /** The track source (e.g. `SOURCE_MICROPHONE`). */
    readonly source?: number;
}

/** The injectable loader for `@livekit/rtc-node` (tests inject a fake; production lazy-imports the addon). */
export type RtcNodeLoader = () => Promise<RtcNodeModule>;

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
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested directly)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Converts a raw little-endian 16-bit PCM `ArrayBuffer` (what the bridge forwards from the realtime
 * model's output) into an `Int16Array` view suitable for a LiveKit `AudioFrame`. An odd byte length is
 * truncated to whole samples (a defensive guard — a half sample is never valid PCM16).
 */
export function pcmToInt16(pcm: ArrayBuffer): Int16Array {
    const wholeSamples = Math.floor(pcm.byteLength / 2);
    return new Int16Array(pcm, 0, wholeSamples);
}

/**
 * Copies an `Int16Array` (an inbound LiveKit frame's `data`) to a standalone little-endian PCM
 * `ArrayBuffer` for the bridge. Copied (not aliased) so a recycled SDK buffer can't mutate bytes the
 * model is still reading.
 */
export function int16ToArrayBuffer(samples: Int16Array): ArrayBuffer {
    const copy = new Int16Array(samples.length);
    copy.set(samples);
    return copy.buffer;
}

/** Normalizes the SDK's `remoteParticipants` (Map or array) to an array. */
export function participantsToArray(
    remote: Map<string, RtcParticipant> | RtcParticipant[],
): RtcParticipant[] {
    return Array.isArray(remote) ? remote : Array.from(remote.values());
}

// ──────────────────────────────────────────────────────────────────────────────
// The real client
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The default lazy loader for `@livekit/rtc-node` (category: optional peer dependency — a native addon we
 * must not force on installs). Throws an actionable error when absent so a misconfigured deployment fails
 * loudly. VERIFY: the module's default/namespace interop shape.
 */
export const defaultRtcNodeLoader: RtcNodeLoader = async (): Promise<RtcNodeModule> => {
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
    private readonly inboundStreams: RtcAudioStream[] = [];

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

    private audioHandler?: (frame: NativeRoomAudioFrame) => void;
    private participantConnectedHandler?: (p: NativeRoomParticipant) => void;
    private participantDisconnectedHandler?: (identity: string) => void;
    private disconnectedHandler?: () => void;

    private warnedVideo = false;
    private warnedScreen = false;

    /**
     * @param outboundRate Outbound PCM rate (Hz) — the AudioSource rate (model output rate).
     * @param inboundRate Inbound PCM rate (Hz) — each AudioStream's resample target (model input rate).
     * @param channels Channel count.
     * @param loadRtc The `@livekit/rtc-node` loader.
     */
    constructor(outboundRate: number, inboundRate: number, channels: number, loadRtc: RtcNodeLoader) {
        this.outboundRate = outboundRate;
        this.inboundRate = inboundRate;
        this.channels = channels;
        this.loadRtc = loadRtc;
    }

    /** Connects to the room, publishes the bot's audio track, and wires inbound audio + roster events. */
    public async connect(args: NativeConnectArgs): Promise<NativeConnectResult> {
        const rtc = await this.loadRtc();
        const room = new rtc.Room();
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

        return { localIdentity: room.localParticipant.identity, roomName: room.name ?? '' };
    }

    /** Disconnects, closes inbound streams, and releases the room. Tolerant of teardown errors. */
    public async disconnect(): Promise<void> {
        const room = this.room;
        this.closeInboundStreams();
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
        this.outboundQueue.push(pcmToInt16(pcm));
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
                await source.captureFrame(frame);
            }
        } catch (err: unknown) {
            LogError(`[LiveKitRtcNodeRoomClient] captureFrame failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.draining = false;
            // A frame may have arrived after the loop's last length check — pick it up.
            if (this.outboundQueue.length > 0 && this.rtc && this.audioSource) {
                void this.drainOutbound();
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
        try {
            this.audioSource?.clearQueue();
        } catch (err: unknown) {
            LogError(`[LiveKitRtcNodeRoomClient] flushOutbound clearQueue failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Video publish is not part of the voice MVP — LiveKit supports it, but it needs a `VideoSource` +
     * frame-format negotiation beyond this wrapper's scope. One-time-warned no-op (never throws).
     */
    public publishVideo(_frame: ArrayBuffer): void {
        if (!this.warnedVideo) {
            this.warnedVideo = true;
            LogStatus('[LiveKitRtcNodeRoomClient] video publish not implemented in the native wrapper (voice MVP). No-op.');
        }
    }

    /** Screen publish — same status as {@link publishVideo}. One-time-warned no-op. */
    public publishScreen(_frame: ArrayBuffer): void {
        if (!this.warnedScreen) {
            this.warnedScreen = true;
            LogStatus('[LiveKitRtcNodeRoomClient] screen publish not implemented in the native wrapper (voice MVP). No-op.');
        }
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
        return participantsToArray(room.remoteParticipants).map((p) => ({ identity: p.identity, name: p.name }));
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
    public onDisconnected(cb: () => void): void {
        this.disconnectedHandler = cb;
    }

    // ── internals ──────────────────────────────────────────────────────────────

    /** Wires room-level events (track-subscribed → inbound audio; participant + disconnect events). */
    private wireRoomEvents(rtc: RtcNodeModule, room: RtcRoom): void {
        // VERIFY against @livekit/rtc-node: TrackSubscribed listener arity (track, publication, participant).
        room.on(rtc.RoomEvent.TrackSubscribed, ((track: RtcTrack, _pub: unknownRecord, participant: RtcParticipant) => {
            if (track.kind === rtc.TrackKind.KIND_AUDIO) {
                this.consumeInboundAudio(rtc, track, participant);
            }
        }) as (...args: never[]) => void);

        room.on(rtc.RoomEvent.ParticipantConnected, ((participant: RtcParticipant) => {
            this.participantConnectedHandler?.({ identity: participant.identity, name: participant.name });
        }) as (...args: never[]) => void);

        room.on(rtc.RoomEvent.ParticipantDisconnected, ((participant: RtcParticipant) => {
            this.participantDisconnectedHandler?.(participant.identity);
        }) as (...args: never[]) => void);

        room.on(rtc.RoomEvent.Disconnected, (() => this.disconnectedHandler?.()) as (...args: never[]) => void);
    }

    /**
     * Reads one subscribed audio track via an `AudioStream` (constructed at the model's INPUT rate so frames
     * arrive resampled) and forwards each frame as a diarized {@link NativeRoomAudioFrame}.
     */
    private consumeInboundAudio(rtc: RtcNodeModule, track: RtcTrack, participant: RtcParticipant): void {
        const stream = new rtc.AudioStream(track, this.inboundRate, this.channels);
        this.inboundStreams.push(stream);
        void this.pumpAudioStream(stream, participant);
    }

    /** Async-iterates an inbound stream, mapping each frame to the diarized seam frame. Tolerant of errors. */
    private async pumpAudioStream(stream: RtcAudioStream, participant: RtcParticipant): Promise<void> {
        try {
            for await (const frame of stream) {
                this.audioHandler?.({
                    data: int16ToArrayBuffer(frame.data),
                    participantIdentity: participant.identity,
                    name: participant.name,
                });
            }
        } catch (err) {
            LogError(`[LiveKitRtcNodeRoomClient] inbound audio stream for '${participant.identity}' ended with error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Closes all inbound audio streams (best-effort). */
    private closeInboundStreams(): void {
        for (const stream of this.inboundStreams) {
            try {
                stream.close?.();
            } catch {
                // best-effort teardown
            }
        }
        this.inboundStreams.length = 0;
    }
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
    const loader = opts.Loader ?? defaultRtcNodeLoader;
    return {
        createRoomClient(options: NativeRoomClientOptions): NativeRoomClient {
            // Credentials (Url/ApiKey/ApiSecret) are not needed here — the bridge hands a pre-signed access
            // token to client.connect(args). The PER-SESSION sample rates ARE used: the agent's realtime
            // model dictates them (OpenAI 24 kHz; Gemini Live 16 kHz IN), threaded down from the engine, so
            // inbound room audio is resampled to what THIS model consumes. Fall back to the module defaults.
            return new LiveKitRtcNodeRoomClient(
                options.OutboundSampleRate ?? outbound,
                options.InboundSampleRate ?? inbound,
                channels,
                loader,
            );
        },
    };
}
