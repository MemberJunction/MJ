/**
 * @fileoverview The media worker's session logic — side-effect free and safe to import from anywhere
 * (including other worker threads and test runners). The auto-running worker bootstrap lives in
 * `media-worker-bootstrap.ts`, which is deliberately NOT exported from the package index.
 *
 * A {@link MediaWorkerSession} owns the native `@livekit/rtc-node` room inside a `worker_threads.Worker`,
 * the outbound pre-buffer + duration-paced publish loop, and the zero-copy forwarding of inbound audio and of the
 * sampled JPEG frames of participant video (read in the worker when the agent watches the meeting, and encoded on the
 * media worker's own encode worker when `videoEncodeWorker` is set).
 *
 * ## Outbound pacing
 * Model audio arrives in bursts far faster than real time. Each response is paced by audio DURATION
 * against a monotonic clock: after a ~`preBufferMs` pre-buffer, entry `k` is due at
 * `start + max(0, sentMs(k) - preBufferMs)` where `sentMs(k)` is the cumulative duration already released.
 * That releases the first `preBufferMs` of audio at once (a jitter cushion inside the AudioSource) and then
 * holds the source ~`preBufferMs` ahead of playback, drift-free, regardless of timer jitter or chunk sizes.
 * We keep this pacer (rather than relying on `captureFrame` backpressure) because the SDK only blocks once
 * ~1s is queued, which would make barge-in flush cost a full second of already-committed audio.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { performance } from 'node:perf_hooks';
import type { NativeConnectArgs, NativeRoomAudioFrame } from '@memberjunction/ai-bridge-livekit';
import { LogError } from '@memberjunction/core';
import { LiveKitRtcNodeRoomClient, DefaultRtcNodeLoader, type RtcNodeLoader } from './livekit-rtc-node-room';
import { ReadEventLoop, type RoomAudioTelemetrySnapshot, type TelemetryRoomClient } from './room-telemetry';
import { VideoEncodeWorkerHost } from './video-encode-worker-host';
import type {
    MediaWorkerCommand,
    MediaWorkerEvent,
    MediaWorkerClientOptions,
} from './media-worker-types';

/** Minimal port interface allowing both real worker parentPort and test ports. */
export interface MediaWorkerPort {
    postMessage(message: MediaWorkerEvent, transferList?: ReadonlyArray<ArrayBuffer>): void;
    on(event: 'message', listener: (msg: MediaWorkerCommand) => void): unknown;
}

/** Injectable collaborators (defaults are the real native client and the monotonic clock). */
export interface MediaWorkerSessionDeps {
    /** Builds the native room client for a connect. Default: {@link LiveKitRtcNodeRoomClient}. */
    clientFactory?: (options: MediaWorkerClientOptions) => TelemetryRoomClient;
    /** Monotonic millisecond clock. Default: `performance.now()`. */
    now?: () => number;
}

/** Outbound audio entry waiting in the worker's pacing queue. */
interface OutboundQueueEntry {
    pcm: ArrayBuffer;
    /** Playback duration of this entry in ms, derived from its sample count. */
    durationMs: number;
}

const DEFAULT_PREBUFFER_MS = 150;
/** Timers firing within this many ms of their due time are treated as on-time. */
const TIMER_SLACK_MS = 1;

/**
 * The native room client a worker session builds for a connect (the session's default factory): the in-process
 * client, at the session's rates, reading participant video when the options carry `video`, and encoding it on this
 * media worker's own encode worker ({@link VideoEncodeWorkerHost}, nested) when `videoEncodeWorker` is set.
 *
 * @param options The options from the main thread's `connect` command.
 * @param loader The `@livekit/rtc-node` loader (tests inject a fake). Default {@link DefaultRtcNodeLoader}.
 */
export function CreateMediaWorkerRoomClient(options: MediaWorkerClientOptions, loader: RtcNodeLoader = DefaultRtcNodeLoader): TelemetryRoomClient {
    return new LiveKitRtcNodeRoomClient(options.sampleRate, options.inboundSampleRate, options.channels, loader, {
        Video: options.video,
        VideoEncoder: options.video && options.videoEncodeWorker ? VideoEncodeWorkerHost.Instance : undefined,
        AvatarStatus: options.avatarStatus,
    });
}

/** Copies an inbound audio frame's PCM into a standalone buffer the worker can transfer (zero-copy) to the main thread. */
function transferableAudio(frame: NativeRoomAudioFrame): ArrayBuffer {
    const frameData = frame.data;
    if (frameData instanceof ArrayBuffer) {
        return frameData;
    }
    const copy = new Uint8Array(frameData.byteLength);
    copy.set(frameData);
    return copy.buffer;
}

/**
 * Encapsulates the media worker's state and message handling for one WebRTC room session.
 */
export class MediaWorkerSession {
    private client: TelemetryRoomClient | null = null;
    private options: MediaWorkerClientOptions = {
        sampleRate: 24000,
        channels: 1,
        inboundSampleRate: 24000,
        preBufferMs: DEFAULT_PREBUFFER_MS,
    };

