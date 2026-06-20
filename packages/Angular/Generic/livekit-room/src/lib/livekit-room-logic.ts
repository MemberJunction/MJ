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
export function selectDisplayParticipants(state: LiveKitRoomState, showSelfView: boolean): LiveKitParticipantView[] {
  const list: LiveKitParticipantView[] = [];
  if (state.Local && showSelfView) {
    list.push(state.Local);
  }
  list.push(...state.Remote);
  return list;
}

/** All participants (local + remote) for the roster / counts, local first. */
export function selectAllParticipants(state: LiveKitRoomState): LiveKitParticipantView[] {
  return state.Local ? [state.Local, ...state.Remote] : [...state.Remote];
}

/**
 * The spotlight participant: a pin wins (when pinning is enabled), then the active speaker, then the
 * agent, then the first remote, then local.
 */
export function selectSpotlight(state: LiveKitRoomState, pinnedIdentity: string | null, enablePinning: boolean): LiveKitParticipantView | null {
  if (enablePinning && pinnedIdentity) {
    const pinned = selectAllParticipants(state).find((p) => p.Identity === pinnedIdentity);
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

/** The non-spotlight participants for the spotlight filmstrip. */
export function selectFilmstrip(displayParticipants: LiveKitParticipantView[], spotlight: LiveKitParticipantView | null): LiveKitParticipantView[] {
  return displayParticipants.filter((p) => p.Identity !== spotlight?.Identity);
}

/** The participant currently sharing their screen (for split view), if any. */
export function selectScreenShare(allParticipants: LiveKitParticipantView[]): LiveKitParticipantView | null {
  return allParticipants.find((p) => p.IsScreenSharing) ?? null;
}

/** The "speaker" pane for split view: active speaker (not the sharer) → agent → first non-sharer → local. */
export function selectSplitSpeaker(state: LiveKitRoomState): LiveKitParticipantView | null {
  const screenId = selectScreenShare(selectAllParticipants(state))?.Identity;
  const speakingId = state.ActiveSpeakerIdentities.find((id) => id !== screenId);
  const all = selectAllParticipants(state);
  // Same fallback as the spotlight: the per-participant IsSpeaking flag catches a server-published agent
  // the native active-speaker list misses. Exclude the screen-sharer so the speaker pane stays the talker.
  const bySpeaking =
    (speakingId ? all.find((p) => p.Identity === speakingId) : undefined) ??
    all.find((p) => p.IsSpeaking && p.Identity !== screenId);
  const byAgent = state.Remote.find((p) => p.Role === 'agent');
  return bySpeaking ?? byAgent ?? state.Remote.find((p) => p.Identity !== screenId) ?? state.Local ?? null;
}

/**
 * Derives the agent's visual state: an explicit data-channel signal wins; otherwise it's inferred from
 * speaking activity (agent speaking → speaking, local speaking → listening, else idle).
 */
export function deriveAgentState(state: LiveKitRoomState, signal: LiveKitAgentVisualState | null): LiveKitAgentVisualState {
  if (signal) {
    return signal;
  }
  const agent = state.Remote.find((p) => p.Role === 'agent');
  if (agent?.IsSpeaking) {
    return 'speaking';
  }
  if (state.Local?.IsSpeaking) {
    return 'listening';
  }
  return 'idle';
}

/** Type guard for a valid agent-state signal string received over the data channel. */
export function isAgentVisualState(raw: string): raw is LiveKitAgentVisualState {
  return raw === 'idle' || raw === 'listening' || raw === 'thinking' || raw === 'speaking';
}
