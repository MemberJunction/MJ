/**
 * @fileoverview Main-thread {@link NativeRoomClient} that delegates all WebRTC media-plane
 * operations to an isolated {@link IMediaWorker} worker thread.
 *
 * Provides:
 * - Zero-copy transferable ArrayBuffer frame passing for inbound & outbound PCM audio.
 * - 150ms outbound jitter pre-buffering and smooth real-time pacing off the main event loop.
 * - Instant barge-in queue flush across the worker boundary.
 * - Automatic worker thread crash recovery & transparent session reconnection.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { LogError, LogStatus } from '@memberjunction/core';
import type {
    NativeConnectArgs,
    NativeConnectResult,
    NativeRoomAudioFrame,
    NativeRoomClient,
    NativeRoomParticipant,
} from '@memberjunction/ai-bridge-livekit';
import type { RoomAudioTelemetrySnapshot } from './livekit-rtc-node-room';
import type {
    IMediaWorker,
    MediaWorkerClientOptions,
    MediaWorkerCommand,
    MediaWorkerEvent,
} from './media-worker-types';

/** Options for configuring {@link LiveKitWorkerRoomClient}. */
export interface LiveKitWorkerRoomClientOptions extends MediaWorkerClientOptions {
    /** Optional factory for injecting custom or mock media workers (e.g. for testing). */
    workerFactory?: () => IMediaWorker;
    /** Max reconnection attempts if the worker crashes (default: 3). */
    maxRestartAttempts?: number;
}

/** Resolves the default media worker entry script path. */
function resolveDefaultWorkerPath(): string {
    const workerUrl = new URL('./media-worker-entry.js', import.meta.url);
    const urlPath = fileURLToPath(workerUrl);
    if (existsSync(urlPath)) {
        return urlPath;
    }
    // Fallback if running from src/ directly (e.g. vitest/dev)
    const distPath = path.resolve(path.dirname(urlPath), '../dist/media-worker-entry.js');
    if (existsSync(distPath)) {
        return distPath;
    }
    return urlPath;
}

/**
 * Production implementation of {@link NativeRoomClient} that runs media processing
 * in a dedicated `worker_threads.Worker` thread.
 */
export class LiveKitWorkerRoomClient implements NativeRoomClient {
    private worker: IMediaWorker | null = null;
    private readonly workerFactory: () => IMediaWorker;
    private readonly options: MediaWorkerClientOptions;
    private readonly maxRestartAttempts: number;

    private storedConnectArgs: NativeConnectArgs | null = null;
    private isConnected = false;
    private isIntentionallyDisconnected = false;
    private restartCount = 0;

    // Roster and pending callbacks
    private readonly participants = new Map<string, NativeRoomParticipant>();
    private audioFrameCallback?: (frame: NativeRoomAudioFrame) => void;
    private participantConnectedCallback?: (participant: NativeRoomParticipant) => void;
    private participantDisconnectedCallback?: (participantIdentity: string) => void;
    private dataCallback?: (text: string, senderIdentity: string) => void;
    private disconnectedCallback?: (reason?: string) => void;

    // Command response correlation
    private nextCommandId = 1;
    private readonly pendingCommands = new Map<string, {
        resolve: (val: unknown) => void;
        reject: (err: Error) => void;
    }>();

    private lastTelemetrySnapshot: RoomAudioTelemetrySnapshot = {
        inboundGaps: {},
        outbound: { captureCount: 0, underrunCount: 0 },
    };

    constructor(options?: Partial<LiveKitWorkerRoomClientOptions>) {
        this.options = {
            sampleRate: options?.sampleRate ?? 24000,
            channels: options?.channels ?? 1,
            inboundSampleRate: options?.inboundSampleRate ?? 24000,
            preBufferMs: options?.preBufferMs ?? 150,
        };
        this.maxRestartAttempts = options?.maxRestartAttempts ?? 3;
        this.workerFactory = options?.workerFactory ?? (() => {
            const workerPath = resolveDefaultWorkerPath();
            return new Worker(workerPath) as unknown as IMediaWorker;
        });

        this.spawnWorker();
    }

