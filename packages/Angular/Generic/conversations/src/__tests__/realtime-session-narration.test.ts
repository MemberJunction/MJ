import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Subject } from 'rxjs';
import { IMetadataProvider } from '@memberjunction/core';
import {
  RealtimeSessionService,
  RealtimeConnectionState,
  RealtimeDelegationNarration,
  RealtimeDelegationProgress,
  RealtimeDelegationResult
} from '../lib/services/realtime-session.service';

/**
 * The NARRATION PACING / AGGREGATION state machine — the provider-agnostic policy that
 * decides WHEN the realtime model is asked to speak an interim progress update while a
 * delegated tool call runs, and WHAT digest it speaks:
 *
 *  - first spoken update no earlier than ~5s into a delegation burst (FirstNarrationDelayMs),
 *  - ≥8s between spoken updates, SESSION-global (NarrationIntervalMs — sequential tool calls
 *    must never re-arm the faster first-update path),
 *  - floods of progress AGGREGATE into one ' → ' digest (max 4, oldest dropped),
 *  - busy / audio-playing fire moments RETRY at 1.5s with the buffer intact,
 *  - the buffer is DISCARDED when the result lands first (never narrate over the answer),
 *  - what the model actually SAID is chained into the next instructions (≤3, anti-repeat).
 *
 * The machine lives behind private members, so these tests use the same narrow typed-seam
 * approach as the channels/client-tools suites: a fake realtime client capturing
 * `SendContextNote` / `RequestSpokenUpdate`, direct invocation of the private handlers
 * (`handleToolCall`, `dispatchProgress`, `onClientTranscript`), and a fake Provider whose
 * `ExecuteGQL` returns controllable deferred promises so tool calls stay in-flight exactly
 * as long as each test needs. `vi.useFakeTimers` (timers + Date) walks the 5s/8s/1.5s
 * schedule deterministically.
 */

// ── Test doubles ──────────────────────────────────────────────────────────────

class FakeRealtimeClient {
  public ContextNotes: string[] = [];
  public SpokenUpdates: string[] = [];
  public ToolResults: Array<{ CallID: string; ResultJson: string }> = [];
  public IsBusy = false;
  public IsAudioPlaying = false;
  public SendContextNote(text: string): void {
    this.ContextNotes.push(text);
  }
  public RequestSpokenUpdate(instructions: string): void {
    this.SpokenUpdates.push(instructions);
  }
  public SendToolResult(callId: string, resultJson: string): void {
    this.ToolResults.push({ CallID: callId, ResultJson: resultJson });
  }
  public async Disconnect(): Promise<void> {
    // no-op for teardown
  }
}

/** Shape of a client transcript event as the service consumes it. */
interface TranscriptEvent {
  Role: 'User' | 'Assistant';
  Text: string;
  IsFinal: boolean;
  Kind: 'normal' | 'narration';
}

/** The private surface the tests drive — no `any`, just the members under test. */
interface RealtimeSessionNarrationInternals {
  client: FakeRealtimeClient | null;
  agentSessionId: string | null;
  narrationTemplate: string | null;
  inFlightCallIds: Set<string>;
  narrationTimer: ReturnType<typeof setTimeout> | null;
  pendingNarrationMessages: string[];
  lastDelegationNarrationAt: number;
  delegationBurstStartedAt: number;
  narrationCount: number;
  spokenNarrations: string[];
  lastNarratedTail: string;
  handleToolCall(call: { CallID: string; ToolName: string; ArgumentsJson: string }): Promise<void>;
  dispatchProgress(progress: RealtimeDelegationProgress): void;
  onDelegationStatusMessage(raw: string): void;
  subscribeDelegationProgress(): void;
  onClientTranscript(transcript: TranscriptEvent): Promise<void>;
  fireDeferredNarration(): void;
  teardownDelegationProgress(): void;
  teardown(closeServerSession: boolean): Promise<void>;
  wireClientHandlers(client: unknown): void;
}

