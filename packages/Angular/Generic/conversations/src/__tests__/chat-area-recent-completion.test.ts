// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * MJ#4885: a host turn can finish before OnMessageSent takes the reply row.
 * The completion is already in the streaming service's replay window. Taking the
 * row applies it, so the chat shows the finished reply without loading the
 * conversation again.
 */

const CONV = 'conv-1';

type Open = Record<string, unknown>;

function hostRow(): {
  ID: string;
  ConversationID: string;
  Role: string;
  Status: string;
  Message: string;
  Load: ReturnType<typeof vi.fn>;
} {
  const row = {
    ID: 'reply-1',
    ConversationID: CONV,
    Role: 'AI',
    Status: 'In-Progress',
    Message: 'Starting…',
    Load: vi.fn(async function (this: { Status: string; Message: string }) {
      this.Status = 'Complete';
      this.Message = 'The final reply';
    }),
  };
  return row;
}

function createComponent(recent: { agentRunId: string } | undefined): ConversationChatAreaComponent {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Open;
  open['_conversationId'] = CONV;
  open['isInitialized'] = false;
  open['messages'] = [];
  open['InProgressMessageIds'] = [];
  open['initialDraftSnapshots'] = new Map();
  open['draftStore'] = { ClearDraft: vi.fn(), Flush: vi.fn() };
  open['windowStore'] = { ApplyLocalDetail: vi.fn() };
  open['cdr'] = { detectChanges: vi.fn() };
  open['AgentRunsByDetailId'] = new Map();
  open['activeTasks'] = { getByConversationDetailId: () => undefined };
  open['readerAtBottom'] = true;
  open['ReadReplyFromTop'] = false;
  open['onConversationChanged'] = vi.fn();
  open['ensureCurrentUserInAvatarMap'] = vi.fn(async () => undefined);
  open['loadAttachmentsForMessage'] = vi.fn(async () => undefined);
  open['snapshotArtifactPanelBaseline'] = vi.fn(() => ({}));
  open['reloadArtifactsForMessage'] = vi.fn(async () => undefined);
  open['reloadMessagesForActiveConversation'] = vi.fn(async () => undefined);
  open['decideAndApplyArtifactPanel'] = vi.fn(async () => undefined);
  open['resetComponentState'] = vi.fn();
  open['followTranscript'] = vi.fn();
  open['streamingService'] = {
    GetRecentCompletion: vi.fn(() => recent),
    ClearRecentCompletion: vi.fn(),
  };
  return component;
}

function streaming(component: ConversationChatAreaComponent): {
  GetRecentCompletion: ReturnType<typeof vi.fn>;
  ClearRecentCompletion: ReturnType<typeof vi.fn>;
} {
  return (component as unknown as Open)['streamingService'] as {
    GetRecentCompletion: ReturnType<typeof vi.fn>;
    ClearRecentCompletion: ReturnType<typeof vi.fn>;
  };
}

describe('OnMessageSent applies a completion that landed first (MJ#4885)', () => {
  it('a completion published before the row is taken shows the final reply without reloading the conversation', async () => {
    const message = hostRow();
    const component = createComponent({ agentRunId: 'run-1' });

    await component.OnMessageSent(message as never);

    expect(message.Status).toBe('Complete');
    expect(message.Message).toBe('The final reply');
    expect(component.messages).toEqual([message]);
    expect(message.Load).toHaveBeenCalledTimes(1);
    expect((component as unknown as Open)['onConversationChanged']).not.toHaveBeenCalled();
    expect(streaming(component).ClearRecentCompletion).toHaveBeenCalledWith('reply-1');
    expect((component as unknown as Open)['followTranscript']).toHaveBeenCalledWith('new', message);
  });

  it('a row with no recent completion is followed as an in-progress reply', async () => {
    const message = hostRow();
    const component = createComponent(undefined);

    await component.OnMessageSent(message as never);

    expect(message.Load).not.toHaveBeenCalled();
    expect(message.Status).toBe('In-Progress');
    expect(message.Message).toBe('Starting…');
    expect(component.messages).toEqual([message]);
    expect(component.InProgressMessageIds).toEqual(['reply-1']);
    expect(streaming(component).ClearRecentCompletion).not.toHaveBeenCalled();
    expect((component as unknown as Open)['followTranscript']).toHaveBeenCalledWith('new', message);
  });

  it('a completion that also arrives through the live callback is handled once', async () => {
    const message = hostRow();
    const component = createComponent({ agentRunId: 'run-1' });
    const open = component as unknown as {
      handleMessageCompletion(
        row: unknown,
        agentRunId: string,
        conversationId: string
      ): Promise<void>;
    };
    message.Load = vi.fn(async function (this: typeof message) {
      // The completion subscription delivers the same finish while the replay path is in Load.
      await open.handleMessageCompletion(message, 'run-1', CONV);
      this.Status = 'Complete';
      this.Message = 'The final reply';
    });

    await component.OnMessageSent(message as never);
    // And once more, the way the completion subscription calls it after the row is on screen.
    await open.handleMessageCompletion(message, 'run-1', CONV);

    expect(message.Load).toHaveBeenCalledTimes(1);
    expect(message.Status).toBe('Complete');
    expect(message.Message).toBe('The final reply');
    expect(streaming(component).ClearRecentCompletion).toHaveBeenCalledTimes(1);
  });
});
