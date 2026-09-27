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

/**
 * Where a menu opens: its preferred top-left corner, and the line its bottom
 * edge sits on when there is no room below and it opens upward instead.
 */
interface MenuAnchor {
  x: number;
  y: number;
  flipBottom: number;
}

/** An open right-click menu: where it sits, and what it acts on. */
interface ListContextMenu {
  kind: ListContextMenuKind;
  /** Viewport position the menu renders at: its anchor, moved to stay inside the window. */
  x: number;
  y: number;
  /** The pointer (or button) the menu was opened from. */
  anchor: MenuAnchor;
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
    <div class="conversation-list" [class.is-selecting]="IsSelectionMode">
      <!-- Header strip gated as a whole so an empty bordered band never renders.
           While a selection exists its top row becomes the selection bar, which
           shows even for a host that hides the rest of the chrome. -->
      @if (showSearch || ShowHeaderMenu || IsSelectionMode) {
      <div class="list-header">
        <div class="header-top">
          @if (IsSelectionMode) {
            <div class="selection-bar" role="toolbar" aria-label="Selected conversations">
              <button class="selection-bar-btn" (click)="ClearSelection()" title="Clear selection" aria-label="Clear selection">
                <i class="fas fa-xmark"></i>
              </button>
              <span class="selection-count">{{ SelectedConversationIds.size }} selected</span>
              <button class="selection-bar-btn"
                      (click)="BarSetPinned()"
                      [disabled]="!CanChangeAny(SelectedIds)"
                      [title]="CanChangeAny(SelectedIds) ? (SelectionHasUnpinned() ? 'Pin' : 'Unpin') : ChangeRefusedReason"
                      [attr.aria-label]="SelectionHasUnpinned() ? 'Pin' : 'Unpin'">
                <i class="fas fa-thumbtack" [class.fa-rotate-90]="!SelectionHasUnpinned()"></i>
              </button>
              <button class="selection-bar-btn"
                      (click)="BarOpenMoveMenu($event)"
                      [disabled]="!CanChangeAny(SelectedIds)"
                      [title]="CanChangeAny(SelectedIds) ? 'Move to folder' : ChangeRefusedReason"
                      aria-label="Move to folder">
                <i class="fas fa-folder-tree"></i>
              </button>
              <button class="selection-bar-btn"
                      (click)="BarShare()"
                      [disabled]="!CanShareAny(SelectedIds)"
                      [title]="CanShareAny(SelectedIds) ? 'Share' : ShareRefusedReason"
                      aria-label="Share">
                <i class="fas fa-user-plus"></i>
              </button>
              <button class="selection-bar-btn danger" (click)="BarDelete()" title="Delete" aria-label="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          } @else {
            @if (showSearch) {
              <div class="search-box">
                <input
                  #searchInput
                  type="text"
                  class="search-input"
                  placeholder="Search conversations..."
                  [(ngModel)]="SearchQuery"
                  (keydown)="OnSearchKeydown($event)">
                @if (IsSearching) {
                  <button class="search-clear" (click)="ClearSearch()" title="Clear search">
                    <i class="fas fa-xmark"></i>
                  </button>
                }
              </div>
            }
            @if (ShowHeaderMenu) {
              <div class="header-menu-container">
                <button class="btn-menu" (click)="ToggleHeaderMenu($event)" title="Options">
                  <i class="fas fa-ellipsis-v"></i>
                </button>
                @if (IsHeaderMenuOpen) {
                  <div class="header-dropdown-menu">
                    <button class="dropdown-item" (click)="OnRefreshConversationsClick($event)" [disabled]="IsRefreshing">
                      <i class="fas fa-sync-alt" [class.fa-spin]="IsRefreshing"></i>
                      <span>{{ IsRefreshing ? 'Refreshing...' : 'Refresh' }}</span>
                    </button>
                    <button class="dropdown-item" (click)="OnToggleGroupByClick($event)">
                      <i class="fas" [class.fa-folder-tree]="GroupBy !== 'project'" [class.fa-list]="GroupBy === 'project'"></i>
                      <span>{{ GroupBy === 'project' ? 'Show as flat list' : 'Group by folder' }}</span>
                    </button>
                    @if (!IsMobileView) {
                      <button class="dropdown-item" (click)="OnUnpinSidebarClick($event)">
                        <i class="fas fa-table-columns"></i>
                        <span>Hide Sidebar</span>
                      </button>
                    }
                  </div>
                }
              </div>
            }
          }
        </div>
        <!-- Sort controls. Live in the header strip, so a host that hides all
             chrome (showSearch + ShowHeaderMenu both false) gets no sort row.
             They stay put while selecting, so the list does not jump. -->
        @if (showSearch || ShowHeaderMenu) {
          <div class="sort-row">
            <button class="sort-btn" [class.active]="SortBy === 'date'"
                    (click)="SetSort('date')"
                    [title]="SortBy === 'date' ? (SortDirection === 'asc' ? 'Oldest first' : 'Newest first') : 'Sort by date'">
              <i class="fas" [ngClass]="SortIcon('date')"></i>
              <span>Date</span>
            </button>
            <button class="sort-btn" [class.active]="SortBy === 'name'"
                    (click)="SetSort('name')"
                    [title]="SortBy === 'name' ? (SortDirection === 'asc' ? 'A to Z' : 'Z to A') : 'Sort by name'">
              <i class="fas" [ngClass]="SortIcon('name')"></i>
              <span>Name</span>
            </button>
          </div>
        }
      </div>
      }
      @if (ShowNewConversationButton) {
        <button class="btn-new-conversation" (click)="CreateNewConversation()" title="New Conversation">
          <i class="fas fa-plus"></i>
          <span>New Conversation</span>
        </button>
      }
      <div class="list-content"
           (click)="OnListBackgroundClick($event)"
           (contextmenu)="OnBackgroundContextMenu($event)">
        <!-- Pinned Section (only show if there are pinned conversations) -->
        @if (PinnedConversations.length > 0) {
          <div class="sidebar-section pinned-section">
            @if (ShowSectionHeaders) {
              <div class="section-header" [class.expanded]="PinnedExpanded" (click)="TogglePinned()">
                <div class="section-title">
                  <i class="fas fa-chevron-right"></i>
                  <i class="fas fa-thumbtack section-icon"></i>
                  <span>Pinned</span>
                </div>
              </div>
            }
            <div class="chat-list" [class.expanded]="!ShowSectionHeaders || PinnedExpanded">
              @for (conversation of PinnedConversations; track conversation.ID) {
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        }

        <!-- ShowSectionHeaders=false forces the FLAT branch even in project
             grouping: the folder tree's root drop-zone and New Folder action
             live in the section header, so rendering the tree without headers
             would let a user drag a folder INTO another folder with no way to
             ever drag it back out (a one-way door). Flat + headerless is the
             coherent chrome-less rendering. -->
        @if (ShowSectionHeaders && GroupBy === 'project') {
          <!-- Folders Section. NOTE: this whole branch is already gated on
               ShowSectionHeaders above, so the header + collapse state here are
               unconditional — a headerless folder tree never renders. -->
          <div class="sidebar-section folders-section">
            <div class="section-header" [class.expanded]="FoldersExpanded"
                 [class.drag-over]="DragOverTargetId === 'folders-root'"
                 (click)="ToggleFolders()"
                 (dragover)="OnFoldersRootDragOver($event)"
                 (dragleave)="OnDragLeave('folders-root')"
                 (drop)="OnFoldersRootDrop($event)">
              <div class="section-title">
                <i class="fas fa-chevron-right"></i>
                <span>Folders</span>
              </div>
              <button class="section-action-btn" (click)="CreateFolder(null, $event)" title="New Folder">
                <i class="fas fa-folder-plus"></i>
              </button>
            </div>
            <div class="chat-list" [class.expanded]="FoldersExpanded">
              @for (node of FolderTree; track node.project.ID) {
                @if (!IsSearching || node.hasContent) {
                  <ng-container [ngTemplateOutlet]="folderNode" [ngTemplateOutletContext]="{ $implicit: node }"></ng-container>
                }
              }
              @if (FolderTree.length === 0) {
                <div class="folder-empty-hint">No folders yet — create one to organize conversations.</div>
              }
            </div>
          </div>

          <!-- Ungrouped Section (drop target to remove from folder) -->
          <div class="sidebar-section ungrouped-section"
               [class.drag-over]="DragOverTargetId === 'ungrouped'"
               (dragover)="OnUngroupedDragOver($event)"
               (dragleave)="OnDragLeave('ungrouped')"
               (drop)="OnUngroupedDrop($event)">
            <!-- Same as Folders above: reached only when ShowSectionHeaders is true. -->
            <div class="section-header" [class.expanded]="UngroupedExpanded" (click)="ToggleUngrouped()">
              <div class="section-title">
                <i class="fas fa-chevron-right"></i>
                <span>{{ FolderTree.length > 0 ? 'Ungrouped' : 'Messages' }}</span>
              </div>
            </div>
            <div class="chat-list" [class.expanded]="UngroupedExpanded">
              @for (conversation of UngroupedConversations; track conversation.ID) {
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        } @else {
          <!-- Flat Messages Section -->
          <div class="sidebar-section">
            @if (ShowSectionHeaders) {
              <div class="section-header" [class.expanded]="DirectMessagesExpanded" (click)="ToggleDirectMessages()">
                <div class="section-title">
                  <i class="fas fa-chevron-right"></i>
                  <span>Messages</span>
                </div>
              </div>
            }
            <div class="chat-list" [class.expanded]="!ShowSectionHeaders || DirectMessagesExpanded">
              @for (conversation of UnpinnedConversations; track conversation.ID) {
                <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation }"></ng-container>
              }
            </div>
          </div>
        }
      </div>

      <!-- Escalate the in-place filter to a full cross-entity search. Pinned below the
           scroll region rather than appended to the results so it stays reachable without
           scrolling past every match. Only meaningful while filtering. -->
      @if (IsSearching && !IsSelectionMode) {
        <button class="search-escalate" (click)="EscalateSearch()">
          <i class="fa-solid fa-magnifying-glass"></i>
          <span class="search-escalate-label">Search all of Chat for &ldquo;{{ SearchQuery }}&rdquo;</span>
          <i class="fa-solid fa-arrow-right search-escalate-go"></i>
        </button>
      }
    </div>

    <!-- Recursive folder node: header + nested children + direct conversations -->
    <ng-template #folderNode let-node>
      <div class="folder-row"
           [class.drag-over]="DragOverTargetId === node.project.ID"
           [class.dragging]="DraggedFolderId === node.project.ID"
           [style.paddingLeft.px]="12 + node.depth * 14"
           [draggable]="true"
           (dragstart)="OnFolderDragStart(node, $event)"
           (dragend)="OnFolderDragEnd()"
           (click)="ToggleFolder(node.project.ID)"
           (dragover)="OnFolderDragOver(node.project.ID, $event)"
           (dragleave)="OnDragLeave(node.project.ID)"
           (drop)="OnFolderDrop(node.project, $event)"
           (contextmenu)="OnFolderContextMenu(node.project, $event)"
           [title]="node.project.Name">
        <i class="fas fa-chevron-right folder-chevron" [class.expanded]="IsFolderExpanded(node.project.ID)"></i>
        <i class="fas {{ node.project.Icon || 'fa-folder' }} folder-icon" [style.color]="node.project.Color || null"></i>
        <span class="folder-name">{{ node.project.Name }}</span>
        <span class="folder-count">{{ node.totalCount }}</span>
      </div>
      @if (IsFolderExpanded(node.project.ID)) {
        <div class="folder-children">
          @for (child of node.children; track child.project.ID) {
            @if (!IsSearching || child.hasContent) {
              <ng-container [ngTemplateOutlet]="folderNode" [ngTemplateOutletContext]="{ $implicit: child }"></ng-container>
            }
          }
          @for (conversation of node.conversations; track conversation.ID) {
            <ng-container [ngTemplateOutlet]="conversationItem" [ngTemplateOutletContext]="{ $implicit: conversation, depth: node.depth + 1 }"></ng-container>
          }
          @if (node.totalCount === 0 && !IsSearching) {
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
           [draggable]="CanChange(conversation)"
           (dragstart)="OnConversationDragStart(conversation, $event)"
           (dragend)="OnConversationDragEnd()"
           (dragover)="OnConversationRowDragOver(conversation, $event)"
           (dragleave)="OnDragLeave(ConversationDropTargetId(conversation))"
           (drop)="OnConversationRowDrop(conversation, $event)"
           (pointerdown)="OnRowPointerDown(conversation, $event)"
           (pointermove)="OnRowPointerMove($event)"
           (pointerup)="CancelLongPress()"
           (pointercancel)="CancelLongPress()"
           (click)="HandleConversationClick(conversation, $event)"
           (contextmenu)="OnConversationContextMenu(conversation, $event)">
        <button class="row-check"
                role="checkbox"
                [class.checked]="IsConversationSelected(conversation)"
                [attr.aria-checked]="IsConversationSelected(conversation)"
                [attr.aria-label]="'Select ' + (conversation.Name || 'conversation')"
                [style.left.px]="(depth || 0) * 14 + 4"
                (click)="OnRowCheckboxClick(conversation, $event)">
          <i class="fas fa-check"></i>
        </button>
        <div class="conversation-icon-wrapper">
          @if (HasActiveTasks(conversation.ID)) {
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
            @if (IsSharedWithMe(conversation)) {
              <i class="fas fa-share-nodes shared-indicator"
                 [title]="SharedWithMeTooltip(conversation)"></i>
            }
          </div>
          <div class="conversation-preview">{{ conversation.Description }}</div>
        </div>
        <div class="conversation-actions">
          <button class="menu-btn" (click)="OpenRowMenu(conversation, $event)" title="More options">
            <i class="fas fa-ellipsis"></i>
          </button>
        </div>
      </div>
    </ng-template>

    <mj-resource-share-dialog
      [Visible]="IsShareDialogOpen"
      [Contexts]="ShareContexts"
      [Adapter]="ShareAdapter"
      [Notice]="ShareNotice"
      ResourceLabel="conversation"
      (Result)="OnShareDialogResult($event)">
    </mj-resource-share-dialog>

    <!-- One menu for every right-click target: a conversation row (the clicked
         row, or the whole selection when it is part of it), a folder row, or the
         empty space of the list. Fixed-positioned at the pointer, and moved as
         needed to stay inside the window. -->
    @if (ContextMenu) {
      <div class="list-context-menu" #contextMenuEl
           [style.left.px]="ContextMenu.x"
           [style.top.px]="ContextMenu.y"
           (click)="$event.stopPropagation()"
           (contextmenu)="$event.preventDefault(); $event.stopPropagation()">
        @switch (ContextMenu.kind) {
          @case ('conversation') {
            @if (IsMoveSubmenuOpen) {
              <button class="menu-item back" (click)="CloseMoveSubmenu($event)">
                <i class="fas fa-chevron-left"></i>
                <span>Move to folder</span>
              </button>
              <div class="menu-divider"></div>
              <div class="move-folder-list">
                <button class="menu-item" [class.current]="IsSingleTargetInFolder(null)" (click)="ContextMoveToFolder(null)">
                  <i class="fas fa-inbox"></i>
                  <span>No folder</span>
                </button>
                @for (f of FlatFolders; track f.project.ID) {
                  <button class="menu-item" [class.current]="IsSingleTargetInFolder(f.project.ID)"
                          [style.paddingLeft.px]="14 + f.depth * 12"
                          (click)="ContextMoveToFolder(f.project.ID)">
                    <i class="fas {{ f.project.Icon || 'fa-folder' }}" [style.color]="f.project.Color || null"></i>
                    <span>{{ f.project.Name }}</span>
                  </button>
                }
              </div>
              <div class="menu-divider"></div>
              <button class="menu-item" (click)="ContextMoveToNewFolder($event)">
                <i class="fas fa-folder-plus"></i>
                <span>New folder&hellip;</span>
              </button>
            } @else {
              @if (ContextMenu.targets.length > 1) {
                <div class="context-menu-header">{{ ContextMenu.targets.length }} selected</div>
                <button class="menu-item" (click)="ContextSetPinned(true)"
                        [disabled]="!CanChangeAny(ContextMenu.targets)"
                        [attr.title]="CanChangeAny(ContextMenu.targets) ? null : ChangeRefusedReason">
                  <i class="fas fa-thumbtack"></i>
                  <span>Pin</span>
                </button>
                <button class="menu-item" (click)="ContextSetPinned(false)"
                        [disabled]="!CanChangeAny(ContextMenu.targets)"
                        [attr.title]="CanChangeAny(ContextMenu.targets) ? null : ChangeRefusedReason">
                  <i class="fas fa-thumbtack fa-rotate-90"></i>
                  <span>Unpin</span>
                </button>
              } @else {
                <button class="menu-item" (click)="ContextTogglePin()"
                        [disabled]="!CanChangeAny(ContextMenu.targets)"
                        [attr.title]="CanChangeAny(ContextMenu.targets) ? null : ChangeRefusedReason">
                  <i class="fas fa-thumbtack"></i>
                  <span>{{ ContextMenu.conversation?.IsPinned ? 'Unpin' : 'Pin' }}</span>
                </button>
              }
              <button class="menu-item" (click)="OpenMoveSubmenu($event)"
                      [disabled]="!CanChangeAny(ContextMenu.targets)"
                      [attr.title]="CanChangeAny(ContextMenu.targets) ? null : ChangeRefusedReason">
                <i class="fas fa-folder-tree"></i>
                <span>Move to folder</span>
                <i class="fas fa-chevron-right submenu-arrow"></i>
              </button>
              <button class="menu-item"
                      (click)="ContextShare()"
                      [disabled]="!CanShareAny(ContextMenu.targets)"
                      [attr.title]="CanShareAny(ContextMenu.targets) ? null : ShareRefusedReason">
                <i class="fas fa-user-plus"></i>
                <span>{{ ContextMenu.targets.length > 1 ? 'Share ' + ContextMenu.targets.length + ' conversations' : 'Share' }}</span>
              </button>
              @if (ContextMenu.targets.length === 1) {
                <button class="menu-item" (click)="ContextRename()">
                  <i class="fas fa-edit"></i>
                  <span>Rename</span>
                </button>
              }
              <div class="menu-divider"></div>
              <button class="menu-item danger" (click)="ContextDelete()">
                <i class="fas fa-trash"></i>
                <span>{{ ContextMenu.targets.length > 1 ? 'Delete ' + ContextMenu.targets.length : 'Delete' }}</span>
              </button>
            }
          }
          @case ('folder') {
            <button class="menu-item" (click)="ContextCreateSubfolder($event)">
              <i class="fas fa-folder-plus"></i>
              <span>New Subfolder</span>
            </button>
            <button class="menu-item" (click)="ContextEditFolder($event)">
              <i class="fas fa-pen"></i>
              <span>Rename</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item danger" (click)="ContextDeleteFolder($event)">
              <i class="fas fa-trash"></i>
              <span>Delete</span>
            </button>
          }
          @default {
            <button class="menu-item" (click)="ContextNewConversation()">
              <i class="fas fa-plus"></i>
              <span>New Conversation</span>
            </button>
            <button class="menu-item" (click)="ContextCreateRootFolder($event)">
              <i class="fas fa-folder-plus"></i>
              <span>New Folder</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item" (click)="ContextSelectAll()">
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

    /* Reads as a continuation of the list rather than a second control: full-width row,
       ink-derived like every other affordance in this panel, no input styling. */
    .search-escalate {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      border: none;
      border-top: 1px solid color-mix(in srgb, var(--conv-list-ink) 10%, transparent);
      background: transparent;
      color: color-mix(in srgb, var(--conv-list-ink) 70%, transparent);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: background 0.2s;
    }

    .search-escalate:hover {
      background: var(--conv-list-hover-bg);
      color: var(--conv-list-ink);
    }

    /* Truncate rather than wrap — the query is user text of unbounded length. */
    .search-escalate-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-escalate-go { opacity: 0.6; }
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
    /* A selected row is marked by its ticked checkbox and an accent tint. The
       open conversation keeps its solid .active fill, so a row that is both
       still reads as the open one. */
    .conversation-item.selected { background: color-mix(in srgb, var(--conv-list-accent) 16%, transparent); }
    .conversation-item.selected:hover { background: color-mix(in srgb, var(--conv-list-accent) 24%, transparent); }
    .conversation-item.active.selected { background: var(--conv-list-active-bg); }
    /* Row checkbox: the mouse route to a selection. It sits in the row's left
       padding, hidden until the row is hovered, and shows on every row while a
       selection exists (on touch too, where there is no hover). */
    .row-check {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1.5px solid color-mix(in srgb, var(--conv-list-ink) 45%, transparent);
      border-radius: 3px;
      color: transparent;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
      z-index: 2;
    }
    .row-check i { font-size: 8px; }
    .conversation-list.is-selecting .row-check { opacity: 1; pointer-events: auto; }
    @media (hover: hover) {
      .conversation-item:hover .row-check { opacity: 1; pointer-events: auto; }
    }
    .row-check.checked {
      background: var(--conv-list-accent);
      border-color: var(--conv-list-accent);
      color: var(--conv-list-accent-ink);
    }
    .conversation-item.active .row-check:not(.checked) {
      border-color: color-mix(in srgb, var(--conv-list-active-ink) 70%, transparent);
    }
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
    /* No hover on touch, so the ⋯ button is always shown there. */
    @media (hover: none) {
      .conversation-actions { opacity: 1; pointer-events: auto; }
    }
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

    /* Header top row: the search box and ⋯ menu, or the selection bar while a
       selection exists. A fixed minimum height keeps the list from jumping
       when one replaces the other. */
    .header-top {
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 36px;
    }

    .selection-bar {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .selection-count {
      flex: 1;
      min-width: 0;
      padding: 0 6px;
      color: var(--conv-list-ink);
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .selection-bar-btn {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: color-mix(in srgb, var(--conv-list-ink) 75%, transparent);
      cursor: pointer;
      transition: all 0.2s;
    }

    .selection-bar-btn i { font-size: 13px; }
    .selection-bar-btn:hover:not(:disabled) { background: var(--conv-list-hover-bg); color: var(--conv-list-ink); }
    .selection-bar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .selection-bar-btn.danger:hover:not(:disabled) {
      background: color-mix(in srgb, var(--mj-status-error) 15%, transparent);
      color: var(--mj-status-error);
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

    /* Dragging state. Rows never select text or raise the touch callout, so a
       long-press can select the row instead. */
    .conversation-item { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
    .conversation-item.dragging { opacity: 0.4; }

    /* Move-to-folder submenu */
    .menu-item.back { font-weight: 600; }
    .menu-item .submenu-arrow { margin-left: auto; font-size: 10px; }
    .menu-item.current { background: color-mix(in srgb, var(--conv-list-accent) 18%, transparent); }
    .move-folder-list { max-height: 240px; overflow-y: auto; }
  `]
})
export class ConversationListComponent implements OnInit, OnDestroy {
  @Input() EnvironmentId!: string;
  @Input() CurrentUser!: UserInfo;
  @Input() SelectedConversationId: string | null = null;
  @Input() RenamedConversationId: string | null = null;
  @Input() IsSidebarPinned: boolean = true; // Whether sidebar is pinned (stays open after selection)
  @Input() IsMobileView: boolean = false; // Whether we're on mobile (no pin options)

  // ── White-label chrome toggles (all default true = stock rendering) ──
  /** Show the search box in the list header. Flipping to false clears any active
   *  search so a hidden filter can't keep silently narrowing the list. */
  @Input()
  set showSearch(value: boolean) {
    if (!value && this._searchQuery) {
      this.SearchQuery = ''; // setter rebuilds the groupings
    }
    this._showSearch = value;
  }
  get showSearch(): boolean {
    return this._showSearch;
  }
  private _showSearch = true;
  /** Show the "New Conversation" button. */
  @Input() ShowNewConversationButton: boolean = true;
  /** Show the ⋯ header options menu (refresh / select / group-by / hide sidebar). */
  @Input() ShowHeaderMenu: boolean = true;
  /** Show the collapsible Pinned / Folders / Messages section headers. When false,
   *  the list renders FLAT and fully expanded: folder grouping is bypassed (the
   *  folder tree's root drop-zone and New Folder action live in the section
   *  header, so a headerless tree would allow one-way folder nesting) — the
   *  chrome-less rendering for embedded hosts. */
  @Input() ShowSectionHeaders: boolean = true;

  @Output() ConversationSelected = new EventEmitter<string>();
  /**
   * @deprecated Use {@link ConversationSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationSelected) keeps working. Must stay AFTER ConversationSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationSelected = this.ConversationSelected;
  @Output() ConversationDeleted = new EventEmitter<string>(); // Emits the deleted conversation ID
  /**
   * @deprecated Use {@link ConversationDeleted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationDeleted) keeps working. Must stay AFTER ConversationDeleted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationDeleted = this.ConversationDeleted; // Emits the deleted conversation ID
  @Output() NewConversationRequested = new EventEmitter<void>();
  /**
   * @deprecated Use {@link NewConversationRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (newConversationRequested) keeps working. Must stay AFTER NewConversationRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() newConversationRequested = this.NewConversationRequested;
  @Output() PinSidebarRequested = new EventEmitter<void>(); // Request to pin sidebar
  /**
   * @deprecated Use {@link PinSidebarRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (pinSidebarRequested) keeps working. Must stay AFTER PinSidebarRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() pinSidebarRequested = this.PinSidebarRequested; // Request to pin sidebar
  @Output() UnpinSidebarRequested = new EventEmitter<void>(); // Request to unpin (collapse) sidebar
  /**
   * @deprecated Use {@link UnpinSidebarRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (unpinSidebarRequested) keeps working. Must stay AFTER UnpinSidebarRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() unpinSidebarRequested = this.UnpinSidebarRequested; // Request to unpin (collapse) sidebar
  @Output() RefreshRequested = new EventEmitter<void>(); // Emitted after list refresh so chat area can also reload
  /**
   * @deprecated Use {@link RefreshRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (refreshRequested) keeps working. Must stay AFTER RefreshRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() refreshRequested = this.RefreshRequested; // Emitted after list refresh so chat area can also reload

  /**
   * The user wants the current filter term searched across all of Chat, not just this list.
   * Emits the term. This panel filters only loaded conversations by Name/Description, so it
   * cannot answer "where did we discuss X" — the host owns that surface and the routing to it.
   */
  @Output() SearchEscalated = new EventEmitter<string>();

  public DirectMessagesExpanded: boolean = true;
  public PinnedExpanded: boolean = true;
  public FoldersExpanded: boolean = true;
  public UngroupedExpanded: boolean = true;
  /** The open right-click menu, or null. Positioned at the pointer. */
  public ContextMenu: ListContextMenu | null = null;

  /** True while the open conversation menu is showing its folder picker. */
  public IsMoveSubmenuOpen: boolean = false;

  /** Resources the share dialog is currently offering, one per conversation. */
  public ShareContexts: ResourceShareContext[] = [];
  public ShareNotice: string | null = null;
  public IsShareDialogOpen: boolean = false;
  public ShareAdapter = new MJResourcePermissionShareAdapter(CONVERSATIONS_RESOURCE_TYPE_ID);
  public ConversationIdsWithTasks = new Set<string>();
  public IsSelectionMode: boolean = false;
  public SelectedConversationIds = new Set<string>();

  /** Row a Shift-click ranges from — the last row picked without Shift. */
  private selectionAnchorId: string | null = null;

  /** Why Share is unavailable, shown on its disabled button. */
  public readonly ShareRefusedReason = 'Only the owner, or someone with Owner access, can share a conversation';

  /** Why Move and Pin are unavailable, shown on their disabled buttons. */
  public readonly ChangeRefusedReason = 'You need Edit access to move or pin a conversation shared with you';

  /** How long a touch must rest on a row before it selects the row. */
  private static readonly longPressDelayMs = 500;

  /** How far a touch may drift, in pixels, before it counts as a scroll rather than a press. */
  private static readonly longPressMoveTolerancePx = 10;

  /** Space kept between the right-click menu and the edges of the window. */
  private static readonly menuViewportMargin = 8;

  /** The touch press waiting to become a long-press, or null. */
  private longPress: {
    conversation: MJConversationEntity;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  /** Pointer type of the latest press on a row. On touch, a tap while selecting toggles the row. */
  private lastRowPointerType = 'mouse';

  /** Set by a completed long-press, so the click that ends the same press does nothing. */
  private ignoreNextRowClick = false;

  public IsHeaderMenuOpen: boolean = false;

  public IsRefreshing: boolean = false;

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('contextMenuEl') private contextMenuEl?: ElementRef<HTMLElement>;

  /** UserInfoEngine key for persisting folder collapse state + group-by mode. */
  private static readonly folderPrefsKey = 'mj.conversations.folderPrefs.v1';

  /** How the conversation list is grouped. 'project' = folders, 'none' = flat list. */
  public GroupBy: ConversationGroupBy = 'project';

  /** Field every section of the list is sorted on. */
  public SortBy: ConversationSortBy = 'date';

  /** Direction of the current sort. */
  public SortDirection: ConversationSortDirection = 'desc';

  /** Direction each field falls back to when it becomes the active sort. */
  private static readonly defaultSortDirections: Record<ConversationSortBy, ConversationSortDirection> = {
    date: 'desc',
    name: 'asc'
  };

  /** Precomputed groupings, rebuilt whenever conversations/projects/search change. */
  public PinnedConversations: MJConversationEntity[] = [];
  public UnpinnedConversations: MJConversationEntity[] = [];
  public UngroupedConversations: MJConversationEntity[] = [];
  public FolderTree: FolderNode[] = [];
  /** Flattened folder list (depth-ordered) for the "Move to folder" menu. */
  public FlatFolders: FolderNode[] = [];

  /** Folder IDs (normalized) whose children are collapsed. Absent = expanded. */
  private collapsedFolderIds = new Set<string>();

  /** Drag-and-drop state. */
  /** Conversations currently being dragged — the whole selection when the grabbed row is part of it. */
  public DraggedConversationIds: string[] = [];
  public DraggedFolderId: string | null = null;
  public DragOverTargetId: string | null = null;

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

  get SearchQuery(): string {
    return this._searchQuery;
  }
  set SearchQuery(value: string) {
    this._searchQuery = value ?? '';
    this.rebuildGroups();
    this.dropHiddenRowsFromSelection();
  }

  /** True when a search filter is active. */
  get IsSearching(): boolean {
    return this._searchQuery.trim().length > 0;
  }

  /** Hand the current filter term to the host to search across every Chat entity. */
  EscalateSearch(): void {
    this.SearchEscalated.emit(this._searchQuery.trim());
  }

  /** Clears the search box and returns focus to it. */
  public ClearSearch(): void {
    this.SearchQuery = '';
    this.searchInput?.nativeElement.focus();
  }

  /** Escape in the search box clears it without closing any host overlay. */
  public OnSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.IsSearching) {
      event.stopPropagation();
      this.ClearSearch();
    }
  }

  private filterConversations(conversations: MJConversationEntity[]): MJConversationEntity[] {
    if (!this.IsSearching) {
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
    this.engine.LoadConversations(this.EnvironmentId, this.CurrentUser, false);

    // Rebuild the precomputed groupings whenever conversations OR projects change
    // (pin, archive, rename, move-to-folder, folder create/rename/delete, etc.).
    this.engine.Conversations$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => this.onConversationListChanged());

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
      this.ConversationIdsWithTasks = conversationIds;
      this.cdr.detectChanges(); // Force change detection to ensure spinner icons update reliably
    });
  }

  ngOnDestroy() {
    this.CancelLongPress();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Rebuilds the groupings from the engine's list, first dropping selected conversations that left it. */
  private onConversationListChanged(): void {
    this.dropRemovedConversationsFromSelection();
    this.rebuildGroups();
    this.cdr.detectChanges();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    // Close menus when clicking outside
    if (this.ContextMenu) {
      this.CloseContextMenu();
    }
    if (this.IsHeaderMenuOpen) {
      this.CloseHeaderMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.ContextMenu) {
      this.CloseContextMenu();
      return;
    }
    if (this.IsSelectionMode) {
      this.exitSelectionMode();
    }
  }

  public ToggleHeaderMenu(event: Event): void {
    event.stopPropagation();
    this.IsHeaderMenuOpen = !this.IsHeaderMenuOpen;
  }

  public CloseHeaderMenu(): void {
    this.IsHeaderMenuOpen = false;
  }

  public OnToggleGroupByClick(event: Event): void {
    event.stopPropagation();
    this.ToggleGroupBy();
    this.CloseHeaderMenu();
  }

  public async OnRefreshConversationsClick(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.IsRefreshing) return;

    this.IsRefreshing = true;
    try {
      await this.engine.LoadConversations(this.EnvironmentId, this.CurrentUser, true);
      // Signal parent to also reload messages in the active conversation
      this.RefreshRequested.emit();
    } catch (error) {
      console.error('Error refreshing conversations:', error);
      await this.dialogService.alert('Error', 'Failed to refresh conversations. Please try again.');
    } finally {
      this.IsRefreshing = false;
      this.cdr.detectChanges();
      this.CloseHeaderMenu();
    }
  }

  public OnPinSidebarClick(event: Event): void {
    event.stopPropagation();
    this.CloseHeaderMenu();
    this.PinSidebarRequested.emit();
  }

  public OnUnpinSidebarClick(event: Event): void {
    event.stopPropagation();
    this.CloseHeaderMenu();
    this.UnpinSidebarRequested.emit();
  }

  public ToggleDirectMessages(): void {
    this.DirectMessagesExpanded = !this.DirectMessagesExpanded;
    this.dropHiddenRowsFromSelection();
  }

  public TogglePinned(): void {
    this.PinnedExpanded = !this.PinnedExpanded;
    this.dropHiddenRowsFromSelection();
  }

  public ToggleFolders(): void {
    this.FoldersExpanded = !this.FoldersExpanded;
    this.dropHiddenRowsFromSelection();
  }

  public ToggleUngrouped(): void {
    this.UngroupedExpanded = !this.UngroupedExpanded;
    this.dropHiddenRowsFromSelection();
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
  public SetSort(field: ConversationSortBy): void {
    if (this.SortBy === field) {
      this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.SortBy = field;
      this.SortDirection = ConversationListComponent.defaultSortDirections[field];
    }
    this.saveFolderPrefs();
    this.rebuildGroups();
  }

  /** Icon for a sort button: direction arrow when active, plain field icon otherwise. */
  public SortIcon(field: ConversationSortBy): string {
    if (this.SortBy !== field) {
      return field === 'date' ? 'fa-clock' : 'fa-font';
    }
    if (field === 'date') {
      return this.SortDirection === 'asc' ? 'fa-arrow-up-1-9' : 'fa-arrow-down-9-1';
    }
    return this.SortDirection === 'asc' ? 'fa-arrow-up-a-z' : 'fa-arrow-down-z-a';
  }

  /**
   * Orders conversations by the active sort. Returns a new array so the caller's
   * source list is never mutated. Conversations with no name sort last.
   */
  private sortConversations(conversations: MJConversationEntity[]): MJConversationEntity[] {
    const factor = this.SortDirection === 'asc' ? 1 : -1;
    return [...conversations].sort((a, b) => {
      if (this.SortBy === 'name') {
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
    this.PinnedConversations = matching.filter(c => c.IsPinned);
    this.UnpinnedConversations = matching.filter(c => !c.IsPinned);

    const projects = this.engine.Projects;
    const projectIds = new Set(projects.map(p => NormalizeUUID(p.ID)));

    // Bucket unpinned conversations by their folder (pinned ones live in the
    // Pinned section). Conversations with no/unknown folder are "ungrouped".
    const conversationsByProject = new Map<string, MJConversationEntity[]>();
    const ungrouped: MJConversationEntity[] = [];
    for (const c of this.UnpinnedConversations) {
      const pid = c.ProjectID ? NormalizeUUID(c.ProjectID) : null;
      if (pid && projectIds.has(pid)) {
        const arr = conversationsByProject.get(pid) ?? [];
        arr.push(c);
        conversationsByProject.set(pid, arr);
      } else {
        ungrouped.push(c);
      }
    }
    this.UngroupedConversations = ungrouped;

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
    this.FolderTree = build(null, 0);
    this.FlatFolders = this.flattenFolders(this.FolderTree);
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

  public IsFolderExpanded(projectId: string): boolean {
    return !this.collapsedFolderIds.has(NormalizeUUID(projectId));
  }

  public ToggleFolder(projectId: string): void {
    const key = NormalizeUUID(projectId);
    if (this.collapsedFolderIds.has(key)) {
      this.collapsedFolderIds.delete(key);
    } else {
      this.collapsedFolderIds.add(key);
    }
    this.saveFolderPrefs();
    this.dropHiddenRowsFromSelection();
  }

  public ToggleGroupBy(): void {
    this.GroupBy = this.GroupBy === 'project' ? 'none' : 'project';
    this.saveFolderPrefs();
    this.rebuildGroups();
    this.dropHiddenRowsFromSelection();
  }

  private loadFolderPrefs(): void {
    try {
      const raw = UserInfoEngine.Instance.GetSetting(ConversationListComponent.folderPrefsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        collapsed?: string[];
        groupBy?: ConversationGroupBy;
        sortBy?: ConversationSortBy;
        sortDirection?: ConversationSortDirection;
      };
      this.collapsedFolderIds = new Set((parsed.collapsed ?? []).map(id => NormalizeUUID(id)));
      if (parsed.groupBy === 'none' || parsed.groupBy === 'project') {
        this.GroupBy = parsed.groupBy;
      }
      if (parsed.sortBy === 'date' || parsed.sortBy === 'name') {
        this.SortBy = parsed.sortBy;
      }
      if (parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc') {
        this.SortDirection = parsed.sortDirection;
      }
    } catch {
      // Corrupt/legacy value — ignore and use defaults
    }
  }

  private saveFolderPrefs(): void {
    const payload = JSON.stringify({
      collapsed: Array.from(this.collapsedFolderIds),
      groupBy: this.GroupBy,
      sortBy: this.SortBy,
      sortDirection: this.SortDirection
    });
    UserInfoEngine.Instance.SetSettingDebounced(ConversationListComponent.folderPrefsKey, payload);
  }

  // ========================================================================
  // DRAG & DROP (move conversation into/out of a folder)
  // ========================================================================

  /**
   * Starts a conversation drag. Grabbing a row that is part of the current
   * selection drags the whole selection; grabbing any other row drags that row
   * alone and leaves the selection untouched. A touch press that lifts the row
   * selects it instead, since on touch a long-press means select.
   */
  public OnConversationDragStart(conversation: MJConversationEntity, event: DragEvent): void {
    if (this.lastRowPointerType === 'touch') {
      event.preventDefault();
      this.completeLongPress();
      return;
    }
    this.DraggedFolderId = null;
    this.DraggedConversationIds = this.SelectedConversationIds.has(conversation.ID)
      ? Array.from(this.SelectedConversationIds)
      : [conversation.ID];
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.DraggedConversationIds.join(','));
    }
  }

  public OnConversationDragEnd(): void {
    this.DraggedConversationIds = [];
    this.DragOverTargetId = null;
  }

  public OnFolderDragStart(node: FolderNode, event: DragEvent): void {
    event.stopPropagation();
    this.DraggedConversationIds = [];
    this.DraggedFolderId = node.project.ID;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.project.ID);
    }
  }

  public OnFolderDragEnd(): void {
    this.DraggedFolderId = null;
    this.DragOverTargetId = null;
  }

  public OnFolderDragOver(projectId: string, event: DragEvent): void {
    // A conversation can drop onto any folder; a folder can drop onto any folder
    // that isn't itself or one of its own descendants (which would create a cycle).
    const accepts = this.DraggedConversationIds.length > 0
      ? true
      : this.DraggedFolderId
        ? this.isValidFolderDropTarget(projectId)
        : false;
    if (!accepts) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.DragOverTargetId = projectId;
  }

  /**
   * Drop target id for a conversation row: its folder, or the Ungrouped section
   * when it has none. Resolved through the folder tree so the highlight matches
   * the folder row's own ID regardless of how the conversation stores it.
   */
  public ConversationDropTargetId(conversation: MJConversationEntity): string {
    if (!conversation.ProjectID) return 'ungrouped';
    const node = this.FlatFolders.find(f => UUIDsEqual(f.project.ID, conversation.ProjectID!));
    return node ? node.project.ID : 'ungrouped';
  }

  /**
   * A conversation row accepts a conversation drag and stands in for its folder,
   * so dropping onto the rows inside a folder files the drag there too. A row
   * that is part of the drag itself is not a target.
   */
  public OnConversationRowDragOver(conversation: MJConversationEntity, event: DragEvent): void {
    if (this.DraggedConversationIds.length === 0) return;
    if (this.DraggedConversationIds.some(id => UUIDsEqual(id, conversation.ID))) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.DragOverTargetId = this.ConversationDropTargetId(conversation);
  }

  public async OnConversationRowDrop(conversation: MJConversationEntity, event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const conversationIds = this.DraggedConversationIds.filter(id => !UUIDsEqual(id, conversation.ID));
    this.DragOverTargetId = null;
    this.DraggedConversationIds = [];
    if (conversationIds.length > 0) {
      await this.moveConversations(conversationIds, conversation.ProjectID ?? null);
    }
  }

  public OnUngroupedDragOver(event: DragEvent): void {
    if (this.DraggedConversationIds.length === 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.DragOverTargetId = 'ungrouped';
  }

  /** The Folders section header accepts a dragged folder to move it back to the top level. */
  public OnFoldersRootDragOver(event: DragEvent): void {
    if (!this.DraggedFolderId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.DragOverTargetId = 'folders-root';
  }

  public OnDragLeave(targetId: string): void {
    if (this.DragOverTargetId === targetId) {
      this.DragOverTargetId = null;
    }
  }

  public async OnFolderDrop(project: MJProjectEntity, event: DragEvent): Promise<void> {
    event.preventDefault();
    const conversationIds = this.DraggedConversationIds;
    const folderId = this.DraggedFolderId;
    this.DragOverTargetId = null;
    this.DraggedConversationIds = [];
    this.DraggedFolderId = null;
    if (conversationIds.length > 0) {
      await this.moveConversations(conversationIds, project.ID);
    } else if (folderId && this.isValidFolderDropTarget(project.ID, folderId)) {
      await this.moveFolder(folderId, project.ID);
    }
  }

  public async OnUngroupedDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const conversationIds = this.DraggedConversationIds;
    this.DragOverTargetId = null;
    this.DraggedConversationIds = [];
    if (conversationIds.length > 0) {
      await this.moveConversations(conversationIds, null);
    }
  }

  public OnFoldersRootDrop(event: DragEvent): void {
    event.preventDefault();
    const folderId = this.DraggedFolderId;
    this.DragOverTargetId = null;
    this.DraggedFolderId = null;
    if (folderId) {
      this.moveFolder(folderId, null);
    }
  }

  /**
   * A folder can be dropped onto a target folder only if the target isn't the dragged
   * folder itself and isn't one of its descendants (otherwise we'd create a cycle).
   */
  private isValidFolderDropTarget(targetId: string, draggedId: string | null = this.DraggedFolderId): boolean {
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
      const result = await this.engine.MoveMultipleConversationsToProject(toMove, projectId, this.CurrentUser);
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
      await this.engine.MoveProjectToParent(folderId, parentId, this.CurrentUser);
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
  public OnConversationContextMenu(conversation: MJConversationEntity, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.lastRowPointerType === 'touch') {
      // Some touch browsers report a long-press as a right-click; it selects instead.
      this.completeLongPress();
      return;
    }
    const targets = this.SelectedConversationIds.has(conversation.ID)
      ? Array.from(this.SelectedConversationIds)
      : [conversation.ID];
    this.openContextMenu({ kind: 'conversation', conversation, folder: null, targets }, this.pointerAnchor(event));
  }

  /** The row's ⋯ button opens the same menu, anchored under the button. */
  public OpenRowMenu(conversation: MJConversationEntity, event: MouseEvent): void {
    event.stopPropagation();
    const targets = this.SelectedConversationIds.has(conversation.ID)
      ? Array.from(this.SelectedConversationIds)
      : [conversation.ID];
    this.openContextMenu({ kind: 'conversation', conversation, folder: null, targets }, this.buttonAnchor(event));
  }

  public OnFolderContextMenu(project: MJProjectEntity, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.openContextMenu({ kind: 'folder', conversation: null, folder: project, targets: [] }, this.pointerAnchor(event));
  }

  /** Empty space: a click that landed on a row or folder is theirs, not the list's. */
  public OnBackgroundContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.conversation-item, .folder-row')) return;
    event.preventDefault();
    this.openContextMenu({ kind: 'background', conversation: null, folder: null, targets: [] }, this.pointerAnchor(event));
  }

  /** A menu opened at the pointer opens upward from the pointer when it must. */
  private pointerAnchor(event: MouseEvent): MenuAnchor {
    return { x: event.clientX, y: event.clientY, flipBottom: event.clientY };
  }

  /** A menu opened from a button sits under it, or above it when there is no room below. */
  private buttonAnchor(event: MouseEvent): MenuAnchor {
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    if (!rect) return this.pointerAnchor(event);
    return { x: rect.left, y: rect.bottom + 2, flipBottom: rect.top - 2 };
  }

  private openContextMenu(
    menu: Omit<ListContextMenu, 'x' | 'y' | 'anchor'>,
    anchor: MenuAnchor,
    showFolderPicker = false
  ): void {
    this.IsMoveSubmenuOpen = showFolderPicker;
    this.ContextMenu = { ...menu, anchor, x: anchor.x, y: anchor.y };
    this.fitContextMenuInViewport();
  }

  /**
   * Keeps the open menu inside the window: it opens upward from its anchor when
   * there is no room below, and moves left when there is no room to the right.
   * Runs again whenever the folder picker changes the menu's height.
   */
  private fitContextMenuInViewport(): void {
    if (!this.ContextMenu) return;
    this.cdr.detectChanges(); // render the menu so it can be measured
    const menuElement = this.contextMenuEl?.nativeElement;
    if (!menuElement) return;

    const { width, height } = menuElement.getBoundingClientRect();
    const { anchor } = this.ContextMenu;
    const margin = ConversationListComponent.menuViewportMargin;

    let y = anchor.y;
    if (y + height > window.innerHeight - margin) {
      const above = anchor.flipBottom - height;
      y = above >= margin ? above : Math.max(margin, window.innerHeight - margin - height);
    }
    const x = Math.max(margin, Math.min(anchor.x, window.innerWidth - margin - width));

    this.ContextMenu = { ...this.ContextMenu, x, y };
    this.cdr.detectChanges();
  }

  public CloseContextMenu(): void {
    this.ContextMenu = null;
    this.IsMoveSubmenuOpen = false;
  }

  public OpenMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.IsMoveSubmenuOpen = true;
    this.fitContextMenuInViewport();
  }

  public CloseMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.IsMoveSubmenuOpen = false;
    this.fitContextMenuInViewport();
  }

  /** Marks the folder a single conversation already sits in. Never marks a multi-target menu. */
  public IsSingleTargetInFolder(projectId: string | null): boolean {
    const conversation = this.ContextMenu?.conversation;
    if (!conversation || this.ContextMenu?.targets.length !== 1) return false;
    return projectId
      ? !!conversation.ProjectID && UUIDsEqual(conversation.ProjectID, projectId)
      : !conversation.ProjectID;
  }

  /** Conversations the menu's actions apply to — its targets, or the selection. */
  private actionTargetIds(): string[] {
    const targets = this.ContextMenu?.targets ?? [];
    return targets.length > 0 ? targets : Array.from(this.SelectedConversationIds);
  }

  public ContextMoveToFolder(projectId: string | null): void {
    void this.BulkMoveToFolder(projectId);
  }

  public ContextMoveToNewFolder(event: Event): void {
    event.stopPropagation();
    const ids = this.actionTargetIds();
    this.CloseContextMenu();
    this.openFolderModal(null, null, (created) => this.moveConversations(ids, created.ID));
  }

  public ContextSetPinned(isPinned: boolean): void {
    void this.BulkSetPinned(isPinned);
  }

  public ContextTogglePin(): void {
    const conversation = this.ContextMenu?.conversation;
    if (!conversation) return;
    void this.BulkSetPinned(!conversation.IsPinned);
  }

  /** Shares the menu's targets — the whole selection, or just the clicked row. */
  public ContextShare(): void {
    const ids = this.actionTargetIds();
    this.CloseContextMenu();
    this.shareConversations(ids);
  }

  /**
   * Opens the dialog the chat header uses for the conversations the user may
   * share, and reports how many were left out. Says why when there are none.
   */
  private shareConversations(ids: string[]): void {
    const conversations = ids
      .map(id => this.engine.GetConversation(id))
      .filter((c): c is MJConversationEntity => !!c);
    const shareable = conversations.filter(c => this.canShare(c));
    if (shareable.length === 0) {
      void this.dialogService.alert('Cannot Share', `${this.ShareRefusedReason}.`);
      return;
    }

    const skipped = conversations.length - shareable.length;
    this.ShareContexts = shareable.map(c => ({
      ResourceID: c.ID,
      ResourceName: c.Name ?? 'Conversation',
      OwnerUserID: c.UserID ?? null,
      OwnerDisplayName: c.User ?? 'You',
      CurrentUserID: this.CurrentUser?.ID ?? null
    }));
    this.ShareNotice = skipped > 0
      ? `${skipped} of ${conversations.length} left out — ${this.ShareRefusedReason.toLowerCase()}.`
      : null;
    this.IsShareDialogOpen = true;
  }

  /** True when at least one of the conversations can be shared by the current user. */
  public CanShareAny(ids: string[]): boolean {
    return ids.some(id => this.canShare(this.engine.GetConversation(id)));
  }

  private canShare(conversation: MJConversationEntity | undefined): boolean {
    if (!conversation || !this.CurrentUser) return false;
    return this.engine.CanShareConversation(conversation, this.CurrentUser.ID);
  }

  /** True when at least one of the conversations can be moved or pinned by the current user. */
  public CanChangeAny(ids: string[]): boolean {
    return ids.some(id => {
      const conversation = this.engine.GetConversation(id);
      return !!conversation && this.CanChange(conversation);
    });
  }

  /** True when the user may move or pin the conversation: they own it, or hold Edit or Owner access. */
  public CanChange(conversation: MJConversationEntity): boolean {
    if (!this.CurrentUser) return false;
    return this.engine.CanEditConversation(conversation, this.CurrentUser.ID);
  }

  public OnShareDialogResult(_result: ResourceShareDialogResult): void {
    this.IsShareDialogOpen = false;
    this.ShareContexts = [];
    this.ShareNotice = null;
    this.cdr.detectChanges();
  }

  public ContextRename(): void {
    const conversation = this.ContextMenu?.conversation;
    this.CloseContextMenu();
    if (conversation) this.RenameConversation(conversation);
  }

  public ContextDelete(): void {
    void this.BulkDeleteConversations();
  }

  public ContextCreateSubfolder(event: Event): void {
    const folder = this.ContextMenu?.folder;
    this.CloseContextMenu();
    if (folder) this.CreateFolder(folder.ID, event);
  }

  public ContextEditFolder(event: Event): void {
    const folder = this.ContextMenu?.folder;
    this.CloseContextMenu();
    if (folder) this.EditFolder(folder, event);
  }

  public ContextDeleteFolder(event: Event): void {
    const folder = this.ContextMenu?.folder;
    this.CloseContextMenu();
    if (folder) void this.DeleteFolder(folder, event);
  }

  public ContextNewConversation(): void {
    this.CloseContextMenu();
    this.CreateNewConversation();
  }

  public ContextCreateRootFolder(event: Event): void {
    this.CloseContextMenu();
    this.CreateFolder(null, event);
  }

  public ContextSelectAll(): void {
    this.CloseContextMenu();
    this.IsSelectionMode = true;
    this.SelectAll();
  }

  // ========================================================================
  // FOLDER CRUD (reuses the existing project form modal)
  // ========================================================================

  public CreateFolder(parentId: string | null, event?: Event): void {
    if (event) event.stopPropagation();
    this.openFolderModal(null, parentId);
  }

  public EditFolder(project: MJProjectEntity, event?: Event): void {
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
    instance.environmentId = this.EnvironmentId;
    instance.currentUser = this.CurrentUser;
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

  public async DeleteFolder(project: MJProjectEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();

    const node = this.findFolderNode(this.FolderTree, project.ID);
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
      await this.engine.DeleteProject(project.ID, this.CurrentUser);
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
    return UUIDsEqual(conversation.ID, this.SelectedConversationId);
  }

  /** True when this conversation is part of the current multi-selection. */
  IsConversationSelected(conversation: MJConversationEntity): boolean {
    return this.IsSelectionMode && this.SelectedConversationIds.has(conversation.ID);
  }

  IsConversationRenamed(conversation: MJConversationEntity): boolean {
    return UUIDsEqual(conversation.ID, this.RenamedConversationId);
  }

  IsConversationDragging(conversation: MJConversationEntity): boolean {
    return this.DraggedConversationIds.some(id => UUIDsEqual(id, conversation.ID));
  }

  SelectConversation(conversation: MJConversationEntity): void {
    this.ConversationSelected.emit(conversation.ID);
    // Clear unread notifications when conversation is opened
    this.notificationService.markConversationAsRead(conversation.ID);
  }

  async CreateNewConversation(): Promise<void> {
    // Don't create DB record yet - just show the welcome screen
    // Conversation will be created when user sends first message
    this.NewConversationRequested.emit();
  }

  async RenameConversation(conversation: MJConversationEntity): Promise<void> {
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
            this.CurrentUser
          );
        }
      }
    } catch (error) {
      console.error('Error renaming conversation:', error);
      await this.dialogService.alert('Error', 'Failed to update conversation. Please try again.');
    }
  }

  async DeleteConversation(conversation: MJConversationEntity): Promise<void> {
    try {
      const confirmed = await this.dialogService.confirm({
        title: 'Delete Conversation',
        message: `Are you sure you want to delete "${conversation.Name}"? This action cannot be undone.`,
        okText: 'Delete',
        cancelText: 'Cancel'
      });

      if (confirmed) {
        const deletedId = conversation.ID;
        await this.engine.DeleteConversation(deletedId, this.CurrentUser);
        this.cdr.detectChanges();
        this.ConversationDeleted.emit(deletedId);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      await this.dialogService.alert('Error', 'Failed to delete conversation. Please try again.');
    }
  }

  async TogglePin(conversation: MJConversationEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    this.CloseContextMenu(); // Close immediately on user action — don't wait for the async op
    try {
      await this.engine.PinConversation(conversation.ID, !conversation.IsPinned, this.CurrentUser);
    } catch (error) {
      console.error('Error toggling pin:', error);
      await this.dialogService.alert('Error', 'Failed to pin/unpin conversation. Please try again.');
    }
  }

  HasActiveTasks(conversationId: string): boolean {
    return this.ConversationIdsWithTasks.has(conversationId);
  }

  /** True when this conversation was shared with the current user by someone else. */
  IsSharedWithMe(conversation: MJConversationEntity): boolean {
    return this.engine.GetSharedByInfo(conversation.ID) !== null;
  }

  /** Tooltip for the sidebar share icon: "Shared by {email or name}". */
  SharedWithMeTooltip(conversation: MJConversationEntity): string {
    const info = this.engine.GetSharedByInfo(conversation.ID);
    if (!info) return 'Shared with you';
    return `Shared by ${info.Email ?? info.Name ?? 'another user'}`;
  }

  ToggleSelectionMode(): void {
    if (this.IsSelectionMode) {
      this.exitSelectionMode();
    } else {
      this.IsSelectionMode = true;
    }
  }

  /**
   * Clicking the empty space of the list drops the selection, the way clicking
   * blank space in a file browser does. A click that landed on a row, folder,
   * section header or button is handled by that element instead.
   */
  public OnListBackgroundClick(event: MouseEvent): void {
    if (!this.IsSelectionMode) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('.conversation-item, .folder-row, .section-header, button')) return;

    this.exitSelectionMode();
  }

  private exitSelectionMode(): void {
    this.IsSelectionMode = false;
    this.SelectedConversationIds.clear();
    this.selectionAnchorId = null;
  }

  /** Ends selection mode from the selection bar's clear button. */
  public ClearSelection(): void {
    this.exitSelectionMode();
  }

  /** Selection mode closes itself once the last row is deselected. */
  private exitSelectionModeIfEmpty(): void {
    if (this.SelectedConversationIds.size === 0) {
      this.exitSelectionMode();
    }
  }

  /** Adds or removes one row and makes it the range anchor, ending the mode when nothing is left. */
  private toggleRowSelection(conversationId: string): void {
    this.ToggleConversationSelection(conversationId);
    this.selectionAnchorId = conversationId;
    this.exitSelectionModeIfEmpty();
  }

  /**
   * Drops selected rows the view no longer shows — after a search edit, a
   * collapse, or a grouping change — so no action can reach a row the user
   * cannot see. A list rebuild alone does not call this: a move into a
   * collapsed folder keeps its rows selected for a follow-up action.
   */
  private dropHiddenRowsFromSelection(): void {
    if (this.SelectedConversationIds.size === 0) return;
    const visible = new Set(this.visibleConversationIds().map(id => NormalizeUUID(id)));
    this.removeFromSelection(id => !visible.has(NormalizeUUID(id)));
  }

  /** Drops selected conversations that are no longer in the engine's list at all. */
  private dropRemovedConversationsFromSelection(): void {
    if (this.SelectedConversationIds.size === 0) return;
    const listed = new Set(this.engine.Conversations.map(c => NormalizeUUID(c.ID)));
    this.removeFromSelection(id => !listed.has(NormalizeUUID(id)));
  }

  /** Removes the selected IDs that match, and ends selection mode if none remain. */
  private removeFromSelection(shouldRemove: (conversationId: string) => boolean): void {
    for (const id of Array.from(this.SelectedConversationIds)) {
      if (shouldRemove(id)) {
        this.SelectedConversationIds.delete(id);
      }
    }
    this.exitSelectionModeIfEmpty();
  }

  /**
   * Adds the open conversation to a selection that is just starting, so it moves
   * with the rows picked alongside it. Returns the id added, or null when nothing
   * is open or it is hidden inside a collapsed folder or section.
   */
  private seedSelectionWithOpenConversation(): string | null {
    const openId = this.SelectedConversationId;
    if (!openId) return null;
    const visibleId = this.visibleConversationIds().find(id => UUIDsEqual(id, openId));
    if (!visibleId) return null;
    this.SelectedConversationIds.add(visibleId);
    return visibleId;
  }

  /** Conversation IDs in the order the list renders them, skipping collapsed sections and folders. */
  private visibleConversationIds(): string[] {
    const ids: string[] = [];
    const sectionOpen = (expanded: boolean) => !this.ShowSectionHeaders || expanded;

    if (sectionOpen(this.PinnedExpanded)) {
      ids.push(...this.PinnedConversations.map(c => c.ID));
    }

    if (this.ShowSectionHeaders && this.GroupBy === 'project') {
      if (this.FoldersExpanded) {
        // Subfolders render above their parent folder's own conversations.
        const walk = (nodes: FolderNode[]): void => {
          for (const node of nodes) {
            if (!this.IsFolderExpanded(node.project.ID)) continue;
            walk(node.children);
            ids.push(...node.conversations.map(c => c.ID));
          }
        };
        walk(this.FolderTree);
      }
      if (this.UngroupedExpanded) {
        ids.push(...this.UngroupedConversations.map(c => c.ID));
      }
    } else if (sectionOpen(this.DirectMessagesExpanded)) {
      ids.push(...this.UnpinnedConversations.map(c => c.ID));
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

    const anchorId = this.selectionAnchorId ?? this.SelectedConversationId;
    const start = this.indexOfConversation(order, anchorId);
    if (start < 0) {
      // No anchor and no open conversation on screen — pick this row alone.
      this.SelectedConversationIds.add(conversationId);
      this.selectionAnchorId = conversationId;
      return;
    }
    this.selectionAnchorId = order[start];

    const [from, to] = start <= end ? [start, end] : [end, start];
    for (let i = from; i <= to; i++) {
      this.SelectedConversationIds.add(order[i]);
    }
  }

  ToggleConversationSelection(conversationId: string): void {
    if (this.SelectedConversationIds.has(conversationId)) {
      this.SelectedConversationIds.delete(conversationId);
    } else {
      this.SelectedConversationIds.add(conversationId);
    }
  }

  /** Selects every row on screen — never rows hidden by the search or a collapsed folder or section. */
  SelectAll(): void {
    this.visibleConversationIds().forEach(id => {
      this.SelectedConversationIds.add(id);
    });
  }

  DeselectAll(): void {
    this.SelectedConversationIds.clear();
  }

  /**
   * Moves the conversations into one folder, or out of all folders when projectId
   * is null. The selection survives so a second bulk action can follow.
   */
  async BulkMoveToFolder(projectId: string | null, ids: string[] = this.actionTargetIds()): Promise<void> {
    this.CloseContextMenu();
    if (ids.length === 0) return;

    try {
      const result = await this.engine.MoveMultipleConversationsToProject(ids, projectId, this.CurrentUser);
      await this.reportBulkOutcome(result, 'moved');
    } catch (error) {
      console.error('Error moving conversations:', error);
      await this.dialogService.alert('Error', 'Failed to move the selected conversations. Please try again.');
    }
    this.cdr.detectChanges();
  }

  /** Pins or unpins the conversations, keeping the selection. */
  async BulkSetPinned(isPinned: boolean, ids: string[] = this.actionTargetIds()): Promise<void> {
    this.CloseContextMenu();
    if (ids.length === 0) return;

    try {
      const result = await this.engine.PinMultipleConversations(ids, isPinned, this.CurrentUser);
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

    const failedNames = result.Failed.map(f => `"${f.Name}" (${f.Error})`).join(', ');
    await this.dialogService.alert(
      'Partial Success',
      `${result.Successful.length} conversation${result.Successful.length === 1 ? '' : 's'} ${verb}.\n\n` +
      `${result.Failed.length} could not be ${verb}: ${failedNames}`
    );
  }

  /**
   * Deletes the conversations after confirmation. Only the deleted ones leave the
   * selection: deleting a row outside it leaves it alone, and rows that failed
   * stay selected so the user can try again.
   */
  async BulkDeleteConversations(ids: string[] = this.actionTargetIds()): Promise<void> {
    const count = ids.length;
    this.CloseContextMenu();

    if (count === 0) return;

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Conversations',
      message: `Are you sure you want to delete ${count} conversation${count > 1 ? 's' : ''}? This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!confirmed) return;

    try {
      const result = await this.engine.DeleteMultipleConversations(ids, this.CurrentUser);
      await this.reportDeleteOutcome(result, count);
      for (const id of result.Successful) {
        this.ConversationDeleted.emit(id);
      }
      const deleted = new Set(result.Successful.map(id => NormalizeUUID(id)));
      this.removeFromSelection(id => deleted.has(NormalizeUUID(id)));
    } catch (error) {
      console.error('Error deleting conversations:', error);
      await this.dialogService.alert('Error', 'Failed to delete conversations. Please try again.');
    } finally {
      this.cdr.detectChanges();
    }
  }

  /** Reports the conversations a bulk delete could not remove. Silent on full success. */
  private async reportDeleteOutcome(
    result: { Successful: string[]; Failed: Array<{ ID: string; Name: string; Error: string }> },
    count: number
  ): Promise<void> {
    if (result.Failed.length === 0) return;
    if (result.Successful.length === 0) {
      await this.dialogService.alert(
        'Delete Failed',
        `None of the ${count} conversations could be deleted. They may have already been removed.`
      );
      return;
    }
    const failedNames = result.Failed.map(f => `"${f.Name}"`).join(', ');
    await this.dialogService.alert(
      'Partial Success',
      `Deleted ${result.Successful.length} of ${count} conversations.\n\n` +
      `${result.Failed.length} could not be deleted: ${failedNames}`
    );
  }

  // ========================================================================
  // SELECTION BAR — stands in for the search row while a selection exists
  // ========================================================================

  /** The selected conversation IDs, in the order they were picked. */
  public get SelectedIds(): string[] {
    return Array.from(this.SelectedConversationIds);
  }

  /** True when any selected conversation is unpinned, so the bar's pin button pins rather than unpins. */
  public SelectionHasUnpinned(): boolean {
    return this.SelectedIds.some(id => !this.engine.GetConversation(id)?.IsPinned);
  }

  /** The bar acts on the selection even while a menu for another row is open. */
  public BarSetPinned(): void {
    void this.BulkSetPinned(this.SelectionHasUnpinned(), this.SelectedIds);
  }

  public BarShare(): void {
    this.CloseContextMenu();
    this.shareConversations(this.SelectedIds);
  }

  public BarDelete(): void {
    void this.BulkDeleteConversations(this.SelectedIds);
  }

  /** Opens the folder picker for the selection, under the bar's Move button. */
  public BarOpenMoveMenu(event: MouseEvent): void {
    event.stopPropagation(); // the document click would close the picker straight away
    const ids = this.SelectedIds;
    const conversation = ids.length === 1 ? this.engine.GetConversation(ids[0]) ?? null : null;
    this.openContextMenu({ kind: 'conversation', conversation, folder: null, targets: ids }, this.buttonAnchor(event), true);
  }

  // ========================================================================
  // ROW CLICKS, CHECKBOXES AND TOUCH PRESSES
  // ========================================================================

  /**
   * The row checkbox adds or removes its row without opening it — the mouse
   * route to a selection that needs no keyboard. Shift-click extends a range.
   * Unlike a Ctrl-click it never takes the open conversation along, so the
   * checkboxes show exactly what is picked.
   */
  public OnRowCheckboxClick(conversation: MJConversationEntity, event: MouseEvent): void {
    event.stopPropagation();
    this.IsSelectionMode = true;
    if (event.shiftKey) {
      this.selectRangeTo(conversation.ID);
      return;
    }
    this.toggleRowSelection(conversation.ID);
  }

  /**
   * Starts timing a touch press on a row; held long enough, it selects the row.
   * Presses on the row's own buttons (the checkbox and ⋯) are theirs to handle.
   */
  public OnRowPointerDown(conversation: MJConversationEntity, event: PointerEvent): void {
    this.lastRowPointerType = event.pointerType;
    this.ignoreNextRowClick = false;
    this.CancelLongPress();
    if (event.pointerType !== 'touch') return;
    if ((event.target as HTMLElement | null)?.closest('button')) return;

    this.longPress = {
      conversation,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => this.completeLongPress(), ConversationListComponent.longPressDelayMs)
    };
  }

  /** A touch that drifts is a scroll, not a press. */
  public OnRowPointerMove(event: PointerEvent): void {
    if (!this.longPress) return;
    const distance = Math.hypot(event.clientX - this.longPress.x, event.clientY - this.longPress.y);
    if (distance > ConversationListComponent.longPressMoveTolerancePx) {
      this.CancelLongPress();
    }
  }

  public CancelLongPress(): void {
    if (this.longPress) {
      clearTimeout(this.longPress.timer);
      this.longPress = null;
    }
  }

  /**
   * Completes the press in progress, if any: selects its row and starts
   * selection mode, as a long-press does in Gmail. The click that ends the same
   * press is then ignored, so it does not undo the selection.
   */
  private completeLongPress(): void {
    const press = this.longPress;
    if (!press) return;
    this.CancelLongPress();
    this.ignoreNextRowClick = true;
    this.IsSelectionMode = true;
    this.SelectedConversationIds.add(press.conversation.ID);
    this.selectionAnchorId = press.conversation.ID;
    this.cdr.detectChanges();
  }

  /**
   * Routes a row click. Ctrl/Cmd toggles one row and Shift extends from the
   * anchor, either one starting selection mode. On touch, while selecting, a tap
   * adds or removes the row. Any other click collapses the selection and opens
   * the conversation.
   */
  HandleConversationClick(conversation: MJConversationEntity, event?: MouseEvent): void {
    if (this.ignoreNextRowClick) {
      this.ignoreNextRowClick = false;
      return;
    }
    if (this.IsSelectionMode && this.lastRowPointerType === 'touch') {
      this.toggleRowSelection(conversation.ID);
      return;
    }

    const isRangeClick = !!event?.shiftKey;
    const isToggleClick = !!event && (event.ctrlKey || event.metaKey);

    if (isRangeClick || isToggleClick) {
      event?.preventDefault(); // a Shift-click would otherwise paint a text selection
      const entering = !this.IsSelectionMode;
      if (entering) {
        this.IsSelectionMode = true;
      }
      if (isRangeClick) {
        this.selectRangeTo(conversation.ID);
      } else {
        // The open conversation reads as picked, so a Ctrl-click that starts a
        // selection takes it along; a Shift-click already ranges from it.
        const seeded = entering ? this.seedSelectionWithOpenConversation() : null;
        if (!seeded || !UUIDsEqual(seeded, conversation.ID)) {
          this.ToggleConversationSelection(conversation.ID);
        }
        this.selectionAnchorId = conversation.ID;
        this.exitSelectionModeIfEmpty();
      }
      return;
    }

    // A plain click collapses the selection down to this one conversation, the
    // way a file browser does.
    if (this.IsSelectionMode) {
      this.exitSelectionMode();
    }
    this.SelectConversation(conversation);
  }
  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }

  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }

  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }

  /** @deprecated Use {@link SelectedConversationId}. */
  @Input() set selectedConversationId(value: string | null) {
    this.SelectedConversationId = value;
  }

  /** @deprecated Use {@link SelectedConversationId}. */
  get selectedConversationId(): string | null {
    return this.SelectedConversationId;
  }

  /** @deprecated Use {@link RenamedConversationId}. */
  @Input() set renamedConversationId(value: string | null) {
    this.RenamedConversationId = value;
  }

  /** @deprecated Use {@link RenamedConversationId}. */
  get renamedConversationId(): string | null {
    return this.RenamedConversationId;
  }

  /** @deprecated Use {@link IsSidebarPinned}. */
  @Input() set isSidebarPinned(value: boolean) {
    this.IsSidebarPinned = value;
  }

  /** @deprecated Use {@link IsSidebarPinned}. */
  get isSidebarPinned(): boolean {
    return this.IsSidebarPinned;
  } // Whether sidebar is pinned (stays open after selection)

  /** @deprecated Use {@link IsMobileView}. */
  @Input() set isMobileView(value: boolean) {
    this.IsMobileView = value;
  }

  /** @deprecated Use {@link IsMobileView}. */
  get isMobileView(): boolean {
    return this.IsMobileView;
  } // Whether we're on mobile (no pin options)

  /** @deprecated Use {@link ShowNewConversationButton}. */
  @Input() set showNewConversationButton(value: boolean) {
    this.ShowNewConversationButton = value;
  }

  /** @deprecated Use {@link ShowNewConversationButton}. */
  get showNewConversationButton(): boolean {
    return this.ShowNewConversationButton;
  }

  /** @deprecated Use {@link ShowHeaderMenu}. */
  @Input() set showHeaderMenu(value: boolean) {
    this.ShowHeaderMenu = value;
  }

  /** @deprecated Use {@link ShowHeaderMenu}. */
  get showHeaderMenu(): boolean {
    return this.ShowHeaderMenu;
  }

  /** @deprecated Use {@link ShowSectionHeaders}. */
  @Input() set showSectionHeaders(value: boolean) {
    this.ShowSectionHeaders = value;
  }

  /** @deprecated Use {@link ShowSectionHeaders}. */
  get showSectionHeaders(): boolean {
    return this.ShowSectionHeaders;
  }

  /** @deprecated Use {@link DirectMessagesExpanded}. */
  public get directMessagesExpanded(): boolean {
    return this.DirectMessagesExpanded;
  }

  /** @deprecated Use {@link DirectMessagesExpanded}. */
  public set directMessagesExpanded(value: boolean) {
    this.DirectMessagesExpanded = value;
  }

  /** @deprecated Use {@link PinnedExpanded}. */
  public get pinnedExpanded(): boolean {
    return this.PinnedExpanded;
  }

  /** @deprecated Use {@link PinnedExpanded}. */
  public set pinnedExpanded(value: boolean) {
    this.PinnedExpanded = value;
  }

  /** @deprecated Use {@link FoldersExpanded}. */
  public get foldersExpanded(): boolean {
    return this.FoldersExpanded;
  }

  /** @deprecated Use {@link FoldersExpanded}. */
  public set foldersExpanded(value: boolean) {
    this.FoldersExpanded = value;
  }

  /** @deprecated Use {@link UngroupedExpanded}. */
  public get ungroupedExpanded(): boolean {
    return this.UngroupedExpanded;
  }

  /** @deprecated Use {@link UngroupedExpanded}. */
  public set ungroupedExpanded(value: boolean) {
    this.UngroupedExpanded = value;
  }

  /** @deprecated Use {@link ConversationIdsWithTasks}. */
  public get conversationIdsWithTasks() {
    return this.ConversationIdsWithTasks;
  }

  /** @deprecated Use {@link ConversationIdsWithTasks}. */
  public set conversationIdsWithTasks(value) {
    this.ConversationIdsWithTasks = value;
  }

  /** @deprecated Use {@link IsSelectionMode}. */
  public get isSelectionMode(): boolean {
    return this.IsSelectionMode;
  }

  /** @deprecated Use {@link IsSelectionMode}. */
  public set isSelectionMode(value: boolean) {
    this.IsSelectionMode = value;
  }

  /** @deprecated Use {@link SelectedConversationIds}. */
  public get selectedConversationIds() {
    return this.SelectedConversationIds;
  }

  /** @deprecated Use {@link SelectedConversationIds}. */
  public set selectedConversationIds(value) {
    this.SelectedConversationIds = value;
  }

  /** @deprecated Use {@link IsHeaderMenuOpen}. */
  public get isHeaderMenuOpen(): boolean {
    return this.IsHeaderMenuOpen;
  }

  /** @deprecated Use {@link IsHeaderMenuOpen}. */
  public set isHeaderMenuOpen(value: boolean) {
    this.IsHeaderMenuOpen = value;
  }

  /** @deprecated Use {@link IsRefreshing}. */
  public get isRefreshing(): boolean {
    return this.IsRefreshing;
  }

  /** @deprecated Use {@link IsRefreshing}. */
  public set isRefreshing(value: boolean) {
    this.IsRefreshing = value;
  }

  /** @deprecated Use {@link GroupBy}. */
  public get groupBy(): ConversationGroupBy {
    return this.GroupBy;
  }

  /** @deprecated Use {@link GroupBy}. */
  public set groupBy(value: ConversationGroupBy) {
    this.GroupBy = value;
  }

  /** @deprecated Use {@link PinnedConversations}. */
  public get pinnedConversations(): MJConversationEntity[] {
    return this.PinnedConversations;
  }

  /** @deprecated Use {@link PinnedConversations}. */
  public set pinnedConversations(value: MJConversationEntity[]) {
    this.PinnedConversations = value;
  }

  /** @deprecated Use {@link UnpinnedConversations}. */
  public get unpinnedConversations(): MJConversationEntity[] {
    return this.UnpinnedConversations;
  }

  /** @deprecated Use {@link UnpinnedConversations}. */
  public set unpinnedConversations(value: MJConversationEntity[]) {
    this.UnpinnedConversations = value;
  }

  /** @deprecated Use {@link UngroupedConversations}. */
  public get ungroupedConversations(): MJConversationEntity[] {
    return this.UngroupedConversations;
  }

  /** @deprecated Use {@link UngroupedConversations}. */
  public set ungroupedConversations(value: MJConversationEntity[]) {
    this.UngroupedConversations = value;
  }

  /** @deprecated Use {@link FolderTree}. */
  public get folderTree(): FolderNode[] {
    return this.FolderTree;
  }

  /** @deprecated Use {@link FolderTree}. */
  public set folderTree(value: FolderNode[]) {
    this.FolderTree = value;
  }

  /** @deprecated Use {@link FlatFolders}. */
  public get flatFolders(): FolderNode[] {
    return this.FlatFolders;
  }

  /** @deprecated Use {@link FlatFolders}. */
  public set flatFolders(value: FolderNode[]) {
    this.FlatFolders = value;
  }

  /** @deprecated Use {@link DraggedFolderId}. */
  public get draggedFolderId(): string | null {
    return this.DraggedFolderId;
  }

  /** @deprecated Use {@link DraggedFolderId}. */
  public set draggedFolderId(value: string | null) {
    this.DraggedFolderId = value;
  }

  /** @deprecated Use {@link DragOverTargetId}. */
  public get dragOverTargetId(): string | null {
    return this.DragOverTargetId;
  }

  /** @deprecated Use {@link DragOverTargetId}. */
  public set dragOverTargetId(value: string | null) {
    this.DragOverTargetId = value;
  }

  /** @deprecated Use {@link SearchQuery}. */
  get searchQuery(): string {
    return this.SearchQuery;
  }

  /** @deprecated Use {@link SearchQuery}. */
  set searchQuery(value: string) {
    this.SearchQuery = value;
  }

  /** @deprecated Use {@link IsSearching}. */
  get isSearching(): boolean {
    return this.IsSearching;
  }

  /** @deprecated Use {@link ToggleHeaderMenu}. */
  public toggleHeaderMenu(event: Event): void {
    return this.ToggleHeaderMenu(event);
  }

  /** @deprecated Use {@link CloseHeaderMenu}. */
  public closeHeaderMenu(): void {
    return this.CloseHeaderMenu();
  }

  /** @deprecated Use {@link OnToggleGroupByClick}. */
  public onToggleGroupByClick(event: Event): void {
    return this.OnToggleGroupByClick(event);
  }

  /** @deprecated Use {@link OnRefreshConversationsClick}. */
  public onRefreshConversationsClick(event: Event): Promise<void> {
    return this.OnRefreshConversationsClick(event);
  }

  /** @deprecated Use {@link OnPinSidebarClick}. */
  public onPinSidebarClick(event: Event): void {
    return this.OnPinSidebarClick(event);
  }

  /** @deprecated Use {@link OnUnpinSidebarClick}. */
  public onUnpinSidebarClick(event: Event): void {
    return this.OnUnpinSidebarClick(event);
  }

  /** @deprecated Use {@link ToggleDirectMessages}. */
  public toggleDirectMessages(): void {
    return this.ToggleDirectMessages();
  }

  /** @deprecated Use {@link TogglePinned}. */
  public togglePinned(): void {
    return this.TogglePinned();
  }

  /** @deprecated Use {@link ToggleFolders}. */
  public toggleFolders(): void {
    return this.ToggleFolders();
  }

  /** @deprecated Use {@link ToggleUngrouped}. */
  public toggleUngrouped(): void {
    return this.ToggleUngrouped();
  }

  /** @deprecated Use {@link IsFolderExpanded}. */
  public isFolderExpanded(projectId: string): boolean {
    return this.IsFolderExpanded(projectId);
  }

  /** @deprecated Use {@link ToggleFolder}. */
  public toggleFolder(projectId: string): void {
    return this.ToggleFolder(projectId);
  }

  /** @deprecated Use {@link ToggleGroupBy}. */
  public toggleGroupBy(): void {
    return this.ToggleGroupBy();
  }

  /** @deprecated Use {@link OnConversationDragStart}. */
  public onConversationDragStart(conversation: MJConversationEntity, event: DragEvent): void {
    return this.OnConversationDragStart(conversation, event);
  }

  /** @deprecated Use {@link OnConversationDragEnd}. */
  public onConversationDragEnd(): void {
    return this.OnConversationDragEnd();
  }

  /** @deprecated Use {@link OnFolderDragStart}. */
  public onFolderDragStart(node: FolderNode, event: DragEvent): void {
    return this.OnFolderDragStart(node, event);
  }

  /** @deprecated Use {@link OnFolderDragEnd}. */
  public onFolderDragEnd(): void {
    return this.OnFolderDragEnd();
  }

  /** @deprecated Use {@link OnFolderDragOver}. */
  public onFolderDragOver(projectId: string, event: DragEvent): void {
    return this.OnFolderDragOver(projectId, event);
  }

  /** @deprecated Use {@link OnUngroupedDragOver}. */
  public onUngroupedDragOver(event: DragEvent): void {
    return this.OnUngroupedDragOver(event);
  }

  /** @deprecated Use {@link OnFoldersRootDragOver}. */
  public onFoldersRootDragOver(event: DragEvent): void {
    return this.OnFoldersRootDragOver(event);
  }

  /** @deprecated Use {@link OnDragLeave}. */
  public onDragLeave(targetId: string): void {
    return this.OnDragLeave(targetId);
  }

  /** @deprecated Use {@link OnFolderDrop}. */
  public onFolderDrop(project: MJProjectEntity, event: DragEvent): Promise<void> {
    return this.OnFolderDrop(project, event);
  }

  /** @deprecated Use {@link OnUngroupedDrop}. */
  public onUngroupedDrop(event: DragEvent): Promise<void> {
    return this.OnUngroupedDrop(event);
  }

  /** @deprecated Use {@link OnFoldersRootDrop}. */
  public onFoldersRootDrop(event: DragEvent): void {
    return this.OnFoldersRootDrop(event);
  }

  /** @deprecated Use {@link OpenMoveSubmenu}. */
  public openMoveSubmenu(event: Event): void {
    return this.OpenMoveSubmenu(event);
  }

  /** @deprecated Use {@link CloseMoveSubmenu}. */
  public closeMoveSubmenu(event: Event): void {
    return this.CloseMoveSubmenu(event);
  }

  /** @deprecated Use {@link CreateFolder}. */
  public createFolder(parentId: string | null, event?: Event): void {
    return this.CreateFolder(parentId, event);
  }

  /** @deprecated Use {@link EditFolder}. */
  public editFolder(project: MJProjectEntity, event?: Event): void {
    return this.EditFolder(project, event);
  }

  /** @deprecated Use {@link DeleteFolder}. */
  public deleteFolder(project: MJProjectEntity, event?: Event): Promise<void> {
    return this.DeleteFolder(project, event);
  }

  /** @deprecated Use {@link SelectConversation}. */
  public selectConversation(conversation: MJConversationEntity): void {
    return this.SelectConversation(conversation);
  }

  /** @deprecated Use {@link CreateNewConversation}. */
  public createNewConversation(): Promise<void> {
    return this.CreateNewConversation();
  }

  /** @deprecated Use {@link RenameConversation}. */
  public renameConversation(conversation: MJConversationEntity): Promise<void> {
    return this.RenameConversation(conversation);
  }

  /** @deprecated Use {@link DeleteConversation}. */
  public deleteConversation(conversation: MJConversationEntity): Promise<void> {
    return this.DeleteConversation(conversation);
  }

  /** @deprecated Use {@link TogglePin}. */
  public togglePin(conversation: MJConversationEntity, event?: Event): Promise<void> {
    return this.TogglePin(conversation, event);
  }

  /** @deprecated Use {@link HasActiveTasks}. */
  public hasActiveTasks(conversationId: string): boolean {
    return this.HasActiveTasks(conversationId);
  }

  /** @deprecated Use {@link IsSharedWithMe}. */
  public isSharedWithMe(conversation: MJConversationEntity): boolean {
    return this.IsSharedWithMe(conversation);
  }

  /** @deprecated Use {@link SharedWithMeTooltip}. */
  public sharedWithMeTooltip(conversation: MJConversationEntity): string {
    return this.SharedWithMeTooltip(conversation);
  }

  /** @deprecated Use {@link ToggleSelectionMode}. */
  public toggleSelectionMode(): void {
    return this.ToggleSelectionMode();
  }

  /** @deprecated Use {@link ToggleConversationSelection}. */
  public toggleConversationSelection(conversationId: string): void {
    return this.ToggleConversationSelection(conversationId);
  }

  /** @deprecated Use {@link SelectAll}. */
  public selectAll(): void {
    return this.SelectAll();
  }

  /** @deprecated Use {@link DeselectAll}. */
  public deselectAll(): void {
    return this.DeselectAll();
  }

  /** @deprecated Use {@link BulkDeleteConversations}. */
  public bulkDeleteConversations(ids?: string[]): Promise<void> {
    return this.BulkDeleteConversations(ids);
  }

  /** @deprecated Use {@link HandleConversationClick}. */
  public handleConversationClick(conversation: MJConversationEntity, event?: MouseEvent): void {
    return this.HandleConversationClick(conversation, event);
  }
}