import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { MJConversationEntity, MJProjectEntity, ConversationEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { ProjectFormModalComponent } from '../project/project-form-modal.component';
import { ConversationGroupBy } from '../../models/conversation-state.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';

/**
 * A node in the conversation folder tree. Each node holds its project (folder),
 * the conversations directly assigned to it, and its nested child folders.
 */
interface FolderNode {
  project: MJProjectEntity;
  depth: number;
  /** Conversations directly in this folder (unpinned only — pinned live in the Pinned section). */
  conversations: MJConversationEntity[];
  children: FolderNode[];
  /** Total conversations in this folder and all descendants. */
  totalCount: number;
  /** True when this folder or any descendant has at least one (filtered) conversation. */
  hasContent: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-conversation-list',
  template: `
    <div class="conversation-list">
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
                  <button class="dropdown-item" (click)="onToggleGroupByClick($event)">
                    <i class="fas" [class.fa-folder-tree]="groupBy !== 'project'" [class.fa-list]="groupBy === 'project'"></i>
                    <span>{{ groupBy === 'project' ? 'Show as flat list' : 'Group by folder' }}</span>
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
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        }

        @if (groupBy === 'project') {
          <!-- Folders Section -->
          <div class="sidebar-section folders-section">
            <div class="section-header" [class.expanded]="foldersExpanded"
                 [class.drag-over]="dragOverTargetId === 'folders-root'"
                 (click)="toggleFolders()"
                 (dragover)="onFoldersRootDragOver($event)"
                 (dragleave)="onDragLeave('folders-root')"
                 (drop)="onFoldersRootDrop($event)">
              <div class="section-title">
                <i class="fas fa-chevron-right"></i>
                <span>Folders</span>
              </div>
              <button class="section-action-btn" (click)="createFolder(null, $event)" title="New Folder">
                <i class="fas fa-folder-plus"></i>
              </button>
            </div>
            <div class="chat-list" [class.expanded]="foldersExpanded">
              @for (node of folderTree; track node.project.ID) {
                @if (!isSearching || node.hasContent) {
                  <ng-container [ngTemplateOutlet]="folderNode" [ngTemplateOutletContext]="{ $implicit: node }"></ng-container>
                }
              }
              @if (folderTree.length === 0) {
                <div class="folder-empty-hint">No folders yet — create one to organize conversations.</div>
              }
            </div>
          </div>

          <!-- Ungrouped Section (drop target to remove from folder) -->
          <div class="sidebar-section ungrouped-section"
               [class.drag-over]="dragOverTargetId === 'ungrouped'"
               (dragover)="onUngroupedDragOver($event)"
               (dragleave)="onDragLeave('ungrouped')"
               (drop)="onUngroupedDrop($event)">
            <div class="section-header" [class.expanded]="ungroupedExpanded" (click)="toggleUngrouped()">
              <div class="section-title">
                <i class="fas fa-chevron-right"></i>
                <span>{{ folderTree.length > 0 ? 'Ungrouped' : 'Messages' }}</span>
              </div>
            </div>
            <div class="chat-list" [class.expanded]="ungroupedExpanded">
              @for (conversation of ungroupedConversations; track conversation.ID) {
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        } @else {
          <!-- Flat Messages Section -->
          <div class="sidebar-section">
            <div class="section-header" [class.expanded]="directMessagesExpanded" (click)="toggleDirectMessages()">
              <div class="section-title">
                <i class="fas fa-chevron-right"></i>
                <span>Messages</span>
              </div>
            </div>
            <div class="chat-list" [class.expanded]="directMessagesExpanded">
              @for (conversation of unpinnedConversations; track conversation.ID) {
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        }
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

    <!-- Recursive folder node: header + nested children + direct conversations -->
    <ng-template #folderNode let-node>
      <div class="folder-row"
           [class.drag-over]="dragOverTargetId === node.project.ID"
           [class.dragging]="draggedFolderId === node.project.ID"
           [style.paddingLeft.px]="12 + node.depth * 14"
           [draggable]="true"
           (dragstart)="onFolderDragStart(node, $event)"
           (dragend)="onFolderDragEnd()"
           (click)="toggleFolder(node.project.ID)"
           (dragover)="onFolderDragOver(node.project.ID, $event)"
           (dragleave)="onDragLeave(node.project.ID)"
           (drop)="onFolderDrop(node.project, $event)"
           [title]="node.project.Name">
        <i class="fas fa-chevron-right folder-chevron" [class.expanded]="isFolderExpanded(node.project.ID)"></i>
        <i class="fas {{ node.project.Icon || 'fa-folder' }} folder-icon" [style.color]="node.project.Color || null"></i>
        <span class="folder-name">{{ node.project.Name }}</span>
        <span class="folder-count">{{ node.totalCount }}</span>
        <div class="folder-actions" (click)="$event.stopPropagation()">
          <button class="folder-action-btn" (click)="createFolder(node.project.ID, $event)" title="New Subfolder">
            <i class="fas fa-folder-plus"></i>
          </button>
          <button class="folder-action-btn" (click)="editFolder(node.project, $event)" title="Edit Folder">
            <i class="fas fa-pen"></i>
          </button>
          <button class="folder-action-btn danger" (click)="deleteFolder(node.project, $event)" title="Delete Folder">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      @if (isFolderExpanded(node.project.ID)) {
        <div class="folder-children">
          @for (child of node.children; track child.project.ID) {
            @if (!isSearching || child.hasContent) {
              <ng-container [ngTemplateOutlet]="folderNode" [ngTemplateOutletContext]="{ $implicit: child }"></ng-container>
            }
          }
          @for (conversation of node.conversations; track conversation.ID) {
            <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation, depth: node.depth + 1 }"></ng-container>
          }
          @if (node.totalCount === 0 && !isSearching) {
            <div class="folder-empty-hint" [style.paddingLeft.px]="26 + node.depth * 14">Empty — drop a conversation here</div>
          }
        </div>
      }
    </ng-template>

    <!-- Shared conversation row used by Pinned, folders, and Ungrouped/Messages -->
    <ng-template #conversationItem let-conversation let-depth="depth">
      <div class="conversation-item"
           [class.active]="IsConversationActive(conversation)"
           [class.renamed]="IsConversationRenamed(conversation)"
           [class.dragging]="IsConversationDragging(conversation)"
           [style.paddingLeft.px]="depth ? 16 + depth * 14 : 16"
           [draggable]="!isSelectionMode"
           (dragstart)="onConversationDragStart(conversation, $event)"
           (dragend)="onConversationDragEnd()"
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
          <div class="conversation-name">
            {{ conversation.Name }}
            @if (isSharedWithMe(conversation)) {
              <i class="fas fa-share-nodes shared-indicator"
                 [title]="sharedWithMeTooltip(conversation)"></i>
            }
          </div>
          <div class="conversation-preview">{{ conversation.Description }}</div>
        </div>
        @if (!isSelectionMode) {
          <div class="conversation-actions">
            <button class="menu-btn" (click)="toggleMenu(conversation.ID, $event)" title="More options">
              <i class="fas fa-ellipsis"></i>
            </button>
            @if (IsMenuOpen(conversation)) {
              <div class="context-menu" (click)="$event.stopPropagation()">
                @if (IsMoveSubmenuOpen(conversation)) {
                  <button class="menu-item back" (click)="closeMoveSubmenu($event)">
                    <i class="fas fa-chevron-left"></i>
                    <span>Move to folder</span>
                  </button>
                  <div class="menu-divider"></div>
                  <div class="move-folder-list">
                    <button class="menu-item" [class.current]="!conversation.ProjectID" (click)="selectMoveTarget(conversation, null)">
                      <i class="fas fa-inbox"></i>
                      <span>No folder</span>
                    </button>
                    @for (f of flatFolders; track f.project.ID) {
                      <button class="menu-item" [class.current]="IsInFolder(conversation, f.project.ID)"
                              [style.paddingLeft.px]="14 + f.depth * 12"
                              (click)="selectMoveTarget(conversation, f.project.ID)">
                        <i class="fas {{ f.project.Icon || 'fa-folder' }}" [style.color]="f.project.Color || null"></i>
                        <span>{{ f.project.Name }}</span>
                      </button>
                    }
                  </div>
                  <div class="menu-divider"></div>
                  <button class="menu-item" (click)="createFolderForConversation(conversation, $event)">
                    <i class="fas fa-folder-plus"></i>
                    <span>New folder…</span>
                  </button>
                } @else {
                  <button class="menu-item" (click)="togglePin(conversation, $event)">
                    <i class="fas fa-thumbtack"></i>
                    <span>{{ conversation.IsPinned ? 'Unpin' : 'Pin' }}</span>
                  </button>
                  <button class="menu-item" (click)="openMoveSubmenu(conversation.ID, $event)">
                    <i class="fas fa-folder-tree"></i>
                    <span>Move to folder</span>
                    <i class="fas fa-chevron-right submenu-arrow"></i>
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
                }
              </div>
            }
          </div>
        }
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .conversation-list { display: flex; flex-direction: column; height: 100%; background: var(--mj-brand-secondary); }
    .list-header { padding: 8px; border-bottom: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent); }
    .search-input {
      width: 100%;
      padding: 8px 12px;
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 20%, transparent);
      border-radius: 6px;
      color: var(--mj-brand-on-secondary);
      font-size: 13px;
      transition: all 0.2s;
    }
    .search-input::placeholder { color: color-mix(in srgb, var(--mj-brand-on-secondary) 50%, transparent); }
    .search-input:focus { outline: none; background: color-mix(in srgb, var(--mj-brand-on-secondary) 15%, transparent); border-color: var(--mj-brand-primary); }
    .btn-new-conversation {
      width: calc(100% - 16px);
      margin: 8px;
      padding: 10px;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
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
    .btn-new-conversation:hover { background: var(--mj-brand-primary-hover); }
    .btn-new-conversation i { font-size: 14px; }
    .list-content { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 0; }

    /* Collapsible Sections */
    .sidebar-section { margin-bottom: 20px; }
    .pinned-section .section-title .section-icon {
      color: var(--mj-status-warning);
      font-size: 11px;
      margin-left: 2px;
    }
    .section-header {
      padding: 4px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: var(--mj-brand-on-secondary);
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s;
      user-select: none;
    }
    .section-header:hover { background: color-mix(in srgb, var(--mj-brand-on-secondary) 8%, transparent); }
    .section-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title i {
      font-size: 10px;
    }
    .section-title i:not(.section-icon) {
      transition: transform 0.2s;
    }
    .section-header.expanded .section-title i:not(.section-icon) { transform: rotate(90deg); }
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
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 70%, transparent);
      font-size: 14px;
      min-height: 45px;
    }
    .conversation-item:hover { background: color-mix(in srgb, var(--mj-brand-on-secondary) 8%, transparent); color: var(--mj-brand-on-secondary); }
    .conversation-item:hover .conversation-actions { opacity: 1; }
    .conversation-item.active { background: var(--mj-brand-primary); color: var(--mj-brand-on-secondary); }
    .conversation-icon-wrapper { position: relative; flex-shrink: 0; }
    .conversation-icon { font-size: 12px; width: 16px; text-align: center; }
    .conversation-icon.has-tasks { color: var(--mj-status-warning); }
    .badge-overlay { position: absolute; top: -4px; right: -4px; }
    .conversation-info { flex: 1; min-width: 0; }
    .conversation-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
    .shared-indicator { font-size: 10px; color: color-mix(in srgb, var(--mj-brand-on-secondary) 55%, transparent); flex-shrink: 0; }
    .conversation-item.active .shared-indicator { color: color-mix(in srgb, var(--mj-brand-on-secondary) 85%, transparent); }
    .conversation-preview { font-size: 12px; color: color-mix(in srgb, var(--mj-brand-on-secondary) 50%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conversation-item.active .conversation-preview { color: color-mix(in srgb, var(--mj-brand-on-secondary) 80%, transparent); }
    .conversation-meta { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

    /* Project Badge */
    .project-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      margin-left: auto;
      background-color: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 60%, transparent);
      white-space: nowrap;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .conversation-item:hover .project-badge {
      background-color: color-mix(in srgb, var(--mj-brand-on-secondary) 15%, transparent);
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 80%, transparent);
    }
    .conversation-item.active .project-badge {
      background-color: color-mix(in srgb, var(--mj-brand-on-secondary) 20%, transparent);
      color: var(--mj-brand-on-secondary);
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
    .pinned-icon { color: var(--mj-brand-accent); font-size: 12px; }

    /* Task Indicator */
    .task-indicator {
      color: var(--mj-status-warning);
      font-size: 12px;
      margin-right: 8px;
      flex-shrink: 0;
      animation: pulse-glow 2s ease-in-out infinite;
    }
    @keyframes pulse-glow {
      0%, 100% {
        opacity: 1;
        filter: drop-shadow(0 0 2px var(--mj-status-warning));
      }
      50% {
        opacity: 0.6;
        filter: drop-shadow(0 0 4px var(--mj-status-warning));
      }
    }
    .conversation-item.active .task-indicator {
      color: var(--mj-status-warning);
    }

    .menu-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 70%, transparent);
      background: var(--mj-brand-secondary) !important;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .menu-btn:hover {
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 15%, transparent) !important;
      color: var(--mj-brand-on-secondary);
    }
    .conversation-item.active .menu-btn {
      background: var(--mj-brand-primary-hover) !important;
      color: var(--mj-brand-on-secondary);
    }
    .menu-btn i { font-size: 14px; }

    .context-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      min-width: 160px;
      background: var(--mj-brand-secondary);
      border: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 15%, transparent);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-lg);
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
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 85%, transparent);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
    }

    .menu-item:hover {
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
      color: var(--mj-brand-on-secondary);
    }

    .menu-item i {
      width: 16px;
      font-size: 13px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 60%, transparent);
    }

    .menu-item:hover i {
      color: var(--mj-brand-on-secondary);
    }

    .menu-item.danger {
      color: var(--mj-status-error);
    }

    .menu-item.danger:hover {
      background: color-mix(in srgb, var(--mj-status-error) 15%, transparent);
      color: var(--mj-status-error);
    }

    .menu-item.danger i {
      color: var(--mj-status-error);
    }

    .menu-item.danger:hover i {
      color: var(--mj-status-error);
    }

    .menu-divider {
      height: 1px;
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
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
      border: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 70%, transparent);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-menu:hover {
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
      color: var(--mj-brand-on-secondary);
      border-color: color-mix(in srgb, var(--mj-brand-on-secondary) 30%, transparent);
    }

    .header-dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      min-width: 200px;
      background: var(--mj-brand-secondary);
      border: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 15%, transparent);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-lg);
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
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 85%, transparent);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
    }

    .header-dropdown-menu .dropdown-item:hover {
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
      color: var(--mj-brand-on-secondary);
    }

    .header-dropdown-menu .dropdown-item i {
      width: 16px;
      font-size: 13px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 60%, transparent);
    }

    .header-dropdown-menu .dropdown-item:hover i {
      color: var(--mj-brand-on-secondary);
    }

    .header-dropdown-menu .dropdown-item .shortcut {
      margin-left: auto;
      font-size: 11px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 40%, transparent);
      font-family: system-ui, -apple-system, sans-serif;
    }

    .btn-select {
      padding: 8px 12px;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 70%, transparent);
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
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
      color: var(--mj-brand-on-secondary);
      border-color: color-mix(in srgb, var(--mj-brand-on-secondary) 30%, transparent);
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
      accent-color: var(--mj-brand-primary);
    }

    .selection-action-bar {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--mj-brand-secondary);
      border-top: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 15%, transparent);
      gap: 12px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 12px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 90%, transparent);
      font-size: 14px;
      font-weight: 500;
      flex: 1 1 auto;
      min-width: 150px;
    }

    .selection-count {
      color: var(--mj-brand-on-secondary);
    }

    .link-btn {
      background: none;
      border: none;
      color: var(--mj-brand-accent);
      cursor: pointer;
      font-size: 13px;
      text-decoration: underline;
      padding: 0;
      transition: color 0.2s;
    }

    .link-btn:hover {
      color: var(--mj-brand-on-secondary);
    }

    .selection-actions {
      display: flex;
      gap: 8px;
      flex: 0 0 auto;
    }

    .btn-cancel {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--mj-brand-on-secondary) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 70%, transparent);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-cancel:hover {
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 10%, transparent);
      color: var(--mj-brand-on-secondary);
    }

    .btn-delete-bulk {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: var(--mj-status-error);
      border: none;
      border-radius: 6px;
      color: var(--mj-brand-on-secondary);
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-delete-bulk:hover:not(:disabled) {
      background: color-mix(in srgb, var(--mj-status-error) 80%, black);
    }

    .btn-delete-bulk:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-delete-bulk i {
      font-size: 12px;
    }

    /* Folders */
    .section-action-btn {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 60%, transparent);
      cursor: pointer;
      transition: all 0.2s;
    }
    .section-action-btn:hover {
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 15%, transparent);
      color: var(--mj-brand-on-secondary);
    }
    .section-action-btn i { font-size: 12px; }

    .folder-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px 5px 12px;
      cursor: pointer;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 80%, transparent);
      font-size: 13px;
      transition: background 0.15s;
      user-select: none;
      position: relative;
    }
    .folder-row:hover { background: color-mix(in srgb, var(--mj-brand-on-secondary) 8%, transparent); }
    .folder-row.drag-over {
      background: color-mix(in srgb, var(--mj-brand-primary) 25%, transparent);
      box-shadow: inset 0 0 0 1px var(--mj-brand-primary);
    }
    .folder-row.dragging { opacity: 0.4; }
    .section-header.drag-over {
      background: color-mix(in srgb, var(--mj-brand-primary) 18%, transparent);
      box-shadow: inset 0 0 0 1px var(--mj-brand-primary);
      border-radius: 6px;
    }
    .folder-chevron {
      font-size: 9px;
      width: 10px;
      flex-shrink: 0;
      transition: transform 0.2s;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 55%, transparent);
    }
    .folder-chevron.expanded { transform: rotate(90deg); }
    .folder-icon { font-size: 12px; width: 16px; text-align: center; flex-shrink: 0; }
    .folder-name {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .folder-count {
      font-size: 11px;
      font-weight: 600;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 50%, transparent);
      flex-shrink: 0;
      margin-left: auto;
      padding-left: 6px;
      text-align: right;
    }
    .folder-actions {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      gap: 2px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
      z-index: 5;
    }
    .folder-row:hover .folder-actions { opacity: 1; pointer-events: auto; }
    .folder-row:hover .folder-count { opacity: 0; }
    .folder-action-btn {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 60%, transparent);
      cursor: pointer;
      transition: all 0.15s;
    }
    .folder-action-btn:hover {
      background: color-mix(in srgb, var(--mj-brand-on-secondary) 18%, transparent);
      color: var(--mj-brand-on-secondary);
    }
    .folder-action-btn.danger:hover {
      background: color-mix(in srgb, var(--mj-status-error) 18%, transparent);
      color: var(--mj-status-error);
    }
    .folder-action-btn i { font-size: 11px; }
    .folder-children { display: block; }
    .folder-empty-hint {
      padding: 6px 16px;
      font-size: 11px;
      font-style: italic;
      color: color-mix(in srgb, var(--mj-brand-on-secondary) 45%, transparent);
    }
    .ungrouped-section.drag-over {
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
      box-shadow: inset 0 0 0 1px var(--mj-brand-primary);
      border-radius: 6px;
    }

    /* Dragging state */
    .conversation-item { user-select: none; }
    .conversation-item.dragging { opacity: 0.4; }

    /* Move-to-folder submenu */
    .menu-item.back { font-weight: 600; }
    .menu-item .submenu-arrow { margin-left: auto; font-size: 10px; }
    .menu-item.current { background: color-mix(in srgb, var(--mj-brand-primary) 18%, transparent); }
    .move-folder-list { max-height: 240px; overflow-y: auto; }
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
  @Output() conversationDeleted = new EventEmitter<string>(); // Emits the deleted conversation ID
  @Output() newConversationRequested = new EventEmitter<void>();
  @Output() pinSidebarRequested = new EventEmitter<void>(); // Request to pin sidebar
  @Output() unpinSidebarRequested = new EventEmitter<void>(); // Request to unpin (collapse) sidebar
  @Output() refreshRequested = new EventEmitter<void>(); // Emitted after list refresh so chat area can also reload

  public directMessagesExpanded: boolean = true;
  public pinnedExpanded: boolean = true;
  public foldersExpanded: boolean = true;
  public ungroupedExpanded: boolean = true;
  public openMenuConversationId: string | null = null;
  public conversationIdsWithTasks = new Set<string>();
  public isSelectionMode: boolean = false;
  public selectedConversationIds = new Set<string>();
  public isHeaderMenuOpen: boolean = false;
  public isRefreshing: boolean = false;

  /** UserInfoEngine key for persisting folder collapse state + group-by mode. */
  private static readonly FolderPrefsKey = 'mj.conversations.folderPrefs.v1';

  /** How the conversation list is grouped. 'project' = folders, 'none' = flat list. */
  public groupBy: ConversationGroupBy = 'project';

  /** Precomputed groupings, rebuilt whenever conversations/projects/search change. */
  public pinnedConversations: MJConversationEntity[] = [];
  public unpinnedConversations: MJConversationEntity[] = [];
  public ungroupedConversations: MJConversationEntity[] = [];
  public folderTree: FolderNode[] = [];
  /** Flattened folder list (depth-ordered) for the "Move to folder" menu. */
  public flatFolders: FolderNode[] = [];

  /** Folder IDs (normalized) whose children are collapsed. Absent = expanded. */
  private collapsedFolderIds = new Set<string>();

  /** Drag-and-drop state. */
  public draggedConversationId: string | null = null;
  public draggedFolderId: string | null = null;
  public dragOverTargetId: string | null = null;

  /** When set, the open conversation menu is showing its "Move to folder" picker. */
  public moveSubmenuConversationId: string | null = null;

  private _searchQuery: string = '';

  private destroy$ = new Subject<void>();

  private engine = ConversationEngine.Instance;

  // Local UI state for loading/refreshing
  public IsLoading: boolean = false;

  constructor(
    private dialogService: DialogService,
    private notificationService: NotificationService,
    private activeTasksService: ActiveTasksService,
    private mjDialogService: MJDialogService,
    private cdr: ChangeDetectorRef
  ) {}

  get searchQuery(): string {
    return this._searchQuery;
  }
  set searchQuery(value: string) {
    this._searchQuery = value ?? '';
    this.rebuildGroups();
  }

  /** True when a search filter is active. */
  get isSearching(): boolean {
    return this._searchQuery.trim().length > 0;
  }

  /** Conversations matching the current search (used by selection-mode helpers). */
  get filteredConversations(): MJConversationEntity[] {
    return this.filterConversations(this.engine.Conversations);
  }

  private filterConversations(conversations: MJConversationEntity[]): MJConversationEntity[] {
    if (!this.isSearching) {
      return conversations;
    }
    const lowerQuery = this._searchQuery.toLowerCase();
    return conversations.filter(c =>
      (c.Name?.toLowerCase().includes(lowerQuery)) ||
      (c.Description?.toLowerCase().includes(lowerQuery))
    );
  }

  ngOnInit() {
    // Restore persisted folder collapse state + group-by preference
    this.loadFolderPrefs();

    // Load conversations (and folders) on init
    this.engine.LoadConversations(this.environmentId, this.currentUser, false);

    // Rebuild the precomputed groupings whenever conversations OR projects change
    // (pin, archive, rename, move-to-folder, folder create/rename/delete, etc.).
    this.engine.Conversations$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.rebuildGroups();
      this.cdr.detectChanges();
    });

    this.engine.Projects$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.rebuildGroups();
      this.cdr.detectChanges();
    });

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

  public onToggleGroupByClick(event: Event): void {
    event.stopPropagation();
    this.toggleGroupBy();
    this.closeHeaderMenu();
  }

  public async onRefreshConversationsClick(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.isRefreshing) return;

    this.isRefreshing = true;
    try {
      await this.engine.LoadConversations(this.environmentId, this.currentUser, true);
      // Signal parent to also reload messages in the active conversation
      this.refreshRequested.emit();
    } catch (error) {
      console.error('Error refreshing conversations:', error);
      await this.dialogService.alert('Error', 'Failed to refresh conversations. Please try again.');
    } finally {
      this.isRefreshing = false;
      this.cdr.detectChanges();
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

  public toggleFolders(): void {
    this.foldersExpanded = !this.foldersExpanded;
  }

  public toggleUngrouped(): void {
    this.ungroupedExpanded = !this.ungroupedExpanded;
  }

  // ========================================================================
  // FOLDER GROUPING
  // ========================================================================

  /**
   * Recomputes pinned/unpinned/ungrouped lists and the folder tree from the
   * engine's conversation + project caches and the current search filter.
   */
  private rebuildGroups(): void {
    const matching = this.filterConversations(this.engine.Conversations);
    this.pinnedConversations = matching.filter(c => c.IsPinned);
    this.unpinnedConversations = matching.filter(c => !c.IsPinned);

    const projects = this.engine.Projects;
    const projectIds = new Set(projects.map(p => NormalizeUUID(p.ID)));

    // Bucket unpinned conversations by their folder (pinned ones live in the
    // Pinned section). Conversations with no/unknown folder are "ungrouped".
    const conversationsByProject = new Map<string, MJConversationEntity[]>();
    const ungrouped: MJConversationEntity[] = [];
    for (const c of this.unpinnedConversations) {
      const pid = c.ProjectID ? NormalizeUUID(c.ProjectID) : null;
      if (pid && projectIds.has(pid)) {
        const arr = conversationsByProject.get(pid) ?? [];
        arr.push(c);
        conversationsByProject.set(pid, arr);
      } else {
        ungrouped.push(c);
      }
    }
    this.ungroupedConversations = ungrouped;

    // Index projects by parent. A project whose parent isn't loaded is treated
    // as a root so it never disappears from the tree.
    const childrenByParent = new Map<string | null, MJProjectEntity[]>();
    for (const p of projects) {
      const parentId = p.ParentID ? NormalizeUUID(p.ParentID) : null;
      const key = parentId && projectIds.has(parentId) ? parentId : null;
      const arr = childrenByParent.get(key) ?? [];
      arr.push(p);
      childrenByParent.set(key, arr);
    }

    const build = (parentKey: string | null, depth: number): FolderNode[] => {
      const projectsAtLevel = childrenByParent.get(parentKey) ?? [];
      return projectsAtLevel.map(p => {
        const children = build(NormalizeUUID(p.ID), depth + 1);
        const conversations = conversationsByProject.get(NormalizeUUID(p.ID)) ?? [];
        const totalCount = conversations.length + children.reduce((sum, ch) => sum + ch.totalCount, 0);
        const hasContent = conversations.length > 0 || children.some(ch => ch.hasContent);
        return { project: p, depth, conversations, children, totalCount, hasContent };
      });
    };
    this.folderTree = build(null, 0);
    this.flatFolders = this.flattenFolders(this.folderTree);
  }

  private flattenFolders(nodes: FolderNode[]): FolderNode[] {
    const out: FolderNode[] = [];
    for (const node of nodes) {
      out.push(node);
      out.push(...this.flattenFolders(node.children));
    }
    return out;
  }

  private findFolderNode(nodes: FolderNode[], projectId: string): FolderNode | null {
    for (const node of nodes) {
      if (UUIDsEqual(node.project.ID, projectId)) return node;
      const found = this.findFolderNode(node.children, projectId);
      if (found) return found;
    }
    return null;
  }

  public isFolderExpanded(projectId: string): boolean {
    return !this.collapsedFolderIds.has(NormalizeUUID(projectId));
  }

  public toggleFolder(projectId: string): void {
    const key = NormalizeUUID(projectId);
    if (this.collapsedFolderIds.has(key)) {
      this.collapsedFolderIds.delete(key);
    } else {
      this.collapsedFolderIds.add(key);
    }
    this.saveFolderPrefs();
  }

  public toggleGroupBy(): void {
    this.groupBy = this.groupBy === 'project' ? 'none' : 'project';
    this.saveFolderPrefs();
    this.rebuildGroups();
  }

  private loadFolderPrefs(): void {
    try {
      const raw = UserInfoEngine.Instance.GetSetting(ConversationListComponent.FolderPrefsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { collapsed?: string[]; groupBy?: ConversationGroupBy };
      this.collapsedFolderIds = new Set((parsed.collapsed ?? []).map(id => NormalizeUUID(id)));
      if (parsed.groupBy === 'none' || parsed.groupBy === 'project') {
        this.groupBy = parsed.groupBy;
      }
    } catch {
      // Corrupt/legacy value — ignore and use defaults
    }
  }

  private saveFolderPrefs(): void {
    const payload = JSON.stringify({
      collapsed: Array.from(this.collapsedFolderIds),
      groupBy: this.groupBy
    });
    UserInfoEngine.Instance.SetSettingDebounced(ConversationListComponent.FolderPrefsKey, payload);
  }

  // ========================================================================
  // DRAG & DROP (move conversation into/out of a folder)
  // ========================================================================

  public onConversationDragStart(conversation: MJConversationEntity, event: DragEvent): void {
    if (this.isSelectionMode) return;
    this.draggedFolderId = null;
    this.draggedConversationId = conversation.ID;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', conversation.ID);
    }
  }

  public onConversationDragEnd(): void {
    this.draggedConversationId = null;
    this.dragOverTargetId = null;
  }

  public onFolderDragStart(node: FolderNode, event: DragEvent): void {
    event.stopPropagation();
    this.draggedConversationId = null;
    this.draggedFolderId = node.project.ID;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.project.ID);
    }
  }

  public onFolderDragEnd(): void {
    this.draggedFolderId = null;
    this.dragOverTargetId = null;
  }

  public onFolderDragOver(projectId: string, event: DragEvent): void {
    // A conversation can drop onto any folder; a folder can drop onto any folder
    // that isn't itself or one of its own descendants (which would create a cycle).
    const accepts = this.draggedConversationId
      ? true
      : this.draggedFolderId
        ? this.isValidFolderDropTarget(projectId)
        : false;
    if (!accepts) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = projectId;
  }

  public onUngroupedDragOver(event: DragEvent): void {
    if (!this.draggedConversationId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = 'ungrouped';
  }

  /** The Folders section header accepts a dragged folder to move it back to the top level. */
  public onFoldersRootDragOver(event: DragEvent): void {
    if (!this.draggedFolderId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = 'folders-root';
  }

  public onDragLeave(targetId: string): void {
    if (this.dragOverTargetId === targetId) {
      this.dragOverTargetId = null;
    }
  }

  public onFolderDrop(project: MJProjectEntity, event: DragEvent): void {
    event.preventDefault();
    const conversationId = this.draggedConversationId;
    const folderId = this.draggedFolderId;
    this.dragOverTargetId = null;
    this.draggedConversationId = null;
    this.draggedFolderId = null;
    if (conversationId) {
      this.moveConversation(conversationId, project.ID);
    } else if (folderId && this.isValidFolderDropTarget(project.ID, folderId)) {
      this.moveFolder(folderId, project.ID);
    }
  }

  public onUngroupedDrop(event: DragEvent): void {
    event.preventDefault();
    const conversationId = this.draggedConversationId;
    this.dragOverTargetId = null;
    this.draggedConversationId = null;
    if (conversationId) {
      this.moveConversation(conversationId, null);
    }
  }

  public onFoldersRootDrop(event: DragEvent): void {
    event.preventDefault();
    const folderId = this.draggedFolderId;
    this.dragOverTargetId = null;
    this.draggedFolderId = null;
    if (folderId) {
      this.moveFolder(folderId, null);
    }
  }

  /**
   * A folder can be dropped onto a target folder only if the target isn't the dragged
   * folder itself and isn't one of its descendants (otherwise we'd create a cycle).
   */
  private isValidFolderDropTarget(targetId: string, draggedId: string | null = this.draggedFolderId): boolean {
    if (!draggedId) return false;
    if (UUIDsEqual(targetId, draggedId)) return false;
    return !this.isDescendantOf(targetId, draggedId);
  }

  /** True when `nodeId` is a descendant of `ancestorId` in the folder tree. */
  private isDescendantOf(nodeId: string, ancestorId: string): boolean {
    const byId = new Map(this.engine.Projects.map(p => [NormalizeUUID(p.ID), p]));
    const visited = new Set<string>();
    let current = byId.get(NormalizeUUID(nodeId));
    while (current?.ParentID) {
      const parentKey = NormalizeUUID(current.ParentID);
      if (visited.has(parentKey)) break; // guard against malformed cycles
      visited.add(parentKey);
      if (UUIDsEqual(parentKey, ancestorId)) return true;
      current = byId.get(parentKey);
    }
    return false;
  }

  /** Assigns a conversation to a folder (or null to ungroup) and refreshes the view. */
  private async moveConversation(conversationId: string, projectId: string | null): Promise<void> {
    try {
      await this.engine.MoveConversationToProject(conversationId, projectId, this.currentUser);
      // Reveal the destination folder so the user sees where it landed
      if (projectId) {
        this.collapsedFolderIds.delete(NormalizeUUID(projectId));
      }
      this.rebuildGroups();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error moving conversation:', error);
      await this.dialogService.alert('Error', 'Failed to move conversation. Please try again.');
    }
  }

  /** Reparents a folder under another folder (or to the top level when projectId is null). */
  private async moveFolder(folderId: string, parentId: string | null): Promise<void> {
    // No-op if it's already under that parent
    const folder = this.engine.Projects.find(p => UUIDsEqual(p.ID, folderId));
    const currentParent = folder?.ParentID ?? null;
    const sameParent = (currentParent === null && parentId === null) ||
      (!!currentParent && !!parentId && UUIDsEqual(currentParent, parentId));
    if (sameParent) return;

    try {
      await this.engine.MoveProjectToParent(folderId, parentId, this.currentUser);
      // Reveal the new parent so the moved folder is visible
      if (parentId) {
        this.collapsedFolderIds.delete(NormalizeUUID(parentId));
      }
      this.rebuildGroups();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error moving folder:', error);
      await this.dialogService.alert('Error', 'Failed to move folder. Please try again.');
    }
  }

  // ========================================================================
  // MOVE-TO-FOLDER MENU
  // ========================================================================

  public openMoveSubmenu(conversationId: string, event: Event): void {
    event.stopPropagation();
    this.moveSubmenuConversationId = conversationId;
  }

  public closeMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.moveSubmenuConversationId = null;
  }

  public IsInFolder(conversation: MJConversationEntity, projectId: string): boolean {
    return !!conversation.ProjectID && UUIDsEqual(conversation.ProjectID, projectId);
  }

  public selectMoveTarget(conversation: MJConversationEntity, projectId: string | null): void {
    this.moveConversation(conversation.ID, projectId);
    this.closeMenu();
  }

  // ========================================================================
  // FOLDER CRUD (reuses the existing project form modal)
  // ========================================================================

  public createFolder(parentId: string | null, event?: Event): void {
    if (event) event.stopPropagation();
    this.openFolderModal(null, parentId);
  }

  public editFolder(project: MJProjectEntity, event?: Event): void {
    if (event) event.stopPropagation();
    this.openFolderModal(project, null);
  }

  public createFolderForConversation(conversation: MJConversationEntity, event: Event): void {
    event.stopPropagation();
    const conversationId = conversation.ID;
    this.closeMenu();
    this.openFolderModal(null, null, (created) => this.moveConversation(conversationId, created.ID));
  }

  private openFolderModal(
    project: MJProjectEntity | null,
    parentId: string | null,
    onCreated?: (project: MJProjectEntity) => void
  ): void {
    const dialogRef = this.mjDialogService.open({
      content: ProjectFormModalComponent,
      width: 600,
      minWidth: 400
    });

    const instance = dialogRef.Content!.instance as unknown as ProjectFormModalComponent;
    instance.dialogRef = dialogRef;
    instance.environmentId = this.environmentId;
    instance.currentUser = this.currentUser;
    if (project) instance.project = project;
    if (parentId) instance.parentId = parentId;

    instance.projectSaved.subscribe((saved: MJProjectEntity) => {
      // The engine's entity-event handler keeps the projects cache in sync; we
      // just reveal the parent and refresh, then run any post-create action.
      if (parentId) {
        this.collapsedFolderIds.delete(NormalizeUUID(parentId));
      }
      this.rebuildGroups();
      this.cdr.detectChanges();
      if (onCreated) onCreated(saved);
    });
  }

  public async deleteFolder(project: MJProjectEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();

    const node = this.findFolderNode(this.folderTree, project.ID);
    const total = node?.totalCount ?? 0;
    const childCount = node?.children.length ?? 0;

    let message = `Are you sure you want to delete the folder "${project.Name}"?`;
    if (total > 0 || childCount > 0) {
      message += `\n\nConversations inside will be moved out of the folder`;
      message += childCount > 0 ? ` and subfolders will move up one level.` : `.`;
      message += ` Nothing is deleted.`;
    }

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Folder',
      message,
      okText: 'Delete',
      cancelText: 'Cancel',
      dangerous: true
    });
    if (!confirmed) return;

    try {
      await this.engine.DeleteProject(project.ID, this.currentUser);
      this.collapsedFolderIds.delete(NormalizeUUID(project.ID));
      this.rebuildGroups();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error deleting folder:', error);
      await this.dialogService.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to delete folder. Please try again.'
      );
    }
  }

  IsConversationActive(conversation: MJConversationEntity): boolean {
    return UUIDsEqual(conversation.ID, this.selectedConversationId);
  }

  IsConversationRenamed(conversation: MJConversationEntity): boolean {
    return UUIDsEqual(conversation.ID, this.renamedConversationId);
  }

  IsMenuOpen(conversation: MJConversationEntity): boolean {
    return UUIDsEqual(this.openMenuConversationId, conversation.ID);
  }

  IsConversationDragging(conversation: MJConversationEntity): boolean {
    return UUIDsEqual(this.draggedConversationId, conversation.ID);
  }

  IsMoveSubmenuOpen(conversation: MJConversationEntity): boolean {
    return UUIDsEqual(this.moveSubmenuConversationId, conversation.ID);
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
          await this.engine.SaveConversation(
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
        const deletedId = conversation.ID;
        await this.engine.DeleteConversation(deletedId, this.currentUser);
        this.cdr.detectChanges();
        this.conversationDeleted.emit(deletedId);
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
    this.moveSubmenuConversationId = null;
  }

  async togglePin(conversation: MJConversationEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    this.closeMenu(); // Close immediately on user action — don't wait for the async op
    try {
      await this.engine.PinConversation(conversation.ID, !conversation.IsPinned, this.currentUser);
    } catch (error) {
      console.error('Error toggling pin:', error);
      await this.dialogService.alert('Error', 'Failed to pin/unpin conversation. Please try again.');
    }
  }

  hasActiveTasks(conversationId: string): boolean {
    return this.conversationIdsWithTasks.has(conversationId);
  }

  /** True when this conversation was shared with the current user by someone else. */
  isSharedWithMe(conversation: MJConversationEntity): boolean {
    return this.engine.GetSharedByInfo(conversation.ID) !== null;
  }

  /** Tooltip for the sidebar share icon: "Shared by {email or name}". */
  sharedWithMeTooltip(conversation: MJConversationEntity): string {
    const info = this.engine.GetSharedByInfo(conversation.ID);
    if (!info) return 'Shared with you';
    return `Shared by ${info.Email ?? info.Name ?? 'another user'}`;
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
        const result = await this.engine.DeleteMultipleConversations(
          Array.from(this.selectedConversationIds),
          this.currentUser
        );

        if (result.Failed.length > 0 && result.Successful.length > 0) {
          // Partial success
          const failedNames = result.Failed.map(f => `"${f.Name}"`).join(', ');
          await this.dialogService.alert(
            'Partial Success',
            `Deleted ${result.Successful.length} of ${count} conversations.\n\n` +
            `${result.Failed.length} could not be deleted: ${failedNames}`
          );
        } else if (result.Failed.length > 0 && result.Successful.length === 0) {
          // All failed
          await this.dialogService.alert(
            'Delete Failed',
            `None of the ${count} conversations could be deleted. They may have already been removed.`
          );
        }

        // Emit deleted events for successful deletions
        for (const id of result.Successful) {
          this.conversationDeleted.emit(id);
        }

      } catch (error) {
        console.error('Error deleting conversations:', error);
        await this.dialogService.alert('Error', 'Failed to delete conversations. Please try again.');
      } finally {
        // Always exit selection mode after an attempt, whether success or failure
        this.selectedConversationIds.clear();
        this.isSelectionMode = false;
        this.cdr.detectChanges();
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