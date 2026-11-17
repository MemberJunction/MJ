/**
 * @fileoverview Event-loop stall detection for MJAPI (MJ #5510).
 *
 * MJAPI serves HTTP, the graphql-ws subscription server, scheduled jobs and agent runs from ONE
 * event loop. A synchronous phase of background work (a large `JSON.stringify`, prompt assembly, GC
 * under heap pressure) blocks every interactive request for its full duration, and until now nothing
 * recorded that it happened: `/healthcheck` returned a static `{status:'ok'}` and no log line was
 * written. This monitor turns each stall into one timestamped WARN naming the lag, the heap, and the
 * agent runs / scheduled jobs that were in flight, and exposes the latest window's lag to `/healthcheck`.
 *
 * It cannot report DURING a stall — nothing on a blocked loop can. It reports the moment the loop
 * drains, which is when the evidence (how long, how much heap, what was running) is still current.
 *
 * @module MJServer/eventLoopStallMonitor
 */

import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { LogWarning } from '@memberjunction/core';

/** Options for {@link EventLoopStallMonitor}. */
export interface EventLoopStallMonitorOptions {
  /** How often the lag window is read and reset. */
  SampleIntervalMs: number;
  /** A window whose max lag reaches this logs a warning. */
  WarnThresholdMs: number;
  /**
   * Labels for the background work running in this process when the stall was observed (agent
   * runs, scheduled jobs). Called only when a warning is about to be written, so it costs nothing
   * on a healthy loop. A throw is tolerated — the warning is still written.
   */
  GetInFlightWork: () => string[];
}

/** The most recent completed sampling window. */
export interface EventLoopSample {
  /** Worst event-loop delay observed in the window, in whole milliseconds. */
  EventLoopLagMs: number;
  /** `process.memoryUsage().heapUsed` at the end of the window, in whole megabytes. */
  HeapUsedMb: number;
  /** When the window closed. */
  SampledAt: Date;
}

/**
 * The `/healthcheck` response body. The lag field appears once the monitor has a sample. Keys keep
 * the endpoint's existing JSON casing (`status`), because platform probes and the Explorer poller read it.
 *
 * The heap size is deliberately NOT here: `/healthcheck` is unauthenticated, and a live heap reading
 * on a public endpoint helps someone tune a memory-pressure attack. It goes in the stall warning instead.
 */
export interface HealthcheckPayload {
  // case-violation-ok-legacy-back-compat: /healthcheck wire format
  status: 'ok';
  // case-violation-ok-legacy-back-compat: /healthcheck wire format
  eventLoopLagMs?: number;
}

const NANOS_PER_MS = 1e6;
const BYTES_PER_MB = 1024 * 1024;
/** Histogram resolution: fine enough to see sub-second lag, coarse enough to cost nothing. */
const HISTOGRAM_RESOLUTION_MS = 20;

/**
 * Samples event-loop delay on a fixed window and warns when a window's worst delay crosses the
 * threshold. Lag is the larger of two independent measures:
 *
 * - the `perf_hooks` histogram's max delay for the window, and
 * - how late this monitor's own sampling timer fired — a timer that should fire every
 *   `SampleIntervalMs` and fires 20s late was held off by a 20s stall.
 *
 * The second covers the case where the stall ends and this timer runs before the histogram has
 * recorded the delayed sample, so a stall is never pushed into the next window or missed.
 */
export class EventLoopStallMonitor {
  private readonly options: EventLoopStallMonitorOptions;
  private histogram: IntervalHistogram | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private lastSample: EventLoopSample | null = null;

  constructor(options: EventLoopStallMonitorOptions) {
    this.options = options;
  }

  /** Begin sampling. Idempotent. The timer is unref'd so it never holds the process open. */
  public Start(): void {
    if (this.timer) {
      return;
    }
    this.histogram = monitorEventLoopDelay({ resolution: HISTOGRAM_RESOLUTION_MS });
    this.histogram.enable();
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => this.sample(), this.options.SampleIntervalMs);
    this.timer.unref();
  }

  /** Stop sampling and release the histogram. Idempotent. */
  public Stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.histogram?.disable();
    this.histogram = null;
  }

  /** The most recent completed window, or `null` before the first window closes. */
  public GetSnapshot(): EventLoopSample | null {
    return this.lastSample;
  }

  private sample(): void {
    const now = Date.now();
    const timerLateByMs = Math.max(0, now - this.lastTickAt - this.options.SampleIntervalMs);
    this.lastTickAt = now;

    const histogramMaxMs = this.histogram ? this.histogram.max / NANOS_PER_MS : 0;
    this.histogram?.reset();

    this.lastSample = {
      EventLoopLagMs: Math.round(Math.max(histogramMaxMs, timerLateByMs)),
      HeapUsedMb: Math.round(process.memoryUsage().heapUsed / BYTES_PER_MB),
      SampledAt: new Date(now),
    };

    if (this.lastSample.EventLoopLagMs >= this.options.WarnThresholdMs) {
      LogWarning(this.describeStall(this.lastSample), 'EventLoop');
    }
  }

  private describeStall(sample: EventLoopSample): string {
    return (
      `MJAPI event loop was blocked for ${sample.EventLoopLagMs}ms ` +
      `(heap ${sample.HeapUsedMb}MB). Every HTTP request and WebSocket on this process waited ` +
      `for it. In flight: ${this.describeInFlightWork()}`
    );
  }

  private describeInFlightWork(): string {
    try {
      const work = this.options.GetInFlightWork();
      return work.length > 0 ? work.join(', ') : 'no agent runs or scheduled jobs in flight';
    } catch (error) {
      return `in-flight work unavailable (${error instanceof Error ? error.message : String(error)})`;
    }
  }
}

/**
 * Builds the `/healthcheck` body. With no sample (monitor disabled, or the first window has not
 * closed) it is exactly the body `/healthcheck` has always returned, so existing probes that match
 * on it keep working.
 */
export function BuildHealthcheckPayload(sample: EventLoopSample | null): HealthcheckPayload {
  if (!sample) {
    return { status: 'ok' };
  }
  return { status: 'ok', eventLoopLagMs: sample.EventLoopLagMs };
}
