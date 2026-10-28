import { describe, it, expect, vi, afterEach } from 'vitest';

const endSession = vi.fn(async (_id: string) => true);
vi.mock('@memberjunction/remote-browser-server', () => ({
  RemoteBrowserEngine: { Instance: { EndSessionForAgentSession: (id: string) => endSession(id) } },
}));

import { GetGlobalObjectStore } from '@memberjunction/global';
import { ConversationBrowserLedger, ConversationBrowserLimitError } from '../agentSessions/conversationBrowsers.js';

const USER = 'user:a1a1a1a1-0000-4000-8000-000000000001';
const ledger = ConversationBrowserLedger.Instance;

afterEach(() => {
  for (const id of ['conv-idle', 'conv-used', 'conv-third', 'g1-a', 'g1-b', 'g2-a']) {
    ledger.Release(id);
  }
  ledger.Now = () => Date.now();
});

describe('ConversationBrowserLedger', () => {
  it('is one process-wide instance, held in the global object store so every copy of the module shares it', () => {
    expect(ConversationBrowserLedger.Instance).toBe(ledger);
    expect(GetGlobalObjectStore()?.[ledger.GlobalKey]).toBe(ledger);
  });

  it('ends a browser nobody used for its idle limit, keeps a used one, and frees the owner\'s slot', async () => {
    let now = 0;
    ledger.Now = () => now;
    ledger.Claim('conv-idle', USER, 2, 15);
    ledger.Claim('conv-used', USER, 2, 15);
    expect(() => ledger.Claim('conv-third', USER, 2, 15)).toThrow(ConversationBrowserLimitError);

    now = 10 * 60_000;
    ledger.Touch('conv-used');
    now = 16 * 60_000;
    expect(await ledger.ReapIdle()).toBe(1);
    expect(endSession).toHaveBeenCalledWith('conv-idle');
    expect(endSession).not.toHaveBeenCalledWith('conv-used');
    expect(() => ledger.Claim('conv-third', USER, 2, 15)).not.toThrow();
  });

  it('counts each owner key on its own, so one anonymous guest cannot use up another\'s cap', () => {
    ledger.Claim('g1-a', 'scope:visitor-1', 1, 15);
    expect(() => ledger.Claim('g1-b', 'scope:visitor-1', 1, 15)).toThrow(ConversationBrowserLimitError);
    expect(() => ledger.Claim('g2-a', 'scope:visitor-2', 1, 15)).not.toThrow();
  });
});
