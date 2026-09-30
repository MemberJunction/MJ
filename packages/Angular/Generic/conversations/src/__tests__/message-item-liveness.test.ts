// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MessageItemComponent,
  LIVENESS_CHECKING_MS,
  LIVENESS_STALLED_MS,
  LIVENESS_RECHECK_THROTTLE_MS,
  type MessageLivenessState,
} from '../lib/components/message/message-item.component';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';

/**
 * Tier 3 of MJ #4222: the elapsed timer must stop claiming everything is fine.
 *
 * Before this, a run whose completion was dropped showed a timer counting up forever with no
 * error — the UI asserted health it had no evidence for. The pill now degrades through
 * `checking` to `stalled` as silence grows, and asks the host to re-read durable state.
 *
 * The subtle property, and the one worth a test: `LastHeartbeatAt` is stamped on the DATABASE
 * clock and compared against the BROWSER clock. The raw difference carries whatever skew exists
 * between them, so it is bounded by how long this component has actually been watching — we can
 * never claim more silence than we have observed. A browser clock running fast therefore cannot
 * invent a stall.
 *
 * Built via `Object.create(prototype)` so the real `ngDoCheck` runs against stubbed collaborators,
 * matching `chat-area-reconcile.test.ts`.
 */

interface Harness {
  component: MessageItemComponent;
  open: Record<string, unknown>;
  emitted: string[];
}

/**
 * @param watchingForMs How long this component has been watching the in-flight run.
 * @param heartbeatAgeMs How stale the run's heartbeat is, on the server clock.
 */
function createHarness(opts: {
  status?: 'Complete' | 'In-Progress' | 'Error';
  runStatus?: string;
  watchingForMs?: number;
  heartbeatAgeMs?: number | null;
} = {}): Harness {
  const now = Date.now();
  const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
  const open = component as unknown as Record<string, unknown>;
  const emitted: string[] = [];

  open.message = { ID: 'MSG-1', Status: opts.status ?? 'In-Progress', Role: 'AI' };
  open.AgentRun =
    opts.heartbeatAgeMs === null
      ? { ID: 'RUN-1', Status: opts.runStatus ?? 'Running' }
      : {
          ID: 'RUN-1',
          Status: opts.runStatus ?? 'Running',
          LastHeartbeatAt: new Date(now - (opts.heartbeatAgeMs ?? 0)),
        };

  open._previousMessageStatus = opts.status ?? 'In-Progress';
  open._livenessWatchStart = now - (opts.watchingForMs ?? LIVENESS_STALLED_MS * 2);
  open._lastLivenessRequestAt = 0;
  open._elapsedTimeInterval = 1; // pretend the timer is already running
  open._stableLivenessState = 'live';

  // Collaborators ngDoCheck touches, stubbed to no-ops.
  open.cdRef = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  open.buildMessageClasses = vi.fn(() => 'message-item');
  open.computeDisplayMessage = vi.fn(() => '');
  open.startElapsedTimeUpdater = vi.fn();
  // `updateTimers` is exercised for real by the timer-tick suite, so leave it on the prototype
  // and stub only the formatting helpers it reaches for.
  open.formatElapsedTime = vi.fn(() => '0:00');
  open.formatDurationFromMs = vi.fn(() => '0:00');
  open.LivenessCheckRequested = { emit: (id: string) => emitted.push(id) };
  // `IsAIMessage` is a getter on the prototype chain; the harness pins it directly.
  Object.defineProperty(component, 'IsAIMessage', { value: true, configurable: true });

  return { component, open, emitted };
}

function stateAfterCheck(h: Harness): MessageLivenessState {
  h.component.ngDoCheck();
  return h.component.LivenessState;
}

