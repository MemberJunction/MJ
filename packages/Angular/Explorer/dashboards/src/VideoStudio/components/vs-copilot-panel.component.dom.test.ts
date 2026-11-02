import { CommonModule } from '@angular/common';
import {
  Component,
  ContentChildren,
  Directive,
  EventEmitter,
  Input,
  Output,
  QueryList,
  TemplateRef,
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

import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { VSCopilotPanelComponent } from './vs-copilot-panel.component';

@Directive({
  standalone: true,
  selector: 'ng-template[mjChatSlot]',
})
class ChatSlotStubDirective {
  @Input() mjChatSlot = '';
  constructor(public readonly templateRef: TemplateRef<unknown>) {}
}

@Component({
  standalone: true,
  selector: 'vs-setup-health-card',
  template: '<div data-testid="stub-setup-health-card"></div>',
})
class SetupHealthCardStubComponent {
  @Input() Result: unknown = null;
  @Input() Loading = false;
  @Input() Expanded = false;
  @Output() ExpandedChange = new EventEmitter<boolean>();
  @Output() Recheck = new EventEmitter<void>();
}

@Component({
  standalone: true,
  selector: 'vs-production-brief',
  template: '<div data-testid="stub-production-brief"></div>',
})
class ProductionBriefStubComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() AutoCheckSetupHealth = true;
  @Input() ShowSetupHealthCard = true;
  @Input() SetupHealthResult: unknown = null;
  @Input() IsCheckingSetupHealth = false;
  @Input() ShowHealthySetupDetails = false;
  @Input() SelectedArchetype: unknown = null;
  @Input() SelectedBrandKit: unknown = null;
  @Input() SelectedBrandKitExplicitNone = false;
  @Input() SelectedFormats: string[] = ['16:9'];
  @Input() DurationSeconds = 30;
  @Input() Topic = '';
  @Input() SelectedQueries: unknown[] = [];
  @Input() NarrationEnabled = true;
  @Input() CaptionsMode = 'Burned';
  @Output() ShowHealthySetupDetailsChange = new EventEmitter<boolean>();
  @Output() SetupHealthChange = new EventEmitter<unknown>();
  @Output() StateChange = new EventEmitter<unknown>();
  @Output() StartRequested = new EventEmitter<unknown>();
  public SummaryLine = '0:26 · Topic Explainer · 16:9';
  public ApplyClientToolArchetype = vi.fn().mockReturnValue({
    Success: true,
    Data: { ArchetypeName: 'KPI Briefing' },
  });
}

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'mj-conversation-chat-area',
  template: `
    @for (slot of slots; track slot.mjChatSlot) {
      @if (slot.mjChatSlot === 'headerActions') {
        <div data-testid="stub-header-actions-slot">
          <ng-container *ngTemplateOutlet="slot.templateRef; context: { $implicit: Conversation }"></ng-container>
        </div>
      }
      @if (slot.mjChatSlot === 'composerExtra') {
        <div data-testid="stub-composer-extra-slot">
          <ng-container
            *ngTemplateOutlet="
              slot.templateRef;
              context: {
                $implicit: Conversation,
                ConversationId: ConversationId,
                IsProcessing: false
              }
            "
          ></ng-container>
        </div>
      }
    }
    @if (SuppressNewConversationEmptyState || ConversationId) {
      <div data-testid="stub-message-input"></div>
    }
  `,
})
class ConversationChatAreaStubComponent {
  @ContentChildren(ChatSlotStubDirective) slots!: QueryList<ChatSlotStubDirective>;
  @Input() Provider: IMetadataProvider | null = null;
  @Input() EnvironmentId = '';
  @Input() CurrentUser: UserInfo | null = null;
  @Input() Conversation: MJConversationEntity | null = null;
  @Input() ConversationId: string | null = null;
  @Input() IsNewConversation = false;
  @Input() SuppressNewConversationEmptyState = false;
  @Input() DefaultAgentId: string | null = null;
  @Input() ShowAgentPicker = true;
  @Input() ShowAgentModePicker = false;
  @Input() ComposerDraft: string | null = null;
  @Input() PendingMessage: string | null = null;
  @Input() PendingArtifactId: string | null = null;
  @Input() PendingArtifactVersionNumber: number | null = null;
  @Input() PendingArtifactConversationId: string | null = null;
  @Input() AppContext: Record<string, unknown> | null = null;
  @Input() ApplicationScope = '';
  @Input() ApplicationId = '';
  @Input() ShowArtifactIndicator = false;
  @Input() AllowAttachments = false;

