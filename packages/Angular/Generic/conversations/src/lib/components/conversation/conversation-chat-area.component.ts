import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, DoCheck, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { UserInfo, RunView, RunQuery, Metadata, CompositeKey } from '@memberjunction/core';
import { ConversationEntity, ConversationDetailEntity, AIAgentRunEntity, AIAgentRunEntityExtended, ConversationDetailArtifactEntity, ArtifactEntity, ArtifactVersionEntity, TaskEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { ConversationDetailComplete, parseConversationDetailComplete, AgentRunJSON } from '../../models/conversation-complete-query.model';
import { MessageInputComponent } from '../message/message-input.component';
import { ArtifactViewerPanelComponent } from '@memberjunction/ng-artifacts';
import { Subject } from 'rxjs';

@Component({
  selector: 'mj-conversation-chat-area',
  templateUrl: `./conversation-chat-area.component.html`,
  styleUrls: ['./conversation-chat-area.component.scss']
})
export class ConversationChatAreaComponent implements OnInit, OnDestroy, DoCheck, AfterViewChecked {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  @Output() conversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() taskClicked = new EventEmitter<TaskEntity>();

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild(MessageInputComponent) private messageInputComponent!: MessageInputComponent;
  @ViewChild(ArtifactViewerPanelComponent) private artifactViewerComponent?: ArtifactViewerPanelComponent;

  public messages: ConversationDetailEntity[] = [];
  public showScrollToBottomIcon = false;
  private scrollToBottom = false;
  private previousConversationId: string | null = null;
  private lastLoadedConversationId: string | null = null; // Track which conversation's peripheral data was loaded
  public isProcessing: boolean = false;
  private intentCheckMessage: ConversationDetailEntity | null = null; // Temporary message shown during intent checking
  public isLoadingConversation: boolean = true; // True while loading initial conversation messages
  public memberCount: number = 1;
  public artifactCount: number = 0;
  public isShared: boolean = false;
  public showExportModal: boolean = false;
  public showAgentPanel: boolean = false;
  public showMembersModal: boolean = false;
  public showProjectSelector: boolean = false;
  public showArtifactPanel: boolean = false;
  public showArtifactsModal: boolean = false;
  public selectedArtifactId: string | null = null;
  public selectedVersionNumber: number | undefined = undefined; // Version to show in artifact viewer
  public artifactPaneWidth: number = 40; // Default 40% width
  public expandedArtifactId: string | null = null; // Track which artifact card is expanded in modal
  public showCollectionPicker: boolean = false;
  public collectionPickerArtifactId: string | null = null;
  public collectionPickerExcludedIds: string[] = [];

  // Conversation data cache: ConversationID -> Array of ConversationDetailComplete
  // Stores raw query results so we don't need to re-query when switching conversations
  private conversationDataCache = new Map<string, ConversationDetailComplete[]>();

  // Artifact mapping: ConversationDetailID -> Array of LazyArtifactInfo
  // Uses lazy-loading pattern: display data loaded immediately, full entities on-demand
  // Supports multiple artifacts per conversation detail (0-N relationship)
  public artifactsByDetailId = new Map<string, LazyArtifactInfo[]>();

  // Agent run mapping: ConversationDetailID -> AIAgentRunEntityExtended
  // Loaded once per conversation and kept in sync as new runs are created
  public agentRunsByDetailId = new Map<string, AIAgentRunEntityExtended>();

  // Timer for smooth agent run UI updates (updates every second while agent runs)
  private agentRunUpdateTimer: any = null;

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

  constructor(
    public conversationState: ConversationStateService,
    private agentStateService: AgentStateService,
    private conversationAgentService: ConversationAgentService,
    private activeTasks: ActiveTasksService,
    private cdr: ChangeDetectorRef,
    private mentionAutocompleteService: MentionAutocompleteService
  ) {}

  async ngOnInit() {
    // CRITICAL: Initialize AI Engine and mention service BEFORE loading any messages
    // This ensures agents are loaded and available for @mention parsing in existing messages
    // Without this, @mentions won't be highlighted when reloading existing conversations
    await this.mentionAutocompleteService.initialize(this.currentUser);

    // Load saved artifact pane width
    this.loadArtifactPaneWidth();

    // Mark as initialized so ngDoCheck can proceed
    this.isInitialized = true;

    // Initial load if there's already an active conversation
    if (this.conversationState.activeConversationId) {
      await this.onConversationChanged(this.conversationState.activeConversationId);
    }

    // Setup resize listeners
    window.addEventListener('mousemove', this.onResizeMove.bind(this));
    window.addEventListener('mouseup', this.onResizeEnd.bind(this));
  }

  ngDoCheck() {
    // Don't process conversation changes until initialization is complete
    // This prevents race condition where messages load before agents are ready
    if (!this.isInitialized) {
      return;
    }

    // Detect conversation ID changes using change detection
    const currentId = this.conversationState.activeConversationId;
    if (currentId !== this.previousConversationId) {
      this.previousConversationId = currentId;
      this.onConversationChanged(currentId);
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

    // Stop agent run update timer
    this.stopAgentRunUpdateTimer();

    // Remove resize listeners
    window.removeEventListener('mousemove', this.onResizeMove.bind(this));
    window.removeEventListener('mouseup', this.onResizeEnd.bind(this));
  }

  private async onConversationChanged(conversationId: string | null): Promise<void> {
    this.activeTasks.clear();

    // Hide artifact panel when conversation changes
    this.showArtifactPanel = false;
    this.selectedArtifactId = null;

    if (conversationId) {
      // Show loading state
      this.isLoadingConversation = true;
      this.messages = []; // Clear messages to avoid showing stale data
      this.cdr.detectChanges();

      try {
        await this.loadMessages(conversationId);
        await this.restoreActiveTasks(conversationId);
        this.agentStateService.startPolling(this.currentUser, conversationId);
      } finally {
        // Hide loading state
        this.isLoadingConversation = false;
        this.cdr.detectChanges();
      }
    } else {
      this.messages = [];
      this.isLoadingConversation = false;
    }
  }

  private async loadMessages(conversationId: string): Promise<void> {
    try {
      // Check if we have cached data for this conversation
      const cachedData = this.conversationDataCache.get(conversationId);

      if (cachedData) {
        // Use cached data - instant load!
        console.log(`📦 Loading conversation ${conversationId} from cache - instant!`);
        this.buildMessagesFromCache(cachedData);
        this.loadPeripheralData(conversationId); // Process cached data for maps
      } else {
        // Load from database with single optimized query
        console.log(`🔍 Loading conversation ${conversationId} from database - single query`);
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

        // Cache the raw results for future use
        const conversationData = result.Results as ConversationDetailComplete[];
        this.conversationDataCache.set(conversationId, conversationData);
        console.log(`💾 Cached ${conversationData.length} conversation details for conversation ${conversationId}`);

        // Build messages and show immediately
        this.buildMessagesFromCache(conversationData);

        // Process peripheral data (agent runs & artifacts) in background
        this.isLoadingPeripheralData = true;
        this.loadPeripheralData(conversationId).finally(() => {
          this.isLoadingPeripheralData = false;
          this.cdr.detectChanges();
        });
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      this.messages = [];
    }
  }

  /**
   * Build message entities from cached conversation data
   * Creates ConversationDetailEntity objects from the raw query results
   */
  private async buildMessagesFromCache(conversationData: ConversationDetailComplete[]): Promise<void> {
    const md = new Metadata();
    const messages: ConversationDetailEntity[] = [];

    for (const row of conversationData) {
      if (!row.ID) continue;

      // Create entity object and load from raw data
      const message = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', this.currentUser);

      // LoadFromData expects the same structure as the query result
      // Since we're using SELECT *, all fields should be present
      message.LoadFromData(row);

      messages.push(message);
    }

    this.messages = messages;
    this.scrollToBottom = true;
    this.cdr.detectChanges(); // Show messages immediately
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
      console.log(`[${timestamp}] ⏭️ Skipping peripheral data processing - already processed for conversation ${conversationId}`);
      return;
    }

    // Mark this conversation as processed to prevent duplicate processing
    this.lastLoadedConversationId = conversationId;
    console.log(`[${timestamp}] 📊 Processing peripheral data for conversation ${conversationId} from cache`);

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
            __mj_CreatedAt: new Date(agentRunData.__mj_CreatedAt),
            __mj_UpdatedAt: new Date(agentRunData.__mj_UpdatedAt),
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

          for (const artifactData of parsed.artifacts) {
            // Create LazyArtifactInfo with display data from query
            // Full entities will be loaded on-demand when artifact is clicked
            const lazyInfo = new LazyArtifactInfo(artifactData, this.currentUser);
            artifactList.push(lazyInfo);
          }

          this.artifactsByDetailId.set(row.ID, artifactList);
        }
      }

      // Create new Map references to trigger Angular change detection
      this.agentRunsByDetailId = new Map(this.agentRunsByDetailId);
      this.artifactsByDetailId = new Map(this.artifactsByDetailId);

      // Update artifact count for header display (unique artifacts, not versions)
      this.artifactCount = this.calculateUniqueArtifactCount();

      // Debug: Log summary
      console.log(`📊 Processed ${this.agentRunsByDetailId.size} agent runs, ${this.artifactsByDetailId.size} artifact mappings (${this.artifactCount} unique artifacts)`);

      // CRITICAL: Trigger message re-render now that agent runs and artifacts are loaded
      // This updates all message components with the newly loaded agent run data
      this.messages = [...this.messages]; // Create new array reference to trigger change detection
      this.cdr.detectChanges();

      console.log(`✅ Peripheral data processed successfully for conversation ${conversationId} from cache`);
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

  onMessageSent(message: ConversationDetailEntity): void {
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
    }

    // Scroll to bottom when new message is sent
    this.scrollToBottom = true;
  }

  /**
   * Handle agent run detected event from progress updates
   * This is called when the first progress update arrives with an agent run ID
   */
  async onAgentRunDetected(event: {conversationDetailId: string; agentRunId: string}): Promise<void> {
    await this.addAgentRunToMap(event.conversationDetailId, event.agentRunId);
  }

  /**
   * Handle agent run update event from progress updates
   * This is called on EVERY progress update with the full, live agent run object
   * Provides real-time updates of status, timestamps, tokens, cost during execution
   */
  onAgentRunUpdate(event: {conversationDetailId: string; agentRun: AIAgentRunEntityExtended}): void {
    // Directly update map with fresh data from progress (no database query needed)
    this.agentRunsByDetailId.set(event.conversationDetailId, event.agentRun);

    // Create new Map reference to trigger Angular change detection
    this.agentRunsByDetailId = new Map(this.agentRunsByDetailId);

    // Force message list to re-render with updated agent run
    // This ensures message components receive the fresh agent run data
    this.messages = [...this.messages];
    this.cdr.detectChanges();

    console.log(`🔄 Agent run updated for detail ${event.conversationDetailId}, Status: ${event.agentRun.Status}`);

    // Start 1-second update timer for smooth UI updates (if not already running)
    this.startAgentRunUpdateTimer();

    // If agent completed or failed, stop the timer
    const status = event.agentRun.Status?.toLowerCase();
    if (status === 'complete' || status === 'completed' || status === 'failed' || status === 'error') {
      this.stopAgentRunUpdateTimer();
    }
  }

  /**
   * Start 1-second timer for smooth agent run UI updates
   * Updates the message list every second to keep elapsed times current
   */
  private startAgentRunUpdateTimer(): void {
    // Don't start if already running
    if (this.agentRunUpdateTimer !== null) {
      return;
    }

    console.log('⏱️ Starting agent run update timer (1-second interval)');
    this.agentRunUpdateTimer = setInterval(() => {
      // Check if we have any active agent runs
      let hasActiveRuns = false;
      for (const agentRun of this.agentRunsByDetailId.values()) {
        const status = agentRun.Status?.toLowerCase();
        if (status === 'in-progress' || status === 'running') {
          hasActiveRuns = true;
          break;
        }
      }

      if (hasActiveRuns) {
        // Force message list to re-render so timers update
        this.messages = [...this.messages];
        this.cdr.detectChanges();
      } else {
        // No active runs, stop the timer
        this.stopAgentRunUpdateTimer();
      }
    }, 1000);
  }

  /**
   * Stop the agent run update timer
   */
  private stopAgentRunUpdateTimer(): void {
    if (this.agentRunUpdateTimer !== null) {
      console.log('⏹️ Stopping agent run update timer');
      clearInterval(this.agentRunUpdateTimer);
      this.agentRunUpdateTimer = null;
    }
  }

  async onAgentResponse(event: {message: ConversationDetailEntity, agentResult: any}): Promise<void> {
    // Add the agent's response message to the conversation
    this.messages = [...this.messages, event.message];

    // Invalidate cache for this conversation since we have new messages
    const conversationId = this.conversationState.activeConversationId;
    if (conversationId) {
      this.invalidateConversationCache(conversationId);
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
    console.log(`🗑️ Invalidated cache for conversation ${conversationId}`);
  }

  /**
   * Add or update an agent run in the map
   * Called when a new agent run completes to keep the map in sync
   * @param forceRefresh If true, always reload from database even if already in map (used when status changes)
   */
  private async addAgentRunToMap(conversationDetailId: string, agentRunId: string, forceRefresh: boolean = false): Promise<void> {
    try {
      // Always refresh if forced, or if not in map yet
      if (forceRefresh || !this.agentRunsByDetailId.has(conversationDetailId)) {
        const md = new Metadata();
        const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', this.currentUser);
        if (await agentRun.Load(agentRunId)) {
          this.agentRunsByDetailId.set(conversationDetailId, agentRun);

          // Create new Map reference to trigger Angular change detection
          this.agentRunsByDetailId = new Map(this.agentRunsByDetailId);

          // Force message list to re-render with updated agent run
          this.messages = [...this.messages];
          this.cdr.detectChanges();

          console.log(`✅ Agent run ${forceRefresh ? 'refreshed' : 'added'} in map for detail ${conversationDetailId}, Status: ${agentRun.Status}`);
        }
      } else {
        console.log(`⏭️ Agent run for detail ${conversationDetailId} already in map, skipping load`);
      }
    } catch (error) {
      console.error('Failed to load agent run for map:', error);
    }
  }

  /**
   * Reload artifacts for a specific message ID
   * Called after an artifact is created to update the UI immediately
   * Invalidates and refreshes the conversation cache
   */
  private async reloadArtifactsForMessage(conversationDetailId: string): Promise<void> {
    console.log(`🔄 Reloading artifacts for message ${conversationDetailId}`);
    try {
      const rq = new RunQuery();
      const md = new Metadata();

      // Get the ConversationID for this detail
      const detail = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', this.currentUser);
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

      console.log(`📊 Query result: ${result.Results.length} conversation details loaded`);

      // Update cache with fresh data
      const conversationData = result.Results as ConversationDetailComplete[];
      this.conversationDataCache.set(detail.ConversationID, conversationData);

      // Find the specific conversation detail we're reloading and update its artifacts
      for (const row of conversationData) {
        if (row.ID === conversationDetailId) {
          const parsed = parseConversationDetailComplete(row);

          // Clear existing artifacts for this detail and rebuild
          this.artifactsByDetailId.delete(conversationDetailId);

          if (parsed.artifacts.length > 0) {
            const artifactList: LazyArtifactInfo[] = [];
            for (const artifactData of parsed.artifacts) {
              const lazyInfo = new LazyArtifactInfo(artifactData, this.currentUser);
              artifactList.push(lazyInfo);
              console.log(`✅ Loaded artifact ${artifactData.ArtifactID} v${artifactData.VersionNumber} for message ${conversationDetailId}`);
            }
            this.artifactsByDetailId.set(conversationDetailId, artifactList);
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
   * Get unique artifacts grouped by artifact ID (not by conversation detail)
   * Returns the latest version info for each unique artifact with all versions
   * Works with LazyArtifactInfo - uses display data without loading full entities
   */
  getArtifactsArray(): Array<{
    artifactId: string;
    versionId: string;
    name: string;
    versionCount: number;
    versions: Array<{versionId: string; versionNumber: number}>
  }> {
    const artifactMap = new Map<string, {
      artifactId: string;
      versionId: string;
      name: string;
      versions: Array<{versionId: string; versionNumber: number}>
    }>();

    // Group by artifactId, collecting all version details
    for (const artifactList of this.artifactsByDetailId.values()) {
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
      versionCount: item.versions.length,
      versions: item.versions.sort((a, b) => b.versionNumber - a.versionNumber)
    }));
  }

  toggleArtifactExpansion(artifactId: string, event: Event): void {
    event.stopPropagation(); // Prevent opening artifact when clicking expand button
    this.expandedArtifactId = this.expandedArtifactId === artifactId ? null : artifactId;
  }

  openArtifactFromModal(artifactId: string, versionNumber?: number): void {
    this.selectedArtifactId = artifactId;
    this.selectedVersionNumber = versionNumber;
    this.showArtifactPanel = true;
    this.showArtifactsModal = false;
  }

  exportConversation(): void {
    if (this.conversationState.activeConversation) {
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
    const activeConv = this.conversationState.activeConversation;
    if (activeConv && project) {
      try {
        await this.conversationState.saveConversation(
          activeConv.ID,
          { ProjectID: project.ID },
          this.currentUser
        );
        this.showProjectSelector = false;
      } catch (error) {
        console.error('Failed to assign project:', error);
      }
    } else if (activeConv && !project) {
      // Remove project assignment
      try {
        await this.conversationState.saveConversation(
          activeConv.ID,
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
    console.log('Share conversation');
  }

  onReplyInThread(message: ConversationDetailEntity): void {
    // Open thread panel for this message
    this.conversationState.openThread(message.ID);
  }

  onViewThread(message: ConversationDetailEntity): void {
    // Open thread panel for this message
    this.conversationState.openThread(message.ID);
  }

  onThreadClosed(): void {
    // Close the thread panel
    this.conversationState.closeThread();
  }

  onThreadReplyAdded(reply: ConversationDetailEntity): void {
    // Optionally refresh the message list to update thread counts
    // For now, we'll just log it
    console.log('Thread reply added:', reply);

    // Reload messages to get updated thread counts
    const activeConv = this.conversationState.activeConversation;
    if (activeConv) {
      this.loadMessages(activeConv.ID);
    }
  }

  onToggleAgentPanel(): void {
    this.showAgentPanel = !this.showAgentPanel;
    // The agent panel component handles its own visibility
    // This could be used to toggle a modal or different view
  }

  onAgentSelected(agentRun: AIAgentRunEntity): void {
    // When an agent is clicked in the indicator, could show details
    console.log('Agent selected:', agentRun.ID);
    // Could open a modal or navigate to agent details
  }

  onMessageEdited(message: ConversationDetailEntity): void {
    // Message was edited and saved, trigger change detection
    console.log('Message edited:', message.ID);
    // The message entity is already updated in place, so no need to reload
    // Just ensure the UI reflects the changes
  }

  /**
   * Handle suggested response selection from user
   * Sends the selected response as a new user message WITHOUT modifying the visible input
   */
  async onSuggestedResponseSelected(event: {text: string; customInput?: string}): Promise<void> {
    const messageText = event.customInput || event.text;

    if (this.messageInputComponent) {
      await this.messageInputComponent.sendMessageWithText(messageText);
    } else {
      console.error('MessageInputComponent not available');
    }
  }

  onRetryMessage(message: ConversationDetailEntity): void {
    // TODO: Implement retry logic
    // This should find the parent user message and re-trigger the agent invocation
    console.log('Retry requested for message:', message.ID);
    // For now, just log it - full implementation would require refactoring agent invocation
  }

  onArtifactClicked(data: {artifactId: string; versionId?: string}): void {
    this.selectedArtifactId = data.artifactId;

    // If versionId is provided, find the version number from display data (no lazy load needed)
    if (data.versionId) {
      for (const [detailId, artifactList] of this.artifactsByDetailId.entries()) {
        for (const artifactInfo of artifactList) {
          if (artifactInfo.artifactVersionId === data.versionId) {
            this.selectedVersionNumber = artifactInfo.versionNumber;
            console.log(`📦 Opening artifact viewer for v${this.selectedVersionNumber}`);
            break;
          }
        }
      }
    } else {
      // No specific version, let viewer default to latest
      this.selectedVersionNumber = undefined;
    }

    this.showArtifactPanel = true;
  }

  async onArtifactCreated(data: {conversationDetailId: string, artifactId: string; versionId: string; versionNumber: number; name: string}): Promise<void> {
    // Reload artifacts to get full entities
    await this.reloadArtifactsForMessage(data.conversationDetailId);

    // if we don't already have another artifact showing, let's show the newly created one
    if (!this.showArtifactPanel) {
      this.selectedArtifactId = data.artifactId;
      this.showArtifactPanel = true;
    }

    // If artifact viewer is already open for this artifact, trigger refresh to show new version
    if (this.showArtifactPanel && this.selectedArtifactId === data.artifactId) {
      // Emit event to refresh artifact viewer with new version
      this.artifactViewerRefresh$.next({artifactId: data.artifactId, versionNumber: data.versionNumber});
    }

    // Force change detection to update the UI immediately
    this.cdr.detectChanges();
  }

  onCloseArtifactPanel(): void {
    this.showArtifactPanel = false;
    this.selectedArtifactId = null;
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
    console.log('🎉 Conversation renamed:', event);
    // Pass the event up to workspace component for animation
    this.conversationRenamed.emit(event);
  }

  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    // Pass the event up to the parent component (workspace or explorer wrapper)
    this.openEntityRecord.emit(event);
  }

  onTaskClicked(task: TaskEntity): void {
    // Pass task click up to workspace to navigate to Tasks tab
    this.taskClicked.emit(task);
  }

  // Scroll functionality (pattern from skip-chat)
  checkScroll(): void {
    if (!this.scrollContainer) return;

    const element = this.scrollContainer.nativeElement;
    const buffer = 15; // Tolerance in pixels
    const scrollDifference = element.scrollHeight - (element.scrollTop + element.clientHeight);
    const hasScrollableContent = element.scrollHeight > element.clientHeight + 50;
    const atBottom = scrollDifference <= buffer;

    this.showScrollToBottomIcon = !atBottom && hasScrollableContent;
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
   * Handle intent check started - show temporary "Analyzing intent..." message
   */
  async onIntentCheckStarted(): Promise<void> {
    const md = new Metadata();
    const tempMessage = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', this.currentUser);

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