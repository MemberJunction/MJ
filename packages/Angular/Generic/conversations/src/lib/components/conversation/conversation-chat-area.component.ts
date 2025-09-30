import { Component, Input, OnInit } from '@angular/core';
import { UserInfo, RunView } from '@memberjunction/core';
import { ConversationEntity, ConversationDetailEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'mj-conversation-chat-area',
  template: `
    <div class="chat-area">
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
          <div class="active-agents" *ngIf="activeAgents.length > 0">
            <span class="active-agents-label">Active:</span>
            <div *ngFor="let agent of activeAgents"
                 class="agent-indicator"
                 [class.active]="agent.isActive"
                 [style.background-color]="agent.color"
                 [title]="agent.name">
              {{ agent.initial }}
            </div>
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

      <div class="chat-messages">
        <mj-conversation-message-list
          [messages]="messages"
          [conversation]="activeConversation"
          [currentUser]="currentUser"
          [isProcessing]="isProcessing">
        </mj-conversation-message-list>
      </div>

      <mj-message-input
        *ngIf="activeConversation"
        [conversationId]="activeConversation.ID"
        [currentUser]="currentUser"
        [disabled]="isProcessing"
        (messageSent)="onMessageSent($event)">
      </mj-message-input>
    </div>
  `,
  styles: [`
    .chat-area { display: flex; flex-direction: column; height: 100%; }
    .chat-header {
      padding: 16px 24px;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
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
    .active-agents {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .active-agents-label {
      font-size: 13px;
      color: #6B7280;
    }
    .agent-indicator {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: white;
      opacity: 0.5;
      transition: opacity 150ms ease;
    }
    .agent-indicator.active {
      opacity: 1;
      box-shadow: 0 0 0 2px white, 0 0 0 4px currentColor;
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
    .chat-messages { flex: 1; overflow-y: auto; }
  `]
})
export class ConversationChatAreaComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public activeConversation$!: Observable<ConversationEntity | null>;
  public activeConversation: ConversationEntity | null = null;
  public messages: ConversationDetailEntity[] = [];
  public isProcessing: boolean = false;
  public memberCount: number = 1;
  public artifactCount: number = 0;
  public isShared: boolean = false;
  public activeAgents: Array<{ name: string; initial: string; color: string; isActive: boolean }> = [];

  constructor(private conversationState: ConversationStateService) {}

  ngOnInit() {
    this.activeConversation$ = this.conversationState.activeConversation$;

    // Subscribe to active conversation changes and load messages
    this.activeConversation$.subscribe(async (conversation) => {
      this.activeConversation = conversation;
      if (conversation) {
        await this.loadMessages(conversation.ID);
      } else {
        this.messages = [];
      }
    });
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
    // TODO: Implement export functionality
    console.log('Export conversation');
  }

  shareConversation(): void {
    // TODO: Implement share functionality
    console.log('Share conversation');
  }
}