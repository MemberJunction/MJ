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
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { LogError, UserInfo } from '@memberjunction/core';
import {
  MJConversationEntity,
  MJEnvironmentEntityExtended,
  VideoStudioSetupHealthOperation,
  VideoStudioSetupHealthOutput,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { NavigationRequest } from '@memberjunction/ng-artifacts';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PendingAttachment } from '@memberjunction/ng-composer';
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { VideoCaptionMode } from '@memberjunction/video-studio-core';
import {
  ArchetypeCardSnapshot,
  BrandKitCardSnapshot,
  StudioSavedQueryItem,
} from '../video-studio-agent-context';
import {
  VSProductionBriefComponent,
  VSProductionBriefSetupHealthEvent,
  VSProductionBriefStartEvent,
  VSProductionBriefStateSnapshot,
} from './vs-production-brief.component';
import { VSSetupHealthCardComponent } from './vs-setup-health-card.component';

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

interface ChatAreaArtifactHandle {
  initialDraftSnapshots?: Map<string, string | null>;
  ShowImageViewer?: boolean;
  IsProcessing?: boolean;
  SelectedArtifactId?: string | null;
  SelectedVersionNumber?: number;
  ShowArtifactPanel?: boolean;
  ArtifactsByDetailId?: Map<
    string,
    Array<{
      artifactId: string;
      artifactVersionId?: string;
      versionNumber?: number;
    }>
  >;
  OnArtifactClicked?: (data: { artifactId: string; versionId?: string }) => Promise<void>;
}

/**
 * Shared Video Studio slide-in panel wrapping `<mj-conversation-chat-area>` pinned
 * to the `'Video Studio'` orchestrator agent, with `<vs-production-brief>` projected
 * into `mjChatSlot="composerExtra"` before the first message and header controls
 * projected into `mjChatSlot="headerActions"`.
 */
