/**
 * How the chat shows a failed agent reply.
 *
 * The server writes a failed reply's row (only the server writes agent replies) with the run's own error text. Before
 * that, the chat saved its own formatted text over it — `❌ **{agent}** failed`, a blank line, then the error — so it
 * now applies that format when it renders a failed reply, and what people see does not change. Text already in that
 * shape, or any other text that already leads with ❌ (rows the chat wrote before, the workflow status line, a failure
 * it shows locally), is shown as it is.
 *
 * @param text The reply's stored text.
 * @param agentName The name the chat shows for the reply's agent.
 */
export function FormatAgentFailureForDisplay(text: string, agentName: string): string {
  // '❌ Failed' is the runner's text when the run reported no error of its own: it adds nothing to the header.
  if (text.trim() === '❌ Failed') {
    return `❌ **${agentName}** failed`;
  }
  // Any other text that already leads with ❌ says it failed itself: the workflow status line, the chat's own
  // failure texts, and rows the chat wrote before.
  if (text.trimStart().startsWith('❌')) {
    return text;
  }
  const detail = text.trim();
  return detail ? `❌ **${agentName}** failed\n\n${detail}` : `❌ **${agentName}** failed`;
}
