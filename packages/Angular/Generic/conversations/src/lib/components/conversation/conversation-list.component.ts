import { Component, Input, OnInit } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'mj-conversation-list',
  template: `
    <div class="conversation-list">
      <div class="list-header">
        <input
          type="text"
          class="search-input"
          placeholder="Search conversations..."
          [(ngModel)]="conversationState.searchQuery">
        <button class="btn-new" (click)="createNewConversation()" title="New Conversation">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <div class="list-content">
        <!-- Direct Messages Section -->
        <div class="sidebar-section">
          <div class="section-header" [class.expanded]="directMessagesExpanded" (click)="toggleDirectMessages()">
            <div class="section-title">
              <i class="fas fa-chevron-right"></i>
              <span>Direct Messages</span>
            </div>
            <button class="section-action" (click)="createNewConversation(); $event.stopPropagation()" title="New DM">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <div class="chat-list" [class.expanded]="directMessagesExpanded">
            @for (conversation of conversationState.filteredConversations; track conversation.ID) {
              <div class="conversation-item"
                   [class.active]="conversation.ID === conversationState.activeConversationId"
                   (click)="selectConversation(conversation)">
                <div class="conversation-icon-wrapper">
                  <div class="conversation-icon">
                    <i class="fas fa-comments"></i>
                  </div>
                  <div class="badge-overlay">
                    <mj-notification-badge [conversationId]="conversation.ID"></mj-notification-badge>
                  </div>
                </div>
                <div class="conversation-info" [title]="conversation.Name + (conversation.Description ? '\n' + conversation.Description : '')">
                  <div class="conversation-name">{{ conversation.Name }}</div>
                  <div class="conversation-preview">{{ conversation.Description || 'No description' }}</div>
                </div>
                <div class="conversation-meta">
                  @if (conversation.IsPinned) {
                    <i class="fas fa-thumbtack pinned-icon"></i>
                  }
                </div>
                <div class="conversation-actions" (click)="$event.stopPropagation()">
                  <button class="action-btn" (click)="togglePin(conversation)" [title]="conversation.IsPinned ? 'Unpin' : 'Pin'" [class.pinned]="conversation.IsPinned">
                    <i class="fas fa-thumbtack"></i>
                  </button>
                  <button class="action-btn" (click)="renameConversation(conversation)" title="Rename">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="action-btn danger" (click)="deleteConversation(conversation)" title="Delete">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .conversation-list { display: flex; flex-direction: column; height: 100%; background: #092340; }
    .list-header { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; gap: 8px; }
    .search-input {
      flex: 1;
      padding: 6px 10px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      color: white;
      font-size: 13px;
      transition: all 0.2s;
    }
    .search-input::placeholder { color: rgba(255,255,255,0.5); }
    .search-input:focus { outline: none; background: rgba(255,255,255,0.15); border-color: #0076B6; }
    .btn-new {
      width: 100%;
      padding: 8px;
      background: #0076B6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s;
    }
    .btn-new:hover { background: #005A8C; }
    .btn-new i { font-size: 12px; }
    .list-content { flex: 1; overflow-y: auto; padding: 4px 0; }

    /* Collapsible Sections */
    .sidebar-section { margin-bottom: 20px; }
    .section-header {
      padding: 4px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      font-weight: 500;
      transition: color 0.2s;
      user-select: none;
    }
    .section-header:hover { color: white; }
    .section-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title i {
      font-size: 10px;
      transition: transform 0.2s;
    }
    .section-header.expanded .section-title i { transform: rotate(90deg); }
    .section-action {
      padding: 2px 6px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
      border-radius: 3px;
    }
    .section-action:hover {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
    }
    .chat-list {
      padding: 4px 0;
      display: none;
    }
    .chat-list.expanded { display: block; }

    .conversation-item {
      padding: 6px 40px 6px 28px;
      cursor: pointer;
      display: flex;
      gap: 8px;
      align-items: center;
      transition: all 0.2s;
      position: relative;
      color: rgba(255,255,255,0.7);
      font-size: 14px;
    }
    .conversation-item:hover { background: rgba(255,255,255,0.08); color: white; }
    .conversation-item:hover .conversation-actions { opacity: 1; }
    .conversation-item.active { background: #0076B6; color: white; }
    .conversation-icon-wrapper { position: relative; flex-shrink: 0; }
    .conversation-icon { font-size: 12px; width: 16px; text-align: center; }
    .badge-overlay { position: absolute; top: -4px; right: -4px; }
    .conversation-info { flex: 1; min-width: 0; padding-right: 8px; }
    .conversation-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conversation-preview { font-size: 12px; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conversation-item.active .conversation-preview { color: rgba(255,255,255,0.8); }
    .conversation-meta { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

    /* Project Badge */
    .project-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      margin-left: auto;
      background-color: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.6);
      white-space: nowrap;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .conversation-item:hover .project-badge {
      background-color: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.8);
    }
    .conversation-item.active .project-badge {
      background-color: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .conversation-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      opacity: 0;
      transition: opacity 0.2s;
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10;
    }
    .conversation-item.active .conversation-actions { opacity: 1; }
    .conversation-item:has(.pinned-icon) .conversation-actions { opacity: 1; }
    .pinned-icon { color: #AAE7FD; font-size: 12px; }
    .action-btn {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      color: rgba(255,255,255,0.6);
      background: transparent;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .action-btn:hover { background: rgba(255,255,255,0.2); color: white; }
    .action-btn.pinned { color: #AAE7FD; }
    .action-btn.danger:hover { background: rgba(239,68,68,0.3); color: #ff6b6b; }
    .action-btn i { font-size: 11px; }
  `]
})
export class ConversationListComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public directMessagesExpanded: boolean = true;

  constructor(
    public conversationState: ConversationStateService,
    private dialogService: DialogService,
    private notificationService: NotificationService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Load conversations on init
    this.conversationState.loadConversations(this.environmentId, this.currentUser);
  }

  public toggleDirectMessages(): void {
    this.directMessagesExpanded = !this.directMessagesExpanded;
  }

  selectConversation(conversation: ConversationEntity): void {
    this.conversationState.setActiveConversation(conversation.ID);
    // Clear unread notifications when conversation is opened
    this.notificationService.markConversationAsRead(conversation.ID);
  }

  async createNewConversation(): Promise<void> {
    try {
      // Create conversation directly with default name
      // Name will be updated automatically after first message
      const conversation = await this.conversationState.createConversation(
        'New Chat',
        this.environmentId,
        this.currentUser
      );
      this.conversationState.setActiveConversation(conversation.ID);
    } catch (error) {
      console.error('Error creating conversation:', error);
      this.toastService.error('Failed to create conversation. Please try again.');
    }
  }

  async renameConversation(conversation: ConversationEntity): Promise<void> {
    try {
      const newName = await this.dialogService.input({
        title: 'Rename Conversation',
        message: 'Enter a new name for this conversation',
        inputLabel: 'Conversation Name',
        inputValue: conversation.Name || '',
        placeholder: 'My Conversation',
        required: true,
        okText: 'Rename',
        cancelText: 'Cancel'
      });

      if (newName && newName !== conversation.Name) {
        await this.conversationState.saveConversation(
          conversation.ID,
          { Name: newName },
          this.currentUser
        );
      }
    } catch (error) {
      console.error('Error renaming conversation:', error);
      await this.dialogService.alert('Error', 'Failed to rename conversation. Please try again.');
    }
  }

  async deleteConversation(conversation: ConversationEntity): Promise<void> {
    try {
      const confirmed = await this.dialogService.confirm({
        title: 'Delete Conversation',
        message: `Are you sure you want to delete "${conversation.Name}"? This action cannot be undone.`,
        okText: 'Delete',
        cancelText: 'Cancel'
      });

      if (confirmed) {
        await this.conversationState.deleteConversation(conversation.ID, this.currentUser);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      await this.dialogService.alert('Error', 'Failed to delete conversation. Please try again.');
    }
  }

  async togglePin(conversation: ConversationEntity): Promise<void> {
    try {
      await this.conversationState.togglePin(conversation.ID, this.currentUser);
    } catch (error) {
      console.error('Error toggling pin:', error);
      await this.dialogService.alert('Error', 'Failed to pin/unpin conversation. Please try again.');
    }
  }
}