import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { LogError, UserInfo } from '@memberjunction/core';
import {
  MJConversationEntity,
  MJEnvironmentEntityExtended,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PendingAttachment } from '@memberjunction/ng-composer';
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

/** Canonical AI agent name for the Video Studio orchestrator. */
export const VIDEO_STUDIO_AGENT_NAME = 'Video Studio';

/** User-facing message rendered when the Video Studio agent is missing or inaccessible. */
export const VIDEO_STUDIO_AGENT_MISSING_MESSAGE =
  "Video Studio isn't installed or you can't run it";

export interface VSCopilotConversationCreatedEvent {
  conversation: MJConversationEntity;
  pendingMessage?: string;
  pendingAttachments?: PendingAttachment[];
}

/**
 * Shared Video Studio copilot panel wrapping `<mj-conversation-chat-area>` pinned
 * to the `'Video Studio'` orchestrator agent.
 *
 * Used by:
 * - `VideoStudioStudioResourceComponent` (always-present right pane in Studio)
 * - `VideoStudioProductionsResourceComponent` (docked Iterate pane for an existing production)
 */
@Component({
  standalone: true,
  selector: 'vs-copilot-panel, mj-vs-copilot-panel',
  imports: [CommonModule, ConversationsModule, SharedGenericModule],
  templateUrl: './vs-copilot-panel.component.html',
  styleUrls: ['./vs-copilot-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VSCopilotPanelComponent
  extends BaseAngularComponent
  implements OnInit, OnChanges
{
  @Input() CurrentUser: UserInfo | null = null;
  @Input() EnvironmentId: string = MJEnvironmentEntityExtended.DefaultEnvironmentID;
  @Input() ApplicationId = '';
  @Input() ConversationId: string | null = null;
  @Input() PendingMessage: string | null = null;
  @Input() PendingArtifactId: string | null = null;
  @Input() PendingArtifactVersionNumber: number | null = null;
  @Input() AppContext: Record<string, unknown> | null = null;
  @Input() HeaderTitle = 'Video Studio Copilot';
  @Input() ShowCloseButton = false;

  @Output() ConversationCreated = new EventEmitter<VSCopilotConversationCreatedEvent>();
  @Output() PendingMessageConsumed = new EventEmitter<void>();
  @Output() PendingArtifactConsumed = new EventEmitter<void>();
  @Output() NavigationRequest = new EventEmitter<NavigationRequest>();
  @Output() CloseRequested = new EventEmitter<void>();

  public VideoStudioAgentId: string | null = null;
  public IsResolvingAgent = true;
  public AgentMissing = false;
  public ActiveConversation: MJConversationEntity | null = null;
  public ChatIsNewConversation = true;

  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    this.syncConversationMode();
    await this.ResolveVideoStudioAgent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ConversationId']) {
      this.syncConversationMode();
    }
  }

  /**
   * Resolves the `'Video Studio'` agent ID via `AIEngineBase.Instance.Agents`.
   * Logs an error and enters the inline missing-agent state if the agent cannot be found.
   */
  public async ResolveVideoStudioAgent(): Promise<void> {
    this.IsResolvingAgent = true;
    this.AgentMissing = false;
    this.cdr.markForCheck();

    try {
      const user = this.CurrentUser ?? this.ProviderToUse?.CurrentUser ?? undefined;
      await AIEngineBase.Instance.Config(false, user, this.ProviderToUse);
      const match =
        AIEngineBase.Instance.Agents?.find(
          (a) => a.Name?.trim().toLowerCase() === VIDEO_STUDIO_AGENT_NAME.toLowerCase(),
        ) ?? null;

      if (match?.ID) {
        this.VideoStudioAgentId = match.ID;
        this.AgentMissing = false;
      } else {
        this.VideoStudioAgentId = null;
        this.AgentMissing = true;
        LogError(
          `VSCopilotPanelComponent: '${VIDEO_STUDIO_AGENT_NAME}' agent not found — ${VIDEO_STUDIO_AGENT_MISSING_MESSAGE}`,
        );
      }
    } catch (err: unknown) {
      this.VideoStudioAgentId = null;
      this.AgentMissing = true;
      const detail = err instanceof Error ? err.message : String(err);
      LogError(
        `VSCopilotPanelComponent.ResolveVideoStudioAgent: ${VIDEO_STUDIO_AGENT_MISSING_MESSAGE} (${detail})`,
      );
    } finally {
      this.IsResolvingAgent = false;
      this.cdr.markForCheck();
    }
  }

  public get EffectiveCurrentUser(): UserInfo | null {
    return this.CurrentUser ?? this.ProviderToUse?.CurrentUser ?? null;
  }

  public get MissingAgentMessage(): string {
    return VIDEO_STUDIO_AGENT_MISSING_MESSAGE;
  }

  public OnChatConversationCreated(event: VSCopilotConversationCreatedEvent): void {
    this.ActiveConversation = event.conversation;
    this.ConversationId = event.conversation.ID;
    this.ChatIsNewConversation = false;
    if (event.pendingMessage !== undefined) {
      this.PendingMessage = event.pendingMessage ?? null;
    }
    this.ConversationCreated.emit(event);
    this.cdr.markForCheck();
  }

  public OnPendingMessageConsumed(): void {
    this.PendingMessage = null;
    this.PendingMessageConsumed.emit();
    this.cdr.markForCheck();
  }

  public OnPendingArtifactConsumed(): void {
    this.PendingArtifactId = null;
    this.PendingArtifactVersionNumber = null;
    this.PendingArtifactConsumed.emit();
    this.cdr.markForCheck();
  }

  public OnNavigationRequest(event: NavigationRequest): void {
    this.NavigationRequest.emit(event);
  }

  public OnCloseClick(): void {
    this.CloseRequested.emit();
  }

  private syncConversationMode(): void {
    const trimmed = this.ConversationId?.trim() ?? '';
    if (trimmed.length > 0) {
      this.ChatIsNewConversation = false;
      if (this.ActiveConversation && !UUIDsEqual(this.ActiveConversation.ID, trimmed)) {
        this.ActiveConversation = null;
      }
    } else {
      this.ChatIsNewConversation = true;
      this.ActiveConversation = null;
    }
  }
}
