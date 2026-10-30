// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

function fakeMessage(
  id: string,
  parentId: string | null = null,
  role: 'User' | 'AI' = 'User',
  agentId: string | null = null,
): MJConversationDetailEntity {
  return {
    ID: id,
    ParentID: parentId,
    Role: role,
    AgentID: agentId,
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
  it('collapses person thread replies and agent replies inside a thread while keeping agent answers to top-level messages in DisplayMessages', () => {
    const root1 = fakeMessage('msg-root-1', null, 'User');
    // Case 1: Agent's answer to a top-level message (AgentTurnHandler stamps ParentID = root1.ID)
    const agentAnswerToRoot = fakeMessage('msg-agent-top-answer', 'msg-root-1', 'AI', 'agent-1');
    // Case 2: Person's reply in a thread (ParentID = root1.ID)
    const personThreadReply = fakeMessage('msg-person-reply-1', 'msg-root-1', 'User');
    // Case 3: Agent's reply whose ParentID is itself a thread reply
    const agentThreadReply = fakeMessage('msg-agent-thread-reply', 'msg-person-reply-1', 'AI', 'agent-1');
    // Unloaded parent stays visible
    const orphanReply = fakeMessage('msg-orphan-reply', 'msg-missing-parent', 'User');

    const component = createChatArea([
      root1,
      agentAnswerToRoot,
      personThreadReply,
      agentThreadReply,
      orphanReply,
    ]);

    // Default (CollapseThreadReplies = false): every row stays in top-level DisplayMessages
    expect(component.DisplayMessages.map((m) => m.ID)).toEqual([
      'msg-root-1',
      'msg-agent-top-answer',
      'msg-person-reply-1',
      'msg-agent-thread-reply',
      'msg-orphan-reply',
    ]);

    // Opt-in (CollapseThreadReplies = true):
    // - root1 and agentAnswerToRoot stay in the main flow
    // - personThreadReply and agentThreadReply collapse into the thread
    // - orphanReply stays visible because its parent is not loaded
    component.CollapseThreadReplies = true;
    expect(component.DisplayMessages.map((m) => m.ID)).toEqual([
      'msg-root-1',
      'msg-agent-top-answer',
      'msg-orphan-reply',
    ]);
  });
});

