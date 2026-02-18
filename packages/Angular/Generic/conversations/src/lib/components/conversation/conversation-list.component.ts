import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { MJConversationEntity } from '@memberjunction/core-entities';
import { ConversationDataService } from '../../services/conversation-data.service';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  standalone: false,
  selector: 'mj-conversation-list',
  template: `
    <div class="conversation-list" kendoDialogContainer>
      <div class="list-header">
        <div class="header-top">
          <input
            type="text"
            class="search-input"
            placeholder="Search conversations..."
            [(ngModel)]="searchQuery">
          @if (!isSelectionMode) {
            <div class="header-menu-container">
              <button class="btn-menu" (click)="toggleHeaderMenu($event)" title="Options">
                <i class="fas fa-ellipsis-v"></i>
              </button>
              @if (isHeaderMenuOpen) {
                <div class="header-dropdown-menu">
                  <button class="dropdown-item" (click)="onRefreshConversationsClick($event)" [disabled]="isRefreshing">
                    <i class="fas fa-sync-alt" [class.fa-spin]="isRefreshing"></i>
                    <span>{{ isRefreshing ? 'Refreshing...' : 'Refresh' }}</span>
                  </button>
                  <button class="dropdown-item" (click)="onSelectConversationsClick($event)">
                    <i class="fas fa-check-square"></i>
                    <span>Select Conversations</span>
                  </button>
                  @if (!isMobileView) {
                    <button class="dropdown-item" (click)="onUnpinSidebarClick($event)">
                      <i class="fas fa-table-columns"></i>
                      <span>Hide Sidebar</span>
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
      <button class="btn-new-conversation" (click)="createNewConversation()" title="New Conversation">
        <i class="fas fa-plus"></i>
        <span>New Conversation</span>
      </button>
      <div class="list-content">
        <!-- Pinned Section (only show if there are pinned conversations) -->
        @if (pinnedConversations.length > 0) {
          <div class="sidebar-section pinned-section">
            <div class="section-header" [class.expanded]="pinnedExpanded" (click)="togglePinned()">
              <div class="section-title">
                <i class="fas fa-chevron-right"></i>
                <i class="fas fa-thumbtack section-icon"></i>
                <span>Pinned</span>
              </div>
            </div>
            <div class="chat-list" [class.expanded]="pinnedExpanded">
              @for (conversation of pinnedConversations; track conversation.ID) {
                <div class="conversation-item"
                     [class.active]="conversation.ID === selectedConversationId"
                     [class.renamed]="conversation.ID === renamedConversationId"
                     (click)="handleConversationClick(conversation)">
                  @if (isSelectionMode) {
                    <div class="conversation-checkbox">
                      <input type="checkbox"
                             [checked]="selectedConversationIds.has(conversation.ID)"
                             (click)="$event.stopPropagation(); toggleConversationSelection(conversation.ID)">
                    </div>
                  }
                  <div class="conversation-icon-wrapper">
                    @if (hasActiveTasks(conversation.ID)) {
                      <div class="conversation-icon has-tasks">
                        <i class="fas fa-spinner fa-pulse"></i>
                      </div>
                    }
                    <div class="badge-overlay">
                      <mj-notification-badge [conversationId]="conversation.ID"></mj-notification-badge>
                    </div>
                  </div>
                  <div class="conversation-info" [title]="conversation.Name + (conversation.Description ? '\n' + conversation.Description : '')">
                    <div class="conversation-name">{{ conversation.Name }}</div>
                    <div class="conversation-preview">{{ conversation.Description }}</div>
                  </div>
                  @if (!isSelectionMode) {
                    <div class="conversation-actions">
                      <button class="menu-btn" (click)="toggleMenu(conversation.ID, $event)" title="More options">
                        <i class="fas fa-ellipsis"></i>
                      </button>
                      @if (openMenuConversationId === conversation.ID) {
                        <div class="context-menu" (click)="$event.stopPropagation()">
                          <button class="menu-item" (click)="togglePin(conversation, $event)">
                            <i class="fas fa-thumbtack"></i>
                            <span>Unpin</span>
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
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Messages Section -->
        <div class="sidebar-section">
          <div class="section-header" [class.expanded]="directMessagesExpanded" (click)="toggleDirectMessages()">
            <div class="section-title">
              <i class="fas fa-chevron-right"></i>
              <span>Messages</span>
            </div>
          </div>
          <div class="chat-list" [class.expanded]="directMessagesExpanded">
            @for (conversation of unpinnedConversations; track conversation.ID) {
              <div class="conversation-item"
                   [class.active]="conversation.ID === selectedConversationId"
                   [class.renamed]="conversation.ID === renamedConversationId"
                   (click)="handleConversationClick(conversation)">
                @if (isSelectionMode) {
                  <div class="conversation-checkbox">
                    <input type="checkbox"
                           [checked]="selectedConversationIds.has(conversation.ID)"
                           (click)="$event.stopPropagation(); toggleConversationSelection(conversation.ID)">
                  </div>
                }
                <div class="conversation-icon-wrapper">
                  @if (hasActiveTasks(conversation.ID)) {
                    <div class="conversation-icon has-tasks">
                      <i class="fas fa-spinner fa-pulse"></i>
                    </div>
                  }
                  <div class="badge-overlay">
                    <mj-notification-badge [conversationId]="conversation.ID"></mj-notification-badge>
                  </div>
                </div>
                <div class="conversation-info" [title]="conversation.Name + (conversation.Description ? '\n' + conversation.Description : '')">
                  <div class="conversation-name">{{ conversation.Name }}</div>
                  <div class="conversation-preview">{{ conversation.Description }}</div>
                </div>
                @if (!isSelectionMode) {
                  <div class="conversation-actions">
                    <button class="menu-btn" (click)="toggleMenu(conversation.ID, $event)" title="More options">
                      <i class="fas fa-ellipsis"></i>
                    </button>
                    @if (openMenuConversationId === conversation.ID) {
                      <div class="context-menu" (click)="$event.stopPropagation()">
                        <button class="menu-item" (click)="togglePin(conversation, $event)">
                          <i class="fas fa-thumbtack"></i>
                          <span>Pin</span>
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
                }
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Selection Action Bar -->
      @if (isSelectionMode) {
        <div class="selection-action-bar">
          <div class="selection-info">
            <span class="selection-count">{{ selectedConversationIds.size }} selected</span>
            @if (selectedConversationIds.size < filteredConversations.length) {
              <button class="link-btn" (click)="selectAll()">Select All</button>
            } @else {
              <button class="link-btn" (click)="deselectAll()">Deselect All</button>
            }
          </div>
          <div class="selection-actions">
            <button class="btn-delete-bulk"
                    (click)="bulkDeleteConversations()"
                    [disabled]="selectedConversationIds.size === 0">
              <i class="fas fa-trash"></i>
              Delete ({{ selectedConversationIds.size }})
            </button>
            <button class="btn-cancel" (click)="toggleSelectionMode()">
              Cancel
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
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
    .list-content { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 0; }

    /* Collapsible Sections */
    .sidebar-section { margin-bottom: 20px; }
    .pinned-section .section-header {
      background: rgba(255, 193, 7, 0.08);
      border-radius: 4px;
      margin: 0 4px;
    }
    .pinned-section .section-title .section-icon {
      color: #FFC107;
      font-size: 11px;
      margin-left: 2px;
    }
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
      min-height: 45px;
    }
    .conversation-item:hover { background: rgba(255,255,255,0.08); color: white; }
    .conversation-item:hover .conversation-actions { opacity: 1; }
    .conversation-item.active { background: #0076B6; color: white; }
    .conversation-icon-wrapper { position: relative; flex-shrink: 0; }
    .conversation-icon { font-size: 12px; width: 16px; text-align: center; }
    .conversation-icon.has-tasks { color: #fb923c; }
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

    /* Task Indicator */
    .task-indicator {
      color: #fb923c;
      font-size: 12px;
      margin-right: 8px;
      flex-shrink: 0;
      animation: pulse-glow 2s ease-in-out infinite;
    }
    @keyframes pulse-glow {
      0%, 100% {
        opacity: 1;
        filter: drop-shadow(0 0 2px #fb923c);
      }
      50% {
        opacity: 0.6;
        filter: drop-shadow(0 0 4px #fb923c);
      }
    }
    .conversation-item.active .task-indicator {
      color: #fbbf24;
    }

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

    /* Selection Mode Styles */
    .header-top {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    /* Header menu button and dropdown */
    .header-menu-container {
      position: relative;
      flex-shrink: 0;
    }

    .btn-menu {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-menu:hover {
      background: rgba(255,255,255,0.1);
      color: white;
      border-color: rgba(255,255,255,0.3);
    }

    .header-dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      min-width: 200px;
      background: #0A2742;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 1001;
      overflow: hidden;
      padding: 4px 0;
    }

    .header-dropdown-menu .dropdown-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.85);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
    }

    .header-dropdown-menu .dropdown-item:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }

    .header-dropdown-menu .dropdown-item i {
      width: 16px;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
    }

    .header-dropdown-menu .dropdown-item:hover i {
      color: white;
    }

    .header-dropdown-menu .dropdown-item .shortcut {
      margin-left: auto;
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      font-family: system-ui, -apple-system, sans-serif;
    }

    .btn-select {
      padding: 8px 12px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: rgba(255,255,255,0.7);
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .btn-select:hover {
      background: rgba(255,255,255,0.1);
      color: white;
      border-color: rgba(255,255,255,0.3);
    }

    .conversation-checkbox {
      display: flex;
      align-items: center;
      margin-right: 8px;
      flex-shrink: 0;
    }

    .conversation-checkbox input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: #0076B6;
    }

    .selection-action-bar {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #0A2742;
      border-top: 1px solid rgba(255,255,255,0.15);
      gap: 12px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 12px;
      color: rgba(255,255,255,0.9);
      font-size: 14px;
      font-weight: 500;
      flex: 1 1 auto;
      min-width: 150px;
    }

    .selection-count {
      color: white;
    }

    .link-btn {
      background: none;
      border: none;
      color: #AAE7FD;
      cursor: pointer;
      font-size: 13px;
      text-decoration: underline;
      padding: 0;
      transition: color 0.2s;
    }

    .link-btn:hover {
      color: white;
    }

    .selection-actions {
      display: flex;
      gap: 8px;
      flex: 0 0 auto;
    }

    .btn-cancel {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-cancel:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }

    .btn-delete-bulk {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: #DC2626;
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-delete-bulk:hover:not(:disabled) {
      background: #B91C1C;
    }

    .btn-delete-bulk:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-delete-bulk i {
      font-size: 12px;
    }
  `]
})
export class ConversationListComponent implements OnInit, OnDestroy {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Input() selectedConversationId: string | null = null;
  @Input() renamedConversationId: string | null = null;
  @Input() isSidebarPinned: boolean = true; // Whether sidebar is pinned (stays open after selection)
  @Input() isMobileView: boolean = false; // Whether we're on mobile (no pin options)

