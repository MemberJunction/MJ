// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ConversationEngine } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * The chat header's folder picker moves a conversation through the same rules as the conversation list:
 * only the owner moves it, and a move into a Shared or Public folder asks first. Calls the real method on a
 * prototype instance, like readonly-guards.test.ts.
 */
type Open = Record<string, unknown>;

function chatArea(opts: { currentUserId: string; tier: 'Private' | 'Shared'; confirmed: boolean }) {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Open;
  const saveConversation = vi.fn().mockResolvedValue(true);
  const confirm = vi.fn().mockResolvedValue(opts.confirmed);
  const alert = vi.fn().mockResolvedValue(undefined);
  open['Conversation'] = { ID: 'c1', UserID: 'owner-1', ProjectID: null };
  open['CurrentUser'] = { ID: opts.currentUserId };
  open['ShowProjectSelector'] = true;
  open['engine'] = {
    CanMoveConversation: ConversationEngine.prototype.CanMoveConversation,
    GetProjectVisibilityTier: () => opts.tier,
    Projects: [{ ID: 'p1', Name: 'Budget' }],
    SaveConversation: saveConversation,
  };
  open['confirmDialog'] = { confirm, alert };
  return { component, saveConversation, confirm, alert };
}

describe('ConversationChatAreaComponent — folder picker', () => {
  it('asks before moving into a shared folder, and moves nothing when cancelled', async () => {
    const { component, saveConversation, confirm } = chatArea({ currentUserId: 'owner-1', tier: 'Shared', confirmed: false });
    await component.OnProjectSelected({ ID: 'p1' });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(saveConversation).not.toHaveBeenCalled();
  });

  it('refuses a move by someone who does not own the conversation', async () => {
    const { component, saveConversation, alert } = chatArea({ currentUserId: 'colleague-2', tier: 'Private', confirmed: true });
    await component.OnProjectSelected({ ID: 'p1' });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(saveConversation).not.toHaveBeenCalled();
  });

  it('moves the owner\'s conversation into a private folder without asking', async () => {
    const { component, saveConversation, confirm } = chatArea({ currentUserId: 'owner-1', tier: 'Private', confirmed: true });
    await component.OnProjectSelected({ ID: 'p1' });
    expect(confirm).not.toHaveBeenCalled();
    expect(saveConversation).toHaveBeenCalledWith('c1', { ProjectID: 'p1' }, { ID: 'owner-1' });
  });
});
