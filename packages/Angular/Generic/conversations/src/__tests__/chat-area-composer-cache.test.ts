// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * Every `messageInputMetadataCache` entry keeps a live hidden `mj-message-input` mounted, so the
 * cache must be bounded or memory grows with each conversation visited. Built via
 * `Object.create(prototype)` so the real method runs against plain state.
 */
interface CacheState {
  messageInputMetadataCache: Map<string, { conversationId: string; conversationName: string | null }>;
  initialDraftSnapshots: Map<string, string | null>;
  Conversation: { Name: string } | null;
}

function createState(): { open: CacheState; touch: (id: string) => void } {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as CacheState;
  open.messageInputMetadataCache = new Map();
  open.initialDraftSnapshots = new Map();
  open.Conversation = { Name: 'Conv' };
  const touch = (id: string): void =>
    (component as unknown as { touchMessageInputCache(id: string): void }).touchMessageInputCache(id);
  return { open, touch };
}

describe('ConversationChatArea message-input cache bound', () => {
  it('caps the number of mounted composers and evicts least-recently-used first', () => {
    const { open, touch } = createState();
    for (let i = 0; i < 25; i++) touch(`C${i}`);

    expect(open.messageInputMetadataCache.size).toBe(10);
    expect(open.messageInputMetadataCache.has('C24')).toBe(true);
    expect(open.messageInputMetadataCache.has('C14')).toBe(false);
  });

  it('refreshes recency on revisit so the active conversation is never evicted', () => {
    const { open, touch } = createState();
    touch('ACTIVE');
    for (let i = 0; i < 9; i++) touch(`C${i}`);
    touch('ACTIVE'); // revisit
    touch('NEW');

    expect(open.messageInputMetadataCache.has('ACTIVE')).toBe(true);
    expect(open.messageInputMetadataCache.has('C0')).toBe(false);
  });

  it('keeps the original metadata on revisit', () => {
    const { open, touch } = createState();
    touch('A');
    open.Conversation = { Name: 'Renamed' };
    touch('A');
    expect(open.messageInputMetadataCache.get('A')?.conversationName).toBe('Conv');
  });

  it('drops the frozen draft snapshot of an evicted composer so a remount re-reads the draft', () => {
    const { open, touch } = createState();
    open.initialDraftSnapshots.set('c0', 'stale draft');
    for (let i = 0; i < 11; i++) touch(`C${i}`);

    expect(open.messageInputMetadataCache.has('C0')).toBe(false);
    expect(open.initialDraftSnapshots.has('c0')).toBe(false);
  });
});
