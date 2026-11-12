import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the MJAPI event-loop stall monitor (MJ #5510). What matters: a stall longer than the
 * threshold produces exactly the operator signal the issue asks for — one warning carrying the lag,
 * the heap, and the work that was in flight — and /healthcheck reports the lag instead of a static
 * "ok". These tests block the real event loop, because a mocked clock cannot stall anything.
 */

const { logWarningMock } = vi.hoisted(() => ({
  logWarningMock: vi.fn(),
}));

vi.mock('@memberjunction/core', () => ({
  LogWarning: logWarningMock,
}));

import { EventLoopStallMonitor, BuildHealthcheckPayload } from '../eventLoopStallMonitor.js';

/** Synchronously blocks the event loop, exactly like the synthetic repro in the issue. */
function blockEventLoop(ms: number): void {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy-wait
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('EventLoopStallMonitor', () => {
  let monitor: EventLoopStallMonitor | null = null;

  beforeEach(() => {
    logWarningMock.mockReset();
  });

  afterEach(() => {
    monitor?.Stop();
    monitor = null;
  });

  it('logs one warning with the lag, the heap and the in-flight work when the loop stalls', async () => {
    monitor = new EventLoopStallMonitor({
      SampleIntervalMs: 100,
      WarnThresholdMs: 200,
      GetInFlightWork: () => ['Agent run 11111111-1111-1111-1111-111111111111', 'Scheduled job 22222222-2222-2222-2222-222222222222'],
    });
    monitor.Start();

    blockEventLoop(700);
    await sleep(250);

    expect(logWarningMock).toHaveBeenCalledTimes(1);
    const [message, category] = logWarningMock.mock.calls[0] as [string, string];
    expect(category).toBe('EventLoop');
    const lag = Number(/blocked for (\d+)ms/.exec(message)?.[1]);
    expect(lag).toBeGreaterThanOrEqual(400);
    expect(message).toMatch(/heap \d+MB/);
    expect(message).toContain('Agent run 11111111-1111-1111-1111-111111111111');
    expect(message).toContain('Scheduled job 22222222-2222-2222-2222-222222222222');
  });

  it('says so when nothing was in flight, rather than naming no suspect at all', async () => {
    monitor = new EventLoopStallMonitor({ SampleIntervalMs: 100, WarnThresholdMs: 200, GetInFlightWork: () => [] });
    monitor.Start();

    blockEventLoop(500);
    await sleep(250);

    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(logWarningMock.mock.calls[0][0]).toContain('no agent runs or scheduled jobs in flight');
  });

  it('stays silent while the loop is healthy', async () => {
    monitor = new EventLoopStallMonitor({ SampleIntervalMs: 100, WarnThresholdMs: 1000, GetInFlightWork: () => [] });
    monitor.Start();

    await sleep(450);

    expect(logWarningMock).not.toHaveBeenCalled();
    const snapshot = monitor.GetSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.EventLoopLagMs).toBeLessThan(1000);
  });

  it('exposes the stall in the snapshot of the window it landed in', async () => {
    // The snapshot is the last COMPLETED window, so read it before the next (healthy) window closes.
    monitor = new EventLoopStallMonitor({ SampleIntervalMs: 300, WarnThresholdMs: 200, GetInFlightWork: () => [] });
    monitor.Start();

    blockEventLoop(900);
    await sleep(50);

    const snapshot = monitor.GetSnapshot();
    expect(snapshot!.EventLoopLagMs).toBeGreaterThanOrEqual(600);
    expect(snapshot!.HeapUsedMb).toBeGreaterThan(0);
  });

  it('still warns when listing the in-flight work throws', async () => {
    monitor = new EventLoopStallMonitor({
      SampleIntervalMs: 100,
      WarnThresholdMs: 200,
      GetInFlightWork: () => {
        throw new Error('engine not initialised');
      },
    });
    monitor.Start();

    blockEventLoop(500);
    await sleep(250);

    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(logWarningMock.mock.calls[0][0]).toContain('in-flight work unavailable');
  });

  it('reports nothing before Start and stops sampling after Stop', async () => {
    monitor = new EventLoopStallMonitor({ SampleIntervalMs: 100, WarnThresholdMs: 200, GetInFlightWork: () => [] });
    expect(monitor.GetSnapshot()).toBeNull();

    monitor.Start();
    monitor.Stop();

    blockEventLoop(500);
    await sleep(250);

    expect(logWarningMock).not.toHaveBeenCalled();
  });
});

describe('BuildHealthcheckPayload', () => {
  it('adds the event-loop lag to the status once the monitor has a sample', () => {
    const payload = BuildHealthcheckPayload({ EventLoopLagMs: 1234, HeapUsedMb: 512, SampledAt: new Date() });
    expect(payload).toEqual({ status: 'ok', eventLoopLagMs: 1234 });
  });

  it('never exposes the heap size, because /healthcheck is unauthenticated', () => {
    const payload = BuildHealthcheckPayload({ EventLoopLagMs: 1234, HeapUsedMb: 512, SampledAt: new Date() });
    expect(payload).not.toHaveProperty('heapUsedMb');
  });

  it('keeps the existing { status: "ok" } body when there is no sample yet', () => {
    expect(BuildHealthcheckPayload(null)).toEqual({ status: 'ok' });
  });
});
