import { describe, it, expect, vi, afterEach } from 'vitest';

const endSession = vi.fn(async (_id: string) => true);
vi.mock('@memberjunction/remote-browser-server', () => ({
  RemoteBrowserEngine: { Instance: { EndSessionForAgentSession: (id: string) => endSession(id) } },
}));

import { GetGlobalObjectStore } from '@memberjunction/global';
import { ConversationBrowserLedger, RemoteBrowserRefusedError } from '../agentSessions/conversationBrowsers.js';

const USER = { Key: 'user:a1a1a1a1-0000-4000-8000-000000000001', Anonymous: false };
const LIMITS = { maxPerUser: 2, maxAnonymousTotal: 4, idleMinutes: 15 };
const guest = (scope: string) => ({ Key: `scope:${scope}`, Anonymous: true });
const ledger = ConversationBrowserLedger.Instance;

afterEach(() => {
  for (const id of ['conv-idle', 'conv-used', 'conv-third', 'g1-a', 'g1-b', 'g2-a']) {
    ledger.Release(id);
  }
  vi.useRealTimers();
});

describe('ConversationBrowserLedger', () => {
  it('is one process-wide instance, held in the global object store so every copy of the module shares it', () => {
    expect(ConversationBrowserLedger.Instance).toBe(ledger);
    expect(GetGlobalObjectStore()?.[ledger.GlobalKey]).toBe(ledger);
  });

  it('ends a browser nobody used for its idle limit, keeps a used one, and frees the owner\'s slot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
    ledger.Claim('conv-idle', USER, LIMITS);
    ledger.Claim('conv-used', USER, LIMITS);
    expect(() => ledger.Claim('conv-third', USER, LIMITS)).toThrow(RemoteBrowserRefusedError);

    vi.setSystemTime(10 * 60_000);
    ledger.Touch('conv-used');
    vi.setSystemTime(16 * 60_000);
    expect(await ledger.ReapIdle()).toBe(1);
    expect(endSession).toHaveBeenCalledWith('conv-idle');
    expect(endSession).not.toHaveBeenCalledWith('conv-used');
    expect(() => ledger.Claim('conv-third', USER, LIMITS)).not.toThrow();
  });

  it('counts each owner key on its own, so one anonymous guest cannot use up another\'s cap', () => {
    const one = { ...LIMITS, maxPerUser: 1 };
    ledger.Claim('g1-a', guest('visitor-1'), one);
    expect(() => ledger.Claim('g1-b', guest('visitor-1'), one)).toThrow(RemoteBrowserRefusedError);
    expect(() => ledger.Claim('g2-a', guest('visitor-2'), one)).not.toThrow();
  });
});
