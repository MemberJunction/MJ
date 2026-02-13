import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, ElementRef, AfterViewChecked } from '@angular/core';
import { UserInfo, RunView, RunQuery, Metadata, CompositeKey, LogStatusEx } from '@memberjunction/core';
import { MJConversationEntity, MJConversationDetailEntity, MJAIAgentRunEntity, MJArtifactEntity, MJTaskEntity } from '@memberjunction/core-entities';
import { AIAgentEntityExtended, AIAgentRunEntityExtended } from "@memberjunction/ai-core-plus";
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ConversationDataService } from '../../services/conversation-data.service';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { ArtifactPermissionService } from '../../services/artifact-permission.service';
import { ConversationAttachmentService } from '../../services/conversation-attachment.service';
import { MessageAttachment } from '../message/message-item.component';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { ConversationDetailComplete, parseConversationDetailComplete, AgentRunJSON, RatingJSON } from '../../models/conversation-complete-query.model';
import { MessageInputComponent } from '../message/message-input.component';
import { PendingAttachment } from '../mention/mention-editor.component';
import { ArtifactViewerPanelComponent } from '@memberjunction/ng-artifacts';
import { TestFeedbackDialogComponent, TestFeedbackDialogData } from '@memberjunction/ng-testing';
import { DialogService } from '@progress/kendo-angular-dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ConversationStreamingService } from '../../services/conversation-streaming.service';

