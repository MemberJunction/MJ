import { describe, it, expect } from 'vitest';
import {
  BuildTurnEventRows,
  BuildTurnSeats,
  DescribeTurnEvent,
  LabelTurnReason,
  ResolveTurnAgentName,
  SummarizeFloor,
  SummarizeLoopCap,
  LIVEKIT_TURN_FEED_DEFAULT_ROWS,
} from '../lib/livekit-turn-state-logic';
import type { LiveKitTurnEventModel, LiveKitTurnStateModel } from '../lib/models';

function makeState(overrides: Partial<LiveKitTurnStateModel> = {}): LiveKitTurnStateModel {
  return {
    FloorHolderAgentSessionId: null,
    HumanSpeaking: false,
    PendingHandoffToAgentSessionId: null,
    ConsecutiveAgentTurns: 0,
    MaxConsecutiveAgentTurns: 8,
    LoopCapReached: false,
    BackchannelCount: 0,
    RecentEvents: [],
    Agents: [
      { AgentSessionID: 'A1', Names: ['Sage'], TurnMode: 'Passive', Addressing: 'ModelSide', FullDuplex: true },
      { AgentSessionID: 'B2', Names: ['Demo Loop'], TurnMode: 'Active', Addressing: 'Regex', FullDuplex: false },
    ],
    ...overrides,
  };
}

function event(seq: number, type: LiveKitTurnEventModel['Type'], rest: Partial<LiveKitTurnEventModel> = {}): LiveKitTurnEventModel {
  return { Seq: seq, AtMs: 1_700_000_000_000 + seq * 1000, Type: type, ...rest };
}

describe('ResolveTurnAgentName', () => {
  it('finds an agent by session id regardless of case', () => {
    expect(ResolveTurnAgentName(makeState(), 'a1')).toBe('Sage');
  });

  it('falls back to a neutral name for an unknown or missing id', () => {
    expect(ResolveTurnAgentName(makeState(), 'gone')).toBe('An agent');
    expect(ResolveTurnAgentName(makeState(), null)).toBe('An agent');
    expect(ResolveTurnAgentName(makeState(), undefined)).toBe('An agent');
  });
});

describe('SummarizeFloor', () => {
  it('is free when nobody has it', () => {
    expect(SummarizeFloor(makeState())).toMatchObject({ Kind: 'free', Label: 'The floor is free' });
  });

  it('names the agent holding it', () => {
    expect(SummarizeFloor(makeState({ FloorHolderAgentSessionId: 'A1' }))).toEqual({ Kind: 'agent', Label: 'Sage has the floor', AgentSessionId: 'A1' });
  });

  it('puts a person speaking above everything — humans win', () => {
    const summary = SummarizeFloor(makeState({ HumanSpeaking: true, FloorHolderAgentSessionId: 'A1', LoopCapReached: true }));
    expect(summary.Kind).toBe('human');
  });

  it('still shows the holder when the cap was reached by its own turn', () => {
    expect(SummarizeFloor(makeState({ FloorHolderAgentSessionId: 'A1', LoopCapReached: true })).Kind).toBe('agent');
  });

  it('reports the cap once the floor is empty', () => {
    expect(SummarizeFloor(makeState({ LoopCapReached: true })).Kind).toBe('capped');
  });

  it('shows a hand-off reservation', () => {
    expect(SummarizeFloor(makeState({ PendingHandoffToAgentSessionId: 'B2' }))).toEqual({
      Kind: 'reserved',
      Label: 'Floor reserved for Demo Loop',
      AgentSessionId: 'B2',
    });
  });
});

describe('SummarizeLoopCap', () => {
  it('is ok well under the cap', () => {
    expect(SummarizeLoopCap(makeState({ ConsecutiveAgentTurns: 2 }))).toEqual({ Percent: 25, Label: '2 of 8 agent turns in a row', Level: 'ok' });
  });

  it('warns when close and flags capped at the cap', () => {
    expect(SummarizeLoopCap(makeState({ ConsecutiveAgentTurns: 6 })).Level).toBe('warn');
    expect(SummarizeLoopCap(makeState({ ConsecutiveAgentTurns: 8, LoopCapReached: true })).Level).toBe('capped');
  });

  it('never divides by zero or overflows the bar', () => {
    expect(SummarizeLoopCap(makeState({ ConsecutiveAgentTurns: 3, MaxConsecutiveAgentTurns: 0 })).Percent).toBe(100);
    expect(SummarizeLoopCap(makeState({ ConsecutiveAgentTurns: 99, MaxConsecutiveAgentTurns: 8 })).Percent).toBe(100);
    expect(SummarizeLoopCap(makeState({ ConsecutiveAgentTurns: -4 })).Percent).toBe(0);
  });
});