  @Output() conversationSelected = new EventEmitter<string>();
  @Output() newConversationRequested = new EventEmitter<void>();
  @Output() pinSidebarRequested = new EventEmitter<void>(); // Request to pin sidebar
  @Output() unpinSidebarRequested = new EventEmitter<void>(); // Request to unpin (collapse) sidebar

  public directMessagesExpanded: boolean = true;
  public pinnedExpanded: boolean = true;
  public openMenuConversationId: string | null = null;
  public conversationIdsWithTasks = new Set<string>();
  public isSelectionMode: boolean = false;
  public selectedConversationIds = new Set<string>();
  public searchQuery: string = '';
  public isHeaderMenuOpen: boolean = false;
  public isRefreshing: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    public conversationData: ConversationDataService,
    private dialogService: DialogService,
    private notificationService: NotificationService,
    private activeTasksService: ActiveTasksService,
    private cdr: ChangeDetectorRef
  ) {}

  get filteredConversations(): MJConversationEntity[] {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      return this.conversationData.conversations;
    }
    const lowerQuery = this.searchQuery.toLowerCase();
    return this.conversationData.conversations.filter(c =>
      (c.Name?.toLowerCase().includes(lowerQuery)) ||
      (c.Description?.toLowerCase().includes(lowerQuery))
    );
  }

  get pinnedConversations() {
    return this.filteredConversations.filter(c => c.IsPinned);
  }

  get unpinnedConversations() {
    return this.filteredConversations.filter(c => !c.IsPinned);
  }

  ngOnInit() {
    // Load conversations on init
    this.conversationData.loadConversations(this.environmentId, this.currentUser);

    // Subscribe to conversation IDs with active tasks (hot set)
    this.activeTasksService.conversationIdsWithTasks$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(conversationIds => {
      this.conversationIdsWithTasks = conversationIds;
      this.cdr.detectChanges(); // Force change detection to ensure spinner icons update reliably
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    // Close menus when clicking outside
    if (this.openMenuConversationId) {
      this.closeMenu();
    }
    if (this.isHeaderMenuOpen) {
      this.closeHeaderMenu();
    }
  }

  public toggleHeaderMenu(event: Event): void {
    event.stopPropagation();
    this.isHeaderMenuOpen = !this.isHeaderMenuOpen;
  }

  public closeHeaderMenu(): void {
    this.isHeaderMenuOpen = false;
  }

  public onSelectConversationsClick(event: Event): void {
    event.stopPropagation();
    this.toggleSelectionMode();
    this.closeHeaderMenu();
  }

  public async onRefreshConversationsClick(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.isRefreshing) return;

    this.isRefreshing = true;
    try {
      await this.conversationData.refreshConversations(this.environmentId, this.currentUser);
    } catch (error) {
      console.error('Error refreshing conversations:', error);
      await this.dialogService.alert('Error', 'Failed to refresh conversations. Please try again.');
    } finally {
      this.isRefreshing = false;
      this.closeHeaderMenu();
    }
  }

  public onPinSidebarClick(event: Event): void {
    event.stopPropagation();
    this.closeHeaderMenu();
    this.pinSidebarRequested.emit();
  }

  public onUnpinSidebarClick(event: Event): void {
    event.stopPropagation();
    this.closeHeaderMenu();
    this.unpinSidebarRequested.emit();
  }

  public toggleDirectMessages(): void {
    this.directMessagesExpanded = !this.directMessagesExpanded;
  }

  public togglePinned(): void {
    this.pinnedExpanded = !this.pinnedExpanded;
  }

  selectConversation(conversation: MJConversationEntity): void {
    this.conversationSelected.emit(conversation.ID);
    // Clear unread notifications when conversation is opened
    this.notificationService.markConversationAsRead(conversation.ID);
  }

  async createNewConversation(): Promise<void> {
    // Don't create DB record yet - just show the welcome screen
    // Conversation will be created when user sends first message
    this.newConversationRequested.emit();
  }

  async renameConversation(conversation: MJConversationEntity): Promise<void> {
    try {
      const result = await this.dialogService.input({
        title: 'Edit Conversation',
        message: 'Update the name and description for this conversation',
        inputLabel: 'Conversation Name',
        inputValue: conversation.Name || '',
        placeholder: 'My Conversation',
        required: true,
        secondInputLabel: 'Description',
        secondInputValue: conversation.Description || '',
        secondInputPlaceholder: 'Optional description',
        secondInputRequired: false,
        okText: 'Save',
        cancelText: 'Cancel'
      });

      if (result) {
        const newName = typeof result === 'string' ? result : result.value;
        const newDescription = typeof result === 'string' ? conversation.Description : result.secondValue;

        if (newName !== conversation.Name || newDescription !== conversation.Description) {
          await this.conversationData.saveConversation(
            conversation.ID,
            { Name: newName, Description: newDescription || '' },
            this.currentUser
          );
        }
      }
    } catch (error) {
      console.error('Error renaming conversation:', error);
      await this.dialogService.alert('Error', 'Failed to update conversation. Please try again.');
    }
  }

  async deleteConversation(conversation: MJConversationEntity): Promise<void> {
    try {
      const confirmed = await this.dialogService.confirm({
        title: 'Delete Conversation',
        message: `Are you sure you want to delete "${conversation.Name}"? This action cannot be undone.`,
        okText: 'Delete',
        cancelText: 'Cancel'
      });

      if (confirmed) {
        await this.conversationData.deleteConversation(conversation.ID, this.currentUser);
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

  async togglePin(conversation: MJConversationEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    try {
      await this.conversationData.togglePin(conversation.ID, this.currentUser);
      this.closeMenu();
    } catch (error) {
      console.error('Error toggling pin:', error);
      await this.dialogService.alert('Error', 'Failed to pin/unpin conversation. Please try again.');
    }
  }

  hasActiveTasks(conversationId: string): boolean {
    return this.conversationIdsWithTasks.has(conversationId);
  }

  toggleSelectionMode(): void {
    this.isSelectionMode = !this.isSelectionMode;
    if (!this.isSelectionMode) {
      this.selectedConversationIds.clear();
    }
  }

  toggleConversationSelection(conversationId: string): void {
    if (this.selectedConversationIds.has(conversationId)) {
      this.selectedConversationIds.delete(conversationId);
    } else {
      this.selectedConversationIds.add(conversationId);
    }
  }

  selectAll(): void {
    this.filteredConversations.forEach(c => {
      this.selectedConversationIds.add(c.ID);
    });
  }

  deselectAll(): void {
    this.selectedConversationIds.clear();
  }

  async bulkDeleteConversations(): Promise<void> {
    const count = this.selectedConversationIds.size;

    if (count === 0) return;

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Conversations',
      message: `Are you sure you want to delete ${count} conversation${count > 1 ? 's' : ''}? This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      try {
        const result = await this.conversationData.deleteMultipleConversations(
          Array.from(this.selectedConversationIds),
          this.currentUser
        );

        // Show results if there were any failures
        if (result.failed.length > 0) {
          await this.dialogService.alert(
            'Partial Success',
            `Deleted ${result.successful.length} of ${count} conversations. ${result.failed.length} failed.`
          );
        }

        // Exit selection mode
        this.toggleSelectionMode();

      } catch (error) {
        console.error('Error deleting conversations:', error);
        await this.dialogService.alert('Error', 'Failed to delete conversations. Please try again.');
      }
    }
  }

  handleConversationClick(conversation: MJConversationEntity): void {
    if (this.isSelectionMode) {
      this.toggleConversationSelection(conversation.ID);
    } else {
      this.selectConversation(conversation);
    }
  }
}