    /** Spawns a new worker thread instance and binds event handlers. */
    private spawnWorker(): void {
        try {
            this.worker = this.workerFactory();
            this.worker.on('message', (msg: MediaWorkerEvent) => this.handleWorkerMessage(msg));
            this.worker.on('error', (err: Error) => this.handleWorkerError(err));
            this.worker.on('exit', (code: number) => this.handleWorkerExit(code));
        } catch (err) {
            LogError(`[LiveKitWorkerRoomClient] Failed to spawn media worker: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Handles incoming message events from the worker thread. */
    private handleWorkerMessage(msg: MediaWorkerEvent): void {
        switch (msg.type) {
            case 'ready':
                // Worker initialized
                break;
            case 'connected': {
                const pending = this.pendingCommands.get(msg.id);
                if (pending) {
                    this.pendingCommands.delete(msg.id);
                    this.isConnected = true;
                    this.restartCount = 0;
                    pending.resolve(msg.result);
                }
                break;
            }
            case 'commandSuccess': {
                const pending = this.pendingCommands.get(msg.id);
                if (pending) {
                    this.pendingCommands.delete(msg.id);
                    pending.resolve(undefined);
                }
                break;
            }
            case 'commandError': {
                const pending = this.pendingCommands.get(msg.id);
                if (pending) {
                    this.pendingCommands.delete(msg.id);
                    pending.reject(new Error(msg.error));
                }
                break;
            }
            case 'audioFrame':
                this.audioFrameCallback?.(msg.frame);
                break;
            case 'participantConnected':
                this.participants.set(msg.participant.identity, msg.participant);
                this.participantConnectedCallback?.(msg.participant);
                break;
            case 'participantDisconnected':
                this.participants.delete(msg.participantIdentity);
                this.participantDisconnectedCallback?.(msg.participantIdentity);
                break;
            case 'data':
                this.dataCallback?.(msg.text, msg.senderIdentity);
                break;
            case 'disconnected':
                this.isConnected = false;
                this.disconnectedCallback?.(msg.reason);
                break;
            case 'telemetry': {
                this.lastTelemetrySnapshot = msg.snapshot;
                const pending = this.pendingCommands.get(msg.id);
                if (pending) {
                    this.pendingCommands.delete(msg.id);
                    pending.resolve(msg.snapshot);
                }
                break;
            }
            case 'workerError':
                LogError(`[LiveKitWorkerRoomClient] Worker internal error: ${msg.error}`);
                break;
        }
    }

    /** Handles worker thread error event. */
    private handleWorkerError(err: Error): void {
        LogError(`[LiveKitWorkerRoomClient] Worker error event: ${err.message}`);
    }

    /** Handles unexpected worker exit with automatic crash recovery. */
    private handleWorkerExit(code: number): void {
        if (this.isIntentionallyDisconnected) {
            return;
        }

        LogError(`[LiveKitWorkerRoomClient] Media worker exited unexpectedly with code ${code}.`);

        // Fail any pending in-flight commands
        for (const [id, pending] of this.pendingCommands) {
            pending.reject(new Error(`Worker exited with code ${code}`));
            this.pendingCommands.delete(id);
        }

        if (this.isConnected && this.storedConnectArgs && this.restartCount < this.maxRestartAttempts) {
            this.restartCount++;
            LogStatus(`[LiveKitWorkerRoomClient] Initiating automatic worker restart (attempt ${this.restartCount}/${this.maxRestartAttempts})...`);

            this.spawnWorker();

            const cmdId = String(this.nextCommandId++);
            this.worker?.postMessage({
                type: 'connect',
                id: cmdId,
                args: this.storedConnectArgs,
                options: this.options,
            });

            // Handle reconnection asynchronously in background
            this.pendingCommands.set(cmdId, {
                resolve: () => {
                    LogStatus(`[LiveKitWorkerRoomClient] Worker successfully restarted and reconnected to room '${this.storedConnectArgs?.name}'.`);
                },
                reject: (err) => {
                    LogError(`[LiveKitWorkerRoomClient] Worker restart reconnection failed: ${err.message}`);
                },
            });
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NativeRoomClient implementation
    // ──────────────────────────────────────────────────────────────────────────

    /** Connects the worker to the LiveKit room. */
    public async connect(args: NativeConnectArgs): Promise<NativeConnectResult> {
        this.storedConnectArgs = { ...args };
        this.isIntentionallyDisconnected = false;

        if (!this.worker) {
            this.spawnWorker();
        }

        const cmdId = String(this.nextCommandId++);
        return new Promise<NativeConnectResult>((resolve, reject) => {
            this.pendingCommands.set(cmdId, {
                resolve: (res) => resolve(res as NativeConnectResult),
                reject,
            });
            this.worker?.postMessage({
                type: 'connect',
                id: cmdId,
                args,
                options: this.options,
            });
        });
    }

    /** Disconnects from the room and terminates the worker. */
    public async disconnect(): Promise<void> {
        this.isIntentionallyDisconnected = true;
        this.isConnected = false;

        if (this.worker) {
            const cmdId = String(this.nextCommandId++);
            try {
                await new Promise<void>((resolve, reject) => {
                    this.pendingCommands.set(cmdId, {
                        resolve: () => resolve(),
                        reject,
                    });
                    this.worker?.postMessage({ type: 'disconnect', id: cmdId });
                });
            } catch {
                // Ignore disconnect errors during shutdown
            } finally {
                await this.worker.terminate().catch(() => 0);
                this.worker = null;
            }
        }
    }

    /**
     * Publishes one raw PCM audio frame with zero-copy ArrayBuffer transfer.
     */
    public publishAudio(pcm: ArrayBuffer): void {
        if (!this.worker || !this.isConnected) {
            return;
        }
        // Transfer the ArrayBuffer across worker boundary with zero-copy
        this.worker.postMessage({ type: 'publishAudio', pcm }, [pcm]);
    }

    /**
     * Drops all queued outbound audio immediately across the worker thread boundary.
     */
    public flushOutbound(): void {
        if (!this.worker || !this.isConnected) {
            return;
        }
        this.worker.postMessage({ type: 'flushOutbound' });
    }

    public publishVideo(frame: ArrayBuffer): void {
        this.worker?.postMessage({ type: 'publishVideo', frame }, [frame]);
    }

    public publishScreen(frame: ArrayBuffer): void {
        this.worker?.postMessage({ type: 'publishScreen', frame }, [frame]);
    }

    public onAudioFrame(cb: (frame: NativeRoomAudioFrame) => void): void {
        this.audioFrameCallback = cb;
    }

    public onParticipantConnected(cb: (participant: NativeRoomParticipant) => void): void {
        this.participantConnectedCallback = cb;
    }

    public onParticipantDisconnected(cb: (participantIdentity: string) => void): void {
        this.participantDisconnectedCallback = cb;
    }

    public async getParticipants(): Promise<NativeRoomParticipant[]> {
        return Array.from(this.participants.values());
    }

    public async publishData(text: string): Promise<void> {
        if (!this.worker || !this.isConnected) {
            return;
        }
        const cmdId = String(this.nextCommandId++);
        return new Promise<void>((resolve, reject) => {
            this.pendingCommands.set(cmdId, {
                resolve: () => resolve(),
                reject,
            });
            this.worker?.postMessage({ type: 'publishData', id: cmdId, text });
        });
    }

    public OnData(cb: (text: string, senderIdentity: string) => void): void {
        this.dataCallback = cb;
    }

    /** @deprecated Use {@link OnData} instead. */
    public onData(cb: (text: string, senderIdentity: string) => void): void {
        this.OnData(cb);
    }

    public onDisconnected(cb: (reason?: string) => void): void {
        this.disconnectedCallback = cb;
    }

    /** Returns current room audio telemetry snapshot. */
    public GetTelemetry(): RoomAudioTelemetrySnapshot {
        if (this.worker && this.isConnected) {
            const cmdId = String(this.nextCommandId++);
            this.worker.postMessage({ type: 'getTelemetry', id: cmdId });
        }
        return this.lastTelemetrySnapshot;
    }
}