@Component({
  standalone: true,
  selector: 'vs-copilot-panel, mj-vs-copilot-panel',
  imports: [
    CommonModule,
    ConversationsModule,
    SharedGenericModule,
    MJButtonDirective,
    VSProductionBriefComponent,
    VSSetupHealthCardComponent,
  ],
  templateUrl: './vs-copilot-panel.component.html',
  styleUrls: ['./vs-copilot-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VSCopilotPanelComponent
  extends BaseAngularComponent
  implements OnInit, OnChanges
{
  private _conversationId: string | null = null;

  @Input() CurrentUser: UserInfo | null = null;
  @Input() EnvironmentId: string = MJEnvironmentEntityExtended.DefaultEnvironmentID;
  @Input() ApplicationId = '';
  @Input()
  set ConversationId(value: string | null) {
    this._conversationId = value;
    this.syncConversationMode();
  }
  get ConversationId(): string | null {
    return this._conversationId;
  }
  @Input() PendingMessage: string | null = null;
  @Input() PendingArtifactId: string | null = null;
  @Input() PendingArtifactVersionNumber: number | null = null;
  @Input() AppContext: Record<string, unknown> | null = null;
  @Input() HeaderTitle = 'Video Studio';
  @Input() ShowCloseButton = false;
  @Input() SetupHealthResult: VideoStudioSetupHealthOutput | null = null;

  @Input() BriefSelectedArchetype: ArchetypeCardSnapshot | null = null;
  @Input() BriefSelectedBrandKit: BrandKitCardSnapshot | null = null;
  @Input() BriefSelectedBrandKitExplicitNone = false;
  @Input() BriefSelectedFormats: string[] = ['16:9'];
  @Input() BriefDurationSeconds = 30;
  @Input() BriefTopic = '';
  @Input() BriefSelectedQueries: StudioSavedQueryItem[] = [];
  @Input() BriefNarrationEnabled = true;
  @Input() BriefCaptionsMode: VideoCaptionMode = 'Burned';

  @Output() ConversationCreated = new EventEmitter<VSCopilotConversationCreatedEvent>();
  @Output() PendingMessageConsumed = new EventEmitter<void>();
  @Output() PendingArtifactConsumed = new EventEmitter<void>();
  @Output() NavigationRequest = new EventEmitter<NavigationRequest>();
  @Output() CloseRequested = new EventEmitter<void>();
  @Output() BriefStateChange = new EventEmitter<VSProductionBriefStateSnapshot>();
  @Output() BriefStartRequested = new EventEmitter<VSProductionBriefStartEvent>();

  @ViewChild('chatArea')
  private chatArea?: ChatAreaArtifactHandle;

  @ViewChild('briefComponent')
  public BriefComponent?: VSProductionBriefComponent;

  public VideoStudioAgentId: string | null = null;
  public IsResolvingAgent = true;
  public AgentMissing = false;
  public ActiveConversation: MJConversationEntity | null = null;
  public ChatIsNewConversation = true;
  public ComposerDraft: string | null = null;
  public IsBriefCollapsed = true;
  public BriefSummaryLine = '';
  public IsCheckingSetupHealth = false;
  public ShowHealthySetupDetails = false;

  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    this.syncConversationMode();
    if (
      !this.SetupHealthResult &&
      !this.IsCheckingSetupHealth &&
      this.ProviderToUse &&
      'ExecuteGQL' in (this.ProviderToUse as object)
    ) {
      void this.CheckSetupHealth();
    }
    await this.ResolveVideoStudioAgent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['PendingArtifactId'] &&
      this.PendingArtifactId &&
      !changes['ConversationId'] &&
      this.ConversationId
    ) {
      this.OpenIterateArtifact(
        this.PendingArtifactId,
        this.PendingArtifactVersionNumber,
      );
    }
  }

  public get IsImageViewerOpen(): boolean {
    return Boolean(this.chatArea?.ShowImageViewer);
  }

  public get IsCreatingConversation(): boolean {
    return (
      (this.ChatIsNewConversation && Boolean(this.chatArea?.IsProcessing)) ||
      Boolean(this.PendingMessage)
    );
  }

  /**
   * Opens an artifact directly on the active `<mj-conversation-chat-area>` when
   * `Iterate` is clicked for a production whose conversation is already loaded.
   */
  public OpenIterateArtifact(
    artifactId: string,
    versionNumber: number | null = null,
  ): boolean {
    const trimmedId = (artifactId ?? '').trim();
    if (!trimmedId || !this.chatArea) {
      return false;
    }
    let versionId: string | undefined;
    if (versionNumber != null && this.chatArea.ArtifactsByDetailId) {
      for (const list of this.chatArea.ArtifactsByDetailId.values()) {
        for (const info of list) {
          if (
            UUIDsEqual(info.artifactId, trimmedId) &&
            info.versionNumber === versionNumber &&
            info.artifactVersionId
          ) {
            versionId = info.artifactVersionId;
            break;
          }
        }
        if (versionId) {
          break;
        }
      }
    }
    if (typeof this.chatArea.OnArtifactClicked === 'function') {
      void this.chatArea.OnArtifactClicked({
        artifactId: trimmedId,
        ...(versionId ? { versionId } : {}),
      });
      if (versionNumber != null) {
        this.chatArea.SelectedVersionNumber = versionNumber;
      }
      this.OnPendingArtifactConsumed();
      return true;
    }
    return false;
  }

  public get IsBriefVisible(): boolean {
    return this.ChatIsNewConversation && !this.ConversationId && !this.ActiveConversation;
  }

  public ToggleBriefCollapsed(): void {
    this.IsBriefCollapsed = !this.IsBriefCollapsed;
    this.cdr.markForCheck();
  }

  public get IsSetupAllOk(): boolean {
    return Boolean(
      this.SetupHealthResult &&
        this.SetupHealthResult.Healthy &&
        (this.SetupHealthResult.Checks ?? []).every((check) => check.Status === 'OK'),
    );
  }

  public get ShouldShowCollapsedSetupHealth(): boolean {
    if (!this.IsBriefCollapsed || !this.SetupHealthResult) {
      return false;
    }
    if (this.IsSetupAllOk) {
      return this.ShowHealthySetupDetails;
    }
    return true;
  }

  public async CheckSetupHealth(): Promise<void> {
    this.IsCheckingSetupHealth = true;
    this.cdr.markForCheck();
    try {
      const res = await new VideoStudioSetupHealthOperation().Execute(
        {},
        { provider: this.ProviderToUse },
      );
      if (res.Success && res.Output) {
        this.SetupHealthResult = res.Output;
      }
    } catch {
      // Handled by brief when rendered
    } finally {
      this.IsCheckingSetupHealth = false;
      this.cdr.markForCheck();
    }
  }

  public OnBriefSetupHealthChange(event: VSProductionBriefSetupHealthEvent): void {
    this.SetupHealthResult = event.Result;
    this.IsCheckingSetupHealth = event.Loading;
    if (!this.IsSetupAllOk) {
      this.ShowHealthySetupDetails = false;
    }
    this.cdr.markForCheck();
  }

  public OnBriefShowHealthySetupDetailsChange(expanded: boolean): void {
    this.ShowHealthySetupDetails = expanded;
    this.cdr.markForCheck();
  }

  public ToggleHealthySetupDetails(): void {
    this.ShowHealthySetupDetails = !this.ShowHealthySetupDetails;
    this.cdr.markForCheck();
  }

  public OnBriefStateChange(snapshot: VSProductionBriefStateSnapshot): void {
    this.AppContext = { ...(this.AppContext ?? {}), ...snapshot.AppContext };
    const hasTopic = (snapshot.Topic ?? this.BriefComponent?.Topic ?? '').trim().length > 0;
    this.BriefSummaryLine = hasTopic ? (this.BriefComponent?.SummaryLine ?? '') : '';
    this.BriefStateChange.emit(snapshot);
    this.cdr.markForCheck();
  }

  public OnBriefStartRequested(event: VSProductionBriefStartEvent): void {
    this.AppContext = { ...(this.AppContext ?? {}), ...event.AppContext };
    this.chatArea?.initialDraftSnapshots?.delete('new');
    this.ComposerDraft = event.Message;
    this.BriefStartRequested.emit(event);
    this.cdr.markForCheck();
  }

  public OnComposerDraftConsumed(): void {
    this.ComposerDraft = null;
    this.cdr.markForCheck();
  }

  /**
   * Resolves the `'Video Studio'` agent ID via `AIEngineBase.GetProviderInstance`.
   * Logs an error and enters the inline missing-agent state if the agent cannot be found.
   */
  public async ResolveVideoStudioAgent(): Promise<void> {
    this.IsResolvingAgent = true;
    this.AgentMissing = false;
    this.cdr.markForCheck();

    try {
      const user = this.CurrentUser ?? this.ProviderToUse?.CurrentUser ?? undefined;
      const aiEngine = AIEngineBase.GetProviderInstance<AIEngineBase>(
        this.ProviderToUse,
        AIEngineBase,
      ) as AIEngineBase;
      await aiEngine.Config(false, user, this.ProviderToUse);
      const match =
        aiEngine.Agents?.find(
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
      if (!this.ChatIsNewConversation) {
        this.IsBriefCollapsed = true;
      }
      this.ChatIsNewConversation = true;
      this.ActiveConversation = null;
    }
    this.cdr.markForCheck();
  }
}
