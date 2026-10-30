// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

function fakeMessage(id: string, parentId: string | null = null): MJConversationDetailEntity {
  return {
    ID: id,
    ParentID: parentId,
  } as unknown as MJConversationDetailEntity;
}

function createChatArea(messages: MJConversationDetailEntity[]): ConversationChatAreaComponent {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  open['messages'] = messages;
  open['windowView'] = { Kind: 'Main' };
  open['displayCache'] = null;
  component.CollapseThreadReplies = false;
  return component;
}

describe('chat area: CollapseThreadReplies', () => {
  it('keeps thread replies in top-level DisplayMessages when CollapseThreadReplies is off, and removes replies whose parent is loaded when on', () => {
    const root1 = fakeMessage('msg-root-1', null);
    const reply1 = fakeMessage('msg-reply-1', 'msg-root-1');
    const orphanReply = fakeMessage('msg-orphan-reply', 'msg-missing-parent');

    const component = createChatArea([root1, reply1, orphanReply]);

    // Default (CollapseThreadReplies = false): every row stays in top-level DisplayMessages
    expect(component.DisplayMessages.map((m) => m.ID)).toEqual([
      'msg-root-1',
      'msg-reply-1',
      'msg-orphan-reply',
    ]);

    // Opt-in (CollapseThreadReplies = true): reply whose parent is loaded leaves the top-level list
    component.CollapseThreadReplies = true;
    expect(component.DisplayMessages.map((m) => m.ID)).toEqual([
      'msg-root-1',
      'msg-orphan-reply',
    ]);
  });
});
