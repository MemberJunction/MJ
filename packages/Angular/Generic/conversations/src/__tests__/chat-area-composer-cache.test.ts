// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { EventEmitter, QueryList } from '@angular/core';
import { describe, it, expect, vi } from 'vitest';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MessageInputComponent } from '../lib/components/message/message-input.component';
import { ActiveTasksService } from '../lib/services/active-tasks.service';

/**
 * Every `messageInputMetadataCache` entry keeps a live hidden `mj-message-input` mounted, so the
 * cache must be bounded or memory grows with each conversation visited — while never evicting a
 * composer with active work or killing a live voice call running on another conversation.
 */
interface MockMountedComposer {
  ConversationId: string | null;
  conversationId: string | null;
  HasActiveWork: boolean;
  InsertAgentMention: ReturnType<typeof vi.fn>;
}

interface CacheState {
  messageInputMetadataCache: Map<string, { conversationId: string; conversationName: string | null }>;
  initialDraftSnapshots: Map<string, string | null>;
  _cachedInputsArray: Array<{ conversationId: string; conversationName: string | null }>;
  _cachedInputsKey: string;
  _conversation: Partial<MJConversationEntity> | null;
  _conversationId: string | null;
  _pendingMessage: string | null;
  _pendingMessageTargetId: string | null;
  _pendingMessageReservedTargetId: string | null;
  PendingMessageConversationId: string | null;
  _composerAgentMention: string | null;
  ComposerAgentMentionConsumed: EventEmitter<void>;
  ConversationRenamed: EventEmitter<{ conversationId: string; name: string; description: string }>;
  RealtimeSession: {
    IsActive: boolean;
    IsActiveFor: (id: string | null | undefined) => boolean;
    EndRealtimeSession: () => Promise<void>;
  };
  activeTasks: ActiveTasksService;
  engine: {
    GetConversation: (id: string) => { ID: string; Name: string } | undefined;
  };
  messageInputComponents: Pick<QueryList<MessageInputComponent>, 'find' | 'first' | 'last' | 'length'> | undefined;
}

function createMountedQueryList(
  items: MockMountedComposer[]
): Pick<QueryList<MessageInputComponent>, 'find' | 'first' | 'last' | 'length'> {
  return {
    length: items.length,
    first: (items[0] as unknown as MessageInputComponent) ?? undefined,
    last: (items[items.length - 1] as unknown as MessageInputComponent) ?? undefined,
    find: (predicate: (item: MessageInputComponent, index: number, array: MessageInputComponent[]) => boolean) => {
      const typed = items as unknown as MessageInputComponent[];
      return typed.find(predicate);
    },
  };
}

function createState(): {
  component: ConversationChatAreaComponent;
  open: CacheState;
  touch: (id: string) => void;
} {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as CacheState;
  open.messageInputMetadataCache = new Map();
  open.initialDraftSnapshots = new Map();
  open._cachedInputsArray = [];
  open._cachedInputsKey = '';
  open._conversation = { Name: 'Conv' };
  open._conversationId = null;
  open._pendingMessage = null;
  open._pendingMessageTargetId = null;
  open._pendingMessageReservedTargetId = null;
  open.PendingMessageConversationId = null;
  open._composerAgentMention = null;
  open.ComposerAgentMentionConsumed = new EventEmitter<void>();
  open.ConversationRenamed = new EventEmitter<{ conversationId: string; name: string; description: string }>();
  open.RealtimeSession = {
    IsActive: false,
    IsActiveFor: () => false,
    EndRealtimeSession: vi.fn().mockResolvedValue(undefined),
  };
  open.activeTasks = new ActiveTasksService();
  open.engine = {
    GetConversation: () => undefined,
  };
  open.messageInputComponents = undefined;

  const touch = (id: string): void =>
    (component as unknown as { touchMessageInputCache(id: string): void }).touchMessageInputCache(id);
  return { component, open, touch };
}

