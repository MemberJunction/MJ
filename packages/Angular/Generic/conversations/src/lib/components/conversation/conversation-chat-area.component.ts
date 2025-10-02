import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { ConversationEntity, ConversationDetailEntity, AIAgentRunEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { AgentStateService } from '../../services/agent-state.service';
import { ConversationAgentService } from '../../services/conversation-agent.service';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'mj-conversation-chat-area',
  template: `
    <div class="chat-area">
      <!-- Fixed Header -->
      <div class="chat-header" *ngIf="activeConversation$ | async as conversation">
        <div class="chat-info">
          <div class="chat-title">{{ conversation.Name }}</div>
          <button class="project-tag" (click)="showProjectSelector()" title="Assign to project" *ngIf="conversation.ProjectID">
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
            [conversationId]="activeConversation?.ID"
            [currentUser]="currentUser"
            (togglePanel)="onToggleAgentPanel()"
            (agentSelected)="onAgentSelected($event)">
          </mj-active-agent-indicator>
          <!-- Ambient agent processing indicator -->
          <div class="ambient-agent-indicator" *ngIf="isAmbientAgentProcessing$ | async" title="Ambient agent is thinking...">
            <i class="fas fa-circle-notch fa-spin"></i>
            <span>Agent thinking...</span>
          </div>
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

      <!-- Scrollable Messages Area -->
      <div class="chat-messages-container">
        <mj-conversation-message-list
          [messages]="messages"
          [conversation]="activeConversation"
          [currentUser]="currentUser"
          [isProcessing]="isProcessing"
          (replyInThread)="onReplyInThread($event)"
          (viewThread)="onViewThread($event)"
          (messageEdited)="onMessageEdited($event)">
        </mj-conversation-message-list>
      </div>

      <!-- Fixed Input Area -->
      <div class="chat-input-container">
        <mj-message-input
          *ngIf="activeConversation"
          [conversationId]="activeConversation.ID"
          [currentUser]="currentUser"
          [conversationHistory]="messages"
          [disabled]="isProcessing"
          (messageSent)="onMessageSent($event)"
          (agentResponse)="onAgentResponse($event)">
        </mj-message-input>
      </div>
    </div>

    <!-- Thread Panel -->
    @if (activeThreadId) {
      <mj-thread-panel
        [parentMessageId]="activeThreadId"
        [conversationId]="activeConversation?.ID || ''"
        [currentUser]="currentUser"
        (closed)="onThreadClosed()"
        (replyAdded)="onThreadReplyAdded($event)">
      </mj-thread-panel>
    }

    <!-- Export Modal -->
    <mj-export-modal
      [isVisible]="showExportModal"
      [conversation]="activeConversation || undefined"
      [currentUser]="currentUser"
      (cancelled)="onExportModalCancelled()"
      (exported)="onExportModalComplete()">
    </mj-export-modal>

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
      padding: 16px 24px;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      background: #FFF;
      z-index: 10;
    }
    .chat-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }
    .chat-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .project-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #F3F4F6;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      font-size: 13px;
      color: #6B7280;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .project-tag:hover {
      background: #E5E7EB;
      color: #111827;
    }
    .chat-members {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      font-size: 13px;
      color: #6B7280;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .chat-members:hover {
      background: #F9FAFB;
      color: #111827;
    }
    .artifact-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #1e40af;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      color: white;
      cursor: pointer;
      transition: all 150ms ease;
    }
    .artifact-indicator:hover {
      background: #1e3a8a;
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
  `]
})
export class ConversationChatAreaComponent implements OnInit, OnDestroy {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public activeConversation$!: Observable<ConversationEntity | null>;
  public activeConversation: ConversationEntity | null = null;
  public messages: ConversationDetailEntity[] = [];
  public isAmbientAgentProcessing$!: Observable<boolean>;
  public isProcessing: boolean = false;
  public memberCount: number = 1;
  public artifactCount: number = 0;
  public isShared: boolean = false;
  public activeThreadId: string | null = null;
  public showExportModal: boolean = false;
  public showAgentPanel: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    private conversationState: ConversationStateService,
    private agentStateService: AgentStateService,
    private conversationAgentService: ConversationAgentService
  ) {}

  ngOnInit() {
    this.activeConversation$ = this.conversationState.activeConversation$;
    this.isAmbientAgentProcessing$ = this.conversationAgentService.isProcessing$;

    // Subscribe to active conversation changes and load messages
    this.activeConversation$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (conversation) => {
        this.activeConversation = conversation;
        if (conversation) {
          await this.loadMessages(conversation.ID);
          // Start polling for agents when conversation is active
          this.agentStateService.startPolling(this.currentUser, conversation.ID);
        } else {
          this.messages = [];
        }
      });

    // Subscribe to thread state
    this.conversationState.activeThreadId$
      .pipe(takeUntil(this.destroy$))
      .subscribe((threadId) => {
        this.activeThreadId = threadId;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadMessages(conversationId: string): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<ConversationDetailEntity>(
        {
          EntityName: 'Conversation Details',
          ExtraFilter: `ConversationID='${conversationId}'`,
          OrderBy: '__mj_CreatedAt ASC',
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.messages = result.Results || [];
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
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

  showProjectSelector(): void {
    // TODO: Implement project selector modal
    console.log('Show project selector');
  }

  toggleMembersModal(): void {
    // TODO: Implement members modal
    console.log('Toggle members modal');
  }

  viewArtifacts(): void {
    // TODO: Open artifacts view
    console.log('View artifacts');
  }

  exportConversation(): void {
    if (this.activeConversation) {
      this.showExportModal = true;
    }
  }

  onExportModalCancelled(): void {
    this.showExportModal = false;
  }

  onExportModalComplete(): void {
    this.showExportModal = false;
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
    if (this.activeConversation) {
      this.loadMessages(this.activeConversation.ID);
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
}