function internals(service: RealtimeSessionService): RealtimeSessionNarrationInternals {
  return service as unknown as RealtimeSessionNarrationInternals;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** One harness per test: service + fake client + controllable tool-execution deferreds. */
interface Harness {
  service: RealtimeSessionService;
  client: FakeRealtimeClient;
  i: RealtimeSessionNarrationInternals;
  /** One deferred per ExecuteRealtimeSessionTool invocation, in call order. */
  pendingTools: Array<Deferred<{ ExecuteRealtimeSessionTool: string }>>;
  executeGQL: ReturnType<typeof vi.fn>;
  pushStatus$: Subject<string>;
}

function createHarness(): Harness {
  const service = new RealtimeSessionService();
  const client = new FakeRealtimeClient();
  const i = internals(service);
  const pendingTools: Array<Deferred<{ ExecuteRealtimeSessionTool: string }>> = [];
  const pushStatus$ = new Subject<string>();
  const executeGQL = vi.fn((mutation: string) => {
    if (mutation.includes('ExecuteRealtimeSessionTool')) {
      const deferred = createDeferred<{ ExecuteRealtimeSessionTool: string }>();
      pendingTools.push(deferred);
      return deferred.promise;
    }
    return Promise.resolve({});
  });
  service.Provider = {
    ExecuteGQL: executeGQL,
    sessionId: 'transport-1',
    PushStatusUpdates: () => pushStatus$.asObservable()
  } as unknown as IMetadataProvider;
  i.client = client;
  i.agentSessionId = 'sess-1';
  return { service, client, i, pendingTools, executeGQL, pushStatus$ };
}

/**
 * Starts a server-relayed delegation. The returned promise settles when the call's
 * deferred is resolved/rejected; until then the call is IN-FLIGHT (the realistic state
 * while progress streams in).
 */
function beginDelegation(h: Harness, callId: string): Promise<void> {
  return h.i.handleToolCall({ CallID: callId, ToolName: 'invoke-target-agent', ArgumentsJson: '{}' });
}

/** Resolves the OLDEST unresolved tool deferred with a delegation result and settles the call. */
async function completeDelegation(h: Harness, call: Promise<void>, resultJson = '{"success":true,"output":"done"}'): Promise<void> {
  const deferred = h.pendingTools.shift();
  if (!deferred) {
    throw new Error('No pending tool execution to complete');
  }
  deferred.resolve({ ExecuteRealtimeSessionTool: resultJson });
  await call;
}

function progress(h: Harness, callId: string, message: string): void {
  h.i.dispatchProgress({ CallID: callId, Step: 'subagent_execution', Message: message });
}

describe('RealtimeSessionService — narration timing (5s anchor + session-global 8s floor)', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = createHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the first spoken update fires no earlier than 5s after the burst started', () => {
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'warming up');

    vi.advanceTimersByTime(4999);
    expect(h.client.SpokenUpdates).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(h.client.SpokenUpdates).toHaveLength(1);
    expect(h.client.SpokenUpdates[0]).toContain('warming up');
  });

  it('anchors the 5s delay at burst START — progress arriving at 6s fires after the 250ms minimum', () => {
    void beginDelegation(h, 'c1');
    vi.advanceTimersByTime(6000); // burst is already 6s old when the first progress lands

    progress(h, 'c1', 'late progress');
    vi.advanceTimersByTime(249);
    expect(h.client.SpokenUpdates).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(h.client.SpokenUpdates).toHaveLength(1);
  });

  it('spaces the SECOND spoken update ≥8s after the first', () => {
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'first');
    vi.advanceTimersByTime(5000);
    expect(h.client.SpokenUpdates).toHaveLength(1);

    progress(h, 'c1', 'second');
    vi.advanceTimersByTime(7999);
    expect(h.client.SpokenUpdates).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(h.client.SpokenUpdates).toHaveLength(2);
    expect(h.client.SpokenUpdates[1]).toContain('second');
  });

  it('REGRESSION: a sequential tool call seconds later does NOT re-arm the fast first-update path — the 8s floor is session-global', async () => {
    // Burst 1: narrate once at T+5s, then the result lands.
    const call1 = beginDelegation(h, 'c1');
    progress(h, 'c1', 'burst one');
    vi.advanceTimersByTime(5000); // narration #1 at T=5000
    expect(h.client.SpokenUpdates).toHaveLength(1);
    await completeDelegation(h, call1);

    // Burst 2 starts only 2s later (T=7000). Its 5s anchor would allow T=12000,
    // but the session-global floor (5000 + 8000 = 13000) must win.
    vi.advanceTimersByTime(2000);
    void beginDelegation(h, 'c2');
    progress(h, 'c2', 'burst two');

    vi.advanceTimersByTime(5999); // T=12999 — past the burst anchor, still under the floor
    expect(h.client.SpokenUpdates).toHaveLength(1);

    vi.advanceTimersByTime(1); // T=13000 — exactly 8s after the last narration
    expect(h.client.SpokenUpdates).toHaveLength(2);
    expect(h.client.SpokenUpdates[1]).toContain('burst two');
  });

  it('a new burst resets the per-burst state (count/buffer/tail) but PRESERVES the floor and spoken history', async () => {
    const call1 = beginDelegation(h, 'c1');
    progress(h, 'c1', 'burst one');
    vi.advanceTimersByTime(5000);
    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'I said this already', IsFinal: true, Kind: 'narration' });
    await completeDelegation(h, call1);
    const floorBefore = h.i.lastDelegationNarrationAt;
    expect(floorBefore).toBeGreaterThan(0);

    void beginDelegation(h, 'c2');

    expect(h.i.narrationCount).toBe(0);
    expect(h.i.pendingNarrationMessages).toEqual([]);
    expect(h.i.lastNarratedTail).toBe('');
    expect(h.i.lastDelegationNarrationAt).toBe(floorBefore); // floor NOT reset
    expect(h.i.spokenNarrations).toEqual(['I said this already']); // history NOT reset
  });

  it('the second burst restarts narration numbering at update #1 while chaining the prior utterance', async () => {
    const call1 = beginDelegation(h, 'c1');
    progress(h, 'c1', 'burst one');
    vi.advanceTimersByTime(5000);
    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'Pulling that up now', IsFinal: true, Kind: 'narration' });
    await completeDelegation(h, call1);

    vi.advanceTimersByTime(2000);
    void beginDelegation(h, 'c2');
    progress(h, 'c2', 'burst two');
    vi.advanceTimersByTime(6000); // the 8s session floor elapses

    expect(h.client.SpokenUpdates).toHaveLength(2);
    expect(h.client.SpokenUpdates[1]).toContain('spoken update #1'); // per-burst numbering reset
    expect(h.client.SpokenUpdates[1]).toContain('- "Pulling that up now"'); // history chained across bursts
  });

  it('teardown → new session resets the 8s floor (the next first update honors only the 5s anchor)', async () => {
    const call1 = beginDelegation(h, 'c1');
    progress(h, 'c1', 'old session');
    vi.advanceTimersByTime(5000);
    expect(h.client.SpokenUpdates).toHaveLength(1);
    await completeDelegation(h, call1);

    await h.i.teardown(false);

    // New session on the same service instance: fresh client + session id.
    const freshClient = new FakeRealtimeClient();
    h.i.client = freshClient;
    h.i.agentSessionId = 'sess-2';
    void beginDelegation(h, 'c9');
    progress(h, 'c9', 'new session');

    vi.advanceTimersByTime(4999);
    expect(freshClient.SpokenUpdates).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(freshClient.SpokenUpdates).toHaveLength(1); // 5s anchor only — floor was reset
  });

  it('teardownDelegationProgress resets ALL narration state', () => {
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'm1');
    vi.advanceTimersByTime(5000);
    expect(h.client.SpokenUpdates).toHaveLength(1);
    h.i.spokenNarrations.push('something said');
    progress(h, 'c1', 'm2'); // re-arms the timer + refills the buffer

    h.i.teardownDelegationProgress();

    expect(h.i.inFlightCallIds.size).toBe(0);
    expect(h.i.narrationTimer).toBeNull();
    expect(h.i.pendingNarrationMessages).toEqual([]);
    expect(h.i.lastDelegationNarrationAt).toBe(0);
    expect(h.i.delegationBurstStartedAt).toBe(0);
    expect(h.i.narrationCount).toBe(0);
    expect(h.i.spokenNarrations).toEqual([]);
    expect(h.i.lastNarratedTail).toBe('');
  });
});