describe('MessageItemComponent liveness state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports live while heartbeats are recent', () => {
    const h = createHarness({ heartbeatAgeMs: 5_000 });
    expect(stateAfterCheck(h)).toBe('live');
  });

  it('reports live right up to the checking threshold', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_CHECKING_MS - 1_000 });
    expect(stateAfterCheck(h)).toBe('live');
  });

  it('reports checking once three heartbeats have been missed', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_CHECKING_MS + 1_000 });
    expect(stateAfterCheck(h)).toBe('checking');
  });

  it('reports stalled at the point the server watchdog force-fails the run', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_STALLED_MS + 1_000 });
    expect(stateAfterCheck(h)).toBe('stalled');
  });

  it('never reports anything but live for a finished message', () => {
    const h = createHarness({
      status: 'Complete',
      runStatus: 'Completed',
      heartbeatAgeMs: LIVENESS_STALLED_MS * 10,
    });
    expect(stateAfterCheck(h)).toBe('live');
  });

  it('cannot claim more silence than it has been watching', () => {
    // The run's heartbeat looks ancient, but this component has only just started watching it —
    // the page was reloaded, or the user switched back to this conversation. Reporting a stall
    // here would be reporting the clock difference, not the run.
    const h = createHarness({ heartbeatAgeMs: LIVENESS_STALLED_MS * 5, watchingForMs: 2_000 });
    expect(stateAfterCheck(h)).toBe('live');
  });

  it('falls back to its own watch time when the run carries no heartbeat', () => {
    const h = createHarness({ heartbeatAgeMs: null, watchingForMs: LIVENESS_CHECKING_MS + 5_000 });
    expect(stateAfterCheck(h)).toBe('checking');
  });

  it('treats a heartbeat stamped in the future as fresh rather than negative', () => {
    const h = createHarness({ heartbeatAgeMs: -60_000 });
    expect(stateAfterCheck(h)).toBe('live');
  });

  it('restarts the watch clock while nothing is in flight', () => {
    const h = createHarness({ status: 'Complete', runStatus: 'Completed', watchingForMs: LIVENESS_STALLED_MS * 3 });
    const before = h.open._livenessWatchStart as number;

    h.component.ngDoCheck();

    expect(h.open._livenessWatchStart as number).toBeGreaterThan(before);
  });
});

describe('MessageItemComponent liveness re-check requests', () => {
  it('asks the host to reconcile when it stops trusting the display', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_CHECKING_MS + 1_000 });
    h.component.ngDoCheck();
    expect(h.emitted).toEqual(['MSG-1']);
  });

  it('stays silent while the run looks healthy', () => {
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    h.component.ngDoCheck();
    expect(h.emitted).toEqual([]);
  });

  it('asks once per window, not once per change-detection pass', () => {
    // ngDoCheck runs on every CD pass and the pill re-evaluates once a second; without the
    // throttle a single quiet message would drive a query per second.
    const h = createHarness({ heartbeatAgeMs: LIVENESS_STALLED_MS + 1_000 });
    for (let i = 0; i < 20; i++) {
      h.component.ngDoCheck();
    }
    expect(h.emitted).toEqual(['MSG-1']);
  });

  it('asks again once the window has passed', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_STALLED_MS + 1_000 });
    h.component.ngDoCheck();

    h.open._lastLivenessRequestAt = Date.now() - (LIVENESS_RECHECK_THROTTLE_MS + 1_000);
    h.component.ngDoCheck();

    expect(h.emitted).toEqual(['MSG-1', 'MSG-1']);
  });
});