describe('ConversationChatArea message-input cache bound', () => {
  it('caps the number of mounted composers and evicts least-recently-used first', () => {
    const { open, touch } = createState();
    for (let i = 0; i < 25; i++) touch(`C${i}`);

    expect(open.messageInputMetadataCache.size).toBe(10);
    expect(open.messageInputMetadataCache.has('C24')).toBe(true);
    expect(open.messageInputMetadataCache.has('C14')).toBe(false);
  });

  it('refreshes recency on revisit so the active conversation is never evicted', () => {
    const { open, touch } = createState();
    touch('ACTIVE');
    for (let i = 0; i < 9; i++) touch(`C${i}`);
    touch('ACTIVE'); // revisit
    touch('NEW');

    expect(open.messageInputMetadataCache.has('ACTIVE')).toBe(true);
    expect(open.messageInputMetadataCache.has('C0')).toBe(false);
  });

  it('keeps the original metadata on revisit', () => {
    const { open, touch } = createState();
    touch('A');
    open._conversation = { Name: 'Renamed' };
    touch('A');
    expect(open.messageInputMetadataCache.get('A')?.conversationName).toBe('Conv');
  });

  it('drops the frozen draft snapshot of an evicted composer so a remount re-reads the draft', () => {
    const { open, touch } = createState();
    open.initialDraftSnapshots.set('c0', 'stale draft');
    for (let i = 0; i < 11; i++) touch(`C${i}`);

    expect(open.messageInputMetadataCache.has('C0')).toBe(false);
    expect(open.initialDraftSnapshots.has('c0')).toBe(false);
  });

  it('skips evicting composers with active work, active tasks, live voice calls, or pending auto-send', () => {
    const { open, touch } = createState();

    // C0: mounted composer with HasActiveWork (e.g. streaming callback or unsent attachment)
    // C1: tracked in ActiveTasksService (case-insensitive UUID)
    // C2: hosting an active realtime voice call
    // C3: awaiting PendingMessage auto-send
    // C4..C13: idle conversations
    const busyComposer: MockMountedComposer = {
      ConversationId: 'C0',
      conversationId: 'C0',
      HasActiveWork: true,
      InsertAgentMention: vi.fn(),
    };
    open.messageInputComponents = createMountedQueryList([busyComposer]);
    open.activeTasks.Add({
      agentName: 'Research Agent',
      status: 'Working...',
      relatedMessageId: 'msg-1',
      conversationId: 'a1b2c3d4-0000-4000-8000-000000000001',
    });
    open.RealtimeSession.IsActive = true;
    open.RealtimeSession.IsActiveFor = (id: string | null | undefined) => id === 'C2';
    open._pendingMessage = 'Auto-send prompt';
    open.PendingMessageConversationId = 'C3';

    touch('C0');
    touch('A1B2C3D4-0000-4000-8000-000000000001');
    touch('C2');
    touch('C3');
    for (let i = 4; i <= 13; i++) {
      touch(`C${i}`);
    }

    // Total stays capped at 10: the 4 busy entries + 6 newest idle entries (C8..C13).
    expect(open.messageInputMetadataCache.size).toBe(10);
    expect(open.messageInputMetadataCache.has('C0')).toBe(true);
    expect(open.messageInputMetadataCache.has('A1B2C3D4-0000-4000-8000-000000000001')).toBe(true);
    expect(open.messageInputMetadataCache.has('C2')).toBe(true);
    expect(open.messageInputMetadataCache.has('C3')).toBe(true);
    expect(open.messageInputMetadataCache.has('C4')).toBe(false);
    expect(open.messageInputMetadataCache.has('C7')).toBe(false);
    expect(open.messageInputMetadataCache.has('C8')).toBe(true);
    expect(open.messageInputMetadataCache.has('C13')).toBe(true);

    // Once C0 finishes its work, visiting a new conversation evicts C0 cleanly.
    busyComposer.HasActiveWork = false;
    touch('C14');
    expect(open.messageInputMetadataCache.has('C0')).toBe(false);
    expect(open.messageInputMetadataCache.size).toBe(10);
  });

  it('terminates cleanly without hanging when more than 10 composers are simultaneously busy', () => {
    const { open, touch } = createState();
    const busyComposers: MockMountedComposer[] = [];
    for (let i = 0; i < 12; i++) {
      busyComposers.push({
        ConversationId: `BUSY-${i}`,
        conversationId: `BUSY-${i}`,
        HasActiveWork: true,
        InsertAgentMention: vi.fn(),
      });
    }
    open.messageInputComponents = createMountedQueryList(busyComposers);

    for (let i = 0; i < 12; i++) {
      touch(`BUSY-${i}`);
    }
    expect(open.messageInputMetadataCache.size).toBe(12);

    // Once all finish, a single new touch trims the cache back down to 10.
    for (const c of busyComposers) {
      c.HasActiveWork = false;
    }
    touch('IDLE-NEW');
    expect(open.messageInputMetadataCache.size).toBe(10);
    expect(open.messageInputMetadataCache.has('BUSY-0')).toBe(false);
    expect(open.messageInputMetadataCache.has('BUSY-2')).toBe(false);
    expect(open.messageInputMetadataCache.has('IDLE-NEW')).toBe(true);
  });

  it('deduplicates case-variant UUIDs and preserves stable @for track keys', () => {
    const { component, open, touch } = createState();
    const lower = 'b2c3d4e5-1111-4000-8000-000000000099';
    const upper = lower.toUpperCase();

    touch(lower);
    touch(upper);

    expect(open.messageInputMetadataCache.size).toBe(1);
    expect(open.messageInputMetadataCache.has(lower)).toBe(false);
    expect(open.messageInputMetadataCache.get(upper)?.conversationId).toBe(upper);
    expect(component.NormalizeCachedInputId(lower)).toBe(component.NormalizeCachedInputId(upper));
  });

  it('does not stamp a stale previous Conversation.Name onto a newly opened conversation and syncs when Conversation arrives or renames', () => {
    const { component, open, touch } = createState();
    const idA = '11111111-1111-4111-8111-111111111111';
    const idB = '22222222-2222-4222-8222-222222222222';

    // Simulate Angular input order: [conversationId] changes to B while [conversation] is still A.
    open._conversation = { ID: idA, Name: 'Budget Q3' };
    touch(idB);
    expect(open.messageInputMetadataCache.get(idB)?.conversationName).toBeNull();

    // Next binding in the same CD cycle: [conversation] updates to B.
    component.Conversation = { ID: idB, Name: 'Product Roadmap' } as MJConversationEntity;
    expect(open.messageInputMetadataCache.get(idB)?.conversationName).toBe('Product Roadmap');

    // Later auto-rename updates the cached entry and invalidates GetCachedInputs memoization.
    const beforeInputs = component.GetCachedInputs();
    component.OnConversationRenamed({
      conversationId: idB.toLowerCase(),
      name: 'Product Roadmap 2027',
      description: '',
    });
    const afterInputs = component.GetCachedInputs();
    expect(afterInputs).not.toBe(beforeInputs);
    expect(afterInputs[0]?.conversationName).toBe('Product Roadmap 2027');
  });

  it('targets the active conversation composer (not the oldest hidden composer) in applyComposerAgentMention', async () => {
    const { component, open } = createState();
    const oldestHidden: MockMountedComposer = {
      ConversationId: 'OLD-HIDDEN',
      conversationId: 'OLD-HIDDEN',
      HasActiveWork: false,
      InsertAgentMention: vi.fn().mockResolvedValue(true),
    };
    const activeVisible: MockMountedComposer = {
      ConversationId: 'ACTIVE-CONV',
      conversationId: 'ACTIVE-CONV',
      HasActiveWork: false,
      InsertAgentMention: vi.fn().mockResolvedValue(true),
    };
    open._conversationId = 'active-conv'; // different case to verify UUIDsEqual lookup
    open.messageInputComponents = createMountedQueryList([oldestHidden, activeVisible]);

    component.ComposerAgentMention = 'Sage';
    await Promise.resolve();

    expect(oldestHidden.InsertAgentMention).not.toHaveBeenCalled();
    expect(activeVisible.InsertAgentMention).toHaveBeenCalledWith('Sage', true);
  });
});

