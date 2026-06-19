import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { RealtimeClientUsage } from '@memberjunction/ai-realtime-client';
import { RealtimeSessionService, VoiceDelegationResult } from '../lib/services/realtime-session.service';

/**
 * The explicit delegation-CANCEL channel ({@link RealtimeSessionService.CancelDelegation} /
 * {@link RealtimeSessionService.CancelInFlightDelegations}) and the usage-telemetry relay
 * (`OnUsage` deltas → debounced `RelayRealtimeUsage` + teardown flush).
 *
 * Same narrow typed-seam approach as the sibling voice-session suites: a fake Provider whose
 * `ExecuteGQL` captures mutations, with private members reached through a typed internals cast.
 */

/** The private surface the tests drive — no `any`, just the members under test. */
interface RealtimeSessionCancelUsageInternals {
  agentSessionId: string | null;
  inFlightCallIds: Set<string>;
  cancelledCallIds: Set<string>;
  pendingUsageInput: number;
  pendingUsageOutput: number;
  usageFlushTimer: ReturnType<typeof setTimeout> | null;
  emitDelegationResult(callId: string, resultJson: string): void;
  onUsageDelta(usage: RealtimeClientUsage): void;
  flushPendingUsage(agentSessionId?: string | null): Promise<void>;
  teardown(closeServerSession: boolean): Promise<void>;
}

function internals(service: RealtimeSessionService): RealtimeSessionCancelUsageInternals {
  return service as unknown as RealtimeSessionCancelUsageInternals;
}

function collectResults(service: RealtimeSessionService): VoiceDelegationResult[] {
  const results: VoiceDelegationResult[] = [];
  service.DelegationResult$.subscribe(r => results.push(r));
  return results;
}

describe('RealtimeSessionService — CancelDelegation (per-card ✕, explicit user intent)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({ CancelRealtimeSessionTool: { AbortedCount: 1, Success: true } }));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    internals(service).agentSessionId = 'sess-1';
    internals(service).inFlightCallIds.add('call-1');
  });

  it('calls the CancelRealtimeSessionTool mutation with the session + call id, selecting the structured result', async () => {
    await service.CancelDelegation('call-1');

    expect(executeGQL).toHaveBeenCalledTimes(1);
    expect(executeGQL).toHaveBeenCalledWith(
      expect.stringContaining('CancelRealtimeSessionTool'),
      { agentSessionId: 'sess-1', callId: 'call-1' }
    );
    // The mutation document selects the structured result fields (server contract).
    const mutation = executeGQL.mock.calls[0][0] as string;
    expect(mutation).toContain('AbortedCount');
    expect(mutation).toContain('Success');
    expect(mutation).toContain('ErrorMessage');
  });

  it('flips the card to a FAILED "Cancelled by user" result when the server aborted the run', async () => {
    const results = collectResults(service);

    const ok = await service.CancelDelegation('call-1');

    expect(ok).toBe(true);
    expect(results).toEqual([{ CallID: 'call-1', Success: false, Output: 'Cancelled by user' }]);
    expect(internals(service).inFlightCallIds.has('call-1')).toBe(false);
  });

  it('suppresses the aborted run\'s LATE real result so it cannot overwrite the cancelled card', async () => {
    const results = collectResults(service);
    await service.CancelDelegation('call-1');

    // The original ExecuteRealtimeSessionTool mutation eventually resolves with the aborted outcome.
    internals(service).emitDelegationResult('call-1', JSON.stringify({ success: false, error: 'Delegation failed: aborted' }));

    expect(results).toHaveLength(1); // only the "Cancelled by user" card flip
    expect(internals(service).cancelledCallIds.size).toBe(0); // the suppression marker was consumed
  });

  it('a DIFFERENT call\'s result still emits normally after a cancel', async () => {
    const results = collectResults(service);
    internals(service).inFlightCallIds.add('call-2');
    await service.CancelDelegation('call-1');

    internals(service).emitDelegationResult('call-2', JSON.stringify({ success: true, output: 'done' }));

    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({ CallID: 'call-2', Success: true, Output: 'done' });
  });

  it('returns false WITHOUT flipping the card when the server had nothing to abort (result is racing in)', async () => {
    executeGQL.mockResolvedValue({ CancelRealtimeSessionTool: { AbortedCount: 0, Success: true } });
    const results = collectResults(service);

    const ok = await service.CancelDelegation('call-1');

    expect(ok).toBe(false);
    expect(results).toEqual([]);
    // The call stays tracked so the racing real result is processed normally.
    expect(internals(service).inFlightCallIds.has('call-1')).toBe(true);
  });

  it('treats a STRUCTURED failure (Success: false) as nothing aborted — card untouched', async () => {
    executeGQL.mockResolvedValue({
      CancelRealtimeSessionTool: { AbortedCount: 0, Success: false, ErrorMessage: 'registry exploded' },
    });
    const results = collectResults(service);

    const ok = await service.CancelDelegation('call-1');

    expect(ok).toBe(false);
    expect(results).toEqual([]);
    expect(internals(service).inFlightCallIds.has('call-1')).toBe(true);
  });

  it('is a no-op (no mutation) for a call id that is not tracked in flight', async () => {
    const ok = await service.CancelDelegation('call-unknown');
    expect(ok).toBe(false);
    expect(executeGQL).not.toHaveBeenCalled();
  });

  it('is a no-op (no mutation) when no session is open', async () => {
    internals(service).agentSessionId = null;
    const ok = await service.CancelDelegation('call-1');
    expect(ok).toBe(false);
    expect(executeGQL).not.toHaveBeenCalled();
  });

  it('tolerates a failed mutation (false, logged, card untouched)', async () => {
    executeGQL.mockRejectedValue(new Error('network down'));
    const results = collectResults(service);

    const ok = await service.CancelDelegation('call-1');

    expect(ok).toBe(false);
    expect(results).toEqual([]);
  });
});