describe('MessageItemComponent liveness on the timer tick', () => {
  /**
   * REGRESSION, found in manual testing and missed by every test above.
   *
   * The suite drove `ngDoCheck()` directly, so it asserted the computation and never the thing
   * that drives it. In a real browser `ngDoCheck` runs only when an ANCESTOR's change detection
   * reaches this node; the component's own one-second interval calls `updateTimers()` then
   * `cdRef.detectChanges()`, which re-renders the view WITHOUT re-invoking `ngDoCheck`.
   *
   * During a dead socket nothing triggers an ancestor pass, so the elapsed text kept ticking while
   * the liveness state stayed frozen at 'live' — the pill counted past three minutes of silence
   * still styled as healthy, which is exactly the behaviour Tier 3 exists to remove.
   *
   * Silence grows with the clock, so it must be recomputed on the clock.
   */
  const tick = (h: Harness): MessageLivenessState => {
    (h.open.updateTimers as () => void).call(h.component);
    return h.component.LivenessState;
  };

  it('degrades on a timer tick with no change-detection pass at all', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_CHECKING_MS + 1_000 });
    expect(h.component.LivenessState).toBe('live'); // nothing has run yet

    expect(tick(h)).toBe('checking');
  });

  it('reaches stalled on a timer tick', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_STALLED_MS + 1_000 });
    expect(tick(h)).toBe('stalled');
  });

  it('stays live on a timer tick while heartbeats are recent', () => {
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    expect(tick(h)).toBe('live');
  });

  it('asks the host to reconcile from the timer path too', () => {
    const h = createHarness({ heartbeatAgeMs: LIVENESS_CHECKING_MS + 1_000 });
    tick(h);
    expect(h.emitted).toEqual(['MSG-1']);
  });

  it('does not degrade a finished message on a tick', () => {
    const h = createHarness({ status: 'Complete', runStatus: 'Completed', heartbeatAgeMs: LIVENESS_STALLED_MS * 3 });
    expect(tick(h)).toBe('live');
  });
});

describe('MessageItemComponent elapsed timer re-arming', () => {
  it('starts the timer for a message that becomes in-progress after view init', () => {
    // The latent bug this fixes: startElapsedTimeUpdater was only ever called from
    // ngAfterViewInit, so a row rendered before its agent started never got an interval.
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    h.open._elapsedTimeInterval = null;

    h.component.ngDoCheck();

    expect(h.open.startElapsedTimeUpdater).toHaveBeenCalledTimes(1);
  });

  it('does not start a second timer when one is already running', () => {
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    h.open._elapsedTimeInterval = 42;

    h.component.ngDoCheck();

    expect(h.open.startElapsedTimeUpdater).not.toHaveBeenCalled();
  });

  it('does not start a timer for a finished message', () => {
    const h = createHarness({ status: 'Complete', runStatus: 'Completed' });
    h.open._elapsedTimeInterval = null;

    h.component.ngDoCheck();

    expect(h.open.startElapsedTimeUpdater).not.toHaveBeenCalled();
  });
});

describe('MessageItemComponent liveness on a healthy long run', () => {
  /**
   * REGRESSION: every run longer than 90s showed "checking" on a healthy connection.
   *
   * Progress frames carry the server's in-memory run entity, which is saved only at creation and
   * at the end. The watchdog stamps `LastHeartbeatAt` with a direct SQL update that never reaches
   * that object. So on the healthy path the run's timestamps stay at the start time, and silence
   * measured from them grows with the run itself.
   *
   * The browser's own record of when it last heard from the run is the signal that moves.
   */
  let lastHeard: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    lastHeard = vi.spyOn(ConversationsRuntime.Instance.Streaming, 'LastHeardFromRun');
  });

  afterEach(() => {
    lastHeard.mockRestore();
    vi.useRealTimers();
  });

  it('stays live while frames for the run keep arriving, though the run object never updates', () => {
    const h = createHarness({ heartbeatAgeMs: 100_000, watchingForMs: 100_000 });
    lastHeard.mockReturnValue(Date.now() - 5_000);

    expect(stateAfterCheck(h)).toBe('live');
    expect(lastHeard).toHaveBeenCalledWith('RUN-1');
  });

  it('reports checking once nothing has been heard for the run in any channel', () => {
    const h = createHarness({ heartbeatAgeMs: 100_000, watchingForMs: 100_000 });
    lastHeard.mockReturnValue(Date.now() - (LIVENESS_CHECKING_MS + 5_000));

    expect(stateAfterCheck(h)).toBe('checking');
  });
});

