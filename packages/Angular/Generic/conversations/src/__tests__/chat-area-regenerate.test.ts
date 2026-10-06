// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type MJConversationBranchEntity, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { ConversationScopeService } from '../lib/services/conversation-scope.service';

/**
 * `OnRegenerateRequested`: regenerating an AI reply forks a branch at the user message the reply
 * answers, then reruns the agent for that user message on the new branch. No branch is made while
 * the composer cannot send or when the user message is not in the loaded window, and nothing is
 * rerun when the window did not reload on the new branch. A realtime session open for the
 * conversation ends before the fork.
 *
 * Built via `Object.create(prototype)` so the real handler runs against stubbed collaborators,
 * matching `chat-area-edit-resend.test.ts`.
 */

interface ComposerStub {
  ReadOnly: boolean;
  IsSending: boolean;
  RerunAgentForMessage: ReturnType<typeof vi.fn>;
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
}

function row(id: string, sequence: number, role: 'User' | 'AI', branchId: string | null = null): MJConversationDetailEntity {
  return { ID: id, ConversationID: 'CONV-1', Sequence: sequence, Role: role, BranchID: branchId } as MJConversationDetailEntity;
}

const USER_1 = row('USER-1', 1, 'User');
const AI_1 = row('AI-1', 2, 'AI');
const USER_2 = row('USER-2', 3, 'User', 'BRANCH-A');
const AI_2 = row('AI-2', 4, 'AI', 'BRANCH-A');
const AI_3 = row('AI-3', 5, 'AI', 'BRANCH-A');

function createHarness(opts: { messages?: MJConversationDetailEntity[]; isSending?: boolean; reloaded?: boolean; rerun?: boolean; sessionFor?: string } = {}): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const conversation = { ID: 'CONV-1', CurrentBranchID: 'BRANCH-A' as string | null };
  const composer: ComposerStub = {
    ReadOnly: false,
    IsSending: opts.isSending ?? false,
    RerunAgentForMessage: vi.fn(async () => opts.rerun ?? true),
  };
  const reload = vi.fn(async () => opts.reloaded ?? true);
  const realtime: RealtimeStub = {
    IsActiveFor: vi.fn((conversationId: string) => conversationId === opts.sessionFor),
    EndRealtimeSession: vi.fn(async () => undefined),
  };

  open['_conversationId'] = 'CONV-1';
  open['CurrentUser'] = { ID: 'USER-1' };
  open['branchSwitchInFlight'] = false;
  // Out of order on purpose: the handler sorts the window by Sequence.
  open['messages'] = opts.messages ?? [AI_3, USER_1, AI_2, USER_2, AI_1];
  open['findConversation'] = () => conversation;
  open['isActiveConversation'] = () => true;
  open['getActiveMessageInputComponent'] = () => composer;
  open['reloadWindowForBranch'] = reload;
  open['RealtimeSession'] = realtime;

  return { component, conversation, composer, reload, realtime };
}

