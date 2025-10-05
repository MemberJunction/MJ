import { Component, Input, OnInit, OnDestroy, DoCheck } from '@angular/core';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { ConversationEntity, ConversationDetailEntity, AIAgentRunEntity, ConversationDetailArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { ActiveTasksService } from '../../services/active-tasks.service';

@Component({
  selector: 'mj-conversation-chat-area',
  template: `
    <div class="chat-area">
      <!-- Fixed Header -->
      <div class="chat-header" *ngIf="conversationState.activeConversation as conversation">
        <div class="chat-info">
          <div class="chat-title">{{ conversation.Name }}</div>
          <button class="project-tag" (click)="openProjectSelector()" title="Assign to project" *ngIf="conversation.ProjectID">
            <i class="fas fa-folder"></i>
            <span>{{ conversation.Project || 'Project' }}</span>
          </button>
          <button class="chat-members" (click)="toggleMembersModal()" title="View members">
            <i class="fas fa-users"></i>
            <span>{{ memberCount }} member{{ memberCount !== 1 ? 's' : '' }}</span>
          </button>
          <button class="artifact-indicator" (click)="viewArtifacts()" title="View artifacts" *ngIf="artifactCount > 0">
            <i class="fas fa-cube"></i>
            <span>{{ artifactCount }} artifact{{ artifactCount !== 1 ? 's' : '' }}</span>
          </button>
          <mj-tasks-dropdown [currentUser]="currentUser"></mj-tasks-dropdown>
          <mj-active-agent-indicator
            [conversationId]="conversationState.activeConversation.ID"
            [currentUser]="currentUser"
            (togglePanel)="onToggleAgentPanel()"
            (agentSelected)="onAgentSelected($event)">
          </mj-active-agent-indicator>
        </div>
        <div class="chat-actions">
          <button class="action-btn" (click)="exportConversation()" title="Export conversation">
            <i class="fas fa-download"></i>
            Export
          </button>
          <button class="action-btn share-btn"
                  [class.shared]="isShared"
                  (click)="shareConversation()"
                  [title]="isShared ? 'Manage sharing' : 'Share conversation'">
            <i class="fas fa-share-nodes"></i>
            Share
          </button>
        </div>
      </div>

      <!-- Messages and Artifact Splitter -->
      <div class="chat-content-area">
        <kendo-splitter orientation="horizontal">
          <!-- Messages Pane -->
          <kendo-splitter-pane
            [size]="showArtifactPanel ? '60%' : '100%'"
            [min]="'300px'"
            [resizable]="showArtifactPanel"
            [collapsible]="false">
            <div class="chat-messages-wrapper">
              <div class="chat-messages-container">
                <mj-conversation-message-list
                  [messages]="messages"
                  [conversation]="conversationState.activeConversation"
                  [currentUser]="currentUser"
                  [isProcessing]="isProcessing"
                  [artifactMap]="artifactsByDetailId"
                  (replyInThread)="onReplyInThread($event)"
                  (viewThread)="onViewThread($event)"
                  (retryMessage)="onRetryMessage($event)"
                  (artifactClicked)="onArtifactClicked($event)"
                  (messageEdited)="onMessageEdited($event)">
                </mj-conversation-message-list>
              </div>

              <!-- Fixed Input Area -->
              <div class="chat-input-container">
                <mj-message-input
                  *ngIf="conversationState.activeConversation"
                  [conversationId]="conversationState.activeConversation.ID"
                  [currentUser]="currentUser"
                  [conversationHistory]="messages"
                  [disabled]="isProcessing"
                  (messageSent)="onMessageSent($event)"
                  (agentResponse)="onAgentResponse($event)">
                </mj-message-input>
              </div>
            </div>
          </kendo-splitter-pane>
        </kendo-splitter>

          <!-- Artifact Viewer Pane -->
          @if (showArtifactPanel && selectedArtifactId) {
            <kendo-splitter-pane
              [min]="'300px'"
              [resizable]="true"
              [collapsible]="false">
              <mj-artifact-viewer-panel
                [artifactId]="selectedArtifactId"
                [currentUser]="currentUser">
              </mj-artifact-viewer-panel>
            </kendo-splitter-pane>
          }
      </div>
    </div>

    <!-- Thread Panel -->
    @if (conversationState.activeThreadId) {
      <mj-thread-panel
        [parentMessageId]="conversationState.activeThreadId"
        [conversationId]="conversationState.activeConversation?.ID || ''"
        [currentUser]="currentUser"
        (closed)="onThreadClosed()"
        (replyAdded)="onThreadReplyAdded($event)">
      </mj-thread-panel>
    }

    <!-- Export Modal -->
    <mj-export-modal
      [isVisible]="showExportModal"
      [conversation]="conversationState.activeConversation || undefined"
      [currentUser]="currentUser"
      (cancelled)="onExportModalCancelled()"
      (exported)="onExportModalComplete()">
    </mj-export-modal>

    <!-- Members Modal -->
    <mj-members-modal
      [isVisible]="showMembersModal"
      [conversation]="conversationState.activeConversation || undefined"
      [currentUser]="currentUser"
      (cancelled)="showMembersModal = false"
      (membersChanged)="showMembersModal = false">
    </mj-members-modal>

    <!-- Project Selector Modal -->
    @if (showProjectSelector && conversationState.activeConversation) {
      <div class="modal-overlay" (click)="showProjectSelector = false">
        <div class="modal-content project-selector-modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Assign Project</h3>
            <button class="modal-close-btn" (click)="showProjectSelector = false">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <mj-project-selector
              [environmentId]="environmentId"
              [currentUser]="currentUser"
              [selectedProjectId]="conversationState.activeConversation.ProjectID"
              (projectSelected)="onProjectSelected($event)">
            </mj-project-selector>
          </div>
        </div>
      </div>
    }

    <!-- Active Tasks Panel -->
    <mj-active-tasks-panel></mj-active-tasks-panel>
  `,
  styles: [`
    .chat-area {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .chat-header {
      flex-shrink: 0;
      padding: 12px 20px;
      border-bottom: 1px solid #D9D9D9;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      background: #FFF;
      z-index: 10;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .chat-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }
    .chat-title {
      font-size: 16px;
      font-weight: 600;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .project-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: #F4F4F4;
      border: 1px solid #D9D9D9;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 600;
      color: #AAA;
      cursor: pointer;
      transition: all 0.2s;
      height: 28px;
      margin-left: 12px;
    }
    .project-tag:hover {
      background: #D9D9D9;
      border-color: #AAA;
    }
    .project-tag i {
      font-size: 10px;
    }
    .chat-members {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: #F4F4F4;
      border: none;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      color: #AAA;
      cursor: pointer;
      transition: all 0.2s;
      height: 32px;
    }
    .chat-members:hover {
      background: #D9D9D9;
      color: #333;
    }
    .chat-members i {
      font-size: 12px;
    }
    .chat-members span {
      font-size: 12px;
      font-weight: 500;
    }
    .artifact-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #3B82F6;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      color: white;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .artifact-indicator:hover {
      background: #2563EB;
    }
    .ambient-agent-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #F3F4F6;
      border: 1px solid #D1D5DB;
      border-radius: 6px;
      font-size: 13px;
      color: #6B7280;
      animation: pulse 2s ease-in-out infinite;
    }
    .ambient-agent-indicator i {
      color: #0076B6;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .chat-actions {
      display: flex;
      gap: 8px;
    }
    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: transparent;
      border: 1px solid #E5E7EB;
      cursor: pointer;
      border-radius: 6px;
      font-size: 13px;
      color: #6B7280;
      transition: all 150ms ease;
    }
    .action-btn:hover {
      background: #F9FAFB;
      color: #111827;
    }
    .share-btn.shared {
      background: #EFF6FF;
      border-color: #1e40af;
      color: #1e40af;
    }
    .share-btn.shared:hover {
      background: #DBEAFE;
      color: #1e3a8a;
    }
    .chat-content-area {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .chat-splitter {
      height: 100%;
    }
    .chat-messages-wrapper {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .chat-messages-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      background: #FFF;
      min-height: 0;
    }
    .chat-input-container {
      flex-shrink: 0;
      background: #FFF;
      z-index: 10;
    }
    .artifact-panel-wrapper {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: #FAFAFA;
    }
    .artifact-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #E5E7EB;
      background: white;
    }
    .artifact-panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }
    .artifact-panel-title i {
      color: #6B7280;
    }
    .artifact-panel-close {
      background: transparent;
      border: none;
      cursor: pointer;
      color: #6B7280;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .artifact-panel-close:hover {
      background: #F3F4F6;
      color: #111827;
    }
    .artifact-panel-content {
      flex: 1;
      overflow: hidden;
    }
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .project-selector-modal {
      width: 600px;
      height: 500px;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #E5E7EB;
    }
    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .modal-close-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #6B7280;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .modal-close-btn:hover {
      background: #F3F4F6;
      color: #111827;
    }
    .modal-body {
      flex: 1;
      overflow: auto;
      padding: 20px;
    }
  `]
})
export class ConversationChatAreaComponent implements OnInit, OnDestroy, DoCheck {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

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
  public selectedArtifactId: string | null = null;

  // Artifact mapping: ConversationDetailID -> {artifactId, versionId}
  public artifactsByDetailId = new Map<string, {artifactId: string; versionId: string}>();

  constructor(
    public conversationState: ConversationStateService,
    private agentStateService: AgentStateService,
    private conversationAgentService: ConversationAgentService,
    private activeTasks: ActiveTasksService
  ) {}

  ngOnInit() {
    // Initial load if there's already an active conversation
    if (this.conversationState.activeConversationId) {
      this.onConversationChanged(this.conversationState.activeConversationId);
    }
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
  }

  private async onConversationChanged(conversationId: string | null): Promise<void> {
    this.activeTasks.clear();

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
            ExtraFilter: `ConversationDetailID IN (SELECT ConversationDetailID FROM [${convoDetailEntity.SchemaName}].[${convoDetailEntity.BaseView}] WHERE ConversationID='${conversationId}') AND Direction='Output'`,
            ResultType: 'entity_object'
          },
          this.currentUser
        )
      ]);

      if (messagesResult.Success) {
        const loadedMessages = messagesResult.Results || [];

        // Map AgentID from agent runs to messages
        if (agentRunsResult.Success && agentRunsResult.Results) {
          const agentRunsByDetailId = new Map<string, AIAgentRunEntity>();
          for (const run of agentRunsResult.Results) {
            if (run.ConversationDetailID) {
              agentRunsByDetailId.set(run.ConversationDetailID, run);
            }
          }

          // Populate AgentID on messages
          for (const message of loadedMessages) {
            const agentRun = agentRunsByDetailId.get(message.ID);
            if (agentRun && agentRun.AgentID) {
              (message as any).AgentID = agentRun.AgentID;
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
        this.artifactCount = this.artifactsByDetailId.size;

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

  onAgentResponse(event: {message: ConversationDetailEntity, agentResult: any}): void {
    // Add the agent's response message to the conversation
    this.messages = [...this.messages, event.message];
    console.log('Agent responded:', event.agentResult);
  }

  openProjectSelector(): void {
    this.showProjectSelector = true;
  }

  toggleMembersModal(): void {
    this.showMembersModal = !this.showMembersModal;
  }

  viewArtifacts(): void {
    // TODO: Open artifacts view/modal
    console.log('View artifacts');
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
}