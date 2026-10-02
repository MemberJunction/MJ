/**
 * @fileoverview Pure, Angular-free selection/derivation helpers for the LiveKit room UI. The room
 * component delegates its layout getters here so the (DI-bound, DOM-dependent) component stays thin and
 * this logic is unit-testable in a plain node environment — participant selection, spotlight/pin
 * resolution, split-view panes, and agent-state derivation.
 *
 * @module @memberjunction/ng-livekit-room
 */

import type { LiveKitParticipantView, LiveKitRoomState } from '@memberjunction/livekit-room-core';
import type { LiveKitAgentVisualState } from './components/livekit-agent-state.component';

/** The participants to render on the stage (local optionally included), local first. */
export function SelectDisplayParticipants(state: LiveKitRoomState, showSelfView: boolean): LiveKitParticipantView[] {
  const list: LiveKitParticipantView[] = [];
  if (state.Local && showSelfView) {
    list.push(state.Local);
  }
  list.push(...state.Remote);
  return list;
}

/** @deprecated Use {@link SelectDisplayParticipants}. */
export function selectDisplayParticipants(state: LiveKitRoomState, showSelfView: boolean): LiveKitParticipantView[] {
  return SelectDisplayParticipants(state, showSelfView);
}

/** All participants (local + remote) for the roster / counts, local first. */
export function SelectAllParticipants(state: LiveKitRoomState): LiveKitParticipantView[] {
  return state.Local ? [state.Local, ...state.Remote] : [...state.Remote];
}

/** @deprecated Use {@link SelectAllParticipants}. */
export function selectAllParticipants(state: LiveKitRoomState): LiveKitParticipantView[] {
  return SelectAllParticipants(state);
}

/**
 * The spotlight participant: a pin wins (when pinning is enabled), then the active speaker, then the
 * agent, then the first remote, then local.
 */
export function SelectSpotlight(state: LiveKitRoomState, pinnedIdentity: string | null, enablePinning: boolean): LiveKitParticipantView | null {
  if (enablePinning && pinnedIdentity) {
    const pinned = SelectAllParticipants(state).find((p) => p.Identity === pinnedIdentity);
    if (pinned) {
      return pinned;
    }
  }
  const speakingId = state.ActiveSpeakerIdentities.find((id) => id !== state.Local?.Identity);
  // Prefer the native dominant-speaker list, but fall back to the per-participant IsSpeaking flag — the same
  // signal the tile ring uses. ActiveSpeakersChanged (server-computed) can omit a server-published AGENT,
  // so without this fallback a speaking agent never becomes the spotlight even though its tile lights up.
  const bySpeaking =
    (speakingId ? state.Remote.find((p) => p.Identity === speakingId) : undefined) ??
    state.Remote.find((p) => p.IsSpeaking);
  const byAgent = state.Remote.find((p) => p.Role === 'agent');
  return bySpeaking ?? byAgent ?? state.Remote[0] ?? state.Local ?? null;
}

/** @deprecated Use {@link SelectSpotlight}. */
export function selectSpotlight(state: LiveKitRoomState, pinnedIdentity: string | null, enablePinning: boolean): LiveKitParticipantView | null {
  return SelectSpotlight(state, pinnedIdentity, enablePinning);
}

/** The non-spotlight participants for the spotlight filmstrip. */
export function SelectFilmstrip(displayParticipants: LiveKitParticipantView[], spotlight: LiveKitParticipantView | null): LiveKitParticipantView[] {
  return displayParticipants.filter((p) => p.Identity !== spotlight?.Identity);
}

/** @deprecated Use {@link SelectFilmstrip}. */
export function selectFilmstrip(displayParticipants: LiveKitParticipantView[], spotlight: LiveKitParticipantView | null): LiveKitParticipantView[] {
  return SelectFilmstrip(displayParticipants, spotlight);
}

/** The participant currently sharing their screen (for split view), if any. */
export function SelectScreenShare(allParticipants: LiveKitParticipantView[]): LiveKitParticipantView | null {
  return allParticipants.find((p) => p.IsScreenSharing) ?? null;
}

/** @deprecated Use {@link SelectScreenShare}. */
export function selectScreenShare(allParticipants: LiveKitParticipantView[]): LiveKitParticipantView | null {
  return SelectScreenShare(allParticipants);
}

/** The "speaker" pane for split view: active speaker (not the sharer) → agent → first non-sharer → local. */
export function SelectSplitSpeaker(state: LiveKitRoomState): LiveKitParticipantView | null {
  const screenId = SelectScreenShare(SelectAllParticipants(state))?.Identity;
  const speakingId = state.ActiveSpeakerIdentities.find((id) => id !== screenId);
  const all = SelectAllParticipants(state);
  // Same fallback as the spotlight: the per-participant IsSpeaking flag catches a server-published agent
  // the native active-speaker list misses. Exclude the screen-sharer so the speaker pane stays the talker.
  const bySpeaking =
    (speakingId ? all.find((p) => p.Identity === speakingId) : undefined) ??
    all.find((p) => p.IsSpeaking && p.Identity !== screenId);
  const byAgent = state.Remote.find((p) => p.Role === 'agent');
  return bySpeaking ?? byAgent ?? state.Remote.find((p) => p.Identity !== screenId) ?? state.Local ?? null;
}

/** @deprecated Use {@link SelectSplitSpeaker}. */
export function selectSplitSpeaker(state: LiveKitRoomState): LiveKitParticipantView | null {
  return SelectSplitSpeaker(state);
}

/**
 * Derives the agent's visual state: an explicit data-channel signal wins; otherwise it's inferred from
 * speaking activity (agent speaking → speaking, local speaking → listening, else idle).
 */
export function DeriveAgentState(state: LiveKitRoomState, signal: LiveKitAgentVisualState | null): LiveKitAgentVisualState {
  if (signal) {
    return signal;
  }
  // Any agent speaking (multi-agent room) → speaking; not just the first-joined agent.
  if (state.Remote.some((p) => p.Role === 'agent' && p.IsSpeaking)) {
    return 'speaking';
  }
  if (state.Local?.IsSpeaking) {
    return 'listening';
  }
  return 'idle';
}

/** @deprecated Use {@link DeriveAgentState}. */
export function deriveAgentState(state: LiveKitRoomState, signal: LiveKitAgentVisualState | null): LiveKitAgentVisualState {
  return DeriveAgentState(state, signal);
}

/** Type guard for a valid agent-state signal string received over the data channel. */
export function IsAgentVisualState(raw: string): raw is LiveKitAgentVisualState {
  return raw === 'idle' || raw === 'listening' || raw === 'thinking' || raw === 'speaking';
}

/** @deprecated Use {@link IsAgentVisualState}. */
export function isAgentVisualState(raw: string): raw is LiveKitAgentVisualState {
  return IsAgentVisualState(raw);
}
