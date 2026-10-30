import { CommonModule } from '@angular/common';
import {
  Component,
  Directive,
  EventEmitter,
  Input,
  Output,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJConversationEntity } from '@memberjunction/core-entities';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { PendingAttachment } from '@memberjunction/ng-composer';

const { mockConfig, mockGetProviderInstance, mockLogError, mockAgentsState } = vi.hoisted(() => {
  const configFn = vi.fn().mockResolvedValue(undefined);
  const agentsState = {
    agents: [] as Array<{ ID: string; Name: string | null }>,
  };
  const providerEngine = {
    Config: configFn,
    get Agents() {
      return agentsState.agents;
    },
  };
  return {
    mockConfig: configFn,
    mockGetProviderInstance: vi.fn(() => providerEngine),
    mockLogError: vi.fn(),
    mockAgentsState: agentsState,
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: mockLogError,
  };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: {
    GetProviderInstance: mockGetProviderInstance,
  },
}));

import { VSCopilotPanelComponent } from './vs-copilot-panel.component';

@Directive({
  standalone: true,
  selector: '[mjChatSlot]',
})
class ChatSlotStubDirective {
  @Input() mjChatSlot = '';
}

@Component({
  standalone: true,
  selector: 'mj-conversation-chat-area',
  template: '',
})
class ConversationChatAreaStubComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() EnvironmentId = '';
  @Input() CurrentUser: UserInfo | null = null;
  @Input() Conversation: MJConversationEntity | null = null;
  @Input() ConversationId: string | null = null;
  @Input() IsNewConversation = false;
  @Input() DefaultAgentId: string | null = null;
  @Input() ShowAgentPicker = true;
  @Input() ShowAgentModePicker = false;
  @Input() PendingMessage: string | null = null;
  @Input() PendingArtifactId: string | null = null;
  @Input() PendingArtifactVersionNumber: number | null = null;
  @Input() PendingArtifactConversationId: string | null = null;
  @Input() AppContext: Record<string, unknown> | null = null;
  @Input() ApplicationScope = '';
  @Input() ApplicationId = '';
  @Input() ShowArtifactIndicator = false;
  @Input() AllowAttachments = false;

  @Output() ConversationCreated = new EventEmitter<{
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }>();
  @Output() PendingMessageConsumed = new EventEmitter<void>();
  @Output() PendingArtifactConsumed = new EventEmitter<void>();
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();

  public OnEmptyStateMessageSent = vi.fn();
}

@Component({
  standalone: true,
  selector: 'mj-loading',
  template: '',
})
class LoadingStubComponent {
  @Input() Text = '';
  @Input() text = '';
  @Input() Size = 'medium';
  @Input() size = 'medium';
}