    private readonly clientFactory: (options: MediaWorkerClientOptions) => TelemetryRoomClient;
    private readonly now: () => number;

    private readonly outboundQueue: OutboundQueueEntry[] = [];
    private queuedMs = 0;
    private isPreBuffering = true;
    private preBufferTimer: NodeJS.Timeout | null = null;
    private pacingTimer: NodeJS.Timeout | null = null;
    /** Monotonic time the current response's schedule started (valid while `sentMs > 0` or pacing). */
    private paceStartMs = 0;
    /** Cumulative audio duration released to the native source in the current response. */
    private sentMs = 0;
    private isPacing = false;

    constructor(private readonly port: MediaWorkerPort, deps: MediaWorkerSessionDeps = {}) {
        this.now = deps.now ?? (() => performance.now());
        this.clientFactory = deps.clientFactory ?? ((o) => CreateMediaWorkerRoomClient(o));
    }

    /**
     * Dispatches an incoming command from the main thread.
     */
    public async HandleCommand(command: MediaWorkerCommand): Promise<void> {
        try {
            switch (command.type) {
                case 'connect':
                    await this.handleConnect(command.id, command.args, command.options);
                    break;
                case 'publishAudio':
                    this.handlePublishAudio(command.pcm);
                    break;
                case 'flushOutbound':
                    this.handleFlushOutbound();
                    break;
                case 'publishAvatarMedia':
                    // Decoded and published in this worker: the avatar's decoders are its child processes.
                    this.client?.publishAvatarMedia?.(command.chunk);
                    break;
                case 'publishData':
                    await this.handlePublishData(command.id, command.text);
                    break;
                case 'disconnect':
                    await this.handleDisconnect(command.id);
                    break;
                case 'getTelemetry':
                    this.handleGetTelemetry(command.id);
                    break;
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if ('id' in command) {
                this.port.postMessage({ type: 'commandError', id: command.id, error: errorMsg });
            } else {
                this.port.postMessage({ type: 'workerError', error: errorMsg });
            }
        }
    }

    /** Connects the native room client inside the worker. */
    private async handleConnect(
        id: string,
        args: NativeConnectArgs,
        options: MediaWorkerClientOptions
    ): Promise<void> {
        this.options = { ...options, preBufferMs: options.preBufferMs ?? DEFAULT_PREBUFFER_MS };
        this.resetPacing();

        const client = this.clientFactory(this.options);
        this.client = client;
        this.forwardMedia(client);
        this.forwardRoomEvents(client);

        const result = await client.connect(args);

        // Seed the main thread's roster with everyone already in the room (participantConnected only
        // fires for LATER joins). Sent before `connected` so getParticipants() is right the moment
        // connect() resolves.
        const participants = await client.getParticipants();
        this.port.postMessage({ type: 'rosterSnapshot', participants });
        this.port.postMessage({ type: 'connected', id, result });
    }

    /**
     * Forwards inbound media to the main thread, transferring each buffer (zero-copy): diarized audio frames, and the
     * sampled JPEG frames and ended sources of participant video. A video frame's `data` is a standalone buffer, so
     * transferring it detaches nothing else.
     */
    private forwardMedia(client: TelemetryRoomClient): void {
        client.onAudioFrame((frame) => {
            const buffer = transferableAudio(frame);
            this.port.postMessage(
                {
                    type: 'audioFrame',
                    frame: {
                        data: buffer,
                        participantIdentity: frame.participantIdentity,
                        name: frame.name,
                        timestampMs: frame.timestampMs ?? Date.now(),
                    },
                },
                [buffer]
            );
        });
        client.onVideoFrame?.((frame) => {
            this.port.postMessage({ type: 'videoFrame', frame }, [frame.data]);
        });
        client.onVideoSourceEnded?.((source) => {
            this.port.postMessage({ type: 'videoSourceEnded', source });
        });
        client.onAvatarStatus?.((status) => {
            this.port.postMessage({ type: 'avatarStatus', status });
        });
    }

    /** Forwards roster changes and the room's own disconnect to the main thread. */
    private forwardRoomEvents(client: TelemetryRoomClient): void {
        client.onParticipantConnected((participant) => {
            this.port.postMessage({ type: 'participantConnected', participant });
        });

        client.onParticipantDisconnected((participantIdentity) => {
            this.port.postMessage({ type: 'participantDisconnected', participantIdentity });
        });

        client.onDisconnected((reason) => {
            this.resetPacing();
            this.port.postMessage({ type: 'disconnected', reason: reason ?? 'room disconnected' });
        });
    }

    /** Handles outbound audio from the main thread with pre-buffering and duration pacing. */
    private handlePublishAudio(pcm: ArrayBuffer): void {
        const samplesPerChannel = Math.floor(pcm.byteLength / 2 / this.options.channels);
        const durationMs = (samplesPerChannel / this.options.sampleRate) * 1000;
        const arrivedAt = this.now();

        if (!this.isPreBuffering && !this.isPacing && this.outboundQueue.length === 0 && arrivedAt >= this.paceStartMs + this.sentMs) {
            // The previous response fully played out (source ran dry) before this chunk arrived: this is a
            // new response, so it gets a fresh pre-buffer and a fresh schedule.
            this.resetPacing();
        }

        this.outboundQueue.push({ pcm, durationMs });
        this.queuedMs += durationMs;

        if (this.isPreBuffering) {
            const targetPreBufferMs = this.options.preBufferMs ?? DEFAULT_PREBUFFER_MS;
            if (this.queuedMs >= targetPreBufferMs) {
                this.startPacing();
            } else if (!this.preBufferTimer) {
                // Failsafe: start draining after preBufferMs even if not enough audio accumulated
                this.preBufferTimer = setTimeout(() => this.startPacing(), targetPreBufferMs);
            }
        } else if (!this.isPacing) {
            this.isPacing = true;
            this.drain();
        }
    }

    /** Transitions from pre-buffering to active duration pacing. */
    private startPacing(): void {
        if (this.preBufferTimer) {
            clearTimeout(this.preBufferTimer);
            this.preBufferTimer = null;
        }
        this.isPreBuffering = false;
        this.isPacing = true;
        this.paceStartMs = this.now();
        this.sentMs = 0;
        this.drain();
    }

    /** Releases every entry that is due, then sleeps until the next one is. */
    private drain(): void {
        this.pacingTimer = null;
        const leadMs = this.options.preBufferMs ?? DEFAULT_PREBUFFER_MS;
        while (this.outboundQueue.length > 0) {
            const entry = this.outboundQueue[0];
            const dueAt = this.paceStartMs + Math.max(0, this.sentMs - leadMs);
            const waitMs = dueAt - this.now();
            if (waitMs > TIMER_SLACK_MS) {
                this.pacingTimer = setTimeout(() => this.drain(), waitMs);
                return;
            }
            this.outboundQueue.shift();
            this.queuedMs -= entry.durationMs;
            this.sentMs += entry.durationMs;
            this.client?.publishAudio(entry.pcm);
        }
        // Queue empty: idle. Pacing state is kept so a chunk arriving while the source is still playing
        // continues the same schedule; handlePublishAudio resets it once playback has actually ended.
        this.isPacing = false;
    }

    /** Clears queue, timers and schedule so the next response starts with a fresh pre-buffer. */
    private resetPacing(): void {
        this.cleanupTimers();
        this.outboundQueue.length = 0;
        this.queuedMs = 0;
        this.sentMs = 0;
        this.paceStartMs = 0;
        this.isPreBuffering = true;
        this.isPacing = false;
    }

    /**
     * Instant barge-in flush: drops all queued frames, cancels timers,
     * and clears the native audio source queue.
     */
    private handleFlushOutbound(): void {
        this.resetPacing();
        this.client?.flushOutbound();
    }

    private async handlePublishData(id: string, text: string): Promise<void> {
        if (this.client) {
            await this.client.publishData(text);
        }
        this.port.postMessage({ type: 'commandSuccess', id });
    }

    private async handleDisconnect(id: string): Promise<void> {
        this.resetPacing();
        const client = this.client;
        this.client = null;
        if (client) {
            try {
                await client.disconnect();
            } catch (err) {
                LogError(`[MediaWorkerSession] native disconnect failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
        this.port.postMessage({ type: 'commandSuccess', id });
    }

    private handleGetTelemetry(id: string): void {
        const snapshot: RoomAudioTelemetrySnapshot = this.client
            ? this.client.GetTelemetry()
            : { inboundGaps: {}, outbound: { captureCount: 0, underrunCount: 0 } };
        const loop = ReadEventLoop();
        this.port.postMessage({
            type: 'telemetry',
            id,
            snapshot: {
                ...snapshot,
                workerEventLoopDelayP99Ms: loop?.P99Ms ?? snapshot.eventLoopDelayP99Ms,
                pacerQueuedMs: this.queuedMs,
            },
        });
    }

    private cleanupTimers(): void {
        if (this.preBufferTimer) {
            clearTimeout(this.preBufferTimer);
            this.preBufferTimer = null;
        }
        if (this.pacingTimer) {
            clearTimeout(this.pacingTimer);
            this.pacingTimer = null;
        }
    }
}

/**
 * Wires a {@link MediaWorkerSession} to the given port and announces `ready`. Called by the bootstrap
 * entry; also usable directly in tests with an in-memory port.
 */
export function RunMediaWorker(port: MediaWorkerPort, deps?: MediaWorkerSessionDeps): MediaWorkerSession {
    const session = new MediaWorkerSession(port, deps);
    port.on('message', (command: MediaWorkerCommand) => {
        void session.HandleCommand(command);
    });
    port.postMessage({ type: 'ready' });
    return session;
}
