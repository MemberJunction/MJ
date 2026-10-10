/**
 * @fileoverview An agent's avatar in a meeting, as its bot reports it: the camera track it publishes the avatar on,
 * and its `mj.agentAvatar` attribute, which says when the avatar can't be shown. The names, and the attribute's reader,
 * are in `@memberjunction/ai`, which the bot uses too.
 *
 * @module @memberjunction/livekit-room-core
 */

import { REALTIME_AGENT_AVATAR_TRACK_NAME, ReadAgentAvatarAttribute, type RealtimeParticipantAttributes } from '@memberjunction/ai';
import type { LiveKitAvatarAudioOnly, LiveKitParticipantRole } from './types';

/**
 * Whether an agent's bot's attributes say the meeting can't show the agent's avatar, and why (`ReadAgentAvatarAttribute`;
 * no reason for one this room doesn't know). `undefined` while the avatar shows, when the agent asked for none, and for
 * a value the bot doesn't write.
 */
export function ReadAvatarAudioOnly(attributes?: RealtimeParticipantAttributes | null): LiveKitAvatarAudioOnly | undefined {
  const avatar = ReadAgentAvatarAttribute(attributes);
  if (avatar?.State !== 'audio-only') {
    return undefined;
  }
  return avatar.Reason ? { Reason: avatar.Reason } : {};
}

/** Whether a camera track is an agent's avatar: an agent's bot publishes the avatar as a camera track of that name. */
export function IsAgentAvatarTrack(role: LiveKitParticipantRole, trackName: string | undefined): boolean {
  return role === 'agent' && trackName === REALTIME_AGENT_AVATAR_TRACK_NAME;
}
