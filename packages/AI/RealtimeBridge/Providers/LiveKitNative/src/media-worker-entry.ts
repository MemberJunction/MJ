/**
 * @fileoverview Worker thread entrypoint for the media-plane split.
 *
 * Runs inside a Node.js `worker_threads.Worker`. Owns the native `@livekit/rtc-node` room,
 * WebRTC connection, audio publish/subscribe pumps, outbound 150ms pre-buffering queue,
 * and zero-copy transferable ArrayBuffer communication with the main thread.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { isMainThread, parentPort, type MessagePort } from 'node:worker_threads';
import type { NativeConnectArgs } from '@memberjunction/ai-bridge-livekit';
import {
    LiveKitRtcNodeRoomClient,
    DefaultRtcNodeLoader,
} from './livekit-rtc-node-room';
import type {
    MediaWorkerCommand,
    MediaWorkerEvent,
    MediaWorkerClientOptions,
} from './media-worker-types';

/** Minimal port interface allowing both real worker parentPort and test MessagePort. */
export interface MediaWorkerPort {
    postMessage(message: MediaWorkerEvent, transferList?: ReadonlyArray<Transferable>): void;
    on(event: 'message', listener: (msg: MediaWorkerCommand) => void): unknown;
    on(event: 'close', listener: () => void): unknown;
}

/** Outbound audio frame entry waiting in the worker's pacing queue. */
interface OutboundQueueEntry {
    pcm: ArrayBuffer;
    enqueuedAt: number;
}

/**
 * Encapsulates the media worker's state and message handling for one WebRTC room session.
 */
export class MediaWorkerSession {
    private client: LiveKitRtcNodeRoomClient | null = null;
    private options: MediaWorkerClientOptions = {
        sampleRate: 24000,
        channels: 1,
        inboundSampleRate: 24000,
        preBufferMs: 150,
    };

    private readonly outboundQueue: OutboundQueueEntry[] = [];
    private isPreBuffering = true;
    private preBufferTimer: NodeJS.Timeout | null = null;
    private pacingTimer: NodeJS.Timeout | null = null;
    private isPacing = false;

    constructor(private readonly port: MediaWorkerPort) {}

    /**
     * Dispatches an incoming command from the main thread.
     */
    public async HandleCommand(command: MediaWorkerCommand): Promise<void> {
        return this.internalHandleCommand(command);
    }

    /** @deprecated Use {@link HandleCommand} instead. */
    public async handleCommand(command: MediaWorkerCommand): Promise<void> {
        return this.HandleCommand(command);
    }