describe('VSCopilotPanelComponent DOM tests', () => {
  let fixture: ComponentFixture<VSCopilotPanelComponent>;
  let component: VSCopilotPanelComponent;
  const fakeUser = { ID: 'user-1', Name: 'Studio User', Email: 'studio@example.com' } as unknown as UserInfo;
  const fakeProvider = { CurrentUser: fakeUser } as unknown as IMetadataProvider;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAgentsState.agents = [
      { ID: 'agent-vs-001', Name: 'Video Studio' },
      { ID: 'agent-other', Name: 'Sage' },
    ];

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        VSCopilotPanelComponent,
        ConversationChatAreaStubComponent,
        LoadingStubComponent,
        ChatSlotStubDirective,
      ],
      providers: [provideZonelessChangeDetection()],
    })
      .overrideComponent(VSCopilotPanelComponent, {
        set: {
          imports: [
            CommonModule,
            ConversationChatAreaStubComponent,
            LoadingStubComponent,
            ChatSlotStubDirective,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(VSCopilotPanelComponent);
    component = fixture.componentInstance;
    component.Provider = fakeProvider;
    component.CurrentUser = fakeUser;
  });

  it('binds resolved agent ID via GetProviderInstance, ShowAgentPicker=false, ShowAgentModePicker=true, handles conversationCreated and consumed events', async () => {
    component.ConversationId = null;
    component.PendingMessage = 'Create a 45s launch teaser';
    component.PendingArtifactId = 'art-456';
    component.PendingArtifactVersionNumber = 2;
    component.AppContext = {
      VideoStudio: {
        ArchetypeID: 'arch-1',
        BrandKitID: 'kit-1',
        Formats: ['16:9', '9:16'],
        DurationSeconds: 45,
        QueryIDs: ['q-1'],
      },
    };

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockGetProviderInstance).toHaveBeenCalledTimes(1);
    expect(mockGetProviderInstance).toHaveBeenCalledWith(fakeProvider, expect.anything());
    expect(mockConfig).toHaveBeenCalledTimes(1);
    expect(component.AgentMissing).toBe(false);
    expect(component.VideoStudioAgentId).toBe('agent-vs-001');
    expect(component.ChatIsNewConversation).toBe(true);

    const rootEl = fixture.nativeElement as HTMLElement;
    expect(rootEl.querySelector('[data-testid="vs-copilot-agent-missing"]')).toBeNull();

    const chatDebugEl = fixture.debugElement.query(By.directive(ConversationChatAreaStubComponent));
    expect(chatDebugEl).not.toBeNull();
    const chatStub = chatDebugEl.componentInstance as ConversationChatAreaStubComponent;
    expect(chatStub.DefaultAgentId).toBe('agent-vs-001');
    expect(chatStub.ShowAgentPicker).toBe(false);
    expect(chatStub.ShowAgentModePicker).toBe(true);
    expect(chatStub.IsNewConversation).toBe(true);
    expect(chatStub.PendingMessage).toBe('Create a 45s launch teaser');
    expect(chatStub.PendingArtifactId).toBe('art-456');
    expect(chatStub.PendingArtifactVersionNumber).toBe(2);
    expect(chatStub.PendingArtifactConversationId).toBeNull();
    expect(chatStub.ApplicationScope).toBe('Application');
    expect(chatStub.ShowArtifactIndicator).toBe(true);
    expect(chatStub.AllowAttachments).toBe(true);
    expect(chatStub.AppContext).toEqual(component.AppContext);

    // Emit ConversationCreated from the stub: flips ChatIsNewConversation to false and keeps the conversation ID
    const createdConv = { ID: 'conv-created-999', Name: 'Launch Teaser Chat' } as unknown as MJConversationEntity;
    chatStub.ConversationCreated.emit({
      conversation: createdConv,
      pendingMessage: 'Create a 45s launch teaser',
    });
    fixture.detectChanges();

    expect(component.ChatIsNewConversation).toBe(false);
    expect(component.ConversationId).toBe('conv-created-999');
    expect(component.ActiveConversation).toBe(createdConv);
    expect(chatStub.IsNewConversation).toBe(false);
    expect(chatStub.ConversationId).toBe('conv-created-999');

    // Emit consumed events: clears pending message and pending artifact
    chatStub.PendingMessageConsumed.emit();
    chatStub.PendingArtifactConsumed.emit();
    fixture.detectChanges();

    expect(component.PendingMessage).toBeNull();
    expect(component.PendingArtifactId).toBeNull();
    expect(component.PendingArtifactVersionNumber).toBeNull();
    expect(chatStub.PendingMessage).toBeNull();
    expect(chatStub.PendingArtifactId).toBeNull();
    expect(chatStub.PendingArtifactVersionNumber).toBeNull();
  });

  it('StartConversation resets to a new conversation, awaits OnEmptyStateMessageSent on the chat area, and returns this.ConversationId !== null', async () => {
    component.ConversationId = 'conv-existing-1';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const chatDebugEl = fixture.debugElement.query(By.directive(ConversationChatAreaStubComponent));
    const chatStub = chatDebugEl.componentInstance as ConversationChatAreaStubComponent;
    let resolveSend!: () => void;
    chatStub.OnEmptyStateMessageSent.mockImplementation(
      ({ text }: { text: string }) =>
        new Promise<void>((resolve) => {
          resolveSend = () => {
            chatStub.ConversationCreated.emit({
              conversation: { ID: 'conv-started-101', Name: 'New Production' } as unknown as MJConversationEntity,
              pendingMessage: text,
            });
            resolve();
          };
        }),
    );
    expect(component.ChatIsNewConversation).toBe(false);

    const firstMsg =
      'Make a Explainer video, about Q3 product launch, 30 seconds, formats 16:9, brand kit Acme Brand, data from Q3 Revenue.';
    let settled = false;
    const startPromise = component.StartConversation(firstMsg).then((res) => {
      settled = true;
      return res;
    });

    expect(component.ConversationId).toBeNull();
    expect(component.ChatIsNewConversation).toBe(true);
    expect(chatStub.IsNewConversation).toBe(true);
    expect(chatStub.OnEmptyStateMessageSent).toHaveBeenCalledTimes(1);
    expect(chatStub.OnEmptyStateMessageSent).toHaveBeenCalledWith({
      text: firstMsg,
      attachments: [],
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveSend();
    const started = await startPromise;
    expect(settled).toBe(true);
    expect(started).toBe(true);
    expect(component.ConversationId).toBe('conv-started-101');

    // When conversation creation fails (OnEmptyStateMessageSent resolves without emitting ConversationCreated), StartConversation returns false
    chatStub.OnEmptyStateMessageSent.mockImplementation(async () => {
      // Conversation creation failed inside chatArea -> no ConversationCreated emitted
    });
    const failedStart = await component.StartConversation(firstMsg);
    expect(failedStart).toBe(false);
    expect(component.ConversationId).toBeNull();
  });

  it('OnBriefStartRequested sends through one path without pre-setting PendingMessage before ConversationCreated', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const chatDebugEl = fixture.debugElement.query(By.directive(ConversationChatAreaStubComponent));
    const chatStub = chatDebugEl.componentInstance as ConversationChatAreaStubComponent;

    const pendingMessagesSeenDuringSend: Array<string | null> = [];
    chatStub.OnEmptyStateMessageSent.mockImplementation(
      async ({ text }: { text: string }) => {
        pendingMessagesSeenDuringSend.push(component.PendingMessage);
        chatStub.ConversationCreated.emit({
          conversation: { ID: 'conv-brief-1', Name: 'Brief Production' } as unknown as MJConversationEntity,
          pendingMessage: text,
        });
      },
    );

    const briefMessage =
      'Make a KPI Briefing video, about Q4 ARR growth, 12 seconds, formats 16:9 and 9:16, voiceover on, captions burned in.';
    await component.OnBriefStartRequested({
      Message: briefMessage,
      AppContext: { Surface: 'VideoStudioProductions', SuppressChatOverlay: true },
      Archetype: {
        ID: 'arch-1',
        Name: 'KPI Briefing',
        Description: 'Executive KPI briefing',
        Category: 'DataStory',
        Status: 'Active',
        CompanyID: null,
        CompanyName: null,
        IsShipped: true,
        DefaultDurationSeconds: 60,
        MinDurationSeconds: 45,
        MaxDurationSeconds: 90,
        DefaultFormats: '16:9',
        BeatCount: 3,
        BeatLabels: ['Hook', 'KPI', 'Takeaway'],
      },
      BrandKit: null,
      Formats: ['16:9', '9:16'],
      DurationSeconds: 12,
      Topic: 'Q4 ARR growth',
      Queries: [],
      NarrationEnabled: true,
      CaptionsMode: 'Burned',
    });
    fixture.detectChanges();

    // Before ConversationCreated emitted, PendingMessage was null (not pre-assigned)
    expect(pendingMessagesSeenDuringSend).toEqual([null]);
    // OnEmptyStateMessageSent was called exactly once
    expect(chatStub.OnEmptyStateMessageSent).toHaveBeenCalledTimes(1);
    expect(chatStub.OnEmptyStateMessageSent).toHaveBeenCalledWith({
      text: briefMessage,
      attachments: [],
    });
    // And ConversationCreated populated PendingMessage once
    expect(component.PendingMessage).toBe(briefMessage);
    expect(component.ConversationId).toBe('conv-brief-1');
  });

  it('ConversationId setter flips ChatIsNewConversation both ways when updated after initial render', async () => {
    component.ConversationId = null;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const chatDebugEl = fixture.debugElement.query(By.directive(ConversationChatAreaStubComponent));
    const chatStub = chatDebugEl.componentInstance as ConversationChatAreaStubComponent;
    expect(component.ChatIsNewConversation).toBe(true);
    expect(chatStub.IsNewConversation).toBe(true);

    component.ConversationId = 'conv-after-render-42';
    fixture.detectChanges();
    expect(component.ChatIsNewConversation).toBe(false);
    expect(chatStub.IsNewConversation).toBe(false);
    expect(chatStub.ConversationId).toBe('conv-after-render-42');

    component.ConversationId = null;
    fixture.detectChanges();
    expect(component.ChatIsNewConversation).toBe(true);
    expect(chatStub.IsNewConversation).toBe(true);
    expect(chatStub.ConversationId).toBeNull();
  });

  it('renders "Video Studio isn\'t installed or you can\'t run it", logs error, and returns false from StartConversation when agent is missing', async () => {
    mockAgentsState.agents = [{ ID: 'agent-other', Name: 'Sage' }];

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.AgentMissing).toBe(true);
    expect(component.VideoStudioAgentId).toBeNull();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining("VSCopilotPanelComponent: 'Video Studio' agent not found"),
    );

    const rootEl = fixture.nativeElement as HTMLElement;
    const missingEl = rootEl.querySelector('[data-testid="vs-copilot-agent-missing"]');
    expect(missingEl).not.toBeNull();
    expect(missingEl?.textContent).toContain("Video Studio isn't installed or you can't run it");
    expect(rootEl.querySelector('[data-testid="vs-copilot-chat-area"]')).toBeNull();

    const startedWhenMissing = await component.StartConversation('Make a launch video');
    expect(startedWhenMissing).toBe(false);

    const startedWhenBlank = await component.StartConversation('   ');
    expect(startedWhenBlank).toBe(false);
  });
});
