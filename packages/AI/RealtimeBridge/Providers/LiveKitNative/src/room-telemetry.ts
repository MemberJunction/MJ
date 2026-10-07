/**
 * @fileoverview Audio-plane telemetry shared by the in-process {@link LiveKitRtcNodeRoomClient} and the
 * worker-thread media plane: inbound inter-frame gap histograms, outbound capture/underrun counters, and
 * the per-thread event-loop delay monitor.
 *
 * Kept free of any room/worker imports so both sides can depend on it without an import cycle.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { NativeRoomClient } from '@memberjunction/ai-bridge-livekit';

/** Inbound inter-frame gap histogram per participant. */
export interface InboundFrameGapHistogram {
    /** Inter-frame gap < 10ms. */
    lt10ms: number;
    /** Inter-frame gap 10ms <= t < 20ms. */
    b10_20ms: number;
    /** Inter-frame gap 20ms <= t < 30ms. */
    b20_30ms: number;
    /** Inter-frame gap 30ms <= t < 50ms. */
    b30_50ms: number;
    /** Inter-frame gap 50ms <= t < 100ms. */
    b50_100ms: number;
    /** Inter-frame gap >= 100ms. */
    gte100ms: number;
    /** Total frames measured. */
    totalFrames: number;
    /** Timestamp of the last frame received in ms (`performance.now()`). */
    lastFrameMs?: number;
}

/** Outbound audio telemetry stats. */
export interface OutboundAudioTelemetry {
    /** Total frames captured and sent to the audio source. */
    captureCount: number;
    /** Number of buffer underruns detected (when audio queue starved while actively speaking). */
    underrunCount: number;
    /** Last observed queuedDuration from AudioSource (in ms or seconds, depending on driver). */
    lastQueuedDuration?: number;
}

/** Telemetry snapshot for the room client. */
export interface RoomAudioTelemetrySnapshot {
    /** Inbound inter-frame gap histogram per participant identity. */
    inboundGaps: Record<string, InboundFrameGapHistogram>;
    /** Outbound telemetry. */
    outbound: OutboundAudioTelemetry;
    /**
     * Event-loop delay p99 (ms) of the thread that hosts the native room client: the main thread for the
     * in-process client, the media worker thread inside a worker session. Prefer the two explicit fields
     * below when reading a worker-backed client's snapshot.
     */
    eventLoopDelayP99Ms?: number;
    /** Elapsed window duration in ms over which {@link eventLoopDelayP99Ms} was sampled. */
    eventLoopWindowMs?: number;
    /** Main-thread (MJAPI) event-loop delay p99 in ms. Populated by the worker-backed client. */
    mainEventLoopDelayP99Ms?: number;
    /** Media-worker-thread event-loop delay p99 in ms. Populated by the worker-backed client. */
    workerEventLoopDelayP99Ms?: number;
    /** Audio (ms) waiting in the worker's pacing queue when the snapshot was taken. */
    pacerQueuedMs?: number;
}

/** A {@link NativeRoomClient} that can also report audio telemetry. */
export type TelemetryRoomClient = Omit<NativeRoomClient, 'onDisconnected'> & {
    /** Registers the room-disconnected callback; `reason` is the LiveKit disconnect reason when known. */
    onDisconnected(cb: (reason?: string) => void): void;
    /** Returns the current audio telemetry snapshot. */
    GetTelemetry(): RoomAudioTelemetrySnapshot;
};

/** One reading of this thread's event-loop delay monitor. */
export interface EventLoopReading {
    /** p99 delay in ms. */
    P99Ms: number;
    /** Window (ms) the histogram has covered since its last reset. */
    WindowMs: number;
}

/** Lazily initialized per-thread event-loop monitor (shared across connections to prevent leaks). */
let moduleEventLoopMonitor: IntervalHistogram | null = null;
let monitorWindowStartedAt = Date.now();
let monitorResetTimer: NodeJS.Timeout | null = null;

/** Returns this thread's shared event-loop delay monitor, creating it on first use (best-effort). */
export function GetModuleEventLoopMonitor(): IntervalHistogram | null {
    if (!moduleEventLoopMonitor) {
        try {
            moduleEventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
            moduleEventLoopMonitor.enable();
            monitorWindowStartedAt = Date.now();
            if (!monitorResetTimer) {
                // Reset the shared histogram on a fixed 30s owner timer so individual per-room
                // GetTelemetry() readers don't wipe it out under concurrent access.
                monitorResetTimer = setInterval(() => {
                    try {
                        moduleEventLoopMonitor?.reset();
                        monitorWindowStartedAt = Date.now();
                    } catch {
                        // Intentionally best-effort: a failed reset only widens the sampling window
                    }
                }, 30_000);
                monitorResetTimer.unref?.();
            }
        } catch {
            // Intentionally best-effort: environment may not support monitorEventLoopDelay
            moduleEventLoopMonitor = null;
        }
    }
    return moduleEventLoopMonitor;
}

/** Reads this thread's event-loop p99 (ms) and window, or `undefined` when the monitor is unavailable. */
export function ReadEventLoop(): EventLoopReading | undefined {
    const monitor = GetModuleEventLoopMonitor();
    if (!monitor) {
        return undefined;
    }
    try {
        return { P99Ms: monitor.percentile(99) / 1e6, WindowMs: Date.now() - monitorWindowStartedAt };
    } catch {
        // Intentionally best-effort telemetry
        return undefined;
    }
}