    private async internalHandleCommand(command: MediaWorkerCommand): Promise<void> {
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
                case 'publishVideo':
                    this.client?.publishVideo(command.frame);
                    break;
                case 'publishScreen':
                    this.client?.publishScreen(command.frame);
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
            if ('id' in command && typeof command.id === 'string') {
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
        this.options = { ...options, preBufferMs: options.preBufferMs ?? 150 };

        this.client = new LiveKitRtcNodeRoomClient(
            this.options.sampleRate,
            this.options.inboundSampleRate,
            this.options.channels,
            DefaultRtcNodeLoader
        );

        // Forward inbound subscribed audio to main thread with transferable ArrayBuffers
        this.client.onAudioFrame((frame) => {
            const frameData = frame.data;
            let buffer: ArrayBuffer;
            if (frameData instanceof ArrayBuffer) {
                buffer = frameData;
            } else {
                const copy = new Uint8Array(frameData.byteLength);
                copy.set(frameData);
                buffer = copy.buffer;
            }

            this.port.postMessage(
                {
                    type: 'audioFrame',
                    frame: {
                        data: buffer,
                        participantIdentity: frame.participantIdentity,
                        name: frame.name,
                        timestampMs: frame.timestampMs,
                    },
                },
                [buffer]
            );
        });

        // Forward room roster events
        this.client.onParticipantConnected((participant) => {
            this.port.postMessage({ type: 'participantConnected', participant });
        });

        this.client.onParticipantDisconnected((participantIdentity) => {
            this.port.postMessage({ type: 'participantDisconnected', participantIdentity });
        });

        this.client.onDisconnected(() => {
            this.cleanupTimers();
            this.port.postMessage({ type: 'disconnected' });
        });

        const result = await this.client.connect(args);
        this.port.postMessage({ type: 'connected', id, result });
    }

    /**
     * Handles inbound audio from main thread with pre-buffering and pacing.
     */
    private handlePublishAudio(pcm: ArrayBuffer): void {
        this.outboundQueue.push({ pcm, enqueuedAt: Date.now() });

        if (this.isPreBuffering) {
            const targetPreBufferMs = this.options.preBufferMs ?? 150;
            const bytesPerMs = (this.options.sampleRate * this.options.channels * 2) / 1000;
            const targetBytes = targetPreBufferMs * bytesPerMs;

            const totalBytes = this.outboundQueue.reduce((acc, e) => acc + e.pcm.byteLength, 0);

            if (totalBytes >= targetBytes) {
                this.startPacing();
            } else if (!this.preBufferTimer) {
                // Failsafe timer: start draining after preBufferMs even if not enough bytes accumulated
                this.preBufferTimer = setTimeout(() => {
                    this.startPacing();
                }, targetPreBufferMs);
            }
        } else if (!this.isPacing) {
            this.startPacing();
        }
    }

    /** Transitions from pre-buffering to active steady pacing. */
    private startPacing(): void {
        if (this.preBufferTimer) {
            clearTimeout(this.preBufferTimer);
            this.preBufferTimer = null;
        }
        this.isPreBuffering = false;
        this.isPacing = true;
        this.scheduleNextDrain();
    }

    /** Paces frames into the native audio source. */
    private scheduleNextDrain(): void {
        if (!this.isPacing) return;

        if (this.outboundQueue.length === 0) {
            // Buffer empty — enter pre-buffering mode for the next burst
            this.isPacing = false;
            this.isPreBuffering = true;
            return;
        }

        const entry = this.outboundQueue.shift();
        if (entry && this.client) {
            this.client.publishAudio(entry.pcm);
        }

        // 20ms real-time frame pacing
        this.pacingTimer = setTimeout(() => {
            this.scheduleNextDrain();
        }, 20);
    }

    /**
     * Instant barge-in flush: drops all queued frames, cancels timers,
     * and clears the native audio source queue.
     */
    private handleFlushOutbound(): void {
        this.cleanupTimers();
        this.outboundQueue.length = 0;
        this.isPreBuffering = true;
        this.isPacing = false;
        this.client?.flushOutbound();
    }

    private async handlePublishData(id: string, text: string): Promise<void> {
        if (this.client) {
            await this.client.publishData(text);
        }
        this.port.postMessage({ type: 'commandSuccess', id });
    }

    private async handleDisconnect(id: string): Promise<void> {
        this.cleanupTimers();
        this.outboundQueue.length = 0;
        this.isPacing = false;
        this.isPreBuffering = true;
        if (this.client) {
            await this.client.disconnect();
            this.client = null;
        }
        this.port.postMessage({ type: 'commandSuccess', id });
    }

    private handleGetTelemetry(id: string): void {
        if (this.client) {
            const snapshot = this.client.GetTelemetry();
            this.port.postMessage({ type: 'telemetry', id, snapshot });
        } else {
            this.port.postMessage({
                type: 'telemetry',
                id,
                snapshot: {
                    inboundGaps: {},
                    outbound: { captureCount: 0, underrunCount: 0 },
                },
            });
        }
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
 * Initializes and runs the media worker loop on the given port.
 */
export function RunMediaWorker(port: MediaWorkerPort): MediaWorkerSession {
    const session = new MediaWorkerSession(port);
    port.on('message', (command: MediaWorkerCommand) => {
        void session.HandleCommand(command);
    });
    port.postMessage({ type: 'ready' });
    return session;
}

// Auto-run when executed inside an actual Node.js worker_threads.Worker
if (!isMainThread && parentPort) {
    RunMediaWorker(parentPort as unknown as MediaWorkerPort);
}
