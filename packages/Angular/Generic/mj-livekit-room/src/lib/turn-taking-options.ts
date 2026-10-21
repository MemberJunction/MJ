import type { LiveKitRoomTurnState } from '@memberjunction/graphql-dataprovider';

/** The turn-taking mode an agent runs in. */
export type TurnModeChoice = 'Passive' | 'Active' | 'Hybrid';

/**
 * How an agent decides it has been addressed. `Auto` lets the server use the model's own judgement when the
 * model can give it and fall back to name matching otherwise; the other two force one or the other.
 */
export type TurnAddressingChoice = 'Auto' | 'ModelSide' | 'Regex';

/** One entry in a turn-taking select. */
export interface TurnTakingOption<T extends string> {
  /** The value the server receives. */
  Value: T;
  /** The label shown in the select. */
  Label: string;
  /** A one-line explanation, shown as the option's tooltip. */
  Hint: string;
}

/** The turn-taking modes a user can seat an agent with. */
export const TURN_MODE_OPTIONS: ReadonlyArray<TurnTakingOption<TurnModeChoice>> = [
  { Value: 'Passive', Label: 'Passive', Hint: 'Speaks only when addressed, or when handed the floor.' },
  { Value: 'Active', Label: 'Active', Hint: 'Joins in whenever the floor is free.' },
  { Value: 'Hybrid', Label: 'Hybrid', Hint: 'Speaks when addressed, and chips in when the conversation invites it.' },
];

/** The addressing modes a user can seat an agent with. */
export const TURN_ADDRESSING_OPTIONS: ReadonlyArray<TurnTakingOption<TurnAddressingChoice>> = [
  { Value: 'Auto', Label: 'Auto', Hint: 'The model judges whether it was addressed when it can; name matching otherwise.' },
  { Value: 'ModelSide', Label: 'Model-side', Hint: 'The model judges whether it was addressed (it reports back through a host tool).' },
  { Value: 'Regex', Label: 'Name match', Hint: 'The agent answers only when its name is said.' },
];

/**
 * Reads a select's value as a turn mode.
 *
 * @param value The raw option value (empty = "use the default").
 * @returns The mode, or `null` for the empty / an unknown value.
 */
export function ParseTurnMode(value: string | null | undefined): TurnModeChoice | null {
  return TURN_MODE_OPTIONS.find(o => o.Value === value)?.Value ?? null;
}

/**
 * Reads a select's value as an addressing mode.
 *
 * @param value The raw option value (empty = "use the default").
 * @returns The mode, or `null` for the empty / an unknown value.
 */
export function ParseTurnAddressing(value: string | null | undefined): TurnAddressingChoice | null {
  return TURN_ADDRESSING_OPTIONS.find(o => o.Value === value)?.Value ?? null;
}

/** How a roster row shows an agent's place in the turn-taking. */
export interface RosterTurnBadge {
  /** Whether the agent holds the floor right now. */
  HasFloor: boolean;
  /** Whether the floor is reserved for it after a hand-off. */
  HasReservation: boolean;
  /** e.g. "Passive · Model-side". */
  Label: string;
}

/**
 * The turn-taking badge for one agent in the roster, from the room's live state.
 *
 * @param state The room's turn-taking state, or `null` before the first poll.
 * @param sessionBridgeId The agent's bridge row id (what the roster tracks it by).
 * @returns The badge, or `null` while the state does not list the agent yet.
 */
export function BuildRosterTurnBadge(state: LiveKitRoomTurnState | null, sessionBridgeId: string): RosterTurnBadge | null {
  const agent = state?.Agents.find(a => a.SessionBridgeID.toLowerCase() === sessionBridgeId.toLowerCase());
  if (!state || !agent) {
    return null;
  }
  const id = agent.AgentSessionID.toLowerCase();
  const addressing = agent.Addressing === 'ModelSide' ? 'Model-side' : 'Name match';
  return {
    HasFloor: state.FloorHolderAgentSessionId?.toLowerCase() === id,
    HasReservation: state.PendingHandoffToAgentSessionId?.toLowerCase() === id,
    Label: `${agent.TurnMode} · ${addressing}`,
  };
}

/**
 * Whether the room's turn-taking state should be polled: only with the feature on, a resolved room, and either
 * several agents seated (there is something to watch) or the panel open (someone is looking).
 *
 * @param enabled The `EnableTurnTaking` gate.
 * @param roomName The resolved room, if any.
 * @param agentCount How many agents the roster holds.
 * @param panelOpen Whether the turn-taking panel is open.
 */
export function ShouldPollTurnState(enabled: boolean, roomName: string | null, agentCount: number, panelOpen: boolean): boolean {
  return enabled && !!roomName && (agentCount >= 2 || panelOpen);
}
