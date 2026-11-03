// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * A settled reply is never in flight. `InProgressMessageIds` drives the composer's Stop slot and
 * its elapsed ticker, and every reconcile path scans the rows for `In-Progress`, so an ID that
 * stays in the list after its row has settled is stuck for good: nothing scans for it again.
 * Seen in the chat overlay after Regenerate-as-fork — the row read Complete, the list still held
 * its ID, and the Stop button ticked for hours. Built off the prototype as
 * `chat-area-recent-completion.test.ts` is.
 */

const CONV = 'conv-1';

type Open = Record<string, unknown>;

interface Row {
  ID: string;
  ConversationID: string;
  Role: string;
  Status: string;
  Message: string;
  Load: ReturnType<typeof vi.fn>;
}

function row(status: string): Row {
  return {
    ID: 'reply-1',
    ConversationID: CONV,
    Role: 'AI',
    Status: status,
    Message: 'The reply',
    Load: vi.fn(async function (this: { Status: string }) {
      this.Status = 'Complete';
    }),
  };
}

function createComponent(rows: Row[], inFlight: string[]): ConversationChatAreaComponent {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Open;
  open['_conversationId'] = CONV;
  open['isInitialized'] = false;
  open['messages'] = rows;
  open['initialDraftSnapshots'] = new Map();
  open['draftStore'] = { ClearDraft: vi.fn(), Flush: vi.fn() };
  open['windowStore'] = { ApplyLocalDetail: vi.fn() };
  open['cdr'] = { detectChanges: vi.fn(), markForCheck: vi.fn() };
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
  open['tryRecoverFromTail'] = vi.fn(async () => false);
  open['streamingService'] = { GetRecentCompletion: vi.fn(() => undefined), ClearRecentCompletion: vi.fn() };
  open['_inProgressMessageIds'] = [];
  component.InProgressMessageIds = inFlight;
  return component;
}

describe('ConversationChatArea — a settled reply is never in flight', () => {
  it('a completion that bails after loading the row still drops the settled row from the in-flight list', async () => {
    const reply = row('In-Progress');
    const component = createComponent([reply], ['reply-1']);
    const open = component as unknown as Open;
    const handle = open['handleMessageCompletion'] as (m: Row, runId: string, conv: string) => Promise<void>;

    // The context check after Load fails (the view moved on), so the handler returns early.
    await handle.call(component, reply, 'run-1', 'some-other-conversation');

    expect(reply.Status).toBe('Complete');
    expect(component.InProgressMessageIds).toEqual([]);
  });

  it('a settled row arriving through OnMessageSent drops its ID from the in-flight list', async () => {
    const reply = row('Complete');
    const component = createComponent([], ['reply-1']);

    await component.OnMessageSent(reply as never);

    expect(component.messages).toEqual([reply]);
    expect(component.InProgressMessageIds).toEqual([]);
  });

  it('reconnecting drops a listed ID whose row has settled instead of leaving it for a scan that never finds it', async () => {
    const reply = row('Complete');
    const component = createComponent([reply], ['reply-1']);
    const open = component as unknown as Open;
    const reconnect = open['reconnectInProgressRuns'] as (conv: string, token: number) => Promise<void>;

    await reconnect.call(component, CONV, 1);

    expect(open['tryRecoverFromTail']).not.toHaveBeenCalled();
    expect(component.InProgressMessageIds).toEqual([]);
  });

  it('keeps an in-flight ID whose row is still In-Progress', async () => {
    const reply = row('In-Progress');
    const component = createComponent([reply], ['reply-1']);
    const open = component as unknown as Open;
    const reconnect = open['reconnectInProgressRuns'] as (conv: string, token: number) => Promise<void>;

    await reconnect.call(component, CONV, 1);

    expect(component.InProgressMessageIds).toEqual(['reply-1']);
  });
});
