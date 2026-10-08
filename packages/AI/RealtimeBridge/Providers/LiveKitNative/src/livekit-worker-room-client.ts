/**
 * @fileoverview Main-thread {@link NativeRoomClient} that delegates all WebRTC media-plane
 * operations to an isolated {@link IMediaWorker} worker thread.
 *
 * Provides:
 * - Zero-copy transferable ArrayBuffer frame passing for inbound & outbound PCM audio, and for the sampled JPEG frames
 *   of participant video (read and encoded inside the worker when the agent watches the meeting).
 * - Outbound jitter pre-buffering and duration-based pacing off the main event loop (in the worker).
 * - Instant barge-in queue flush across the worker boundary.
 * - Fallback to the in-process client when the worker cannot be started or joined.
 * - Bounded, backed-off worker crash recovery that ends in a raised disconnect, never a zombie session.
 *
 * ## Opt-in
 * Experimental and OFF by default; enabled with `MJ_LIVEKIT_WORKER_MEDIA=on` (see README, "Worker media plane").
 *
 * ## Rejoin and token TTL
 * A restarted worker re-joins the room with the SAME access token the session originally connected with
 * (the `NativeRoomClient` contract has no token-refresh callback). LiveKit validates `exp` at join time,
 * so a rejoin with an old token can be rejected. We therefore only attempt a rejoin while the token is
 * younger than {@link LiveKitWorkerRoomClientOptions.maxRejoinTokenAgeMs} (default 10 minutes, measured
 * from the original `connect()`); past that, we raise the disconnected callback instead of rejoining with a
 * likely-expired token, so the bridge can tear down and re-establish with a fresh one.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    VideoSourceIdOf,
    type NativeConnectArgs,
    type NativeConnectResult,
    type NativeRoomAudioFrame,
    type NativeRoomParticipant,
    type NativeRoomVideoFrame,
    type NativeRoomVideoSourceEnd,
} from '@memberjunction/ai-bridge-livekit';
import { ReadEventLoop, type RoomAudioTelemetrySnapshot, type TelemetryRoomClient } from './room-telemetry';
import type {
    IMediaWorker,
    MediaWorkerClientOptions,
    MediaWorkerEvent,
} from './media-worker-types';

/** Options for configuring {@link LiveKitWorkerRoomClient}. */
export interface LiveKitWorkerRoomClientOptions extends MediaWorkerClientOptions {
    /** Optional factory for injecting custom or mock media workers (e.g. for testing). */
    workerFactory?: () => IMediaWorker;
    /** Builds the in-process client used when the worker cannot be started or joined. No fallback when omitted. */
    fallbackFactory?: () => TelemetryRoomClient;
    /** Max consecutive restart attempts if the worker crashes (default: 3). */
    maxRestartAttempts?: number;
    /** First restart delay in ms; doubles per attempt (default: 250). */
    restartBackoffBaseMs?: number;
    /** Upper bound for the restart delay in ms (default: 5000). */
    restartBackoffMaxMs?: number;
    /** The restart counter only resets after the worker has stayed connected this long (default: 60000). */
    healthyResetMs?: number;
    /** Reject (and fall back) if the worker has not joined the room within this many ms (default: 20000). */
    connectTimeoutMs?: number;
    /** Max wait for a graceful worker disconnect before terminating it (default: 5000). */
    disconnectTimeoutMs?: number;
    /** Do not rejoin with a join token older than this many ms (default: 600000). See file header. */
    maxRejoinTokenAgeMs?: number;
    /** Interval (ms) of the background telemetry refresh while connected (default: 1000; 0 disables). */
    telemetryPollMs?: number;
}

/** Resolves the default media worker bootstrap script path. */
function resolveDefaultWorkerPath(): string {
    const workerUrl = new URL('./media-worker-bootstrap.js', import.meta.url);
    const urlPath = fileURLToPath(workerUrl);
    if (existsSync(urlPath)) {
        return urlPath;
    }
    // Fallback if running from src/ directly (e.g. vitest/dev)
    const distPath = path.resolve(path.dirname(urlPath), '../dist/media-worker-bootstrap.js');
    if (existsSync(distPath)) {
        return distPath;
    }
    return urlPath;
}

