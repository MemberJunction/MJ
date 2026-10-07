/**
 * Pure presentation logic for the turn-taking panel — turns a room's raw turn-taking state into the labels,
 * tones and rows the panel renders. No Angular, no data access: everything here is a function of its inputs, so
 * it is testable with a plain object and reusable by any host.
 */

import type { LiveKitTurnAgentModel, LiveKitTurnEventKind, LiveKitTurnEventModel, LiveKitTurnStateModel } from './models';

/** Who the floor belongs to right now. */
export type LiveKitFloorKind = 'free' | 'agent' | 'human' | 'reserved' | 'capped';

/** A one-line description of the floor. */
export interface LiveKitFloorSummary {
  /** The kind of state the floor is in. */
  Kind: LiveKitFloorKind;
  /** A human-readable label (e.g. "Sage has the floor"). */
  Label: string;
  /** The agent session that holds (or is reserved) the floor, when one does. */
  AgentSessionId: string | null;
}

/** How close agents are to the agent-to-agent loop cap. */
export interface LiveKitLoopCapSummary {
  /** 0–100, for a progress bar. */
  Percent: number;
  /** e.g. "3 of 8 agent turns in a row". */
  Label: string;
  /** `ok` while well under the cap, `warn` when close, `capped` once reached. */
  Level: 'ok' | 'warn' | 'capped';
}

/** How an event row should be toned. */
export type LiveKitTurnTone = 'neutral' | 'good' | 'warn' | 'bad';

/** One rendered row of the event feed. */
export interface LiveKitTurnEventRow {
  /** The event's sequence number (the `@for` track key). */
  Seq: number;
  /** A Font Awesome class for the row's icon. */
  Icon: string;
  /** The row's tone. */
  Tone: LiveKitTurnTone;
  /** The sentence describing what happened. */
  Text: string;
  /** The event's clock time, in the viewer's locale. */
  Time: string;
}

/** One agent seat, ready to render. */
export interface LiveKitTurnSeat {
  /** The agent's session id. */
  AgentSessionId: string;
  /** The agent's display name. */
  Name: string;
  /** e.g. "Passive". */
  ModeLabel: string;
  /** e.g. "Model-side" or "Name match". */
  AddressingLabel: string;
  /** Whether the agent's model is full-duplex. */
  FullDuplex: boolean;
  /** Whether it holds the floor right now. */
  HasFloor: boolean;
  /** Whether the floor is reserved for it by a hand-off. */
  HasReservation: boolean;
}

/** The loop-cap fraction at or above which the meter warns. */
export const LIVEKIT_LOOP_CAP_WARN_FRACTION = 0.75;

/** How many events the feed shows by default. */
export const LIVEKIT_TURN_FEED_DEFAULT_ROWS = 12;

/**
 * An agent's display name in the state, or a neutral fallback for an id the state does not list (a bot that
 * left between polls).
 *
 * @param state The room's turn-taking state.
 * @param agentSessionId The agent session to name.
 */
export function ResolveTurnAgentName(state: LiveKitTurnStateModel, agentSessionId: string | null | undefined): string {
  if (!agentSessionId) {
    return 'An agent';
  }
  const wanted = agentSessionId.toLowerCase();
  const agent = state.Agents.find(a => a.AgentSessionID.toLowerCase() === wanted);
  return agent?.Names[0]?.trim() || 'An agent';
}

/**
 * Describes the floor, most urgent state first: a person speaking outranks everything (humans win), then an
 * agent still holding it (even when it was the last turn the cap allows), then a reached loop cap, then a
 * reservation for a hand-off, then free.
 *
 * @param state The room's turn-taking state.
 */
export function SummarizeFloor(state: LiveKitTurnStateModel): LiveKitFloorSummary {
  if (state.HumanSpeaking) {
    return { Kind: 'human', Label: 'A person is speaking', AgentSessionId: null };
  }
  if (state.FloorHolderAgentSessionId) {
    const name = ResolveTurnAgentName(state, state.FloorHolderAgentSessionId);
    return { Kind: 'agent', Label: `${name} has the floor`, AgentSessionId: state.FloorHolderAgentSessionId };
  }
  if (state.LoopCapReached) {
    return { Kind: 'capped', Label: 'Agents paused until a person speaks', AgentSessionId: null };
  }
  if (state.PendingHandoffToAgentSessionId) {
    const name = ResolveTurnAgentName(state, state.PendingHandoffToAgentSessionId);
    return { Kind: 'reserved', Label: `Floor reserved for ${name}`, AgentSessionId: state.PendingHandoffToAgentSessionId };
  }
  return { Kind: 'free', Label: 'The floor is free', AgentSessionId: null };
}

/**
 * How many agent turns have run back to back against the cap.
 *
 * @param state The room's turn-taking state.
 */
export function SummarizeLoopCap(state: LiveKitTurnStateModel): LiveKitLoopCapSummary {
  const max = Math.max(1, state.MaxConsecutiveAgentTurns);
  const used = Math.max(0, state.ConsecutiveAgentTurns);
  const fraction = Math.min(1, used / max);
  const level = state.LoopCapReached || fraction >= 1 ? 'capped' : fraction >= LIVEKIT_LOOP_CAP_WARN_FRACTION ? 'warn' : 'ok';
  return { Percent: Math.round(fraction * 100), Label: `${used} of ${max} agent turns in a row`, Level: level };
}

