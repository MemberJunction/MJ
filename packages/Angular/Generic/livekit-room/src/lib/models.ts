import type { LiveKitDevice } from '@memberjunction/livekit-room-core';

/** One chat message rendered in the chat panel (sourced from the LiveKit data channel). */
export interface LiveKitChatMessage {
  /** The sender's display name. */
  Sender: string;
  /** The sender's participant identity, when known. */
  SenderIdentity?: string;
  /** The message text. */
  Text: string;
  /** Epoch-ms timestamp. */
  Timestamp: number;
  /** Whether the local user sent this message. */
  IsLocal: boolean;
}

/** A selection emitted by the device menu. */
export interface LiveKitDeviceSelection {
  /** The device kind being switched. */
  Kind: LiveKitDevice['Kind'];
  /** The selected device id. */
  DeviceId: string;
}

/** The set of devices the device menu renders. */
export interface LiveKitDeviceLists {
  /** Available microphones. */
  Microphones: LiveKitDevice[];
  /** Available cameras. */
  Cameras: LiveKitDevice[];
  /** Available speakers (audio outputs). */
  Speakers: LiveKitDevice[];
}

/** The data-channel topic the chat panel publishes/consumes under. */
export const LIVEKIT_CHAT_TOPIC = 'lk-chat';

/**
 * The data-channel topic an agent publishes its conversational state on (`idle`/`listening`/`thinking`/
 * `speaking`). The room UI listens on this topic to drive the agent-state visualizer when the server
 * bridge emits explicit state, falling back to speaking-activity heuristics otherwise.
 */
export const LIVEKIT_AGENT_STATE_TOPIC = 'lk-agent-state';

/**
 * The data-channel topic collaborative whiteboard snapshots are broadcast on. Each client applies inbound
 * snapshots to its `WhiteboardState`; an agent in a realtime session co-authors via the same topic.
 */
export const LIVEKIT_WHITEBOARD_TOPIC = 'lk-whiteboard';

// ── Turn-taking display models ─────────────────────────────────────────────────────
// Structurally identical to the shapes the MJ binding reads from the server (see
// `LiveKitRoomTurnState` in `@memberjunction/graphql-dataprovider`), declared here so this generic package
// stays MJ-agnostic: any host that can produce these objects can drive the turn-taking panel.

/** The kinds of events a room's turn-taking log records. */
export type LiveKitTurnEventKind =
  | 'FloorGranted'
  | 'FloorReleased'
  | 'FloorDenied'
  | 'Yielded'
  | 'Backchannel'
  | 'HumanSpeech'
  | 'HumanPreempted'
  | 'LoopCapReached';

/** One recorded turn-taking event. */
export interface LiveKitTurnEventModel {
  /** Monotonic per-room sequence number. */
  Seq: number;
  /** Epoch-ms the event happened. */
  AtMs: number;
  /** What happened. */
  Type: LiveKitTurnEventKind;
  /** The agent session the event is about, when it concerns one. */
  AgentSessionId?: string;
  /** For `Yielded`: the agent the floor was handed to. */
  ToAgentSessionId?: string;
  /** A short machine-readable reason (e.g. `HeldByOtherAgent`). */
  Reason?: string;
}

/** One agent seated in the room. */
export interface LiveKitTurnAgentModel {
  /** The agent's session id (matches the ids elsewhere in the state). */
  AgentSessionID: string;
  /** The names the agent answers to; the first is its display name. */
  Names: string[];
  /** The configured turn-taking mode. */
  TurnMode: 'Passive' | 'Active' | 'Hybrid';
  /** How it decides it was addressed. */
  Addressing: 'ModelSide' | 'Regex';
  /** Whether its model is full-duplex. */
  FullDuplex: boolean;
}

/** A room's live turn-taking state. */
export interface LiveKitTurnStateModel {
  /** The agent session holding the floor, or `null` when it is free. */
  FloorHolderAgentSessionId: string | null;
  /** Whether a person is speaking right now. */
  HumanSpeaking: boolean;
  /** The agent session the floor is reserved for after a hand-off, or `null`. */
  PendingHandoffToAgentSessionId: string | null;
  /** Consecutive agent turns since a person last spoke. */
  ConsecutiveAgentTurns: number;
  /** The cap on consecutive agent turns. */
  MaxConsecutiveAgentTurns: number;
  /** Whether the loop cap is reached — agents are passive until a person speaks. */
  LoopCapReached: boolean;
  /** How many backchannels the room has recorded. */
  BackchannelCount: number;
  /** The most recent events, oldest first. */
  RecentEvents: LiveKitTurnEventModel[];
  /** The agents seated in the room. */
  Agents: LiveKitTurnAgentModel[];
}
