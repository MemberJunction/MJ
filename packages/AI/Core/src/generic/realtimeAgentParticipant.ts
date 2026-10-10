/**
 * @fileoverview Which meeting participants are agents: the participant identity an agent's bot joins a room with.
 *
 * In a meeting room (LiveKit today), each agent joins through a bot whose participant identity is
 * `agent-<agent session id>`. A bot knows which participant is itself, but every other agent in the room is a remote
 * participant like any person, so the identity is how the rest of the system tells agents from people:
 *
 * - the coordinator that starts an agent in a room gives its bot this identity ({@link AgentParticipantIdentity});
 * - the LiveKit bridge reports a remote agent's bot as an agent in the room's roster;
 * - the bridge engine never counts an agent's speech as a person's: it keeps no empty room alive, a scribe doesn't record
 *   it as a person's turn, and it never makes the other agents yield;
 * - an agent's bot never reads another agent's camera or screen, and never counts an agent as the active speaker.
 *
 * Minting and reading both live here, so the two can't disagree.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

/** How every agent bot's participant identity starts. {@link IsAgentParticipantIdentity} matches it in any case. */
const AGENT_IDENTITY_PREFIX = 'agent-';

/**
 * The participant identity an agent's bot joins a meeting room with: `agent-<agentSessionId>`, which
 * {@link IsAgentParticipantIdentity} reads back as an agent's.
 *
 * @param agentSessionId The ID of the agent session the bot belongs to.
 */
export function AgentParticipantIdentity(agentSessionId: string): string {
    return `${AGENT_IDENTITY_PREFIX}${agentSessionId}`;
}

/**
 * Whether a meeting participant's identity is an agent bot's: it starts with `agent-`, in any case. An absent identity
 * is not.
 *
 * @param identity The participant identity (LiveKit's `Participant.identity`, or the speaker label on a bridge frame).
 */
export function IsAgentParticipantIdentity(identity: string | null | undefined): boolean {
    return typeof identity === 'string' && identity.toLowerCase().startsWith(AGENT_IDENTITY_PREFIX);
}