describe('RealtimeSessionService — narration aggregation (digest buffer)', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = createHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a flood of 6 distinct messages becomes ONE spoken digest of the LAST 4, joined " → "', () => {
    void beginDelegation(h, 'c1');
    for (const m of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']) {
      progress(h, 'c1', m);
    }

    vi.advanceTimersByTime(5000);

    expect(h.client.SpokenUpdates).toHaveLength(1);
    expect(h.client.SpokenUpdates[0]).toContain('m3 → m4 → m5 → m6');
    expect(h.client.SpokenUpdates[0]).not.toContain('m1');
    expect(h.client.SpokenUpdates[0]).not.toContain('m2');
  });

  it('every progress event STILL feeds a context note, even when the digest dedupes/caps', () => {
    void beginDelegation(h, 'c1');
    for (const m of ['m1', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']) {
      progress(h, 'c1', m);
    }

    expect(h.client.ContextNotes).toHaveLength(7);
    expect(h.client.ContextNotes[0]).toBe('[delegated-agent progress] m1');
  });

  it('an already-buffered duplicate message is not re-buffered', () => {
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'dup');
    progress(h, 'c1', 'dup');
    progress(h, 'c1', 'next');

    vi.advanceTimersByTime(5000);

    expect(h.client.SpokenUpdates).toHaveLength(1);
    expect(h.client.SpokenUpdates[0]).toContain('dup → next');
    expect(h.client.SpokenUpdates[0]).not.toContain('dup → dup');
  });

  it('a message equal to the LAST NARRATED TAIL is not re-buffered (no empty re-narration)', () => {
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'still working');
    vi.advanceTimersByTime(5000);
    expect(h.client.SpokenUpdates).toHaveLength(1);

    // The same trailing message arrives again — context note yes, narration no.
    progress(h, 'c1', 'still working');
    expect(h.i.pendingNarrationMessages).toEqual([]);
    expect(h.i.narrationTimer).toBeNull();

    vi.advanceTimersByTime(30000);
    expect(h.client.SpokenUpdates).toHaveLength(1);
    expect(h.client.ContextNotes).toHaveLength(2);
  });

  it('a DISTINCT message after a tail-dedupe re-arms the machine normally', () => {
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'still working');
    vi.advanceTimersByTime(5000);
    progress(h, 'c1', 'still working'); // tail dedupe
    vi.advanceTimersByTime(20000); // well past the 8s floor

    progress(h, 'c1', 'finishing touches');
    vi.advanceTimersByTime(250); // floor already satisfied → minimum delay

    expect(h.client.SpokenUpdates).toHaveLength(2);
    expect(h.client.SpokenUpdates[1]).toContain('finishing touches');
  });

  it('discards the buffer when the result lands before the fire moment — nothing is spoken', async () => {
    const call = beginDelegation(h, 'c1');
    progress(h, 'c1', 'never spoken');
    vi.advanceTimersByTime(3000);

    await completeDelegation(h, call);

    expect(h.i.narrationTimer).toBeNull();
    expect(h.i.pendingNarrationMessages).toEqual([]);
    vi.advanceTimersByTime(60000);
    expect(h.client.SpokenUpdates).toHaveLength(0);
  });

  it('a result for ONE of several in-flight calls still cancels the pending digest (result speaks next)', async () => {
    const call1 = beginDelegation(h, 'c1');
    void beginDelegation(h, 'c2');
    progress(h, 'c1', 'from c1');
    progress(h, 'c2', 'from c2');

    await completeDelegation(h, call1);
    expect(h.i.pendingNarrationMessages).toEqual([]);
    expect(h.i.inFlightCallIds.has('c2')).toBe(true);

    vi.advanceTimersByTime(60000);
    expect(h.client.SpokenUpdates).toHaveLength(0); // buffer was discarded with the timer
  });
});

