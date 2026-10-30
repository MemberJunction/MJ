// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { EventEmitter } from '@angular/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConversationEngine,
  type ConversationBranchRow,
  type MJConversationDetailEntity,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import {
  GetThreadReplyRoots,
  type ThreadReplyRevealRequest,
} from '../lib/utils/thread-replies';
import type { ConversationOpenView } from '../lib/utils/conversation-forks';

type DetailRole = MJConversationDetailEntity['Role'];
type DetailStatus = MJConversationDetailEntity['Status'];

interface FakeMessageOptions {
  readonly ParentID?: string | null;
  readonly Role?: DetailRole;
  readonly AgentID?: string | null;
  readonly Agent?: string | null;
  readonly Sequence?: number;
  readonly BranchID?: string | null;
  readonly Status?: DetailStatus;
  readonly ConversationID?: string;
  readonly ReplacedAt?: Date | null;
}

function fakeMessage(
  id: string,
  parentId: string | null = null,
  role: DetailRole = 'User',
  agentId: string | null = null,
  extra: Omit<FakeMessageOptions, 'ParentID' | 'Role' | 'AgentID'> = {},
): MJConversationDetailEntity {
  return {
    ID: id,
    ConversationID: extra.ConversationID ?? 'CONV-1',
    ParentID: parentId,
    Role: role,
    AgentID: agentId,
    Agent: extra.Agent ?? null,
    Sequence: extra.Sequence ?? 1,
    BranchID: extra.BranchID ?? null,
    Status: extra.Status ?? 'Complete',
    ReplacedAt: extra.ReplacedAt ?? null,
  } as unknown as MJConversationDetailEntity;
}

function createChatArea(
  messages: MJConversationDetailEntity[],
  view: ConversationOpenView = { Kind: 'Main' },
): ConversationChatAreaComponent {
  const component = Object.create(
    ConversationChatAreaComponent.prototype,
  ) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  open['messages'] = messages;
  open['windowView'] = view;
  open['openView'] = view;
  open['displayCache'] = null;
  open['inPlaceTurnCache'] = null;
  open['layoutCache'] = null;
  open['_conversationId'] = 'CONV-1';
  open['Conversation'] = { ID: 'CONV-1', UserID: 'USER-1' };
  open['CurrentUser'] = { ID: 'USER-1' };
  component.CollapseThreadReplies = false;
  component.ThreadReplyRevealRequested = new EventEmitter<ThreadReplyRevealRequest>();
  return component;
}

