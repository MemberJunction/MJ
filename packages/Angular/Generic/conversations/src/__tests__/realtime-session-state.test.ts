import { describe, it, expect, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import { RealtimeSessionState, RealtimeSessionStreams } from '../lib/components/realtime/realtime-session-state';
import type {
  RealtimeCaption,
  RealtimeDelegationNarration,
  RealtimeDelegationProgress,
  RealtimeDelegationResult
} from '../lib/services/realtime-session.service';

/** Test harness: drives the four session streams the state merges. */
function buildStreams(): {
  streams: RealtimeSessionStreams;
  captions$: Subject<RealtimeCaption[]>;
  progress$: Subject<RealtimeDelegationProgress>;
  result$: Subject<RealtimeDelegationResult>;
  narration$: Subject<RealtimeDelegationNarration>;
} {
  const captions$ = new Subject<RealtimeCaption[]>();
  const progress$ = new Subject<RealtimeDelegationProgress>();
  const result$ = new Subject<RealtimeDelegationResult>();
  const narration$ = new Subject<RealtimeDelegationNarration>();
  const streams: RealtimeSessionStreams = {
    Captions$: captions$.asObservable(),
    DelegationProgress$: progress$.asObservable(),
    DelegationResult$: result$.asObservable(),
    DelegationNarration$: narration$.asObservable()
  };
  return { streams, captions$, progress$, result$, narration$ };
}

describe('RealtimeSessionState — RunID threading', () => {
  let harness: ReturnType<typeof buildStreams>;
  let state: RealtimeSessionState;

  beforeEach(() => {
    harness = buildStreams();
    state = new RealtimeSessionState();
    state.Attach(harness.streams);
  });

  it('creates a working card from the first progress event (no RunID yet)', () => {
    harness.progress$.next({ CallID: 'call-1', Step: 'prompt_execution', Message: 'thinking' });
    expect(state.Cards).toHaveLength(1);
    expect(state.Cards[0].Done).toBe(false);
    expect(state.Cards[0].RunID).toBeUndefined();
    expect(state.Cards[0].RunRef).toBeTruthy();
  });

  it('threads the result RunID onto the card and keeps the short RunRef display', () => {
    harness.progress$.next({ CallID: 'call-1', Step: 'prompt_execution', Message: 'thinking' });
    const runRefBefore = state.Cards[0].RunRef;

    harness.result$.next({ CallID: 'call-1', Success: true, Output: 'done!', RunID: 'run-abc' });

    expect(state.Cards).toHaveLength(1);
    const card = state.Cards[0];
    expect(card.Done).toBe(true);
    expect(card.Success).toBe(true);
    expect(card.Result).toBe('done!');
    expect(card.RunID).toBe('run-abc');
    expect(card.RunRef).toBe(runRefBefore);
  });

  it('leaves RunID undefined when the result carries none', () => {
    harness.progress$.next({ CallID: 'call-1', Step: 'action_execution', Message: 'running' });
    harness.result$.next({ CallID: 'call-1', Success: false, Output: 'failed' });
    expect(state.Cards[0].Done).toBe(true);
    expect(state.Cards[0].Success).toBe(false);
    expect(state.Cards[0].RunID).toBeUndefined();
  });

  it('ignores results for calls that never produced a card (non-delegation tools)', () => {
    harness.result$.next({ CallID: 'unknown', Success: true, Output: 'x', RunID: 'run-1' });
    expect(state.Cards).toHaveLength(0);
  });

  it('threads result Artifacts onto the card', () => {
    harness.progress$.next({ CallID: 'call-1', Step: 'prompt_execution', Message: 'thinking' });
    harness.result$.next({
      CallID: 'call-1',
      Success: true,
      Output: 'done!',
      RunID: 'run-abc',
      Artifacts: [{ ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Weather Report' }]
    });

    expect(state.Cards[0].Artifacts).toEqual([
      { ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Weather Report' }
    ]);
  });

  it('leaves card Artifacts undefined when the result carries none', () => {
    harness.progress$.next({ CallID: 'call-1', Step: 'prompt_execution', Message: 'thinking' });
    harness.result$.next({ CallID: 'call-1', Success: true, Output: 'done!' });
    expect(state.Cards[0].Artifacts).toBeUndefined();
  });

  it('replaces the card immutably when the result lands (fresh references for CD)', () => {
    harness.progress$.next({ CallID: 'call-1', Step: 'prompt_execution', Message: 'thinking' });
    const before = state.Cards[0];
    const itemsBefore = state.Items;

    harness.result$.next({ CallID: 'call-1', Success: true, Output: 'done', RunID: 'run-1' });

    expect(state.Cards[0]).not.toBe(before);
    expect(state.Items).not.toBe(itemsBefore);
  });
});

describe('RealtimeSessionState — in-place caption updates', () => {
  let harness: ReturnType<typeof buildStreams>;
  let state: RealtimeSessionState;

  beforeEach(() => {
    harness = buildStreams();
    state = new RealtimeSessionState();
    state.Attach(harness.streams);
  });

  it('updates the last caption item in place when a streaming delta extends the current turn', () => {
    harness.captions$.next([{ Role: 'User', Text: 'Hel' }]);
    expect(state.Items).toHaveLength(1);
    expect(state.Items[0]).toEqual({ Kind: 'caption', Role: 'User', Text: 'Hel' });

    // Same array length (1 caption), updated in-place text
    harness.captions$.next([{ Role: 'User', Text: 'Hello world' }]);
    expect(state.Items).toHaveLength(1);
    expect(state.Items[0]).toEqual({ Kind: 'caption', Role: 'User', Text: 'Hello world' });
  });

  it('feeds three deltas plus a final and asserts ONE caption containing the full text', () => {
    // Delta 1
    harness.captions$.next([{ Role: 'User', Text: 'Hello' }]);
    expect(state.Items).toHaveLength(1);
    expect(state.Items[0]).toEqual({ Kind: 'caption', Role: 'User', Text: 'Hello' });

    // Delta 2
    harness.captions$.next([{ Role: 'User', Text: 'Hello world' }]);
    expect(state.Items).toHaveLength(1);
    expect(state.Items[0]).toEqual({ Kind: 'caption', Role: 'User', Text: 'Hello world' });

    // Delta 3
    harness.captions$.next([{ Role: 'User', Text: 'Hello world!' }]);
    expect(state.Items).toHaveLength(1);
    expect(state.Items[0]).toEqual({ Kind: 'caption', Role: 'User', Text: 'Hello world!' });

    // Final
    harness.captions$.next([{ Role: 'User', Text: 'Hello world!' }]);
    expect(state.Items).toHaveLength(1);
    expect(state.Items[0]).toEqual({ Kind: 'caption', Role: 'User', Text: 'Hello world!' });
  });
});

describe('RealtimeSessionState — direct action cards', () => {
  let harness: ReturnType<typeof buildStreams>;
  let state: RealtimeSessionState;

  beforeEach(() => {
    harness = buildStreams();
    state = new RealtimeSessionState();
    state.Attach(harness.streams);
  });

  it('creates an action card from synthetic progress when a direct action is dispatched', () => {
    harness.progress$.next({
      CallID: 'call-action-1',
      ToolName: 'File_Storage_List_Objects',
      Step: 'direct_action',
      Message: 'Executing File_Storage_List_Objects'
    });

    expect(state.Cards).toHaveLength(1);
    const card = state.Cards[0];
    expect(card.Kind).toBe('action');
    expect(card.ToolName).toBe('File_Storage_List_Objects');
    expect(card.AgentName).toBe('File Storage List Objects');
    expect(card.LatestStep).toBe('direct_action');
    expect(card.Done).toBe(false);
  });

  it('flips the dispatched action card to done on result', () => {
    harness.progress$.next({
      CallID: 'call-action-1',
      ToolName: 'Get_Weather',
      Step: 'direct_action',
      Message: 'Executing Get_Weather'
    });
    expect(state.Cards[0].Done).toBe(false);

    harness.result$.next({
      CallID: 'call-action-1',
      ToolName: 'Get_Weather',
      Success: true,
      Output: 'Sunny, 75°F'
    });

    expect(state.Cards).toHaveLength(1);
    const card = state.Cards[0];
    expect(card.Kind).toBe('action');
    expect(card.Done).toBe(true);
    expect(card.Success).toBe(true);
    expect(card.Result).toBe('Sunny, 75°F');
  });

  it('safety net: creates exactly one done action card when result arrives with no prior progress', () => {
    expect(state.Cards).toHaveLength(0);

    harness.result$.next({
      CallID: 'call-fast-1',
      ToolName: 'Get_Weather',
      Success: true,
      Output: 'Rainy, 50°F'
    });

    expect(state.Cards).toHaveLength(1);
    const card = state.Cards[0];
    expect(card.Kind).toBe('action');
    expect(card.AgentName).toBe('Get Weather');
    expect(card.Done).toBe(true);
    expect(card.Success).toBe(true);
    expect(card.Result).toBe('Rainy, 50°F');
  });
});


