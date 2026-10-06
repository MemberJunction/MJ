import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { RealtimeSessionService } from '../lib/services/realtime-session.service';

/**
 * Client-side liveness pulse (#3533).
 *
 * In the client-direct topology the audio goes browser → provider over WebRTC, so the server
 * stops seeing activity while the conversation is still going: `LastActiveAt` freezes ~45s in and
 * `SessionJanitor` force-closes a LIVE session at `closeThresholdMinutes`. The browser is the only
 * participant that knows the call is alive, so it has to say so.
 *
 * These drive the private timer surface directly with fake timers — the pulse is a `setInterval`
 * over a GraphQL mutation, and both halves matter: that it fires while a session is running, and
 * that it STOPS, since a beat racing teardown would re-stamp a session we are deliberately ending.
 */

/** The private surface under test — no `any`, just the members the suite drives. */
interface LivenessInternals {
  agentSessionId: string | null;
  startLivenessPulse(): void;
  stopLivenessPulse(): void;
}

function internals(service: RealtimeSessionService): LivenessInternals {
  return service as unknown as LivenessInternals;
}

describe('RealtimeSessionService — server-side liveness pulse (#3533)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({ AgentSessionHeartbeat: true }));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    internals(service).agentSessionId = 'session-1';
  });

  afterEach(() => {
    internals(service).stopLivenessPulse();
    vi.useRealTimers();
  });

  /** Advances past N pulse intervals and lets the queued microtasks settle. */
  async function advancePulses(count: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(count * 60000);
  }

  it('heartbeats the running session on the pulse interval', async () => {
    internals(service).startLivenessPulse();

    await advancePulses(3);

    expect(executeGQL).toHaveBeenCalledTimes(3);
    const [mutation, variables] = executeGQL.mock.calls[0];
    expect(mutation).toContain('AgentSessionHeartbeat');
    expect(variables).toEqual({ agentSessionId: 'session-1' });
  });

  it('does not beat before the first interval elapses', async () => {
    internals(service).startLivenessPulse();

    await vi.advanceTimersByTimeAsync(59000);

    expect(executeGQL).not.toHaveBeenCalled();
  });

  /**
   * The teardown half. A pulse that outlived the session would re-stamp `LastActiveAt` on a row we
   * just closed, leaving an Idle session the janitor then has to age out all over again.
   */
  it('stops beating once the pulse is stopped', async () => {
    internals(service).startLivenessPulse();
    await advancePulses(1);
    expect(executeGQL).toHaveBeenCalledTimes(1);

    internals(service).stopLivenessPulse();
    await advancePulses(5);

    expect(executeGQL).toHaveBeenCalledTimes(1);
  });

  /**
   * The session id is read at FIRE time rather than captured at start time, so a beat that fires
   * during teardown finds `null` and does nothing instead of resurrecting a closed session.
   */
  it('skips a beat when the session id has already been cleared', async () => {
    internals(service).startLivenessPulse();
    internals(service).agentSessionId = null;

    await advancePulses(2);

    expect(executeGQL).not.toHaveBeenCalled();
  });

  /**
   * Best-effort by design: the threshold is many beats wide, so a transient failure must not
   * surface to the user or end the call. Turning a network blip into a visible error would be a
   * worse failure than the one this fixes.
   */
  it('survives a failing beat and keeps pulsing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    executeGQL.mockRejectedValueOnce(new Error('transient network failure'));

    internals(service).startLivenessPulse();
    await advancePulses(3);

    expect(executeGQL).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is idempotent — starting twice leaves exactly one timer running', async () => {
    internals(service).startLivenessPulse();
    internals(service).startLivenessPulse();

    await advancePulses(2);

    expect(executeGQL).toHaveBeenCalledTimes(2);
  });

  /** Stopping a pulse that never started must not throw — teardown runs on failed starts too. */
  it('tolerates a stop with no pulse running', () => {
    expect(() => internals(service).stopLivenessPulse()).not.toThrow();
  });
});