  @Output() ComposerDraftConsumed = new EventEmitter<void>();
  @Output() ConversationCreated = new EventEmitter<{
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }>();
  @Output() PendingMessageConsumed = new EventEmitter<void>();
  @Output() PendingArtifactConsumed = new EventEmitter<void>();
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();

  public OnEmptyStateMessageSent = vi.fn();
  public OnArtifactClicked = vi.fn().mockResolvedValue(undefined);
  public SelectedVersionNumber?: number;
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
        ProductionBriefStubComponent,
        SetupHealthCardStubComponent,
        LoadingStubComponent,
        ChatSlotStubDirective,
        MJButtonDirective,
      ],
      providers: [provideZonelessChangeDetection()],
    })
      .overrideComponent(VSCopilotPanelComponent, {
        set: {
          imports: [
            CommonModule,
            ConversationChatAreaStubComponent,
            ProductionBriefStubComponent,
            SetupHealthCardStubComponent,
            LoadingStubComponent,
            ChatSlotStubDirective,
            MJButtonDirective,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(VSCopilotPanelComponent);
    component = fixture.componentInstance;
    component.Provider = fakeProvider;
    component.CurrentUser = fakeUser;
  });

  it('on first open renders message input (SuppressNewConversationEmptyState=true) and starts Guided start collapsed with compass icon and subtitle, opens on click, shows setup warning while collapsed, and hides after first message', async () => {
    component.ConversationId = null;
    component.PendingMessage = null;
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
    expect(chatStub.SuppressNewConversationEmptyState).toBe(true);
    expect(chatStub.ShowAgentPicker).toBe(false);
    expect(chatStub.ShowAgentModePicker).toBe(true);
    expect(chatStub.IsNewConversation).toBe(true);
    expect(chatStub.PendingArtifactId).toBe('art-456');
    expect(chatStub.PendingArtifactVersionNumber).toBe(2);
    expect(chatStub.PendingArtifactConversationId).toBeNull();
    expect(chatStub.ApplicationScope).toBe('Application');
    expect(chatStub.ShowArtifactIndicator).toBe(true);
    expect(chatStub.AllowAttachments).toBe(true);
    expect(chatStub.AppContext).toEqual(component.AppContext);

    // No emptyState slot is projected; both the composerExtra brief and the message input are rendered on first open
    expect(chatStub.slots.some((s) => s.mjChatSlot === 'emptyState')).toBe(false);
    expect(chatStub.slots.some((s) => s.mjChatSlot === 'composerExtra')).toBe(true);
    expect(rootEl.querySelector('[data-testid="stub-message-input"]')).not.toBeNull();
    expect(rootEl.querySelector('[data-testid="vs-copilot-brief-drawer"]')).not.toBeNull();
    expect(rootEl.querySelector('[data-testid="stub-production-brief"]')).not.toBeNull();

    // Brief drawer starts collapsed on a new conversation with "Guided start", compass icon, and muted subtitle
    const briefToggle = rootEl.querySelector('[data-testid="vs-copilot-brief-toggle"]') as HTMLButtonElement;
    const briefSubtitle = rootEl.querySelector('[data-testid="vs-copilot-brief-subtitle"]') as HTMLElement;
    const briefBody = rootEl.querySelector('[data-testid="vs-copilot-brief-drawer-body"]') as HTMLElement;
    expect(component.IsBriefCollapsed).toBe(true);
    expect(briefToggle.getAttribute('aria-expanded')).toBe('false');
    expect(briefBody.hidden).toBe(true);
    expect(briefToggle.querySelector('.fa-compass')).not.toBeNull();
    expect(briefToggle.textContent).toContain('Guided start');
    expect(briefSubtitle.textContent?.trim()).toBe(
      'Not sure where to begin? Pick a shape, format and sound step by step.',
    );
    expect(briefToggle.textContent).not.toContain('Add a topic to start');

    // BriefComponent is still mounted and reachable by client tools while collapsed, with AutoCheckSetupHealth=false
    expect(component.BriefComponent).toBeDefined();
    expect(
      (component.BriefComponent as unknown as ProductionBriefStubComponent).AutoCheckSetupHealth,
    ).toBe(false);
    expect(component.BriefComponent?.ApplyClientToolArchetype('KPI Briefing')).toEqual({
      Success: true,
      Data: { ArchetypeName: 'KPI Briefing' },
    });

    // A setup warning or error still shows above the message box even while the guide is closed
    component.OnBriefSetupHealthChange({
      Result: {
        Healthy: true,
        Checks: [
          { Key: 'Render', Status: 'Warning', Title: 'ElevenLabs', Message: 'API key missing' },
        ],
      },
      Loading: false,
    });
    fixture.detectChanges();
    expect(rootEl.querySelector('[data-testid="vs-copilot-collapsed-setup-health"]')).not.toBeNull();

    // Clicking anywhere on the header opens the guide
    briefToggle.click();
    fixture.detectChanges();
    expect(component.IsBriefCollapsed).toBe(false);
    expect(briefToggle.getAttribute('aria-expanded')).toBe('true');
    expect(briefBody.hidden).toBe(false);
    expect(rootEl.querySelector('[data-testid="vs-copilot-collapsed-setup-health"]')).toBeNull();

    // When a typed first message creates the conversation, the brief disappears
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
    expect(rootEl.querySelector('[data-testid="vs-copilot-brief-drawer"]')).toBeNull();

    // Emit consumed events: clears pending message and pending artifact
    chatStub.PendingMessageConsumed.emit();
    chatStub.PendingArtifactConsumed.emit();
    fixture.detectChanges();

    expect(component.PendingMessage).toBeNull();
    expect(component.PendingArtifactId).toBeNull();
    expect(component.PendingArtifactVersionNumber).toBeNull();
  });

  it('OnBriefStartRequested fills ComposerDraft without creating a conversation or sending', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const chatDebugEl = fixture.debugElement.query(By.directive(ConversationChatAreaStubComponent));
    const chatStub = chatDebugEl.componentInstance as ConversationChatAreaStubComponent;

    const briefMessage =
      'Make a KPI Briefing video, about Q4 ARR growth, 12 seconds, formats 16:9, 9:16.';
    component.OnBriefStartRequested({
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

    // Sets ComposerDraft on the chat area and updates AppContext, without sending or creating a conversation
    expect(component.ComposerDraft).toBe(briefMessage);
    expect(chatStub.ComposerDraft).toBe(briefMessage);
    expect(component.PendingMessage).toBeNull();
    expect(component.ConversationId).toBeNull();
    expect(chatStub.OnEmptyStateMessageSent).not.toHaveBeenCalled();

    // Once the chat area consumes the draft, ComposerDraft resets to null
    chatStub.ComposerDraftConsumed.emit();
    fixture.detectChanges();
    expect(component.ComposerDraft).toBeNull();
  });

  it('ConversationId setter flips ChatIsNewConversation both ways and starts every new conversation with the guide collapsed, and OpenIterateArtifact opens artifacts on the active conversation', async () => {
    component.ConversationId = null;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const chatDebugEl = fixture.debugElement.query(By.directive(ConversationChatAreaStubComponent));
    const chatStub = chatDebugEl.componentInstance as ConversationChatAreaStubComponent;
    expect(component.ChatIsNewConversation).toBe(true);
    expect(component.IsBriefCollapsed).toBe(true);
    expect(chatStub.IsNewConversation).toBe(true);

    // User opens the guide, then switches to an existing conversation
    component.IsBriefCollapsed = false;
    component.ConversationId = 'conv-after-render-42';
    fixture.detectChanges();
    expect(component.ChatIsNewConversation).toBe(false);
    expect(chatStub.IsNewConversation).toBe(false);
    expect(chatStub.ConversationId).toBe('conv-after-render-42');

    // Clicking Iterate on a production in the already-open conversation opens the artifact directly via chatArea.OnArtifactClicked
    const opened = component.OpenIterateArtifact('art-same-conv-7', 3);
    expect(opened).toBe(true);
    expect(chatStub.OnArtifactClicked).toHaveBeenCalledWith({ artifactId: 'art-same-conv-7' });
    expect(chatStub.SelectedVersionNumber).toBe(3);

    // Resetting ConversationId to null returns to new conversation mode with the guide collapsed again
    component.ConversationId = null;
    fixture.detectChanges();
    expect(component.ChatIsNewConversation).toBe(true);
    expect(component.IsBriefCollapsed).toBe(true);
    expect(chatStub.IsNewConversation).toBe(true);
    expect(chatStub.ConversationId).toBeNull();
  });

  it('renders "Video Studio isn\'t installed or you can\'t run it" and logs error when agent is missing', async () => {
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
  });

  it('projects Video Studio title, Setup OK icon button, and Close button into mjChatSlot="headerActions" without a duplicate .vs-copilot-panel__header bar', async () => {
    component.ConversationId = null;
    component.ShowCloseButton = true;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rootEl = fixture.nativeElement as HTMLElement;
    expect(rootEl.querySelector('.vs-copilot-panel__header')).toBeNull();

    const headerActionsSlot = rootEl.querySelector('[data-testid="stub-header-actions-slot"]');
    expect(headerActionsSlot).not.toBeNull();
    expect(headerActionsSlot?.textContent).toContain('Video Studio');

    const closeBtn = rootEl.querySelector('[data-testid="vs-copilot-close-button"]') as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute('aria-label')).toBe('Close Video Studio');

    let closeCount = 0;
    component.CloseRequested.subscribe(() => {
      closeCount += 1;
    });
    closeBtn!.click();
    expect(closeCount).toBe(1);

    // Before SetupHealthResult is reported, vs-setup-ok-header-button is absent
    expect(rootEl.querySelector('[data-testid="vs-setup-ok-header-button"]')).toBeNull();

    // When all setup checks are OK on the brief, vs-setup-ok-header-button renders in headerActions
    component.OnBriefSetupHealthChange({
      Result: {
        Healthy: true,
        Checks: [
          { Key: 'Render', Status: 'OK', Title: 'Render Worker', Message: 'Chromium ready' },
        ],
      },
      Loading: false,
    });
    fixture.detectChanges();

    const setupOkBtn = rootEl.querySelector('[data-testid="vs-setup-ok-header-button"]') as HTMLButtonElement | null;
    expect(setupOkBtn).not.toBeNull();
    expect(setupOkBtn?.getAttribute('aria-label')).toBe('Setup OK');
    expect(setupOkBtn?.getAttribute('title')).toBe('Setup OK');
    expect(component.ShowHealthySetupDetails).toBe(false);

    setupOkBtn!.click();
    fixture.detectChanges();
    expect(component.ShowHealthySetupDetails).toBe(true);
    expect(setupOkBtn?.getAttribute('aria-expanded')).toBe('true');

    setupOkBtn!.click();
    fixture.detectChanges();
    expect(component.ShowHealthySetupDetails).toBe(false);
    expect(setupOkBtn?.getAttribute('aria-expanded')).toBe('false');
  });
});


