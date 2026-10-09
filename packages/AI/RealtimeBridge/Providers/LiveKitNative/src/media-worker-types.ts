/**
 * @fileoverview Types and protocol definitions for the worker thread media-plane isolation.
 *
 * Defines the bidirectional command/event message contracts and {@link IMediaWorker} interface
 * used to isolate `@livekit/rtc-node` WebRTC audio processing, outbound frame pacing, pre-buffering, and the
 * reading and encoding of participant video off the main Node.js event loop into a dedicated `worker_threads.Worker`.
 *
 * Request/response commands (`connect`, `publishData`, `disconnect`, `getTelemetry`) carry a correlation
 * `id`; the worker answers each with exactly one of `connected` / `commandSuccess` / `telemetry` /
 * `commandError` bearing the same `id`. Everything else is fire-and-forget or an unsolicited event.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import type {
    NativeAvatarMediaChunk,
    NativeAvatarStatus,
    NativeConnectArgs,
    NativeConnectResult,
    NativeRoomAudioFrame,
    NativeRoomParticipant,
    NativeRoomVideoFrame,
    NativeRoomVideoOptions,
    NativeRoomVideoSourceEnd,
} from '@memberjunction/ai-bridge-livekit';
import type { RoomAudioTelemetrySnapshot } from './room-telemetry';

/**
 * Options configured for the media worker room client.
 */
export interface MediaWorkerClientOptions {
    /** Outbound capture sample rate (Hz). */
    sampleRate: number;
    /** Outbound capture channel count (typically 1 for mono). */
    channels: number;
    /** Inbound audio stream sample rate (Hz). */
    inboundSampleRate: number;
    /** Outbound pre-buffer target in milliseconds (default: 150ms). */
    preBufferMs?: number;
    /**
     * What the in-worker room client reads for the agent when it watches the meeting. Absent: no video is read (and
     * every video track is unsubscribed). The watcher runs inside the worker: it reads attributes and events there.
     */
    video?: NativeRoomVideoOptions;  // case-violation-ok-legacy-back-compat: matches this protocol's existing camelCase fields
    /**
     * Whether the in-worker room client encodes participant video on its own encode worker (nested in the media worker)
     * rather than on the media worker's thread. The module factory sets it from `MJ_LIVEKIT_VIDEO_ENCODE_WORKER` and its
     * `VideoEncodeWorker` option; absent means the media worker's thread encodes.
     */
    videoEncodeWorker?: boolean;  // case-violation-ok-legacy-back-compat: matches this protocol's existing camelCase fields
    /**
     * Where the agent's avatar stands at this join. A worker restarted after the avatar was taken down joins with
     * `audio-only`, so the in-worker client re-applies the bot's attribute (the token still says `on`) and publishes no
     * avatar. Absent on a first join.
     */
    avatarStatus?: NativeAvatarStatus;  // case-violation-ok-legacy-back-compat: matches this protocol's existing camelCase fields
}

/**
 * Commands sent from the Main Thread to the Media Worker Thread.
 */
export type MediaWorkerCommand =
    | { type: 'connect'; id: string; args: NativeConnectArgs; options: MediaWorkerClientOptions }
    | { type: 'publishAudio'; pcm: ArrayBuffer }
    | { type: 'flushOutbound' }
    | { type: 'publishVideo'; frame: ArrayBuffer }
    | { type: 'publishScreen'; frame: ArrayBuffer }
    /** One piece of the agent's live avatar; its `data` buffer is in the transfer list (not copied). */
    | { type: 'publishAvatarMedia'; chunk: NativeAvatarMediaChunk }  // case-violation-ok-legacy-back-compat: matches this protocol's existing camelCase fields
    | { type: 'publishData'; id: string; text: string }
    | { type: 'disconnect'; id: string }
    | { type: 'getTelemetry'; id: string };

/** Commands that carry a correlation id and expect a response. */
export type MediaWorkerRequest = Extract<MediaWorkerCommand, { id: string }>;

/**
 * Events sent from the Media Worker Thread to the Main Thread.
 */
export type MediaWorkerEvent =
    | { type: 'ready' }
    | { type: 'connected'; id: string; result: NativeConnectResult }
    | { type: 'commandError'; id: string; error: string }
    | { type: 'commandSuccess'; id: string }
    | { type: 'audioFrame'; frame: NativeRoomAudioFrame }
    | { type: 'participantConnected'; participant: NativeRoomParticipant }
    | { type: 'participantDisconnected'; participantIdentity: string }
    /** Full remote roster, sent after every successful join (including rejoins), before `connected`. */
    | { type: 'rosterSnapshot'; participants: NativeRoomParticipant[] }
    | { type: 'disconnected'; reason?: string }
    | { type: 'telemetry'; id: string; snapshot: RoomAudioTelemetrySnapshot }
    | { type: 'workerError'; error: string }
    /** A sampled JPEG frame of a person's camera or screen; its `data` buffer is in the transfer list (not copied). */
    | { type: 'videoFrame'; frame: NativeRoomVideoFrame }  // case-violation-ok-legacy-back-compat: matches this protocol's existing camelCase fields
    /** A camera or screen the in-worker client stopped reading after sending frames. */
    | { type: 'videoSourceEnded'; source: NativeRoomVideoSourceEnd }  // case-violation-ok-legacy-back-compat: matches this protocol's existing camelCase fields
    /** A change in what the room is shown of the agent's avatar (published, or taken down). */
    | { type: 'avatarStatus'; status: NativeAvatarStatus };  // case-violation-ok-legacy-back-compat: matches this protocol's existing camelCase fields

/**
 * Interface representing the media worker communication channel (e.g. `worker_threads.Worker`
 * or an injected test channel).
 */
export interface IMediaWorker {
    /** Sends a command to the worker, optionally transferring ownership of ArrayBuffers without copying. */
    postMessage(message: MediaWorkerCommand, transferList?: ReadonlyArray<ArrayBuffer>): void;
    /** Registers an event listener on messages from the worker. */
    on(event: 'message', listener: (msg: MediaWorkerEvent) => void): this;
    /** Registers an event listener on worker-level errors. */
    on(event: 'error', listener: (err: Error) => void): this;
    /** Registers an event listener on worker exit. */
    on(event: 'exit', listener: (code: number) => void): this;
    /** Terminates the worker thread. */
    terminate(): Promise<number>;
}
