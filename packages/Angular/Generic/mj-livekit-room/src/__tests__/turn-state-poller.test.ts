import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveKitRoomTurnState, LiveKitRoomTurnStateResult } from '@memberjunction/graphql-dataprovider';
import { TurnStatePoller, TURN_POLL_MIN_INTERVAL_MS } from '../lib/turn-state-poller';

function stateWith(holder: string | null): LiveKitRoomTurnState {
  return {
    RoomId: 'room',
    AgentSessionIds: ['A1'],
    FacilitatorAgentSessionId: null,
    FloorHolderAgentSessionId: holder,
    FloorHeldSinceMs: null,
    HumanSpeaking: false,
    PendingHandoffToAgentSessionId: null,
    ConsecutiveAgentTurns: 0,
    MaxConsecutiveAgentTurns: 8,
    LoopCapReached: false,
    BackchannelCount: 0,
    RecentEvents: [],
    Agents: [],
  } as LiveKitRoomTurnState;
}

const ok = (holder: string | null): LiveKitRoomTurnStateResult => ({ Success: true, State: stateWith(holder) });

describe('TurnStatePoller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls straight away, then on the interval', async () => {
    const fetcher = vi.fn(async () => ok(null));
    const poller = new TurnStatePoller(fetcher, 1000);
    poller.Start('room-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('room-1');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    poller.Dispose();
  });

  it('publishes each new state', async () => {
    const results = [ok('A1'), ok(null)];
    const poller = new TurnStatePoller(async () => results.shift() ?? ok(null), 1000);
    const seen: Array<string | null | undefined> = [];
    poller.State$.subscribe(s => seen.push(s ? s.FloorHolderAgentSessionId : undefined));
    poller.Start('r');
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.slice(0, 3)).toEqual([undefined, 'A1', null]);
    poller.Dispose();
  });

  it('never piles requests onto a slow server', async () => {
    let release: (r: LiveKitRoomTurnStateResult) => void = () => undefined;
    const fetcher = vi.fn(() => new Promise<LiveKitRoomTurnStateResult>(resolve => (release = resolve)));
    const poller = new TurnStatePoller(fetcher, 1000);
    poller.Start('r');
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1); // the first is still in flight
    release(ok('A1'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
    poller.Dispose();
  });

  it('keeps the last good state through a failed poll and records the error', async () => {
    const results: LiveKitRoomTurnStateResult[] = [ok('A1'), { Success: false, ErrorMessage: 'boom', State: null }];
    const poller = new TurnStatePoller(async () => results.shift() ?? ok('A1'), 1000);
    poller.Start('r');
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.State?.FloorHolderAgentSessionId).toBe('A1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.State?.FloorHolderAgentSessionId).toBe('A1');
    expect(poller.LastError).toBe('boom');
    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.LastError).toBeNull();
    poller.Dispose();
  });

  it('turns a thrown fetcher into a recorded error instead of breaking the poll loop', async () => {
    let calls = 0;
    const poller = new TurnStatePoller(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('network down');
      }
      return ok('A1');
    }, 1000);
    poller.Start('r');
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.LastError).toBe('network down');
    await vi.advanceTimersByTimeAsync(1000);
    expect(poller.State?.FloorHolderAgentSessionId).toBe('A1');
    poller.Dispose();
  });

  it('is idempotent for the same room and restarts clean for another', async () => {
    const fetcher = vi.fn(async () => ok('A1'));
    const poller = new TurnStatePoller(fetcher, 1000);
    poller.Start('r1');
    poller.Start('r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    poller.Start('r2');
    expect(poller.State).toBeNull(); // the previous room's state is gone
    expect(poller.RoomName).toBe('r2');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenLastCalledWith('r2');
    poller.Dispose();
  });

  it('stops for good: no more requests, and a late reply cannot bring the state back', async () => {
    let release: (r: LiveKitRoomTurnStateResult) => void = () => undefined;
    const fetcher = vi.fn(() => new Promise<LiveKitRoomTurnStateResult>(resolve => (release = resolve)));
    const poller = new TurnStatePoller(fetcher, 1000);
    poller.Start('r');
    await vi.advanceTimersByTimeAsync(0);
    poller.Stop();
    release(ok('A1'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(poller.State).toBeNull();
    expect(poller.IsRunning).toBe(false);
    poller.Stop(); // safe twice
  });

  it('clamps a tiny interval and survives a nonsense one', async () => {
    const fetcher = vi.fn(async () => ok(null));
    const tiny = new TurnStatePoller(fetcher, 5);
    tiny.Start('r');
    await vi.advanceTimersByTimeAsync(TURN_POLL_MIN_INTERVAL_MS);
    expect(fetcher).toHaveBeenCalledTimes(2); // immediately, then one clamped interval later
    tiny.Dispose();

    fetcher.mockClear();
    const nonsense = new TurnStatePoller(fetcher, Number.NaN);
    nonsense.Start('r');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2); // falls back to the default interval
    nonsense.Dispose();
  });
});