describe('MessageItemComponent liveness for a row with no agent run', () => {
  /**
   * A row written by a host's own turn handler has no MJ agent run, so there is no run to look
   * up. It went "checking" and then "no response" on elapsed time alone, even while the host was
   * reporting its progress. Frames that name the row itself count as signs of life.
   */
  let lastHeardForMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    lastHeardForMessage = vi.spyOn(ConversationsRuntime.Instance.Streaming, 'LastHeardForMessage');
  });

  afterEach(() => {
    lastHeardForMessage.mockRestore();
    vi.useRealTimers();
  });

  function noRunHarness(): Harness {
    const h = createHarness({ watchingForMs: 100_000 });
    h.open.AgentRun = null;
    return h;
  }

  it('stays live while frames that name the row keep arriving', () => {
    const h = noRunHarness();
    lastHeardForMessage.mockReturnValue(Date.now() - 5_000);

    expect(stateAfterCheck(h)).toBe('live');
    expect(lastHeardForMessage).toHaveBeenCalledWith('MSG-1');
  });

  it('still degrades when nothing has named the row for a while', () => {
    const h = noRunHarness();
    lastHeardForMessage.mockReturnValue(undefined);

    expect(stateAfterCheck(h)).toBe('checking');
  });
});

describe('MessageItemComponent elapsed timer shutdown', () => {
  /**
   * REGRESSION: the one-second timer kept forcing change detection after the message finished.
   *
   * It was cleared only on the change to `Complete`. A message that ended in `Error` never cleared
   * it, and on `Complete` the same pass re-armed it whenever the run object still read `Running`,
   * which is the normal order because the message reloads before its run.
   *
   * These run the real interval under fake timers and count the forced view updates.
   */
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Replace the harness stub with the real timer and arm it the way a live row does. */
  function armRealTimer(h: Harness): void {
    delete h.open.startElapsedTimeUpdater;
    h.open._elapsedTimeInterval = null;
    h.open._loadTime = Date.now();
    h.component.ngDoCheck();
  }

  /** How many forced view updates the timer makes over the next `ms`. */
  function viewUpdatesOver(h: Harness, ms: number): number {
    const detectChanges = (h.open.cdRef as { detectChanges: ReturnType<typeof vi.fn> }).detectChanges;
    detectChanges.mockClear();
    vi.advanceTimersByTime(ms);
    return detectChanges.mock.calls.length;
  }

  function setRunStatus(h: Harness, status: string): void {
    h.open.AgentRun = { ...(h.open.AgentRun as Record<string, unknown>), Status: status };
  }

  it('ticks once a second while the message is in progress', () => {
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    armRealTimer(h);

    expect(viewUpdatesOver(h, 3_000)).toBe(3);
  });

  it('stops when the message ends in Error', () => {
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    armRealTimer(h);

    (h.open.message as Record<string, unknown>).Status = 'Error';
    setRunStatus(h, 'Failed');
    h.component.ngDoCheck();

    expect(viewUpdatesOver(h, 5_000)).toBe(0);
  });

  it('stops once a completed message reloads its run as finished', () => {
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    armRealTimer(h);

    // The message reloads first, while the run object still reads Running.
    (h.open.message as Record<string, unknown>).Status = 'Complete';
    h.component.ngDoCheck();
    // Then the run reloads.
    setRunStatus(h, 'Completed');
    h.component.ngDoCheck();

    expect(viewUpdatesOver(h, 5_000)).toBe(0);
  });

  it('stops on its own tick when nothing is in flight, with no change-detection pass', () => {
    const h = createHarness({ heartbeatAgeMs: 1_000 });
    armRealTimer(h);

    (h.open.message as Record<string, unknown>).Status = 'Error';
    setRunStatus(h, 'Failed');
    vi.advanceTimersByTime(1_000); // the first tick sees the finished state

    expect(viewUpdatesOver(h, 5_000)).toBe(0);
  });
});
