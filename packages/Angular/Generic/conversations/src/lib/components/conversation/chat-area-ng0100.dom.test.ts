import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
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

describe('ConversationChatAreaComponent — NG0100 template safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function setupTestBed() {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined as never);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockReturnValue(undefined as never);
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
      declarations: [ConversationChatAreaComponent],
      imports: [CommonModule],
      schemas: [NO_ERRORS_SCHEMA],
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