describe('GetThreadReplyRoots util', () => {
  it('marks a person reply as a thread reply both when its parent is loaded and when its parent is not loaded', () => {
    const root = fakeMessage('msg-root-1', null, 'User');
    const loadedParentReply = fakeMessage('msg-reply-loaded', 'msg-root-1', 'User');
    const unloadedParentReply = fakeMessage('msg-reply-unloaded', 'msg-missing-root', 'User');

    const roots = GetThreadReplyRoots([root, loadedParentReply, unloadedParentReply]);

    expect(roots.Has('msg-root-1')).toBe(false);
    expect(roots.Get('msg-reply-loaded')).toBe('msg-root-1');
    expect(roots.Get('msg-reply-unloaded')).toBe('msg-missing-root');
  });

  it('keeps an agent answer to a top-level row in the main flow and collapses an agent reply inside a thread', () => {
    const root = fakeMessage('msg-root-1', null, 'User');
    const agentTopAnswer = fakeMessage('msg-agent-top', 'msg-root-1', 'AI', 'agent-1');
    const personReply = fakeMessage('msg-person-reply', 'msg-root-1', 'User');
    const agentInThread = fakeMessage('msg-agent-in-thread', 'msg-person-reply', 'AI', 'agent-1');

    const roots = GetThreadReplyRoots([root, agentTopAnswer, personReply, agentInThread]);

    expect(roots.Has('msg-root-1')).toBe(false);
    expect(roots.Has('msg-agent-top')).toBe(false);
    expect(roots.Get('msg-person-reply')).toBe('msg-root-1');
    expect(roots.Get('msg-agent-in-thread')).toBe('msg-root-1');
  });

  it('treats an Error row as a non-person row (stays on top-level parent or unloaded parent, collapses inside a thread)', () => {
    const root = fakeMessage('msg-root-1', null, 'User');
    const errorOnRoot = fakeMessage('msg-error-top', 'msg-root-1', 'Error');
    const errorUnloadedParent = fakeMessage('msg-error-unloaded', 'msg-missing', 'Error');
    const personReply = fakeMessage('msg-person-reply', 'msg-root-1', 'User');
    const errorInThread = fakeMessage('msg-error-thread', 'msg-person-reply', 'Error');

    const roots = GetThreadReplyRoots([
      root,
      errorOnRoot,
      errorUnloadedParent,
      personReply,
      errorInThread,
    ]);

    expect(roots.Has('msg-error-top')).toBe(false);
    expect(roots.Has('msg-error-unloaded')).toBe(false);
    expect(roots.Get('msg-error-thread')).toBe('msg-root-1');
  });

  it('matches mixed-case UUIDs insensitively and resolves nested replies to the top-level root', () => {
    const root = fakeMessage('AA11BB22-0000-0000-0000-000000000001', null, 'User');
    const reply1 = fakeMessage(
      'CC33DD44-0000-0000-0000-000000000002',
      'aa11bb22-0000-0000-0000-000000000001',
      'User',
    );
    const aiReply = fakeMessage(
      'EE55FF66-0000-0000-0000-000000000003',
      'cc33dd44-0000-0000-0000-000000000002',
      'AI',
      'agent-1',
    );
    const nestedPersonReply = fakeMessage(
      '77889900-0000-0000-0000-000000000004',
      'EE55FF66-0000-0000-0000-000000000003',
      'User',
    );

    const roots = GetThreadReplyRoots([root, reply1, aiReply, nestedPersonReply]);

    expect(roots.Has('aa11bb22-0000-0000-0000-000000000001')).toBe(false);
    expect(roots.Get('cc33dd44-0000-0000-0000-000000000002')).toBe(root.ID);
    expect(roots.Get('ee55ff66-0000-0000-0000-000000000003')).toBe(root.ID);
    expect(roots.Get('77889900-0000-0000-0000-000000000004')).toBe(root.ID);
  });

  it('guards against self-cycles and multi-row ParentID cycles without infinite recursion', () => {
    const selfCycle = fakeMessage('msg-self', 'msg-self', 'User');
    const aiCycleA = fakeMessage('msg-ai-cycle-a', 'msg-ai-cycle-b', 'AI', 'agent-1');
    const aiCycleB = fakeMessage('msg-ai-cycle-b', 'msg-ai-cycle-a', 'AI', 'agent-1');
    const userCycleA = fakeMessage('msg-user-cycle-a', 'msg-user-cycle-b', 'User');
    const userCycleB = fakeMessage('msg-user-cycle-b', 'msg-user-cycle-a', 'User');

    const roots = GetThreadReplyRoots([
      selfCycle,
      aiCycleA,
      aiCycleB,
      userCycleA,
      userCycleB,
    ]);

    expect(roots.Has('msg-self')).toBe(false);
    expect(roots.Has('msg-ai-cycle-a')).toBe(false);
    expect(roots.Has('msg-ai-cycle-b')).toBe(false);
    // In a 2-node User cycle, the cycle guard keeps the entry row in the main flow and collapses the other under it
    expect(roots.Has('msg-user-cycle-a')).toBe(false);
    expect(roots.Get('msg-user-cycle-b')).toBe('msg-user-cycle-a');
  });
});

