// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * `OnBranchSwitchRequested`: a switch makes the requested branch current and reloads the window.
 * A view-only user, a composer that is still sending and a chat that is still processing each get
 * a notice and no switch. A realtime session open for the conversation ends before the switch.
 *
 * Built via `Object.create(prototype)` so the real handler runs against stubbed collaborators,
 * matching `chat-area-regenerate.test.ts`.
 */

/** The realtime session members the switch uses. */
interface RealtimeStub {
  IsActiveFor: ReturnType<typeof vi.fn>;
  EndRealtimeSession: ReturnType<typeof vi.fn>;
}

interface Harness {
  component: ConversationChatAreaComponent;
  conversation: { ID: string; CurrentBranchID: string | null };
  reload: ReturnType<typeof vi.fn>;
  realtime: RealtimeStub;
}

function createHarness(opts: { readOnly?: boolean; viewShare?: boolean; isSending?: boolean; processing?: boolean; sessionFor?: string } = {}): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const conversation = { ID: 'CONV-1', CurrentBranchID: 'BRANCH-A' as string | null };
  const reload = vi.fn(async () => true);
  const realtime: RealtimeStub = {
    IsActiveFor: vi.fn((conversationId: string) => conversationId === opts.sessionFor),
    EndRealtimeSession: vi.fn(async () => undefined),
  };

  open['_conversationId'] = 'CONV-1';
  open['Conversation'] = conversation;
  open['CurrentUser'] = { ID: 'USER-1' };
  open['ReadOnly'] = opts.readOnly ?? false;
  open['engine'] = { GetSharedByInfo: () => (opts.viewShare ? { Level: 'View' } : null) };
  open['IsProcessing'] = opts.processing ?? false;
  open['branchSwitchInFlight'] = false;
  open['findConversation'] = () => conversation;
  open['isActiveConversation'] = () => true;
  open['getActiveMessageInputComponent'] = () => ({ ReadOnly: false, IsSending: opts.isSending ?? false });
  open['reloadWindowForBranch'] = reload;
  open['RealtimeSession'] = realtime;

  return { component, conversation, reload, realtime };
}

const REQUEST = { DetailID: 'ROW-5', BranchID: 'BRANCH-B' };

