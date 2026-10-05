import { describe, expect, it } from 'vitest';
import type { LiveKitRoomTurnState } from '@memberjunction/graphql-dataprovider';
import { BuildRosterTurnBadge, ParseTurnAddressing, ParseTurnMode, ShouldPollTurnState, TURN_ADDRESSING_OPTIONS, TURN_MODE_OPTIONS } from '../lib/turn-taking-options';

function state(overrides: Partial<LiveKitRoomTurnState> = {}): LiveKitRoomTurnState {
  return {
    RoomId: 'r',
    AgentSessionIds: ['A1', 'B2'],
    FacilitatorAgentSessionId: null,
    FloorHolderAgentSessionId: null,
    FloorHeldSinceMs: null,
    HumanSpeaking: false,
    PendingHandoffToAgentSessionId: null,
    ConsecutiveAgentTurns: 0,
    MaxConsecutiveAgentTurns: 8,
    LoopCapReached: false,
    BackchannelCount: 0,
    RecentEvents: [],
    Agents: [
      { AgentSessionID: 'A1', SessionBridgeID: 'br-1', Names: ['Sage'], TurnMode: 'Passive', Addressing: 'ModelSide', FullDuplex: true },
      { AgentSessionID: 'B2', SessionBridgeID: 'br-2', Names: ['Demo'], TurnMode: 'Active', Addressing: 'Regex', FullDuplex: false },
    ],
    ...overrides,
  } as LiveKitRoomTurnState;
}

describe('ParseTurnMode / ParseTurnAddressing', () => {
  it('accept every offered value and nothing else', () => {
    for (const o of TURN_MODE_OPTIONS) {
      expect(ParseTurnMode(o.Value)).toBe(o.Value);
    }
    for (const o of TURN_ADDRESSING_OPTIONS) {
      expect(ParseTurnAddressing(o.Value)).toBe(o.Value);
    }
    expect(ParseTurnMode('')).toBeNull();
    expect(ParseTurnMode('Loud')).toBeNull();
    expect(ParseTurnAddressing(undefined)).toBeNull();
    expect(ParseTurnAddressing('Telepathy')).toBeNull();
  });

  it('offers every mode with a hint', () => {
    expect(TURN_MODE_OPTIONS.map(o => o.Value)).toEqual(['Passive', 'Active', 'Hybrid']);
    expect(TURN_ADDRESSING_OPTIONS.map(o => o.Value)).toEqual(['Auto', 'ModelSide', 'Regex']);
    expect([...TURN_MODE_OPTIONS, ...TURN_ADDRESSING_OPTIONS].every(o => o.Hint.length > 0)).toBe(true);
  });
});

describe('BuildRosterTurnBadge', () => {
  it('labels the agent and marks the floor holder and the reservation', () => {
    const s = state({ FloorHolderAgentSessionId: 'a1', PendingHandoffToAgentSessionId: 'B2' });
    expect(BuildRosterTurnBadge(s, 'BR-1')).toEqual({ HasFloor: true, HasReservation: false, Label: 'Passive · Model-side' });
    expect(BuildRosterTurnBadge(s, 'br-2')).toEqual({ HasFloor: false, HasReservation: true, Label: 'Active · Name match' });
  });

  it('is null before the first poll and for an agent the state does not list', () => {
    expect(BuildRosterTurnBadge(null, 'br-1')).toBeNull();
    expect(BuildRosterTurnBadge(state(), 'unknown')).toBeNull();
  });
});

describe('ShouldPollTurnState', () => {
  it('polls only with the gate on, a room, and something to watch or someone watching', () => {
    expect(ShouldPollTurnState(true, 'room', 2, false)).toBe(true);
    expect(ShouldPollTurnState(true, 'room', 1, true)).toBe(true);
    expect(ShouldPollTurnState(true, 'room', 1, false)).toBe(false);
    expect(ShouldPollTurnState(false, 'room', 3, true)).toBe(false);
    expect(ShouldPollTurnState(true, null, 3, true)).toBe(false);
  });
});