describe('chat area: CollapseThreadReplies', () => {
  beforeEach(() => {
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({
      CreateSimpleNotification: vi.fn(),
    } as unknown as MJNotificationService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps every row when CollapseThreadReplies is off, and collapses thread replies (including unloaded parents) when on', () => {
    const root1 = fakeMessage('msg-root-1', null, 'User');
    // Case 1: Agent's answer to a top-level message (AgentTurnHandler stamps ParentID = root1.ID)
    const agentAnswerToRoot = fakeMessage('msg-agent-top-answer', 'msg-root-1', 'AI', 'agent-1');
    // Case 2: Person's reply in a thread (ParentID = root1.ID)
    const personThreadReply = fakeMessage('msg-person-reply-1', 'msg-root-1', 'User');
    // Case 3: Agent's reply whose ParentID is itself a thread reply
    const agentThreadReply = fakeMessage('msg-agent-thread-reply', 'msg-person-reply-1', 'AI', 'agent-1');
    // Case 4: Person's reply whose parent is paged out (still a thread reply so paging never flips visibility)
    const orphanPersonReply = fakeMessage('msg-orphan-reply', 'msg-missing-parent', 'User');

    const messages = [
      root1,
      agentAnswerToRoot,
      personThreadReply,
      agentThreadReply,
      orphanPersonReply,
    ];
    const component = createChatArea(messages);

    // Default (CollapseThreadReplies = false): every row stays in top-level DisplayMessages
    expect(component.DisplayMessages).toBe(messages);
    expect(component.DisplayMessages.map((m) => m.ID)).toEqual([
      'msg-root-1',
      'msg-agent-top-answer',
      'msg-person-reply-1',
      'msg-agent-thread-reply',
      'msg-orphan-reply',
    ]);

    // Opt-in (CollapseThreadReplies = true):
    // - root1 and agentAnswerToRoot stay in the main flow
    // - personThreadReply, agentThreadReply, and orphanPersonReply collapse
    component.CollapseThreadReplies = true;
    expect(component.DisplayMessages.map((m) => m.ID)).toEqual([
      'msg-root-1',
      'msg-agent-top-answer',
    ]);
  });

  it('filters thread replies before SplitForkRows so Split and Rows agree in Fork and DraftFork views', () => {
    const inheritedRoot = fakeMessage('inh-root', null, 'User', null, {
      Sequence: 1,
      BranchID: null,
    });
    const inheritedThreadReply = fakeMessage('inh-reply', 'inh-root', 'User', null, {
      Sequence: 2,
      BranchID: null,
    });
    const forkOwnReply = fakeMessage('fork-thread-reply', 'inh-root', 'User', null, {
      Sequence: 3,
      BranchID: 'branch-1',
    });
    const forkOwnMain = fakeMessage('fork-main-1', null, 'User', null, {
      Sequence: 4,
      BranchID: 'branch-1',
    });

    const forkView: ConversationOpenView = { Kind: 'Fork', BranchID: 'branch-1' };
    const component = createChatArea(
      [inheritedRoot, inheritedThreadReply, forkOwnReply, forkOwnMain],
      forkView,
    );
    component.CollapseThreadReplies = true;

    const rows = component.DisplayMessages;
    expect(rows.map((m) => m.ID)).toEqual(['inh-root', 'fork-main-1']);

    const state = (
      component as unknown as {
        displayState: () => {
          Split: { Inherited: MJConversationDetailEntity[]; Own: MJConversationDetailEntity[] };
          Rows: MJConversationDetailEntity[];
        };
      }
    ).displayState();
    expect(state.Split.Inherited.map((m) => m.ID)).toEqual(['inh-root']);
    expect(state.Split.Own.map((m) => m.ID)).toEqual(['fork-main-1']);
    expect([...state.Split.Inherited, ...state.Split.Own]).toEqual(state.Rows);
  });

  it('OnMessageStreamed refreshes the root message and never calls OnMessageSent or followTranscript for a collapsed reply', () => {
    const root = fakeMessage('root-1', null, 'User', null, { Sequence: 1 });
    const personReply = fakeMessage('reply-1', 'root-1', 'User', null, { Sequence: 2 });
    const streamedReply = fakeMessage('ai-thread-1', 'reply-1', 'AI', 'agent-1', {
      Sequence: 3,
      Status: 'In-Progress',
    });

    const component = createChatArea([root, personReply, streamedReply]);
    component.CollapseThreadReplies = true;

    const refreshRenderedMessage = vi.fn(() => false);
    const onMessageSent = vi.spyOn(component, 'OnMessageSent').mockResolvedValue();
    const open = component as unknown as Record<string, unknown>;
    open['messageListComponent'] = { RefreshRenderedMessage: refreshRenderedMessage };
    open['windowStore'] = { ApplyLocalDetail: vi.fn() };
    const followSpy = vi.spyOn(
      component as unknown as { followTranscript: () => void },
      'followTranscript',
    );

    const updatedDelta = fakeMessage('ai-thread-1', 'reply-1', 'AI', 'agent-1', {
      Sequence: 3,
      Status: 'In-Progress',
    });
    component.OnMessageStreamed(updatedDelta);

    expect(refreshRenderedMessage).toHaveBeenCalledTimes(1);
    expect(refreshRenderedMessage).toHaveBeenCalledWith(root);
    expect(onMessageSent).not.toHaveBeenCalled();
    expect(followSpy).not.toHaveBeenCalled();
  });

  it('OnDeleteMessage counts and deletes the target, main-flow rows after it, and thread replies under those roots while keeping replies under kept roots', async () => {
    const root1 = fakeMessage('root-1', null, 'User', null, { Sequence: 1 });
    const root2 = fakeMessage('root-2', null, 'User', null, { Sequence: 2 });
    const replyUnderRoot1 = fakeMessage('reply-root-1', 'root-1', 'User', null, { Sequence: 3 });
    const replyUnderRoot2 = fakeMessage('reply-root-2', 'root-2', 'User', null, { Sequence: 4 });
    const root3 = fakeMessage('root-3', null, 'AI', 'agent-1', { Sequence: 5 });
    const replyUnderRoot3 = fakeMessage('reply-root-3', 'root-3', 'User', null, { Sequence: 6 });

    const component = createChatArea([
      root1,
      root2,
      replyUnderRoot1,
      replyUnderRoot2,
      root3,
      replyUnderRoot3,
    ]);
    component.CollapseThreadReplies = true;

    vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockResolvedValue([]);
    const confirm = vi.fn(async () => true);
    const deletedIds: string[] = [];
    const removeDetail = vi.fn();
    const open = component as unknown as Record<string, unknown>;
    open['confirmDialog'] = { confirm };
    open['windowStore'] = { RemoveDetail: removeDetail };
    open['cdr'] = { detectChanges: vi.fn() };
    open['resetComponentState'] = vi.fn();
    open['Provider'] = {
      GetEntityObject: vi.fn(async () => {
        let loadedId = '';
        return {
          get ID(): string {
            return loadedId;
          },
          Load: vi.fn(async (id: string) => {
            loadedId = id;
            return true;
          }),
          Delete: vi.fn(async () => {
            deletedIds.push(loadedId);
            return true;
          }),
          ResultHistory: [],
        };
      }),
    };

    await component.OnDeleteMessage(root2);

    // Target (root2) + main-flow after it (root3) + replies rooted on them (replyUnderRoot2, replyUnderRoot3) = 4 rows
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Delete this message and the 3 messages after it? This cannot be undone.',
      }),
    );
    expect(deletedIds).toEqual(['root-2', 'reply-root-2', 'root-3', 'reply-root-3']);
    expect(component.messages.map((m) => m.ID)).toEqual(['root-1', 'reply-root-1']);
  });

  it('jumping to a collapsed reply via OnJumpToMessage or OpenMessage scrolls to its root, emits ThreadReplyRevealRequested, and shows no toast', async () => {
    const root = fakeMessage('root-1', null, 'User', null, { Sequence: 10 });
    const personReply = fakeMessage('reply-1', 'root-1', 'User', null, { Sequence: 11 });
    const nestedAgentReply = fakeMessage('reply-2', 'reply-1', 'AI', 'agent-1', { Sequence: 12 });

    const component = createChatArea([root, personReply, nestedAgentReply]);
    component.CollapseThreadReplies = true;

    const scrollToMessage = vi.fn((id: string) => id === 'root-1');
    const open = component as unknown as Record<string, unknown>;
    open['messageListComponent'] = { ScrollToMessage: scrollToMessage };
    open['readyConversationId'] = 'CONV-1';
    open['windowStore'] = {
      GetSnapshot: () => ({
        Details: component.messages,
        Cursor: { OldestSequence: 1, HasMoreAbove: false },
      }),
    };
    open['cdr'] = { detectChanges: vi.fn() };

    const reveals: ThreadReplyRevealRequest[] = [];
    component.ThreadReplyRevealRequested.subscribe((req) => reveals.push(req));
    const notifySpy = MJNotificationService.Instance.CreateSimpleNotification;

    await component.OnJumpToMessage('reply-2');

    expect(scrollToMessage).toHaveBeenCalledWith('root-1');
    expect(reveals).toEqual([{ ReplyID: 'reply-2', RootID: 'root-1' }]);
    expect(notifySpy).not.toHaveBeenCalled();

    scrollToMessage.mockClear();
    const opened = await component.OpenMessage('CONV-1', null, 11);
    expect(opened).toBe(true);
    expect(scrollToMessage).toHaveBeenCalledWith('root-1');
    expect(reveals).toEqual([
      { ReplyID: 'reply-2', RootID: 'root-1' },
      { ReplyID: 'reply-1', RootID: 'root-1' },
    ]);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('followTranscript ignores collapsed thread replies while following main-flow messages', () => {
    const root = fakeMessage('root-1', null, 'User', null, { Sequence: 1 });
    const threadReply = fakeMessage('reply-1', 'root-1', 'User', null, { Sequence: 2 });

    const component = createChatArea([root, threadReply]);
    component.CollapseThreadReplies = true;
    const open = component as unknown as Record<string, unknown>;
    open['scrollToBottom'] = false;
    open['readerAtBottom'] = true;
    open['ReadReplyFromTop'] = true;
    open['currentTurnStartMessageId'] = 'root-1';

    const callFollow = (
      change: 'load' | 'new' | 'update' | 'stream',
      msg?: MJConversationDetailEntity,
    ): void => {
      (
        component as unknown as {
          followTranscript: (
            c: 'load' | 'new' | 'update' | 'stream',
            m?: MJConversationDetailEntity,
          ) => void;
        }
      ).followTranscript(change, msg);
    };

    callFollow('new', threadReply);
    expect(open['scrollToBottom']).toBe(false);
    expect(open['currentTurnStartMessageId']).toBe('root-1');

    const newMainRow = fakeMessage('root-2', null, 'User', null, { Sequence: 3 });
    component.messages = [root, threadReply, newMainRow];
    callFollow('new', newMainRow);
    expect(open['scrollToBottom']).toBe(true);
    expect(open['currentTurnStartMessageId']).toBe('root-2');
  });

  it('InPlaceTurn, turnRowsAfter, and stoppedLastReplyAgent operate on main-flow rows', () => {
    const user1 = fakeMessage('u-1', null, 'User', null, { Sequence: 1 });
    const answer1 = fakeMessage('a-1', 'u-1', 'AI', 'agent-1', {
      Sequence: 2,
      Agent: 'Sage',
    });
    const user2 = fakeMessage('u-2', null, 'User', null, { Sequence: 3 });
    const answer2 = fakeMessage('a-2', 'u-2', 'AI', 'agent-1', {
      Sequence: 4,
      Agent: 'Sage',
    });
    // A thread reply posted after answer2 on the earlier root user1
    const lateThreadReplyOnUser1 = fakeMessage('t-1', 'u-1', 'User', null, { Sequence: 5 });
    const lateAgentReplyOnUser1 = fakeMessage('t-2', 't-1', 'AI', 'agent-2', {
      Sequence: 6,
      Agent: 'ThreadHelper',
    });
    // A thread reply rooted on answer2
    const threadReplyOnAnswer2 = fakeMessage('t-3', 'a-2', 'User', null, { Sequence: 7 });

    const component = createChatArea([
      user1,
      answer1,
      user2,
      answer2,
      lateThreadReplyOnUser1,
      lateAgentReplyOnUser1,
      threadReplyOnAnswer2,
    ]);
    component.CollapseThreadReplies = true;

    const open = component as unknown as Record<string, unknown>;
    open['branchRowsConversationId'] = 'CONV-1';
    const branches: ConversationBranchRow[] = [
      // A fork placed under lateThreadReplyOnUser1 (which is in root1's thread, not user2's turn)
      {
        ID: 'branch-on-thread-1',
        ConversationID: 'CONV-1',
        ParentBranchID: null,
        ForkFromSequence: null,
        SourceDetailID: 't-1',
        Name: null,
      },
    ];
    open['branches'] = branches;
    Object.defineProperty(open, 'CanFork', { get: () => false, configurable: true });

    // InPlaceTurn finds user2 -> answer2 in the main flow, unblocked by the fork on root1's thread
    expect(component.InPlaceTurn).toEqual({
      UserDetailID: 'u-2',
      AnswerDetailID: 'a-2',
    });

    // turnRowsAfter for user2 includes answer2 and threadReplyOnAnswer2, but not lateThreadReplyOnUser1/t-2
    const afterUser2 = (
      component as unknown as {
        turnRowsAfter: (
          msgs: MJConversationDetailEntity[],
          u: MJConversationDetailEntity,
        ) => MJConversationDetailEntity[];
      }
    ).turnRowsAfter(component.messages, user2);
    expect(afterUser2.map((m) => m.ID)).toEqual(['a-2', 't-3']);

    // stoppedLastReplyAgent ignores a stopped thread reply and checks the newest main-flow row by Sequence
    open['AllowStopRun'] = true;
    open['_inProgressMessageIds'] = [];
    open['AgentRunsByDetailId'] = new Map([
      ['t-2', { ID: 'run-thread', Agent: 'ThreadHelper', WasStoppedByUser: true }],
      ['a-1', { ID: 'run-1', Agent: 'Sage', WasStoppedByUser: true }],
      ['a-2', { ID: 'run-2', Agent: 'Sage', WasStoppedByUser: false }],
    ]);
    expect(component.ComposerPlaceholderFor('CONV-1')).toBe(
      'Type a message... (Ctrl+Enter to send)',
    );

    // When the newest main-flow reply (a-2) was stopped, the placeholder reflects it even with later thread replies
    open['AgentRunsByDetailId'] = new Map([
      ['a-2', { ID: 'run-2', Agent: 'Sage', WasStoppedByUser: true }],
    ]);
    expect(component.ComposerPlaceholderFor('CONV-1')).toBe(
      'Continue, or tell Sage what to do differently',
    );
  });
});