describe('RealtimeSessionService — CancelInFlightDelegations (sweep cancel)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({ CancelRealtimeSessionTool: { AbortedCount: 2, Success: true } }));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    internals(service).agentSessionId = 'sess-1';
  });

  it('cancels ALL tracked in-flight calls with ONE callId-less mutation and flips every card', async () => {
    internals(service).inFlightCallIds.add('call-1');
    internals(service).inFlightCallIds.add('call-2');
    const results = collectResults(service);

    const count = await service.CancelInFlightDelegations();

    expect(count).toBe(2);
    expect(executeGQL).toHaveBeenCalledTimes(1);
    expect(executeGQL).toHaveBeenCalledWith(
      expect.stringContaining('CancelRealtimeSessionTool'),
      { agentSessionId: 'sess-1', callId: null }
    );
    expect(results.map(r => r.CallID).sort()).toEqual(['call-1', 'call-2']);
    expect(results.every(r => !r.Success && r.Output === 'Cancelled by user')).toBe(true);
    expect(internals(service).inFlightCallIds.size).toBe(0);
  });

  it('returns 0 without a mutation when nothing is tracked in flight', async () => {
    const count = await service.CancelInFlightDelegations();
    expect(count).toBe(0);
    expect(executeGQL).not.toHaveBeenCalled();
  });

  it('returns 0 (cards untouched) when the server aborted nothing', async () => {
    executeGQL.mockResolvedValue({ CancelRealtimeSessionTool: { AbortedCount: 0, Success: true } });
    internals(service).inFlightCallIds.add('call-1');
    const results = collectResults(service);

    const count = await service.CancelInFlightDelegations();

    expect(count).toBe(0);
    expect(results).toEqual([]);
    expect(internals(service).inFlightCallIds.has('call-1')).toBe(true);
  });
});

