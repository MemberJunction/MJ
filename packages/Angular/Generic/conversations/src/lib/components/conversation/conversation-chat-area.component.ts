import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, DoCheck, ChangeDetectorRef } from '@angular/core';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { ConversationEntity, ConversationDetailEntity, AIAgentRunEntity, ConversationDetailArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ActiveTasksService } from '../../services/active-tasks.service';

@Component({
  selector: 'mj-conversation-chat-area',
  templateUrl: `./conversation-chat-area.component.html`,
  styleUrls: ['./conversation-chat-area.component.scss']
})
export class ConversationChatAreaComponent implements OnInit, OnDestroy, DoCheck {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  @Output() conversationRenamed = new EventEmitter<{conversationId: string; name: string; description: string}>();

  public messages: ConversationDetailEntity[] = [];
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
  public artifactPaneWidth: number = 40; // Default 40% width

  // Artifact mapping: ConversationDetailID -> {artifactId, versionId}
  public artifactsByDetailId = new Map<string, {artifactId: string; versionId: string}>();

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
      const rv = new RunView();

      // Load messages and agent runs in parallel
      const md = new Metadata();
      const convoDetailEntity = md.EntityByName("Conversation Details");
      const [messagesResult, agentRunsResult, conversationDetailArtifacts] = await Promise.all([
        rv.RunView<ConversationDetailEntity>(
          {
            EntityName: 'Conversation Details',
            ExtraFilter: `ConversationID='${conversationId}'`,
            OrderBy: '__mj_CreatedAt ASC', 
            ResultType: 'entity_object'
          },
          this.currentUser
        ),
        rv.RunView<AIAgentRunEntity>(
          {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ConversationID='${conversationId}'`, 
            ResultType: 'entity_object'
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

      if (messagesResult.Success) {
        const loadedMessages = messagesResult.Results || [];

        // Map AgentID and generation time from agent runs to messages
        if (agentRunsResult.Success && agentRunsResult.Results) {
          const agentRunsByDetailId = new Map<string, AIAgentRunEntity>();
          for (const run of agentRunsResult.Results) {
            if (run.ConversationDetailID) {
              agentRunsByDetailId.set(run.ConversationDetailID, run);
            }
          }

          // Populate AgentID and generation time on messages
          for (const message of loadedMessages) {
            const agentRun = agentRunsByDetailId.get(message.ID);
            if (agentRun && agentRun.AgentID) {
              (message as any).AgentID = agentRun.AgentID;

              // Calculate generation time in seconds
              if (agentRun.StartedAt && agentRun.CompletedAt) {
                const durationMs = new Date(agentRun.CompletedAt).getTime() - new Date(agentRun.StartedAt).getTime();
                (message as any).GenerationTimeSeconds = durationMs / 1000;
              }
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
            // Create map of versionId -> artifactId
            const versionToArtifact = new Map<string, string>();
            for (const version of versionsResult.Results) {
              versionToArtifact.set(version.ID, version.ArtifactID);
            }

            // Build final artifact map with both IDs
            for (const artifact of conversationDetailArtifacts.Results) {
              const artifactId = versionToArtifact.get(artifact.ArtifactVersionID);
              if (artifact.ConversationDetailID && artifactId) {
                this.artifactsByDetailId.set(artifact.ConversationDetailID, {
                  artifactId: artifactId,
                  versionId: artifact.ArtifactVersionID
                });
              }
            }
            console.log(`📦 Preloaded ${this.artifactsByDetailId.size} artifacts for conversation ${conversationId}`);
          }
        }

        // Update artifact count for header display
        this.artifactCount = conversationDetailArtifacts.Results?.length || 0;

        // Debug: Log all artifacts to console
        console.log(`📊 Artifact Count: ${this.artifactCount}`);
        console.log(`📦 Artifacts by Detail ID:`, Array.from(this.artifactsByDetailId.entries()).map(([detailId, info]) => ({
          conversationDetailId: detailId,
          artifactId: info.artifactId,
          versionId: info.versionId
        })));

        // NOW set messages to trigger rendering (after artifacts are loaded)
        this.messages = loadedMessages;
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  /**
   * Restore active tasks from the database for this conversation
   * Queries for messages with Status='In-Progress' and recreates the active task tracking
   */
  private async restoreActiveTasks(conversationId: string): Promise<void> {
    try {
      // Clear existing tasks for this conversation first
      // (We'll filter by conversation in the UI later)

      const rv = new RunView();
      const result = await rv.RunView<ConversationDetailEntity>(
        {
          EntityName: 'Conversation Details',
          ExtraFilter: `ConversationID='${conversationId}' AND Status='In-Progress'`,
          OrderBy: '__mj_CreatedAt ASC',
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success && result.Results) {
        for (const message of result.Results) {
          // Restore the task to the active tasks service
          this.activeTasks.add({
            agentName: 'Agent', // We'll need to enhance this with actual agent name from AgentRunID
            status: 'Processing...',
            relatedMessageId: message.ID,
            conversationDetailId: message.ID
          });
        }

        console.log(`✅ Restored ${result.Results.length} active tasks for conversation ${conversationId}`);
      }
    } catch (error) {
      console.error('Failed to restore active tasks:', error);
    }
  }

  onMessageSent(message: ConversationDetailEntity): void {
    // Add the new message to the list
    this.messages = [...this.messages, message];
  }

  async onAgentResponse(event: {message: ConversationDetailEntity, agentResult: any}): Promise<void> {
    // Add the agent's response message to the conversation
    this.messages = [...this.messages, event.message];
    console.log('Agent responded:', event.agentResult);

    // Reload artifact mapping for this message to pick up newly created artifacts
    await this.reloadArtifactsForMessage(event.message.ID);

    // Auto-open artifact panel if this message has an artifact and no artifact is currently shown
    if (this.artifactsByDetailId.has(event.message.ID) && !this.showArtifactPanel) {
      const artifactInfo = this.artifactsByDetailId.get(event.message.ID);
      if (artifactInfo) {
        this.selectedArtifactId = artifactInfo.artifactId;
        this.showArtifactPanel = true;
      }
    }

    // Force change detection to update the UI
    this.cdr.detectChanges();
  }

  /**
   * Reload artifacts for a specific message ID
   * Called after an artifact is created to update the UI immediately
   */
  private async reloadArtifactsForMessage(conversationDetailId: string): Promise<void> {
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

      if (artifactsResult.Success && artifactsResult.Results && artifactsResult.Results.length > 0) {
        // Load artifact versions to get ArtifactID
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
          const versionToArtifact = new Map<string, string>();
          for (const version of versionsResult.Results) {
            versionToArtifact.set(version.ID, version.ArtifactID);
          }

          // Update artifact map
          for (const artifact of artifactsResult.Results) {
            const artifactId = versionToArtifact.get(artifact.ArtifactVersionID);
            if (artifactId) {
              this.artifactsByDetailId.set(conversationDetailId, {
                artifactId: artifactId,
                versionId: artifact.ArtifactVersionID
              });
              console.log(`✅ Loaded artifact ${artifactId} for message ${conversationDetailId}`);
            }
          }

          // Update artifact count
          this.artifactCount = this.artifactsByDetailId.size;
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

  getArtifactsArray(): Array<{artifactId: string; versionId: string}> {
    return Array.from(this.artifactsByDetailId.values());
  }

  openArtifactFromModal(artifactId: string): void {
    this.selectedArtifactId = artifactId;
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
    this.showArtifactPanel = true;
  }

  onArtifactCreated(data: {conversationDetailId: string, artifactId: string; versionId: string}): void {
    this.artifactsByDetailId.set(data.conversationDetailId, {
      artifactId: data.artifactId,
      versionId: data.versionId
    });

    // if we don't already have another artifact showing, let's show the newly created one
    if (!this.showArtifactPanel) {
      this.selectedArtifactId = data.artifactId;
      this.showArtifactPanel = true;
    }

    this.artifactCount++; // increment artifact count
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
   */
  public getArtifactInfo(conversationDetailId: string): {artifactId: string; versionId: string} | undefined {
    return this.artifactsByDetailId.get(conversationDetailId);
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
}