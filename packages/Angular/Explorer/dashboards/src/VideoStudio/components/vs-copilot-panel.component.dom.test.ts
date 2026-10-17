import { CommonModule } from '@angular/common';
import {
  Component,
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

const { mockConfig, mockLogError, mockAgentsState } = vi.hoisted(() => ({
  mockConfig: vi.fn().mockResolvedValue(undefined),
  mockLogError: vi.fn(),
  mockAgentsState: {
    agents: [] as Array<{ ID: string; Name: string | null }>,
  },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: mockLogError,
  };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
  AIEngineBase: {
    Instance: {
      Config: mockConfig,
      get Agents() {
        return mockAgentsState.agents;
      },
    },
  },
}));

import { VSCopilotPanelComponent } from './vs-copilot-panel.component';

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
}

@Component({
  standalone: true,
  selector: 'mj-loading',
  template: '',
})
class LoadingStubComponent {
  @Input() text = '';
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
      imports: [VSCopilotPanelComponent, ConversationChatAreaStubComponent, LoadingStubComponent],
      providers: [provideZonelessChangeDetection()],
    })
      .overrideComponent(VSCopilotPanelComponent, {
        set: {
          imports: [CommonModule, ConversationChatAreaStubComponent, LoadingStubComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(VSCopilotPanelComponent);
    component = fixture.componentInstance;
    component.Provider = fakeProvider;
    component.CurrentUser = fakeUser;
  });

  it('binds resolved agent ID, ShowAgentPicker=false, ShowAgentModePicker=true, handles conversationCreated and consumed events', async () => {
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
});