describe('RealtimeSessionService — busy / audio-playing retry', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = createHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a busy fire moment retries 1.5s later with the SAME buffer', () => {
    h.client.IsBusy = true;
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'kept safe');

    vi.advanceTimersByTime(5000);
    expect(h.client.SpokenUpdates).toHaveLength(0);
    expect(h.i.pendingNarrationMessages).toEqual(['kept safe']); // buffer intact

    h.client.IsBusy = false;
    vi.advanceTimersByTime(1499);
    expect(h.client.SpokenUpdates).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(h.client.SpokenUpdates).toHaveLength(1);
    expect(h.client.SpokenUpdates[0]).toContain('kept safe');
  });

  it('keeps retrying while the model stays busy, then fires once when it frees up', () => {
    h.client.IsBusy = true;
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'patient update');

    vi.advanceTimersByTime(5000); // initial fire → busy
    vi.advanceTimersByTime(1500); // retry 1 → busy
    vi.advanceTimersByTime(1500); // retry 2 → busy
    expect(h.client.SpokenUpdates).toHaveLength(0);

    h.client.IsBusy = false;
    vi.advanceTimersByTime(1500); // retry 3 → fires
    expect(h.client.SpokenUpdates).toHaveLength(1);
  });

  it('progress arriving during the retry window joins the digest', () => {
    h.client.IsBusy = true;
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'part one');

    vi.advanceTimersByTime(5000); // busy → retry armed
    progress(h, 'c1', 'part two'); // buffered while waiting

    h.client.IsBusy = false;
    vi.advanceTimersByTime(1500);

    expect(h.client.SpokenUpdates).toHaveLength(1);
    expect(h.client.SpokenUpdates[0]).toContain('part one → part two');
  });

  it('IsAudioPlaying gates exactly like IsBusy', () => {
    h.client.IsAudioPlaying = true;
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'audio gate');

    vi.advanceTimersByTime(5000);
    expect(h.client.SpokenUpdates).toHaveLength(0);

    h.client.IsAudioPlaying = false;
    vi.advanceTimersByTime(1500);
    expect(h.client.SpokenUpdates).toHaveLength(1);
  });

  it('a result landing during the retry window cancels the retry (nothing spoken)', async () => {
    h.client.IsBusy = true;
    const call = beginDelegation(h, 'c1');
    progress(h, 'c1', 'moot now');
    vi.advanceTimersByTime(5000); // busy → retry armed

    await completeDelegation(h, call);
    h.client.IsBusy = false;
    vi.advanceTimersByTime(60000);

    expect(h.client.SpokenUpdates).toHaveLength(0);
  });

  it('defensive: a fire with the in-flight set EMPTY drops the buffer silently', () => {
    h.i.pendingNarrationMessages.push('orphaned');
    h.i.inFlightCallIds.clear();

    h.i.fireDeferredNarration();

    expect(h.client.SpokenUpdates).toHaveLength(0);
    expect(h.i.pendingNarrationMessages).toEqual([]);
  });

  it('defensive: a fire with NO client drops the buffer without throwing', () => {
    h.i.inFlightCallIds.add('c1');
    h.i.pendingNarrationMessages.push('orphaned');
    h.i.client = null;

    expect(() => h.i.fireDeferredNarration()).not.toThrow();
    expect(h.i.pendingNarrationMessages).toEqual([]);
  });

  it('defensive: a fire with an EMPTY buffer is a no-op (no spoken update, no retry)', () => {
    h.i.inFlightCallIds.add('c1');

    h.i.fireDeferredNarration();

    expect(h.client.SpokenUpdates).toHaveLength(0);
    expect(h.i.narrationTimer).toBeNull();
  });
});