describe('MessageInputComponent & ConversationChatAreaComponent realtime voice teardown on eviction', () => {
  interface MessageInputTestHarness {
    ConversationId: string | null;
    IsSending: boolean;
    IsProcessing: boolean;
    IsUploadingAttachments: boolean;
    registeredCallbacks: Map<string, unknown>;
    inFlightWatches: Map<string, ReturnType<typeof setTimeout>>;
    pendingAttachments: unknown[];
    startedRealtimeSession: boolean;
    realtimeSession: {
      IsActive: boolean;
      SessionCreatedConversationId: string | null;
      IsActiveFor: (id: string | null | undefined) => boolean;
      EndRealtimeSession: ReturnType<typeof vi.fn>;
    };
  }

  function createMessageInputHarness(
    conversationId: string | null,
    activeCallConversationId: string | null,
    createdConversationId: string | null = null
  ): { input: MessageInputComponent; harness: MessageInputTestHarness } {
    const input = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const harness = input as unknown as MessageInputTestHarness;
    harness.ConversationId = conversationId;
    harness.IsSending = false;
    harness.IsProcessing = false;
    harness.IsUploadingAttachments = false;
    harness.registeredCallbacks = new Map();
    harness.inFlightWatches = new Map();
    harness.pendingAttachments = [];
    harness.startedRealtimeSession = false;
    harness.realtimeSession = {
      IsActive: activeCallConversationId !== null,
      SessionCreatedConversationId: createdConversationId,
      IsActiveFor: (id: string | null | undefined) =>
        Boolean(id && activeCallConversationId && id.toLowerCase() === activeCallConversationId.toLowerCase()),
      EndRealtimeSession: vi.fn().mockResolvedValue(undefined),
    };
    return { input, harness };
  }

  it('does NOT end an active voice call on another conversation when an older cached composer is destroyed', () => {
    const { input, harness } = createMessageInputHarness('conv-evicted', 'conv-on-call');
    input.ngOnDestroy();
    expect(harness.realtimeSession.EndRealtimeSession).not.toHaveBeenCalled();
  });

  it('DOES end the voice call when the composer owning that conversation is destroyed', () => {
    const { input, harness } = createMessageInputHarness('conv-on-call', 'conv-on-call');
    input.ngOnDestroy();
    expect(harness.realtimeSession.EndRealtimeSession).toHaveBeenCalledTimes(1);
  });

  it('does NOT end a minimized call when an unrelated or minted empty-state composer unmounts', () => {
    // Case 1: call started on conv-1, user opens "+ New Conversation" then navigates away
    const unrelatedEmpty = createMessageInputHarness(null, 'conv-1', null);
    unrelatedEmpty.input.ngOnDestroy();
    expect(unrelatedEmpty.harness.realtimeSession.EndRealtimeSession).not.toHaveBeenCalled();

    // Case 2: call started from empty state and already minted conv-minted, then user switches conversations
    const mintedEmpty = createMessageInputHarness(null, 'conv-minted', 'conv-minted');
    mintedEmpty.harness.startedRealtimeSession = true;
    mintedEmpty.input.ngOnDestroy();
    expect(mintedEmpty.harness.realtimeSession.EndRealtimeSession).not.toHaveBeenCalled();
  });

  it('reports HasActiveWork accurately across streaming callbacks, watches, attachments, and active voice calls', () => {
    const { input, harness } = createMessageInputHarness('conv-1', null);
    expect(input.HasActiveWork).toBe(false);

    harness.pendingAttachments.push({ id: 'att-1' });
    expect(input.HasActiveWork).toBe(true);
    harness.pendingAttachments.length = 0;

    harness.registeredCallbacks.set('detail-1', () => Promise.resolve());
    expect(input.HasActiveWork).toBe(true);
    harness.registeredCallbacks.clear();

    const activeVoice = createMessageInputHarness('conv-voice', 'CONV-VOICE');
    expect(activeVoice.input.HasActiveWork).toBe(true);
  });

  it('ends any live voice call when ConversationChatAreaComponent itself is destroyed', () => {
    const { component, open } = createState();
    const endSpy = vi.fn().mockResolvedValue(undefined);
    open.RealtimeSession = {
      IsActive: true,
      IsActiveFor: () => false,
      EndRealtimeSession: endSpy,
    };
    const destroyHarness = component as unknown as {
      agentStateService: { stopPolling: () => void };
      destroy$: { next: () => void; complete: () => void };
      clearTurnTracking: () => void;
      stopSendSlotTicker: () => void;
    };
    destroyHarness.agentStateService = { stopPolling: vi.fn() };
    destroyHarness.destroy$ = { next: vi.fn(), complete: vi.fn() };
    destroyHarness.clearTurnTracking = vi.fn();
    destroyHarness.stopSendSlotTicker = vi.fn();

    component.ngOnDestroy();
    expect(endSpy).toHaveBeenCalledTimes(1);
  });
});