describe('ConversationChatAreaComponent.OnRegenerateRequested', () => {
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

  it('forks at the nearest earlier user message, makes the branch current and reruns the agent for it', async () => {
    const h = createHarness();

    await h.component.OnRegenerateRequested(AI_3);

    expect(fork).toHaveBeenCalledWith({ ConversationID: 'CONV-1', ForkFromSequence: 3, ParentBranchID: 'BRANCH-A' }, expect.anything());
    expect(h.conversation.CurrentBranchID).toBe('BRANCH-NEW');
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_2);
    expect(notify).not.toHaveBeenCalled();
  });

  it('forks on the trunk when the user message has no branch', async () => {
    const h = createHarness();

    await h.component.OnRegenerateRequested(AI_1);

    expect(fork).toHaveBeenCalledWith({ ConversationID: 'CONV-1', ForkFromSequence: 1, ParentBranchID: null }, expect.anything());
    expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_1);
  });

  it('makes no branch when the loaded window holds no earlier user message', async () => {
    const h = createHarness({ messages: [AI_2, AI_3] });

    await h.component.OnRegenerateRequested(AI_3);

    expect(fork).not.toHaveBeenCalled();
    expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Could not find the message this reply answers', 'error', 3000);
  });

  it('makes no branch while the composer is still sending', async () => {
    const h = createHarness({ isSending: true });

    await h.component.OnRegenerateRequested(AI_3);

    expect(fork).not.toHaveBeenCalled();
    expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Wait for the current reply to finish', 'error', 3000);
  });

  it('does not rerun when the window did not reload on the new branch', async () => {
    const h = createHarness({ reloaded: false });

    await h.component.OnRegenerateRequested(AI_3);

    expect(fork).toHaveBeenCalledTimes(1);
    expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      'The branch was created but the conversation could not be reloaded; the reply was not regenerated', 'error', 3000
    );
  });

  it('reports a rerun the composer refused', async () => {
    const h = createHarness({ rerun: false });

    await h.component.OnRegenerateRequested(AI_3);

    expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_2);
    expect(notify).toHaveBeenCalledWith('The branch was created but the reply was not regenerated', 'error', 3000);
  });

  it('reports a rerun that threw', async () => {
    const h = createHarness();
    h.composer.RerunAgentForMessage.mockRejectedValueOnce(new Error('turn failed'));

    await h.component.OnRegenerateRequested(AI_3);

    expect(notify).toHaveBeenCalledWith('The branch was created but the reply was not regenerated', 'error', 3000);
  });

  it('reports a branch that could not be created and does not rerun', async () => {
    const h = createHarness();
    fork.mockRejectedValueOnce(new Error('save failed'));

    await h.component.OnRegenerateRequested(AI_3);

    expect(h.composer.RerunAgentForMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Could not create a branch for the regenerated reply', 'error', 3000);
  });

  it('ends the realtime session of the conversation and shows a notice before it forks', async () => {
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

    await h.component.OnRegenerateRequested(AI_3);

    expect(h.realtime.EndRealtimeSession).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['ended', 'Voice session ended to switch branch', 'fork']);
    expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_2);
  });

  it('runs the same flow from the deprecated OnRetryMessage', async () => {
    const h = createHarness();

    h.component.OnRetryMessage(AI_3);
    await vi.waitFor(() => expect(h.composer.RerunAgentForMessage).toHaveBeenCalledWith(USER_2));

    expect(fork).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationChatAreaComponent.reloadWindowForBranch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createReloadHarness(loadFailed: boolean): ConversationChatAreaComponent {
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const open = component as unknown as Record<string, unknown>;
    open['_conversationId'] = 'CONV-1';
    open['CurrentUser'] = { ID: 'USER-1' };
    open['branchReloadToken'] = 0;
    open['conversationLoadToken'] = 1;
    open['pinsDuringBranchReload'] = null;
    open['pinsHydrated'] = false;
    open['windowStore'] = {
      PinnedTotalCount: 0,
      PinnedDetails: [],
      LoadFailed: loadFailed,
      LoadLatest: vi.fn(async () => undefined),
      SetPinnedCount: vi.fn(),
      GetSnapshot: vi.fn(() => ({})),
    };
    open['isActiveConversationLoad'] = () => true;
    open['loadBranchesOrEmpty'] = vi.fn(async () => []);
    open['applyWindowSnapshot'] = vi.fn();
    open['loadPeripheralData'] = vi.fn(async () => undefined);
    open['reloadPinsForScope'] = vi.fn(async () => undefined);
    open['scopeService'] = new ConversationScopeService();
    open['agentStateService'] = { startPolling: vi.fn() };
    open['cdr'] = { detectChanges: vi.fn() };
    return component;
  }

  function reload(component: ConversationChatAreaComponent): Promise<boolean> {
    return (component as unknown as { reloadWindowForBranch: () => Promise<boolean> }).reloadWindowForBranch();
  }

  it('reports a reload whose window read failed as not reloaded', async () => {
    expect(await reload(createReloadHarness(true))).toBe(false);
  });

  it('reports a reload whose window read succeeded as reloaded', async () => {
    expect(await reload(createReloadHarness(false))).toBe(true);
  });
});
