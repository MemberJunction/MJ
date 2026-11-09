// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from '@angular/core';
import { ConversationWorkspaceComponent } from '../lib/components/workspace/conversation-workspace.component';
import type { SearchResult } from '../lib/services/search.service';

/**
 * `HandleSearchResult` for a message hit: activates the conversation, reports the hit's branch
 * and sequence through `NavigationChanged`, renders the conversation into the chat area and asks
 * the chat area to open the message. A failed open is logged.
 *
 * Built via `Object.create(prototype)` so the real handler runs against stubbed collaborators.
 */

type NavigationEvent = Parameters<ConversationWorkspaceComponent['NavigationChanged']['emit']>[0];

interface Harness {
  component: ConversationWorkspaceComponent;
  open: Record<string, unknown>;
  emitted: NavigationEvent[];
  calls: string[];
  openMessage: ReturnType<typeof vi.fn>;
}

function createHarness(withChatArea = true): Harness {
  const component = Object.create(ConversationWorkspaceComponent.prototype) as ConversationWorkspaceComponent;
  const open = component as unknown as Record<string, unknown>;
  const emitted: NavigationEvent[] = [];
  const calls: string[] = [];
  const navigation = new EventEmitter<NavigationEvent>();
  navigation.subscribe(e => emitted.push(e));
  const openMessage = vi.fn(async () => {
    calls.push('OpenMessage');
    return true;
  });

  open['NavigationChanged'] = navigation;
  open['engine'] = { GetConversation: (id: string) => ({ ID: id }) };
  open['cdr'] = { detectChanges: vi.fn(() => calls.push('detectChanges')) };
  open['chatArea'] = withChatArea ? { OpenMessage: openMessage } : undefined;

  return { component, open, emitted, calls, openMessage };
}

function messageHit(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'MSG-1',
    type: 'message',
    title: 'Message in Chat',
    preview: 'a poem',
    conversationId: 'CONV-1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    relevanceScore: 5,
    branchId: 'BRANCH-B',
    sequence: 7,
    ...overrides,
  };
}

describe('ConversationWorkspaceComponent.HandleSearchResult (message)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('activates the conversation and reports the branch and sequence', () => {
    const h = createHarness();

    h.component.HandleSearchResult(messageHit());

    expect(h.component.ActiveTab).toBe('conversations');
    expect(h.component.SelectedConversationId).toBe('CONV-1');
    expect(h.emitted).toEqual([{ tab: 'conversations', conversationId: 'CONV-1', branchId: 'BRANCH-B', sequence: 7 }]);
  });

  it('renders the conversation into the chat area, then opens the message there', async () => {
    const h = createHarness();

    h.component.HandleSearchResult(messageHit());
    await Promise.resolve();

    expect(h.openMessage).toHaveBeenCalledWith('CONV-1', 'BRANCH-B', 7);
    expect(h.calls).toEqual(['detectChanges', 'OpenMessage']);
  });

  it('opens a trunk message with a null branch', async () => {
    const h = createHarness();

    h.component.HandleSearchResult(messageHit({ branchId: null, sequence: 3 }));
    await Promise.resolve();

    expect(h.openMessage).toHaveBeenCalledWith('CONV-1', null, 3);
    expect(h.emitted[0]).toMatchObject({ branchId: null, sequence: 3 });
  });

  it('only activates the conversation when the hit has no sequence', async () => {
    const h = createHarness();

    h.component.HandleSearchResult(messageHit({ branchId: undefined, sequence: undefined }));
    await Promise.resolve();

    expect(h.component.SelectedConversationId).toBe('CONV-1');
    expect(h.openMessage).not.toHaveBeenCalled();
  });

  it('logs a message open that fails instead of leaving the rejection unhandled', async () => {
    const h = createHarness();
    const failure = new Error('open failed');
    h.openMessage.mockRejectedValueOnce(failure);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    h.component.HandleSearchResult(messageHit());
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.any(String), failure));
  });

  it('does not fail when no chat area is rendered', async () => {
    const h = createHarness(false);

    expect(() => h.component.HandleSearchResult(messageHit())).not.toThrow();
    await Promise.resolve();

    expect(h.component.SelectedConversationId).toBe('CONV-1');
  });
});