/** A worker-infrastructure failure (spawn, crash, timeout) as opposed to a LiveKit-level join error. */
class WorkerInfraError extends Error {}

/** An error the worker reported for a command (e.g. the LiveKit join was rejected). */
class WorkerReportedError extends Error {}

/** A request awaiting its correlated response, discriminated by the response it expects. */
type PendingRequest = { reject: (err: Error) => void; timer?: NodeJS.Timeout } & (
    | { kind: 'connect'; resolve: (result: NativeConnectResult) => void }
    | { kind: 'ack'; resolve: () => void }
    | { kind: 'telemetry'; resolve: (snapshot: RoomAudioTelemetrySnapshot) => void }
);

/**
 * Production implementation of {@link NativeRoomClient} that runs media processing
 * in a dedicated `worker_threads.Worker` thread.
 */
export class LiveKitWorkerRoomClient implements TelemetryRoomClient {
    private worker: IMediaWorker | null = null;
    private readonly workerFactory: () => IMediaWorker;
    private readonly fallbackFactory?: () => TelemetryRoomClient;
    private readonly options: MediaWorkerClientOptions;
    private readonly maxRestartAttempts: number;
    private readonly restartBackoffBaseMs: number;
    private readonly restartBackoffMaxMs: number;
    private readonly healthyResetMs: number;
    private readonly connectTimeoutMs: number;
    private readonly disconnectTimeoutMs: number;
    private readonly maxRejoinTokenAgeMs: number;
    private readonly telemetryPollMs: number;

    private storedConnectArgs: NativeConnectArgs | null = null;
    private tokenIssuedAtMs = 0;
    private isConnected = false;
    /** True once the first join succeeded — from then on a worker exit means crash recovery, not a failed connect. */
    private hasJoined = false;
    private isIntentionallyDisconnected = false;
    private isReconnecting = false;
    private disconnectRaised = false;
    private restartCount = 0;
    private restartTimer: NodeJS.Timeout | null = null;
    private healthyTimer: NodeJS.Timeout | null = null;
    private telemetryTimer: NodeJS.Timeout | null = null;
    /** In-process client taking over after a worker start/join failure. */
    private fallback: TelemetryRoomClient | null = null;

    // Roster and callbacks
    private participants = new Map<string, NativeRoomParticipant>();
    /** Roster as of the worker crash, diffed against the first post-rejoin snapshot. */
    private rosterBeforeRestart: Map<string, NativeRoomParticipant> | null = null;
    private audioFrameCallback?: (frame: NativeRoomAudioFrame) => void;
    private videoFrameCallback?: (frame: NativeRoomVideoFrame) => void;
    private videoSourceEndedCallback?: (source: NativeRoomVideoSourceEnd) => void;
    /**
     * The cameras and screens the worker sent frames of and has not reported ended, keyed by source id. When the worker
     * crashes they are reported ended, so the model is told it can no longer see them; the restarted worker picks again.
     */
    private readonly videoSourcesInFlight = new Map<string, NativeRoomVideoSourceEnd>();
    private participantConnectedCallback?: (participant: NativeRoomParticipant) => void;
    private participantDisconnectedCallback?: (participantIdentity: string) => void;
    private disconnectedCallback?: (reason?: string) => void;