describe('RealtimeSessionService — narration instructions + spoken-history capture', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = createHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chains what the model ACTUALLY SAID into the next instructions, with per-burst numbering', async () => {
    void beginDelegation(h, 'c1');
    progress(h, 'c1', 'step one');
    vi.advanceTimersByTime(5000);
    expect(h.client.SpokenUpdates[0]).toContain('spoken update #1');
    expect(h.client.SpokenUpdates[0]).toContain('first spoken update'); // "none yet" wording

    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'On it — digging in', IsFinal: true, Kind: 'narration' });

    progress(h, 'c1', 'step two');
    vi.advanceTimersByTime(8000);

    expect(h.client.SpokenUpdates).toHaveLength(2);
    expect(h.client.SpokenUpdates[1]).toContain('spoken update #2');
    expect(h.client.SpokenUpdates[1]).toContain('- "On it — digging in"');
  });

  it('caps the chained prior narrations at the LAST 3', async () => {
    void beginDelegation(h, 'c1');
    for (const said of ['utterance 1', 'utterance 2', 'utterance 3', 'utterance 4']) {
      await h.i.onClientTranscript({ Role: 'Assistant', Text: said, IsFinal: true, Kind: 'narration' });
    }
    expect(h.i.spokenNarrations).toEqual(['utterance 2', 'utterance 3', 'utterance 4']);

    progress(h, 'c1', 'wrap up');
    vi.advanceTimersByTime(5000);

    const instructions = h.client.SpokenUpdates[0];
    expect(instructions).toContain('- "utterance 2"');
    expect(instructions).toContain('- "utterance 4"');
    expect(instructions).not.toContain('utterance 1');
  });

  it('threads digest / update number / prior narrations through a DB-driven template', async () => {
    h.i.narrationTemplate = 'T[{{ progressMessage }}][#{{ updateNumber }}][{{ priorNarrations }}]';
    void beginDelegation(h, 'c1');
    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'prior words', IsFinal: true, Kind: 'narration' });

    progress(h, 'c1', 'alpha');
    progress(h, 'c1', 'beta');
    vi.advanceTimersByTime(5000);

    expect(h.client.SpokenUpdates).toEqual(['T[alpha → beta][#1][- "prior words"]']);
  });

  it('narration-kind final transcripts are EPHEMERAL: emitted on DelegationNarration$, never a caption, never relayed', async () => {
    const narrations: RealtimeDelegationNarration[] = [];
    const captionCounts: number[] = [];
    h.service.DelegationNarration$.subscribe(n => narrations.push(n));
    h.service.Captions$.subscribe(c => captionCounts.push(c.length));

    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'ephemeral note', IsFinal: true, Kind: 'narration' });

    expect(narrations).toEqual([{ Text: 'ephemeral note' }]);
    expect(captionCounts).toEqual([0]); // only the BehaviorSubject replay — no caption emission
    expect(h.executeGQL).not.toHaveBeenCalled(); // no RelayRealtimeTranscript
  });

  it('NORMAL assistant final transcripts become captions and are relayed', async () => {
    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'a real answer', IsFinal: true, Kind: 'normal' });

    let captions: Array<{ Role: string; Text: string }> = [];
    h.service.Captions$.subscribe(c => (captions = c)).unsubscribe();
    expect(captions).toEqual([{ Role: 'Assistant', Text: 'a real answer' }]);
    expect(h.executeGQL).toHaveBeenCalledWith(
      expect.stringContaining('RelayRealtimeTranscript'),
      expect.objectContaining({ role: 'assistant', text: 'a real answer' })
    );
  });

  it('interim (non-final) transcripts are ignored entirely', async () => {
    const narrations: RealtimeDelegationNarration[] = [];
    h.service.DelegationNarration$.subscribe(n => narrations.push(n));

    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'partial…', IsFinal: false, Kind: 'narration' });
    await h.i.onClientTranscript({ Role: 'Assistant', Text: 'partial…', IsFinal: false, Kind: 'normal' });

    expect(narrations).toEqual([]);
    expect(h.i.spokenNarrations).toEqual([]);
    expect(h.executeGQL).not.toHaveBeenCalled();
  });
});