@Component({
  standalone: false,
  selector: 'mj-conversation-chat-area',
  templateUrl: `./conversation-chat-area.component.html`,
  styleUrls: ['./conversation-chat-area.component.css']
})
export class ConversationChatAreaComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  // LOCAL STATE INPUTS - passed from parent workspace
  private _conversationId: string | null = null;
  @Input()
  set conversationId(value: string | null) {
    if (value !== this._conversationId) {
      this._conversationId = value;
      // Trigger change handler after initialization is complete
      // Only skip during Angular's initial binding before ngOnInit completes
      if (this.isInitialized) {
        this.onConversationChanged(value);
      }
    }
  }
  get conversationId(): string | null {
    return this._conversationId;
  }

  @Input() conversation: MJConversationEntity | null = null;
  @Input() threadId: string | null = null;
  @Input() isNewConversation: boolean = false;

  // Using getter/setter to ensure correct type handling
  private _pendingMessage: string | null = null;
  @Input()
  set pendingMessage(value: string | null) {
    // Handle case where an object is incorrectly passed
    if (value && typeof value === 'object' && 'text' in value) {
      this._pendingMessage = (value as { text: string }).text;
    } else {
      this._pendingMessage = value;
    }
  }
  get pendingMessage(): string | null {
    return this._pendingMessage;
  }

  // Using getter/setter to ensure reactivity
  private _pendingAttachments: PendingAttachment[] | null = null;
  @Input()
  set pendingAttachments(value: PendingAttachment[] | null) {
    this._pendingAttachments = value;
  }
  get pendingAttachments(): PendingAttachment[] | null {
    return this._pendingAttachments;
  }

  @Input() pendingArtifactId: string | null = null;
  @Input() pendingArtifactVersionNumber: number | null = null;

  // Sidebar toggle - when true, shows toggle button in header to expand sidebar
  @Input() showSidebarToggle: boolean = false;

  @Output() conversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() taskClicked = new EventEmitter<MJTaskEntity>();
  @Output() artifactLinkClicked = new EventEmitter<{type: 'conversation' | 'collection'; id: string}>();
  @Output() sidebarToggleClicked = new EventEmitter<void>();

  // STATE CHANGE OUTPUTS - notify parent of state changes
  // conversationCreated now includes pendingMessage and pendingAttachments to ensure atomic state update
  @Output() conversationCreated = new EventEmitter<{
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }>();
  @Output() threadOpened = new EventEmitter<string>();
  @Output() threadClosed = new EventEmitter<void>();
  @Output() pendingArtifactConsumed = new EventEmitter<void>();
  @Output() pendingMessageConsumed = new EventEmitter<void>();
  // pendingMessageRequested is deprecated - use conversationCreated with pendingMessage instead
  @Output() pendingMessageRequested = new EventEmitter<{text: string; attachments: PendingAttachment[]}>();

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChildren('messageInput') private messageInputComponents!: QueryList<MessageInputComponent>;
  @ViewChild(ArtifactViewerPanelComponent) private artifactViewerComponent?: ArtifactViewerPanelComponent;

  public messages: MJConversationDetailEntity[] = [];
  public showScrollToBottomIcon = false;
  private scrollToBottom = false;
  private lastLoadedConversationId: string | null = null; // Track which conversation's peripheral data was loaded
  private currentlyLoadingConversationId: string | null = null; // Track which conversation is currently being loaded
  public isProcessing: boolean = false;
  private intentCheckMessage: MJConversationDetailEntity | null = null; // Temporary message shown during intent checking
  public isLoadingConversation: boolean = true; // True while loading initial conversation messages

  // Store raw query results and derived data
  private rawConversationData: ConversationDetailComplete[] = [];
  public userAvatarMap: Map<string, {imageUrl: string | null; iconClass: string | null}> = new Map();
  public memberCount: number = 1;
  public artifactCount: number = 0;
  public isShared: boolean = false;
  public showExportModal: boolean = false;
  public showAgentPanel: boolean = false;
  public showMembersModal: boolean = false;
  public showProjectSelector: boolean = false;
  public showArtifactPanel: boolean = false;
  public showArtifactsModal: boolean = false;
  public showSystemArtifacts: boolean = false; // Toggle for showing system-only artifacts
  public selectedArtifactId: string | null = null;
  public selectedVersionNumber: number | undefined = undefined; // Version to show in artifact viewer
  public artifactPaneWidth: number = 40; // Default 40% width
  public isArtifactPaneMaximized: boolean = false; // Track maximize state
  private artifactPaneWidthBeforeMaximize: number = 40; // Store width before maximizing
  public expandedArtifactId: string | null = null; // Track which artifact card is expanded in modal
  public showCollectionPicker: boolean = false;
  public collectionPickerArtifactId: string | null = null;
  public collectionPickerExcludedIds: string[] = [];

  // Artifact permissions
  public canShareSelectedArtifact: boolean = false;
  public canEditSelectedArtifact: boolean = false;

  // Share modal state
  public isArtifactShareModalOpen: boolean = false;
  public artifactToShare: MJArtifactEntity | null = null;

  // Conversation data cache: ConversationID -> Array of ConversationDetailComplete
  // Stores raw query results so we don't need to re-query when switching conversations
  private conversationDataCache = new Map<string, ConversationDetailComplete[]>();

  // Artifact mapping: ConversationDetailID -> Array of LazyArtifactInfo
  // Uses lazy-loading pattern: display data loaded immediately, full entities on-demand
  // Supports multiple artifacts per conversation detail (0-N relationship)
  public artifactsByDetailId = new Map<string, LazyArtifactInfo[]>();

  // System artifacts mapping: ConversationDetailID -> Array of LazyArtifactInfo (Visibility='System Only')
  // Kept separate so we can toggle their display without reloading
  // Made public so it can be passed to MessageInputComponent for payload loading
  public systemArtifactsByDetailId = new Map<string, LazyArtifactInfo[]>();

  // Cached combined artifacts map - updated when toggle changes
  private _combinedArtifactsMap: Map<string, LazyArtifactInfo[]> | null = null;

  // Agent run mapping: ConversationDetailID -> AIAgentRunEntityExtended
  // Loaded once per conversation and kept in sync as new runs are created
  public agentRunsByDetailId = new Map<string, AIAgentRunEntityExtended>();

  /**
   * Ratings by conversation detail ID (parsed from RatingsJSON)
   */
  public ratingsByDetailId = new Map<string, RatingJSON[]>();

  /**
   * Attachments by conversation detail ID (loaded from ConversationDetailAttachments)
   */
  public attachmentsByDetailId = new Map<string, MessageAttachment[]>();

  /**
   * In-progress message IDs for streaming reconnection
   * Passed to message-input component to reconnect PubSub updates
   */
  public inProgressMessageIds: string[] = [];

  // Subject for cleanup on destroy
  private destroy$ = new Subject<void>();

  // Cache of message-input metadata for rendering multiple instances
  // Prevents destruction/recreation when switching conversations for performance
  private messageInputMetadataCache = new Map<string, {conversationId: string; conversationName: string | null}>();

  // Empty collections for hidden message-input components
  public readonly emptyArtifactsMap = new Map<string, LazyArtifactInfo[]>();
  public readonly emptyAgentRunsMap = new Map<string, AIAgentRunEntityExtended>();
  public readonly emptyInProgressIds: string[] = [];

  // Loading state for peripheral data
  public isLoadingPeripheralData: boolean = false;

  // Subject to trigger artifact viewer refresh when new version is created
  public artifactViewerRefresh$ = new Subject<{artifactId: string; versionNumber: number}>();

  // Track initialization state to prevent loading messages before agents are ready
  private isInitialized: boolean = false;

  // Resize state
  private isResizing: boolean = false;
  private startX: number = 0;
  private startWidth: number = 0;

  // LocalStorage key
  private readonly ARTIFACT_PANE_WIDTH_KEY = 'mj-conversations-artifact-pane-width';

  // Image viewer state
  public showImageViewer: boolean = false;
  public selectedImageUrl: string = '';
  public selectedImageAlt: string = '';
  public selectedImageFileName: string = '';

  // Upload indicator state (shown centered in conversation area)
  public isUploadingAttachments: boolean = false;
  public uploadingMessage: string = '';

  // Attachment support based on agent modalities
  // Computed from conversation manager (Sage) and any previous agent in conversation
  public enableAttachments: boolean = false;
  public maxAttachments: number = 10;
  public maxAttachmentSizeBytes: number = 20 * 1024 * 1024; // 20MB default
  public acceptedFileTypes: string = 'image/*';
  private conversationManagerAgent: AIAgentEntityExtended | null = null;

  constructor(
    public conversationData: ConversationDataService,
    private agentStateService: AgentStateService,
    private conversationAgentService: ConversationAgentService,
    private activeTasks: ActiveTasksService,
    private cdr: ChangeDetectorRef,
    private mentionAutocompleteService: MentionAutocompleteService,
    private artifactPermissionService: ArtifactPermissionService,
    private dialogService: DialogService,
    private attachmentService: ConversationAttachmentService,
    private streamingService: ConversationStreamingService
  ) {}

  async ngOnInit() {
    // The workspace component initializes AI Engine and mention service before
    // any child components render, so we can safely skip duplicate initialization.
    // This prevents race conditions and ensures agents are fully loaded.

    // Fallback: If workspace didn't initialize (shouldn't happen), initialize now
    if (!this.mentionAutocompleteService['isInitialized']) {
      console.warn('⚠️ Mention autocomplete not initialized by workspace, initializing now...');
      await this.mentionAutocompleteService.initialize(this.currentUser);
    }

    // Initialize attachment support based on agent modalities
    await this.initializeAttachmentSupport();

    // Load saved artifact pane width
    this.loadArtifactPaneWidth();

    // Mark as initialized so setter can trigger conversation changes
    this.isInitialized = true;

    // Initial load if there's already an active conversation
    if (this.conversationId) {
      await this.onConversationChanged(this.conversationId);
    }

    // Setup resize listeners
    window.addEventListener('mousemove', this.onResizeMove.bind(this));
    window.addEventListener('mouseup', this.onResizeEnd.bind(this));
    window.addEventListener('touchmove', this.onResizeTouchMove.bind(this));
    window.addEventListener('touchend', this.onResizeTouchEnd.bind(this));

    // Subscribe to completion events from PubSub
    this.streamingService.completionEvents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (event) => {
        // Find the message in our current conversation
        const message = this.messages.find(m => m.ID === event.conversationDetailId);
        if (message) {
          await this.handleMessageCompletion(message, event.agentRunId);
        }
      });
  }

  /**
   * Initializes attachment support by checking if the conversation manager agent (Sage)
   * or any recent agent in the conversation supports non-text input modalities.
   */
  private async initializeAttachmentSupport(): Promise<void> {
    try {
      // Ensure AIEngineBase is configured with modality data
      await AIEngineBase.Instance.Config(false);

      // Get the conversation manager agent (Sage)
      this.conversationManagerAgent = await this.conversationAgentService.getConversationManagerAgent();

      if (this.conversationManagerAgent?.ID) {
        // Get attachment limits from agent metadata (uses Agent → Model → System → Default cascade)
        const limits = AIEngineBase.Instance.GetAgentAttachmentLimits(this.conversationManagerAgent.ID);
        this.enableAttachments = limits.enabled;
        this.maxAttachments = limits.maxAttachments;
        this.maxAttachmentSizeBytes = limits.maxAttachmentSizeBytes;
        this.acceptedFileTypes = limits.acceptedFileTypes;
        LogStatusEx({message: `Attachment support initialized: ${this.enableAttachments} (max ${this.maxAttachments}, ${(this.maxAttachmentSizeBytes / 1024 / 1024).toFixed(0)}MB)`, verboseOnly: true});
      } else {
        // Default to false if we can't determine
        this.enableAttachments = false;
        LogStatusEx({message: 'Attachment support disabled: conversation manager agent not available', verboseOnly: true});
      }
    } catch (error) {
      console.warn('Failed to initialize attachment support:', error);
      this.enableAttachments = false;
    }
  }

  /**
   * Updates attachment support based on the current conversation context.
   * Called when conversation changes to check if any agent in the conversation supports attachments.
   */
  private updateAttachmentSupport(): void {
    // Determine which agent to use for limits - prefer last non-Sage agent, fall back to Sage
    let agentIdForLimits = this.conversationManagerAgent?.ID || null;

    // Check if any previous non-Sage agent in the conversation supports attachments
    if (this.messages.length > 0) {
      const lastNonSageAgent = this.messages
        .slice()
        .reverse()
        .find(msg =>
          msg.Role === 'AI' &&
          msg.AgentID &&
          msg.AgentID !== this.conversationManagerAgent?.ID
        );

      if (lastNonSageAgent?.AgentID) {
        // Check if this agent supports attachments
        if (AIEngineBase.Instance.AgentSupportsAttachments(lastNonSageAgent.AgentID)) {
          agentIdForLimits = lastNonSageAgent.AgentID;
        }
      }
    }

    // Get limits from the determined agent
    if (agentIdForLimits) {
      const limits = AIEngineBase.Instance.GetAgentAttachmentLimits(agentIdForLimits);
      this.enableAttachments = limits.enabled;
      this.maxAttachments = limits.maxAttachments;
      this.maxAttachmentSizeBytes = limits.maxAttachmentSizeBytes;
      this.acceptedFileTypes = limits.acceptedFileTypes;
    } else {
      this.enableAttachments = false;
    }
  }

  ngAfterViewChecked() {
    if (this.scrollToBottom) {
      this.scrollToBottom = false;
      setTimeout(() => {
        this.scrollToBottomNow();
        // Check scroll state after scrolling to bottom
        this.checkScroll();
      }, 100);
    } else {
      // Always check scroll state to update button visibility
      this.checkScroll();
    }
  }

  ngOnDestroy() {
    // Stop polling when component is destroyed
    this.agentStateService.stopPolling();

    // Complete destroy subject to cleanup subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Remove resize listeners
    window.removeEventListener('mousemove', this.onResizeMove.bind(this));
    window.removeEventListener('mouseup', this.onResizeEnd.bind(this));
    window.removeEventListener('touchmove', this.onResizeTouchMove.bind(this));
    window.removeEventListener('touchend', this.onResizeTouchEnd.bind(this));
  }

  private async onConversationChanged(conversationId: string | null): Promise<void> {
    // Prevent double-loading if we're already loading this same conversation
    // (ngDoCheck can fire multiple times during state changes)
    if (this.currentlyLoadingConversationId === conversationId && conversationId !== null) {
      return;
    }

    // Do NOT clear activeTasks - they are workspace-level and persist across conversations
    // Clearing causes bugs: global tasks panel blanks out, no notifications when switching

    this.showArtifactPanel = false;
    this.selectedArtifactId = null;

    if (conversationId) {
      this.currentlyLoadingConversationId = conversationId;

      if (!this.messageInputMetadataCache.has(conversationId)) {
        this.messageInputMetadataCache.set(conversationId, {
          conversationId: conversationId,
          conversationName: this.conversation?.Name || null
        });
      }

      this.isLoadingConversation = true;
      this.messages = [];
      this.cdr.detectChanges();

      try {
        await this.loadMessages(conversationId);
        await this.restoreActiveTasks(conversationId);
        // TODO: Replace polling with PubSub - see plans/repair-conversations-ui-performance.md
        this.agentStateService.startPolling(this.currentUser, conversationId);
      } catch (error) {
        console.error('Error loading conversation:', error);
        this.messages = [];
      } finally {
        this.currentlyLoadingConversationId = null;
        this.isLoadingConversation = false;

        // Create new array reference to trigger Angular change detection
        this.messages = [...this.messages];
        this.cdr.detectChanges();

        // Defensive fallback: force another change detection cycle after async ops complete
        setTimeout(() => {
          if (conversationId === this._conversationId && this.messages.length > 0) {
            this.messages = [...this.messages];
            this.cdr.detectChanges();
          }
        }, 50);
      }
    } else {
      // No active conversation - show empty state
      this.messages = [];
      this.isLoadingConversation = false;
      this.currentlyLoadingConversationId = null;
      this.agentStateService.stopPolling();
    }
  }

  /**
   * Returns array of cached message-input metadata for rendering
   * This allows multiple message-input components to exist simultaneously (hidden)
   * preserving their state when switching conversations
   */
  public getCachedInputs(): Array<{conversationId: string; conversationName: string | null}> {
    return Array.from(this.messageInputMetadataCache.values());
  }

  /**
   * Get the message input component for the current conversation.
   * Since we cache multiple message-input instances (one per visited conversation),
   * we need to find the one that matches the current conversationId.
   */
  private getActiveMessageInputComponent(): MessageInputComponent | undefined {
    if (!this.messageInputComponents || !this.conversationId) {
      return undefined;
    }
    return this.messageInputComponents.find(
      component => component.conversationId === this.conversationId
    );
  }

  private async loadMessages(conversationId: string): Promise<void> {
    try {
      const cachedData = this.conversationDataCache.get(conversationId);

      if (cachedData) {
        await this.buildMessagesFromCache(cachedData);
        await this.loadPeripheralData(conversationId);
      } else {
        const rq = new RunQuery();
        const result = await rq.RunQuery({
          QueryName: 'GetConversationComplete',
          CategoryPath: 'MJ/Conversations',
          Parameters: { ConversationID: conversationId }
        }, this.currentUser);

        if (!result.Success || !result.Results) {
          console.error('Failed to load conversation data:', result.ErrorMessage);
          this.messages = [];
          return;
        }

        const conversationData = result.Results as ConversationDetailComplete[];
        this.conversationDataCache.set(conversationId, conversationData);

        await this.buildMessagesFromCache(conversationData);

        this.isLoadingPeripheralData = true;
        await this.loadPeripheralData(conversationId);
        this.isLoadingPeripheralData = false;
        this.cdr.detectChanges();
      }

      await this.detectAndReconnectToInProgressRuns(conversationId);
      await this.handlePendingArtifactNavigation();

    } catch (error) {
      console.error('Error loading messages:', error);
      this.messages = [];
    }
  }

  /**
   * Build message entities from cached conversation data
   * Creates MJConversationDetailEntity objects from the raw query results
   */
  private async buildMessagesFromCache(conversationData: ConversationDetailComplete[]): Promise<void> {
    const md = new Metadata();
    const messages: MJConversationDetailEntity[] = [];

    this.rawConversationData = conversationData;
    this.buildUserAvatarMap(conversationData);

    for (const row of conversationData) {
      if (!row.ID) continue;

      const message = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.currentUser);
      message.LoadFromData(row);
      messages.push(message);
    }

    this.messages = messages;

    // Update attachment support based on agents in this conversation
    this.updateAttachmentSupport();

    // Detect in-progress messages for streaming reconnection
    // Always create NEW array reference to trigger Input setter in message-input component
    this.inProgressMessageIds = [...messages
      .filter(m => m.Status === 'In-Progress')
      .map(m => m.ID)];

    if (this.inProgressMessageIds.length > 0) {
      LogStatusEx({message: `🔌 Detected ${this.inProgressMessageIds.length} in-progress messages for reconnection`, verboseOnly: true});
    }

    // Check for missed completions (user navigated away, agent completed, user returned)
    // The streaming service stores recent completions so we can handle them
    for (const message of messages) {
      if (message.Status === 'In-Progress' && message.ID) {
        const recentCompletion = this.streamingService.getRecentCompletion(message.ID);
        if (recentCompletion) {
          // This message completed while we were away - handle it
          LogStatusEx({message: `📥 Found missed completion for message ${message.ID}, handling...`, verboseOnly: true});
          this.handleMessageCompletion(message, recentCompletion.agentRunId);
          this.streamingService.clearRecentCompletion(message.ID);
        }
      }
    }

    this.scrollToBottom = true;
    LogStatusEx({message: `✅ Built ${messages.length} messages from cache`, verboseOnly: true});
  }

  /**
   * Builds a map of UserID -> Avatar data for fast lookups
   * Extracts unique users from conversation data and their avatar settings
   */
  private buildUserAvatarMap(conversationData: ConversationDetailComplete[]): void {
    this.userAvatarMap.clear();

    // Get unique users and their avatar data
    const userMap = new Map<string, {imageUrl: string | null; iconClass: string | null}>();

    for (const row of conversationData) {
      // Only process user messages that have a UserID
      if (row.Role?.toLowerCase() === 'user' && row.UserID) {
        // Only add if we haven't seen this user yet
        if (!userMap.has(row.UserID)) {
          userMap.set(row.UserID, {
            imageUrl: row.UserImageURL || null,
            iconClass: row.UserImageIconClass || null
          });
        }
      }
    }

    this.userAvatarMap = userMap;
    LogStatusEx({message: `👤 Built user avatar map with ${this.userAvatarMap.size} unique users`, verboseOnly: true});
  }

  /**
   * Process peripheral data (agent runs and artifacts) from cached conversation data
   * Parses JSON columns and builds maps for display
   *
   * PERFORMANCE OPTIMIZATION: Uses cached data instead of querying
   * - Data already loaded by loadMessages() - no additional queries needed
   * - Processes cached JSON data to build display maps
   * - Instant when switching between conversations
   */
  private async loadPeripheralData(conversationId: string): Promise<void> {
    const timestamp = new Date().toISOString();

    // Skip if we've already processed peripheral data for this conversation
    if (this.lastLoadedConversationId === conversationId) {
      LogStatusEx({message: `[${timestamp}] ⏭️ Skipping peripheral data processing - already processed for conversation ${conversationId}`, verboseOnly: true});
      return;
    }

    // Mark this conversation as processed to prevent duplicate processing
    this.lastLoadedConversationId = conversationId;
    LogStatusEx({message: `[${timestamp}] 📊 Processing peripheral data for conversation ${conversationId} from cache`, verboseOnly: true});

    try {
      // Get cached data - should always be present by the time we get here
      const conversationData = this.conversationDataCache.get(conversationId);
      if (!conversationData) {
        console.warn(`No cached data found for conversation ${conversationId}`);
        return;
      }

      const md = new Metadata();

      // Clear and rebuild maps from cached data
      this.agentRunsByDetailId.clear();
      this.artifactsByDetailId.clear();

      for (const row of conversationData) {
        // Skip rows without ID (should never happen, but type safety check)
        if (!row.ID) {
          console.warn('Skipping conversation detail row without ID');
          continue;
        }

        const parsed = parseConversationDetailComplete(row);

        // Build agent runs map
        if (parsed.agentRuns.length > 0) {
          // Convert AgentRunJSON to AIAgentRunEntityExtended
          const agentRunData = parsed.agentRuns[0]; // Should only be one per detail
          const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', this.currentUser);

          // Convert ISO date strings to Date objects
          agentRun.LoadFromData({
            ID: agentRunData.ID,
            AgentID: agentRunData.AgentID,
            Agent: agentRunData.Agent,
            Status: agentRunData.Status,
            __mj_CreatedAt: agentRunData.__mj_CreatedAt,
            __mj_UpdatedAt: agentRunData.__mj_UpdatedAt,
            TotalPromptTokensUsed: agentRunData.TotalPromptTokensUsed,
            TotalCompletionTokensUsed: agentRunData.TotalCompletionTokensUsed,
            TotalCost: agentRunData.TotalCost,
            ConversationDetailID: agentRunData.ConversationDetailID
          });

          this.agentRunsByDetailId.set(row.ID, agentRun);
        }

        // Build artifacts map - no need to load full entities, just create LazyArtifactInfo
        if (parsed.artifacts.length > 0) {
          const artifactList: LazyArtifactInfo[] = [];
          const systemArtifactList: LazyArtifactInfo[] = [];

          for (const artifactData of parsed.artifacts) {
            // Create LazyArtifactInfo with display data from query
            // Full entities will be loaded on-demand when artifact is clicked
            const lazyInfo = new LazyArtifactInfo(artifactData, this.currentUser);

            // Separate system-only artifacts from user-visible artifacts
            if (artifactData.Visibility === 'System Only') {
              systemArtifactList.push(lazyInfo);
            } else {
              artifactList.push(lazyInfo);
            }
          }

          // Add to appropriate maps
          if (artifactList.length > 0) {
            this.artifactsByDetailId.set(row.ID, artifactList);
          }
          if (systemArtifactList.length > 0) {
            this.systemArtifactsByDetailId.set(row.ID, systemArtifactList);
          }
        }

        // Build ratings map
        if (parsed.ratings.length > 0) {
          this.ratingsByDetailId.set(row.ID, parsed.ratings);
        }
      }

      // Load attachments for all messages in this conversation
      // Uses the ConversationAttachmentService to batch-load all attachments
      this.attachmentsByDetailId.clear();
      const messageIds = conversationData.map(row => row.ID).filter((id): id is string => !!id);
      if (messageIds.length > 0) {
        const attachmentsMap = await this.attachmentService.loadAttachmentsForMessages(messageIds, this.currentUser);
        for (const [detailId, attachments] of attachmentsMap) {
          this.attachmentsByDetailId.set(detailId, attachments);
        }
      }

      // Create new Map references to trigger Angular change detection
      this.agentRunsByDetailId = new Map(this.agentRunsByDetailId);
      this.artifactsByDetailId = new Map(this.artifactsByDetailId);
      this.ratingsByDetailId = new Map(this.ratingsByDetailId);
      this.systemArtifactsByDetailId = new Map(this.systemArtifactsByDetailId);
      this.attachmentsByDetailId = new Map(this.attachmentsByDetailId);

      // Clear combined cache since we loaded new artifacts
      this._combinedArtifactsMap = null;

      // Update artifact count for header display (unique artifacts, not versions)
      this.artifactCount = this.calculateUniqueArtifactCount();

      // Debug: Log summary
      const systemArtifactCount = this.systemArtifactsByDetailId.size;
      const attachmentCount = this.attachmentsByDetailId.size;
      LogStatusEx({message: `📊 Processed ${this.agentRunsByDetailId.size} agent runs, ${this.artifactsByDetailId.size} user artifact mappings, ${systemArtifactCount} system artifact mappings (${this.artifactCount} unique user artifacts), ${attachmentCount} messages with attachments`, verboseOnly: true});

      // CRITICAL: Trigger message re-render now that agent runs and artifacts are loaded
      // This updates all message components with the newly loaded agent run data
      this.messages = [...this.messages]; // Create new array reference to trigger change detection
      this.cdr.detectChanges();

      LogStatusEx({message: `✅ Peripheral data processed successfully for conversation ${conversationId} from cache`, verboseOnly: true});
    } catch (error) {
      console.error('Failed to process peripheral data:', error);
      // Don't set lastLoadedConversationId on error so we can retry
      this.lastLoadedConversationId = null;
    }
  }

  /**
   * REMOVED: Active tasks should only track currently-running tasks in this browser session.
   * Database tasks with 'In-Progress' status are shown in the Tasks dropdown via loadDatabaseTasks().
   * Restoring them here causes duplicate "Agent Processing..." entries.
   */
  private async restoreActiveTasks(conversationId: string): Promise<void> {
    // Intentionally empty - ActiveTasksService only tracks in-memory running tasks
    // Database tasks are loaded separately by TasksDropdownComponent
  }

  async onMessageSent(message: MJConversationDetailEntity): Promise<void> {
    // Clear pending message if it was sent - notify parent via output
    if (this.pendingMessage) {
      this.pendingMessageConsumed.emit();
    }

    // Check if message already exists in the array (by ID) to prevent duplicates
    // Messages can be emitted multiple times as they're updated (e.g., status changes)
    const existingIndex = this.messages.findIndex(m => m.ID === message.ID);

    if (existingIndex >= 0) {
      // Update existing message in place (replace with updated version)
      this.messages = [
        ...this.messages.slice(0, existingIndex),
        message,
        ...this.messages.slice(existingIndex + 1)
      ];
    } else {
      // Add new message to the list
      this.messages = [...this.messages, message];

      // Ensure current user is in the avatar map for new messages
      this.ensureCurrentUserInAvatarMap();

      // Invalidate cache when new message is added.
      // Without this, navigating away and back would load stale cached data
      // that doesn't include this new message.
      if (this.conversationId) {
        this.invalidateConversationCache(this.conversationId);
      }

      // Load attachments for the new message (if any were saved with it)
      // This ensures attachments are displayed immediately after sending
      await this.loadAttachmentsForMessage(message.ID);
    }

    // Scroll to bottom when new message is sent
    this.scrollToBottom = true;
  }

  /**
   * Loads attachments for a single message and adds them to the attachmentsByDetailId map.
   * Called after a new message is sent to ensure attachments are displayed immediately.
   */
  private async loadAttachmentsForMessage(messageId: string): Promise<void> {
    try {
      const attachments = await this.attachmentService.loadAttachmentsForMessage(messageId, this.currentUser);
      if (attachments.length > 0) {
        this.attachmentsByDetailId.set(messageId, attachments);
        // Create new map reference to trigger Angular change detection
        this.attachmentsByDetailId = new Map(this.attachmentsByDetailId);
        LogStatusEx({message: `Loaded ${attachments.length} attachment(s) for message ${messageId}`, verboseOnly: true});
      }
    } catch (error) {
      console.warn('Failed to load attachments for message:', error);
    }
  }

  /**
   * Ensures the current user is in the avatar map
   * Called when new messages are created to ensure avatar data is available
   */
  private async ensureCurrentUserInAvatarMap(): Promise<void> {
    const userId = this.currentUser.ID;

    // If user already in map, skip
    if (this.userAvatarMap.has(userId)) {
      return;
    }

    // Load the current user's avatar data
    const md = new Metadata();
    const userEntity = await md.GetEntityObject<any>('MJ: Users');
    await userEntity.Load(userId);

    this.userAvatarMap.set(userId, {
      imageUrl: userEntity.UserImageURL || null,
      iconClass: userEntity.UserImageIconClass || null
    });

    LogStatusEx({message: `👤 Added current user to avatar map`, verboseOnly: true});
  }

  /**
   * Handle agent run detected event from progress updates
   * This is called when the first progress update arrives with an agent run ID
   */
  async onAgentRunDetected(event: {conversationDetailId: string; agentRunId: string}): Promise<void> {
    await this.addAgentRunToMap(event.conversationDetailId, event.agentRunId);
  }

  /**
   * Handle message completion event from message-input
   * Refreshes the agent run data in-place to get final status and timestamps
   * Also reloads attachments created during agent execution (e.g., generated images)
   */
  async onMessageComplete(event: {conversationDetailId: string; agentId?: string}): Promise<void> {
    // Get existing agent run from map
    const existingAgentRun = this.agentRunsByDetailId.get(event.conversationDetailId);

    if (existingAgentRun?.ID) {
      // Refresh the SAME object by calling Load() - preserves all references
      await existingAgentRun.Load(existingAgentRun.ID);

      // Trigger re-render to show updated status
      this.messages = [...this.messages];
      this.cdr.detectChanges();
    }

    // Reload attachments for this message to pick up newly created media attachments
    // (e.g., images generated by agent via Generate Image action)
    // This must be done after agent completion because attachments are created by AgentRunner
    // after the agent execution finishes
    await this.loadAttachmentsForMessage(event.conversationDetailId);

    // Trigger change detection after async attachment loading to ensure UI updates
    this.cdr.detectChanges();
  }

  /**
   * Handle agent run update event from progress updates
   * This is called on EVERY progress update with the full, live agent run object
   * Provides real-time updates of status, timestamps, tokens, cost during execution
   */
  async onAgentRunUpdate(event: {conversationDetailId: string; agentRun?: AIAgentRunEntityExtended, agentRunId?: string}): Promise<void> {
    if (event.agentRun) {
      // Directly update map with fresh data from progress (no database query needed)
      // Don't create new Map - message-list component needs to keep the same reference
      this.agentRunsByDetailId.set(event.conversationDetailId, event.agentRun);
    }
    else {
      // no agent run, should have agentRunId
      await this.addAgentRunToMap(event.conversationDetailId, event.agentRunId!);
    }

    // Force message list to re-render with updated agent run
    // This ensures message components receive the fresh agent run data
    this.messages = [...this.messages];
    this.cdr.detectChanges();
  }

  /**
   * Reload messages for the active conversation from the database
   * Called when completion is detected to discover newly delegated agent messages
   */
  private async reloadMessagesForActiveConversation(): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) {
      return;
    }

    try {
      LogStatusEx({message: `🔄 Reloading messages for conversation ${conversationId} to discover delegated agents`, verboseOnly: true});

      const md = new Metadata();
      const rv = new RunView();

      // Track existing message IDs before reload to identify new messages
      const existingMessageIds = new Set(this.messages.map(m => m.ID));

      const result = await rv.RunView<MJConversationDetailEntity>({
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: `ConversationID='${conversationId}'`,
        OrderBy: '__mj_CreatedAt ASC',
        ResultType: 'entity_object'
      }, this.currentUser);

      if (result.Success && result.Results && result.Results.length > 0) {
        // Update messages with reloaded data
        this.messages = result.Results;

        // Find newly discovered messages (delegated agents)
        const newMessages = result.Results.filter(m => !existingMessageIds.has(m.ID));

        // Load agent runs for new messages so completion detector can reload artifacts
        for (const message of newMessages) {
          if (message.AgentID && message.ID) {
            // Query to find agent run for this conversation detail
            const agentRunResult = await rv.RunView<AIAgentRunEntityExtended>({
              EntityName: 'MJ: AI Agent Runs',
              ExtraFilter: `ConversationDetailID='${message.ID}'`,
              ResultType: 'entity_object'
            }, this.currentUser);

            if (agentRunResult.Success && agentRunResult.Results && agentRunResult.Results.length > 0) {
              const agentRun = agentRunResult.Results[0];
              this.agentRunsByDetailId.set(message.ID, agentRun);
              LogStatusEx({message: `✅ Loaded agent run for new delegated message ${message.ID} (Agent: ${agentRun.Agent})`, verboseOnly: true});
            }
          }
        }

        LogStatusEx({message: `✅ Reloaded ${result.Results.length} messages (${newMessages.length} new, ${result.Results.filter(m => m.Status === 'In-Progress').length} in-progress)`, verboseOnly: true});
      }
    } catch (error) {
      console.error('Failed to reload messages for active conversation:', error);
    }
  }

  /**
   * Handle message completion triggered by PubSub completion event
   * Reloads message, agent run, and artifacts, then updates UI
   * @param message The message that completed
   * @param agentRunId The ID of the agent run that completed
   */
  private async handleMessageCompletion(message: MJConversationDetailEntity, _agentRunId: string): Promise<void> {
    try {
      LogStatusEx({message: `🎉 Handling completion for message ${message.ID}`, verboseOnly: true});

      // Reload message from database to get final content and status
      await message.Load(message.ID);

      // Reload agent run to get final status, timestamps, and cost
      const agentRun = this.agentRunsByDetailId.get(message.ID);
      if (agentRun?.ID) {
        await agentRun.Load(agentRun.ID);
      }

      // Reload artifacts for this completed message
      await this.reloadArtifactsForMessage(message.ID);

      // Reload messages to pick up newly delegated agent messages
      // When Sage delegates to Marketing Agent, a new message is created
      await this.reloadMessagesForActiveConversation();

      // Update inProgressMessageIds to include new delegated agents
      // This triggers callback registration via the setter in message-input
      this.inProgressMessageIds = [...this.messages
        .filter(m => m.Status === 'In-Progress')
        .map(m => m.ID)];

      // Auto-open artifact panel if this message has artifacts and no artifact is currently shown
      if (this.artifactsByDetailId.has(message.ID) && !this.showArtifactPanel) {
        const artifactList = this.artifactsByDetailId.get(message.ID);
        if (artifactList && artifactList.length > 0) {
          // Show the LAST (most recent) artifact
          this.selectedArtifactId = artifactList[artifactList.length - 1].artifactId;
          this.showArtifactPanel = true;
          await this.loadArtifactPermissions(this.selectedArtifactId);
        }
      }

      // Remove task from ActiveTasksService (clears spinner in conversation list)
      const task = this.activeTasks.getByConversationDetailId(message.ID);
      if (task) {
        this.activeTasks.remove(task.id);
      }

      // Force re-render with updated agent run and artifacts
      this.messages = [...this.messages];
      this.cdr.detectChanges();

      LogStatusEx({message: `✅ Completion handled for message ${message.ID}`, verboseOnly: true});
    } catch (error) {
      console.error(`Error handling message completion for ${message.ID}:`, error);
    }
  }

  async onAgentResponse(event: {message: MJConversationDetailEntity, agentResult: any}): Promise<void> {
    // Add the agent's response message to the conversation
    this.messages = [...this.messages, event.message];

    // Invalidate cache for this conversation since we have new messages
    if (this.conversationId) {
      this.invalidateConversationCache(this.conversationId);
    }

    // Scroll to bottom when agent responds
    this.scrollToBottom = true;

    // CRITICAL FIX: Always refresh the agent run data when agent completes
    // This ensures we get the final status and timestamps, replacing any stale data from when agent started
    // agentResult is ExecuteAgentResult which contains agentRun property
    if (event.agentResult?.agentRun?.ID) {
      await this.addAgentRunToMap(event.message.ID, event.agentResult.agentRun.ID, true);  // forceRefresh = true
    }

    // Reload artifact mapping for this message to pick up newly created artifacts
    await this.reloadArtifactsForMessage(event.message.ID);

    // Auto-open artifact panel if this message has artifacts and no artifact is currently shown
    if (this.artifactsByDetailId.has(event.message.ID) && !this.showArtifactPanel) {
      const artifactList = this.artifactsByDetailId.get(event.message.ID);
      if (artifactList && artifactList.length > 0) {
        // Show the LAST (most recent) artifact - uses display data, no lazy load needed
        this.selectedArtifactId = artifactList[artifactList.length - 1].artifactId;
        this.showArtifactPanel = true;
        // Load permissions for the new artifact
        await this.loadArtifactPermissions(this.selectedArtifactId);
      }
    }

    // Force change detection to update the UI
    this.cdr.detectChanges();
  }

  /**
   * Invalidate cached conversation data
   * Called when new messages are added or conversation data changes
   */
  private invalidateConversationCache(conversationId: string): void {
    this.conversationDataCache.delete(conversationId);
    LogStatusEx({message: `🗑️ Invalidated cache for conversation ${conversationId}`, verboseOnly: true});
  }

  /**
   * Add or update an agent run in the map
   * Called when a new agent run completes to keep the map in sync
   * @param forceRefresh If true, always reload from database even if already in map (used when status changes)
   */
  private async addAgentRunToMap(conversationDetailId: string, agentRunId: string, forceRefresh: boolean = false): Promise<AIAgentRunEntityExtended> {
    try {
      // Always refresh if forced, or if not in map yet
      if (forceRefresh || !this.agentRunsByDetailId.has(conversationDetailId)) {
        const md = new Metadata();
        const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', this.currentUser);
        if (await agentRun.Load(agentRunId)) {
          this.agentRunsByDetailId.set(conversationDetailId, agentRun);

          // Force message list to re-render with updated agent run
          // Keep same Map reference so message-list component can access updates
          this.messages = [...this.messages];
          this.cdr.detectChanges();

        }
        return agentRun;
      } 
      else {
        return this.agentRunsByDetailId.get(conversationDetailId)!;
      }
    } catch (error) {
      console.error('Failed to load agent run for map:', error);
      throw error;
    }
  }

  /**
   * Reload artifacts for a specific message ID
   * Called after an artifact is created to update the UI immediately
   * Invalidates and refreshes the conversation cache
   */
  private async reloadArtifactsForMessage(conversationDetailId: string): Promise<void> {
    LogStatusEx({message: `🔄 Reloading artifacts for message ${conversationDetailId}`, verboseOnly: true});
    try {
      const rq = new RunQuery();
      const md = new Metadata();

      // Get the ConversationID for this detail
      const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.currentUser);
      if (!(await detail.Load(conversationDetailId))) {
        console.error('Failed to load conversation detail');
        return;
      }

      // Invalidate cache since artifacts changed
      this.invalidateConversationCache(detail.ConversationID);

      // Use optimized single query to reload all conversation data
      const result = await rq.RunQuery({
        QueryName: 'GetConversationComplete',
        CategoryPath: '/MJ/Conversations',
        Parameters: { ConversationID: detail.ConversationID }
      }, this.currentUser);

      if (!result.Success || !result.Results) {
        console.error('Failed to reload artifacts:', result.ErrorMessage);
        return;
      }

      LogStatusEx({message: `📊 Query result: ${result.Results.length} conversation details loaded`, verboseOnly: true});

      // Update cache with fresh data
      const conversationData = result.Results as ConversationDetailComplete[];
      this.conversationDataCache.set(detail.ConversationID, conversationData);

      // Find the specific conversation detail we're reloading and update its artifacts
      for (const row of conversationData) {
        if (row.ID === conversationDetailId) {
          const parsed = parseConversationDetailComplete(row);

          // Clear existing artifacts for this detail and rebuild
          this.artifactsByDetailId.delete(conversationDetailId);
          this.systemArtifactsByDetailId.delete(conversationDetailId);

          if (parsed.artifacts.length > 0) {
            const artifactList: LazyArtifactInfo[] = [];
            const systemArtifactList: LazyArtifactInfo[] = [];

            for (const artifactData of parsed.artifacts) {
              const lazyInfo = new LazyArtifactInfo(artifactData, this.currentUser);

              // Separate system-only artifacts from user-visible artifacts
              if (artifactData.Visibility === 'System Only') {
                systemArtifactList.push(lazyInfo);
              } else {
                artifactList.push(lazyInfo);
              }

              LogStatusEx({message: `✅ Loaded artifact ${artifactData.ArtifactID} v${artifactData.VersionNumber} for message ${conversationDetailId}`, verboseOnly: true});
            }

            // Add to appropriate maps
            if (artifactList.length > 0) {
              this.artifactsByDetailId.set(conversationDetailId, artifactList);
            }
            if (systemArtifactList.length > 0) {
              this.systemArtifactsByDetailId.set(conversationDetailId, systemArtifactList);
            }
          }

          // Create new Map reference to trigger Angular change detection
          this.artifactsByDetailId = new Map(this.artifactsByDetailId);

          // Update artifact count
          this.artifactCount = this.calculateUniqueArtifactCount();

          break; // Found and updated the target message
        }
      }
    } catch (error) {
      console.error('Failed to reload artifacts for message:', error);
    }
  }

  openProjectSelector(): void {
    this.showProjectSelector = true;
  }

  toggleMembersModal(): void {
    this.showMembersModal = !this.showMembersModal;
  }

  viewArtifacts(): void {
    this.showArtifactsModal = true;
  }

  /**
   * Calculate count of unique artifacts (not versions)
   * Works with LazyArtifactInfo - uses artifactId from display data
   * Respects showSystemArtifacts toggle to update count dynamically
   */
  public get artifactCountDisplay(): number {
    const uniqueArtifactIds = new Set<string>();
    for (const artifactList of this.effectiveArtifactsMap.values()) {
      for (const info of artifactList) {
        uniqueArtifactIds.add(info.artifactId);
      }
    }
    return uniqueArtifactIds.size;
  }

  /**
   * Calculate count of unique artifacts (not versions) - user-visible only
   * Used for initial artifact count (doesn't change with toggle)
   */
  private calculateUniqueArtifactCount(): number {
    const uniqueArtifactIds = new Set<string>();
    for (const artifactList of this.artifactsByDetailId.values()) {
      for (const info of artifactList) {
        uniqueArtifactIds.add(info.artifactId);
      }
    }
    return uniqueArtifactIds.size;
  }

  /**
   * Get the effective artifacts map based on showSystemArtifacts toggle
   * Combines user-visible and system artifacts when toggle is on
   * Uses caching to prevent infinite change detection loops
   */
  public get effectiveArtifactsMap(): Map<string, LazyArtifactInfo[]> {
    if (!this.showSystemArtifacts) {
      // Only user-visible artifacts - no need to cache
      return this.artifactsByDetailId;
    }

    // Return cached combined map if available
    if (this._combinedArtifactsMap) {
      return this._combinedArtifactsMap;
    }

    // Combine both maps when showing system artifacts
    const combined = new Map<string, LazyArtifactInfo[]>();

    // Add all user-visible artifacts
    for (const [key, value] of this.artifactsByDetailId) {
      combined.set(key, [...value]);
    }

    // Add system artifacts
    for (const [key, value] of this.systemArtifactsByDetailId) {
      if (combined.has(key)) {
        // Merge with existing artifacts for this detail
        combined.get(key)!.push(...value);
      } else {
        combined.set(key, [...value]);
      }
    }

    // Cache the result
    this._combinedArtifactsMap = combined;
    return combined;
  }

  /**
   * Toggles system artifacts visibility
   * Clears the cache so the map will be rebuilt on next access
   */
  public toggleSystemArtifacts(): void {
    this.showSystemArtifacts = !this.showSystemArtifacts;
    this._combinedArtifactsMap = null; // Clear cache
    this.cdr.detectChanges(); // Force update
  }

  /**
   * Check if there are any system artifacts in this conversation
   * Used to conditionally show/hide the "Show System" toggle button
   */
  public get hasSystemArtifacts(): boolean {
    return this.systemArtifactsByDetailId.size > 0;
  }

  /**
   * Get unique artifacts grouped by artifact ID (not by conversation detail)
   * Returns the latest version info for each unique artifact with all versions
   * Works with LazyArtifactInfo - uses display data without loading full entities
   * Respects showSystemArtifacts toggle
   */
  getArtifactsArray(): Array<{
    artifactId: string;
    versionId: string;
    name: string;
    versionCount: number;
    visibility: string;
    versions: Array<{versionId: string; versionNumber: number}>
  }> {
    const artifactMap = new Map<string, {
      artifactId: string;
      versionId: string;
      name: string;
      visibility: string;
      versions: Array<{versionId: string; versionNumber: number}>
    }>();

    // Group by artifactId, collecting all version details
    // Use effectiveArtifactsMap to respect showSystemArtifacts toggle
    for (const artifactList of this.effectiveArtifactsMap.values()) {
      for (const info of artifactList) {
        const artifactId = info.artifactId;
        const versionId = info.artifactVersionId;
        const versionNumber = info.versionNumber || 1;
        const name = info.artifactName || 'Untitled';

        if (!artifactMap.has(artifactId)) {
          artifactMap.set(artifactId, {
            artifactId: artifactId,
            versionId: versionId, // Latest version ID
            name: name,
            visibility: info.visibility,
            versions: [{versionId: versionId, versionNumber: versionNumber}]
          });
        } else {
          // Add version if not already present
          const existing = artifactMap.get(artifactId)!;
          if (!existing.versions.some(v => v.versionId === versionId)) {
            existing.versions.push({versionId: versionId, versionNumber: versionNumber});
            // Update to latest version ID (assuming versions are added chronologically)
            existing.versionId = versionId;
          }
        }
      }
    }

    // Convert to array with version count, sorted by version number descending
    return Array.from(artifactMap.values()).map(item => ({
      artifactId: item.artifactId,
      versionId: item.versionId,
      name: item.name,
      visibility: item.visibility,
      versionCount: item.versions.length,
      versions: item.versions.sort((a, b) => b.versionNumber - a.versionNumber)
    }));
  }

  toggleArtifactExpansion(artifactId: string, event: Event): void {
    event.stopPropagation(); // Prevent opening artifact when clicking expand button
    this.expandedArtifactId = this.expandedArtifactId === artifactId ? null : artifactId;
  }

  async openArtifactFromModal(artifactId: string, versionNumber?: number): Promise<void> {
    this.selectedArtifactId = artifactId;
    this.selectedVersionNumber = versionNumber;
    this.showArtifactPanel = true;
    this.showArtifactsModal = false;

    // Load permissions for the selected artifact
    await this.loadArtifactPermissions(artifactId);
  }

  exportConversation(): void {
    if (this.conversation) {
      this.showExportModal = true;
    }
  }

  onExportModalCancelled(): void {
    this.showExportModal = false;
  }

  onExportModalComplete(): void {
    this.showExportModal = false;
  }

  async onProjectSelected(project: any): Promise<void> {
    if (this.conversation && project) {
      try {
        await this.conversationData.saveConversation(
          this.conversation.ID,
          { ProjectID: project.ID },
          this.currentUser
        );
        this.showProjectSelector = false;
      } catch (error) {
        console.error('Failed to assign project:', error);
      }
    } else if (this.conversation && !project) {
      // Remove project assignment
      try {
        await this.conversationData.saveConversation(
          this.conversation.ID,
          { ProjectID: null },
          this.currentUser
        );
        this.showProjectSelector = false;
      } catch (error) {
        console.error('Failed to remove project:', error);
      }
    }
  }

  shareConversation(): void {
    // TODO: Implement share functionality
    LogStatusEx({message: 'Share conversation', verboseOnly: true});
  }

  onReplyInThread(message: MJConversationDetailEntity): void {
    // Open thread panel for this message - emit to parent
    this.threadOpened.emit(message.ID);
  }

  onViewThread(message: MJConversationDetailEntity): void {
    // Open thread panel for this message - emit to parent
    this.threadOpened.emit(message.ID);
  }

  onLocalThreadClosed(): void {
    // Close the thread panel - emit to parent
    this.threadClosed.emit();
  }

  onThreadReplyAdded(reply: MJConversationDetailEntity): void {
    // Optionally refresh the message list to update thread counts
    // For now, we'll just log it
    LogStatusEx({message: 'Thread reply added', verboseOnly: true, additionalArgs: [reply]});

    // Reload messages to get updated thread counts
    if (this.conversationId) {
      this.loadMessages(this.conversationId);
    }
  }

  onToggleAgentPanel(): void {
    this.showAgentPanel = !this.showAgentPanel;
    // The agent panel component handles its own visibility
    // This could be used to toggle a modal or different view
  }

  onAgentSelected(agentRun: MJAIAgentRunEntity): void {
    // When an agent is clicked in the indicator, could show details
    LogStatusEx({message: 'Agent selected', verboseOnly: true, additionalArgs: [agentRun.ID]});
    // Could open a modal or navigate to agent details
  }

  onMessageEdited(message: MJConversationDetailEntity): void {
    // Message was edited and saved, trigger change detection
    LogStatusEx({message: 'Message edited', verboseOnly: true, additionalArgs: [message.ID]});
    // The message entity is already updated in place, so no need to reload
    // Just ensure the UI reflects the changes
  }

  /**
   * Handle suggested response selection from user
   * Sends the selected response as a new user message WITHOUT modifying the visible input
   */
  async onSuggestedResponseSelected(event: {text: string; customInput?: string}): Promise<void> {
    const messageText = event.customInput || event.text;

    // Get the active message input for the current conversation
    // (we cache multiple instances, one per visited conversation)
    const activeInput = this.getActiveMessageInputComponent();

    // If we have an active conversation with message input available, use it
    if (activeInput && !this.isNewConversation) {
      await activeInput.sendMessageWithText(messageText);
    } else if (!this.conversation || this.isNewConversation) {
      // If no conversation or in new unsaved state, route through empty state handler
      // This will create the conversation and send the message
      await this.onEmptyStateMessageSent({ text: messageText, attachments: [] });
    } else {
      console.error('MessageInputComponent not available and not in a valid state to create conversation');
    }
  }

  onRetryMessage(message: MJConversationDetailEntity): void {
    // TODO: Implement retry logic
    // This should find the parent user message and re-trigger the agent invocation
    LogStatusEx({message: 'Retry requested for message', verboseOnly: true, additionalArgs: [message.ID]});
    // For now, just log it - full implementation would require refactoring agent invocation
  }

  /**
   * Handle attachment click - opens the image viewer for images
   */
  onAttachmentClicked(attachment: MessageAttachment): void {
    if (attachment.type === 'Image' && attachment.contentUrl) {
      this.selectedImageUrl = attachment.contentUrl;
      this.selectedImageAlt = attachment.fileName || 'Image attachment';
      this.selectedImageFileName = attachment.fileName || 'image';
      this.showImageViewer = true;
    } else {
      // For non-image attachments, could trigger download or other action
      console.log('Non-image attachment clicked:', attachment);
    }
  }

  /**
   * Handle image viewer close
   */
  onImageViewerClosed(): void {
    this.showImageViewer = false;
    this.selectedImageUrl = '';
    this.selectedImageAlt = '';
    this.selectedImageFileName = '';
  }

  /**
   * Handle upload state changes from message input component
   */
  onUploadStateChanged(event: {isUploading: boolean; message: string}): void {
    this.isUploadingAttachments = event.isUploading;
    this.uploadingMessage = event.message;
  }

  async onArtifactClicked(data: {artifactId: string; versionId?: string}): Promise<void> {
    this.selectedArtifactId = data.artifactId;

    // If versionId is provided, find the version number from display data (no lazy load needed)
    if (data.versionId) {
      for (const [detailId, artifactList] of this.artifactsByDetailId.entries()) {
        for (const artifactInfo of artifactList) {
          if (artifactInfo.artifactVersionId === data.versionId) {
            this.selectedVersionNumber = artifactInfo.versionNumber;
            LogStatusEx({message: `📦 Opening artifact viewer for v${this.selectedVersionNumber}`, verboseOnly: true});
            break;
          }
        }
      }
    } else {
      // No specific version, let viewer default to latest
      this.selectedVersionNumber = undefined;
    }

    this.showArtifactPanel = true;

    // Load permissions for the selected artifact
    await this.loadArtifactPermissions(data.artifactId);
  }

  async onArtifactCreated(data: {conversationDetailId: string, artifactId: string; versionId: string; versionNumber: number; name: string}): Promise<void> {
    // Reload artifacts to get full entities
    await this.reloadArtifactsForMessage(data.conversationDetailId);

    const artifactList = this.artifactsByDetailId.get(data.conversationDetailId);

    // Auto-open artifact panel if no artifact currently shown
    if (!this.showArtifactPanel) {
      if (artifactList && artifactList.length > 0) {
        // Show the LAST (most recent) artifact - use actual ID from map, not empty event data
        this.selectedArtifactId = artifactList[artifactList.length - 1].artifactId;
        this.showArtifactPanel = true;
        // Load permissions for the new artifact
        await this.loadArtifactPermissions(this.selectedArtifactId);
      }
    } else if (this.selectedArtifactId && artifactList && artifactList.length > 0) {
      // Panel is already open - check if new artifact is a new version of currently displayed artifact
      const currentArtifact = artifactList.find(a => a.artifactId === this.selectedArtifactId);
      if (currentArtifact) {
        // New version of the same artifact - refresh to show latest version
        const latestVersion = artifactList[artifactList.length - 1];
        this.artifactViewerRefresh$.next({
          artifactId: latestVersion.artifactId,
          versionNumber: latestVersion.versionNumber
        });
      }
    }

    // Force change detection to update the UI immediately
    this.cdr.detectChanges();
  }

  onCloseArtifactPanel(): void {
    this.showArtifactPanel = false;
    this.selectedArtifactId = null;
    // Clear permissions
    this.canShareSelectedArtifact = false;
    this.canEditSelectedArtifact = false;
    // Reset maximize state when closing
    this.isArtifactPaneMaximized = false;
  }

  toggleMaximizeArtifactPane(): void {
    if (this.isArtifactPaneMaximized) {
      // Restore to previous width
      this.artifactPaneWidth = this.artifactPaneWidthBeforeMaximize;
      this.isArtifactPaneMaximized = false;
    } else {
      // Maximize - store current width and set to 100%
      this.artifactPaneWidthBeforeMaximize = this.artifactPaneWidth;
      this.artifactPaneWidth = 100;
      this.isArtifactPaneMaximized = true;
    }
  }

  onSaveToCollectionRequested(event: {artifactId: string; excludedCollectionIds: string[]}): void {
    this.collectionPickerArtifactId = event.artifactId;
    this.collectionPickerExcludedIds = event.excludedCollectionIds;
    this.showCollectionPicker = true;
  }

  async onCollectionPickerSaved(collectionIds: string[]): Promise<void> {
    if (!this.collectionPickerArtifactId || !this.artifactViewerComponent) {
      return;
    }

    // Call the artifact viewer's save method
    const success = await this.artifactViewerComponent.saveToCollections(collectionIds);
    if (success) {
      this.showCollectionPicker = false;
      this.collectionPickerArtifactId = null;
      this.collectionPickerExcludedIds = [];
    }
  }

  onCollectionPickerCancelled(): void {
    this.showCollectionPicker = false;
    this.collectionPickerArtifactId = null;
    this.collectionPickerExcludedIds = [];
  }

  /**
   * Helper method to check if a conversation detail has an artifact
   * Used by message components to determine whether to show artifact card
   */
  public conversationDetailHasArtifact(conversationDetailId: string): boolean {
    return this.artifactsByDetailId.has(conversationDetailId);
  }

  /**
   * Get artifact info for a conversation detail
   * Returns the LAST (most recent) artifact if multiple exist
   * Returns LazyArtifactInfo - caller can trigger lazy load if full entities needed
   */
  public getArtifactInfo(conversationDetailId: string): LazyArtifactInfo | undefined {
    const artifactList = this.artifactsByDetailId.get(conversationDetailId);
    return artifactList && artifactList.length > 0
      ? artifactList[artifactList.length - 1]
      : undefined;
  }

  /**
   * Get ALL artifacts for a conversation detail
   * Use this when you need to display all artifacts (e.g., in a list)
   * Returns LazyArtifactInfo array - caller can trigger lazy load if full entities needed
   */
  public getAllArtifactsForDetail(conversationDetailId: string): LazyArtifactInfo[] {
    return this.artifactsByDetailId.get(conversationDetailId) || [];
  }

  /**
   * Resize handle methods for artifact pane
   */
  onResizeStart(event: MouseEvent): void {
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.artifactPaneWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove(event: MouseEvent): void {
    if (!this.isResizing) return;

    const containerWidth = (event.currentTarget as Window).innerWidth;
    const deltaX = this.startX - event.clientX; // Reversed: drag left = wider artifact pane
    const deltaPercent = (deltaX / containerWidth) * 100;
    let newWidth = this.startWidth + deltaPercent;

    // Constrain between 20% and 70%
    newWidth = Math.max(20, Math.min(70, newWidth));
    this.artifactPaneWidth = newWidth;
  }

  private onResizeEnd(event: MouseEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save to localStorage
      this.saveArtifactPaneWidth();
    }
  }

  /**
   * Touch event handlers for mobile resize support
   */
  onResizeTouchStart(event: TouchEvent): void {
    this.isResizing = true;
    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startWidth = this.artifactPaneWidth;
    event.preventDefault();
  }

  private onResizeTouchMove(event: TouchEvent): void {
    if (!this.isResizing) return;

    const touch = event.touches[0];
    const containerWidth = window.innerWidth;
    const deltaX = this.startX - touch.clientX;
    const deltaPercent = (deltaX / containerWidth) * 100;
    let newWidth = this.startWidth + deltaPercent;

    newWidth = Math.max(20, Math.min(70, newWidth));
    this.artifactPaneWidth = newWidth;
  }

  private onResizeTouchEnd(event: TouchEvent): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.saveArtifactPaneWidth();
    }
  }

  /**
   * LocalStorage persistence methods for artifact pane
   */
  private loadArtifactPaneWidth(): void {
    try {
      const saved = localStorage.getItem(this.ARTIFACT_PANE_WIDTH_KEY);
      if (saved) {
        const width = parseFloat(saved);
        if (!isNaN(width) && width >= 20 && width <= 70) {
          this.artifactPaneWidth = width;
        }
      }
    } catch (error) {
      console.warn('Failed to load artifact pane width from localStorage:', error);
    }
  }

  private saveArtifactPaneWidth(): void {
    try {
      localStorage.setItem(this.ARTIFACT_PANE_WIDTH_KEY, this.artifactPaneWidth.toString());
    } catch (error) {
      console.warn('Failed to save artifact pane width to localStorage:', error);
    }
  }

  onConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    LogStatusEx({message: '🎉 Conversation renamed', verboseOnly: true, additionalArgs: [event]});
    // Pass the event up to workspace component for animation
    this.conversationRenamed.emit(event);
  }

  /**
   * Handle message sent from empty state component
   * Creates a new conversation and emits to parent to update selection
   */
  async onEmptyStateMessageSent(event: {text: string; attachments: PendingAttachment[]}): Promise<void> {
    const { text, attachments } = event;
    if (!text?.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    LogStatusEx({message: '📨 Empty state message received', verboseOnly: true, additionalArgs: [text, `${attachments?.length || 0} attachments`]});

    try {
      this.isProcessing = true;

      // Create a new conversation using the data service
      const newConversation = await this.conversationData.createConversation(
        'New Conversation', // Temporary name - will be auto-named after first message
        this.environmentId,
        this.currentUser
      );

      if (!newConversation) {
        console.error('Failed to create new conversation');
        this.isProcessing = false;
        return;
      }

      LogStatusEx({message: '✅ Created new conversation', verboseOnly: true, additionalArgs: [newConversation.ID]});

      // Emit to parent with the new conversation AND the pending message/attachments in a single event
      // This ensures atomic state update - workspace sets all state before Angular change detection
      // creates the new message-input component
      const pendingMessage = text?.trim() || '';
      const pendingAttachments = attachments || [];
      this.conversationCreated.emit({
        conversation: newConversation,
        pendingMessage,
        pendingAttachments
      });

    } catch (error) {
      console.error('Error creating conversation from empty state:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    // Pass the event up to the parent component (workspace or explorer wrapper)
    this.openEntityRecord.emit(event);
  }

  viewTestRun(testRunId: string): void {
    // Open the test run record in the entity viewer
    const compositeKey = new CompositeKey();
    compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: testRunId });
    this.openEntityRecord.emit({
      entityName: 'MJ: Test Runs',
      compositeKey
    });
  }

  onTestFeedbackMessage(message: MJConversationDetailEntity): void {
    if (!message.TestRunID) {
      console.error('Cannot provide test feedback: message has no TestRunID');
      return;
    }

    const dialogData: TestFeedbackDialogData = {
      testRunId: message.TestRunID,
      conversationDetailId: message.ID,
      currentUser: this.currentUser
    };

    const dialogRef = this.dialogService.open({
      content: TestFeedbackDialogComponent,
      width: 600,
      height: 680
    });

    const dialogInstance = dialogRef.content.instance as TestFeedbackDialogComponent;
    dialogInstance.data = dialogData;

    dialogRef.result.subscribe((result) => {
      if (result && typeof result === 'object' && 'success' in result) {
        const feedbackResult = result as {success: boolean; feedbackId?: string};
        if (feedbackResult.success) {
          console.log('Test feedback saved successfully:', feedbackResult.feedbackId);
          // TODO: Optionally show success notification
        }
      }
    });
  }

  onTaskClicked(task: MJTaskEntity): void {
    // Pass task click up to workspace to navigate to Tasks tab
    this.taskClicked.emit(task);
  }

  onNavigateToConversation(event: {conversationId: string; taskId: string}): void {
    // Navigate to the conversation with the active task - emit to parent
    // Parent will update its selection state
    // For now, we can't navigate to a different conversation from within chat area
    // This would require emitting an event to the parent
    console.log('Navigate to conversation requested:', event.conversationId);
  }

  /**
   * Handle navigation request from artifact viewer Links tab
   */
  onArtifactLinkNavigation(event: {type: 'conversation' | 'collection'; id: string}): void {
    LogStatusEx({message: '🔗 Chat area: Artifact link clicked', verboseOnly: true, additionalArgs: [event]});
    this.artifactLinkClicked.emit(event);
  }

  /**
   * Load permissions for the given artifact
   */
  private async loadArtifactPermissions(artifactId: string): Promise<void> {
    // Guard against null/undefined
    if (!artifactId) {
      this.canShareSelectedArtifact = false;
      this.canEditSelectedArtifact = false;
      return;
    }

    try {
      const permissions = await this.artifactPermissionService.getUserPermissions(artifactId, this.currentUser);
      this.canShareSelectedArtifact = permissions.canShare;
      this.canEditSelectedArtifact = permissions.canEdit;
    } catch (error) {
      console.error('Failed to load artifact permissions:', error);
      this.canShareSelectedArtifact = false;
      this.canEditSelectedArtifact = false;
    }
  }

  /**
   * Handle share request from artifact viewer
   */
  async onArtifactShareRequested(artifactId: string): Promise<void> {
    // Load the artifact entity to pass to the modal
    const md = new Metadata();
    const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts');
    await artifact.Load(artifactId);

    if (artifact) {
      this.artifactToShare = artifact;
      this.isArtifactShareModalOpen = true;
    }
  }

  /**
   * Handle close of artifact share modal
   */
  onArtifactShareModalClose(): void {
    this.isArtifactShareModalOpen = false;
    this.artifactToShare = null;
  }

  /**
   * Handle successful share - refresh permissions
   */
  async onArtifactShared(): Promise<void> {
    this.isArtifactShareModalOpen = false;
    this.artifactToShare = null;

    // Refresh permissions for the active artifact
    if (this.selectedArtifactId) {
      await this.loadArtifactPermissions(this.selectedArtifactId);
    }
  }

  // Scroll functionality (pattern from skip-chat)
  checkScroll(): void {
    if (!this.scrollContainer) return;

    const element = this.scrollContainer.nativeElement;
    const buffer = 15; // Tolerance in pixels
    const scrollDifference = element.scrollHeight - (element.scrollTop + element.clientHeight);
    const hasScrollableContent = element.scrollHeight > element.clientHeight + 50;
    const atBottom = scrollDifference <= buffer;

    const newValue = !atBottom && hasScrollableContent;

    // Only update if value changed to prevent unnecessary change detection
    if (this.showScrollToBottomIcon !== newValue) {
      this.showScrollToBottomIcon = newValue;
      this.cdr.detectChanges();
    }
  }

  scrollToBottomNow(retryCount: number = 0): void {
    try {
      if (!this.scrollContainer) {
        if (retryCount < 10) {
          setTimeout(() => this.scrollToBottomNow(retryCount + 1), 50);
        }
        return;
      }

      const element = this.scrollContainer.nativeElement;
      if (element.scrollHeight === 0 && retryCount < 10) {
        setTimeout(() => this.scrollToBottomNow(retryCount + 1), 50);
      } else if (element.scrollHeight > 0) {
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  scrollToBottomAnimate(): void {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      element.scroll({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }

  /**
   * Detect in-progress agent runs/tasks and reconnect to their streaming updates
   * Called after loading a conversation to resume progress tracking
   */
  private async detectAndReconnectToInProgressRuns(conversationId: string): Promise<void> {
    // Check for in-progress messages
    const inProgressMessages = this.messages.filter(
      m => m.Status === 'In-Progress' && m.Role === 'AI'
    );

    if (inProgressMessages.length === 0) {
      return;
    }

    LogStatusEx({message: `🔄 Found ${inProgressMessages.length} in-progress messages, reconnecting...`, verboseOnly: true});

    // For each in-progress message, check if there's an active agent run
    for (const message of inProgressMessages) {
      if (message.AgentID) {
        // Check agent state service for this run
        const agentRun = this.agentRunsByDetailId.get(message.ID);

        if (agentRun && agentRun.Status === 'Running') {
          LogStatusEx({message: `🔌 Reconnecting to agent run ${agentRun.ID} for message ${message.ID}`, verboseOnly: true});

          // Agent state service polling will automatically pick this up
          // The WebSocket subscription is already active via PushStatusUpdates()
          // No additional action needed - just log for visibility
        }
      }
    }

    // Agent state service is already polling via startPolling() in onConversationChanged()
    // WebSocket subscription is already active via message-input component's subscribeToPushStatus()
    // Both will automatically receive updates for these in-progress runs
  }

  /**
   * Handle pending artifact navigation from collection
   * Opens the artifact and scrolls to the message containing it
   */
  private async handlePendingArtifactNavigation(): Promise<void> {
    if (!this.pendingArtifactId) {
      return; // No pending navigation
    }

    console.log('📦 Processing pending artifact navigation:', this.pendingArtifactId, 'v' + this.pendingArtifactVersionNumber);

    // Capture values before emitting consumed event
    const artifactIdToOpen = this.pendingArtifactId;
    const versionNumberToOpen = this.pendingArtifactVersionNumber;

    // Notify parent that we consumed the pending artifact
    this.pendingArtifactConsumed.emit();

    // Find the message containing this artifact version
    let messageIdWithArtifact: string | null = null;

    for (const [detailId, artifactList] of this.artifactsByDetailId.entries()) {
      for (const artifactInfo of artifactList) {
        if (artifactInfo.artifactId === artifactIdToOpen) {
          // Found the artifact - check if version matches (if specified)
          if (versionNumberToOpen == null || artifactInfo.versionNumber === versionNumberToOpen) {
            messageIdWithArtifact = detailId;
            console.log('✅ Found artifact in message:', detailId);
            break;
          }
        }
      }
      if (messageIdWithArtifact) break;
    }

    if (!messageIdWithArtifact) {
      console.warn('⚠️ Could not find message containing artifact:', artifactIdToOpen);
      return;
    }

    // Open the artifact panel
    this.selectedArtifactId = artifactIdToOpen;
    this.selectedVersionNumber = versionNumberToOpen ?? undefined;
    this.showArtifactPanel = true;

    // Load permissions for the artifact
    await this.loadArtifactPermissions(artifactIdToOpen);

    // Scroll to the message
    this.scrollToMessage(messageIdWithArtifact);

    console.log('✅ Opened artifact and scrolled to message:', messageIdWithArtifact);
  }

  /**
   * Scroll to a specific message in the conversation
   * @param messageId The conversation detail ID to scroll to
   */
  private scrollToMessage(messageId: string): void {
    // Wait for DOM to update, then scroll
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('📍 Scrolled to message:', messageId);
      } else {
        console.warn('⚠️ Message element not found for ID:', messageId);
      }
    }, 300); // Give time for artifact panel to open and DOM to render
  }

  /**
   * Handle intent check started - show temporary "Analyzing intent..." message
   */
  async onIntentCheckStarted(): Promise<void> {
    const md = new Metadata();
    const tempMessage = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.currentUser);

    // Create a temporary message that looks like an AI response in-progress
    tempMessage.Message = '🔍 Analyzing your request to determine the best agent...';
    tempMessage.Role = 'AI';
    tempMessage.Status = 'In-Progress';
    // Set created date using LoadFromData to bypass read-only protection
    tempMessage.LoadFromData({
      Message: tempMessage.Message,
      Role: tempMessage.Role,
      Status: tempMessage.Status,
      __mj_CreatedAt: new Date()
    });
    // No ID means it's temporary (won't be saved)

    this.intentCheckMessage = tempMessage;
    this.messages = [...this.messages, tempMessage];
    this.scrollToBottom = true;
    this.cdr.detectChanges();
  }

  /**
   * Handle intent check completed - remove temporary message
   */
  onIntentCheckCompleted(): void {
    if (this.intentCheckMessage) {
      // Remove the temporary intent check message
      this.messages = this.messages.filter(m => m !== this.intentCheckMessage);
      this.intentCheckMessage = null;
      this.cdr.detectChanges();
    }
  }
}