import { describe, it, expect, vi } from 'vitest';

const endSession = vi.fn(async (_id: string) => true);
vi.mock('@memberjunction/remote-browser-server', () => ({
  RemoteBrowserEngine: { Instance: { EndSessionForAgentSession: (id: string) => endSession(id) } },
}));

import { ConversationBrowserLedger } from '../agentSessions/conversationBrowsers.js';

const USER = 'a1a1a1a1-0000-4000-8000-000000000001';

describe('ConversationBrowserLedger', () => {
  it('ends a browser nobody used for its idle limit, keeps a used one, and frees the owner\'s slot', async () => {
    let now = 0;
    const ledger = new ConversationBrowserLedger(() => now);
    ledger.Claim('conv-idle', USER, 2, 15);
    ledger.Claim('conv-used', USER, 2, 15);
    expect(() => ledger.Claim('conv-third', USER, 2, 15)).toThrow('the most this server allows');

    now = 10 * 60_000;
    ledger.Touch('conv-used');
    now = 16 * 60_000;
    expect(await ledger.ReapIdle()).toBe(1);
    expect(endSession).toHaveBeenCalledWith('conv-idle');
    expect(endSession).not.toHaveBeenCalledWith('conv-used');

    // The reaped browser no longer counts against the cap.
    expect(() => ledger.Claim('conv-third', USER, 2, 15)).not.toThrow();
  });
});