    // Request/response correlation
    private nextCommandId = 1;
    private readonly pending = new Map<string, PendingRequest>();

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
            video: options?.video,
        };
        this.maxRestartAttempts = options?.maxRestartAttempts ?? 3;
        this.restartBackoffBaseMs = options?.restartBackoffBaseMs ?? 250;
        this.restartBackoffMaxMs = options?.restartBackoffMaxMs ?? 5000;
        this.healthyResetMs = options?.healthyResetMs ?? 60_000;
        this.connectTimeoutMs = options?.connectTimeoutMs ?? 20_000;
        this.disconnectTimeoutMs = options?.disconnectTimeoutMs ?? 5_000;
        this.maxRejoinTokenAgeMs = options?.maxRejoinTokenAgeMs ?? 600_000;
        this.telemetryPollMs = options?.telemetryPollMs ?? 1000;
        this.fallbackFactory = options?.fallbackFactory;
        this.workerFactory = options?.workerFactory ?? (() => new Worker(resolveDefaultWorkerPath()));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Worker lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    /** Spawns a worker and binds its handlers. Throws if the factory throws. */
    private spawnWorker(): IMediaWorker {
        const worker = this.workerFactory();
        this.worker = worker;
        worker.on('message', (msg: MediaWorkerEvent) => {
            if (this.worker === worker) {
                this.handleWorkerMessage(msg);
            }
        });
        worker.on('error', (err: Error) => this.handleWorkerError(worker, err));
        worker.on('exit', (code: number) => this.handleWorkerExit(worker, code));
        return worker;
    }

    /** Allocates a correlation id and registers `entry` (with an optional timeout) in the pending table. */
    private register(entry: PendingRequest, timeoutMs?: number): string {
        const id = String(this.nextCommandId++);
        if (timeoutMs !== undefined) {
            entry.timer = setTimeout(() => {
                this.take(id)?.reject(new WorkerInfraError(`media worker request ${id} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            entry.timer.unref?.();
        }
        this.pending.set(id, entry);
        return id;
    }

    /** Removes and returns a pending request, cancelling its timeout. */
    private take(id: string): PendingRequest | undefined {
        const entry = this.pending.get(id);
        if (entry) {
            this.pending.delete(id);
            if (entry.timer) {
                clearTimeout(entry.timer);
            }
        }
        return entry;
    }

    private rejectAllPending(err: Error): void {
        for (const id of Array.from(this.pending.keys())) {
            this.take(id)?.reject(err);
        }
    }

    /** Sends `connect` to a freshly spawned worker and resolves when it has joined (bounded by a timeout). */
    private joinViaWorker(args: NativeConnectArgs): Promise<NativeConnectResult> {
        const worker = this.spawnWorker();
        return new Promise<NativeConnectResult>((resolve, reject) => {
            const id = this.register({ kind: 'connect', resolve, reject }, this.connectTimeoutMs);
            worker.postMessage({ type: 'connect', id, args, options: this.options });
        });
    }

    private handleWorkerMessage(msg: MediaWorkerEvent): void {
        switch (msg.type) {
            case 'ready':
                break;
            case 'connected': {
                const req = this.take(msg.id);
                if (req?.kind === 'connect') {
                    this.isConnected = true;
                    req.resolve(msg.result);
                }
                break;
            }
            case 'commandSuccess': {
                const req = this.take(msg.id);
                if (req?.kind === 'ack') {
                    req.resolve();
                }
                break;
            }
            case 'commandError':
                this.take(msg.id)?.reject(new WorkerReportedError(msg.error));
                break;
            case 'audioFrame':
                this.audioFrameCallback?.(msg.frame);
                break;
            case 'videoFrame':
                this.trackVideoSource(msg.frame);
                this.videoFrameCallback?.(msg.frame);
                break;
            case 'videoSourceEnded':
                this.videoSourcesInFlight.delete(VideoSourceIdOf(msg.source.participantIdentity, msg.source.source));
                this.videoSourceEndedCallback?.(msg.source);
                break;
            case 'participantConnected':
                this.participants.set(msg.participant.identity, msg.participant);
                this.participantConnectedCallback?.(msg.participant);
                break;
            case 'participantDisconnected':
                this.participants.delete(msg.participantIdentity);
                this.participantDisconnectedCallback?.(msg.participantIdentity);
                break;
            case 'rosterSnapshot':
                this.applyRosterSnapshot(msg.participants);
                break;
            case 'disconnected':
                this.isConnected = false;
                this.raiseDisconnected(msg.reason ?? 'room disconnected');
                break;
            case 'telemetry': {
                const snapshot = this.withMainThreadLoop(msg.snapshot);
                this.lastTelemetrySnapshot = snapshot;
                const req = this.take(msg.id);
                if (req?.kind === 'telemetry') {
                    req.resolve(snapshot);
                }
                break;
            }
            case 'workerError':
                LogError(`[LiveKitWorkerRoomClient] Worker internal error: ${msg.error}`);
                break;
        }
    }

    /** Seeds the roster from the worker's snapshot; after a rejoin, emits diff callbacks vs. the pre-crash roster. */
    private applyRosterSnapshot(snapshot: NativeRoomParticipant[]): void {
        const next = new Map(snapshot.map((p) => [p.identity, p] as const));
        const before = this.rosterBeforeRestart;
        this.rosterBeforeRestart = null;
        this.participants = next;
        if (before) {
            for (const identity of before.keys()) {
                if (!next.has(identity)) {
                    this.participantDisconnectedCallback?.(identity);
                }
            }
            for (const [identity, participant] of next) {
                if (!before.has(identity)) {
                    this.participantConnectedCallback?.(participant);
                }
            }
        }
    }

    private handleWorkerError(worker: IMediaWorker, err: Error): void {
        if (this.worker !== worker) {
            return;
        }
        LogError(`[LiveKitWorkerRoomClient] Worker error event: ${err.message}`);
        // An 'error' before the room is joined means the worker is unusable: fail the pending connect fast
        // (the exit event that follows is then a no-op for connect purposes).
        for (const [id, req] of this.pending) {
            if (req.kind === 'connect') {
                this.take(id)?.reject(new WorkerInfraError(`media worker error before join: ${err.message}`));
            }
        }
    }

    /** Handles worker exit: marks the client disconnected at once, then restarts (bounded) or gives up loudly. */
    private handleWorkerExit(worker: IMediaWorker, code: number): void {
        if (this.worker !== worker) {
            return; // a stale worker we already replaced/terminated
        }
        this.worker = null;
        this.isConnected = false;
        this.stopTelemetryPolling();
        this.clearHealthyTimer();
        this.rejectAllPending(new WorkerInfraError(`media worker exited with code ${code}`));

        if (this.isIntentionallyDisconnected || this.fallback || !this.hasJoined) {
            return; // clean shutdown, or a failed initial connect that connect() already handles
        }
        this.reportVideoSourcesEnded();
        if (this.isReconnecting) {
            return; // the in-flight reconnect attempt observes the rejection above and reschedules
        }
        LogError(`[LiveKitWorkerRoomClient] Media worker exited unexpectedly with code ${code}.`);
        this.rosterBeforeRestart = new Map(this.participants);
        this.participants = new Map();
        this.scheduleRestart(`worker exited with code ${code}`);
    }

    /** Remembers a source the worker is sending frames of, until it reports the source ended. */
    private trackVideoSource(frame: NativeRoomVideoFrame): void {
        this.videoSourcesInFlight.set(VideoSourceIdOf(frame.participantIdentity, frame.source), {
            participantIdentity: frame.participantIdentity,
            name: frame.name,
            source: frame.source,
        });
    }

    /** The worker died: every source it was sending frames of has stopped, so report each as ended. */
    private reportVideoSourcesEnded(): void {
        const sources = [...this.videoSourcesInFlight.values()];
        this.videoSourcesInFlight.clear();
        for (const source of sources) {
            try {
                this.videoSourceEndedCallback?.(source);
            } catch (err) {
                LogError(`[LiveKitWorkerRoomClient] the video-source-ended handler threw: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /** Schedules the next restart attempt with exponential backoff, or raises a disconnect when exhausted. */
    private scheduleRestart(reason: string): void {
        if (this.isIntentionallyDisconnected || this.restartTimer) {
            return;
        }
        if (this.restartCount >= this.maxRestartAttempts) {
            this.raiseDisconnected(`media worker restart attempts exhausted (${this.maxRestartAttempts}); last failure: ${reason}`);
            return;
        }
        const tokenAgeMs = Date.now() - this.tokenIssuedAtMs;
        if (tokenAgeMs > this.maxRejoinTokenAgeMs) {
            this.raiseDisconnected(
                `media worker failed (${reason}) and the join token is ${Math.round(tokenAgeMs / 1000)}s old ` +
                    `(> ${Math.round(this.maxRejoinTokenAgeMs / 1000)}s); not rejoining with a likely-expired token`
            );
            return;
        }
        this.restartCount++;
        const delayMs = Math.min(this.restartBackoffBaseMs * 2 ** (this.restartCount - 1), this.restartBackoffMaxMs);
        LogStatus(`[LiveKitWorkerRoomClient] Restarting media worker in ${delayMs}ms (attempt ${this.restartCount}/${this.maxRestartAttempts}): ${reason}`);
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            void this.restartWorker();
        }, delayMs);
        this.restartTimer.unref?.();
    }

    /** Spawns a replacement worker and rejoins the room with the stored arguments. */
    private async restartWorker(): Promise<void> {
        const args = this.storedConnectArgs;
        if (!args || this.isIntentionallyDisconnected) {
            return;
        }
        this.isReconnecting = true;
        try {
            await this.joinViaWorker(args);
            LogStatus(`[LiveKitWorkerRoomClient] Worker restarted and rejoined room '${args.name}'.`);
            this.startTelemetryPolling();
            // The counter is NOT reset here: a worker that connects and then crashes again must keep burning
            // attempts. It only resets after a sustained healthy period.
            this.armHealthyTimer();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`[LiveKitWorkerRoomClient] Worker restart failed: ${message}`);
            await this.terminateWorker();
            this.isReconnecting = false;
            if (err instanceof WorkerReportedError) {
                // The server/addon rejected the rejoin (e.g. expired token): retrying cannot succeed.
                this.raiseDisconnected(`rejoin rejected: ${message}`);
                return;
            }
            this.scheduleRestart(message);
            return;
        }
        this.isReconnecting = false;
    }

    private armHealthyTimer(): void {
        this.clearHealthyTimer();
        this.healthyTimer = setTimeout(() => {
            this.healthyTimer = null;
            this.restartCount = 0;
        }, this.healthyResetMs);
        this.healthyTimer.unref?.();
    }

    private clearHealthyTimer(): void {
        if (this.healthyTimer) {
            clearTimeout(this.healthyTimer);
            this.healthyTimer = null;
        }
    }

    /** Raises the disconnected callback at most once per session so the bridge tears the session down. */
    private raiseDisconnected(reason: string): void {
        if (this.disconnectRaised || this.isIntentionallyDisconnected) {
            return;
        }
        this.disconnectRaised = true;
        this.isConnected = false;
        LogError(`[LiveKitWorkerRoomClient] Raising disconnect: ${reason}`);
        this.disconnectedCallback?.(reason);
    }

    /** Terminates the current worker (best-effort) and detaches it so its late events are ignored. */
    private async terminateWorker(): Promise<void> {
        const worker = this.worker;
        this.worker = null;
        // handleWorkerExit ignores the exit of a detached worker, so settle its requests here.
        this.rejectAllPending(new WorkerInfraError('worker terminated'));
        if (worker) {
            try {
                await worker.terminate();
            } catch (err) {
                LogError(`[LiveKitWorkerRoomClient] worker terminate failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NativeRoomClient implementation
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Connects the worker to the LiveKit room. Never hangs: spawn failure, early worker death, or the
     * connect timeout falls back to the in-process client (when a fallback factory is configured) and
     * logs once; LiveKit-level join errors are rethrown as-is.
     */
    public async connect(args: NativeConnectArgs): Promise<NativeConnectResult> {
        this.storedConnectArgs = { ...args };
        this.tokenIssuedAtMs = Date.now();
        this.isIntentionallyDisconnected = false;
        this.disconnectRaised = false;
        this.restartCount = 0;

        try {
            const result = await this.joinViaWorker(args);
            this.hasJoined = true;
            this.startTelemetryPolling();
            this.armHealthyTimer();
            return result;
        } catch (err) {
            await this.terminateWorker();
            const message = err instanceof Error ? err.message : String(err);
            // Anything except a worker-reported join error (bad token, addon missing, ...) is worker
            // infrastructure: spawn failure, early crash, timeout. A join error would fail in-process too.
            if (this.fallbackFactory && !(err instanceof WorkerReportedError)) {
                LogError(`[LiveKitWorkerRoomClient] Media worker unavailable (${message}); falling back to in-process media plane.`);
                return this.activateFallback(args);
            }
            throw err;
        }
    }

    /** Switches this client over to the in-process room client and connects it. */
    private async activateFallback(args: NativeConnectArgs): Promise<NativeConnectResult> {
        const fallback = this.fallbackFactory!();
        this.fallback = fallback;
        if (this.audioFrameCallback) fallback.onAudioFrame(this.audioFrameCallback);
        if (this.videoFrameCallback) fallback.onVideoFrame?.(this.videoFrameCallback);
        if (this.videoSourceEndedCallback) fallback.onVideoSourceEnded?.(this.videoSourceEndedCallback);
        if (this.participantConnectedCallback) fallback.onParticipantConnected(this.participantConnectedCallback);
        if (this.participantDisconnectedCallback) fallback.onParticipantDisconnected(this.participantDisconnectedCallback);
        if (this.disconnectedCallback) {
            const cb = this.disconnectedCallback;
            fallback.onDisconnected((reason) => cb(reason ?? 'room disconnected'));
        }
        return fallback.connect(args);
    }

    /** Disconnects from the room and terminates the worker (never waits longer than the disconnect timeout). */
    public async disconnect(): Promise<void> {
        this.isIntentionallyDisconnected = true;
        this.isConnected = false;
        this.stopTelemetryPolling();
        this.clearHealthyTimer();
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        if (this.fallback) {
            const fallback = this.fallback;
            this.fallback = null;
            await fallback.disconnect();
            return;
        }
        const worker = this.worker;
        if (!worker) {
            return;
        }
        try {
            await new Promise<void>((resolve, reject) => {
                const id = this.register({ kind: 'ack', resolve, reject }, this.disconnectTimeoutMs);
                worker.postMessage({ type: 'disconnect', id });
            });
        } catch (err) {
            LogError(`[LiveKitWorkerRoomClient] graceful worker disconnect failed (${err instanceof Error ? err.message : String(err)}); terminating.`);
        } finally {
            await this.terminateWorker();
        }
    }

    /** Publishes one raw PCM audio frame with zero-copy ArrayBuffer transfer. */
    public publishAudio(pcm: ArrayBuffer): void {
        if (this.fallback) {
            this.fallback.publishAudio(pcm);
            return;
        }
        if (!this.worker || !this.isConnected) {
            return;
        }
        this.worker.postMessage({ type: 'publishAudio', pcm }, [pcm]);
    }

    /** Drops all queued outbound audio immediately across the worker thread boundary. */
    public flushOutbound(): void {
        if (this.fallback) {
            this.fallback.flushOutbound();
            return;
        }
        if (!this.worker || !this.isConnected) {
            return;
        }
        this.worker.postMessage({ type: 'flushOutbound' });
    }

    public publishVideo(frame: ArrayBuffer): void {
        if (this.fallback) {
            this.fallback.publishVideo(frame);
            return;
        }
        this.worker?.postMessage({ type: 'publishVideo', frame }, [frame]);
    }

    public publishScreen(frame: ArrayBuffer): void {
        if (this.fallback) {
            this.fallback.publishScreen(frame);
            return;
        }
        this.worker?.postMessage({ type: 'publishScreen', frame }, [frame]);
    }

    public onAudioFrame(cb: (frame: NativeRoomAudioFrame) => void): void {
        this.audioFrameCallback = cb;
        this.fallback?.onAudioFrame(cb);
    }

    /** Registers the inbound video handler (frames the worker sampled and encoded, or the fallback client's). */
    public onVideoFrame(cb: (frame: NativeRoomVideoFrame) => void): void {
        this.videoFrameCallback = cb;
        this.fallback?.onVideoFrame?.(cb);
    }

    /** Registers the handler for a camera or screen that stopped being read after sending frames. */
    public onVideoSourceEnded(cb: (source: NativeRoomVideoSourceEnd) => void): void {
        this.videoSourceEndedCallback = cb;
        this.fallback?.onVideoSourceEnded?.(cb);
    }

    public onParticipantConnected(cb: (participant: NativeRoomParticipant) => void): void {
        this.participantConnectedCallback = cb;
        this.fallback?.onParticipantConnected(cb);
    }

    public onParticipantDisconnected(cb: (participantIdentity: string) => void): void {
        this.participantDisconnectedCallback = cb;
        this.fallback?.onParticipantDisconnected(cb);
    }

    public async getParticipants(): Promise<NativeRoomParticipant[]> {
        if (this.fallback) {
            return this.fallback.getParticipants();
        }
        return Array.from(this.participants.values());
    }

    public async publishData(text: string): Promise<void> {
        if (this.fallback) {
            return this.fallback.publishData(text);
        }
        const worker = this.worker;
        if (!worker || !this.isConnected) {
            return;
        }
        return new Promise<void>((resolve, reject) => {
            const id = this.register({ kind: 'ack', resolve, reject }, this.disconnectTimeoutMs);
            worker.postMessage({ type: 'publishData', id, text });
        });
    }

    /**
     * Registers the room-disconnected callback. Raised on server-side room close AND when the media
     * worker cannot be recovered (restarts exhausted, rejoin rejected, token too old), with a reason string.
     */
    public onDisconnected(cb: (reason?: string) => void): void {
        this.disconnectedCallback = cb;
        this.fallback?.onDisconnected((reason) => cb(reason ?? 'room disconnected'));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Telemetry
    // ──────────────────────────────────────────────────────────────────────────

    /** Returns the most recent telemetry snapshot (refreshed in the background; see {@link RefreshTelemetry}). */
    public GetTelemetry(): RoomAudioTelemetrySnapshot {
        if (this.fallback) {
            return this.fallback.GetTelemetry();
        }
        return this.withMainThreadLoop(this.lastTelemetrySnapshot);
    }

    /** Requests a fresh snapshot from the worker (request/response) and resolves with it. */
    public async RefreshTelemetry(): Promise<RoomAudioTelemetrySnapshot> {
        if (this.fallback) {
            return this.fallback.GetTelemetry();
        }
        const worker = this.worker;
        if (!worker || !this.isConnected) {
            return this.GetTelemetry();
        }
        return new Promise<RoomAudioTelemetrySnapshot>((resolve, reject) => {
            const id = this.register({ kind: 'telemetry', resolve, reject }, this.disconnectTimeoutMs);
            worker.postMessage({ type: 'getTelemetry', id });
        });
    }

    /** Stamps the main-thread event-loop p99 onto a worker-produced snapshot (both are reported, labelled). */
    private withMainThreadLoop(snapshot: RoomAudioTelemetrySnapshot): RoomAudioTelemetrySnapshot {
        const loop = ReadEventLoop();
        return {
            ...snapshot,
            mainEventLoopDelayP99Ms: loop?.P99Ms,
            workerEventLoopDelayP99Ms: snapshot.workerEventLoopDelayP99Ms ?? snapshot.eventLoopDelayP99Ms,
        };
    }

    private startTelemetryPolling(): void {
        if (this.telemetryPollMs <= 0 || this.telemetryTimer) {
            return;
        }
        this.telemetryTimer = setInterval(() => {
            this.RefreshTelemetry().catch((err: unknown) => {
                // Telemetry is best-effort: a missed poll (worker restarting) just leaves the last snapshot in place.
                LogStatus(`[LiveKitWorkerRoomClient] telemetry poll skipped: ${err instanceof Error ? err.message : String(err)}`);
            });
        }, this.telemetryPollMs);
        this.telemetryTimer.unref?.();
    }

    private stopTelemetryPolling(): void {
        if (this.telemetryTimer) {
            clearInterval(this.telemetryTimer);
            this.telemetryTimer = null;
        }
    }
}
