/**
 * @fileoverview Types and protocol definitions for the worker thread media-plane isolation.
 *
 * Defines the bidirectional command/event message contracts and {@link IMediaWorker} interface
 * used to isolate `@livekit/rtc-node` WebRTC audio processing, outbound frame pacing, and pre-buffering
 * off the main Node.js event loop into a dedicated `worker_threads.Worker`.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import type {
    NativeConnectArgs,
    NativeConnectResult,
    NativeRoomAudioFrame,
    NativeRoomParticipant,
} from '@memberjunction/ai-bridge-livekit';
import type { RoomAudioTelemetrySnapshot } from './livekit-rtc-node-room';

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
    | { type: 'publishData'; id: string; text: string }
    | { type: 'disconnect'; id: string }
    | { type: 'getTelemetry'; id: string };

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
    | { type: 'data'; text: string; senderIdentity: string }
    | { type: 'disconnected'; reason?: string }
    | { type: 'telemetry'; id: string; snapshot: RoomAudioTelemetrySnapshot }
    | { type: 'workerError'; error: string };

/**
 * Interface representing the media worker communication channel (e.g. `worker_threads.Worker`
 * or an injected test channel).
 */
export interface IMediaWorker {
    /** Sends a command to the worker, optionally transferring ownership of ArrayBuffers without copying. */
    postMessage(message: MediaWorkerCommand, transferList?: ReadonlyArray<Transferable>): void;
    /** Registers an event listener on messages from the worker. */
    on(event: 'message', listener: (msg: MediaWorkerEvent) => void): this;
    /** Registers an event listener on worker-level errors. */
    on(event: 'error', listener: (err: Error) => void): this;
    /** Registers an event listener on worker exit. */
    on(event: 'exit', listener: (code: number) => void): this;
    /** Terminates the worker thread. */
    terminate(): Promise<number>;
}