describe('LabelTurnReason', () => {
  it('translates the reason codes the coordinator uses', () => {
    expect(LabelTurnReason('HeldByOtherAgent')).toContain('another agent');
    expect(LabelTurnReason('ReservedForHandoff')).toContain('hand-off');
    expect(LabelTurnReason('HumanSpeaking')).toContain('person');
    expect(LabelTurnReason('LoopCapReached')).toContain('cap');
    expect(LabelTurnReason('NotInRoom')).toContain('not seated');
  });

  it('passes an unknown code through and handles none', () => {
    expect(LabelTurnReason('SomethingNew')).toBe('SomethingNew');
    expect(LabelTurnReason(undefined)).toBe('no reason given');
  });
});

describe('DescribeTurnEvent', () => {
  const state = makeState();

  it('describes each kind of event in plain language', () => {
    expect(DescribeTurnEvent(event(1, 'FloorGranted', { AgentSessionId: 'A1' }), state)).toBe('Sage took the floor');
    expect(DescribeTurnEvent(event(2, 'FloorReleased', { AgentSessionId: 'A1' }), state)).toContain('released');
    expect(DescribeTurnEvent(event(3, 'FloorDenied', { AgentSessionId: 'B2', Reason: 'HumanSpeaking' }), state)).toBe('Demo Loop was held back: a person is speaking');
    expect(DescribeTurnEvent(event(4, 'Backchannel', { AgentSessionId: 'B2' }), state)).toContain('no floor taken');
    expect(DescribeTurnEvent(event(5, 'HumanSpeech'), state)).toBe('A person started speaking');
    expect(DescribeTurnEvent(event(6, 'HumanPreempted', { AgentSessionId: 'A1' }), state)).toBe('A person cut in on Sage');
    expect(DescribeTurnEvent(event(7, 'LoopCapReached'), state)).toContain('turn cap');
  });

  it('distinguishes a hand-off to a named agent from a plain yield', () => {
    expect(DescribeTurnEvent(event(1, 'Yielded', { AgentSessionId: 'A1', ToAgentSessionId: 'B2' }), state)).toBe('Sage handed the floor to Demo Loop');
    expect(DescribeTurnEvent(event(2, 'Yielded', { AgentSessionId: 'A1' }), state)).toBe('Sage gave the floor back to the room');
  });
});

describe('BuildTurnEventRows', () => {
  it('returns the newest event first, with an icon, a tone and a clock time', () => {
    const state = makeState({ RecentEvents: [event(1, 'FloorGranted', { AgentSessionId: 'A1' }), event(2, 'HumanPreempted', { AgentSessionId: 'A1' })] });
    const rows = BuildTurnEventRows(state);
    expect(rows.map(r => r.Seq)).toEqual([2, 1]);
    expect(rows[0]).toMatchObject({ Tone: 'bad', Icon: expect.stringContaining('fa-') });
    expect(rows[1].Tone).toBe('good');
    expect(rows[0].Time).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('caps the feed', () => {
    const many = Array.from({ length: 30 }, (_, i) => event(i + 1, 'HumanSpeech'));
    expect(BuildTurnEventRows(makeState({ RecentEvents: many }))).toHaveLength(LIVEKIT_TURN_FEED_DEFAULT_ROWS);
    expect(BuildTurnEventRows(makeState({ RecentEvents: many }), 3).map(r => r.Seq)).toEqual([30, 29, 28]);
    expect(BuildTurnEventRows(makeState({ RecentEvents: many }), 0)).toEqual([]);
  });

  it('does not reorder the caller\'s array', () => {
    const events = [event(1, 'HumanSpeech'), event(2, 'HumanSpeech')];
    BuildTurnEventRows(makeState({ RecentEvents: events }));
    expect(events.map(e => e.Seq)).toEqual([1, 2]);
  });
});

describe('BuildTurnSeats', () => {
  it('marks who holds the floor and who is next, with readable mode and addressing labels', () => {
    const seats = BuildTurnSeats(makeState({ FloorHolderAgentSessionId: 'a1', PendingHandoffToAgentSessionId: 'B2' }));
    expect(seats[0]).toMatchObject({ Name: 'Sage', ModeLabel: 'Passive', AddressingLabel: 'Model-side', FullDuplex: true, HasFloor: true, HasReservation: false });
    expect(seats[1]).toMatchObject({ Name: 'Demo Loop', ModeLabel: 'Active', AddressingLabel: 'Name match', FullDuplex: false, HasFloor: false, HasReservation: true });
  });

  it('marks nobody when the floor is free', () => {
    expect(BuildTurnSeats(makeState()).every(s => !s.HasFloor && !s.HasReservation)).toBe(true);
  });
});
