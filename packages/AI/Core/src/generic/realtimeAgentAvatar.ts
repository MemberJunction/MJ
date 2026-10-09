/**
 * @fileoverview Whether an agent's bot shows its avatar in a meeting: the participant attribute that says so.
 *
 * An agent whose persona has a face can appear in a meeting room (LiveKit today) as a talking avatar: its bot decodes
 * the model's avatar video and publishes it as a camera track. The bot's `mj.agentAvatar` attribute tells the room what
 * became of that avatar, so the room can explain an agent that shows only its picture:
 *
 * - `'on'`: the avatar was granted; the bot publishes it when the agent first speaks;
 * - `'audio-only:<reason>'`: the agent asked for an avatar and is heard without one, for the given
 *   {@link RealtimeAvatarUnavailableReason} (the room's notice words it);
 * - absent: the agent never asked for an avatar.
 *
 * The server puts the first value on the bot's join token; the bot changes it when its avatar fails mid-meeting (its
 * token lets it update its own attributes). Late joiners read it like everyone else, since attributes are room state.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

import type { RealtimeAvatarStatus, RealtimeAvatarUnavailableReason } from './baseRealtime';
import { REALTIME_AVATAR_UNAVAILABLE_REASONS } from './realtimeAvatarStatus';
import type { RealtimeParticipantAttributes } from './realtimeAgentVision';

/** The attribute on an agent's bot that says what became of its avatar: `'on'` or `'audio-only:<reason>'`. */
export const REALTIME_AGENT_AVATAR_ATTRIBUTE = 'mj.agentAvatar';

/** The value of {@link REALTIME_AGENT_AVATAR_ATTRIBUTE} while the avatar is granted. */
const AVATAR_ON = 'on';

/** The prefix of {@link REALTIME_AGENT_AVATAR_ATTRIBUTE}'s value when the agent is heard without its avatar. */
const AUDIO_ONLY_PREFIX = 'audio-only:';

/** What a bot's {@link REALTIME_AGENT_AVATAR_ATTRIBUTE} says. */
export type RealtimeAgentAvatarState =
    /** The avatar was granted: the bot publishes it when the agent speaks. */
    | { State: 'on' }
    /** The agent is heard without its avatar. `Reason` is `undefined` when the value names a reason this code does not know. */
    | { State: 'audio-only'; Reason?: RealtimeAvatarUnavailableReason };

/**
 * The attributes a bot joins with for a session's avatar status: `'on'` when granted, `'audio-only:<reason>'` when the
 * session asked for an avatar it doesn't render, and none when it asked for none.
 *
 * @param status The session's avatar status, as its driver reported it.
 */
export function AgentAvatarAttributes(status: RealtimeAvatarStatus | null | undefined): Record<string, string> {
    if (!status?.Requested) {
        return {};
    }
    if (status.Granted) {
        return { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: AVATAR_ON };
    }
    return AgentAvatarAudioOnlyAttributes(status.Reason ?? 'bridged');
}

/**
 * The attribute change a bot applies when it can no longer show its avatar.
 *
 * @param reason Why the agent is now heard without its avatar.
 */
export function AgentAvatarAudioOnlyAttributes(reason: RealtimeAvatarUnavailableReason): Record<string, string> {
    return { [REALTIME_AGENT_AVATAR_ATTRIBUTE]: `${AUDIO_ONLY_PREFIX}${reason}` };
}

/**
 * Reads a participant's {@link REALTIME_AGENT_AVATAR_ATTRIBUTE}: `null` when it is absent or holds anything other than
 * `'on'` or `'audio-only:…'`.
 *
 * @param attributes The participant's attributes.
 */
export function ReadAgentAvatarAttribute(attributes?: RealtimeParticipantAttributes | null): RealtimeAgentAvatarState | null {
    const value = attributes?.[REALTIME_AGENT_AVATAR_ATTRIBUTE];
    if (value === AVATAR_ON) {
        return { State: 'on' };
    }
    if (!value?.startsWith(AUDIO_ONLY_PREFIX)) {
        return null;
    }
    const named = value.slice(AUDIO_ONLY_PREFIX.length);
    const reason = REALTIME_AVATAR_UNAVAILABLE_REASONS.find((known) => known === named);
    return reason ? { State: 'audio-only', Reason: reason } : { State: 'audio-only' };
}
