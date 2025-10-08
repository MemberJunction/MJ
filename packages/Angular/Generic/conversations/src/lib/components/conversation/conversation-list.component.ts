import { Component, Input, OnInit, HostListener } from '@angular/core';
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
      </div>
      <button class="btn-new-conversation" (click)="createNewConversation()" title="New Conversation">
        <i class="fas fa-plus"></i>
        <span>New Conversation</span>
      </button>
      <div class="list-content">
        <!-- Direct Messages Section -->
        <div class="sidebar-section">
          <div class="section-header" [class.expanded]="directMessagesExpanded" (click)="toggleDirectMessages()">
            <div class="section-title">
              <i class="fas fa-chevron-right"></i>
              <span>Direct Messages</span>
            </div>
          </div>
          <div class="chat-list" [class.expanded]="directMessagesExpanded">
            @for (conversation of conversationState.filteredConversations; track conversation.ID) {
              <div class="conversation-item"
                   [class.active]="conversation.ID === conversationState.activeConversationId"
                   [class.renamed]="conversation.ID === renamedConversationId"
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
                <div class="conversation-actions">
                  <button class="menu-btn" (click)="toggleMenu(conversation.ID, $event)" title="More options">
                    <i class="fas fa-ellipsis"></i>
                  </button>
                  @if (openMenuConversationId === conversation.ID) {
                    <div class="context-menu" (click)="$event.stopPropagation()">
                      <button class="menu-item" (click)="togglePin(conversation, $event)">
                        <i class="fas fa-thumbtack"></i>
                        <span>{{ conversation.IsPinned ? 'Unpin' : 'Pin' }}</span>
                      </button>
                      <button class="menu-item" (click)="renameConversation(conversation); closeMenu()">
                        <i class="fas fa-edit"></i>
                        <span>Rename</span>
                      </button>
                      <div class="menu-divider"></div>
                      <button class="menu-item danger" (click)="deleteConversation(conversation); closeMenu()">
                        <i class="fas fa-trash"></i>
                        <span>Delete</span>
                      </button>
                    </div>
                  }
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
    .list-header { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .search-input {
      width: 100%;
      padding: 8px 12px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: white;
      font-size: 13px;
      transition: all 0.2s;
    }
    .search-input::placeholder { color: rgba(255,255,255,0.5); }
    .search-input:focus { outline: none; background: rgba(255,255,255,0.15); border-color: #0076B6; }
    .btn-new-conversation {
      width: calc(100% - 16px);
      margin: 8px;
      padding: 10px;
      background: #0076B6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    .btn-new-conversation:hover { background: #005A8C; }
    .btn-new-conversation i { font-size: 14px; }
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
    .chat-list {
      padding: 4px 0;
      display: none;
    }
    .chat-list.expanded { display: block; }

    .conversation-item {
      padding: 6px 5px 6px 16px;
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
    .conversation-info { flex: 1; min-width: 0; }
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
      position: absolute;
      right: 5px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      z-index: 10;
    }
    .conversation-item:hover .conversation-actions { opacity: 1; pointer-events: auto; }
    .conversation-item.active .conversation-actions { opacity: 1; pointer-events: auto; }
    .conversation-actions > * { pointer-events: auto; }
    .pinned-icon { color: #AAE7FD; font-size: 12px; }

    .menu-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      color: rgba(255,255,255,0.7);
      background: #092340 !important;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .menu-btn:hover {
      background: rgba(255,255,255,0.15) !important;
      color: white;
    }
    .conversation-item.active .menu-btn {
      background: #005A8C !important;
      color: white;
    }
    .menu-btn i { font-size: 14px; }

    .context-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      min-width: 160px;
      background: #0A2742;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 1001;
      overflow: hidden;
      pointer-events: auto;
    }

    .menu-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.85);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
    }

    .menu-item:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }

    .menu-item i {
      width: 16px;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
    }

    .menu-item:hover i {
      color: white;
    }

    .menu-item.danger {
      color: rgba(239, 68, 68, 0.9);
    }

    .menu-item.danger:hover {
      background: rgba(239, 68, 68, 0.15);
      color: #ff6b6b;
    }

    .menu-item.danger i {
      color: rgba(239, 68, 68, 0.8);
    }

    .menu-item.danger:hover i {
      color: #ff6b6b;
    }

    .menu-divider {
      height: 1px;
      background: rgba(255,255,255,0.1);
      margin: 4px 0;
    }

    /* Rename Animation */
    .conversation-item.renamed {
      animation: renameHighlight 1500ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes renameHighlight {
      0% {
        background: linear-gradient(90deg, rgba(59, 130, 246, 0.4), rgba(147, 51, 234, 0.4));
        transform: scale(1.03);
        box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
      }
      25% {
        background: linear-gradient(90deg, rgba(59, 130, 246, 0.35), rgba(147, 51, 234, 0.35));
        box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
      }
      50% {
        background: linear-gradient(90deg, rgba(16, 185, 129, 0.3), rgba(59, 130, 246, 0.3));
        transform: scale(1.02);
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
      }
      75% {
        background: linear-gradient(90deg, rgba(16, 185, 129, 0.2), rgba(59, 130, 246, 0.2));
        box-shadow: 0 0 5px rgba(16, 185, 129, 0.2);
      }
      100% {
        background: transparent;
        transform: scale(1);
        box-shadow: none;
      }
    }
  `]
})
export class ConversationListComponent implements OnInit {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() renamedConversationId: string | null = null;

  public directMessagesExpanded: boolean = true;
  public openMenuConversationId: string | null = null;

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

  @HostListener('document:click')
  onDocumentClick(): void {
    // Close menu when clicking outside
    if (this.openMenuConversationId) {
      this.closeMenu();
    }
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

  toggleMenu(conversationId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuConversationId = this.openMenuConversationId === conversationId ? null : conversationId;
  }

  closeMenu(): void {
    this.openMenuConversationId = null;
  }

  async togglePin(conversation: ConversationEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    try {
      await this.conversationState.togglePin(conversation.ID, this.currentUser);
      this.closeMenu();
    } catch (error) {
      console.error('Error toggling pin:', error);
      await this.dialogService.alert('Error', 'Failed to pin/unpin conversation. Please try again.');
    }
  }
}