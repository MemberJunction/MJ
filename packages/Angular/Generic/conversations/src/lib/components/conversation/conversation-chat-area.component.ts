import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, DoCheck, ChangeDetectorRef, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { UserInfo, RunView, Metadata, CompositeKey } from '@memberjunction/core';
import { ConversationEntity, ConversationDetailEntity, AIAgentRunEntity, AIAgentRunEntityExtended, ConversationDetailArtifactEntity, ArtifactEntity, ArtifactVersionEntity, TaskEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { DataCacheService } from '../../services/data-cache.service';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
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

  public messages: ConversationDetailEntity[] = [];
  public showScrollToBottomIcon = false;
  private scrollToBottom = false;
  private previousConversationId: string | null = null;
  public isProcessing: boolean = false;
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

  // Artifact mapping: ConversationDetailID -> Array of {artifact, version}
  // Full entities loaded once and reused across all message components
  // Supports multiple artifacts per conversation detail (0-N relationship)
  public artifactsByDetailId = new Map<string, Array<{
    artifact: ArtifactEntity;
    version: ArtifactVersionEntity;
  }>>();

  // Agent run mapping: ConversationDetailID -> AIAgentRunEntityExtended
  // Loaded once per conversation and kept in sync as new runs are created
  public agentRunsByDetailId = new Map<string, AIAgentRunEntityExtended>();

  // Loading state for peripheral data
  public isLoadingPeripheralData: boolean = false;

  // Subject to trigger artifact viewer refresh when new version is created
  public artifactViewerRefresh$ = new Subject<{artifactId: string; versionNumber: number}>();

  // Resize state
  private isResizing: boolean = false;
  private startX: number = 0;
  private startWidth: number = 0;

  // LocalStorage key
  private readonly ARTIFACT_PANE_WIDTH_KEY = 'mj-conversations-artifact-pane-width';

  constructor(
    public conversationState: ConversationStateService,
    private dataCache: DataCacheService,
    private agentStateService: AgentStateService,
    private conversationAgentService: ConversationAgentService,
    private activeTasks: ActiveTasksService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Load saved artifact pane width
    this.loadArtifactPaneWidth();

    // Initial load if there's already an active conversation
    if (this.conversationState.activeConversationId) {
      this.onConversationChanged(this.conversationState.activeConversationId);
    }

    // Setup resize listeners
    window.addEventListener('mousemove', this.onResizeMove.bind(this));
    window.addEventListener('mouseup', this.onResizeEnd.bind(this));
  }

  ngDoCheck() {
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
      await this.loadMessages(conversationId);
      await this.restoreActiveTasks(conversationId);
      this.agentStateService.startPolling(this.currentUser, conversationId);
    } else {
      this.messages = [];
    }
  }

  private async loadMessages(conversationId: string): Promise<void> {
    try {
      // PHASE 1: Load messages from cache (fast, shows content immediately)
      // The cache will load from DB if not already cached
      const loadedMessages = await this.dataCache.loadConversationDetails(conversationId, this.currentUser);

      this.messages = loadedMessages;
      this.scrollToBottom = true;
      this.cdr.detectChanges(); // Show messages immediately

      // PHASE 2: Load peripheral data in background (agent runs & artifacts)
      this.isLoadingPeripheralData = true;
      this.loadPeripheralData(conversationId).finally(() => {
        this.isLoadingPeripheralData = false;
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error loading messages:', error);
      this.messages = [];
    }
  }

  /**
   * Load peripheral data (agent runs and artifacts) in background
   * This allows messages to display immediately while slower queries complete
   */
  private async loadPeripheralData(conversationId: string): Promise<void> {
    try {
      const rv = new RunView();
      const md = new Metadata();
      const convoDetailEntity = md.EntityByName("Conversation Details");

      // Load agent runs and artifacts in parallel
      const [agentRunsResult, conversationDetailArtifacts] = await Promise.all([
        rv.RunView<AIAgentRunEntityExtended>(
          {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ConversationDetailID IN (SELECT ID FROM [${convoDetailEntity.SchemaName}].[${convoDetailEntity.BaseView}] WHERE ConversationID='${conversationId}')`,
            ResultType: 'entity_object',
            // Only fetch fields we actually display to reduce payload size
            Fields: ['ID', 'AgentID', 'Agent', 'Status', '__mj_CreatedAt', '__mj_UpdatedAt', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalCost', 'ConversationDetailID']
          },
          this.currentUser
        ),
        rv.RunView<ConversationDetailArtifactEntity>(
          {
            EntityName: 'MJ: Conversation Detail Artifacts',
            ExtraFilter: `ConversationDetailID IN (SELECT ID FROM [${convoDetailEntity.SchemaName}].[${convoDetailEntity.BaseView}] WHERE ConversationID='${conversationId}') AND Direction='Output'`,
            ResultType: 'entity_object'
          },
          this.currentUser
        )
      ]);

      // Build agent runs map - single query loads all runs for this conversation
      this.agentRunsByDetailId.clear();
      if (agentRunsResult.Success && agentRunsResult.Results) {
        for (const run of agentRunsResult.Results) {
          if (run.ConversationDetailID) {
            this.agentRunsByDetailId.set(run.ConversationDetailID, run);
          }
        }
      }

      // Build artifact map from preloaded artifacts
      this.artifactsByDetailId.clear();
      if (conversationDetailArtifacts.Success && conversationDetailArtifacts.Results && conversationDetailArtifacts.Results.length > 0) {
        // Load artifact versions to get ArtifactID
        const versionIds = conversationDetailArtifacts.Results.map(a => `'${a.ArtifactVersionID}'`).join(',');
        const versionsResult = await rv.RunView<ArtifactVersionEntity>(
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${versionIds})`,
            ResultType: 'entity_object'
          },
          this.currentUser
        );

        if (versionsResult.Success && versionsResult.Results) {
          // Get all unique artifact IDs
          const artifactIds = [...new Set(versionsResult.Results.map(v => v.ArtifactID))];

          // Load full artifact entities
          const artifactsResult = await rv.RunView<ArtifactEntity>({
            EntityName: 'MJ: Artifacts',
            ExtraFilter: `ID IN (${artifactIds.map(id => `'${id}'`).join(',')})`,
            ResultType: 'entity_object'
          }, this.currentUser);

          // Create maps of entities by ID for fast lookup
          const artifactEntities = new Map<string, ArtifactEntity>();
          const versionEntities = new Map<string, ArtifactVersionEntity>();

          if (artifactsResult.Success && artifactsResult.Results) {
            for (const artifact of artifactsResult.Results) {
              artifactEntities.set(artifact.ID, artifact);
            }
          }

          for (const version of versionsResult.Results) {
            versionEntities.set(version.ID, version);
          }

          // Build final artifact map with FULL entities
          // Group artifacts by ConversationDetailID (supports multiple artifacts per detail)
          for (const junctionRecord of conversationDetailArtifacts.Results) {
            const version = versionEntities.get(junctionRecord.ArtifactVersionID);
            const artifact = version ? artifactEntities.get(version.ArtifactID) : undefined;

            if (junctionRecord.ConversationDetailID && version && artifact) {
              const existing = this.artifactsByDetailId.get(junctionRecord.ConversationDetailID) || [];
              existing.push({
                artifact: artifact,      // Full ArtifactEntity
                version: version         // Full ArtifactVersionEntity
              });
              this.artifactsByDetailId.set(junctionRecord.ConversationDetailID, existing);
            }
          }

          // Create new Map reference to trigger Angular change detection
          this.artifactsByDetailId = new Map(this.artifactsByDetailId);

          console.log(`📦 Preloaded ${this.artifactsByDetailId.size} artifacts for conversation ${conversationId}`);
        }
      }

      // Update artifact count for header display (unique artifacts, not versions)
      this.artifactCount = this.calculateUniqueArtifactCount();

      // Debug: Log all artifacts to console
      console.log(`📊 Artifact Count: ${this.artifactCount}`);
      console.log(`📦 Artifacts by Detail ID:`, Array.from(this.artifactsByDetailId.entries()).flatMap(([detailId, artifactList]) =>
        artifactList.map(info => ({
          conversationDetailId: detailId,
          artifactId: info.artifact.ID,
          artifactName: info.artifact.Name,
          versionId: info.version.ID,
          versionNumber: info.version.VersionNumber
        }))
      ));

      // CRITICAL: Trigger message re-render now that agent runs and artifacts are loaded
      // This updates all message components with the newly loaded agent run data
      this.messages = [...this.messages]; // Create new array reference to trigger change detection
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to load peripheral data:', error);
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
    // Add the new message to the list
    this.messages = [...this.messages, message];

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

  async onAgentResponse(event: {message: ConversationDetailEntity, agentResult: any}): Promise<void> {
    // Add the agent's response message to the conversation
    this.messages = [...this.messages, event.message];

    // Scroll to bottom when agent responds
    this.scrollToBottom = true;

    // Add agent run to the map if present (fallback if not already loaded from progress)
    // agentResult is ExecuteAgentResult which contains agentRun property
    if (event.agentResult?.agentRun?.ID) {
      // Only load if not already in map (progress update may have already loaded it)
      if (!this.agentRunsByDetailId.has(event.message.ID)) {
        await this.addAgentRunToMap(event.message.ID, event.agentResult.agentRun.ID);
      }
    }

    // Reload artifact mapping for this message to pick up newly created artifacts
    await this.reloadArtifactsForMessage(event.message.ID);

    // Auto-open artifact panel if this message has artifacts and no artifact is currently shown
    if (this.artifactsByDetailId.has(event.message.ID) && !this.showArtifactPanel) {
      const artifactList = this.artifactsByDetailId.get(event.message.ID);
      if (artifactList && artifactList.length > 0) {
        // Show the first (or most recent) artifact
        this.selectedArtifactId = artifactList[0].artifact.ID;
        this.showArtifactPanel = true;
      }
    }

    // Force change detection to update the UI
    this.cdr.detectChanges();
  }

  /**
   * Add or update an agent run in the map
   * Called when a new agent run completes to keep the map in sync
   */
  private async addAgentRunToMap(conversationDetailId: string, agentRunId: string): Promise<void> {
    try {
      const md = new Metadata();
      const agentRun = await md.GetEntityObject<AIAgentRunEntityExtended>('MJ: AI Agent Runs', this.currentUser);
      if (await agentRun.Load(agentRunId)) {
        this.agentRunsByDetailId.set(conversationDetailId, agentRun);
      }
    } catch (error) {
      console.error('Failed to load agent run for map:', error);
    }
  }

  /**
   * Reload artifacts for a specific message ID
   * Called after an artifact is created to update the UI immediately
   */
  private async reloadArtifactsForMessage(conversationDetailId: string): Promise<void> {
    console.log(`🔄 Reloading artifacts for message ${conversationDetailId}`);
    try {
      const rv = new RunView();
      const artifactsResult = await rv.RunView<ConversationDetailArtifactEntity>(
        {
          EntityName: 'MJ: Conversation Detail Artifacts',
          ExtraFilter: `ConversationDetailID='${conversationDetailId}' AND Direction='Output'`,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      console.log(`📊 Junction query result:`, {
        success: artifactsResult.Success,
        count: artifactsResult.Results?.length || 0,
        error: artifactsResult.ErrorMessage
      });

      if (artifactsResult.Success && artifactsResult.Results && artifactsResult.Results.length > 0) {
        // Load full artifact versions and artifacts
        const versionIds = artifactsResult.Results.map(a => `'${a.ArtifactVersionID}'`).join(',');
        const versionsResult = await rv.RunView<ArtifactVersionEntity>(
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${versionIds})`,
            ResultType: 'entity_object'
          },
          this.currentUser
        );

        if (versionsResult.Success && versionsResult.Results) {
          // Load full artifact entities
          const artifactIds = versionsResult.Results.map(v => `'${v.ArtifactID}'`).join(',');
          const fullArtifactsResult = await rv.RunView<ArtifactEntity>(
            {
              EntityName: 'MJ: Artifacts',
              ExtraFilter: `ID IN (${artifactIds})`,
              ResultType: 'entity_object'
            },
            this.currentUser
          );

          if (fullArtifactsResult.Success && fullArtifactsResult.Results) {
            // Create maps for fast lookup
            const artifactEntities = new Map<string, ArtifactEntity>();
            const versionEntities = new Map<string, ArtifactVersionEntity>();

            for (const artifact of fullArtifactsResult.Results) {
              artifactEntities.set(artifact.ID, artifact);
            }

            for (const version of versionsResult.Results) {
              versionEntities.set(version.ID, version);
            }

            // Update artifact map with full entities (supports multiple artifacts per detail)
            const artifactList: Array<{artifact: ArtifactEntity; version: ArtifactVersionEntity}> = [];
            for (const junctionRecord of artifactsResult.Results) {
              const version = versionEntities.get(junctionRecord.ArtifactVersionID);
              const artifact = version ? artifactEntities.get(version.ArtifactID) : undefined;

              if (version && artifact) {
                artifactList.push({
                  artifact: artifact,
                  version: version
                });
                console.log(`✅ Loaded artifact ${artifact.ID} v${version.VersionNumber} for message ${conversationDetailId}`);
              }
            }
            if (artifactList.length > 0) {
              this.artifactsByDetailId.set(conversationDetailId, artifactList);
            }

            // Create new Map reference to trigger Angular change detection
            this.artifactsByDetailId = new Map(this.artifactsByDetailId);

            // Update artifact count
            this.artifactCount = this.calculateUniqueArtifactCount();
          }
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
   */
  private calculateUniqueArtifactCount(): number {
    const uniqueArtifactIds = new Set<string>();
    for (const artifactList of this.artifactsByDetailId.values()) {
      for (const info of artifactList) {
        uniqueArtifactIds.add(info.artifact.ID);
      }
    }
    return uniqueArtifactIds.size;
  }

  /**
   * Get unique artifacts grouped by artifact ID (not by conversation detail)
   * Returns the latest version info for each unique artifact with all versions
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
        const artifactId = info.artifact.ID;
        const versionId = info.version.ID;
        const versionNumber = info.version.VersionNumber || 1;
        const name = info.version.Name || info.artifact.Name || 'Untitled';

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

  onRetryMessage(message: ConversationDetailEntity): void {
    // TODO: Implement retry logic
    // This should find the parent user message and re-trigger the agent invocation
    console.log('Retry requested for message:', message.ID);
    // For now, just log it - full implementation would require refactoring agent invocation
  }

  onArtifactClicked(data: {artifactId: string; versionId?: string}): void {
    this.selectedArtifactId = data.artifactId;

    // If versionId is provided, find the version number
    if (data.versionId) {
      for (const [detailId, artifactList] of this.artifactsByDetailId.entries()) {
        for (const artifactInfo of artifactList) {
          if (artifactInfo.version.ID === data.versionId) {
            this.selectedVersionNumber = artifactInfo.version.VersionNumber;
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

  /**
   * Helper method to check if a conversation detail has an artifact
   * Used by message components to determine whether to show artifact card
   */
  public conversationDetailHasArtifact(conversationDetailId: string): boolean {
    return this.artifactsByDetailId.has(conversationDetailId);
  }

  /**
   * Get artifact info for a conversation detail
   * Returns the first artifact if multiple exist (for backward compatibility with message display)
   */
  public getArtifactInfo(conversationDetailId: string): {artifact: ArtifactEntity; version: ArtifactVersionEntity} | undefined {
    const artifactList = this.artifactsByDetailId.get(conversationDetailId);
    return artifactList && artifactList.length > 0 ? artifactList[0] : undefined;
  }

  /**
   * Get ALL artifacts for a conversation detail
   * Use this when you need to display all artifacts (e.g., in a list)
   */
  public getAllArtifactsForDetail(conversationDetailId: string): Array<{artifact: ArtifactEntity; version: ArtifactVersionEntity}> {
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
}