/**
 * Human-readable text for a floor-denial / decision reason code.
 *
 * @param reason The machine-readable reason (e.g. `HeldByOtherAgent`).
 */
export function LabelTurnReason(reason: string | undefined): string {
  switch (reason) {
    case 'HeldByOtherAgent':
      return 'another agent has the floor';
    case 'ReservedForHandoff':
      return 'the floor is reserved for a hand-off';
    case 'HumanSpeaking':
      return 'a person is speaking';
    case 'LoopCapReached':
      return 'the agent turn cap is reached';
    case 'NotInRoom':
    case 'UnknownRoom':
      return 'it is not seated in the room';
    case 'FacilitatorOverride':
      return 'facilitator override';
    case 'HandoffGranted':
      return 'hand-off';
    default:
      return reason ?? 'no reason given';
  }
}

/** The icon and tone for each event kind. */
const EVENT_STYLE: Record<LiveKitTurnEventKind, { Icon: string; Tone: LiveKitTurnTone }> = {
  FloorGranted: { Icon: 'fa-solid fa-microphone-lines', Tone: 'good' },
  FloorReleased: { Icon: 'fa-solid fa-microphone-lines-slash', Tone: 'neutral' },
  FloorDenied: { Icon: 'fa-solid fa-hand', Tone: 'warn' },
  Yielded: { Icon: 'fa-solid fa-share', Tone: 'neutral' },
  Backchannel: { Icon: 'fa-solid fa-comment-dots', Tone: 'neutral' },
  HumanSpeech: { Icon: 'fa-solid fa-user', Tone: 'neutral' },
  HumanPreempted: { Icon: 'fa-solid fa-user-large', Tone: 'bad' },
  LoopCapReached: { Icon: 'fa-solid fa-rotate', Tone: 'bad' },
};

/**
 * Describes one event as a sentence.
 *
 * @param event The recorded event.
 * @param state The room's state (to resolve agent names).
 */
export function DescribeTurnEvent(event: LiveKitTurnEventModel, state: LiveKitTurnStateModel): string {
  const who = ResolveTurnAgentName(state, event.AgentSessionId);
  switch (event.Type) {
    case 'FloorGranted':
      return `${who} took the floor`;
    case 'FloorReleased':
      return `${who} finished and released the floor`;
    case 'FloorDenied':
      return `${who} was held back: ${LabelTurnReason(event.Reason)}`;
    case 'Yielded':
      return event.ToAgentSessionId ? `${who} handed the floor to ${ResolveTurnAgentName(state, event.ToAgentSessionId)}` : `${who} gave the floor back to the room`;
    case 'Backchannel':
      return `${who} acknowledged (a backchannel — no floor taken)`;
    case 'HumanSpeech':
      return 'A person started speaking';
    case 'HumanPreempted':
      return `A person cut in on ${who}`;
    case 'LoopCapReached':
      return 'Agent turn cap reached — agents wait for a person';
    default:
      return String(event.Type);
  }
}

/**
 * The event feed: newest first, capped, each row ready to render.
 *
 * @param state The room's turn-taking state.
 * @param maxRows The most rows to return. Defaults to {@link LIVEKIT_TURN_FEED_DEFAULT_ROWS}.
 * @param locale The locale for the time column. Defaults to the viewer's.
 */
export function BuildTurnEventRows(state: LiveKitTurnStateModel, maxRows: number = LIVEKIT_TURN_FEED_DEFAULT_ROWS, locale?: string): LiveKitTurnEventRow[] {
  return state.RecentEvents.slice()
    .sort((a, b) => b.Seq - a.Seq)
    .slice(0, Math.max(0, maxRows))
    .map(event => ({
      Seq: event.Seq,
      Icon: EVENT_STYLE[event.Type]?.Icon ?? 'fa-solid fa-circle',
      Tone: EVENT_STYLE[event.Type]?.Tone ?? 'neutral',
      Text: DescribeTurnEvent(event, state),
      Time: new Date(event.AtMs).toLocaleTimeString(locale, { hour12: false }),
    }));
}

/** The label for a turn-taking mode. */
function modeLabel(agent: LiveKitTurnAgentModel): string {
  return agent.TurnMode;
}

/** The label for how an agent decides it was addressed. */
function addressingLabel(agent: LiveKitTurnAgentModel): string {
  return agent.Addressing === 'ModelSide' ? 'Model-side' : 'Name match';
}

/**
 * Each agent seat, ready to render, with whether it holds the floor or has it reserved.
 *
 * @param state The room's turn-taking state.
 */
export function BuildTurnSeats(state: LiveKitTurnStateModel): LiveKitTurnSeat[] {
  const holder = state.FloorHolderAgentSessionId?.toLowerCase() ?? null;
  const reserved = state.PendingHandoffToAgentSessionId?.toLowerCase() ?? null;
  return state.Agents.map(agent => {
    const id = agent.AgentSessionID.toLowerCase();
    return {
      AgentSessionId: agent.AgentSessionID,
      Name: agent.Names[0]?.trim() || 'Agent',
      ModeLabel: modeLabel(agent),
      AddressingLabel: addressingLabel(agent),
      FullDuplex: agent.FullDuplex,
      HasFloor: holder !== null && id === holder,
      HasReservation: reserved !== null && id === reserved,
    };
  });
}
