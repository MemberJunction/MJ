import { Component, Input, OnInit } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { ConversationEntity } from '@memberjunction/core-entities';
import { ConversationStateService } from '../../services/conversation-state.service';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ToastService } from '../../services/toast.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'mj-conversation-list',
  template: `
    <div class="conversation-list">
      <div class="list-header">
        <input
          type="text"
          class="search-input"
          placeholder="Search conversations..."
          (input)="onSearch($event)">
        <button class="btn-new" (click)="createNewConversation()" title="New Conversation">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <div class="list-content">
        @for (conversation of (conversations$ | async); track conversation.ID) {
          <div class="conversation-item"
               [class.active]="conversation.ID === (activeConversationId$ | async)"
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
  `,
  styles: [`
    .conversation-list { display: flex; flex-direction: column; height: 100%; }
    .list-header { padding: 16px; border-bottom: 1px solid #D9D9D9; display: flex; gap: 8px; }
    .search-input { flex: 1; padding: 8px 12px; border: 1px solid #D9D9D9; border-radius: 6px; }
    .btn-new { padding: 8px 12px; background: #0076B6; color: white; border: none; border-radius: 6px; cursor: pointer; }
    .btn-new:hover { background: #005A8C; }
    .list-content { flex: 1; overflow-y: auto; }
    .conversation-item { padding: 12px 16px; border-bottom: 1px solid #F4F4F4; cursor: pointer; display: flex; gap: 12px; align-items: center; transition: background 150ms ease; position: relative; }
    .conversation-item:hover { background: #F4F4F4; }
    .conversation-item:hover .conversation-actions { opacity: 1; }
    .conversation-item.active { background: #AAE7FD; }
    .conversation-icon-wrapper { position: relative; flex-shrink: 0; }
    .conversation-icon { width: 36px; height: 36px; border-radius: 50%; background: #0076B6; color: white; display: flex; align-items: center; justify-content: center; }
    .badge-overlay { position: absolute; top: -4px; right: -4px; }
    .conversation-info { flex: 1; min-width: 0; padding-right: 8px; }
    .conversation-name { font-weight: 600; font-size: 14px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conversation-preview { font-size: 12px; color: #6B7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conversation-meta { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .conversation-actions { display: flex; align-items: center; gap: 4px; opacity: 0; transition: opacity 150ms ease; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: #F4F4F4; padding: 4px; border-radius: 6px; }
    .conversation-item:hover .conversation-actions { background: #E5E7EB; }
    .conversation-item.active .conversation-actions { opacity: 1; background: rgba(255, 255, 255, 0.9); }
    .conversation-item:has(.pinned-icon) .conversation-actions { opacity: 1; }
    .pinned-icon { color: #0076B6; font-size: 12px; }
    .action-btn { padding: 6px 8px; background: transparent; border: none; border-radius: 4px; cursor: pointer; color: #666; transition: all 150ms ease; }
    .action-btn:hover { background: #E5E7EB; color: #111827; }
    .action-btn.pinned { color: #0076B6; }
    .action-btn.pinned:hover { color: #005A8C; }
    .action-btn.danger:hover { background: #FEE2E2; color: #DC2626; }
  `]
})
export class ConversationListComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;

  public conversations$!: Observable<ConversationEntity[]>;
  public activeConversationId$!: Observable<string | null>;

  constructor(
    private conversationState: ConversationStateService,
    private dialogService: DialogService,
    private notificationService: NotificationService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.conversations$ = this.conversationState.filteredConversations$;
    this.activeConversationId$ = this.conversationState.activeConversationId$;

    // Load conversations on init
    this.conversationState.loadConversations(this.environmentId, this.currentUser);
  }

  selectConversation(conversation: ConversationEntity): void {
    this.conversationState.setActiveConversation(conversation.ID);
    // Clear unread notifications when conversation is opened
    this.notificationService.markConversationAsRead(conversation.ID);
  }

  onSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.conversationState.setSearchQuery(query);
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