/**
 * @fileoverview Who an agent may see in a meeting: the participant attributes that carry each person's consent.
 *
 * In a meeting room (LiveKit today), each person chooses whether agents may see their camera and shared screen.
 * Three parties read or write the same two participant attributes, so their names live here, in the package all three
 * already share:
 *
 * - the browser's room shows the choice and who can be seen;
 * - the server records a person's choice for them (a participant's token can't change its own attributes);
 * - an agent's bot announces that it watches, and reads which people it may see.
 *
 * Only the value `'true'` counts. An absent attribute, an empty one (LiveKit removes an attribute set to `''`) or any
 * other value means no, so consent is never inferred.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

/** A participant's attributes, as the meeting transport reports them (LiveKit's `Participant.attributes`). */
export type RealtimeParticipantAttributes = Readonly<Record<string, string>>;

/** The attribute on a person that says they let agents see their camera and shared screen: `'true'` while they do. */
export const REALTIME_AGENT_CAN_SEE_ATTRIBUTE = 'mj.agentCanSee';

/** The attribute on an agent's bot that says it watches the cameras and screens people let it see: `'true'` while it does. */
export const REALTIME_AGENT_WATCHES_ATTRIBUTE = 'mj.agentWatches';

/** Whether these attributes say the person lets agents see their camera and shared screen. */
export function AllowsAgentVision(attributes?: RealtimeParticipantAttributes | null): boolean {
    return attributes?.[REALTIME_AGENT_CAN_SEE_ATTRIBUTE] === 'true';
}

/** Whether these attributes say the participant (an agent's bot) watches the cameras and screens people allow. */
export function IsAgentWatching(attributes?: RealtimeParticipantAttributes | null): boolean {
    return attributes?.[REALTIME_AGENT_WATCHES_ATTRIBUTE] === 'true';
}
