import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { UserInfo, RunView, Metadata, IMetadataProvider } from '@memberjunction/core';
import { MJCollectionEntity, MJArtifactEntity, MJArtifactVersionEntity, MJCollectionArtifactEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { CollectionStateService } from '../../services/collection-state.service';
import { CollectionPermissionService, CollectionPermission } from '../../services/collection-permission.service';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import { Subject, takeUntil } from 'rxjs';
import { CollectionViewMode, CollectionViewItem, CollectionSortBy, CollectionSortOrder } from '../../models/collection-view.model';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';

/**
 * Full-panel Collections view component
 * Comprehensive collection management with artifacts display
 */
@Component({
  standalone: false,
  selector: 'mj-collections-full-view',
  template: `
    <div class="collections-view" (keydown)="handleKeyboardShortcut($event)">
      <!-- Mac Finder-style Header -->
      <div class="collections-header">
        <!-- Breadcrumb navigation -->
        <div class="collections-breadcrumb">
          <button class="btn-icon nav-toggle" (click)="toggleNavigator()"
            [class.active]="showNavigator" title="Toggle collections panel">
            <i class="fas fa-bars"></i>
          </button>
          <div class="breadcrumb-item"
            [class.drag-over]="dragOverTargetId === 'root'"
            (dragover)="onCrumbDragOver(null, $event)"
            (dragleave)="onDragLeave('root')"
            (drop)="onCrumbDrop(null, $event)">
            <i class="fas fa-home"></i>
            <a class="breadcrumb-link" (click)="navigateToRoot()">Collections</a>
          </div>
          @if (breadcrumbs.length > 0) {
            <span class="breadcrumb-path">
              @for (crumb of breadcrumbs; track crumb; let last = $last) {
                <i class="fas fa-chevron-right breadcrumb-separator"></i>
                <a class="breadcrumb-link"
                  [class.active]="last"
                  [class.drag-over]="dragOverTargetId === 'crumb:' + crumb.id"
                  (dragover)="onCrumbDragOver(crumb.id, $event)"
                  (dragleave)="onDragLeave('crumb:' + crumb.id)"
                  (drop)="onCrumbDrop(crumb.id, $event)"
                  (click)="navigateTo(crumb)">
                  {{ crumb.name }}
                </a>
              }
            </span>
          }
        </div>
    
        <!-- Action buttons -->
        <div class="collections-actions">
          <!-- View mode toggle -->
          <button class="btn-icon"
            (click)="toggleViewMode()"
            [title]="viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'">
            <i class="fas" [ngClass]="viewMode === 'grid' ? 'fa-list' : 'fa-th'"></i>
          </button>
    
          <!-- Select mode toggle -->
          <button class="btn-icon"
            [class.active]="isSelectMode"
            (click)="toggleSelectMode()"
            [title]="isSelectMode ? 'Exit Select Mode' : 'Select Items'">
            <i class="fas fa-check-square"></i>
          </button>
    
          <!-- Sort dropdown (grid view only) -->
          @if (viewMode === 'grid') {
            <div class="dropdown-container">
              <button class="btn-icon"
                (click)="showSortDropdown = !showSortDropdown"
                title="Sort options">
                <i class="fas fa-sort"></i>
              </button>
              @if (showSortDropdown) {
                <div class="dropdown-menu">
                  <button class="dropdown-item"
                    [class.active]="sortBy === 'name'"
                    (click)="setSortBy('name')">
                    <i class="fas fa-sort-alpha-down"></i>
                    <span>Sort by Name</span>
                  </button>
                  <button class="dropdown-item"
                    [class.active]="sortBy === 'date'"
                    (click)="setSortBy('date')">
                    <i class="fas fa-calendar"></i>
                    <span>Sort by Date</span>
                  </button>
                  <button class="dropdown-item"
                    [class.active]="sortBy === 'type'"
                    (click)="setSortBy('type')">
                    <i class="fas fa-tag"></i>
                    <span>Sort by Type</span>
                  </button>
                </div>
              }
            </div>
          }
    
          <!-- Search -->
          <div class="search-container">
            <i class="fas fa-search"></i>
            <input type="text"
              class="search-input"
              placeholder="Search..."
              [(ngModel)]="searchQuery"
              (ngModelChange)="onSearchChange($event)">
            @if (searchQuery) {
              <button class="search-clear"
                (click)="searchQuery = ''; onSearchChange('')"
                title="Clear search">
                <i class="fas fa-times"></i>
              </button>
            }
          </div>

          <!-- Current collection actions (visible when inside a collection) -->
          @if (currentCollectionId && currentCollection) {
            <div class="toolbar-separator"></div>
            <div class="toolbar-actions-group">
              @if (canShareCurrent()) {
                <button class="btn-icon"
                  (click)="shareCurrentCollection()"
                  [title]="'Share: ' + currentCollection.Name">
                  <i class="fas fa-share-nodes"></i>
                </button>
              }
              @if (canEditCurrent()) {
                <button class="btn-icon"
                  (click)="editCurrentCollection()"
                  [title]="'Edit: ' + currentCollection.Name">
                  <i class="fas fa-pen-to-square"></i>
                </button>
              }
              @if (canDeleteCurrent()) {
                <button class="btn-icon btn-icon-danger"
                  (click)="deleteCurrentCollection()"
                  [title]="'Delete: ' + currentCollection.Name">
                  <i class="fas fa-trash"></i>
                </button>
              }
            </div>
          }

          <!-- New dropdown -->
          @if (canEditCurrent()) {
            <div class="dropdown-container">
              <button class="btn-primary"
                (click)="showNewDropdown = !showNewDropdown">
                <i class="fas fa-plus"></i>
                <span>New</span>
                <i class="fas fa-chevron-down"></i>
              </button>
              @if (showNewDropdown) {
                <div class="dropdown-menu dropdown-menu-right">
                  <button class="dropdown-item" (click)="createCollection()">
                    <i class="fas fa-folder-plus"></i>
                    <span>New Collection</span>
                  </button>
                  <button class="dropdown-item"
                    (click)="addArtifact()"
                    [disabled]="!currentCollectionId">
                    <i class="fas fa-file-plus"></i>
                    <span>New Artifact</span>
                  </button>
                </div>
              }
            </div>
          }
    
          <!-- Refresh button -->
          <button class="btn-icon" (click)="refresh()" title="Refresh">
            <i class="fas fa-sync"></i>
          </button>
        </div>
      </div>
    
      <!-- Multi-select toolbar (appears when items selected) -->
      @if (selectedItems.size > 0) {
        <div class="selection-toolbar">
          <div class="selection-info">
            <span class="selection-count">{{ selectedItems.size }} selected</span>
          </div>
          <div class="selection-actions">
            <div class="dropdown-container">
              <button class="btn-toolbar" (click)="openBulkMove($event)">
                <i class="fas fa-folder-tree"></i>
                Move to…
              </button>
              @if (showBulkMovePopover) {
                <div class="bulk-move-backdrop" (click)="closeBulkMove()"></div>
                <div class="dropdown-menu bulk-move-menu">
                  @if (navigatorNodes.length === 0) {
                    <div class="dropdown-note">No collections available</div>
                  } @else {
                    @for (node of navigatorNodes; track node.collection.ID) {
                      <button class="dropdown-item" [style.paddingLeft.px]="12 + node.depth * 12"
                        (click)="bulkMoveTo(node.collection)">
                        <i class="fas fa-folder" [style.color]="node.collection.Color || null"></i>
                        <span>{{ node.collection.Name }}</span>
                      </button>
                    }
                  }
                </div>
              }
            </div>
            <button class="btn-toolbar" (click)="stageSelected()" title="Add to the staging shelf to move later">
              <i class="fas fa-layer-group"></i>
              Stage
            </button>
            <button class="btn-toolbar" (click)="clearSelection()">
              <i class="fas fa-times"></i>
              Clear
            </button>
            <button class="btn-toolbar btn-danger" (click)="deleteSelected()">
              <i class="fas fa-trash"></i>
              Delete
            </button>
          </div>
        </div>
      }
    
      <!-- Body: navigator pane (#6) + content -->
      <div class="collections-body">
        @if (showNavigator) {
          <div class="collections-navigator">
            <div class="nav-header">Collections</div>
            <div class="nav-list">
              <button class="nav-row"
                [class.active]="!currentCollectionId"
                [class.drag-over]="dragOverTargetId === 'root'"
                (click)="navigateToRoot()"
                (dragover)="onCrumbDragOver(null, $event)"
                (dragleave)="onDragLeave('root')"
                (drop)="onCrumbDrop(null, $event)">
                <i class="fas fa-home"></i>
                <span>All Collections</span>
              </button>
              @for (node of navigatorNodes; track node.collection.ID) {
                <button class="nav-row"
                  [class.active]="isCurrentNavigator(node.collection)"
                  [class.drag-over]="dragOverTargetId === 'nav:' + node.collection.ID"
                  [style.paddingLeft.px]="10 + node.depth * 14"
                  (click)="navigatorClick(node.collection)"
                  (dragover)="onNavigatorDragOver(node.collection, $event)"
                  (dragleave)="onDragLeave('nav:' + node.collection.ID)"
                  (drop)="onNavigatorDrop(node.collection, $event)"
                  [title]="node.collection.Name">
                  <i class="fas fa-folder" [style.color]="node.collection.Color || null"></i>
                  <span class="nav-row-name">{{ node.collection.Name }}</span>
                </button>
              }
            </div>
          </div>
        }
      <!-- Content area -->
      <div class="collections-content">
        <!-- Loading state -->
        @if (isLoading) {
          <div class="loading-state">
            <mj-loading text="Loading collections..." size="large"></mj-loading>
          </div>
        }
    
        <!-- Empty state -->
        @if (!isLoading && unifiedItems.length === 0) {
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <!-- Search returned no results -->
            @if (searchQuery) {
              <h3>No items found</h3>
              <p>Try adjusting your search</p>
            }
            <!-- Empty root level -->
            @if (!searchQuery && !currentCollectionId) {
              <h3>No collections yet</h3>
              <p>Create your first collection to get started</p>
              @if (canEditCurrent()) {
                <button class="btn-primary empty-state-cta"
                  (click)="createCollection()"
                  >
                  <i class="fas fa-plus"></i>
                  Create Collection
                </button>
              }
            }
            <!-- Empty collection (has parent) -->
            @if (!searchQuery && currentCollectionId) {
              <h3>This collection is empty</h3>
              <p>Use the <strong>New</strong> button above to add collections or artifacts</p>
            }
          </div>
        }
    
        <!-- Grid view -->
        @if (!isLoading && unifiedItems.length > 0 && viewMode === 'grid') {
          <div
            class="unified-grid"
            [class.select-mode]="isSelectMode">
            @for (item of PagedItems; track item) {
              <div
                class="grid-item"
                [class.selected]="item.selected"
                [class.active]="item.type === 'artifact' && IsArtifactActive(item)"
                [class.dragging]="draggedItemIds.includes(item.id)"
                [class.drag-over]="dragOverTargetId === item.id"
                [draggable]="true"
                (dragstart)="onItemDragStart(item, $event)"
                (dragend)="onItemDragEnd()"
                (dragover)="item.type === 'folder' ? onFolderItemDragOver(item, $event) : null"
                (dragleave)="item.type === 'folder' ? onDragLeave(item.id) : null"
                (drop)="item.type === 'folder' ? onFolderItemDrop(item, $event) : null"
                (click)="onItemClick(item, $event)"
                (dblclick)="onItemDoubleClick(item, $event)"
                (contextmenu)="onItemContextMenu(item, $event)">
                <!-- Selection checkbox (hover-reveal — no explicit select mode needed) -->
                <div class="item-checkbox"
                  (click)="onCheckboxClick(item, $event)">
                  <i class="fas"
                  [ngClass]="item.selected ? 'fa-check-circle' : 'fa-circle'"></i>
                </div>
                <!-- Folder item -->
                @if (item.type === 'folder') {
                  <div
                    class="grid-item-content"
                    [title]="item.description || item.name">
                    <div class="grid-icon folder-icon">
                      <i class="fas fa-folder"></i>
                      @if (item.isShared) {
                        <div class="shared-badge" title="Shared">
                          <i class="fas fa-users"></i>
                        </div>
                      }
                    </div>
                    <div class="grid-info">
                      <div class="grid-name">{{ item.name }}</div>
                      @if (item.description) {
                        <div class="grid-description">
                          {{ item.description }}
                        </div>
                      }
                      @if (item.itemCount !== undefined) {
                        <div class="grid-meta">
                          {{ getItemCountText(item.itemCount) }}
                        </div>
                      }
                      @if (item.isShared && item.owner) {
                        <div class="grid-owner">
                          <i class="fas fa-user"></i>
                          {{ item.owner }}
                        </div>
                      }
                    </div>
                  </div>
                }
                <!-- Artifact item -->
                @if (item.type === 'artifact') {
                  <div
                    class="grid-item-content"
                    [title]="item.description || item.name">
                    <div class="grid-icon artifact-icon">
                      <i class="fas" [ngClass]="item.icon"></i>
                    </div>
                    <div class="grid-info">
                      <div class="grid-name">{{ item.name }}</div>
                      @if (item.description) {
                        <div class="grid-description">
                          {{ item.description }}
                        </div>
                      }
                      <div class="grid-meta">
                        @if (item.versionNumber) {
                          <span class="version-badge">
                            v{{ item.versionNumber }}
                          </span>
                        }
                        @if (item.artifactType) {
                          <span class="artifact-type-badge">
                            {{ item.artifactType }}
                          </span>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Pagination controls (grid mode, when more than one page) -->
          @if (TotalPages > 1) {
            <div class="pagination-bar">
              <span class="pagination-info">
                {{ (CurrentPage - 1) * PageSize + 1 }}–{{ CurrentPage * PageSize < unifiedItems.length ? CurrentPage * PageSize : unifiedItems.length }}
                of {{ unifiedItems.length }} items
              </span>
              <div class="pagination-controls">
                <button class="pagination-btn"
                  [disabled]="CurrentPage === 1"
                  (click)="GoToPage(1)"
                  title="First page">
                  <i class="fas fa-angles-left"></i>
                </button>
                <button class="pagination-btn"
                  [disabled]="CurrentPage === 1"
                  (click)="GoToPage(CurrentPage - 1)"
                  title="Previous page">
                  <i class="fas fa-chevron-left"></i>
                </button>
                <span class="pagination-page-info">
                  Page {{ CurrentPage }} of {{ TotalPages }}
                </span>
                <button class="pagination-btn"
                  [disabled]="CurrentPage === TotalPages"
                  (click)="GoToPage(CurrentPage + 1)"
                  title="Next page">
                  <i class="fas fa-chevron-right"></i>
                </button>
                <button class="pagination-btn"
                  [disabled]="CurrentPage === TotalPages"
                  (click)="GoToPage(TotalPages)"
                  title="Last page">
                  <i class="fas fa-angles-right"></i>
                </button>
              </div>
            </div>
          }
        }
    
        <!-- List view -->
        @if (!isLoading && unifiedItems.length > 0 && viewMode === 'list') {
          <div
            class="unified-list"
            [class.select-mode]="isSelectMode">
            <table class="list-table">
              <thead>
                <tr>
                  <th class="col-checkbox">
                    <i class="fas"
                      [ngClass]="selectedItems.size === unifiedItems.length && unifiedItems.length > 0 ? 'fa-check-square' : 'fa-square'"
                    (click)="selectedItems.size === unifiedItems.length ? clearSelection() : selectAll()"></i>
                  </th>
                  <th class="col-name sortable" (click)="setSortBy('name')">
                    <span>Name</span>
                    @if (sortBy !== 'name') {
                      <i class="fas fa-sort"></i>
                    }
                    @if (sortBy === 'name') {
                      <i class="fas"
                      [ngClass]="sortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down'"></i>
                    }
                  </th>
                  <th class="col-type sortable" (click)="setSortBy('type')">
                    <span>Type</span>
                    @if (sortBy !== 'type') {
                      <i class="fas fa-sort"></i>
                    }
                    @if (sortBy === 'type') {
                      <i class="fas"
                      [ngClass]="sortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down'"></i>
                    }
                  </th>
                  <th class="col-modified sortable" (click)="setSortBy('date')">
                    <span>Modified</span>
                    @if (sortBy !== 'date') {
                      <i class="fas fa-sort"></i>
                    }
                    @if (sortBy === 'date') {
                      <i class="fas"
                      [ngClass]="sortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down'"></i>
                    }
                  </th>
                  <th class="col-owner">Owner</th>
                </tr>
              </thead>
              <tbody>
                @for (item of PagedItems; track item) {
                  <tr
                    class="list-item"
                    [class.selected]="item.selected"
                    [class.active]="item.type === 'artifact' && IsArtifactActive(item)"
                    [class.dragging]="draggedItemIds.includes(item.id)"
                    [class.drag-over]="dragOverTargetId === item.id"
                    [draggable]="true"
                    (dragstart)="onItemDragStart(item, $event)"
                    (dragend)="onItemDragEnd()"
                    (dragover)="item.type === 'folder' ? onFolderItemDragOver(item, $event) : null"
                    (dragleave)="item.type === 'folder' ? onDragLeave(item.id) : null"
                    (drop)="item.type === 'folder' ? onFolderItemDrop(item, $event) : null"
                    (click)="onItemClick(item, $event)"
                    (dblclick)="onItemDoubleClick(item, $event)"
                    (contextmenu)="onItemContextMenu(item, $event)">
                    <td class="col-checkbox">
                      <i class="fas"
                        [ngClass]="item.selected ? 'fa-check-circle' : 'fa-circle'"
                      (click)="onCheckboxClick(item, $event)"></i>
                    </td>
                    <td class="col-name">
                      <div class="list-name-cell">
                        <i class="fas"
                        [ngClass]="item.type === 'folder' ? 'fa-folder' : item.icon"></i>
                        <span>{{ item.name }}</span>
                        @if (item.isShared) {
                          <i class="fas fa-users shared-indicator"
                          title="Shared"></i>
                        }
                      </div>
                    </td>
                    <td class="col-type">
                      @if (item.type === 'folder') {
                        <span>Folder</span>
                      }
                      @if (item.type === 'artifact') {
                        <span class="artifact-type-badge">
                          {{ item.artifactType }}
                        </span>
                      }
                    </td>
                    <td class="col-modified">
                      @if (item.lastModified) {
                        <span>
                          {{ item.lastModified | date:'short' }}
                        </span>
                      }
                    </td>
                    <td class="col-owner">
                      @if (item.owner) {
                        <span>{{ item.owner }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination controls (list mode only, when more than one page) -->
          @if (TotalPages > 1) {
            <div class="pagination-bar">
              <span class="pagination-info">
                {{ (CurrentPage - 1) * PageSize + 1 }}–{{ CurrentPage * PageSize < unifiedItems.length ? CurrentPage * PageSize : unifiedItems.length }}
                of {{ unifiedItems.length }} items
              </span>
              <div class="pagination-controls">
                <button class="pagination-btn"
                  [disabled]="CurrentPage === 1"
                  (click)="GoToPage(1)"
                  title="First page">
                  <i class="fas fa-angles-left"></i>
                </button>
                <button class="pagination-btn"
                  [disabled]="CurrentPage === 1"
                  (click)="GoToPage(CurrentPage - 1)"
                  title="Previous page">
                  <i class="fas fa-chevron-left"></i>
                </button>
                <span class="pagination-page-info">
                  Page {{ CurrentPage }} of {{ TotalPages }}
                </span>
                <button class="pagination-btn"
                  [disabled]="CurrentPage === TotalPages"
                  (click)="GoToPage(CurrentPage + 1)"
                  title="Next page">
                  <i class="fas fa-chevron-right"></i>
                </button>
                <button class="pagination-btn"
                  [disabled]="CurrentPage === TotalPages"
                  (click)="GoToPage(TotalPages)"
                  title="Last page">
                  <i class="fas fa-angles-right"></i>
                </button>
              </div>
            </div>
          }
        }
      </div>
      </div>

      <!-- Staging shelf (#5) — survives navigation; drop staged items into the open collection -->
      @if (shelf.length > 0) {
        <div class="staging-shelf">
          <div class="shelf-info">
            <i class="fas fa-layer-group"></i>
            <span>{{ shelf.length }} staged</span>
          </div>
          <div class="shelf-chips">
            @for (entry of shelf; track entry.item.id) {
              <span class="shelf-chip" [title]="entry.item.name">
                <i class="fas" [ngClass]="entry.item.type === 'folder' ? 'fa-folder' : entry.item.icon"></i>
                <span class="shelf-chip-name">{{ entry.item.name }}</span>
                <button class="shelf-chip-x" (click)="removeFromShelf(entry.item.id)" title="Remove">
                  <i class="fas fa-times"></i>
                </button>
              </span>
            }
          </div>
          <div class="shelf-actions">
            <button class="btn-toolbar btn-primary-toolbar"
              (click)="dropShelfHere()"
              [disabled]="!currentCollectionId"
              [title]="currentCollectionId ? 'Move staged items into this collection' : 'Open a collection to move items here'">
              <i class="fas fa-arrow-down"></i>
              Move here
            </button>
            <button class="btn-toolbar" (click)="clearShelf()">Clear</button>
          </div>
        </div>
      }
    </div>

    <!-- Context Menu -->
    @if (showContextMenu && contextMenuItem) {
      <div class="context-menu-backdrop" (click)="closeContextMenu()"></div>
      <div class="context-menu"
        [style.left.px]="contextMenuPosition.x"
        [style.top.px]="contextMenuPosition.y">
        @if (contextMenuItem.type === 'folder' && contextMenuItem.collection) {
          <button class="context-menu-item" (click)="onContextMenuAction('open')">
            <i class="fas fa-folder-open"></i>
            <span>Open</span>
          </button>
          <div class="context-menu-divider"></div>
          @if (canShare(contextMenuItem.collection)) {
            <button class="context-menu-item" (click)="onContextMenuAction('share')">
              <i class="fas fa-share-nodes"></i>
              <span>Share</span>
            </button>
          }
          @if (canEdit(contextMenuItem.collection)) {
            <button class="context-menu-item" (click)="onContextMenuAction('edit')">
              <i class="fas fa-pen-to-square"></i>
              <span>Edit</span>
            </button>
          }
          @if (canDelete(contextMenuItem.collection)) {
            <div class="context-menu-divider"></div>
            <button class="context-menu-item context-menu-danger" (click)="onContextMenuAction('delete')">
              <i class="fas fa-trash"></i>
              <span>Delete</span>
            </button>
          }
        }
        @if (contextMenuItem.type === 'artifact') {
          @if (showMoveSubmenu) {
            <button class="context-menu-item" (click)="closeMoveSubmenu($event)">
              <i class="fas fa-chevron-left"></i>
              <span>Move to Collection</span>
            </button>
            <div class="context-menu-divider"></div>
            @if (isLoadingMoveTargets) {
              <div class="context-menu-note"><i class="fas fa-spinner fa-spin"></i> Loading…</div>
            } @else if (moveTargets.length === 0) {
              <div class="context-menu-note">No other collections</div>
            } @else {
              <div class="move-target-list">
                @for (t of moveTargets; track t.collection.ID) {
                  <button class="context-menu-item" [style.paddingLeft.px]="14 + t.depth * 12"
                          (click)="moveArtifactToCollection(t.collection)">
                    <i class="fas fa-folder" [style.color]="t.collection.Color || null"></i>
                    <span>{{ t.collection.Name }}</span>
                  </button>
                }
              </div>
            }
          } @else {
            <button class="context-menu-item" (click)="onContextMenuAction('view')">
              <i class="fas fa-eye"></i>
              <span>View</span>
            </button>
            <button class="context-menu-item" (click)="onContextMenuAction('openConversation')">
              <i class="fas fa-comments"></i>
              <span>Open source conversation</span>
            </button>
            @if (canEditCurrent()) {
              <button class="context-menu-item" (click)="openMoveSubmenu($event)">
                <i class="fas fa-folder-tree"></i>
                <span>Move to Collection</span>
                <i class="fas fa-chevron-right submenu-arrow"></i>
              </button>
              <div class="context-menu-divider"></div>
              <button class="context-menu-item context-menu-danger" (click)="onContextMenuAction('remove')">
                <i class="fas fa-times-circle"></i>
                <span>Remove from Collection</span>
              </button>
            }
          }
        }
      </div>
    }

    <!-- Modals -->
    <mj-collection-form-modal
      [isOpen]="isFormModalOpen"
      [collection]="editingCollection"
      [parentCollection]="editingCollection ? undefined : (currentCollection || undefined)"
      [environmentId]="environmentId"
      [currentUser]="currentUser"
      (saved)="onCollectionSaved($event)"
      (cancelled)="onFormCancelled()">
    </mj-collection-form-modal>
    
    <mj-artifact-create-modal
      [isOpen]="isArtifactModalOpen"
      [collectionId]="currentCollectionId || ''"
      [environmentId]="environmentId"
      [currentUser]="currentUser"
      (saved)="onArtifactSaved($event)"
      (cancelled)="onArtifactModalCancelled()">
    </mj-artifact-create-modal>
    
    <mj-collection-share-modal
      [isOpen]="isShareModalOpen"
      [collection]="sharingCollection"
      [currentUser]="currentUser"
      [currentUserPermissions]="sharingCollection ? userPermissions.get(sharingCollection.ID) || null : null"
      (saved)="onPermissionsChanged()"
      (cancelled)="onShareModalCancelled()">
    </mj-collection-share-modal>
    `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    /* Main container */
    .collections-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface-sunken);
      position: relative;
    }

    /* Header */
    .collections-header {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid var(--mj-border-default);
      gap: 16px;
      background: var(--mj-bg-surface);
    }

    .collections-breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      min-width: 0;
    }

    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .breadcrumb-item i {
      color: var(--mj-text-muted);
      font-size: 14px;
    }

    .breadcrumb-link {
      color: var(--mj-text-primary);
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      transition: color 150ms ease;
      font-size: 14px;
    }

    .breadcrumb-link:hover {
      color: var(--mj-brand-primary);
    }

    .breadcrumb-link.active {
      color: var(--mj-text-muted);
      cursor: default;
    }

    .breadcrumb-path {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
    }

    .breadcrumb-separator {
      color: var(--mj-border-strong);
      font-size: 10px;
    }

    .collections-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Button styles */
    .btn-primary {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--mj-brand-primary);
      border: none;
      border-radius: 6px;
      color: var(--mj-text-inverse);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 150ms ease;
    }

    .btn-primary:hover {
      background: var(--mj-brand-primary-hover);
    }

    .btn-primary i.fa-chevron-down {
      font-size: 10px;
      margin-left: 2px;
    }

    .btn-icon {
      padding: 6px 10px;
      background: transparent;
      border: 1px solid var(--mj-border-strong);
      border-radius: 6px;
      cursor: pointer;
      color: var(--mj-text-muted);
      transition: all 150ms ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-icon:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
      border-color: var(--mj-text-disabled);
    }

    .btn-icon.active {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      border-color: var(--mj-brand-primary);
    }

    .btn-icon.active:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    /* Dropdown menus */
    .dropdown-container {
      position: relative;
    }

    .dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 200px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 4px;
      z-index: 1000;
    }

    .dropdown-menu-right {
      left: auto;
      right: 0;
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--mj-text-primary);
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: background 100ms ease;
    }

    .dropdown-item:hover:not(:disabled) {
      background: var(--mj-bg-surface-sunken);
    }

    .dropdown-item:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .dropdown-item.active {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }

    .dropdown-item i {
      font-size: 14px;
      width: 16px;
      text-align: center;
      color: var(--mj-text-muted);
    }

    .dropdown-item.active i {
      color: var(--mj-brand-primary);
    }

    .dropdown-divider {
      height: 1px;
      background: var(--mj-border-default);
      margin: 4px 0;
    }

    /* Search */
    .search-container {
      position: relative;
      display: flex;
      align-items: center;
      min-width: 200px;
    }

    .search-container i.fa-search {
      position: absolute;
      left: 10px;
      color: var(--mj-text-disabled);
      font-size: 13px;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 6px 32px 6px 32px;
      border: 1px solid var(--mj-border-strong);
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      transition: all 150ms ease;
    }

    .search-input:focus {
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    }

    .search-clear {
      position: absolute;
      right: 6px;
      padding: 4px;
      background: transparent;
      border: none;
      color: var(--mj-text-disabled);
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .search-clear:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-muted);
    }

    /* Selection toolbar */
    .selection-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 20px;
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-bottom: 1px solid color-mix(in srgb, var(--mj-brand-primary) 30%, var(--mj-bg-surface));
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .selection-count {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-brand-primary);
    }

    .selection-actions {
      display: flex;
      gap: 8px;
    }

    .btn-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-strong);
      border-radius: 6px;
      color: var(--mj-text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .btn-toolbar:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-text-disabled);
    }

    .btn-toolbar.btn-danger {
      color: var(--mj-status-error);
      border-color: color-mix(in srgb, var(--mj-status-error) 30%, var(--mj-bg-surface));
    }

    .btn-toolbar.btn-danger:hover {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border-color: var(--mj-status-error);
    }

    /* Content area */
    .collections-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    /* Loading and empty states */
    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      min-height: 0;
      color: var(--mj-text-disabled);
      text-align: center;
      padding: 24px;
    }

    .empty-state > i {
      font-size: 64px;
      margin-bottom: 24px;
      opacity: 0.3;
      color: var(--mj-border-strong);
    }

    .empty-state h3 {
      margin: 0 0 8px 0;
      color: var(--mj-text-secondary);
      font-size: 18px;
      font-weight: 600;
    }

    .empty-state p {
      margin: 0 0 24px 0;
      font-size: 14px;
      color: var(--mj-text-muted);
    }

    .empty-state .empty-state-cta {
      padding: 10px 20px;
      font-size: 14px;
      border-radius: 8px;
    }

    .empty-state-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }

    /* Grid view */
    .unified-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 16px;
      padding: 4px;
      flex-shrink: 0;
    }

    .grid-item {
      display: flex;
      flex-direction: column;
      padding: 12px;
      background: var(--mj-bg-surface);
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 150ms ease;
      position: relative;
      user-select: none;
    }

    .grid-item:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
    }

    .grid-item.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-color: var(--mj-brand-primary);
    }

    .grid-item.active {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      border-color: var(--mj-status-warning);
      box-shadow: 0 0 0 1px var(--mj-status-warning);
    }

    .grid-item.active:hover {
      background: color-mix(in srgb, var(--mj-status-warning) 25%, var(--mj-bg-surface));
    }

    /* Select mode styling for grid */
    .unified-grid.select-mode .grid-item {
      cursor: pointer;
    }

    .unified-grid.select-mode .grid-item:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-brand-primary) 30%, var(--mj-bg-surface));
    }

    .item-checkbox {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10;
    }

    .item-checkbox i {
      font-size: 16px;
      color: var(--mj-text-disabled);
      transition: color 150ms ease;
    }

    .grid-item.selected .item-checkbox i,
    .item-checkbox:hover i {
      color: var(--mj-brand-primary);
    }

    .grid-item-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .grid-icon {
      width: 64px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      position: relative;
    }

    .grid-icon.folder-icon {
      background: var(--mj-brand-primary);
    }

    .grid-icon.folder-icon i {
      font-size: 36px;
      color: var(--mj-text-inverse);
    }

    .grid-icon.artifact-icon {
      background: var(--mj-bg-surface-sunken);
    }

    .grid-icon.artifact-icon i {
      font-size: 32px;
      color: var(--mj-text-muted);
    }

    .shared-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      background: var(--mj-status-success);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--mj-bg-surface);
    }

    .shared-badge i {
      font-size: 10px;
      color: var(--mj-text-inverse);
    }

    .grid-info {
      width: 100%;
      text-align: center;
    }

    .grid-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-primary);
      line-height: 1.3;
      margin-bottom: 4px;
      /* Allow wrapping to 2 lines max */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }

    .grid-description {
      font-size: 11px;
      color: var(--mj-text-muted);
      line-height: 1.3;
      margin-bottom: 4px;
      /* Allow wrapping to 2 lines max */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }

    .grid-meta {
      font-size: 11px;
      color: var(--mj-text-muted);
      margin-top: 4px;
    }

    .grid-owner {
      font-size: 11px;
      color: var(--mj-text-muted);
      margin-top: 2px;
    }

    .grid-owner i {
      font-size: 10px;
      margin-right: 3px;
    }

    .version-badge {
      display: inline-block;
      padding: 2px 6px;
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      font-family: monospace;
      margin-right: 4px;
    }

    .artifact-type-badge {
      display: inline-block;
      padding: 2px 6px;
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      border-radius: 3px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    /* List view */
    .unified-list {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .list-table {
      width: 100%;
      border-collapse: collapse;
    }

    .list-table thead {
      background: var(--mj-bg-surface-sunken);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .list-table th {
      padding: 10px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .list-table th.sortable {
      cursor: pointer;
      user-select: none;
      transition: color 150ms ease;
    }

    .list-table th.sortable:hover {
      color: var(--mj-brand-primary);
    }

    .list-table th.sortable span {
      display: inline-block;
      margin-right: 6px;
    }

    .list-table th.sortable i {
      font-size: 10px;
      opacity: 0.5;
    }

    .list-table th.sortable:hover i {
      opacity: 1;
    }

    .list-table tbody tr {
      border-bottom: 1px solid var(--mj-bg-surface-sunken);
      transition: background 150ms ease;
      cursor: pointer;
      user-select: none;
    }

    .list-table tbody tr:last-child {
      border-bottom: none;
    }

    .list-table tbody tr:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .list-table tbody tr.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    .list-table tbody tr.active {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      border-left: 3px solid var(--mj-status-warning);
    }

    .list-table tbody tr.active:hover {
      background: color-mix(in srgb, var(--mj-status-warning) 25%, var(--mj-bg-surface));
    }

    .list-table td {
      padding: 12px 16px;
      font-size: 13px;
      color: var(--mj-text-secondary);
    }

    .col-checkbox {
      width: 40px;
      text-align: center;
    }

    .col-checkbox i {
      font-size: 16px;
      color: var(--mj-text-disabled);
      cursor: pointer;
      transition: color 150ms ease;
    }

    .col-checkbox i:hover,
    .list-table tbody tr.selected .col-checkbox i {
      color: var(--mj-brand-primary);
    }

    .col-name {
      min-width: 300px;
    }

    .list-name-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .list-name-cell i {
      font-size: 16px;
      color: var(--mj-text-muted);
      width: 20px;
      text-align: center;
    }

    .list-name-cell .fa-folder {
      color: var(--mj-brand-primary);
    }

    .shared-indicator {
      font-size: 12px;
      color: var(--mj-status-success);
      margin-left: auto;
    }

    .col-type {
      width: 150px;
    }

    .col-modified {
      width: 180px;
    }

    .col-owner {
      width: 150px;
    }

    /* Pagination */
    .pagination-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      margin-top: 8px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      font-size: 13px;
      color: var(--mj-text-secondary);
      flex-shrink: 0;
    }

    .pagination-info {
      white-space: nowrap;
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .pagination-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      background: var(--mj-bg-surface);
      color: var(--mj-text-secondary);
      cursor: pointer;
      transition: all 150ms ease;
      font-size: 12px;
    }

    .pagination-btn:hover:not(:disabled) {
      background: var(--mj-bg-surface-hover);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .pagination-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .pagination-page-info {
      padding: 0 8px;
      white-space: nowrap;
      font-weight: 500;
    }

    /* Toolbar separator and action group */
    .toolbar-separator {
      width: 1px;
      height: 24px;
      background: var(--mj-border-strong);
      margin: 0 4px;
    }

    .toolbar-actions-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .btn-icon-danger {
      color: var(--mj-status-error);
      border-color: color-mix(in srgb, var(--mj-status-error) 30%, var(--mj-bg-surface));
    }

    .btn-icon-danger:hover {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
      border-color: var(--mj-status-error);
    }

    /* Context menu */
    .context-menu-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1999;
    }

    .context-menu {
      position: fixed;
      min-width: 180px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
      padding: 4px;
      z-index: 2000;
    }

    .context-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 12px;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--mj-text-primary);
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: background 100ms ease;
    }

    .context-menu-item:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .context-menu-item i {
      font-size: 14px;
      width: 16px;
      text-align: center;
      color: var(--mj-text-muted);
    }

    .context-menu-danger {
      color: var(--mj-status-error);
    }

    .context-menu-danger i {
      color: var(--mj-status-error);
    }

    .context-menu-danger:hover {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
    }

    .context-menu-divider {
      height: 1px;
      background: var(--mj-border-default);
      margin: 4px 0;
    }
    .submenu-arrow {
      margin-left: auto;
      font-size: 10px;
      opacity: 0.6;
    }
    .move-target-list {
      max-height: 240px;
      overflow-y: auto;
    }
    .context-menu-note {
      padding: 8px 14px;
      font-size: 12px;
      color: var(--mj-text-muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ===== Body: navigator pane + content (#6) ===== */
    .collections-body {
      flex: 1;
      display: flex;
      flex-direction: row;
      min-height: 0;
      overflow: hidden;
    }
    .collections-navigator {
      width: 240px;
      flex-shrink: 0;
      border-right: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .nav-header {
      padding: 12px 14px 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--mj-text-muted);
    }
    .nav-list { display: flex; flex-direction: column; padding: 0 6px 12px; gap: 1px; }
    .nav-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 10px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .nav-row:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
    .nav-row.active {
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      font-weight: 600;
    }
    .nav-row.drag-over {
      background: color-mix(in srgb, var(--mj-brand-primary) 22%, transparent);
      border-color: var(--mj-brand-primary);
    }
    .nav-row i { font-size: 13px; width: 16px; flex-shrink: 0; }
    .nav-row-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav-toggle.active { color: var(--mj-brand-primary); }

    /* ===== Drag-and-drop visuals (#1/#2) ===== */
    .grid-item.dragging, .list-item.dragging { opacity: 0.4; }
    .grid-item.drag-over {
      border-color: var(--mj-brand-primary) !important;
      background: color-mix(in srgb, var(--mj-brand-primary) 18%, var(--mj-bg-surface)) !important;
    }
    .list-item.drag-over td {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
      box-shadow: inset 0 0 0 1px var(--mj-brand-primary);
    }
    .breadcrumb-item.drag-over, .breadcrumb-link.drag-over {
      background: color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
      border-radius: 6px;
      outline: 1px solid var(--mj-brand-primary);
    }

    /* Hover-reveal checkboxes (frictionless selection #4) */
    .item-checkbox { opacity: 0; transition: opacity 150ms ease; }
    .grid-item:hover .item-checkbox,
    .grid-item.selected .item-checkbox,
    .unified-grid.select-mode .item-checkbox { opacity: 1; }
    .list-item .col-checkbox i { opacity: 0; transition: opacity 150ms ease; }
    .list-item:hover .col-checkbox i,
    .list-item.selected .col-checkbox i,
    .unified-list.select-mode .col-checkbox i { opacity: 1; }
    .list-item.selected .col-checkbox i { color: var(--mj-brand-primary); }

    /* ===== Bulk "Move to…" popover (#3) ===== */
    .bulk-move-backdrop {
      position: fixed; inset: 0; z-index: 1000;
    }
    .bulk-move-menu {
      max-height: 320px;
      overflow-y: auto;
      z-index: 1001;
    }
    .dropdown-note { padding: 10px 14px; font-size: 12px; color: var(--mj-text-muted); }

    /* ===== Staging shelf (#5) ===== */
    .staging-shelf {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 16px;
      background: var(--mj-bg-surface);
      border-top: 1px solid var(--mj-border-default);
      box-shadow: 0 -2px 8px color-mix(in srgb, var(--mj-text-primary) 6%, transparent);
    }
    .shelf-info {
      display: flex; align-items: center; gap: 8px;
      font-weight: 600; font-size: 13px; color: var(--mj-text-primary);
      flex-shrink: 0;
    }
    .shelf-info i { color: var(--mj-brand-primary); }
    .shelf-chips {
      flex: 1; min-width: 0;
      display: flex; gap: 6px; overflow-x: auto; padding: 2px 0;
    }
    .shelf-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 6px 4px 10px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      border-radius: 999px;
      font-size: 12px; color: var(--mj-text-secondary);
      flex-shrink: 0;
    }
    .shelf-chip-name { max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .shelf-chip-x {
      width: 18px; height: 18px; border: 0; background: transparent;
      color: var(--mj-text-muted); cursor: pointer; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-size: 10px;
    }
    .shelf-chip-x:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
    .shelf-actions { display: flex; gap: 8px; flex-shrink: 0; }
    .btn-toolbar.btn-primary-toolbar {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border-color: var(--mj-brand-primary);
    }
    .btn-toolbar.btn-primary-toolbar:hover:not(:disabled) { background: var(--mj-brand-primary-hover); }
    .btn-toolbar:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class CollectionsFullViewComponent extends BaseAngularComponent implements OnInit, OnDestroy  {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Output() collectionNavigated = new EventEmitter<{
    collectionId: string | null;
    versionId?: string | null;
  }>();

  /** Emitted when the user asks to open the conversation an artifact was produced in. */
  @Output() openConversationRequested = new EventEmitter<{ conversationId: string }>();

  public collections: MJCollectionEntity[] = [];
  public artifactVersions: Array<{ version: MJArtifactVersionEntity; artifact: MJArtifactEntity }> = [];
  public filteredCollections: MJCollectionEntity[] = [];
  public filteredArtifactVersions: Array<{ version: MJArtifactVersionEntity; artifact: MJArtifactEntity }> = [];
  public isLoading: boolean = false;
  public breadcrumbs: Array<{ id: string; name: string }> = [];
  public currentCollectionId: string | null = null;
  public currentCollection: MJCollectionEntity | null = null;

  public isFormModalOpen: boolean = false;
  public editingCollection?: MJCollectionEntity;
  public isArtifactModalOpen: boolean = false;

  public userPermissions: Map<string, CollectionPermission> = new Map();
  public isShareModalOpen: boolean = false;
  public sharingCollection: MJCollectionEntity | null = null;

  // New UI state for Mac Finder-style view
  public viewMode: CollectionViewMode = 'grid';
  public sortBy: CollectionSortBy = 'name';
  public sortOrder: CollectionSortOrder = 'asc';
  public searchQuery: string = '';
  public unifiedItems: CollectionViewItem[] = [];
  public selectedItems: Set<string> = new Set();
  public showNewDropdown: boolean = false;
  public showSortDropdown: boolean = false;
  public activeArtifactId: string | null = null; // Track which artifact is currently being viewed
  private itemCountMap: Map<string, number> = new Map();
  public isSelectMode: boolean = false; // Toggle for selection mode

  // Pagination state
  public PageSize: number = 50;
  public CurrentPage: number = 1;

  /** Total number of pages based on current items and page size */
  get TotalPages(): number {
    return Math.max(1, Math.ceil(this.unifiedItems.length / this.PageSize));
  }

  /** Items for the current page */
  get PagedItems(): CollectionViewItem[] {
    const start = (this.CurrentPage - 1) * this.PageSize;
    return this.unifiedItems.slice(start, start + this.PageSize);
  }

  /** Navigate to a specific page */
  GoToPage(page: number): void {
    this.CurrentPage = Math.max(1, Math.min(page, this.TotalPages));
  }

  IsArtifactActive(item: CollectionViewItem): boolean {
    return UUIDsEqual(item.artifact?.ID, this.activeArtifactId);
  }

  // Context menu state
  public showContextMenu: boolean = false;
  public contextMenuPosition: { x: number; y: number } = { x: 0, y: 0 };
  public contextMenuItem: CollectionViewItem | null = null;

  /** "Move to Collection" submenu state (within the artifact context menu). */
  public showMoveSubmenu: boolean = false;
  public isLoadingMoveTargets: boolean = false;
  public moveTargets: Array<{ collection: MJCollectionEntity; depth: number }> = [];

  /** Anchor index (into unifiedItems) for shift-click range selection. */
  private lastSelectedIndex: number | null = null;

  /** Drag-and-drop state. draggedItemIds = the item ids being dragged (1 or the whole selection). */
  public draggedItemIds: string[] = [];
  /** Tag of the current drop target for highlight: item id, 'root', 'crumb:<id>', or 'nav:<id>'. */
  public dragOverTargetId: string | null = null;

  /** Bulk "Move to…" popover (selection toolbar). */
  public showBulkMovePopover: boolean = false;

  /** All accessible collections (navigator pane + move targets + folder-cycle checks). */
  public allCollections: MJCollectionEntity[] = [];
  private allCollectionsById: Map<string, MJCollectionEntity> = new Map();
  public navigatorNodes: Array<{ collection: MJCollectionEntity; depth: number }> = [];
  public showNavigator: boolean = true;

  /** Staging shelf: items held across navigation, then dropped into a destination collection. */
  public shelf: Array<{ item: CollectionViewItem; sourceCollectionId: string | null }> = [];

  private destroy$ = new Subject<void>();
  private isNavigatingProgrammatically = false;

  constructor(
    private dialogService: DialogService,
    private artifactState: ArtifactStateService,
    private collectionState: CollectionStateService,
    private permissionService: CollectionPermissionService,
    private artifactIconService: ArtifactIconService,
    private cdr: ChangeDetectorRef
  ) {
  super();}

  ngOnInit() {
    // Bind provider-aware services to this component's provider.
    const p = this.ProviderToUse;
    this.artifactState.Provider = p;
    this.permissionService.Provider = p;

    // Subscribe to collection state changes for deep linking FIRST
    // This ensures that if there's a URL with collectionId, we set it before loading data
    this.subscribeToCollectionState();

    // Subscribe to artifact state changes to track active artifact
    this.subscribeToArtifactState();

    // Load the full collection set for the navigator pane + drag targets + cycle checks
    void this.loadAllCollections();

    // Check if there's an active collection from URL params (set by parent component)
    const activeCollectionId = this.collectionState.activeCollectionId;
    if (activeCollectionId) {
      // If there's an active collection, navigate to it (which will call loadData)
      console.log('📁 Initial load with active collection:', activeCollectionId);
      this.navigateToCollectionById(activeCollectionId);
    } else {
      // Otherwise, just load the root level
      this.loadData();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Subscribe to collection state changes for deep linking support
   */
  private subscribeToCollectionState(): void {
    // Watch for external navigation requests (e.g., from search or URL)
    this.collectionState.activeCollectionId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(collectionId => {
        // Ignore state changes that we triggered ourselves
        if (this.isNavigatingProgrammatically) {
          return;
        }

        // Only navigate if the state is different from our current state
        // This prevents double-loading during initialization
        if (collectionId !== this.currentCollectionId) {
          if (collectionId) {
            console.log('📁 Collection state changed externally, navigating to:', collectionId);
            this.navigateToCollectionById(collectionId);
          } else {
            console.log('📁 Collection state cleared externally, navigating to root');
            this.navigateToRoot();
          }
        }
      });
  }

  /**
   * Subscribe to artifact state changes to track which artifact is currently open
   */
  private subscribeToArtifactState(): void {
    this.artifactState.activeArtifact$
      .pipe(takeUntil(this.destroy$))
      .subscribe(artifact => {
        // Update active artifact ID for highlighting
        this.activeArtifactId = artifact?.ID || null;
      });
  }

  async loadData(): Promise<void> {
    // Only show loading spinner if we don't have data yet
    // This prevents flash of loading when navigating between collections
    const hasData = this.collections.length > 0 || this.unifiedItems.length > 0;
    if (!hasData) {
      this.isLoading = true;
    }

    try {
      // Load saved view preferences from localStorage
      const savedMode = localStorage.getItem('collections-view-mode');
      if (savedMode === 'grid' || savedMode === 'list') {
        this.viewMode = savedMode;
      }

      const savedSortBy = localStorage.getItem('collections-sort-by');
      if (savedSortBy === 'name' || savedSortBy === 'date' || savedSortBy === 'type') {
        this.sortBy = savedSortBy;
      }

      const savedSortOrder = localStorage.getItem('collections-sort-order');
      if (savedSortOrder === 'asc' || savedSortOrder === 'desc') {
        this.sortOrder = savedSortOrder;
      }

      await Promise.all([
        this.loadCollections(),
        this.loadArtifacts(),
        this.loadCurrentCollectionPermission()
      ]);

      // Build unified item list after data loads
      this.buildUnifiedItemList();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadCollections(bypassCache: boolean = false): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      // Load collections where user is owner OR has permissions
      const ownerFilter = `OwnerID='${this.currentUser.ID}'`;
      const permissionSubquery = `ID IN (
        SELECT CollectionID
        FROM [__mj].[vwCollectionPermissions]
        WHERE UserID='${this.currentUser.ID}'
      )`;

      const baseFilter = `EnvironmentID='${this.environmentId}'` +
                         (this.currentCollectionId ? ` AND ParentID='${this.currentCollectionId}'` : ' AND ParentID IS NULL');

      const filter = `${baseFilter} AND (OwnerID IS NULL OR ${ownerFilter} OR ${permissionSubquery})`;

      const result = await rv.RunView<MJCollectionEntity>(
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: filter,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object',
          BypassCache: bypassCache
        },
        this.currentUser
      );

      if (result.Success) {
        this.collections = result.Results || [];
        await Promise.all([
          this.loadUserPermissions(),
          this.loadItemCounts(bypassCache)
        ]);
        this.filteredCollections = [...this.collections];
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  }

  /**
   * Load item counts (child collections + artifacts) for all visible collections.
   * `bypassCache` is passed right after a mutation so the count badges reflect committed
   * DB state immediately (cache invalidation is async relative to Save/Delete resolving).
   */
  private async loadItemCounts(bypassCache: boolean = false): Promise<void> {
    this.itemCountMap.clear();
    if (this.collections.length === 0) return;

    const collectionIds = this.collections.map(c => c.ID);
    const inClause = collectionIds.map(id => `'${id}'`).join(',');

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const [childResult, artifactResult] = await rv.RunViews(
      [
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: `ParentID IN (${inClause})`,
          Fields: ['ID', 'ParentID'],
          ResultType: 'simple',
          BypassCache: bypassCache
        },
        {
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `CollectionID IN (${inClause})`,
          Fields: ['ID', 'CollectionID'],
          ResultType: 'simple',
          BypassCache: bypassCache
        }
      ],
      this.currentUser
    );

    // Count children per parent
    if (childResult.Success && childResult.Results) {
      for (const child of childResult.Results) {
        const parentId = (child as Record<string, string>).ParentID;
        this.itemCountMap.set(parentId, (this.itemCountMap.get(parentId) || 0) + 1);
      }
    }

    // Count artifacts per collection
    if (artifactResult.Success && artifactResult.Results) {
      for (const ca of artifactResult.Results) {
        const collId = (ca as Record<string, string>).CollectionID;
        this.itemCountMap.set(collId, (this.itemCountMap.get(collId) || 0) + 1);
      }
    }
  }

  private async loadUserPermissions(): Promise<void> {
    this.userPermissions.clear();

    for (const collection of this.collections) {
      const permission = await this.permissionService.checkPermission(
        collection.ID,
        this.currentUser.ID,
        this.currentUser
      );

      if (permission) {
        this.userPermissions.set(collection.ID, permission);
      }
    }
  }

  private async loadCurrentCollectionPermission(): Promise<void> {
    if (!this.currentCollectionId || !this.currentCollection) {
      return;
    }

    const permission = await this.permissionService.checkPermission(
      this.currentCollectionId,
      this.currentUser.ID,
      this.currentUser
    );

    if (permission) {
      this.userPermissions.set(this.currentCollectionId, permission);
    }
  }

  private async loadArtifacts(bypassCache: boolean = false): Promise<void> {
    if (!this.currentCollectionId) {
      this.artifactVersions = [];
      this.filteredArtifactVersions = [];
      return;
    }

    try {
      this.artifactVersions = await this.artifactState.loadArtifactVersionsForCollection(
        this.currentCollectionId,
        this.currentUser,
        bypassCache
      );
      this.filteredArtifactVersions = [...this.artifactVersions];
    } catch (error) {
      console.error('Failed to load artifact versions:', error);
    }
  }

  async openCollection(collection: MJCollectionEntity): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      this.breadcrumbs.push({ id: collection.ID, name: collection.Name });
      this.currentCollectionId = collection.ID;
      this.currentCollection = collection;
      this.activeArtifactId = null; // Clear active artifact when switching collections
      await this.loadData();

      // Update state service
      this.collectionState.setActiveCollection(collection.ID);

      // Close any open artifact when switching collections
      this.collectionNavigated.emit({
        collectionId: collection.ID,
        versionId: null
      });
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  async navigateTo(crumb: { id: string; name: string }): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      const index = this.breadcrumbs.findIndex(b => b.id === crumb.id);
      if (index !== -1) {
        this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
        this.currentCollectionId = crumb.id;

        // Load the collection entity
        const md = this.ProviderToUse;
        this.currentCollection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);
        await this.currentCollection.Load(crumb.id);

        await this.loadData();

        // Update state service
        this.collectionState.setActiveCollection(crumb.id);

        // Close any open artifact when navigating collections
        this.collectionNavigated.emit({
          collectionId: crumb.id,
          versionId: null
        });
      }
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  async navigateToRoot(): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      this.breadcrumbs = [];
      this.currentCollectionId = null;
      this.currentCollection = null;
      await this.loadData();

      // Update state service
      this.collectionState.setActiveCollection(null);

      // Close any open artifact when navigating to root
      this.collectionNavigated.emit({
        collectionId: null,
        versionId: null
      });
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  /**
   * Update a breadcrumb entry's name in place (e.g., after rename)
   */
  private updateBreadcrumbName(collectionId: string, newName: string): void {
    const crumb = this.breadcrumbs.find(b => UUIDsEqual(b.id, collectionId));
    if (crumb) {
      crumb.name = newName;
    }
  }

  /**
   * Navigate to a collection by ID, building the breadcrumb trail
   * Used for deep linking from search results or URL parameters
   */
  async navigateToCollectionById(collectionId: string): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      console.log('📁 Navigating to collection by ID:', collectionId);

      // Load the target collection
      const md = this.ProviderToUse;
      const targetCollection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);
      await targetCollection.Load(collectionId);

      if (!targetCollection || !targetCollection.ID) {
        console.error('❌ Failed to load collection:', collectionId);
        return;
      }

      // Build breadcrumb trail by traversing parent hierarchy
      // Note: breadcrumbs includes ALL collections in the path including the current one
      const trail: Array<{ id: string; name: string }> = [];
      let currentId: string | null = targetCollection.ParentID;

      while (currentId) {
        const parentCollection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);
        await parentCollection.Load(currentId);

        if (parentCollection && parentCollection.ID) {
          // Add to front of trail (we're working backwards)
          trail.unshift({
            id: parentCollection.ID,
            name: parentCollection.Name
          });
          currentId = parentCollection.ParentID;
        } else {
          break;
        }
      }

      // Add the target collection to the trail (breadcrumbs includes current collection)
      trail.push({
        id: targetCollection.ID,
        name: targetCollection.Name
      });

      // Update component state
      this.breadcrumbs = trail;
      this.currentCollectionId = targetCollection.ID;
      this.currentCollection = targetCollection;

      // Load collections and artifacts for this collection
      await this.loadData();

      // Update state service
      this.collectionState.setActiveCollection(targetCollection.ID);

      // Emit navigation event
      // NOTE: We don't emit artifactId here because this is for deep linking/programmatic navigation
      // Artifact state is managed separately by the artifact state service
      this.collectionNavigated.emit({
        collectionId: targetCollection.ID
      });

      console.log('✅ Successfully navigated to collection with breadcrumb trail:', trail);
    } catch (error) {
      console.error('❌ Error navigating to collection:', error);
    } finally {
      this.isNavigatingProgrammatically = false;
    }
  }

  refresh(): void {
    this.loadData();
  }

  async createCollection(): Promise<void> {
    // Validate user can edit current collection (or at root level)
    if (this.currentCollection) {
      const canEdit = await this.validatePermission(this.currentCollection, 'edit');
      if (!canEdit) return;
    }

    this.showNewDropdown = false;
    this.editingCollection = undefined;
    this.isFormModalOpen = true;
  }

  async editCollection(collection: MJCollectionEntity): Promise<void> {
    const canEdit = await this.validatePermission(collection, 'edit');
    if (!canEdit) return;

    this.editingCollection = collection;
    this.isFormModalOpen = true;
  }

  async deleteCollection(collection: MJCollectionEntity): Promise<void> {
    console.log('deleteCollection called for:', collection.Name, collection.ID);

    // Validate user has delete permission
    const canDelete = await this.validatePermission(collection, 'delete');
    if (!canDelete) return;

    const confirmed = await this.dialogService.confirm({
      title: 'Delete Collection',
      message: `Are you sure you want to delete "${collection.Name}"? This will also delete all child collections and remove all artifacts. This action cannot be undone.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      dangerous: true
    });

    console.log('Delete confirmed:', confirmed);

    if (confirmed) {
      try {
        console.log('Attempting to delete collection and all children...');
        await this.deleteCollectionRecursive(collection.ID);
        await this.loadCollections(true);
        await this.loadAllCollections(true);
      } catch (error) {
        console.error('Error deleting collection:', error);
        await this.dialogService.alert('Error', `An error occurred while deleting the collection: ${error}`);
      }
    }
  }

  private async deleteCollectionRecursive(collectionId: string): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);

    // Step 1: Find and delete all child collections recursively
    const childrenResult = await rv.RunView<MJCollectionEntity>(
      {
        EntityName: 'MJ: Collections',
        ExtraFilter: `ParentID='${collectionId}'`,
        MaxRows: 1000,
        ResultType: 'entity_object'
      },
      this.currentUser
    );

    if (childrenResult.Success && childrenResult.Results) {
      for (const child of childrenResult.Results) {
        await this.deleteCollectionRecursive(child.ID);
      }
    }

    // Step 2: Delete all permissions for this collection
    await this.permissionService.deleteAllPermissions(collectionId, this.currentUser);

    // Step 3: Delete all artifact links for this collection
    const artifactsResult = await rv.RunView<any>(
      {
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${collectionId}'`,
        MaxRows: 1000,
        ResultType: 'entity_object'
      },
      this.currentUser
    );

    if (artifactsResult.Success && artifactsResult.Results) {
      for (const ca of artifactsResult.Results) {
        await ca.Delete();
      }
    }

    // Step 4: Delete the collection itself
    const md = this.ProviderToUse;
    const collection = await md.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);
    await collection.Load(collectionId);
    const deleted = await collection.Delete();

    if (!deleted) {
      throw new Error(`Failed to delete collection: ${collection.LatestResult?.Message || 'Unknown error'}`);
    }
  }

  async onCollectionSaved(collection: MJCollectionEntity): Promise<void> {
    this.isFormModalOpen = false;
    this.editingCollection = undefined;
    await this.loadCollections(true);
    await this.loadAllCollections(true);
    // Reload current collection permission (it was cleared by loadUserPermissions)
    await this.loadCurrentCollectionPermission();

    // Update breadcrumb and currentCollection if the saved collection is in the trail
    this.updateBreadcrumbName(collection.ID, collection.Name);
    if (this.currentCollection && UUIDsEqual(this.currentCollection.ID, collection.ID)) {
      this.currentCollection = collection;
    }

    // Rebuild unified list to show new collection
    this.buildUnifiedItemList();
    this.cdr.detectChanges();
  }

  onFormCancelled(): void {
    this.isFormModalOpen = false;
    this.editingCollection = undefined;
  }

  async addArtifact(): Promise<void> {
    // Validate user can edit current collection
    if (this.currentCollection) {
      const canEdit = await this.validatePermission(this.currentCollection, 'edit');
      if (!canEdit) return;
    }

    this.showNewDropdown = false;
    this.isArtifactModalOpen = true;
  }

  async onArtifactSaved(artifact: MJArtifactEntity): Promise<void> {
    this.isArtifactModalOpen = false;
    await this.loadArtifacts(true);
    this.cdr.detectChanges();
  }

  onArtifactModalCancelled(): void {
    this.isArtifactModalOpen = false;
  }

  async removeArtifact(item: { version: MJArtifactVersionEntity; artifact: MJArtifactEntity }): Promise<void> {
    if (!this.currentCollectionId) return;

    // Validate user has delete permission on current collection
    if (this.currentCollection) {
      const canDelete = await this.validatePermission(this.currentCollection, 'delete');
      if (!canDelete) return;
    }

    const versionLabel = `"${item.artifact.Name}" v${item.version.VersionNumber}`;
    const confirmed = await this.dialogService.confirm({
      title: 'Remove Artifact Version',
      message: `Remove ${versionLabel} from this collection?`,
      okText: 'Remove',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      try {
        // Delete THIS SPECIFIC VERSION from the collection
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView({
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `CollectionID='${this.currentCollectionId}' AND ArtifactVersionID='${item.version.ID}'`,
          ResultType: 'entity_object'
        }, this.currentUser);

        if (result.Success && result.Results && result.Results.length > 0) {
          // Delete this version association
          for (const joinRecord of result.Results) {
            await joinRecord.Delete();
          }
          await this.loadArtifacts(true);
          this.buildUnifiedItemList();
        } else {
          await this.dialogService.alert('Error', 'Collection artifact link not found.');
        }
      } catch (error) {
        console.error('Error removing artifact version:', error);
        await this.dialogService.alert('Error', 'Failed to remove artifact version from collection.');
      }
    }
  }

  viewArtifact(item: { version: MJArtifactVersionEntity; artifact: MJArtifactEntity }): void {
    this.activeArtifactId = item.artifact.ID;
    this.artifactState.openArtifact(item.artifact.ID, item.version.VersionNumber);
  }

  // Permission validation and checking methods
  private async validatePermission(
    collection: MJCollectionEntity | null,
    requiredPermission: 'edit' | 'delete' | 'share'
  ): Promise<boolean> {
    // Owner has all permissions (including backwards compatibility for null OwnerID)
    if (!collection?.OwnerID || UUIDsEqual(collection.OwnerID, this.currentUser.ID)) {
      return true;
    }

    const permission = this.userPermissions.get(collection.ID);
    if (!permission) {
      await this.dialogService.alert(
        'Permission Denied',
        'You do not have permission to perform this action.'
      );
      return false;
    }

    const hasPermission =
      (requiredPermission === 'edit' && permission.canEdit) ||
      (requiredPermission === 'delete' && permission.canDelete) ||
      (requiredPermission === 'share' && permission.canShare);

    if (!hasPermission) {
      const permissionName = requiredPermission.charAt(0).toUpperCase() + requiredPermission.slice(1);
      await this.dialogService.alert(
        'Permission Denied',
        `You do not have ${permissionName} permission for this collection.`
      );
      return false;
    }

    return true;
  }

  canEdit(collection: MJCollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || UUIDsEqual(collection.OwnerID, this.currentUser.ID)) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canEdit || false;
  }

  canDelete(collection: MJCollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || UUIDsEqual(collection.OwnerID, this.currentUser.ID)) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canDelete || false;
  }

  canShare(collection: MJCollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || UUIDsEqual(collection.OwnerID, this.currentUser.ID)) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canShare || false;
  }

  canEditCurrent(): boolean {
    // At root level, anyone can create
    if (!this.currentCollectionId || !this.currentCollection) {
      return true;
    }
    return this.canEdit(this.currentCollection);
  }

  canDeleteCurrent(): boolean {
    // At root level, no delete needed
    if (!this.currentCollectionId || !this.currentCollection) {
      return false;
    }
    return this.canDelete(this.currentCollection);
  }

  canShareCurrent(): boolean {
    // At root level, no share needed
    if (!this.currentCollectionId || !this.currentCollection) {
      return false;
    }
    return this.canShare(this.currentCollection);
  }

  isShared(collection: MJCollectionEntity): boolean {
    // Collection is shared if user is not the owner and OwnerID is set
    return collection.OwnerID != null && !UUIDsEqual(collection.OwnerID, this.currentUser.ID);
  }

  // Sharing methods
  async shareCollection(collection: MJCollectionEntity): Promise<void> {
    // Validate user has share permission
    const canShare = await this.validatePermission(collection, 'share');
    if (!canShare) return;

    this.sharingCollection = collection;
    this.isShareModalOpen = true;
  }

  async onPermissionsChanged(): Promise<void> {
    // Reload collections and permissions after sharing changes
    await this.loadCollections(true);
    await this.loadAllCollections(true);
    this.cdr.detectChanges();
  }

  onShareModalCancelled(): void {
    this.isShareModalOpen = false;
    this.sharingCollection = null;
  }

  // Header toolbar action methods
  shareCurrentCollection(): void {
    if (this.currentCollection) {
      this.shareCollection(this.currentCollection);
    }
  }

  editCurrentCollection(): void {
    if (this.currentCollection) {
      this.editCollection(this.currentCollection);
    }
  }

  deleteCurrentCollection(): void {
    if (this.currentCollection) {
      this.deleteCollection(this.currentCollection);
    }
  }

  /**
   * Get the icon for an artifact using the centralized icon service.
   * Fallback priority: Plugin icon > Metadata icon > Hardcoded mapping > Generic icon
   */
  public getArtifactIcon(artifact: MJArtifactEntity): string {
    return this.artifactIconService.getArtifactIcon(artifact);
  }

  // ==================== NEW MAC FINDER-STYLE METHODS ====================

  /**
   * Build unified list of folders and artifacts (Phase 1)
   */
  private buildUnifiedItemList(): void {
    const items: CollectionViewItem[] = [];

    // Add folders first (collections)
    for (const collection of this.filteredCollections) {
      items.push({
        type: 'folder',
        id: collection.ID,
        name: collection.Name,
        description: collection.Description || undefined,
        icon: 'fa-folder',
        itemCount: this.itemCountMap.get(collection.ID) || 0,
        owner: collection.Owner || undefined,
        isShared: this.isShared(collection),
        selected: this.selectedItems.has(collection.ID),
        collection: collection
      });
    }

    // Then add artifacts
    for (const item of this.filteredArtifactVersions) {
      items.push({
        type: 'artifact',
        id: item.version.ID,
        name: item.artifact.Name,
        description: item.artifact.Description || undefined,
        icon: this.getArtifactIcon(item.artifact),
        versionNumber: item.version.VersionNumber,
        artifactType: item.artifact.Type,
        lastModified: item.version.__mj_UpdatedAt,
        selected: this.selectedItems.has(item.version.ID),
        artifact: item.artifact,
        version: item.version
      });
    }

    // Apply sorting and reset pagination
    this.unifiedItems = this.sortItems(items);
    this.CurrentPage = 1;
    this.cdr.detectChanges();
  }

  /**
   * Sort items by selected criteria (Phase 2)
   */
  private sortItems(items: CollectionViewItem[]): CollectionViewItem[] {
    return items.sort((a, b) => {
      let comparison = 0;

      // Always keep folders before artifacts
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }

      // Then sort by selected criteria
      switch (this.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          const aDate = a.lastModified || new Date(0);
          const bDate = b.lastModified || new Date(0);
          comparison = aDate.getTime() - bDate.getTime();
          break;
        case 'type':
          comparison = (a.artifactType || '').localeCompare(b.artifactType || '');
          break;
      }

      return this.sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Toggle between grid and list view
   */
  public toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    // Save preference to localStorage
    localStorage.setItem('collections-view-mode', this.viewMode);
  }

  /**
   * Set view mode explicitly
   */
  public setViewMode(mode: CollectionViewMode): void {
    this.viewMode = mode;
    // Save preference to localStorage
    localStorage.setItem('collections-view-mode', mode);
  }

  /**
   * Toggle selection mode on/off
   * When entering select mode, clicks toggle selection instead of opening items
   * When exiting select mode, clears any selections
   */
  public toggleSelectMode(): void {
    this.isSelectMode = !this.isSelectMode;
    if (!this.isSelectMode) {
      // Clear selection when exiting select mode (clearSelection calls buildUnifiedItemList which calls cdr)
      this.clearSelection();
    } else {
      this.cdr.detectChanges();
    }
  }

  /**
   * Exit selection mode (called when navigating to a new folder)
   */
  private exitSelectMode(): void {
    if (this.isSelectMode) {
      this.isSelectMode = false;
      this.clearSelection();
    }
  }

  /**
   * Set sort order - toggles asc/desc if clicking same column
   */
  public setSortBy(sortBy: CollectionSortBy): void {
    if (this.sortBy === sortBy) {
      // Toggle order if same sort
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = sortBy;
      this.sortOrder = 'asc';
    }

    // Save sort preferences to localStorage
    localStorage.setItem('collections-sort-by', this.sortBy);
    localStorage.setItem('collections-sort-order', this.sortOrder);

    // Close dropdown and rebuild list
    this.showSortDropdown = false;
    this.buildUnifiedItemList();
  }

  /**
   * Filter items by search query (Phase 2)
   */
  public onSearchChange(query?: string): void {
    // If query parameter provided, use it; otherwise use searchQuery property
    const searchText = query !== undefined ? query : this.searchQuery;

    if (!searchText.trim()) {
      // Reset to all items
      this.buildUnifiedItemList();
      return;
    }

    const lowerQuery = searchText.toLowerCase();
    this.unifiedItems = this.unifiedItems.filter(item =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Multi-select: Toggle item selection (Phase 3)
   */
  public toggleItemSelection(item: CollectionViewItem, event: MouseEvent): void {
    event.stopPropagation();
    // Checkbox click: additive toggle by default, shift = range, cmd/ctrl = toggle.
    this.applySelectionGesture(item, event);
  }

  /**
   * Multi-select: Select all items (Phase 3)
   */
  public selectAll(): void {
    this.selectedItems.clear();
    for (const item of this.unifiedItems) {
      this.selectedItems.add(item.id);
    }
    this.refreshSelectionFlags();
  }

  /**
   * Multi-select: Clear selection (Phase 3)
   */
  public clearSelection(): void {
    this.selectedItems.clear();
    this.lastSelectedIndex = null;
    this.refreshSelectionFlags();
  }

  /**
   * Multi-select: Delete selected items
   */
  public async deleteSelected(): Promise<void> {
    if (this.selectedItems.size === 0) return;

    const confirmed = await this.dialogService.confirm({
      title: `Delete ${this.selectedItems.size} item(s)?`,
      message: 'This action cannot be undone.',
      dangerous: true
    });

    if (!confirmed) return;

    const selectedViewItems = this.unifiedItems.filter(item => this.selectedItems.has(item.id));
    const folderItems = selectedViewItems.filter(item => item.type === 'folder' && item.collection);
    const artifactItems = selectedViewItems.filter(item => item.type === 'artifact' && item.version);

    try {
      for (const item of folderItems) {
        await this.deleteCollectionRecursive(item.collection!.ID);
      }

      if (artifactItems.length > 0 && this.currentCollectionId) {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        for (const item of artifactItems) {
          const result = await rv.RunView<MJCollectionArtifactEntity>({
            EntityName: 'MJ: Collection Artifacts',
            ExtraFilter: `CollectionID='${this.currentCollectionId}' AND ArtifactVersionID='${item.version!.ID}'`,
            ResultType: 'entity_object'
          }, this.currentUser);

          if (result.Success && result.Results) {
            for (const joinRecord of result.Results) {
              await joinRecord.Delete();
            }
          }
        }
      }

      this.clearSelection();
      await this.loadCollections(true);
      await this.loadAllCollections(true);
      if (artifactItems.length > 0) {
        await this.loadArtifacts(true);
      }
      this.buildUnifiedItemList();
    } catch (error) {
      console.error('Error deleting selected items:', error);
      await this.dialogService.alert('Error', `An error occurred while deleting: ${error}`);
    }
  }

  /**
   * Get count of items in folder (Phase 1)
   */
  private async getCollectionItemCount(collectionId: string): Promise<number> {
    return this.itemCountMap.get(collectionId) || 0;
  }

  /**
   * Handle clicking on unified item
   * In select mode: toggles selection
   * In normal mode: opens item (folder or artifact)
   */
  public onItemClick(item: CollectionViewItem, event?: MouseEvent): void {
    // Modifier-click selects without needing select mode (shift = range, cmd/ctrl = toggle)
    if (event && (event.shiftKey || event.metaKey || event.ctrlKey)) {
      this.applySelectionGesture(item, event, true);
      return;
    }

    // In sticky select mode, a plain click toggles selection
    if (this.isSelectMode) {
      this.toggleItemSelectionSimple(item);
      return;
    }

    // Normal mode: open the item
    this.openItem(item);
  }

  /**
   * Handle double-clicking on unified item
   * Always opens the item, even in select mode
   */
  public onItemDoubleClick(item: CollectionViewItem, event?: MouseEvent): void {
    event?.preventDefault();
    this.openItem(item);
  }

  /**
   * Open an item (folder or artifact)
   */
  private openItem(item: CollectionViewItem): void {
    if (item.type === 'folder' && item.collection) {
      // Exit select mode when navigating to a new folder
      this.exitSelectMode();
      this.openCollection(item.collection);
    } else if (item.type === 'artifact') {
      if (!item.artifact || !item.version) {
        console.error('Artifact or version is missing for item:', item.id);
        return;
      }
      this.viewArtifact({ artifact: item.artifact, version: item.version });
    }
  }

  /**
   * Simple toggle for item selection (used in select mode)
   */
  private toggleItemSelectionSimple(item: CollectionViewItem): void {
    if (this.selectedItems.has(item.id)) {
      this.selectedItems.delete(item.id);
    } else {
      this.selectedItems.add(item.id);
    }
    this.lastSelectedIndex = this.indexOfItem(item.id);
    this.refreshSelectionFlags();
  }

  /**
   * Get item count text for display
   */
  public getItemCountText(itemCount?: number): string {
    if (itemCount !== undefined) {
      if (itemCount === 0) return 'Empty';
      if (itemCount === 1) return '1 item';
      return `${itemCount} items`;
    }

    const folders = this.unifiedItems.filter(i => i.type === 'folder').length;
    const artifacts = this.unifiedItems.filter(i => i.type === 'artifact').length;
    const total = folders + artifacts;

    if (total === 0) return 'No items';
    if (total === 1) return '1 item';

    const parts: string[] = [];
    if (folders > 0) parts.push(`${folders} folder${folders > 1 ? 's' : ''}`);
    if (artifacts > 0) parts.push(`${artifacts} artifact${artifacts > 1 ? 's' : ''}`);

    return parts.join(', ');
  }

  /**
   * Handle keyboard shortcuts
   * - Cmd/Ctrl+A: Select all (enters select mode if not already)
   * - Escape: Exit select mode and clear selection
   * - Delete/Backspace: Delete selected items
   */
  public handleKeyboardShortcut(event: KeyboardEvent): void {
    // Cmd+A / Ctrl+A: Select all (enters select mode)
    if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
      event.preventDefault();
      if (!this.isSelectMode) {
        this.isSelectMode = true;
      }
      this.selectAll();
      return;
    }

    // Escape: Exit select mode
    if (event.key === 'Escape' && this.isSelectMode) {
      event.preventDefault();
      this.exitSelectMode();
      return;
    }

    // Delete/Backspace: Delete selected items
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedItems.size > 0) {
      // Only if not focused on an input
      const target = event.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        this.deleteSelected();
      }
      return;
    }
  }

  /**
   * Handle right-click context menu - shows custom context menu with permission-gated actions
   */
  public onItemContextMenu(item: CollectionViewItem, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Close any open dropdowns
    this.showNewDropdown = false;
    this.showSortDropdown = false;

    this.contextMenuItem = item;
    this.contextMenuPosition = this.clampContextMenuPosition(event.clientX, event.clientY);
    this.showContextMenu = true;
    this.showMoveSubmenu = false;
    this.cdr.detectChanges();
  }

  /** Clamp menu position to keep it within the viewport */
  private clampContextMenuPosition(x: number, y: number): { x: number; y: number } {
    const menuWidth = 200;
    const menuHeight = 200;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    return {
      x: Math.min(x, viewportWidth - menuWidth),
      y: Math.min(y, viewportHeight - menuHeight)
    };
  }

  public closeContextMenu(): void {
    this.showContextMenu = false;
    this.contextMenuItem = null;
    this.showMoveSubmenu = false;
    this.cdr.detectChanges();
  }

  /** Opens the inline "Move to Collection" submenu and loads candidate target collections. */
  public openMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.showMoveSubmenu = true;
    void this.loadMoveTargets();
  }

  public closeMoveSubmenu(event: Event): void {
    event.stopPropagation();
    this.showMoveSubmenu = false;
    this.cdr.detectChanges();
  }

  /** Loads every collection the user can access in this environment (flattened, indented), minus the current one. */
  private async loadMoveTargets(): Promise<void> {
    this.isLoadingMoveTargets = true;
    this.moveTargets = [];
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const ownerFilter = `OwnerID='${this.currentUser.ID}'`;
      const permissionSubquery = `ID IN (
        SELECT CollectionID FROM [__mj].[vwCollectionPermissions] WHERE UserID='${this.currentUser.ID}'
      )`;
      const filter = `EnvironmentID='${this.environmentId}' AND (OwnerID IS NULL OR ${ownerFilter} OR ${permissionSubquery})`;

      const result = await rv.RunView<MJCollectionEntity>({
        EntityName: 'MJ: Collections',
        ExtraFilter: filter,
        OrderBy: 'Name ASC',
        MaxRows: 1000,
        ResultType: 'entity_object'
      }, this.currentUser);

      const all = result.Success ? (result.Results || []) : [];
      const flattened = this.flattenCollectionTree(all);
      this.moveTargets = this.currentCollectionId
        ? flattened.filter(t => !UUIDsEqual(t.collection.ID, this.currentCollectionId!))
        : flattened;
    } catch (error) {
      console.error('Failed to load move targets:', error);
      this.moveTargets = [];
    } finally {
      this.isLoadingMoveTargets = false;
      this.cdr.detectChanges();
    }
  }

  /** Flattens collections into a depth-first, indented list (orphans treated as roots). */
  private flattenCollectionTree(all: MJCollectionEntity[]): Array<{ collection: MJCollectionEntity; depth: number }> {
    const ids = new Set(all.map(c => NormalizeUUID(c.ID)));
    const byParent = new Map<string | null, MJCollectionEntity[]>();
    for (const c of all) {
      const pid = c.ParentID ? NormalizeUUID(c.ParentID) : null;
      const key = pid && ids.has(pid) ? pid : null;
      const arr = byParent.get(key) || [];
      arr.push(c);
      byParent.set(key, arr);
    }
    const out: Array<{ collection: MJCollectionEntity; depth: number }> = [];
    const walk = (parentKey: string | null, depth: number): void => {
      for (const c of (byParent.get(parentKey) || [])) {
        out.push({ collection: c, depth });
        walk(NormalizeUUID(c.ID), depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  /**
   * Moves the right-clicked artifact version from the current collection to the target.
   * Adds to the target first (so a failure never drops it from the source), then removes
   * the version's join row from the source collection.
   */
  public async moveArtifactToCollection(target: MJCollectionEntity): Promise<void> {
    const item = this.contextMenuItem;
    const fromCollectionId = this.currentCollectionId;
    this.closeContextMenu();

    if (!item?.artifact || !item.version || !fromCollectionId) return;
    if (UUIDsEqual(target.ID, fromCollectionId)) return;

    try {
      const p = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(p);

      // Add to target (skip if the version is already there to avoid a duplicate join row)
      const existing = await rv.RunView<MJCollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${target.ID}' AND ArtifactVersionID='${item.version.ID}'`,
        ResultType: 'simple',
        Fields: ['ID']
      }, this.currentUser);

      if (!(existing.Success && (existing.Results?.length ?? 0) > 0)) {
        const junction = await p.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);
        junction.CollectionID = target.ID;
        junction.ArtifactVersionID = item.version.ID;
        junction.Sequence = 0;
        const saved = await junction.Save();
        if (!saved) {
          throw new Error(junction.LatestResult?.CompleteMessage || 'Failed to add artifact to the target collection');
        }
      }

      // Remove this version's join row(s) from the source collection
      const sourceRows = await rv.RunView<MJCollectionArtifactEntity>({
        EntityName: 'MJ: Collection Artifacts',
        ExtraFilter: `CollectionID='${fromCollectionId}' AND ArtifactVersionID='${item.version.ID}'`,
        ResultType: 'entity_object'
      }, this.currentUser);

      if (sourceRows.Success && sourceRows.Results) {
        for (const row of sourceRows.Results) {
          await row.Delete();
        }
      }

      await this.loadArtifacts(true);
      await this.loadCollections(true);
      await this.loadAllCollections(true);
      this.buildUnifiedItemList();
    } catch (error) {
      console.error('Error moving artifact:', error);
      await this.dialogService.alert('Error', 'Failed to move artifact. Please try again.');
    }
  }

  /** Handle context menu action dispatch */
  public onContextMenuAction(action: string): void {
    const item = this.contextMenuItem;
    this.closeContextMenu();
    if (!item) return;

    switch (action) {
      case 'open':
        this.openItem(item);
        break;
      case 'view':
        this.openItem(item);
        break;
      case 'share':
        if (item.collection) {
          this.shareCollection(item.collection);
        }
        break;
      case 'edit':
        if (item.collection) {
          this.editCollection(item.collection);
        }
        break;
      case 'delete':
        if (item.collection) {
          this.deleteCollection(item.collection);
        }
        break;
      case 'remove':
        if (item.artifact && item.version) {
          this.removeArtifact({ artifact: item.artifact, version: item.version });
        }
        break;
      case 'openConversation':
        if (item.artifact && item.version) {
          void this.openSourceConversation(item);
        }
        break;
    }
  }

  /**
   * Resolves the artifact version the user right-clicked to the conversation it was produced in,
   * then asks the host to open it. Chain: Artifact Version → Conversation Detail Artifacts
   * (prefer Direction='Output' = produced here) → Conversation Detail → ConversationID.
   */
  private async openSourceConversation(item: CollectionViewItem): Promise<void> {
    if (!item.version) return;
    const conversationId = await this.resolveArtifactToConversation(item.version.ID);
    if (conversationId) {
      this.openConversationRequested.emit({ conversationId });
    } else {
      await this.dialogService.alert('No Source Conversation', 'This artifact is not linked to a conversation.');
    }
  }

  private async resolveArtifactToConversation(artifactVersionId: string): Promise<string | null> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);

    // Find the message(s) this version is attached to. Prefer the one that produced it
    // (Direction='Output'); fall back to any link if it only appears as an input.
    const linkResult = await rv.RunView<{ ConversationDetailID: string; Direction: string }>({
      EntityName: 'MJ: Conversation Detail Artifacts',
      ExtraFilter: `ArtifactVersionID='${artifactVersionId}'`,
      Fields: ['ConversationDetailID', 'Direction'],
      ResultType: 'simple'
    }, this.currentUser);

    const links = linkResult.Success ? (linkResult.Results ?? []) : [];
    if (links.length === 0) return null;
    const link = links.find(l => l.Direction === 'Output') ?? links[0];

    const detailResult = await rv.RunView<{ ConversationID: string }>({
      EntityName: 'MJ: Conversation Details',
      ExtraFilter: `ID='${link.ConversationDetailID}'`,
      Fields: ['ConversationID'],
      ResultType: 'simple'
    }, this.currentUser);

    return detailResult.Success ? (detailResult.Results?.[0]?.ConversationID ?? null) : null;
  }

  /** Close context menu on Escape key */
  @HostListener('document:keydown.escape')
  public onEscapeKey(): void {
    if (this.showContextMenu) {
      this.closeContextMenu();
    }
  }

  // ============================================================
  //  Selection gestures (#4 — frictionless multi-select)
  // ============================================================

  private indexOfItem(id: string): number {
    return this.unifiedItems.findIndex(i => i.id === id);
  }

  /** Re-sync each item's `selected` flag from the set without rebuilding (preserves page). */
  private refreshSelectionFlags(): void {
    for (const it of this.unifiedItems) {
      it.selected = this.selectedItems.has(it.id);
    }
    this.cdr.detectChanges();
  }

  /**
   * Centralized selection gesture used by both the hover checkbox and modifier-clicks.
   * - shift  → range select from the last anchor
   * - cmd/ctrl → additive toggle
   * - plain  → additive toggle (checkbox) or replace (plainReplaces, used by body clicks)
   */
  private applySelectionGesture(item: CollectionViewItem, event: MouseEvent, plainReplaces = false): void {
    const idx = this.indexOfItem(item.id);
    if (event.shiftKey && this.lastSelectedIndex != null && this.lastSelectedIndex >= 0) {
      const lo = Math.min(this.lastSelectedIndex, idx);
      const hi = Math.max(this.lastSelectedIndex, idx);
      for (let i = lo; i <= hi; i++) {
        const it = this.unifiedItems[i];
        if (it) this.selectedItems.add(it.id);
      }
    } else if (event.metaKey || event.ctrlKey || !plainReplaces) {
      if (this.selectedItems.has(item.id)) {
        this.selectedItems.delete(item.id);
      } else {
        this.selectedItems.add(item.id);
      }
      this.lastSelectedIndex = idx;
    } else {
      this.selectedItems.clear();
      this.selectedItems.add(item.id);
      this.lastSelectedIndex = idx;
    }
    this.refreshSelectionFlags();
  }

  /** Hover-checkbox click — selects without requiring an explicit "select mode". */
  public onCheckboxClick(item: CollectionViewItem, event: MouseEvent): void {
    event.stopPropagation();
    this.applySelectionGesture(item, event);
  }

  // ============================================================
  //  Drag-and-drop (#1, #2 — drag items onto folders / breadcrumbs / navigator)
  // ============================================================

  public onItemDragStart(item: CollectionViewItem, event: DragEvent): void {
    // If the dragged item is part of the current selection, drag the whole selection;
    // otherwise drag just this item.
    this.draggedItemIds = (this.selectedItems.has(item.id) && this.selectedItems.size > 0)
      ? Array.from(this.selectedItems)
      : [item.id];
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', this.draggedItemIds.join(','));
    }
  }

  public onItemDragEnd(): void {
    this.draggedItemIds = [];
    this.dragOverTargetId = null;
  }

  private draggedItems(): CollectionViewItem[] {
    return this.unifiedItems.filter(i => this.draggedItemIds.includes(i.id));
  }

  /** Folder grid card / list row as a drop target. */
  public onFolderItemDragOver(folderItem: CollectionViewItem, event: DragEvent): void {
    const targetId = folderItem.collection?.ID;
    if (this.draggedItemIds.length === 0 || this.draggedItemIds.includes(folderItem.id)) return;
    if (!this.canDropOnCollection(targetId)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = folderItem.id;
  }

  public onFolderItemDrop(folderItem: CollectionViewItem, event: DragEvent): void {
    event.preventDefault();
    const targetId = folderItem.collection?.ID ?? null;
    this.dragOverTargetId = null;
    void this.moveDraggedItemsTo(targetId);
  }

  /** Breadcrumb crumb / Home root as a drop target. crumbId null = top level. */
  public onCrumbDragOver(crumbId: string | null, event: DragEvent): void {
    if (this.draggedItemIds.length === 0) return;
    // Artifacts can't live at the top level (no collection)
    if (crumbId === null && this.draggedItems().some(i => i.type === 'artifact')) return;
    if (!this.canDropOnCollection(crumbId)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = crumbId === null ? 'root' : 'crumb:' + crumbId;
  }

  public onCrumbDrop(crumbId: string | null, event: DragEvent): void {
    event.preventDefault();
    this.dragOverTargetId = null;
    void this.moveDraggedItemsTo(crumbId);
  }

  /** True when the dragged set may be dropped on the target collection (blocks folder cycles). */
  private canDropOnCollection(targetCollectionId: string | null | undefined): boolean {
    if (targetCollectionId === undefined) return false;
    for (const f of this.draggedItems()) {
      if (f.type !== 'folder' || !f.collection) continue;
      const fid = f.collection.ID;
      if (targetCollectionId && (UUIDsEqual(fid, targetCollectionId) || this.isCollectionDescendant(targetCollectionId, fid))) {
        return false;
      }
    }
    return true;
  }

  private isCollectionDescendant(nodeId: string, ancestorId: string): boolean {
    let cur = this.allCollectionsById.get(NormalizeUUID(nodeId));
    const seen = new Set<string>();
    while (cur?.ParentID) {
      const pid = NormalizeUUID(cur.ParentID);
      if (seen.has(pid)) break;
      seen.add(pid);
      if (UUIDsEqual(pid, ancestorId)) return true;
      cur = this.allCollectionsById.get(pid);
    }
    return false;
  }

  private async moveDraggedItemsTo(targetCollectionId: string | null): Promise<void> {
    const items = this.draggedItems();
    this.draggedItemIds = [];
    await this.moveItemsTo(items, targetCollectionId, this.currentCollectionId);
  }

  // ============================================================
  //  Move primitives (shared by drag, bulk move, and shelf)
  // ============================================================

  /**
   * Moves items into the target collection. Artifacts: add the version to the target and remove
   * it from its source collection. Folders: reparent (target null = top level). Skips no-ops and
   * invalid folder moves (cycles). Reloads and rebuilds when done.
   */
  private async moveItemsTo(
    items: CollectionViewItem[],
    targetCollectionId: string | null,
    artifactSourceCollectionId: string | null
  ): Promise<void> {
    if (items.length === 0) return;
    try {
      const p = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(p);

      for (const item of items) {
        if (item.type === 'artifact' && item.version) {
          if (targetCollectionId == null) continue; // artifacts require a collection
          if (artifactSourceCollectionId && UUIDsEqual(artifactSourceCollectionId, targetCollectionId)) continue;
          await this.addVersionToCollection(p, rv, item.version.ID, targetCollectionId);
          if (artifactSourceCollectionId) {
            await this.removeVersionFromCollection(rv, item.version.ID, artifactSourceCollectionId);
          }
        } else if (item.type === 'folder' && item.collection) {
          const fid = item.collection.ID;
          if (targetCollectionId && (UUIDsEqual(fid, targetCollectionId) || this.isCollectionDescendant(targetCollectionId, fid))) continue;
          await this.reparentCollection(fid, targetCollectionId);
        }
      }

      this.clearSelection();
      await this.loadCollections(true);
      await this.loadArtifacts(true);
      await this.loadAllCollections(true);
      this.buildUnifiedItemList();
    } catch (error) {
      console.error('Error moving items:', error);
      await this.dialogService.alert('Error', 'Failed to move item(s). Please try again.');
    }
  }

  private async addVersionToCollection(p: IMetadataProvider, rv: RunView, versionId: string, collectionId: string): Promise<void> {
    const existing = await rv.RunView<MJCollectionArtifactEntity>({
      EntityName: 'MJ: Collection Artifacts',
      ExtraFilter: `CollectionID='${collectionId}' AND ArtifactVersionID='${versionId}'`,
      ResultType: 'simple',
      Fields: ['ID']
    }, this.currentUser);
    if (existing.Success && (existing.Results?.length ?? 0) > 0) return;

    const junction = await p.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', this.currentUser);
    junction.CollectionID = collectionId;
    junction.ArtifactVersionID = versionId;
    junction.Sequence = 0;
    const ok = await junction.Save();
    if (!ok) throw new Error(junction.LatestResult?.CompleteMessage || 'Failed to add artifact to collection');
  }

  private async removeVersionFromCollection(rv: RunView, versionId: string, collectionId: string): Promise<void> {
    const rows = await rv.RunView<MJCollectionArtifactEntity>({
      EntityName: 'MJ: Collection Artifacts',
      ExtraFilter: `CollectionID='${collectionId}' AND ArtifactVersionID='${versionId}'`,
      ResultType: 'entity_object'
    }, this.currentUser);
    if (rows.Success && rows.Results) {
      for (const row of rows.Results) await row.Delete();
    }
  }

  private async reparentCollection(collectionId: string, newParentId: string | null): Promise<void> {
    const p = this.ProviderToUse;
    const collection = await p.GetEntityObject<MJCollectionEntity>('MJ: Collections', this.currentUser);
    await collection.Load(collectionId);
    collection.ParentID = newParentId;
    const ok = await collection.Save();
    if (!ok) throw new Error(collection.LatestResult?.CompleteMessage || 'Failed to move folder');
  }

  // ============================================================
  //  All-collections cache (navigator + cycle checks + bulk move)
  // ============================================================

  public async loadAllCollections(bypassCache: boolean = false): Promise<void> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const ownerFilter = `OwnerID='${this.currentUser.ID}'`;
    const permissionSubquery = `ID IN (
      SELECT CollectionID FROM [__mj].[vwCollectionPermissions] WHERE UserID='${this.currentUser.ID}'
    )`;
    const filter = `EnvironmentID='${this.environmentId}' AND (OwnerID IS NULL OR ${ownerFilter} OR ${permissionSubquery})`;
    const result = await rv.RunView<MJCollectionEntity>({
      EntityName: 'MJ: Collections',
      ExtraFilter: filter,
      OrderBy: 'Name ASC',
      MaxRows: 1000,
      ResultType: 'entity_object',
      BypassCache: bypassCache
    }, this.currentUser);
    this.allCollections = result.Success ? (result.Results || []) : [];
    this.allCollectionsById = new Map(this.allCollections.map(c => [NormalizeUUID(c.ID), c]));
    this.navigatorNodes = this.flattenCollectionTree(this.allCollections);
    this.cdr.detectChanges();
  }

  public toggleNavigator(): void {
    this.showNavigator = !this.showNavigator;
  }

  public navigatorClick(collection: MJCollectionEntity): void {
    void this.navigateToCollectionById(collection.ID);
  }

  public isCurrentNavigator(collection: MJCollectionEntity): boolean {
    return !!this.currentCollectionId && UUIDsEqual(collection.ID, this.currentCollectionId);
  }

  public onNavigatorDragOver(collection: MJCollectionEntity, event: DragEvent): void {
    if (this.draggedItemIds.length === 0 || this.draggedItemIds.includes(collection.ID)) return;
    if (!this.canDropOnCollection(collection.ID)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverTargetId = 'nav:' + collection.ID;
  }

  public onNavigatorDrop(collection: MJCollectionEntity, event: DragEvent): void {
    event.preventDefault();
    this.dragOverTargetId = null;
    void this.moveDraggedItemsTo(collection.ID);
  }

  public onDragLeave(tag: string): void {
    if (this.dragOverTargetId === tag) this.dragOverTargetId = null;
  }

  // ============================================================
  //  Bulk "Move to…" (#3)
  // ============================================================

  public openBulkMove(event: Event): void {
    event.stopPropagation();
    if (this.navigatorNodes.length === 0) void this.loadAllCollections();
    this.showBulkMovePopover = true;
  }

  public closeBulkMove(): void {
    this.showBulkMovePopover = false;
  }

  public async bulkMoveTo(collection: MJCollectionEntity): Promise<void> {
    const items = this.unifiedItems.filter(i => this.selectedItems.has(i.id));
    this.showBulkMovePopover = false;
    await this.moveItemsTo(items, collection.ID, this.currentCollectionId);
  }

  // ============================================================
  //  Staging shelf (#5)
  // ============================================================

  public stageSelected(): void {
    const items = this.unifiedItems.filter(i => this.selectedItems.has(i.id));
    for (const it of items) {
      if (!this.shelf.some(s => s.item.id === it.id)) {
        this.shelf.push({ item: it, sourceCollectionId: this.currentCollectionId });
      }
    }
    this.clearSelection();
    this.cdr.detectChanges();
  }

  public removeFromShelf(id: string): void {
    this.shelf = this.shelf.filter(s => s.item.id !== id);
    this.cdr.detectChanges();
  }

  public clearShelf(): void {
    this.shelf = [];
    this.cdr.detectChanges();
  }

  /** Moves all staged items into the currently-open collection. */
  public async dropShelfHere(): Promise<void> {
    if (this.shelf.length === 0 || !this.currentCollectionId) return;
    const target = this.currentCollectionId;
    try {
      const p = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(p);
      for (const entry of this.shelf) {
        const it = entry.item;
        if (it.type === 'artifact' && it.version) {
          if (entry.sourceCollectionId && UUIDsEqual(entry.sourceCollectionId, target)) continue;
          await this.addVersionToCollection(p, rv, it.version.ID, target);
          if (entry.sourceCollectionId) {
            await this.removeVersionFromCollection(rv, it.version.ID, entry.sourceCollectionId);
          }
        } else if (it.type === 'folder' && it.collection) {
          const fid = it.collection.ID;
          if (UUIDsEqual(fid, target) || this.isCollectionDescendant(target, fid)) continue;
          await this.reparentCollection(fid, target);
        }
      }
      this.shelf = [];
      await this.loadCollections(true);
      await this.loadArtifacts(true);
      await this.loadAllCollections(true);
      this.buildUnifiedItemList();
    } catch (error) {
      console.error('Error moving staged items:', error);
      await this.dialogService.alert('Error', 'Failed to move staged items. Please try again.');
    }
  }
}
