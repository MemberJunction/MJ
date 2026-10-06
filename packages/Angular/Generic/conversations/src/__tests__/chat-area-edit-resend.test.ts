// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type MJConversationBranchEntity, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * `OnEditResendRequested`: an edit forks a branch after the message before it, then resends the
 * edited text on that branch. No branch is made while the composer cannot send, and nothing is
 * sent when the window did not reload on the new branch. A realtime session open for the
 * conversation ends before the fork.
 *
 * Built via `Object.create(prototype)` so the real handler runs against stubbed collaborators,
 * matching `chat-area-incremental-paging.test.ts`.
 */

interface ComposerStub {
  ReadOnly: boolean;
  IsSending: boolean;
  SendMessageWithText: ReturnType<typeof vi.fn>;
}

/** The realtime session members the fork uses. */
interface RealtimeStub {
  IsActiveFor: ReturnType<typeof vi.fn>;
  EndRealtimeSession: ReturnType<typeof vi.fn>;
}

interface Harness {
  component: ConversationChatAreaComponent;
  conversation: { ID: string; CurrentBranchID: string | null };
  composer: ComposerStub;
  reload: ReturnType<typeof vi.fn>;
  realtime: RealtimeStub;
  resolvePredecessor: ReturnType<typeof vi.fn>;
}

const EDITED = { Message: { ID: 'DETAIL-2', ConversationID: 'CONV-1', Sequence: 2 } as MJConversationDetailEntity, NewText: 'edited' };

function createHarness(opts: { isSending?: boolean; reloaded?: boolean; sent?: boolean; sessionFor?: string } = {}): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const conversation = { ID: 'CONV-1', CurrentBranchID: null as string | null };
  const composer: ComposerStub = {
    ReadOnly: false,
    IsSending: opts.isSending ?? false,
    SendMessageWithText: vi.fn(async () => opts.sent ?? true),
  };
  const reload = vi.fn(async () => opts.reloaded ?? true);
  const realtime: RealtimeStub = {
    IsActiveFor: vi.fn((conversationId: string) => conversationId === opts.sessionFor),
    EndRealtimeSession: vi.fn(async () => undefined),
  };
  const resolvePredecessor = vi.fn(async (): Promise<{ Sequence: number; BranchID: string | null } | undefined> => ({ Sequence: 1, BranchID: null }));

  open['_conversationId'] = 'CONV-1';
  open['CurrentUser'] = { ID: 'USER-1' };
  open['branchSwitchInFlight'] = false;
  open['findConversation'] = () => conversation;
  open['isActiveConversation'] = () => true;
  open['getActiveMessageInputComponent'] = () => composer;
  open['resolvePredecessor'] = resolvePredecessor;
  open['reloadWindowForBranch'] = reload;
  open['RealtimeSession'] = realtime;

  return { component, conversation, composer, reload, realtime, resolvePredecessor };
}

describe('ConversationChatAreaComponent.OnEditResendRequested', () => {
  let notify: ReturnType<typeof vi.fn>;
  let fork: MockInstance<ConversationEngine['ForkBranch']>;

  beforeEach(() => {
    notify = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
    fork = vi.spyOn(ConversationEngine.Instance, 'ForkBranch').mockResolvedValue({ ID: 'BRANCH-NEW' } as MJConversationBranchEntity);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forks after the predecessor, makes the branch current and resends without touching the draft', async () => {
    const h = createHarness();

    await h.component.OnEditResendRequested(EDITED);

    expect(fork).toHaveBeenCalledWith({ ConversationID: 'CONV-1', ForkFromSequence: 1, ParentBranchID: null }, expect.anything());
    expect(h.conversation.CurrentBranchID).toBe('BRANCH-NEW');
    expect(h.composer.SendMessageWithText).toHaveBeenCalledWith('edited', undefined, { IsResend: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('makes no branch while the composer is still sending', async () => {
    const h = createHarness({ isSending: true });

    await h.component.OnEditResendRequested(EDITED);

    expect(fork).not.toHaveBeenCalled();
    expect(h.composer.SendMessageWithText).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Wait for the current reply to finish', 'error', 3000);
  });

  it('does not send when the window did not reload on the new branch', async () => {
    const h = createHarness({ reloaded: false });

    await h.component.OnEditResendRequested(EDITED);

    expect(fork).toHaveBeenCalledTimes(1);
    expect(h.composer.SendMessageWithText).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'The branch was created but the conversation could not be reloaded; the message was not sent', 'error', 3000
    );
  });

  it('reports a send the composer refused', async () => {
    const h = createHarness({ sent: false });

    await h.component.OnEditResendRequested(EDITED);

    expect(notify).toHaveBeenCalledWith('The branch was created but the message was not sent', 'error', 3000);
  });

  describe('with a realtime session', () => {
    const ENDED = 'Voice session ended to switch branch';

    it('ends the session of the conversation and shows a notice before it forks', async () => {
      const h = createHarness({ sessionFor: 'CONV-1' });
      const order: string[] = [];
      h.realtime.EndRealtimeSession.mockImplementation(async () => {
        order.push('ended');
      });
      notify.mockImplementation((message: string) => order.push(message));
      fork.mockImplementation(async () => {
        order.push('fork');
        return { ID: 'BRANCH-NEW' } as MJConversationBranchEntity;
      });

      await h.component.OnEditResendRequested(EDITED);

      expect(h.realtime.IsActiveFor).toHaveBeenCalledWith('CONV-1');
      expect(h.realtime.EndRealtimeSession).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['ended', ENDED, 'fork']);
      expect(h.composer.SendMessageWithText).toHaveBeenCalledWith('edited', undefined, { IsResend: true });
    });

    it('does not touch the session when none is open', async () => {
      const h = createHarness();

      await h.component.OnEditResendRequested(EDITED);

      expect(h.realtime.EndRealtimeSession).not.toHaveBeenCalled();
      expect(fork).toHaveBeenCalledTimes(1);
    });

    it('forks and logs the error when the session fails to end', async () => {
      const h = createHarness({ sessionFor: 'CONV-1' });
      const failure = new Error('close failed');
      h.realtime.EndRealtimeSession.mockRejectedValue(failure);

      await h.component.OnEditResendRequested(EDITED);

      expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
      expect(fork).toHaveBeenCalledTimes(1);
      expect(h.conversation.CurrentBranchID).toBe('BRANCH-NEW');
      expect(h.composer.SendMessageWithText).toHaveBeenCalledTimes(1);
    });

    it('keeps the session when no fork point is found', async () => {
      const h = createHarness({ sessionFor: 'CONV-1' });
      h.resolvePredecessor.mockResolvedValue(undefined);

      await h.component.OnEditResendRequested(EDITED);

      expect(h.realtime.EndRealtimeSession).not.toHaveBeenCalled();
      expect(fork).not.toHaveBeenCalled();
    });
  });
});
