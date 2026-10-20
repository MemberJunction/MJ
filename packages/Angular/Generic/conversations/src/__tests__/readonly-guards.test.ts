// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MessageInputComponent } from '../lib/components/message/message-input.component';
import { MessageListComponent } from '../lib/components/message/message-list.component';
import { PinnedMessagesPanelComponent } from '../lib/components/conversation/pinned-messages-panel.component';

/**
 * Guards whose removal used to leave the ng-conversations suite green.
 * Each test calls the real method on a prototype instance.
 */

type Open = Record<string, unknown>;

function chatArea(): ConversationChatAreaComponent {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Open;
  open['ReadOnly'] = true;
  open['_conversationId'] = 'conv-1';
  open['Conversation'] = null;
  open['messages'] = [{ ID: 'user-1', Role: 'User', Message: 'What does this show?' }];
  open['ShowProjectSelector'] = false;
  open['SelectedArtifactId'] = 'artifact-1';
  open['ShowArtifactPanel'] = true;
  open['cdr'] = { detectChanges: vi.fn() };
  return component;
}

describe('message-input ReadOnly guards', () => {
  it('CanSend is false while ReadOnly even when there is text to send', () => {
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    component.ReadOnly = true;
    component.Disabled = false;
    component.IsSending = false;
    component.MessageText = 'hello';

    expect(component.CanSend).toBe(false);
  });

  it('OnTextSubmitted returns without emitting when ReadOnly', async () => {
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const open = component as unknown as Open;
    component.ReadOnly = true;
    open['pendingAttachments'] = [];
    open['EmptyStateMode'] = true;
    open['EmptyStateSubmit'] = { emit: vi.fn() };
    component.MessageText = 'hello';

    await component.OnTextSubmitted('hello');

    expect((open['EmptyStateSubmit'] as { emit: ReturnType<typeof vi.fn> }).emit).not.toHaveBeenCalled();
  });

  it('triggerInitialSend does not start the auto-send when ReadOnly', async () => {
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const open = component as unknown as Open;
    component.ReadOnly = true;
    component.ConversationId = 'conv-1';
    open['_initialMessage'] = 'hello';
    open['_initialAttachments'] = [];
    open['_autoSentForConversationId'] = null;
    open['InitialMessageAutoSendStarted'] = { emit: vi.fn() };

    await (component as unknown as { triggerInitialSend(): void }).triggerInitialSend();
    await Promise.resolve();

    expect(open['_autoSentForConversationId']).toBeNull();
    expect((open['InitialMessageAutoSendStarted'] as { emit: ReturnType<typeof vi.fn> }).emit).not.toHaveBeenCalled();
  });

  it('CanStartRealtime is false while ReadOnly', () => {
    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const open = component as unknown as Open;
    component.ReadOnly = true;
    component.Disabled = false;
    open['VoiceActive'] = false;
    const resolveCurrentAgentId = vi.fn(() => 'agent-1');
    open['ResolveCurrentAgentId'] = resolveCurrentAgentId;

    expect(component.CanStartRealtime).toBe(false);
    expect(resolveCurrentAgentId).not.toHaveBeenCalled();
  });
});

describe('chat-area ReadOnly guards', () => {
  it('the capture follow-up does not auto-send when EffectiveReadOnly', async () => {
    const component = chatArea();
    const open = component as unknown as Open;
    const sendMessageWithText = vi.fn(async () => true);
    open['waitForViewerSnapshot'] = vi.fn(async () => ({ tables: [{ rows: [1] }] }));
    open['OnAnalyzeArtifact'] = vi.fn(async () => ({ id: 'attachment-1' }));
    open['getActiveMessageInputComponent'] = () => ({ sendMessageWithText, messageText: '' });
    open['CurrentUser'] = { ID: 'user-1' };

    await (component as unknown as {
      handleCaptureDataSnapshotCommand(command: { artifactId: string; followupMessage: string }): Promise<void>;
    }).handleCaptureDataSnapshotCommand({
      artifactId: 'artifact-1',
      followupMessage: 'Use the snapshot',
    });

    expect(sendMessageWithText).not.toHaveBeenCalled();
  });

  it('OnUnpinFromPanel does not save when EffectiveReadOnly', async () => {
    const component = chatArea();
    const message = { ID: 'pin-1', IsPinned: true, Save: vi.fn(async () => true) };

    await component.OnUnpinFromPanel(message as never);

    expect(message.IsPinned).toBe(true);
    expect(message.Save).not.toHaveBeenCalled();
  });

  it('OpenProjectSelector does not open when EffectiveReadOnly', () => {
    const component = chatArea();

    component.OpenProjectSelector();

    expect(component.ShowProjectSelector).toBe(false);
  });
});

describe('pins panel and message list ReadOnly', () => {
  it('OnUnpin does nothing when AllowUnpin is false', () => {
    const panel = Object.create(PinnedMessagesPanelComponent.prototype) as PinnedMessagesPanelComponent;
    const open = panel as unknown as Open;
    panel.AllowUnpin = false;
    open['UnpinningIds'] = new Set<string>();
    open['UnpinRequested'] = { emit: vi.fn() };

    panel.OnUnpin({ ID: 'pin-1' } as never);

    expect((open['UnpinningIds'] as Set<string>).size).toBe(0);
    expect((open['UnpinRequested'] as { emit: ReturnType<typeof vi.fn> }).emit).not.toHaveBeenCalled();
  });

  it('setting ReadOnly stamps it onto an already-rendered message item', () => {
    const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
    const open = list as unknown as Open;
    const item = { ReadOnly: false };
    open['_readOnly'] = false;
    open['_renderedMessages'] = new Map([
      ['reply-1', {
        kind: 'component',
        ref: { instance: item, changeDetectorRef: { markForCheck: vi.fn() } },
      }],
    ]);

    list.ReadOnly = true;

    expect(item.ReadOnly).toBe(true);
  });
});
