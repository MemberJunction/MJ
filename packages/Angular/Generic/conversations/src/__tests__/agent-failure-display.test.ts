import { describe, it, expect } from 'vitest';
import { FormatAgentFailureForDisplay } from '../lib/utils/agent-failure-display';

/**
 * A failed agent reply is shown as the chat has always shown one, though the row now holds the server's own error
 * text: the chat used to save `❌ **{agent}** failed`, a blank line and the error over it.
 */
describe('FormatAgentFailureForDisplay', () => {
  it("shows the server's error under the chat's usual failure header", () => {
    expect(FormatAgentFailureForDisplay('Rate limit reached', 'Research')).toBe('❌ **Research** failed\n\nRate limit reached');
  });

  it("drops the runner's bare default, which says nothing the header doesn't", () => {
    expect(FormatAgentFailureForDisplay('❌ Failed', 'Research')).toBe('❌ **Research** failed');
    expect(FormatAgentFailureForDisplay('', 'Research')).toBe('❌ **Research** failed');
  });

  it('leaves text already in that shape alone: rows the chat wrote before, and failures it shows locally', () => {
    const old = '❌ **Research** failed after retry\n\ntimeout';
    expect(FormatAgentFailureForDisplay(old, 'Research')).toBe(old);
  });

  it('leaves any other text that already leads with ❌ alone, so it never gets a second header', () => {
    for (const text of ['❌ The workflow was rejected.', '❌ The workflow could not be submitted.', '❌ Sage could not start.', '❌ Error: socket closed']) {
      expect(FormatAgentFailureForDisplay(text, 'Agent')).toBe(text);
    }
  });
});