describe('ConversationChatAreaComponent.OnBranchSwitchRequested', () => {
  let notify: ReturnType<typeof vi.fn>;
  let switchBranch: MockInstance<ConversationEngine['SwitchBranch']>;

  beforeEach(() => {
    notify = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
    switchBranch = vi.spyOn(ConversationEngine.Instance, 'SwitchBranch').mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('switches to the requested branch and reloads the window', async () => {
    const h = createHarness();

    await h.component.OnBranchSwitchRequested(REQUEST);

    expect(switchBranch).toHaveBeenCalledWith('CONV-1', 'BRANCH-B', expect.anything());
    expect(h.conversation.CurrentBranchID).toBe('BRANCH-B');
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    ['the host sets ReadOnly', { readOnly: true }],
    ['the conversation is shared with View access', { viewShare: true }],
  ])('refuses with a notice when %s', async (_label, opts) => {
    const h = createHarness(opts);

    await h.component.OnBranchSwitchRequested(REQUEST);

    expect(switchBranch).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.conversation.CurrentBranchID).toBe('BRANCH-A');
    expect(notify).toHaveBeenCalledWith('You have view-only access to this conversation', 'error', 3000);
  });

  it.each([
    ['the composer is still sending', { isSending: true }],
    ['the chat is still processing', { processing: true }],
  ])('refuses with a notice while %s', async (_label, opts) => {
    const h = createHarness(opts);

    await h.component.OnBranchSwitchRequested(REQUEST);

    expect(switchBranch).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
    expect(h.conversation.CurrentBranchID).toBe('BRANCH-A');
    expect(notify).toHaveBeenCalledWith('Wait for the current reply to finish before switching branches', 'error', 3000);
  });

  it('ignores a request while another switch is running', async () => {
    const h = createHarness();
    (h.component as unknown as Record<string, unknown>)['branchSwitchInFlight'] = true;

    await h.component.OnBranchSwitchRequested(REQUEST);

    expect(switchBranch).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  describe('with a realtime session', () => {
    const ENDED = 'Voice session ended to switch branch';

    it('ends the session of the conversation, waits for it, shows a notice, then switches', async () => {
      const h = createHarness({ sessionFor: 'CONV-1' });
      const order: string[] = [];
      let finishEnd: (() => void) | null = null;
      h.realtime.EndRealtimeSession.mockImplementation(() => new Promise<void>(resolve => {
        finishEnd = () => {
          order.push('ended');
          resolve();
        };
      }));
      switchBranch.mockImplementation(async () => {
        order.push('switch');
        return true;
      });
      notify.mockImplementation((message: string) => order.push(message));

      const switching = h.component.OnBranchSwitchRequested(REQUEST);
      await vi.waitFor(() => expect(finishEnd).not.toBeNull());
      expect(switchBranch).not.toHaveBeenCalled();
      finishEnd!();
      await switching;

      expect(h.realtime.IsActiveFor).toHaveBeenCalledWith('CONV-1');
      expect(h.realtime.EndRealtimeSession).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['ended', ENDED, 'switch']);
      expect(notify).toHaveBeenCalledWith(ENDED, 'info', 3000);
      expect(h.conversation.CurrentBranchID).toBe('BRANCH-B');
      expect(h.reload).toHaveBeenCalledTimes(1);
    });

    it('does not touch the session when none is open', async () => {
      const h = createHarness();

      await h.component.OnBranchSwitchRequested(REQUEST);

      expect(h.realtime.EndRealtimeSession).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
      expect(switchBranch).toHaveBeenCalledTimes(1);
    });

    it('leaves the session of another conversation open', async () => {
      const h = createHarness({ sessionFor: 'CONV-2' });

      await h.component.OnBranchSwitchRequested(REQUEST);

      expect(h.realtime.EndRealtimeSession).not.toHaveBeenCalled();
      expect(switchBranch).toHaveBeenCalledTimes(1);
    });

    it('switches and logs the error when the session fails to end', async () => {
      const h = createHarness({ sessionFor: 'CONV-1' });
      const failure = new Error('close failed');
      h.realtime.EndRealtimeSession.mockRejectedValue(failure);

      await h.component.OnBranchSwitchRequested(REQUEST);

      expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
      expect(notify).not.toHaveBeenCalledWith(ENDED, 'info', 3000);
      expect(switchBranch).toHaveBeenCalledWith('CONV-1', 'BRANCH-B', expect.anything());
      expect(h.reload).toHaveBeenCalledTimes(1);
    });

    it('does not end the session when the switch is refused', async () => {
      const h = createHarness({ sessionFor: 'CONV-1', readOnly: true });

      await h.component.OnBranchSwitchRequested(REQUEST);

      expect(h.realtime.EndRealtimeSession).not.toHaveBeenCalled();
    });

    it('ignores a second request while the session is ending', async () => {
      const h = createHarness({ sessionFor: 'CONV-1' });
      let finishEnd: (() => void) | null = null;
      h.realtime.EndRealtimeSession.mockImplementation(() => new Promise<void>(resolve => {
        finishEnd = resolve;
      }));

      const first = h.component.OnBranchSwitchRequested(REQUEST);
      await vi.waitFor(() => expect(finishEnd).not.toBeNull());
      await h.component.OnBranchSwitchRequested({ DetailID: 'ROW-6', BranchID: 'BRANCH-C' });
      finishEnd!();
      await first;

      expect(h.realtime.EndRealtimeSession).toHaveBeenCalledTimes(1);
      expect(switchBranch).toHaveBeenCalledTimes(1);
      expect(switchBranch).toHaveBeenCalledWith('CONV-1', 'BRANCH-B', expect.anything());
    });
  });
});
