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
