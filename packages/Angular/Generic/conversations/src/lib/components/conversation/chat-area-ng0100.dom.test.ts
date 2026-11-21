import { CommonModule } from '@angular/common';
import { Component, EventEmitter, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationChatAreaComponent } from './conversation-chat-area.component';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationLivenessDomService } from '../../services/conversation-liveness-dom.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { ConversationAttachmentService } from '../../services/conversation-attachment.service';
import { ConversationStreamingService } from '../../services/conversation-streaming.service';
import { DialogService as ConversationsDialogService } from '../../services/dialog.service';
import { ConversationBridgeService } from '../../services/conversation-bridge.service';
import { AnalyzeArtifactService, InteractiveFormApplyService } from '@memberjunction/ng-artifacts';
import { UICommandHandlerService } from '../../services/ui-command-handler.service';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { ConversationEngine, UserInfoEngine, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';

/**
 * A template-less stand-in for one child of the chat area, declaring exactly the inputs and
 * outputs the chat-area template binds on it, so an unknown binding still fails the test.
 */
function stubChild(selector: string, inputs: string[], outputs: string[]): Type<object> {
  @Component({ selector, template: '', standalone: false, inputs, outputs })
  class ChildStub {
    constructor() {
      for (const output of outputs) {
        Reflect.set(this, output, new EventEmitter<void>());
      }
    }
  }
  return ChildStub;
}

/** Every child component the chat-area template renders, stubbed (generated from its bindings). */
const CHILD_STUBS: Type<object>[] = [
  stubChild('mj-artifact-collection-picker-modal', ['artifactName', 'artifactVersionId', 'artifactVersionNumber', 'currentUser', 'environmentId', 'excludeCollectionIds', 'isOpen'], ['cancelled', 'completed']),
  stubChild('mj-artifact-share-modal', ['artifact', 'currentUser', 'isOpen'], ['cancelled', 'saved']),
  stubChild('mj-artifact-viewer-panel', ['Scope', 'artifactId', 'canEdit', 'canShare', 'currentUser', 'environmentId', 'isMaximized', 'refreshTrigger', 'versionNumber', 'viewContext'], ['analyzeRequested', 'applyFormRequested', 'closed', 'maximizeToggled', 'navigateToLink', 'navigationRequest', 'openEntityRecord', 'saveToCollectionRequested', 'shareRequested']),
  stubChild('mj-chat-agent-presence-default', ['AgentName', 'AvatarUrl', 'Mode', 'State'], []),
  stubChild('mj-conversation-agent-picker', ['AllowedAgentIDs', 'Conversation', 'CurrentUser', 'Disabled'], []),
  stubChild('mj-conversation-empty-state', ['AllowedAgentIDs', 'ComposerExtraTemplate', 'MentionPeople', 'acceptedFileTypes', 'currentUser', 'disabled', 'enableAgentMentions', 'enableAttachments', 'enableEntityMentions', 'enableMentions', 'enableSkillCommands', 'greeting', 'initialDraft', 'maxAttachmentSizeBytes', 'maxAttachments', 'overlayMode', 'showSidebarToggle', 'showSuggestedPrompts'], ['ComposerBlurred', 'DraftStateChanged', 'initialDraftApplied', 'messageSent', 'sidebarToggleClicked']),
  stubChild('mj-conversation-forks-popover', ['CurrentUserID', 'PanelID', 'Summaries'], ['Closed', 'ForkSelected']),
  stubChild('mj-conversation-message-list', ['AllowStopRun', 'CanFork', 'ForkChipMap', 'ForkLayout', 'HandoffMap', 'HasMoreAbove', 'InFlightCount', 'InPlaceTurn', 'IsLoadingOlder', 'OpenLinksInNewTab', 'ReadOnly', 'ScrollRoot', 'agentRunMap', 'allowMessageDelete', 'allowMessageEdit', 'allowPinning', 'artifactMap', 'assistantAvatarUrl', 'assistantDisplayName', 'attachmentsMap', 'conversation', 'currentUser', 'isProcessing', 'messageExtraTemplate', 'messageRendererTemplate', 'messages', 'ratingsMap', 'sessionMetaMap', 'showAgentRunDetails', 'showDateNavigation', 'showEmptyFill', 'showMessageRating', 'showReactions', 'userAvatarMap'], ['BeforeStopClicked', 'DateJumpRequested', 'EditResendRequested', 'ForkOpenRequested', 'ForkRequested', 'LivenessCheckRequested', 'OlderRequested', 'RegenerateRequested', 'ResendInPlaceRequested', 'ScrollToMessageRequested', 'StopMessage', 'TaskGraphPanelRequested', 'afterResponseFormSubmitted', 'artifactClicked', 'attachmentClicked', 'beforeResponseFormSubmitted', 'deleteMessage', 'diagnosticRequested', 'messageEdited', 'messagePinToggled', 'openEntityRecord', 'realtimeSessionOpenRequested', 'suggestedResponseSelected', 'testFeedbackMessage']),
  stubChild('mj-conversation-mode-picker', ['AgentID', 'Disabled'], ['PresetChanged']),
  stubChild('mj-empty-state', ['Icon', 'Title'], []),
  stubChild('mj-export-modal', ['ArtifactLink', 'Scope', 'branding', 'conversation', 'currentUser', 'isVisible'], ['cancelled', 'exported']),
  stubChild('mj-image-viewer', ['alt', 'fileName', 'imageUrl', 'visible'], ['closed']),
  stubChild('mj-loading', ['size', 'text'], []),
  stubChild('mj-members-modal', ['conversation', 'currentUser', 'isVisible'], ['cancelled', 'membersChanged']),
  stubChild('mj-message-input', ['AgentHistoryFrom', 'AgentReplyMode', 'AgentTurnHandler', 'AllowedAgentIDs', 'AutoNameConversation', 'EnableDecisionRouting', 'EnableEdgePreDiscovery', 'MentionPeople', 'Placeholder', 'ReadOnly', 'ResolveTargetBranch', 'SendSlotMode', 'StatusElapsed', 'StatusText', 'StopCount', 'StopLabel', 'TargetBranchID', 'acceptedFileTypes', 'agentConfigurationPresetId', 'agentRunsByDetailId', 'appContext', 'applicationId', 'artifactsByDetailId', 'conversationDefaultAgentId', 'conversationHistory', 'conversationId', 'conversationName', 'currentUser', 'defaultAgentId', 'disabled', 'emptyStateMode', 'enableAgentMentions', 'enableAttachments', 'enableEntityMentions', 'enableMentions', 'enablePlanMode', 'enableRealtime', 'enableSkillCommands', 'hidden', 'inProgressMessageIds', 'initialAttachments', 'initialDraft', 'initialMessage', 'maxAttachmentSizeBytes', 'maxAttachments', 'systemArtifactsByDetailId'], ['ComposerBlurred', 'DraftStateChanged', 'MessageStreamed', 'StopClicked', 'afterAgentTurn', 'agentResponse', 'agentRunDetected', 'agentRunUpdate', 'artifactCreated', 'beforeAgentTurn', 'conversationRenamed', 'emptyStateSubmit', 'initialDraftApplied', 'initialMessageAutoSendFailed', 'initialMessageAutoSendStarted', 'intentCheckCompleted', 'intentCheckStarted', 'messageComplete', 'messageSent', 'uploadStateChanged']),
  stubChild('mj-pinned-messages-panel', ['AllowUnpin', 'isLoading', 'pinnedMessages'], ['closed', 'jumpRequested', 'unpinRequested']),
  stubChild('mj-project-selector', ['currentUser', 'environmentId', 'selectedProjectId'], ['projectSelected']),
  stubChild('mj-realtime-remote-browser-surface', [], []),
  stubChild('mj-realtime-session-overlay', ['AgentName', 'AllowStartLive', 'Chrome', 'Compact', 'CurrentUser', 'EnvironmentID', 'Hidden', 'OpenLinksInNewTab', 'ReviewData', 'ShowDevLinks'], ['NavigateRequest', 'ReviewClosed', 'StartLiveRequested']),
  stubChild('mj-resource-share-dialog', ['Adapter', 'Context', 'Visible'], ['Result']),
  stubChild('mj-task-graph-run-view', ['Height', 'LiveUpdates', 'ParentTaskID', 'ShowVariables', 'WorkflowName'], []),
  stubChild('mj-test-feedback-dialog', ['data', 'visible'], ['closed']),
];

describe('ConversationChatAreaComponent — NG0100 template safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function setupTestBed() {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
    vi.spyOn(ConversationEngine.Instance, 'GetConversation').mockReturnValue(undefined);
    vi.spyOn(ConversationsRuntime, 'Instance', 'get').mockReturnValue({
      Bridge: {
        Attach: vi.fn(),
        Detach: vi.fn(),
        SetConversation: vi.fn(),
        OpenArtifact$: new Subject(),
      } as Partial<ConversationsRuntime['Bridge']> as ConversationsRuntime['Bridge'],
      Liveness: {
        ReconciliationRequired$: new Subject(),
      } as Partial<ConversationsRuntime['Liveness']> as ConversationsRuntime['Liveness'],
      Sessions: {
        SessionLifecycle$: new Subject(),
        SessionStarted$: new Subject(),
        SessionEnded$: new Subject(),
        Captions$: new BehaviorSubject([]),
        AgentAudioLevel$: new BehaviorSubject(0),
        UserAudioLevel$: new BehaviorSubject(0),
        State$: new BehaviorSubject('idle'),
        ToolExecuted$: new Subject(),
        ToolEvent$: new Subject(),
        CallEnded$: new Subject(),
        Active$: new BehaviorSubject(false),
      } as Partial<ConversationsRuntime['Sessions']> as ConversationsRuntime['Sessions'],
    } as Partial<ConversationsRuntime> as ConversationsRuntime);

    TestBed.configureTestingModule({
      declarations: [ConversationChatAreaComponent, ...CHILD_STUBS],
      imports: [CommonModule],
      providers: [
        {
          provide: AgentStateService,
          useValue: {
            State$: new BehaviorSubject(null),
            activeAgents$: new BehaviorSubject([]),
            StartPolling: vi.fn(),
            startPolling: vi.fn(),
            StopPolling: vi.fn(),
            stopPolling: vi.fn(),
            IsPolling: false,
            RegisterInProgressMessage: vi.fn(),
          },
        },
        { provide: ConversationLivenessDomService, useValue: { Start: vi.fn(), Stop: vi.fn(), Reset: vi.fn() } },
        { provide: ConversationAgentService, useValue: { GetConversationManagerAgent: vi.fn(), getConversationManagerAgent: vi.fn() } },
        {
          provide: ActiveTasksService,
          useValue: { ActiveTasks$: new BehaviorSubject([]), Tasks$: new BehaviorSubject([]), GetActiveTasksForConversation: vi.fn(() => []) },
        },
        { provide: ArtifactPermissionService, useValue: { checkPermission: vi.fn(async () => true) } },
        { provide: ConversationAttachmentService, useValue: { LoadAttachmentsForDetails: vi.fn(async () => new Map()) } },
        {
          provide: ConversationStreamingService,
          useValue: {
            MessagesUpdated$: new Subject(),
            MessageCompleted$: new Subject(),
            StreamingMessage$: new Subject(),
            AgentRunUpdated$: new Subject(),
            completionEvents$: new Subject(),
          },
        },
        { provide: ConversationsDialogService, useValue: { Confirm: vi.fn() } },
        {
          provide: ConversationBridgeService,
          useValue: {
            NotifyArtifactOpened: vi.fn(),
            SwitchEvent$: new Subject(),
          },
        },
        { provide: AnalyzeArtifactService, useValue: {} },
        {
          provide: UICommandHandlerService,
          useValue: {
            ActionableCommandRequested: new Subject(),
            actionableCommandRequested: new Subject(),
            AutomaticCommandRequested: new Subject(),
          },
        },
        { provide: InteractiveFormApplyService, useValue: {} },
        {
          provide: AgentClientService,
          useValue: {
            IsActive: false,
            SessionId: null,
            ToolRequested$: new Subject(),
            ToolExecuted$: new Subject(),
            RegisterTool: vi.fn(),
            UnregisterTool: vi.fn(),
            GetRegisteredTools: vi.fn(() => []),
            StartSession: vi.fn(),
          },
        },
      ],
    });
  }

  it('does not trigger NG0100 during initial render, EffectiveAppContext reads, or opening the artifact panel', async () => {
    setupTestBed();
    const fixture = TestBed.createComponent(ConversationChatAreaComponent);
    const component = fixture.componentInstance;
    component.AllowRemoteBrowser = true;
    component.ConversationId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    component.AppContext = { Host: 'unit-test' };

    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    // Reading EffectiveAppContext during subsequent CD cycles must remain pure & stable.
    const firstCtx = component.EffectiveAppContext;
    fixture.detectChanges();
    expect(component.EffectiveAppContext).toBe(firstCtx);

    // Opening the artifact panel between ticks (including via applyArtifactPanelAction) must not throw NG0100.
    component.IsLoadingConversation = false;
    component.messages = [
      {
        ID: 'msg-1',
        ConversationID: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        Role: 'AI',
        Message: 'Created doc',
        __mj_CreatedAt: new Date(),
      } as Partial<MJConversationDetailEntity> as MJConversationDetailEntity,
    ];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    // ScrollContainer ViewChild resolves cleanly without NG0100 on MessageScrollRoot
    expect(component.MessageScrollRoot).toBeInstanceOf(HTMLElement);

    const applyArtifactPanelAction = Reflect.get(component, 'applyArtifactPanelAction') as (
      action: { kind: 'open'; artifactId: string; versionNumber?: number },
      conversationId: string
    ) => Promise<void>;
    await applyArtifactPanelAction.call(
      component,
      { kind: 'open', artifactId: '11111111-1111-4111-8111-111111111111', versionNumber: 1 },
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    );
    fixture.detectChanges();
    expect(component.ShowArtifactPanel).toBe(true);
  });
});
