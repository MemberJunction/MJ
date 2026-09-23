import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostListener, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { MJConversationEntity, MJProjectEntity, ConversationEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { MJDialogService } from '@memberjunction/ng-ui-components';
import { DialogService } from '../../services/dialog.service';
import { NotificationService } from '../../services/notification.service';
import { ActiveTasksService } from '../../services/active-tasks.service';
import { ProjectFormModalComponent } from '../project/project-form-modal.component';
import { ConversationGroupBy, ConversationSortBy, ConversationSortDirection } from '../../models/conversation-state.model';
import {
  MJResourcePermissionShareAdapter,
  ResourceShareContext,
  ResourceShareDialogResult
} from '@memberjunction/ng-resource-permissions';
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

/** Resource type the conversation share rows are written against. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

/** What a right-click menu was opened on. */
type ListContextMenuKind = 'conversation' | 'folder' | 'background';

/** An open right-click menu: where it sits, and what it acts on. */
interface ListContextMenu {
  kind: ListContextMenuKind;
  /** Viewport coordinates of the pointer (or of the ⋯ button). */
  x: number;
  y: number;
  /** The clicked conversation, for a conversation menu. */
  conversation: MJConversationEntity | null;
  /** The clicked folder, for a folder menu. */
  folder: MJProjectEntity | null;
  /** Conversations the actions apply to: the whole selection, or the clicked row. */
  targets: string[];
}

@Component({
  standalone: false,
  selector: 'mj-conversation-list',
  template: `
    <div class="conversation-list">
      <!-- Header strip gated as a whole so an empty bordered band never renders:
           the ⋯ menu also hides during selection mode, so it only counts toward
           the strip when actually visible. -->
      @if (showSearch || (showHeaderMenu && !isSelectionMode)) {
      <div class="list-header">
        <div class="header-top">
          @if (showSearch) {
            <div class="search-box">
              <input
                #searchInput
                type="text"
                class="search-input"
                placeholder="Search conversations..."
                [(ngModel)]="searchQuery"
                (keydown)="onSearchKeydown($event)">
              @if (isSearching) {
                <button class="search-clear" (click)="clearSearch()" title="Clear search">
                  <i class="fas fa-xmark"></i>
                </button>
              }
            </div>
          }
          @if (showHeaderMenu && !isSelectionMode) {
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
        <!-- Sort controls. Live in the header strip, so a host that hides all
             chrome (showSearch + showHeaderMenu both false) gets no sort row. -->
        <div class="sort-row">
          <button class="sort-btn" [class.active]="sortBy === 'date'"
                  (click)="setSort('date')"
                  [title]="sortBy === 'date' ? (sortDirection === 'asc' ? 'Oldest first' : 'Newest first') : 'Sort by date'">
            <i class="fas" [ngClass]="sortIcon('date')"></i>
            <span>Date</span>
          </button>
          <button class="sort-btn" [class.active]="sortBy === 'name'"
                  (click)="setSort('name')"
                  [title]="sortBy === 'name' ? (sortDirection === 'asc' ? 'A to Z' : 'Z to A') : 'Sort by name'">
            <i class="fas" [ngClass]="sortIcon('name')"></i>
            <span>Name</span>
          </button>
        </div>
      </div>
      }
      @if (showNewConversationButton) {
        <button class="btn-new-conversation" (click)="createNewConversation()" title="New Conversation">
          <i class="fas fa-plus"></i>
          <span>New Conversation</span>
        </button>
      }
      <div class="list-content"
           (click)="onListBackgroundClick($event)"
           (contextmenu)="onBackgroundContextMenu($event)">
        <!-- Pinned Section (only show if there are pinned conversations) -->
        @if (pinnedConversations.length > 0) {
          <div class="sidebar-section pinned-section">
            @if (showSectionHeaders) {
              <div class="section-header" [class.expanded]="pinnedExpanded" (click)="togglePinned()">
                <div class="section-title">
                  <i class="fas fa-chevron-right"></i>
                  <i class="fas fa-thumbtack section-icon"></i>
                  <span>Pinned</span>
                </div>
              </div>
            }
            <div class="chat-list" [class.expanded]="!showSectionHeaders || pinnedExpanded">
              @for (conversation of pinnedConversations; track conversation.ID) {
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        }

        <!-- showSectionHeaders=false forces the FLAT branch even in project
             grouping: the folder tree's root drop-zone and New Folder action
             live in the section header, so rendering the tree without headers
             would let a user drag a folder INTO another folder with no way to
             ever drag it back out (a one-way door). Flat + headerless is the
             coherent chrome-less rendering. -->
        @if (showSectionHeaders && groupBy === 'project') {
          <!-- Folders Section. NOTE: this whole branch is already gated on
               showSectionHeaders above, so the header + collapse state here are
               unconditional — a headerless folder tree never renders. -->
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
            <!-- Same as Folders above: reached only when showSectionHeaders is true. -->
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
            @if (showSectionHeaders) {
              <div class="section-header" [class.expanded]="directMessagesExpanded" (click)="toggleDirectMessages()">
                <div class="section-title">
                  <i class="fas fa-chevron-right"></i>
                  <span>Messages</span>
                </div>
              </div>
            }
            <div class="chat-list" [class.expanded]="!showSectionHeaders || directMessagesExpanded">
              @for (conversation of unpinnedConversations; track conversation.ID) {
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        }
      </div>

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
           (contextmenu)="onFolderContextMenu(node.project, $event)"
           [title]="node.project.Name">
        <i class="fas fa-chevron-right folder-chevron" [class.expanded]="isFolderExpanded(node.project.ID)"></i>
        <i class="fas {{ node.project.Icon || 'fa-folder' }} folder-icon" [style.color]="node.project.Color || null"></i>
        <span class="folder-name">{{ node.project.Name }}</span>
        <span class="folder-count">{{ node.totalCount }}</span>
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
           [class.selected]="IsConversationSelected(conversation)"
           [class.renamed]="IsConversationRenamed(conversation)"
           [class.dragging]="IsConversationDragging(conversation)"
           [style.paddingLeft.px]="depth ? 16 + depth * 14 : 16"
           [draggable]="true"
           (dragstart)="onConversationDragStart(conversation, $event)"
           (dragend)="onConversationDragEnd()"
           (dragover)="onConversationRowDragOver(conversation, $event)"
           (dragleave)="onDragLeave(conversationDropTargetId(conversation))"
           (drop)="onConversationRowDrop(conversation, $event)"
           (click)="handleConversationClick(conversation, $event)"
           (contextmenu)="onConversationContextMenu(conversation, $event)">
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
        <div class="conversation-actions">
          <button class="menu-btn" (click)="openRowMenu(conversation, $event)" title="More options">
            <i class="fas fa-ellipsis"></i>
          </button>
        </div>
      </div>
    </ng-template>

    <mj-resource-share-dialog
      [Visible]="isShareDialogOpen"
      [Contexts]="shareContexts"
      [Adapter]="shareAdapter"
      [Notice]="shareNotice"
      ResourceLabel="conversation"
      (Result)="onShareDialogResult($event)">
    </mj-resource-share-dialog>

    <!-- One menu for every right-click target: a conversation row (the clicked
         row, or the whole selection when it is part of it), a folder row, or the
         empty space of the list. Fixed-positioned at the pointer. -->
    @if (contextMenu) {
      <div class="list-context-menu"
           [style.left.px]="contextMenu.x"
           [style.top.px]="contextMenu.y"
           (click)="$event.stopPropagation()"
           (contextmenu)="$event.preventDefault(); $event.stopPropagation()">
        @switch (contextMenu.kind) {
          @case ('conversation') {
            @if (isMoveSubmenuOpen) {
              <button class="menu-item back" (click)="closeMoveSubmenu($event)">
                <i class="fas fa-chevron-left"></i>
                <span>Move to folder</span>
              </button>
              <div class="menu-divider"></div>
              <div class="move-folder-list">
                <button class="menu-item" [class.current]="isSingleTargetInFolder(null)" (click)="contextMoveToFolder(null)">
                  <i class="fas fa-inbox"></i>
                  <span>No folder</span>
                </button>
                @for (f of flatFolders; track f.project.ID) {
                  <button class="menu-item" [class.current]="isSingleTargetInFolder(f.project.ID)"
                          [style.paddingLeft.px]="14 + f.depth * 12"
                          (click)="contextMoveToFolder(f.project.ID)">
                    <i class="fas {{ f.project.Icon || 'fa-folder' }}" [style.color]="f.project.Color || null"></i>
                    <span>{{ f.project.Name }}</span>
                  </button>
                }
              </div>
              <div class="menu-divider"></div>
              <button class="menu-item" (click)="contextMoveToNewFolder($event)">
                <i class="fas fa-folder-plus"></i>
                <span>New folder&hellip;</span>
              </button>
            } @else {
              @if (contextMenu.targets.length > 1) {
                <div class="context-menu-header">{{ contextMenu.targets.length }} selected</div>
                <button class="menu-item" (click)="contextSetPinned(true)">
                  <i class="fas fa-thumbtack"></i>
                  <span>Pin</span>
                </button>
                <button class="menu-item" (click)="contextSetPinned(false)">
                  <i class="fas fa-thumbtack fa-rotate-90"></i>
                  <span>Unpin</span>
                </button>
              } @else {
                <button class="menu-item" (click)="contextTogglePin()">
                  <i class="fas fa-thumbtack"></i>
                  <span>{{ contextMenu.conversation?.IsPinned ? 'Unpin' : 'Pin' }}</span>
                </button>
              }
              <button class="menu-item" (click)="openMoveSubmenu($event)">
                <i class="fas fa-folder-tree"></i>
                <span>Move to folder</span>
                <i class="fas fa-chevron-right submenu-arrow"></i>
              </button>
              <button class="menu-item" (click)="contextShare()">
                <i class="fas fa-user-plus"></i>
                <span>{{ contextMenu.targets.length > 1 ? 'Share ' + contextMenu.targets.length + ' conversations' : 'Share' }}</span>
              </button>
              @if (contextMenu.targets.length === 1) {
                <button class="menu-item" (click)="contextRename()">
                  <i class="fas fa-edit"></i>
                  <span>Rename</span>
                </button>
              }
              <div class="menu-divider"></div>
              <button class="menu-item danger" (click)="contextDelete()">
                <i class="fas fa-trash"></i>
                <span>{{ contextMenu.targets.length > 1 ? 'Delete ' + contextMenu.targets.length : 'Delete' }}</span>
              </button>
            }
          }
          @case ('folder') {
            <button class="menu-item" (click)="contextCreateSubfolder($event)">
              <i class="fas fa-folder-plus"></i>
              <span>New Subfolder</span>
            </button>
            <button class="menu-item" (click)="contextEditFolder($event)">
              <i class="fas fa-pen"></i>
              <span>Rename</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item danger" (click)="contextDeleteFolder($event)">
              <i class="fas fa-trash"></i>
              <span>Delete</span>
            </button>
          }
          @default {
            <button class="menu-item" (click)="contextNewConversation()">
              <i class="fas fa-plus"></i>
              <span>New Conversation</span>
            </button>
            <button class="menu-item" (click)="contextCreateRootFolder($event)">
              <i class="fas fa-folder-plus"></i>
              <span>New Folder</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" (click)="contextSelectAll()">
              <i class="fas fa-check-double"></i>
              <span>Select All</span>
            </button>
          }
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      /* White-label theming tokens for the list panel. The public
         --mj-chat-list-* custom properties are host-overridable (set
         them at :root or on any ancestor); the private --conv-list-* names
         resolve the fallback ONCE here so the 70+ usages below stay simple.
         (A self-referential var() fallback would be a custom-property cycle,
         so the two-name indirection is required, not stylistic.) Defaults
         preserve the stock look exactly: a brand-secondary panel with
         on-secondary ink. Hover/border/divider states derive from the ink via
         color-mix, so they follow automatically when the ink is remapped.
         The accent trio drives the panel's ACTION surfaces (New Conversation
         button, search-focus ring, checkbox tick, drag-over highlights) —
         independent of the active-row pair so a host can tint actions on their
         own; defaults to the brand-primary action color, unchanged.
         --conv-list-hover-bg is the row-hover wash: it defaults to the same
         ink-derived tint as before (so a bg/ink remap still gives a neutral
         hover), but a host can point it at a brand tint to make hover an accent
         cue while keeping the panel itself on a neutral surface. */
      --conv-list-bg: var(--mj-chat-list-bg, var(--mj-brand-secondary));
      --conv-list-ink: var(--mj-chat-list-ink, var(--mj-brand-on-secondary));
      --conv-list-active-bg: var(--mj-chat-list-active-bg, var(--mj-brand-primary));
      --conv-list-active-ink: var(--mj-chat-list-active-ink, var(--mj-brand-on-secondary));
      --conv-list-active-hover-bg: var(--mj-chat-list-active-hover-bg, var(--mj-brand-primary-hover));
      --conv-list-accent: var(--mj-chat-list-accent, var(--mj-brand-primary));
      --conv-list-accent-ink: var(--mj-chat-list-accent-ink, var(--mj-text-inverse));
      --conv-list-accent-hover: var(--mj-chat-list-accent-hover, var(--mj-brand-primary-hover));
      --conv-list-hover-bg: var(--mj-chat-list-hover-bg, color-mix(in srgb, var(--conv-list-ink) 8%, transparent));
    }
    .conversation-list { display: flex; flex-direction: column; height: 100%; background: var(--conv-list-bg); }
    .list-header { padding: 8px; border-bottom: 1px solid color-mix(in srgb, var(--conv-list-ink) 10%, transparent); }
    .search-box { position: relative; flex: 1; min-width: 0; display: flex; }
    .search-clear {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: color-mix(in srgb, var(--conv-list-ink) 55%, transparent);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .sort-row { display: flex; gap: 6px; margin-top: 8px; }
    .sort-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--conv-list-ink) 70%, transparent);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .sort-btn i { font-size: 11px; }
    .sort-btn:hover { background: var(--conv-list-hover-bg); color: var(--conv-list-ink); }
    .sort-btn.active {
      background: color-mix(in srgb, var(--conv-list-accent) 18%, transparent);
      border-color: var(--conv-list-accent);
      color: var(--conv-list-ink);
      font-weight: 600;
    }
    .search-clear:hover { background: color-mix(in srgb, var(--conv-list-ink) 12%, transparent); color: var(--conv-list-ink); }
    .search-input {
      width: 100%;
      padding: 8px 28px 8px 12px;
      background: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 20%, transparent);
      border-radius: 6px;
      color: var(--conv-list-ink);
      font-size: 13px;
      transition: all 0.2s;
    }
    .search-input::placeholder { color: color-mix(in srgb, var(--conv-list-ink) 50%, transparent); }
    .search-input:focus { outline: none; background: color-mix(in srgb, var(--conv-list-ink) 15%, transparent); border-color: var(--conv-list-accent); }
    .btn-new-conversation {
      width: calc(100% - 16px);
      margin: 8px;
      padding: 10px;
      background: var(--conv-list-accent);
      color: var(--conv-list-accent-ink);
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
    .btn-new-conversation:hover { background: var(--conv-list-accent-hover); }
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
      color: var(--conv-list-ink);
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s;
      user-select: none;
    }
    .section-header:hover { background: color-mix(in srgb, var(--conv-list-ink) 8%, transparent); }
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
      color: color-mix(in srgb, var(--conv-list-ink) 70%, transparent);
      font-size: 14px;
      min-height: 45px;
    }
    .conversation-item:hover { background: var(--conv-list-hover-bg); color: var(--conv-list-ink); }
    .conversation-item:hover .conversation-actions { opacity: 1; }
    .conversation-item.active { background: var(--conv-list-active-bg); color: var(--conv-list-active-ink); }
    /* Selected rows carry the state themselves (no checkbox column). The inset
       bar is a box-shadow, not a border, so it never shifts the row's indent —
       folder depth is applied as padding-left. The open conversation keeps its
       solid .active fill, so a row that is both still reads as the open one. */
    .conversation-item.selected { background: color-mix(in srgb, var(--conv-list-accent) 16%, transparent); box-shadow: inset 3px 0 0 var(--conv-list-accent); }
    .conversation-item.selected:hover { background: color-mix(in srgb, var(--conv-list-accent) 24%, transparent); }
    .conversation-item.active.selected { background: var(--conv-list-active-bg); }
    .conversation-icon-wrapper { position: relative; flex-shrink: 0; }
    .conversation-icon { font-size: 12px; width: 16px; text-align: center; }
    .conversation-icon.has-tasks { color: var(--mj-status-warning); }
    .badge-overlay { position: absolute; top: -4px; right: -4px; }
    .conversation-info { flex: 1; min-width: 0; }
    .conversation-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
    .shared-indicator { font-size: 10px; color: color-mix(in srgb, var(--conv-list-ink) 55%, transparent); flex-shrink: 0; }
    .conversation-item.active .shared-indicator { color: color-mix(in srgb, var(--conv-list-active-ink) 85%, transparent); }
    .conversation-preview { font-size: 12px; color: color-mix(in srgb, var(--conv-list-ink) 50%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conversation-item.active .conversation-preview { color: color-mix(in srgb, var(--conv-list-active-ink) 80%, transparent); }
    .conversation-meta { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

    /* Project Badge */
    .project-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      margin-left: auto;
      background-color: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      color: color-mix(in srgb, var(--conv-list-ink) 60%, transparent);
      white-space: nowrap;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .conversation-item:hover .project-badge {
      background-color: color-mix(in srgb, var(--conv-list-ink) 15%, transparent);
      color: color-mix(in srgb, var(--conv-list-ink) 80%, transparent);
    }
    .conversation-item.active .project-badge {
      background-color: color-mix(in srgb, var(--conv-list-active-ink) 20%, transparent);
      color: var(--conv-list-active-ink);
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
      color: color-mix(in srgb, var(--conv-list-ink) 70%, transparent);
      background: var(--conv-list-bg) !important;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .menu-btn:hover {
      background: color-mix(in srgb, var(--conv-list-ink) 15%, transparent) !important;
      color: var(--conv-list-ink);
    }
    .conversation-item.active .menu-btn {
      background: var(--conv-list-active-hover-bg) !important;
      color: var(--conv-list-active-ink);
    }
    .menu-btn i { font-size: 14px; }

    /* The one right-click menu. Fixed to the viewport so it escapes the list's
       scroll container and is never clipped by a row. */
    .list-context-menu {
      position: fixed;
      min-width: 190px;
      max-height: 70vh;
      overflow-y: auto;
      background: var(--conv-list-bg);
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 15%, transparent);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-lg);
      z-index: 1001;
      padding: 4px 0;
    }

    .context-menu-header {
      padding: 6px 14px 8px;
      font-size: 12px;
      font-weight: 600;
      color: color-mix(in srgb, var(--conv-list-ink) 60%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      margin-bottom: 4px;
    }

    .context-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      min-width: 160px;
      background: var(--conv-list-bg);
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 15%, transparent);
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
      color: color-mix(in srgb, var(--conv-list-ink) 85%, transparent);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
    }

    .menu-item:hover {
      background: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      color: var(--conv-list-ink);
    }

    .menu-item i {
      width: 16px;
      font-size: 13px;
      color: color-mix(in srgb, var(--conv-list-ink) 60%, transparent);
    }

    .menu-item:hover i {
      color: var(--conv-list-ink);
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
      background: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      margin: 4px 0;
    }

    /* Rename Animation */
    .conversation-item.renamed {
      animation: renameHighlight 1500ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Brand-token ramp (was hardcoded tailwind blue/purple/emerald rgba values,
       which ignored theming): primary/accent open the flash, success/primary
       carry the fade, at the original alpha ramp (40/35/30/20; glows 50-20). */
    @keyframes renameHighlight {
      0% {
        background: linear-gradient(90deg,
          color-mix(in srgb, var(--mj-brand-primary) 40%, transparent),
          color-mix(in srgb, var(--mj-brand-accent) 40%, transparent));
        transform: scale(1.03);
        box-shadow: 0 0 20px color-mix(in srgb, var(--mj-brand-primary) 50%, transparent);
      }
      25% {
        background: linear-gradient(90deg,
          color-mix(in srgb, var(--mj-brand-primary) 35%, transparent),
          color-mix(in srgb, var(--mj-brand-accent) 35%, transparent));
        box-shadow: 0 0 15px color-mix(in srgb, var(--mj-brand-primary) 40%, transparent);
      }
      50% {
        background: linear-gradient(90deg,
          color-mix(in srgb, var(--mj-status-success) 30%, transparent),
          color-mix(in srgb, var(--mj-brand-primary) 30%, transparent));
        transform: scale(1.02);
        box-shadow: 0 0 10px color-mix(in srgb, var(--mj-status-success) 30%, transparent);
      }
      75% {
        background: linear-gradient(90deg,
          color-mix(in srgb, var(--mj-status-success) 20%, transparent),
          color-mix(in srgb, var(--mj-brand-primary) 20%, transparent));
        box-shadow: 0 0 5px color-mix(in srgb, var(--mj-status-success) 20%, transparent);
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
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--conv-list-ink) 70%, transparent);
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-menu:hover {
      background: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      color: var(--conv-list-ink);
      border-color: color-mix(in srgb, var(--conv-list-ink) 30%, transparent);
    }

    .header-dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      min-width: 200px;
      background: var(--conv-list-bg);
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 15%, transparent);
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
      color: color-mix(in srgb, var(--conv-list-ink) 85%, transparent);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
    }

    .header-dropdown-menu .dropdown-item:hover {
      background: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      color: var(--conv-list-ink);
    }

    .header-dropdown-menu .dropdown-item i {
      width: 16px;
      font-size: 13px;
      color: color-mix(in srgb, var(--conv-list-ink) 60%, transparent);
    }

    .header-dropdown-menu .dropdown-item:hover i {
      color: var(--conv-list-ink);
    }

    .header-dropdown-menu .dropdown-item .shortcut {
      margin-left: auto;
      font-size: 11px;
      color: color-mix(in srgb, var(--conv-list-ink) 40%, transparent);
      font-family: system-ui, -apple-system, sans-serif;
    }

    .btn-select {
      padding: 8px 12px;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--conv-list-ink) 70%, transparent);
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
      background: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      color: var(--conv-list-ink);
      border-color: color-mix(in srgb, var(--conv-list-ink) 30%, transparent);
    }


    .selection-action-bar {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--conv-list-bg);
      border-top: 1px solid color-mix(in srgb, var(--conv-list-ink) 15%, transparent);
      gap: 12px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 12px;
      color: color-mix(in srgb, var(--conv-list-ink) 90%, transparent);
      font-size: 14px;
      font-weight: 500;
      flex: 1 1 auto;
      min-width: 150px;
    }

    .selection-count {
      color: var(--conv-list-ink);
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
      color: var(--conv-list-ink);
    }

    .selection-actions {
      display: flex;
      gap: 8px;
      flex: 0 0 auto;
    }

    .btn-cancel {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--conv-list-ink) 70%, transparent);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-cancel:hover {
      background: color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      color: var(--conv-list-ink);
    }

    .btn-delete-bulk {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: var(--mj-status-error);
      border: none;
      border-radius: 6px;
      /* Deliberately NOT --conv-list-ink: this ink sits on the error-red button,
         not the panel, so it must not follow a panel remap. (brand-on-secondary
         stays light in both modes; text-inverse flips dark in dark mode.) */
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

    .bulk-move-container { position: relative; }

    .btn-bulk {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 20%, transparent);
      border-radius: 6px;
      color: color-mix(in srgb, var(--conv-list-ink) 80%, transparent);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .btn-bulk i { font-size: 12px; }
    .btn-bulk:hover:not(:disabled) { background: var(--conv-list-hover-bg); color: var(--conv-list-ink); }
    .btn-bulk:disabled { opacity: 0.5; cursor: not-allowed; }

    .bulk-move-menu {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      min-width: 200px;
      max-height: 260px;
      overflow-y: auto;
      background: var(--conv-list-bg);
      border: 1px solid color-mix(in srgb, var(--conv-list-ink) 20%, transparent);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      z-index: 20;
      padding: 4px 0;
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
      color: color-mix(in srgb, var(--conv-list-ink) 60%, transparent);
      cursor: pointer;
      transition: all 0.2s;
    }
    .section-action-btn:hover {
      background: color-mix(in srgb, var(--conv-list-ink) 15%, transparent);
      color: var(--conv-list-ink);
    }
    .section-action-btn i { font-size: 12px; }

    .folder-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px 5px 12px;
      cursor: pointer;
      color: color-mix(in srgb, var(--conv-list-ink) 80%, transparent);
      font-size: 13px;
      transition: background 0.15s;
      user-select: none;
      position: relative;
    }
    .folder-row:hover { background: color-mix(in srgb, var(--conv-list-ink) 8%, transparent); }
    .folder-row.drag-over {
      background: color-mix(in srgb, var(--conv-list-accent) 25%, transparent);
      box-shadow: inset 0 0 0 1px var(--conv-list-accent);
    }
    .folder-row.dragging { opacity: 0.4; }
    .section-header.drag-over {
      background: color-mix(in srgb, var(--conv-list-accent) 18%, transparent);
      box-shadow: inset 0 0 0 1px var(--conv-list-accent);
      border-radius: 6px;
    }
    .folder-chevron {
      font-size: 9px;
      width: 10px;
      flex-shrink: 0;
      transition: transform 0.2s;
      color: color-mix(in srgb, var(--conv-list-ink) 55%, transparent);
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
      color: color-mix(in srgb, var(--conv-list-ink) 50%, transparent);
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
      color: color-mix(in srgb, var(--conv-list-ink) 60%, transparent);
      cursor: pointer;
      transition: all 0.15s;
    }
    .folder-action-btn:hover {
      background: color-mix(in srgb, var(--conv-list-ink) 18%, transparent);
      color: var(--conv-list-ink);
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
      color: color-mix(in srgb, var(--conv-list-ink) 45%, transparent);
    }
    .ungrouped-section.drag-over {
      background: color-mix(in srgb, var(--conv-list-accent) 12%, transparent);
      box-shadow: inset 0 0 0 1px var(--conv-list-accent);
      border-radius: 6px;
    }

    /* Dragging state */
    .conversation-item { user-select: none; }
    .conversation-item.dragging { opacity: 0.4; }

    /* Move-to-folder submenu */
    .menu-item.back { font-weight: 600; }
    .menu-item .submenu-arrow { margin-left: auto; font-size: 10px; }
    .menu-item.current { background: color-mix(in srgb, var(--conv-list-accent) 18%, transparent); }
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

  // ── White-label chrome toggles (all default true = stock rendering) ──
  /** Show the search box in the list header. Flipping to false clears any active
   *  search so a hidden filter can't keep silently narrowing the list. */
  @Input()
  set showSearch(value: boolean) {
    if (!value && this._searchQuery) {
      this.searchQuery = ''; // setter rebuilds the groupings
    }
    this._showSearch = value;
  }
  get showSearch(): boolean {
    return this._showSearch;
  }
  private _showSearch = true;
  /** Show the "New Conversation" button. */
  @Input() showNewConversationButton: boolean = true;
  /** Show the ⋯ header options menu (refresh / select / group-by / hide sidebar). */
  @Input() showHeaderMenu: boolean = true;
  /** Show the collapsible Pinned / Folders / Messages section headers. When false,
   *  the list renders FLAT and fully expanded: folder grouping is bypassed (the
   *  folder tree's root drop-zone and New Folder action live in the section
   *  header, so a headerless tree would allow one-way folder nesting) — the
   *  chrome-less rendering for embedded hosts. */
  @Input() showSectionHeaders: boolean = true;

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
  /** The open right-click menu, or null. Positioned at the pointer. */
  public contextMenu: ListContextMenu | null = null;

  /** True while the open conversation menu is showing its folder picker. */
  public isMoveSubmenuOpen: boolean = false;

  /** Resources the share dialog is currently offering, one per conversation. */
  public shareContexts: ResourceShareContext[] = [];
  public shareNotice: string | null = null;
  public isShareDialogOpen: boolean = false;
  public shareAdapter = new MJResourcePermissionShareAdapter(CONVERSATIONS_RESOURCE_TYPE_ID);
  public conversationIdsWithTasks = new Set<string>();
  public isSelectionMode: boolean = false;
  public selectedConversationIds = new Set<string>();

  /** Row a Shift-click ranges from — the last row picked without Shift. */
  private selectionAnchorId: string | null = null;

  public isHeaderMenuOpen: boolean = false;

  public isRefreshing: boolean = false;

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  /** UserInfoEngine key for persisting folder collapse state + group-by mode. */
  private static readonly FolderPrefsKey = 'mj.conversations.folderPrefs.v1';

  /** How the conversation list is grouped. 'project' = folders, 'none' = flat list. */
  public groupBy: ConversationGroupBy = 'project';

  /** Field every section of the list is sorted on. */
  public sortBy: ConversationSortBy = 'date';

  /** Direction of the current sort. */
  public sortDirection: ConversationSortDirection = 'desc';

  /** Direction each field falls back to when it becomes the active sort. */
  private static readonly DefaultSortDirections: Record<ConversationSortBy, ConversationSortDirection> = {
    date: 'desc',
    name: 'asc'
  };

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
  /** Conversations currently being dragged — the whole selection when the grabbed row is part of it. */
  public draggedConversationIds: string[] = [];
  public draggedFolderId: string | null = null;
  public dragOverTargetId: string | null = null;

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

  /** Clears the search box and returns focus to it. */
  public clearSearch(): void {
    this.searchQuery = '';
    this.searchInput?.nativeElement.focus();
  }

  /** Escape in the search box clears it without closing any host overlay. */
  public onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isSearching) {
      event.stopPropagation();
      this.clearSearch();
    }
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
    if (this.contextMenu) {
      this.closeContextMenu();
    }
    if (this.isHeaderMenuOpen) {
      this.closeHeaderMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.contextMenu) {
      this.closeContextMenu();
      return;
    }
    if (this.isSelectionMode) {
      this.exitSelectionMode();
    }
  }

  public toggleHeaderMenu(event: Event): void {
    event.stopPropagation();
    this.isHeaderMenuOpen = !this.isHeaderMenuOpen;
  }

  public closeHeaderMenu(): void {
    this.isHeaderMenuOpen = false;
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
  /**
   * Makes `field` the active sort. Choosing the field that is already active
   * flips the direction; switching fields starts from that field's natural
   * direction (newest first for date, A-Z for name).
   */
  public setSort(field: ConversationSortBy): void {
    if (this.sortBy === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDirection = ConversationListComponent.DefaultSortDirections[field];
    }
    this.saveFolderPrefs();
    this.rebuildGroups();
  }

  /** Icon for a sort button: direction arrow when active, plain field icon otherwise. */
  public sortIcon(field: ConversationSortBy): string {
    if (this.sortBy !== field) {
      return field === 'date' ? 'fa-clock' : 'fa-font';
    }
    if (field === 'date') {
      return this.sortDirection === 'asc' ? 'fa-arrow-up-1-9' : 'fa-arrow-down-9-1';
    }
    return this.sortDirection === 'asc' ? 'fa-arrow-up-a-z' : 'fa-arrow-down-z-a';
  }

  /**
   * Orders conversations by the active sort. Returns a new array so the caller's
   * source list is never mutated. Conversations with no name sort last.
   */
  private sortConversations(conversations: MJConversationEntity[]): MJConversationEntity[] {
    const factor = this.sortDirection === 'asc' ? 1 : -1;
    return [...conversations].sort((a, b) => {
      if (this.sortBy === 'name') {
        const aName = a.Name?.trim() ?? '';
        const bName = b.Name?.trim() ?? '';
        if (!aName || !bName) {
          return aName === bName ? 0 : (aName ? -1 : 1);
        }
        return aName.localeCompare(bName, undefined, { sensitivity: 'base' }) * factor;
      }
      return (this.updatedTime(a) - this.updatedTime(b)) * factor;
    });
  }

  /** Position of a conversation in a rendered-order list, or -1. Case-insensitive on the ID. */
  private indexOfConversation(order: string[], conversationId: string | null): number {
    if (!conversationId) return -1;
    return order.findIndex(id => UUIDsEqual(id, conversationId));
  }

  private updatedTime(conversation: MJConversationEntity): number {
    const updatedAt = conversation.__mj_UpdatedAt;
    return updatedAt ? new Date(updatedAt).getTime() : 0;
  }

  private rebuildGroups(): void {
    const matching = this.sortConversations(this.filterConversations(this.engine.Conversations));
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
      const parsed = JSON.parse(raw) as {
        collapsed?: string[];
        groupBy?: ConversationGroupBy;
        sortBy?: ConversationSortBy;
        sortDirection?: ConversationSortDirection;
      };
      this.collapsedFolderIds = new Set((parsed.collapsed ?? []).map(id => NormalizeUUID(id)));
      if (parsed.groupBy === 'none' || parsed.groupBy === 'project') {
        this.groupBy = parsed.groupBy;
      }
      if (parsed.sortBy === 'date' || parsed.sortBy === 'name') {
        this.sortBy = parsed.sortBy;
      }
      if (parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc') {
        this.sortDirection = parsed.sortDirection;
      }
    } catch {
      // Corrupt/legacy value — ignore and use defaults
    }
  }

  private saveFolderPrefs(): void {
    const payload = JSON.stringify({
      collapsed: Array.from(this.collapsedFolderIds),
      groupBy: this.groupBy,
      sortBy: this.sortBy,
      sortDirection: this.sortDirection
    });
    UserInfoEngine.Instance.SetSettingDebounced(ConversationListComponent.FolderPrefsKey, payload);
  }

  // ========================================================================
  // DRAG & DROP (move conversation into/out of a folder)
  // ========================================================================

  /**
   * Starts a conversation drag. Grabbing a row that is part of the current
   * selection drags the whole selection; grabbing any other row drags that row
   * alone and leaves the selection untouched.
   */
  public onConversationDragStart(conversation: MJConversationEntity, event: DragEvent): void {
    this.draggedFolderId = null;
    this.draggedConversationIds = this.selectedConversationIds.has(conversation.ID)
      ? Array.from(this.selectedConversationIds)
      : [conversation.ID];
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.draggedConversationIds.join(','));
    }
  }

  public onConversationDragEnd(): void {
    this.draggedConversationIds = [];
    this.dragOverTargetId = null;
  }

  public onFolderDragStart(node: FolderNode, event: DragEvent): void {
    event.stopPropagation();
    this.draggedConversationIds = [];
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
    const accepts = this.draggedConversationIds.length > 0
      ? true
      : this.draggedFolderId
        ? this.isValidFolderDropTarget(projectId)
        : false;
    if (!accepts) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = projectId;
  }

  /**
   * Drop target id for a conversation row: its folder, or the Ungrouped section
   * when it has none. Resolved through the folder tree so the highlight matches
   * the folder row's own ID regardless of how the conversation stores it.
   */
  public conversationDropTargetId(conversation: MJConversationEntity): string {
    if (!conversation.ProjectID) return 'ungrouped';
    const node = this.flatFolders.find(f => UUIDsEqual(f.project.ID, conversation.ProjectID!));
    return node ? node.project.ID : 'ungrouped';
  }

  /**
   * A conversation row accepts a conversation drag and stands in for its folder,
   * so dropping onto the rows inside a folder files the drag there too. A row
   * that is part of the drag itself is not a target.
   */
  public onConversationRowDragOver(conversation: MJConversationEntity, event: DragEvent): void {
    if (this.draggedConversationIds.length === 0) return;
    if (this.draggedConversationIds.some(id => UUIDsEqual(id, conversation.ID))) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = this.conversationDropTargetId(conversation);
  }

  public async onConversationRowDrop(conversation: MJConversationEntity, event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const conversationIds = this.draggedConversationIds.filter(id => !UUIDsEqual(id, conversation.ID));
    this.dragOverTargetId = null;
    this.draggedConversationIds = [];
    if (conversationIds.length > 0) {
      await this.moveConversations(conversationIds, conversation.ProjectID ?? null);
    }
  }

  public onUngroupedDragOver(event: DragEvent): void {
    if (this.draggedConversationIds.length === 0) return;
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

  public async onFolderDrop(project: MJProjectEntity, event: DragEvent): Promise<void> {
    event.preventDefault();
    const conversationIds = this.draggedConversationIds;
    const folderId = this.draggedFolderId;
    this.dragOverTargetId = null;
    this.draggedConversationIds = [];
    this.draggedFolderId = null;
    if (conversationIds.length > 0) {
      await this.moveConversations(conversationIds, project.ID);
    } else if (folderId && this.isValidFolderDropTarget(project.ID, folderId)) {
      await this.moveFolder(folderId, project.ID);
    }
  }

  public async onUngroupedDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const conversationIds = this.draggedConversationIds;
    this.dragOverTargetId = null;
    this.draggedConversationIds = [];
    if (conversationIds.length > 0) {
      await this.moveConversations(conversationIds, null);
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
    await this.moveConversations([conversationId], projectId);
  }

  /**
   * Assigns several conversations to a folder (or null to ungroup) in one batch,
   * reveals the destination folder, and refreshes the view.
   */
  private async moveConversations(conversationIds: string[], projectId: string | null): Promise<void> {
    // Dropping onto a folder's own contents is easy to do by accident — skip the
    // conversations that already live there rather than re-saving them.
    const toMove = conversationIds.filter(id => !this.isInProject(id, projectId));
    if (toMove.length === 0) return;

    try {
      const result = await this.engine.MoveMultipleConversationsToProject(toMove, projectId, this.currentUser);
      // Reveal the destination folder so the user sees where they landed
      if (projectId) {
        this.collapsedFolderIds.delete(NormalizeUUID(projectId));
      }
      await this.reportBulkOutcome(result, 'moved');
      this.rebuildGroups();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error moving conversations:', error);
      await this.dialogService.alert(
        'Error',
        `Failed to move the selected conversation${toMove.length === 1 ? '' : 's'}. Please try again.`
      );
    }
  }

  /** True when a conversation already sits in the given folder (or in no folder). */
  private isInProject(conversationId: string, projectId: string | null): boolean {
    const conversation = this.engine.GetConversation(conversationId);
    if (!conversation) return false;
    const current = conversation.ProjectID ?? null;
    return projectId ? !!current && UUIDsEqual(current, projectId) : !current;
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
  // RIGHT-CLICK MENU — one menu for rows, folders and empty space
  // ========================================================================

  /**
   * Opens the conversation menu. It acts on the whole selection when the clicked
   * row is part of it, and on that row alone otherwise — so right-clicking
   * something you had not selected never disturbs the selection.
   */
  public onConversationContextMenu(conversation: MJConversationEntity, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const targets = this.selectedConversationIds.has(conversation.ID)
      ? Array.from(this.selectedConversationIds)
      : [conversation.ID];
    this.openContextMenu({ kind: 'conversation', conversation, folder: null, targets }, event.clientX, event.clientY);
  }

  /** The row's ⋯ button opens the same menu, anchored under the button. */
  public openRowMenu(conversation: MJConversationEntity, event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    const targets = this.selectedConversationIds.has(conversation.ID)
      ? Array.from(this.selectedConversationIds)
      : [conversation.ID];
    this.openContextMenu(
      { kind: 'conversation', conversation, folder: null, targets },
      rect ? rect.left : event.clientX,
      rect ? rect.bottom + 2 : event.clientY
    );
  }

  public onFolderContextMenu(project: MJProjectEntity, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.openContextMenu({ kind: 'folder', conversation: null, folder: project, targets: [] }, event.clientX, event.clientY);
  }

  /** Empty space: a click that landed on a row or folder is theirs, not the list's. */
  public onBackgroundContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.conversation-item, .folder-row')) return;
    event.preventDefault();
    this.openContextMenu({ kind: 'background', conversation: null, folder: null, targets: [] }, event.clientX, event.clientY);
  }

  private openContextMenu(menu: Omit<ListContextMenu, 'x' | 'y'>, x: number, y: number): void {
    this.isMoveSubmenuOpen = false;
    this.contextMenu = { ...menu, x, y };
  }

  public closeContextMenu(): void {
    this.contextMenu = null;
    this.isMoveSubmenuOpen = false;
  }

  public openMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.isMoveSubmenuOpen = true;
  }

  public closeMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.isMoveSubmenuOpen = false;
  }

  /** Marks the folder a single conversation already sits in. Never marks a multi-target menu. */
  public isSingleTargetInFolder(projectId: string | null): boolean {
    const conversation = this.contextMenu?.conversation;
    if (!conversation || this.contextMenu?.targets.length !== 1) return false;
    return projectId
      ? !!conversation.ProjectID && UUIDsEqual(conversation.ProjectID, projectId)
      : !conversation.ProjectID;
  }

  /** Conversations the menu's actions apply to — its targets, or the selection. */
  private actionTargetIds(): string[] {
    const targets = this.contextMenu?.targets ?? [];
    return targets.length > 0 ? targets : Array.from(this.selectedConversationIds);
  }

  public contextMoveToFolder(projectId: string | null): void {
    void this.bulkMoveToFolder(projectId);
  }

  public contextMoveToNewFolder(event: Event): void {
    event.stopPropagation();
    const ids = this.actionTargetIds();
    this.closeContextMenu();
    this.openFolderModal(null, null, (created) => this.moveConversations(ids, created.ID));
  }

  public contextSetPinned(isPinned: boolean): void {
    void this.bulkSetPinned(isPinned);
  }

  public contextTogglePin(): void {
    const conversation = this.contextMenu?.conversation;
    if (!conversation) return;
    void this.bulkSetPinned(!conversation.IsPinned);
  }

  /**
   * Shares the menu's targets — the whole selection, or just the clicked row —
   * through the same dialog the chat header uses. Only an owner can grant access,
   * so conversations belonging to someone else are left out and reported.
   */
  public contextShare(): void {
    const ids = this.actionTargetIds();
    this.closeContextMenu();

    const conversations = ids
      .map(id => this.engine.GetConversation(id))
      .filter((c): c is MJConversationEntity => !!c);
    const mine = conversations.filter(c => !!c.UserID && UUIDsEqual(c.UserID, this.currentUser?.ID));
    const skipped = conversations.length - mine.length;

    this.shareContexts = mine.map(c => ({
      ResourceID: c.ID,
      ResourceName: c.Name ?? 'Conversation',
      OwnerUserID: c.UserID ?? null,
      OwnerDisplayName: c.User ?? 'You',
      CurrentUserID: this.currentUser?.ID ?? null
    }));
    this.shareNotice = skipped > 0
      ? `${skipped} of ${conversations.length} left out — you can only share conversations you own.`
      : null;
    this.isShareDialogOpen = this.shareContexts.length > 0;
  }

  public onShareDialogResult(_result: ResourceShareDialogResult): void {
    this.isShareDialogOpen = false;
    this.shareContexts = [];
    this.shareNotice = null;
    this.cdr.detectChanges();
  }

  public contextRename(): void {
    const conversation = this.contextMenu?.conversation;
    this.closeContextMenu();
    if (conversation) this.renameConversation(conversation);
  }

  public contextDelete(): void {
    void this.bulkDeleteConversations();
  }

  public contextCreateSubfolder(event: Event): void {
    const folder = this.contextMenu?.folder;
    this.closeContextMenu();
    if (folder) this.createFolder(folder.ID, event);
  }

  public contextEditFolder(event: Event): void {
    const folder = this.contextMenu?.folder;
    this.closeContextMenu();
    if (folder) this.editFolder(folder, event);
  }

  public contextDeleteFolder(event: Event): void {
    const folder = this.contextMenu?.folder;
    this.closeContextMenu();
    if (folder) void this.deleteFolder(folder, event);
  }

  public contextNewConversation(): void {
    this.closeContextMenu();
    this.createNewConversation();
  }

  public contextCreateRootFolder(event: Event): void {
    this.closeContextMenu();
    this.createFolder(null, event);
  }

  public contextSelectAll(): void {
    this.closeContextMenu();
    this.isSelectionMode = true;
    this.selectAll();
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

  /** True when this conversation is part of the current multi-selection. */
  IsConversationSelected(conversation: MJConversationEntity): boolean {
    return this.isSelectionMode && this.selectedConversationIds.has(conversation.ID);
  }

  IsConversationRenamed(conversation: MJConversationEntity): boolean {
    return UUIDsEqual(conversation.ID, this.renamedConversationId);
  }

  IsConversationDragging(conversation: MJConversationEntity): boolean {
    return this.draggedConversationIds.some(id => UUIDsEqual(id, conversation.ID));
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

  async togglePin(conversation: MJConversationEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    this.closeContextMenu(); // Close immediately on user action — don't wait for the async op
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
    if (this.isSelectionMode) {
      this.exitSelectionMode();
    } else {
      this.isSelectionMode = true;
    }
  }

  /**
   * Clicking the empty space of the list drops the selection, the way clicking
   * blank space in a file browser does. A click that landed on a row, folder,
   * section header or button is handled by that element instead.
   */
  public onListBackgroundClick(event: MouseEvent): void {
    if (!this.isSelectionMode) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('.conversation-item, .folder-row, .section-header, button')) return;

    this.exitSelectionMode();
  }

  private exitSelectionMode(): void {
    this.isSelectionMode = false;
    this.selectedConversationIds.clear();
    this.selectionAnchorId = null;
  }

  /** Selection mode closes itself once the last row is deselected. */
  private exitSelectionModeIfEmpty(): void {
    if (this.selectedConversationIds.size === 0) {
      this.exitSelectionMode();
    }
  }

  /**
   * Adds the open conversation to a selection that is just starting, so it moves
   * with the rows picked alongside it. Returns the id added, or null when nothing
   * is open or it is hidden inside a collapsed folder or section.
   */
  private seedSelectionWithOpenConversation(): string | null {
    const openId = this.selectedConversationId;
    if (!openId) return null;
    const visibleId = this.visibleConversationIds().find(id => UUIDsEqual(id, openId));
    if (!visibleId) return null;
    this.selectedConversationIds.add(visibleId);
    return visibleId;
  }

  /** Conversation IDs in the order the list renders them, skipping collapsed sections and folders. */
  private visibleConversationIds(): string[] {
    const ids: string[] = [];
    const sectionOpen = (expanded: boolean) => !this.showSectionHeaders || expanded;

    if (sectionOpen(this.pinnedExpanded)) {
      ids.push(...this.pinnedConversations.map(c => c.ID));
    }

    if (this.showSectionHeaders && this.groupBy === 'project') {
      if (this.foldersExpanded) {
        // Subfolders render above their parent folder's own conversations.
        const walk = (nodes: FolderNode[]): void => {
          for (const node of nodes) {
            if (!this.isFolderExpanded(node.project.ID)) continue;
            walk(node.children);
            ids.push(...node.conversations.map(c => c.ID));
          }
        };
        walk(this.folderTree);
      }
      if (this.ungroupedExpanded) {
        ids.push(...this.ungroupedConversations.map(c => c.ID));
      }
    } else if (sectionOpen(this.directMessagesExpanded)) {
      ids.push(...this.unpinnedConversations.map(c => c.ID));
    }

    return ids;
  }

  /**
   * Adds every row between the anchor and `conversationId` to the selection.
   * Rows already picked stay picked — a range never takes a selection away.
   *
   * With nothing picked yet the open conversation stands in as the anchor, so a
   * single Shift-click highlights the span from it rather than one lone row.
   */
  private selectRangeTo(conversationId: string): void {
    const order = this.visibleConversationIds();
    const end = this.indexOfConversation(order, conversationId);
    if (end < 0) return;

    const anchorId = this.selectionAnchorId ?? this.selectedConversationId;
    const start = this.indexOfConversation(order, anchorId);
    if (start < 0) {
      // No anchor and no open conversation on screen — pick this row alone.
      this.selectedConversationIds.add(conversationId);
      this.selectionAnchorId = conversationId;
      return;
    }
    this.selectionAnchorId = order[start];

    const [from, to] = start <= end ? [start, end] : [end, start];
    for (let i = from; i <= to; i++) {
      this.selectedConversationIds.add(order[i]);
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

  /**
   * Moves every selected conversation into one folder, or out of all folders when
   * projectId is null. The selection survives so a second bulk action can follow.
   */
  async bulkMoveToFolder(projectId: string | null): Promise<void> {
    const ids = this.actionTargetIds();
    this.closeContextMenu();
    if (ids.length === 0) return;

    try {
      const result = await this.engine.MoveMultipleConversationsToProject(ids, projectId, this.currentUser);
      await this.reportBulkOutcome(result, 'moved');
    } catch (error) {
      console.error('Error moving conversations:', error);
      await this.dialogService.alert('Error', 'Failed to move the selected conversations. Please try again.');
    }
    this.cdr.detectChanges();
  }

  /** Pins or unpins every selected conversation, keeping the selection. */
  async bulkSetPinned(isPinned: boolean): Promise<void> {
    const ids = this.actionTargetIds();
    this.closeContextMenu();
    if (ids.length === 0) return;

    try {
      const result = await this.engine.PinMultipleConversations(ids, isPinned, this.currentUser);
      await this.reportBulkOutcome(result, isPinned ? 'pinned' : 'unpinned');
    } catch (error) {
      console.error('Error pinning conversations:', error);
      await this.dialogService.alert('Error', `Failed to ${isPinned ? 'pin' : 'unpin'} the selected conversations. Please try again.`);
    }
    this.cdr.detectChanges();
  }

  /** Reports the conversations a bulk action could not change. Silent on full success. */
  private async reportBulkOutcome(
    result: { Successful: string[]; Failed: Array<{ ID: string; Name: string; Error: string }> },
    verb: string
  ): Promise<void> {
    if (result.Failed.length === 0) return;

    const failedNames = result.Failed.map(f => `"${f.Name}"`).join(', ');
    await this.dialogService.alert(
      'Partial Success',
      `${result.Successful.length} conversation${result.Successful.length === 1 ? '' : 's'} ${verb}.\n\n` +
      `${result.Failed.length} could not be ${verb}: ${failedNames}`
    );
  }

  async bulkDeleteConversations(): Promise<void> {
    const ids = this.actionTargetIds();
    const count = ids.length;
    this.closeContextMenu();

    if (count === 0) return;

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Conversations',
      message: `Are you sure you want to delete ${count} conversation${count > 1 ? 's' : ''}? This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      try {
        const result = await this.engine.DeleteMultipleConversations(ids, this.currentUser);

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

  /**
   * Routes a row click: Ctrl/Cmd toggles one row, Shift extends from the anchor,
   * a plain click opens the conversation (or toggles the row while in selection
   * mode). Either modifier starts selection mode when it is off.
   */
  handleConversationClick(conversation: MJConversationEntity, event?: MouseEvent): void {
    const isRangeClick = !!event?.shiftKey;
    const isToggleClick = !!event && (event.ctrlKey || event.metaKey);

    if (isRangeClick || isToggleClick) {
      event?.preventDefault(); // a Shift-click would otherwise paint a text selection
      const entering = !this.isSelectionMode;
      if (entering) {
        this.isSelectionMode = true;
      }
      if (isRangeClick) {
        this.selectRangeTo(conversation.ID);
      } else {
        // The open conversation reads as picked, so a Ctrl-click that starts a
        // selection takes it along; a Shift-click already ranges from it.
        const seeded = entering ? this.seedSelectionWithOpenConversation() : null;
        if (!seeded || !UUIDsEqual(seeded, conversation.ID)) {
          this.toggleConversationSelection(conversation.ID);
        }
        this.selectionAnchorId = conversation.ID;
        this.exitSelectionModeIfEmpty();
      }
      return;
    }

    // A plain click collapses the selection down to this one conversation, the
    // way a file browser does.
    if (this.isSelectionMode) {
      this.exitSelectionMode();
    }
    this.selectConversation(conversation);
  }
}