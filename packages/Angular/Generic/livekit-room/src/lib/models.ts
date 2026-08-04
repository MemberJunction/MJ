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
