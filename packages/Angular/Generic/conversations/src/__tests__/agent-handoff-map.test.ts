import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MJConversationDetailEntity, MJAIAgentConfigurationEntity } from '@memberjunction/core-entities';
import type { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import {
  BuildHandoffsByDetailId,
  DeriveHandoffStatus,
  FindHandoffTargetDetail,
  LoadHandoffStepsForRuns,
  LookupHandoffByDetailId,
  ResolveHandedOffFromForMessage,
  type HandoffRunStepRow,
} from '../lib/utils/agent-handoff-map';
import {
  AgentAccentVar,
  MapHandoffFailureCopy,
  type HandoffRefusalReason,
  type MessageHandoffInfo,
} from '../lib/components/message/agent-handoff-card.component';
import { MessageItemComponent } from '../lib/components/message/message-item.component';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';
import { MessageInputComponent } from '../lib/components/message/message-input.component';

const AGENTS = [
  { ID: '11111111-1111-4111-8111-111111111111', Name: 'Sage', IconClass: 'fa-solid fa-sparkles', LogoURL: null },
  { ID: '22222222-2222-4222-8222-222222222222', Name: 'Research Agent', IconClass: 'fa-solid fa-magnifying-glass', LogoURL: null },
  { ID: '33333333-3333-4333-8333-333333333333', Name: 'Copywriter', IconClass: 'fa-solid fa-pen', LogoURL: null },
] as unknown as MJAIAgentEntityExtended[];

function detail(partial: Partial<MJConversationDetailEntity> & { ID: string }): MJConversationDetailEntity {
  return {
    Role: 'AI',
    Status: 'Complete',
    Message: 'Done',
    ParentID: null,
    AgentID: null,
    Agent: null,
    ...partial,
  } as unknown as MJConversationDetailEntity;
}

describe('BuildHandoffsByDetailId & DeriveHandoffStatus', () => {
  it('derives Transferring when target detail is missing', () => {
    const status = DeriveHandoffStatus(
      'Transferred',
      'det-source',
      '22222222-2222-4222-8222-222222222222',
      null,
      [],
    );
    expect(status).toBe('Transferring');
  });

  it('derives Transferring when target detail is still In-Progress', () => {
    const messages = [
      detail({ ID: 'det-source', AgentID: '11111111-1111-4111-8111-111111111111' }),
      detail({
        ID: 'det-target',
        ParentID: 'det-source',
        AgentID: '22222222-2222-4222-8222-222222222222',
        Status: 'In-Progress',
        Message: '⏳ Starting...',
      }),
    ];
    const status = DeriveHandoffStatus(
      'Transferred',
      'det-source',
      '22222222-2222-4222-8222-222222222222',
      'det-target',
      messages,
    );
    expect(status).toBe('Transferring');
  });

  it('derives Transferred when target detail is Complete', () => {
    const messages = [
      detail({ ID: 'det-source', AgentID: '11111111-1111-4111-8111-111111111111' }),
      detail({
        ID: 'det-target',
        ParentID: 'det-source',
        AgentID: '22222222-2222-4222-8222-222222222222',
        Status: 'Complete',
        Message: 'Here are the findings.',
      }),
    ];
    const status = DeriveHandoffStatus(
      'Transferred',
      'det-source',
      '22222222-2222-4222-8222-222222222222',
      'det-target',
      messages,
    );
    expect(status).toBe('Transferred');
  });

  it('derives Failed when baseStatus is Failed regardless of target detail', () => {
    const status = DeriveHandoffStatus(
      'Failed',
      'det-source',
      '22222222-2222-4222-8222-222222222222',
      'det-target',
      [detail({ ID: 'det-target', Status: 'Complete' })],
    );
    expect(status).toBe('Failed');
  });

  it('maps a completed Handoff step with InputData/OutputData to the source ConversationDetailID', () => {
    const messages = [
      detail({
        ID: 'det-source-1',
        AgentID: '11111111-1111-4111-8111-111111111111',
        Agent: 'Sage',
        Message: 'Transferring to Research Agent.',
      }),
      detail({
        ID: 'det-target-1',
        ParentID: 'det-source-1',
        AgentID: '22222222-2222-4222-8222-222222222222',
        Agent: 'Research Agent',
        Status: 'Complete',
        Message: 'Found 3 peer-reviewed papers.',
      }),
    ];
    const runs = new Map<string, MJAIAgentRunEntityExtended>([
      [
        'det-source-1',
        {
          ID: 'run-1',
          ConversationDetailID: 'det-source-1',
          AgentID: '11111111-1111-4111-8111-111111111111',
          Agent: 'Sage',
        } as unknown as MJAIAgentRunEntityExtended,
      ],
    ]);
    const steps: HandoffRunStepRow[] = [
      {
        ID: 'step-1',
        AgentRunID: 'run-1',
        StepNumber: 1,
        StepType: 'Handoff',
        Status: 'Completed',
        TargetID: '22222222-2222-4222-8222-222222222222',
        InputData: JSON.stringify({
          agentName: 'Research Agent',
          brief: 'User asked for peer-reviewed papers on fusion.',
          reason: 'Needs deep citation lookup',
        }),
        OutputData: JSON.stringify({
          HandoffToAgentID: '22222222-2222-4222-8222-222222222222',
          TargetAgentName: 'Research Agent',
          TargetConversationDetailID: 'det-target-1',
          PresetName: 'Balanced',
          Chain: [
            '11111111-1111-4111-8111-111111111111',
            '33333333-3333-4333-8333-333333333333',
          ],
        }),
      },
    ];

    const map = BuildHandoffsByDetailId({
      Messages: messages,
      AgentRunsByDetailId: runs,
      HandoffSteps: steps,
      Agents: AGENTS,
      Presets: [] as MJAIAgentConfigurationEntity[],
    });

    const summary = LookupHandoffByDetailId(map, 'DET-SOURCE-1');
    expect(summary).not.toBeNull();
    expect(summary?.Status).toBe('Transferred');
    expect(summary?.SourceAgent.Name).toBe('Sage');
    expect(summary?.TargetAgent.Name).toBe('Research Agent');
    expect(summary?.Reason).toBe('Needs deep citation lookup');
    expect(summary?.Brief).toBe('User asked for peer-reviewed papers on fusion.');
    expect(summary?.TargetDetailId).toBe('det-target-1');
    expect(summary?.PresetName).toBe('Balanced');
    expect(summary?.HopChain?.map(p => (typeof p === 'string' ? p : p.Name))).toEqual([
      'Sage',
      'Copywriter',
      'Research Agent',
    ]);
  });

  it('records FailureReason and Failed status when handoff step failed', () => {
    const messages = [
      detail({
        ID: 'det-source-2',
        AgentID: '11111111-1111-4111-8111-111111111111',
        Agent: 'Sage',
      }),
    ];
    const runs = new Map<string, MJAIAgentRunEntityExtended>([
      [
        'det-source-2',
        {
          ID: 'run-2',
          ConversationDetailID: 'det-source-2',
          AgentID: '11111111-1111-4111-8111-111111111111',
          Agent: 'Sage',
        } as unknown as MJAIAgentRunEntityExtended,
      ],
    ]);
    const steps: HandoffRunStepRow[] = [
      {
        ID: 'step-fail',
        AgentRunID: 'run-2',
        StepNumber: 1,
        StepType: 'Handoff',
        Status: 'Failed',
        TargetID: '33333333-3333-4333-8333-333333333333',
        InputData: JSON.stringify({ agentName: 'Copywriter', reason: 'Draft copy' }),
        OutputData: JSON.stringify({ RefusalReason: 'AlreadyInThisTurn' }),
        ErrorMessage: 'Cycle detected',
      },
    ];

    const map = BuildHandoffsByDetailId({
      Messages: messages,
      AgentRunsByDetailId: runs,
      HandoffSteps: steps,
      Agents: AGENTS,
    });

    const summary = LookupHandoffByDetailId(map, 'det-source-2');
    expect(summary?.Status).toBe('Failed');
    expect(summary?.FailureReason).toBe('AlreadyInThisTurn');
  });

  it('finds target detail by ParentID and resolves HandedOffFrom for a target message', () => {
    const sourceMsg = detail({
      ID: 'det-source-99',
      AgentID: '11111111-1111-4111-8111-111111111111',
      Agent: 'Sage',
    });
    const targetMsg = detail({
      ID: 'det-target-99',
      ParentID: 'det-source-99',
      AgentID: '22222222-2222-4222-8222-222222222222',
      Agent: 'Research Agent',
    });
    const messages = [sourceMsg, targetMsg];
    const runs = new Map<string, MJAIAgentRunEntityExtended>([
      [
        'det-source-99',
        {
          ID: 'run-99',
          ConversationDetailID: 'det-source-99',
          AgentID: '11111111-1111-4111-8111-111111111111',
          Agent: 'Sage',
        } as unknown as MJAIAgentRunEntityExtended,
      ],
    ]);
    const steps: HandoffRunStepRow[] = [
      {
        ID: 'step-99',
        AgentRunID: 'run-99',
        StepType: 'Handoff',
        Status: 'Completed',
        TargetID: '22222222-2222-4222-8222-222222222222',
        OutputData: JSON.stringify({
          HandoffToAgentID: '22222222-2222-4222-8222-222222222222',
          PresetName: 'Fast',
        }),
      },
    ];

    expect(
      FindHandoffTargetDetail('det-source-99', '22222222-2222-4222-8222-222222222222', messages)?.ID,
    ).toBe('det-target-99');

    const map = BuildHandoffsByDetailId({
      Messages: messages,
      AgentRunsByDetailId: runs,
      HandoffSteps: steps,
      Agents: AGENTS,
    });
    const handedOffFrom = ResolveHandedOffFromForMessage(targetMsg, map);
    expect(handedOffFrom).not.toBeNull();
    expect(handedOffFrom?.SourceAgent.Name).toBe('Sage');
    expect(handedOffFrom?.TargetAgent.Name).toBe('Research Agent');
    expect(handedOffFrom?.PresetName).toBe('Fast');
    expect(handedOffFrom?.SourceDetailId).toBe('det-source-99');
  });
});

describe('AgentAccentVar & MapHandoffFailureCopy', () => {
  it('picks a deterministic accent token in --mj-agent-accent-<family> and falls back to --mj-brand-primary', () => {
    const accent = AgentAccentVar('11111111-1111-4111-8111-111111111111');
    expect(accent).toMatch(/^var\(--mj-agent-accent-(brand|accent|indigo|violet|tertiary|info)\)$/);
    expect(AgentAccentVar('11111111-1111-4111-8111-111111111111')).toBe(accent);
    expect(AgentAccentVar(null)).toBe('var(--mj-brand-primary)');
  });

  it.each<[HandoffRefusalReason, string, string]>([
    [
      'NoRunPermission',
      "You don't have access to Research Agent. Sage will continue.",
      'Ask an admin for access to Research Agent',
    ],
    [
      'NotDiscoverable',
      "Research Agent isn't available for direct transfers. Sage will continue.",
      'Continue with Sage or mention another agent',
    ],
    [
      'NotAllowedHere',
      'Research Agent is not available in this app. Sage will continue.',
      'Open a full workspace to use Research Agent',
    ],
    [
      'HopLimit',
      'Maximum transfer limit reached for this turn. Sage will continue.',
      'Send a follow-up message to continue',
    ],
    [
      'AlreadyInThisTurn',
      'Research Agent already participated in this turn. Sage will continue.',
      'Mention @Research Agent in your next message',
    ],
    [
      'NotFound',
      "Couldn't find an active agent named Research Agent. Sage will continue.",
      'Check the agent name or pick another agent',
    ],
  ])('maps %s refusal reason to exact user-safe copy', (reason, expectedReason, expectedNextStep) => {
    const copy = MapHandoffFailureCopy(reason, 'Research Agent', 'Sage');
    expect(copy.ReasonText).toBe(expectedReason);
    expect(copy.NextStepText).toBe(expectedNextStep);
  });
});

describe('MessageItemComponent handoff integration & prefers-reduced-motion CSS', () => {
  const sampleHandoff: MessageHandoffInfo = {
    Status: 'Transferred',
    SourceAgent: { ID: '11111111-1111-4111-8111-111111111111', Name: 'Sage', IconClass: 'fa-solid fa-sparkles', AvatarUrl: null },
    TargetAgent: { ID: '22222222-2222-4222-8222-222222222222', Name: 'Research Agent', IconClass: 'fa-solid fa-magnifying-glass', AvatarUrl: null },
    Reason: 'Specialized research',
    Brief: 'Brief summary',
    TargetDetailId: 'det-target',
    PresetName: 'Balanced',
    HopChain: [
      { ID: '11111111-1111-4111-8111-111111111111', Name: 'Sage' },
      { ID: '22222222-2222-4222-8222-222222222222', Name: 'Research Agent' },
    ],
  };

  it('dims source message when Handoff is Transferred and skips legacy delegation regex truncation', () => {
    const proto = MessageItemComponent.prototype as unknown as {
      Handoff: MessageHandoffInfo | null;
      HandedOffFrom: unknown;
      IsSourceTransferred: boolean;
      IsConversationManager: boolean;
      message: { Message: string; Role: string; Status: string; IsPinned?: boolean };
      IsAIMessage: boolean;
      IsUserMessage: boolean;
      IsInProgressAIMessage: boolean;
      IsEditing: boolean;
      PendingReplace: boolean;
      ForkRail: null;
      _cachedRawText: string;
      _cachedHadHandoff: boolean;
      _cachedDisplayMessage: string;
      transformMentionsToHTML: (t: string) => string;
      computeDisplayMessage: () => string;
      buildMessageClasses: () => string;
    };

    const instance = Object.create(proto) as typeof proto;
    instance.Handoff = sampleHandoff;
    instance.HandedOffFrom = null;
    instance.message = {
      Message: 'Intro text\n🤖 Delegating to Research Agent now',
      Role: 'AI',
      Status: 'Complete',
    };
    Object.defineProperty(instance, 'IsConversationManager', { get: () => true });
    Object.defineProperty(instance, 'IsAIMessage', { get: () => true });
    Object.defineProperty(instance, 'IsUserMessage', { get: () => false });
    Object.defineProperty(instance, 'IsInProgressAIMessage', { get: () => false });
    instance.IsEditing = false;
    instance.PendingReplace = false;
    instance.ForkRail = null;
    instance.transformMentionsToHTML = (t: string) => t;

    expect(instance.IsSourceTransferred).toBe(true);
    expect(instance.computeDisplayMessage()).toContain('Intro text');
    expect(instance.computeDisplayMessage()).toContain('🤖 Delegating to Research Agent now');
    expect(instance.buildMessageClasses()).toContain('handoff-source-transferred');
  });

  it('does not add handoff-source-transferred or msg--handed when Handoff is Failed, and CSS dims only handoff-source-transferred', () => {
    const proto = MessageItemComponent.prototype as unknown as {
      Handoff: MessageHandoffInfo | null;
      HandedOffFrom: unknown;
      IsSourceTransferred: boolean;
      message: { Message: string; Role: string; Status: string; IsPinned?: boolean };
      IsAIMessage: boolean;
      IsUserMessage: boolean;
      IsInProgressAIMessage: boolean;
      IsEditing: boolean;
      PendingReplace: boolean;
      ForkRail: null;
      buildMessageClasses: () => string;
    };

    const instance = Object.create(proto) as typeof proto;
    instance.Handoff = { ...sampleHandoff, Status: 'Failed', FailureReason: 'NotDiscoverable' };
    instance.HandedOffFrom = null;
    instance.message = {
      Message: 'Sage fallback answer after refusal.',
      Role: 'AI',
      Status: 'Complete',
    };
    Object.defineProperty(instance, 'IsAIMessage', { get: () => true });
    Object.defineProperty(instance, 'IsUserMessage', { get: () => false });
    Object.defineProperty(instance, 'IsInProgressAIMessage', { get: () => false });
    instance.IsEditing = false;
    instance.PendingReplace = false;
    instance.ForkRail = null;

    expect(instance.IsSourceTransferred).toBe(false);
    const classes = instance.buildMessageClasses().split(/\s+/);
    expect(classes).toContain('handoff-source');
    expect(classes).not.toContain('handoff-source-transferred');
    expect(classes).not.toContain('msg--handed');

    const cssPath = resolve(__dirname, '../lib/components/message/message-item.component.css');
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('.message-item.handoff-source-transferred .message-text');
    expect(css).not.toContain('.message-item.msg--handed .message-text');
  });

  it('marks target message with target-block/handoff-target classes, TargetAccentVar, and IsHandedOffTargetJoining while In-Progress', () => {
    const proto = MessageItemComponent.prototype as unknown as {
      Handoff: MessageHandoffInfo | null;
      HandedOffFrom: typeof sampleHandoff | null;
      TargetAccentVar: string;
      HandedOffFromAccentVar: string;
      IsHandedOffTargetJoining: boolean;
      message: { Message: string; Role: string; Status: string; AgentID?: string };
      IsAIMessage: boolean;
      IsUserMessage: boolean;
      IsInProgressAIMessage: boolean;
      IsEditing: boolean;
      PendingReplace: boolean;
      ForkRail: null;
      buildMessageClasses: () => string;
    };

    const instance = Object.create(proto) as typeof proto;
    instance.Handoff = null;
    instance.HandedOffFrom = sampleHandoff;
    instance.message = {
      Message: '⏳ Starting...',
      Role: 'AI',
      Status: 'In-Progress',
      AgentID: '22222222-2222-4222-8222-222222222222',
    };
    Object.defineProperty(instance, 'IsAIMessage', { get: () => true });
    Object.defineProperty(instance, 'IsUserMessage', { get: () => false });
    Object.defineProperty(instance, 'IsInProgressAIMessage', { get: () => true });
    instance.IsEditing = false;
    instance.PendingReplace = false;
    instance.ForkRail = null;

    expect(instance.IsHandedOffTargetJoining).toBe(true);
    expect(instance.TargetAccentVar).toBe(AgentAccentVar('22222222-2222-4222-8222-222222222222'));
    expect(instance.HandedOffFromAccentVar).toBe(AgentAccentVar('11111111-1111-4111-8111-111111111111'));
    expect(instance.buildMessageClasses()).toContain('target-block');
    expect(instance.buildMessageClasses()).toContain('handoff-target');
  });

  it('message-item template renders via provenance badge, preset pill, and joining skeleton', () => {
    const htmlPath = resolve(__dirname, '../lib/components/message/message-item.component.html');
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toContain('via {{ HandedOffFrom.SourceAgent.Name }}');
    expect(html).toContain('{{ HandedOffFrom.PresetName }}');
    expect(html).toContain('Joining the conversation…');
    expect(html).toContain('<mj-agent-handoff-card [Handoff]="Handoff">');
  });

  it('agent-handoff-card.component.css includes @media (prefers-reduced-motion: reduce) stopping spark animation', () => {
    const cssPath = resolve(__dirname, '../lib/components/message/agent-handoff-card.component.css');
    const css = readFileSync(cssPath, 'utf8');
    const mediaIndex = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(mediaIndex).toBeGreaterThanOrEqual(0);
    const mediaBlock = css.slice(mediaIndex);
    const sparkRuleMatch = mediaBlock.match(/\.handoff--transferring\s+\.track\s+\.spark\s*\{([^}]*)\}/);
    expect(sparkRuleMatch).not.toBeNull();
    expect(sparkRuleMatch?.[1]).toContain('animation: none');
  });

  it('LoadHandoffStepsForRuns uses EscapeSQLString (stripping null bytes and escaping quotes) rather than inline quote regex', async () => {
    let capturedFilter = '';
    const fakeProvider = {
      RunView: async (params: { ExtraFilter?: string }) => {
        capturedFilter = params.ExtraFilter ?? '';
        return { Success: true, Results: [] };
      },
    };
    await LoadHandoffStepsForRuns(
      fakeProvider as unknown as Parameters<typeof LoadHandoffStepsForRuns>[0],
      ["run\0'1"],
    );
    expect(capturedFilter).toBe("StepType = 'Handoff' AND AgentRunID IN ('run''1')");

    const mapSrc = readFileSync(resolve(__dirname, '../lib/utils/agent-handoff-map.ts'), 'utf8');
    expect(mapSrc).toContain('EscapeSQLString');
    expect(mapSrc).not.toContain(".replace(/'/g");
  });

  it('OnMessageSent rebuilds HandoffsByDetailId only when a new message is added, not on in-place progress updates (VS-QA-3 #10)', async () => {
    const rebuildHandoffsMap = vi.fn();
    const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const msg1 = detail({
      ID: '11111111-1111-4111-8111-000000000001',
      ConversationID: 'conv-1',
      Status: 'In-Progress',
      Message: '⏳ Starting...',
    });

    Object.assign(component as unknown as Record<string, unknown>, {
      ConversationId: 'conv-1',
      messages: [],
      InProgressMessageIds: [],
      initialDraftSnapshots: new Map(),
      draftStore: { ClearDraft: vi.fn() },
      windowStore: { ApplyLocalDetail: vi.fn() },
      streamingService: { GetRecentCompletion: vi.fn(() => undefined) },
      cdr: { detectChanges: vi.fn() },
      nameForkFromFirstSend: vi.fn(),
      acceptRowForOpenView: () => true,
      isActiveConversation: (id: string) => id === 'conv-1',
      ensureCurrentUserInAvatarMap: vi.fn(),
      resetComponentState: vi.fn(),
      loadAttachmentsForMessage: vi.fn(async () => undefined),
      followTranscript: vi.fn(),
      rebuildHandoffsMap,
    });

    await component.OnMessageSent(msg1);
    expect(rebuildHandoffsMap).toHaveBeenCalledTimes(1);

    const updatedMsg1 = detail({
      ID: '11111111-1111-4111-8111-000000000001',
      ConversationID: 'conv-1',
      Status: 'In-Progress',
      Message: '⏳ Step 2...',
    });
    await component.OnMessageSent(updatedMsg1);
    expect(rebuildHandoffsMap).toHaveBeenCalledTimes(1);
  });

  it('memoizes CurrentOwnerAgent and CurrentRouteAgent by message count (VS-QA-3 #10)', () => {
    const resolveHandoffAgentMeta = vi.fn((id: string) => ({
      ID: id,
      Name: 'Research Agent',
      IconClass: null,
      LogoURL: null,
    }));
    const chatArea = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
    const messages: MJConversationDetailEntity[] = [
      detail({
        ID: '11111111-1111-4111-8111-000000000001',
        Role: 'AI',
        AgentID: '22222222-2222-4222-8222-222222222222',
        Agent: 'Research Agent',
        __mj_CreatedAt: new Date('2026-10-19T12:00:00Z'),
      }),
    ];
    Object.assign(chatArea as unknown as Record<string, unknown>, {
      conversationManagerAgent: { ID: '11111111-1111-4111-8111-111111111111', Name: 'Sage' },
      messages,
      AgentHistoryFrom: null,
      Conversation: null,
      DefaultAgentId: null,
      AllowedAgentIDs: null,
      isOwnerAgentAllowed: () => true,
      resolveHandoffAgentMeta,
    });
    Object.defineProperty(chatArea, 'DisplayMessages', { get: () => [] });

    expect(chatArea.CurrentOwnerAgent?.Name).toBe('Research Agent');
    expect(chatArea.CurrentOwnerAgent?.Name).toBe('Research Agent');
    expect(chatArea.CurrentOwnerAgentName).toBe('Research Agent');
    expect(resolveHandoffAgentMeta).toHaveBeenCalledTimes(1);

    // Adding a new @Sage user message changes message count and invalidates the memo
    messages.push(
      detail({
        ID: '11111111-1111-4111-8111-000000000002',
        Role: 'User',
        Message: '@Sage help',
        __mj_CreatedAt: new Date('2026-10-19T12:01:00Z'),
      }),
    );
    expect(chatArea.CurrentOwnerAgent?.IsConversationManager).toBe(true);
    expect(resolveHandoffAgentMeta).toHaveBeenCalledTimes(2);

    // MessageInputComponent.CurrentRouteAgent memoization by message count
    const history: MJConversationDetailEntity[] = [
      detail({
        ID: '11111111-1111-4111-8111-000000000001',
        Role: 'AI',
        AgentID: '22222222-2222-4222-8222-222222222222',
        Agent: 'Research Agent',
        __mj_CreatedAt: new Date('2026-10-19T12:00:00Z'),
      }),
    ];
    const messageInput = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    const isWithinHistoryFloor = vi.fn(() => true);
    Object.assign(messageInput as unknown as Record<string, unknown>, {
      ConversationHistory: history,
      converationManagerAgent: { ID: '11111111-1111-4111-8111-111111111111', Name: 'Sage' },
      conversationDefaultAgentId: null,
      defaultAgentId: null,
      allowedAgentIDs: null,
      mentionedAgentId: null,
      inputBox: { getMentionChipsData: () => [] },
      isWithinHistoryFloor,
    });

    expect(messageInput.CurrentRouteAgent?.Name).toBe('Research Agent');
    expect(messageInput.CurrentRouteAgent?.Name).toBe('Research Agent');
    expect(messageInput.CurrentRouteAgentName).toBe('Research Agent');
    expect(isWithinHistoryFloor).toHaveBeenCalledTimes(1);

    history.push(
      detail({
        ID: '11111111-1111-4111-8111-000000000002',
        Role: 'User',
        Message: '@Sage help',
        __mj_CreatedAt: new Date('2026-10-19T12:01:00Z'),
      }),
    );
    expect(messageInput.CurrentRouteAgent?.IsConversationManager).toBe(true);
    expect(messageInput.CurrentRouteAgent?.IsConversationManager).toBe(true);
    expect(isWithinHistoryFloor).toHaveBeenCalledTimes(2);
  });
});


