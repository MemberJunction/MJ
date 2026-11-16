/**
 * Text of the server-written status lines in a conversation, shared so the chat's local placeholder for a line and
 * the row the server writes for it read the same.
 *
 * @module @memberjunction/ai-core-plus
 */

/**
 * The conversation manager's line when it hands a turn back to the agent that answered last ("silent observation"):
 * `Continuing with **{agent}** for refinement...`. The server writes it (only the server writes agent replies), with
 * the agent's name from metadata, never from the request.
 */
export function ContinuationAnnouncementText(agentName: string): string {
    return `Continuing with **${agentName}** for refinement...`;
}