describe('RealtimeSessionService — usage telemetry relay (OnUsage → RelayRealtimeUsage)', () => {
  let service: RealtimeSessionService;
  let executeGQL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new RealtimeSessionService();
    executeGQL = vi.fn(async () => ({ RelayRealtimeUsage: true }));
    service.Provider = { ExecuteGQL: executeGQL } as unknown as IMetadataProvider;
    internals(service).agentSessionId = 'sess-1';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accumulates deltas and relays ONE debounced mutation (~10s) with the summed totals', async () => {
    internals(service).onUsageDelta({ InputTokens: 100, OutputTokens: 10 });
    internals(service).onUsageDelta({ InputTokens: 20, OutputTokens: 5 });

    await vi.advanceTimersByTimeAsync(9999);
    expect(executeGQL).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(executeGQL).toHaveBeenCalledTimes(1);
    expect(executeGQL).toHaveBeenCalledWith(
      expect.stringContaining('RelayRealtimeUsage'),
      { agentSessionId: 'sess-1', inputTokens: 120, outputTokens: 15 }
    );
    // Accumulators were consumed by the flush.
    expect(internals(service).pendingUsageInput).toBe(0);
    expect(internals(service).pendingUsageOutput).toBe(0);
  });

  it('ignores all-zero / negative / missing deltas (no timer armed, no mutation)', async () => {
    internals(service).onUsageDelta({});
    internals(service).onUsageDelta({ InputTokens: -5, OutputTokens: 0 });
    internals(service).onUsageDelta({ InputTokens: Number.NaN });

    await vi.advanceTimersByTimeAsync(60000);
    expect(executeGQL).not.toHaveBeenCalled();
    expect(internals(service).usageFlushTimer).toBeNull();
  });

  it('clamps a negative component while accumulating the positive one', async () => {
    internals(service).onUsageDelta({ InputTokens: -3, OutputTokens: 7 });

    await vi.advanceTimersByTimeAsync(10000);
    expect(executeGQL).toHaveBeenCalledWith(
      expect.stringContaining('RelayRealtimeUsage'),
      { agentSessionId: 'sess-1', inputTokens: 0, outputTokens: 7 }
    );
  });

  it('re-accumulates on a failed relay so the next flush retries the same deltas', async () => {
    executeGQL.mockRejectedValueOnce(new Error('network down'));
    internals(service).onUsageDelta({ InputTokens: 50, OutputTokens: 5 });
    await vi.advanceTimersByTimeAsync(10000); // flush fails

    expect(internals(service).pendingUsageInput).toBe(50);
    expect(internals(service).pendingUsageOutput).toBe(5);

    internals(service).onUsageDelta({ InputTokens: 10, OutputTokens: 0 });
    await vi.advanceTimersByTimeAsync(10000); // retry carries the combined totals

    expect(executeGQL).toHaveBeenLastCalledWith(
      expect.stringContaining('RelayRealtimeUsage'),
      { agentSessionId: 'sess-1', inputTokens: 60, outputTokens: 5 }
    );
  });

  it('flushes the unrelayed remainder at teardown BEFORE closing the server session (no debounce wait)', async () => {
    internals(service).onUsageDelta({ InputTokens: 33, OutputTokens: 4 });

    await internals(service).teardown(true);

    const mutations = executeGQL.mock.calls.map(c => c[0] as string);
    const usageIdx = mutations.findIndex(m => m.includes('RelayRealtimeUsage'));
    const closeIdx = mutations.findIndex(m => m.includes('CloseAgentSession'));
    expect(usageIdx).toBeGreaterThanOrEqual(0);
    expect(closeIdx).toBeGreaterThan(usageIdx); // usage flushed first, then close
    expect(executeGQL.mock.calls[usageIdx][1]).toEqual({ agentSessionId: 'sess-1', inputTokens: 33, outputTokens: 4 });
    // Teardown leaves the relay reset (no dangling timer / pending totals).
    expect(internals(service).usageFlushTimer).toBeNull();
    expect(internals(service).pendingUsageInput).toBe(0);
    expect(internals(service).pendingUsageOutput).toBe(0);
  });

  it('teardown without pending usage relays nothing (no spurious zero-delta mutation)', async () => {
    await internals(service).teardown(true);

    const mutations = executeGQL.mock.calls.map(c => c[0] as string);
    expect(mutations.some(m => m.includes('RelayRealtimeUsage'))).toBe(false);
    expect(mutations.some(m => m.includes('CloseAgentSession'))).toBe(true);
  });

  it('flushPendingUsage is a no-op without a session id', async () => {
    internals(service).agentSessionId = null;
    internals(service).onUsageDelta({ InputTokens: 9 });

    await internals(service).flushPendingUsage();

    expect(executeGQL).not.toHaveBeenCalled();
    // The deltas survive for a later flush once a session id exists.
    expect(internals(service).pendingUsageInput).toBe(9);
  });
});

describe('RealtimeSessionService — OnUsage wiring through wireClientHandlers', () => {
  /** Fake client capturing every handler wireClientHandlers registers. */
  class FakeWiredClient {
    public UsageHandler: ((u: RealtimeClientUsage) => void) | null = null;
    OnStateChange(): void { /* captured elsewhere */ }
    OnTranscript(): void { /* not exercised */ }
    OnToolCall(): void { /* not exercised */ }
    OnError(): void { /* not exercised */ }
    OnInterruption(): void { /* not exercised */ }
    OnUsage(handler: (u: RealtimeClientUsage) => void): void {
      this.UsageHandler = handler;
    }
  }

  interface WiringInternals {
    agentSessionId: string | null;
    pendingUsageInput: number;
    pendingUsageOutput: number;
    wireClientHandlers(client: FakeWiredClient): void;
  }

  it('registers an OnUsage handler that feeds the accumulator', () => {
    const service = new RealtimeSessionService();
    const seam = service as unknown as WiringInternals;
    seam.agentSessionId = 'sess-1';
    const client = new FakeWiredClient();

    seam.wireClientHandlers(client);
    expect(client.UsageHandler).toBeTypeOf('function');

    client.UsageHandler?.({ InputTokens: 11, OutputTokens: 3 });
    expect(seam.pendingUsageInput).toBe(11);
    expect(seam.pendingUsageOutput).toBe(3);
  });
});