describe('RealtimeSessionService — progress dispatch + stale filtering + push-status parsing', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = createHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops STALE progress for a CallID not in flight — no UI emission, no context note, no timer', () => {
    const seen: RealtimeDelegationProgress[] = [];
    h.service.DelegationProgress$.subscribe(p => seen.push(p));

    progress(h, 'never-started', 'stale message');

    expect(seen).toEqual([]);
    expect(h.client.ContextNotes).toEqual([]);
    expect(h.i.narrationTimer).toBeNull();
  });

  it('drops progress that arrives AFTER the call completed (the PubSub-lag case)', async () => {
    const call = beginDelegation(h, 'c1');
    await completeDelegation(h, call);

    const seen: RealtimeDelegationProgress[] = [];
    h.service.DelegationProgress$.subscribe(p => seen.push(p));
    progress(h, 'c1', 'too late');

    expect(seen).toEqual([]);
    expect(h.client.ContextNotes).toEqual([]);
  });

  it('emits in-flight progress on DelegationProgress$ AND feeds the model a context note', () => {
    void beginDelegation(h, 'c1');
    const seen: RealtimeDelegationProgress[] = [];
    h.service.DelegationProgress$.subscribe(p => seen.push(p));

    progress(h, 'c1', 'live update');

    expect(seen).toEqual([{ CallID: 'c1', Step: 'subagent_execution', Message: 'live update' }]);
    expect(h.client.ContextNotes).toEqual(['[delegated-agent progress] live update']);
  });

  it('parses a matching push-status frame end-to-end (raw JSON → DelegationProgress$)', () => {
    h.i.subscribeDelegationProgress();
    void beginDelegation(h, 'c1');
    const seen: RealtimeDelegationProgress[] = [];
    h.service.DelegationProgress$.subscribe(p => seen.push(p));

    h.pushStatus$.next(
      JSON.stringify({
        resolver: 'RealtimeClientSessionResolver',
        type: 'RealtimeDelegationProgress',
        agentSessionID: 'sess-1',
        callID: 'c1',
        step: 'prompt_execution',
        message: 'thinking hard',
        percentage: 42
      })
    );

    expect(seen).toEqual([{ CallID: 'c1', Step: 'prompt_execution', Message: 'thinking hard', Percentage: 42 }]);
  });

  it('ignores non-JSON frames and frames with the wrong resolver / type / session', () => {
    h.i.subscribeDelegationProgress();
    void beginDelegation(h, 'c1');
    const seen: RealtimeDelegationProgress[] = [];
    h.service.DelegationProgress$.subscribe(p => seen.push(p));

    h.pushStatus$.next('not json at all');
    h.pushStatus$.next(JSON.stringify({ resolver: 'SomeOtherResolver', type: 'RealtimeDelegationProgress', agentSessionID: 'sess-1', callID: 'c1', step: 's', message: 'x' }));
    h.pushStatus$.next(JSON.stringify({ resolver: 'RealtimeClientSessionResolver', type: 'AgentRunProgress', agentSessionID: 'sess-1', callID: 'c1', step: 's', message: 'x' }));
    h.pushStatus$.next(JSON.stringify({ resolver: 'RealtimeClientSessionResolver', type: 'RealtimeDelegationProgress', agentSessionID: 'OTHER-session', callID: 'c1', step: 's', message: 'x' }));

    expect(seen).toEqual([]);
    expect(h.client.ContextNotes).toEqual([]);
  });

  it('subscribeDelegationProgress is idempotent for a session (one PushStatusUpdates subscription)', () => {
    const pushSpy = vi.spyOn(h.service.Provider as unknown as { PushStatusUpdates(id: string): unknown }, 'PushStatusUpdates');

    h.i.subscribeDelegationProgress();
    h.i.subscribeDelegationProgress();

    expect(pushSpy).toHaveBeenCalledTimes(1);
  });
});

