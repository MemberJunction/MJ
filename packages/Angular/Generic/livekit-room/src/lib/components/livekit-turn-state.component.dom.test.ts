import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { LiveKitTurnStateComponent } from './livekit-turn-state.component';
import type { LiveKitTurnStateModel } from '../models';

/**
 * DOM spec for <mj-livekit-turn-state> — a standalone, pure @Input leaf. Covers the empty state, the floor banner
 * for each kind of floor, the seats (floor holder + reservation + chips), the loop-cap meter and the event feed.
 */
function makeState(overrides: Partial<LiveKitTurnStateModel> = {}): LiveKitTurnStateModel {
  return {
    FloorHolderAgentSessionId: null,
    HumanSpeaking: false,
    PendingHandoffToAgentSessionId: null,
    ConsecutiveAgentTurns: 2,
    MaxConsecutiveAgentTurns: 8,
    LoopCapReached: false,
    BackchannelCount: 3,
    RecentEvents: [
      { Seq: 1, AtMs: 1_700_000_000_000, Type: 'FloorGranted', AgentSessionId: 'A1', Reason: 'FloorFree' },
      { Seq: 2, AtMs: 1_700_000_005_000, Type: 'FloorDenied', AgentSessionId: 'B2', Reason: 'HeldByOtherAgent' },
    ],
    Agents: [
      { AgentSessionID: 'A1', Names: ['Sage'], TurnMode: 'Passive', Addressing: 'ModelSide', FullDuplex: true },
      { AgentSessionID: 'B2', Names: ['Demo Loop'], TurnMode: 'Passive', Addressing: 'Regex', FullDuplex: false },
    ],
    ...overrides,
  };
}

describe('LiveKitTurnStateComponent (DOM)', () => {
  const render = (state: LiveKitTurnStateModel | null) => renderComponentFixture(LiveKitTurnStateComponent, { inputs: { State: state } });

  it('shows the empty state when there is no state or no agents', () => {
    expect(query(render(null), 'mj-empty-state')).not.toBeNull();
    expect(query(render(makeState({ Agents: [] })), 'mj-empty-state')).not.toBeNull();
    expect(query(render(null), '.lk-turn__floor')).toBeNull();
  });

  it('names the agent holding the floor and highlights its seat', () => {
    const f = render(makeState({ FloorHolderAgentSessionId: 'A1' }));
    expect(text(f, '.lk-turn__floor-label')).toBe('Sage has the floor');
    expect(query(f, '.lk-turn__floor--agent')).not.toBeNull();
    const seats = queryAll(f, '.lk-turn__seat');
    expect(seats).toHaveLength(2);
    expect(seats[0].classList.contains('lk-turn__seat--floor')).toBe(true);
    expect(seats[1].classList.contains('lk-turn__seat--floor')).toBe(false);
  });

  it('shows that a person is speaking, and that agents are paused at the cap', () => {
    expect(text(render(makeState({ HumanSpeaking: true })), '.lk-turn__floor-label')).toBe('A person is speaking');
    expect(query(render(makeState({ HumanSpeaking: true })), '.lk-turn__floor--human')).not.toBeNull();
    const capped = render(makeState({ LoopCapReached: true, ConsecutiveAgentTurns: 8 }));
    expect(query(capped, '.lk-turn__floor--capped')).not.toBeNull();
    expect(query(capped, '.lk-turn__cap--capped')).not.toBeNull();
  });

  it('marks the agent a hand-off is reserved for', () => {
    const f = render(makeState({ PendingHandoffToAgentSessionId: 'B2' }));
    expect(text(f, '.lk-turn__floor-label')).toBe('Floor reserved for Demo Loop');
    expect(queryAll(f, '.lk-turn__seat')[1].classList.contains('lk-turn__seat--reserved')).toBe(true);
    expect(f.nativeElement.textContent).toContain('Next up');
  });

  it('labels each seat\'s mode, how it decides it was addressed, and full-duplex models', () => {
    const f = render(makeState());
    const content = f.nativeElement.textContent as string;
    expect(content).toContain('Model-side');
    expect(content).toContain('Name match');
    expect(content).toContain('Full duplex');
    expect(content).toContain('Passive');
  });

  it('shows the loop-cap meter and the backchannel count', () => {
    const f = render(makeState());
    expect(text(f, '.lk-turn__cap-head')).toContain('2 of 8 agent turns in a row');
    expect(text(f, '.lk-turn__backchannels')).toContain('3');
    expect(query(f, 'mj-progress-bar')).not.toBeNull();
  });

  it('lists recent events newest first, in plain language', () => {
    const f = render(makeState());
    const rows = queryAll(f, '.lk-turn__event');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Demo Loop was held back: another agent has the floor');
    expect(rows[1].textContent).toContain('Sage took the floor');
  });

  it('says so when nothing has happened yet', () => {
    const f = render(makeState({ RecentEvents: [] }));
    expect(text(f, '.lk-turn__feed')).toContain('Nothing has happened yet.');
  });

  it('caps the feed to MaxEvents', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ Seq: i + 1, AtMs: 1_700_000_000_000 + i, Type: 'HumanSpeech' as const }));
    const f = renderComponentFixture(LiveKitTurnStateComponent, { inputs: { State: makeState({ RecentEvents: many }), MaxEvents: 5 } });
    expect(queryAll(f, '.lk-turn__event')).toHaveLength(5);
  });
});