describe('RealtimeSessionService — delegation lifecycle (thinking state, results, errors)', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = createHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a server-relayed tool call flips the connection state to thinking', () => {
    const states: RealtimeConnectionState[] = [];
    h.service.ConnectionState$.subscribe(s => states.push(s));

    void beginDelegation(h, 'c1');

    expect(states[states.length - 1]).toBe('thinking');
  });

  it('emits the parsed delegation result (incl. RunID) and feeds the raw JSON back to the model', async () => {
    const results: RealtimeDelegationResult[] = [];
    h.service.DelegationResult$.subscribe(r => results.push(r));
    const call = beginDelegation(h, 'c1');

    await completeDelegation(h, call, '{"success":true,"output":"all done","runId":"run-9"}');

    expect(results).toEqual([
      expect.objectContaining({ CallID: 'c1', Success: true, Output: 'all done', RunID: 'run-9' })
    ]);
    expect(h.client.ToolResults).toEqual([
      { CallID: 'c1', ResultJson: '{"success":true,"output":"all done","runId":"run-9"}' }
    ]);
    expect(h.i.inFlightCallIds.size).toBe(0);
  });

  it('a tool-execution failure feeds an error payload to the model and surfaces the error as the result output', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const results: RealtimeDelegationResult[] = [];
    h.service.DelegationResult$.subscribe(r => results.push(r));
    const call = beginDelegation(h, 'c1');

    h.pendingTools.shift()!.reject(new Error('broker down'));
    await call;

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ CallID: 'c1', Output: 'broker down' });
    // The catch path serializes success:false (matching the server broker's failure
    // shape) so the overlay renders a FAILURE card — a coverage-exposed bug fix.
    expect(results[0].Success).toBe(false);
    expect(JSON.parse(h.client.ToolResults[0].ResultJson)).toEqual({ success: false, error: 'broker down' });
    expect(h.i.inFlightCallIds.size).toBe(0);
  });

  it('a SECOND tool call while one is in flight joins the SAME burst (no anchor reset)', () => {
    void beginDelegation(h, 'c1');
    const burstStart = h.i.delegationBurstStartedAt;
    vi.advanceTimersByTime(3000);

    void beginDelegation(h, 'c2');

    expect(h.i.delegationBurstStartedAt).toBe(burstStart); // inFlight was non-empty → same burst
    expect(h.i.inFlightCallIds.size).toBe(2);
  });

  it('TRUE BARGE-IN cancels pending narration (user took the floor) but leaves delegations in flight', () => {
    // capture the OnInterruption handler through the real wiring path
    let interrupt: (() => void) | null = null;
    const wiringClient = {
      OnStateChange: () => undefined,
      OnTranscript: () => undefined,
      OnToolCall: () => undefined,
      OnError: () => undefined,
      OnUsage: () => undefined,
      OnInterruption: (handler: () => void) => { interrupt = handler; }
    };
    h.i.wireClientHandlers(wiringClient);
    expect(interrupt).not.toBeNull();

    void beginDelegation(h, 'c1');
    h.i.dispatchProgress({ CallID: 'c1', Step: 'action_execution', Message: 'fetching data' });
    expect(h.i.pendingNarrationMessages).toEqual(['fetching data']);
    expect(h.i.narrationTimer).not.toBeNull();

    interrupt!();

    expect(h.i.pendingNarrationMessages).toEqual([]); // stale narration discarded
    expect(h.i.narrationTimer).toBeNull();
    expect(h.i.inFlightCallIds.has('c1')).toBe(true); // the delegated run keeps running
    vi.advanceTimersByTime(20000);
    expect(h.client.SpokenUpdates).toEqual([]); // nothing stale ever spoken
  });
});