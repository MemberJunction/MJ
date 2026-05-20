import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy, ElementRef, HostListener } from '@angular/core';
import { RegisterClass , UUIDsEqual, MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJListCategoryEntity } from '@memberjunction/core-entities';
import { MJListEntity, MJListDetailEntity, MJUserFavoriteEntity } from '@memberjunction/core-entities';
import { BaseEntity, BaseEntityEvent, Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TabService } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ListSharingService, ListSharingSummary, ListShareDialogConfig, ListShareDialogResult } from '@memberjunction/ng-list-management';
import { capabilitiesForLevel, ListSharing, type ListCapabilities, type SharePermissionLevel } from '@memberjunction/lists';
interface BrowseListItem {
  list: MJListEntity;
  itemCount: number;
  entityName: string;
  ownerName: string;
  isOwner: boolean;
  sharingInfo?: ListSharingSummary;
}

interface CategoryNode {
  category: MJListCategoryEntity | null;
  lists: BrowseListItem[];
  children: CategoryNode[];
  isExpanded: boolean;
}

type ViewMode = 'table' | 'card' | 'hierarchy';

@RegisterClass(BaseResourceComponent, 'ListsBrowseResource')
@Component({
  standalone: false,
  selector: 'mj-lists-browse-resource',
  template: `
    <div class="lists-browse-container">
      <!-- Header -->
      <div class="browse-header">
        <div class="header-row">
          <div class="header-title">
            <i class="fa-solid fa-list-check"></i>
            <h2>Lists</h2>
          </div>
          <button class="btn-create" (click)="createNewList()">
            <i class="fa-solid fa-plus"></i>
            <span>New List</span>
          </button>
        </div>
    
        <div class="header-actions">
          <div class="search-box">
            <i class="fa-solid fa-search"></i>
            <input
              type="text"
              placeholder="Search lists..."
              [(ngModel)]="searchTerm"
              (ngModelChange)="onSearchChange($event)" />
            @if (searchTerm) {
              <button class="clear-search" (click)="clearSearch()">
                <i class="fa-solid fa-times"></i>
              </button>
            }
          </div>
    
          <div class="filter-group">
            <select
              [(ngModel)]="selectedOwner"
              (ngModelChange)="onOwnerFilterChange($event)"
              class="filter-select"
              title="Filter by owner">
              @for (opt of ownerOptions; track opt) {
                <option [value]="opt.value">{{opt.name}}</option>
              }
            </select>
          </div>
    
          <div class="filter-group">
            <select
              [(ngModel)]="selectedEntity"
              (ngModelChange)="onEntityFilterChange($event)"
              class="filter-select"
              title="Filter by entity">
              @for (opt of entityOptions; track opt) {
                <option [value]="opt.value">{{opt.name}}</option>
              }
            </select>
          </div>
    
          <!-- Favorites-only toggle (Phase 5.3). Lives next to the view
               toggle group so it reads as "filter scope" alongside view mode. -->
          <button
            class="favorite-filter-toggle"
            [class.favorite-filter-toggle--active]="showOnlyFavorites"
            (click)="toggleShowOnlyFavorites()"
            [title]="showOnlyFavorites ? 'Showing favorites only' : 'Show all lists'">
            <i [class]="showOnlyFavorites ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
            Favorites
          </button>

          <div class="view-toggle-group">
            <button
              class="view-toggle"
              [class.active]="viewMode === 'table'"
              (click)="setViewMode('table')"
              title="Table view">
              <i class="fa-solid fa-table-list"></i>
            </button>
            <button
              class="view-toggle"
              [class.active]="viewMode === 'card'"
              (click)="setViewMode('card')"
              title="Card view">
              <i class="fa-solid fa-grip"></i>
            </button>
            <button
              class="view-toggle"
              [class.active]="viewMode === 'hierarchy'"
              (click)="setViewMode('hierarchy')"
              title="Category view">
              <i class="fa-solid fa-folder-tree"></i>
            </button>
          </div>
        </div>
      </div>
    
      <!-- Active tag filters (Phase 4.3). Renders only when at least one
           tag is active — multi-tag = AND. Clicking a chip's × removes it. -->
      @if (tagFilters.length > 0) {
        <div class="tag-filter-row">
          <span class="tag-filter-row__label">
            <i class="fa-solid fa-tag"></i>
            Filtering by tag:
          </span>
          @for (f of tagFilters; track f.TagID) {
            <button
              class="tag-filter-chip"
              type="button"
              (click)="removeTagFilter(f.TagID)">
              {{ f.Name }}
              <i class="fa-solid fa-xmark"></i>
            </button>
          }
          <button class="tag-filter-row__clear" type="button" (click)="clearTagFilters()">
            Clear all
          </button>
        </div>
      }

      <!-- Loading State -->
      @if (isLoading) {
        <div class="loading-container">
          <mj-loading text="Loading lists..." size="medium"></mj-loading>
        </div>
      }

      <!-- Empty State - No Lists -->
      @if (!isLoading && allLists.length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon-wrapper">
            <div class="icon-bg"></div>
            <i class="fa-solid fa-list-check"></i>
          </div>
          <h3>No Lists Yet</h3>
          <p>Lists help you organize and track groups of records across your data.</p>
          <div class="empty-state-features">
            <div class="feature-item">
              <i class="fa-solid fa-check-circle"></i>
              <span>Group records from any entity</span>
            </div>
            <div class="feature-item">
              <i class="fa-solid fa-check-circle"></i>
              <span>Organize with categories</span>
            </div>
            <div class="feature-item">
              <i class="fa-solid fa-check-circle"></i>
              <span>Quick access from any view</span>
            </div>
          </div>
          <button class="btn-create-large" (click)="createNewList()">
            <i class="fa-solid fa-plus"></i>
            Create Your First List
          </button>
        </div>
      }
    
      <!-- Empty State - No Results -->
      @if (!isLoading && allLists.length > 0 && filteredLists.length === 0) {
        <div class="empty-state search-empty">
          <div class="empty-state-icon-wrapper search">
            <i class="fa-solid fa-filter-circle-xmark"></i>
          </div>
          <h3>No Results Found</h3>
          <p>No lists match your current filters.</p>
          <p class="empty-hint">Try adjusting your search or filters.</p>
          <button class="btn-clear" (click)="clearFilters()">Clear All Filters</button>
        </div>
      }
    
      <!-- Results Content -->
      @if (!isLoading && filteredLists.length > 0) {
        <div class="browse-content">
          <div class="results-header">
            <span class="result-count">{{filteredLists.length}} list{{filteredLists.length !== 1 ? 's' : ''}}</span>
            <div class="sort-options">
              <label>Sort:</label>
              <select
                [(ngModel)]="selectedSort"
                (ngModelChange)="onSortChange($event)"
                class="filter-select sort-select">
                @for (opt of sortOptions; track opt) {
                  <option [value]="opt.value">{{opt.name}}</option>
                }
              </select>
            </div>
          </div>
          <!-- Table View -->
          @if (viewMode === 'table') {
            <div class="lists-table">
              <table role="grid" aria-label="Lists table">
                <thead>
                  <tr>
                    <th class="col-name" scope="col">Name</th>
                    <th class="col-entity" scope="col">Entity</th>
                    <th class="col-items" scope="col">Items</th>
                    <th class="col-sharing" scope="col">Shared</th>
                    <th class="col-owner" scope="col">Owner</th>
                    <th class="col-updated" scope="col">Updated</th>
                    <th class="col-actions" scope="col"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of filteredLists; track item) {
                    <tr
                      (click)="openList(item)"
                      (keydown.enter)="openList(item)"
                      class="list-row"
                      tabindex="0"
                      role="row">
                      <td class="col-name" role="gridcell">
                        <div class="name-cell">
                          <div class="list-icon" [style.background-color]="getEntityColor(item.entityName)" aria-hidden="true">
                            <i [class]="getEntityIcon(item.entityName)"></i>
                          </div>
                          <div class="name-content">
                            <span class="list-name">{{item.list.Name}}</span>
                            @if (item.list.Description) {
                              <span class="list-desc">{{item.list.Description}}</span>
                            }
                          </div>
                        </div>
                      </td>
                      <td class="col-entity" role="gridcell">
                        <span class="entity-badge">{{item.entityName}}</span>
                      </td>
                      <td class="col-items" role="gridcell">{{item.itemCount}}</td>
                      <td class="col-sharing" role="gridcell">
                        @if (item.sharingInfo; as sharing) {
                          @if (sharing.totalShares > 0) {
                            <span class="sharing-indicator">
                              <i class="fa-solid fa-share-nodes"></i>
                              <span class="share-count">{{sharing.totalShares}}</span>
                            </span>
                          }
                          @if (sharing.totalShares === 0) {
                            <span class="sharing-private">
                              <i class="fa-solid fa-lock"></i>
                            </span>
                          }
                        }
                        @if (!item.sharingInfo) {
                          <span class="sharing-private">
                            <i class="fa-solid fa-lock"></i>
                          </span>
                        }
                      </td>
                      <td class="col-owner" role="gridcell">
                        <span class="owner-name" [class.is-me]="item.isOwner">
                          {{item.isOwner ? 'You' : item.ownerName}}
                        </span>
                      </td>
                      <td class="col-updated" role="gridcell">{{formatDate(item.list.__mj_UpdatedAt)}}</td>
                      <td class="col-actions" role="gridcell">
                        <button mjButton
                          variant="flat"
                          size="sm"
                          (click)="openListMenu($event, item)"
                          title="More options">
                          <i class="fa-solid fa-ellipsis-v" aria-hidden="true"></i>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <!-- Card View -->
          @if (viewMode === 'card') {
            <div class="lists-grid" role="list" aria-label="Lists">
              @for (item of filteredLists; track item) {
                <div
                  class="list-card"
                  (click)="openList(item)"
                  (keydown.enter)="openList(item)"
                  tabindex="0"
                  role="listitem">
                  <div class="card-header">
                    <div class="card-icon" [style.background-color]="getEntityColor(item.entityName)" aria-hidden="true">
                      <i [class]="getEntityIcon(item.entityName)"></i>
                    </div>
                    <button
                      class="favorite-btn"
                      [class.favorite-btn--active]="isFavorite(item.list.ID)"
                      (click)="toggleFavorite($event, item)"
                      [title]="isFavorite(item.list.ID) ? 'Remove from favorites' : 'Add to favorites'">
                      <i [class]="isFavorite(item.list.ID) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
                    </button>
                    <div class="card-menu">
                      <button class="menu-btn" (click)="openListMenu($event, item)">
                        <i class="fa-solid fa-ellipsis-v" aria-hidden="true"></i>
                      </button>
                    </div>
                  </div>
                  <div class="card-body">
                    <h3 class="card-title">{{item.list.Name}}</h3>
                    @if (item.list.Description) {
                      <p class="card-description">{{item.list.Description}}</p>
                    }
                    <div class="card-meta">
                      <span class="meta-item">
                        <i class="fa-solid fa-database"></i>
                        {{item.entityName}}
                      </span>
                      <span class="meta-item">
                        <i class="fa-solid fa-hashtag"></i>
                        {{item.itemCount}} item{{item.itemCount !== 1 ? 's' : ''}}
                      </span>
                    </div>
                    <!-- Tag chips (Phase 4). Read-only on cards; click adds the
                         tag to the filter row above. We stop propagation on
                         the wrapper so clicks on chips don't also fire the
                         card's openList handler. -->
                    <div class="card-tags" (click)="$event.stopPropagation()">
                      <mj-tag-chips
                        [Provider]="Provider"
                        EntityName="MJ: Lists"
                        [RecordID]="item.list.ID"
                        [Editable]="false"
                        [MaxDisplay]="3"
                        (TagClicked)="onCardTagClicked($event)">
                      </mj-tag-chips>
                    </div>
                  </div>
                  <div class="card-footer">
                    <span class="owner-tag" [class.is-me]="item.isOwner">
                      <i class="fa-solid fa-user"></i>
                      {{item.isOwner ? 'You' : item.ownerName}}
                    </span>
                    <div class="card-footer-right">
                      @if (item.sharingInfo; as sharing) {
                        @if (sharing.totalShares > 0) {
                          <span class="sharing-badge" [title]="'Shared with ' + sharing.totalShares + ' user(s)/role(s)'">
                            <i class="fa-solid fa-share-nodes"></i>
                          </span>
                        }
                      }
                      <span class="date-info">{{formatDate(item.list.__mj_UpdatedAt)}}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
          <!-- Hierarchy View -->
          @if (viewMode === 'hierarchy') {
            <div class="category-tree">
              @for (node of categoryTree; track node) {
                <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { node: node, depth: 0 }"></ng-container>
              }
            </div>
          }
        </div>
      }
    
      <!-- Category Node Template -->
      <ng-template #categoryNodeTemplate let-node="node" let-depth="depth">
        <div class="category-section" [style.margin-left.px]="depth * 20">
          <!-- Category Header -->
          @if (node.category) {
            <div
              class="category-header"
              (click)="toggleCategory(node)">
              <i [class]="node.isExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"></i>
              <i class="fa-solid fa-folder" [class.fa-folder-open]="node.isExpanded"></i>
              <span class="category-name">{{node.category.Name}}</span>
              <span class="category-count">{{getListCountInCategory(node)}}</span>
            </div>
          }
    
          <!-- Uncategorized Header -->
          @if (!node.category && node.lists.length > 0) {
            <div
              class="category-header uncategorized"
              (click)="toggleCategory(node)">
              <i [class]="node.isExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"></i>
              <i class="fa-solid fa-inbox"></i>
              <span class="category-name">Uncategorized</span>
              <span class="category-count">{{node.lists.length}}</span>
            </div>
          }
    
          <!-- Lists in this category -->
          @if (node.isExpanded) {
            <div class="category-lists" role="list">
              @for (item of node.lists; track item) {
                <div
                  class="list-row hierarchy-row"
                  (click)="openList(item)"
                  (keydown.enter)="openList(item)"
                  tabindex="0"
                  role="listitem">
                  <div class="list-icon" [style.background-color]="getEntityColor(item.entityName)" aria-hidden="true">
                    <i [class]="getEntityIcon(item.entityName)"></i>
                  </div>
                  <div class="list-info">
                    <span class="list-name">{{item.list.Name}}</span>
                    <span class="list-meta">
                      {{item.entityName}} &middot; {{item.itemCount}} items
                      @if (!item.isOwner) {
                        <span> &middot; {{item.ownerName}}</span>
                      }
                    </span>
                  </div>
                  <div class="list-actions">
                    <button mjButton variant="flat" size="sm" (click)="openListMenu($event, item)">
                      <i class="fa-solid fa-ellipsis-v" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              }
            </div>
          }
    
          <!-- Child categories -->
          @if (node.isExpanded) {
            @for (child of node.children; track child) {
              <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { node: child, depth: depth + 1 }"></ng-container>
            }
          }
        </div>
      </ng-template>
    
      <!-- Context Menu (Phase 2.8 viewer-perspective gating).
           Items shown depend on contextItemCapabilities, resolved lazily
           on menu open. Viewers (no Edit/Share/Delete) still see
           Duplicate. Server-side enforcement remains source of truth;
           hiding is just UX so users don't see buttons that would fail. -->
      @if (showContextMenu) {
        <div class="context-menu-overlay" (click)="closeContextMenu()"></div>
      }
      @if (showContextMenu) {
        <div class="context-menu" [style.top.px]="contextMenuY" [style.left.px]="contextMenuX">
          @if (contextItemCapabilities.CanEdit) {
            <button class="menu-item" (click)="editList()">
              <i class="fa-solid fa-pen"></i>
              Edit
            </button>
          }
          @if (contextItemCapabilities.CanShare) {
            <button class="menu-item" (click)="openShareDialog()">
              <i class="fa-solid fa-share-nodes"></i>
              Share
            </button>
          }
          <button class="menu-item" (click)="duplicateList()">
            <i class="fa-solid fa-copy"></i>
            Duplicate
          </button>
          @if (contextItemCapabilities.CanDelete) {
            <div class="menu-divider"></div>
            <button class="menu-item danger" (click)="confirmDeleteList()">
              <i class="fa-solid fa-trash"></i>
              Delete
            </button>
          }
          @if (!contextItemCapabilities.CanEdit && !contextItemCapabilities.CanShare && !contextItemCapabilities.CanDelete) {
            <div class="menu-viewer-hint">
              <i class="fa-solid fa-eye"></i>
              Viewer access — read only
            </div>
          }
        </div>
      }
    
      <!-- Create/Edit Dialog -->
      @if (showCreateDialog) {
        <div class="modal-overlay" (click)="closeCreateDialog()"></div>
      }
      @if (showCreateDialog) {
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>{{editingList ? 'Edit List' : 'Create New List'}}</h3>
            <button class="modal-close" (click)="closeCreateDialog()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Name *</label>
              <input
                type="text"
                [(ngModel)]="newListName"
                placeholder="Enter list name"
                class="form-input" />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea
                [(ngModel)]="newListDescription"
                placeholder="Optional description"
                class="form-input"
              rows="3"></textarea>
            </div>
            @if (!editingList) {
              <div class="form-group">
                <label>Entity *</label>
                <div class="custom-select-wrapper">
                  <input
                    #entityInput
                    type="text"
                    [(ngModel)]="entitySearchTerm"
                    (ngModelChange)="filterEntities($event)"
                    (focus)="openEntityDropdown(entityInput)"
                    placeholder="Search and select an entity"
                    class="form-input" />
                </div>
              </div>
            }
            @if (editingList) {
              <div class="form-group">
                <label>Entity</label>
                <input type="text" [value]="entitySearchTerm" class="form-input" disabled />
              </div>
            }
            <div class="form-group">
              <label>Category</label>
              <select [(ngModel)]="selectedCategoryId" class="form-input">
                <option [ngValue]="null">No category</option>
                @for (cat of flatCategories; track cat) {
                  <option [ngValue]="cat.ID">{{cat.displayName}}</option>
                }
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button
              class="btn-primary"
              (click)="saveList()"
              [disabled]="!newListName || (!editingList && !selectedEntityId) || isSaving">
              @if (isSaving) {
                <i class="fa-solid fa-spinner fa-spin"></i>
              }
              {{isSaving ? 'Saving...' : (editingList ? 'Save' : 'Create')}}
            </button>
            <button class="btn-secondary" (click)="closeCreateDialog()" [disabled]="isSaving">Cancel</button>
          </div>
        </div>
      }
    
      <!-- Delete Confirmation Dialog -->
      @if (showDeleteConfirm) {
        <div class="modal-overlay" (click)="cancelDelete()"></div>
      }
      @if (showDeleteConfirm) {
        <div class="modal-dialog confirm-dialog">
          <div class="modal-header">
            <h3>Delete List</h3>
            <button class="modal-close" (click)="cancelDelete()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete "<strong>{{deleteListName}}</strong>"?</p>
            <p class="warning-text">This will also remove all items in the list.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-danger" (click)="deleteList()" [disabled]="isDeleting">
              @if (isDeleting) {
                <i class="fa-solid fa-spinner fa-spin"></i>
              }
              {{isDeleting ? 'Deleting...' : 'Delete'}}
            </button>
            <button class="btn-secondary" (click)="cancelDelete()" [disabled]="isDeleting">Cancel</button>
          </div>
        </div>
      }
    
      <!-- Share Dialog -->
      @if (shareDialogConfig) {
        <mj-list-share-dialog
          [config]="shareDialogConfig"
          [visible]="showShareDialog"
          (complete)="onShareComplete($event)"
          (cancel)="onShareCancel()"
          (manageInvitations)="onManageInvitations()"
          (viewAuditLog)="onViewAuditLog()">
        </mj-list-share-dialog>
      }

      <!-- Invitations Dialog (mockup 16) -->
      @if (showInvitationsDialog && activeShareListId) {
        <mj-dialog
          [Visible]="true"
          [Title]="'Invitations — ' + (activeShareListName ?? 'List')"
          (Close)="closeInvitationsDialog()"
          [MinWidth]="640"
          [Width]="900"
          [Height]="640">
          <div class="dialog-content">
            <mj-list-invitations
              [Provider]="ProviderToUse"
              [ListID]="activeShareListId"
              [ListName]="activeShareListName">
            </mj-list-invitations>
          </div>
          <mj-dialog-actions>
            <button mjButton (click)="closeInvitationsDialog()" variant="outline">Close</button>
          </mj-dialog-actions>
        </mj-dialog>
      }

      <!-- Audit Log Dialog (mockup 18) -->
      @if (showAuditLogDialog && activeShareListId) {
        <mj-dialog
          [Visible]="true"
          [Title]="'Audit Log — ' + (activeShareListName ?? 'List')"
          (Close)="closeAuditLogDialog()"
          [MinWidth]="720"
          [Width]="980"
          [Height]="680">
          <div class="dialog-content">
            <mj-list-audit-log
              [Provider]="ProviderToUse"
              [ListID]="activeShareListId">
            </mj-list-audit-log>
          </div>
          <mj-dialog-actions>
            <button mjButton (click)="closeAuditLogDialog()" variant="outline">Close</button>
          </mj-dialog-actions>
        </mj-dialog>
      }
    
      <!-- Entity Dropdown Portal -->
      @if (showEntityDropdown && !editingList) {
        <div
          class="entity-dropdown-portal"
          [style.top.px]="entityDropdownPosition.top"
          [style.left.px]="entityDropdownPosition.left"
          [style.width.px]="entityDropdownPosition.width"
          [class.dropdown-above]="entityDropdownPosition.openAbove">
          <div class="entity-dropdown-content" [class.open-above]="entityDropdownPosition.openAbove">
            @for (entity of filteredEntitiesList; track entity) {
              <div
                class="dropdown-item"
                (mousedown)="selectEntity(entity); $event.preventDefault()">
                {{entity.Name}}
              </div>
            }
            @if (filteredEntitiesList.length === 0) {
              <div class="dropdown-empty">
                No entities found
              </div>
            }
          </div>
        </div>
      }
    </div>
    `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .lists-browse-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-surface);
      overflow: hidden;
    }

    /* Header */
    .browse-header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 24px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-title i {
      font-size: 24px;
      color: var(--mj-brand-primary);
    }

    .header-title h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 200px;
      max-width: 300px;
    }

    .search-box i.fa-search {
      position: absolute;
      left: 12px;
      color: var(--mj-text-muted);
    }

    .search-box input {
      padding: 8px 36px;
      border: 1px solid var(--mj-border-default);
      border-radius: 20px;
      font-size: 14px;
      width: 100%;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .search-box input:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    }

    .clear-search {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: var(--mj-text-muted);
      cursor: pointer;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .filter-group label {
      font-size: 13px;
      color: var(--mj-text-secondary);
    }

    .filter-select {
      padding: 8px 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 14px;
      background: var(--mj-bg-surface-card);
      cursor: pointer;
      min-width: 120px;
    }

    .filter-select:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    }

    .sort-select {
      min-width: 140px;
    }

    .view-toggle-group {
      display: flex;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      overflow: hidden;
    }

    .view-toggle {
      padding: 8px 12px;
      background: var(--mj-bg-surface-card);
      border: none;
      border-right: 1px solid var(--mj-border-default);
      color: var(--mj-text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .view-toggle:last-child {
      border-right: none;
    }

    .view-toggle:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .view-toggle.active {
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
    }

    .btn-create {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-create:hover {
      background: var(--mj-brand-primary-hover);
    }

    /* Loading */
    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 48px 40px;
      text-align: center;
      max-width: 480px;
      margin: 0 auto;
    }

    .empty-state-icon-wrapper {
      position: relative;
      margin-bottom: 24px;
    }

    .empty-state-icon-wrapper .icon-bg {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
    }

    .empty-state-icon-wrapper > i {
      position: relative;
      font-size: 56px;
      color: var(--mj-brand-primary);
      z-index: 1;
    }

    .empty-state-icon-wrapper.search > i {
      font-size: 48px;
      color: var(--mj-text-disabled);
    }

    .empty-state h3 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .empty-state p {
      margin: 0 0 8px;
      color: var(--mj-text-secondary);
      font-size: 15px;
      line-height: 1.5;
    }

    .empty-state p:last-of-type {
      margin-bottom: 24px;
    }

    .empty-hint {
      color: var(--mj-text-muted) !important;
      font-size: 13px !important;
    }

    .empty-state-features {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 28px;
      text-align: left;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: var(--mj-text-secondary);
    }

    .feature-item i {
      font-size: 14px !important;
      color: var(--mj-status-success) !important;
    }

    .btn-create-large {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 28px;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 8px color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
    }

    .btn-create-large:hover {
      background: var(--mj-brand-primary-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--mj-brand-primary) 40%, transparent);
    }

    .btn-clear {
      padding: 10px 20px;
      background: var(--mj-bg-surface-sunken);
      border: none;
      border-radius: 6px;
      color: var(--mj-text-secondary);
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-clear:hover {
      background: var(--mj-border-default);
    }

    /* Content */
    .browse-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .result-count {
      font-size: 14px;
      color: var(--mj-text-secondary);
    }

    .sort-options {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sort-options label {
      font-size: 13px;
      color: var(--mj-text-secondary);
    }

    /* Table View */
    .lists-table {
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: var(--mj-shadow-sm);
    }

    .lists-table table {
      width: 100%;
      border-collapse: collapse;
    }

    .lists-table th {
      text-align: left;
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: var(--mj-bg-surface-sunken);
      border-bottom: 1px solid var(--mj-border-default);
    }

    .lists-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--mj-border-default);
      font-size: 14px;
      color: var(--mj-text-primary);
    }

    .list-row {
      cursor: pointer;
      transition: background 0.15s;
      outline: none;
    }

    .list-row:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .list-row:focus {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
    }

    .list-row:focus-visible {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      box-shadow: inset 3px 0 0 var(--mj-brand-primary);
    }

    .list-row:last-child td {
      border-bottom: none;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .col-name { width: 30%; }
    .col-entity { width: 15%; }
    .col-items { width: 8%; text-align: center; }
    .col-sharing { width: 8%; text-align: center; }
    .col-owner { width: 14%; }
    .col-updated { width: 15%; }
    .col-actions { width: 10%; text-align: right; }

    /* Sharing indicators */
    .sharing-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--mj-brand-primary);
      font-size: 13px;
    }

    .sharing-indicator i {
      font-size: 14px;
    }

    .share-count {
      font-weight: 500;
    }

    .sharing-private {
      color: var(--mj-text-muted);
      font-size: 13px;
    }

    .sharing-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      border-radius: 50%;
      color: var(--mj-brand-primary);
      font-size: 11px;
    }

    .card-footer-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .name-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .list-icon {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-inverse);
      font-size: 14px;
      flex-shrink: 0;
    }

    .name-content {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .list-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .list-desc {
      font-size: 12px;
      color: var(--mj-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .entity-badge {
      display: inline-block;
      padding: 2px 8px;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      border-radius: 4px;
      font-size: 12px;
      color: var(--mj-brand-primary-hover);
    }

    .owner-name {
      color: var(--mj-text-secondary);
    }

    .owner-name.is-me {
      color: var(--mj-brand-primary);
      font-weight: 500;
    }

    .action-btn {
      background: none;
      border: none;
      padding: 6px 10px;
      color: var(--mj-text-muted);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: var(--mj-border-default);
      color: var(--mj-text-secondary);
    }

    /* Card View */
    .lists-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .list-card {
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s, outline 0.1s;
      outline: 2px solid transparent;
    }

    .list-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--mj-shadow-md);
    }

    .list-card:focus {
      outline: 2px solid var(--mj-brand-primary);
      outline-offset: 2px;
    }

    .list-card:focus:not(:focus-visible) {
      outline: none;
    }

    .list-card:focus-visible {
      outline: 2px solid var(--mj-brand-primary);
      outline-offset: 2px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 16px 16px 0;
    }

    .card-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-inverse);
      font-size: 18px;
    }

    .menu-btn {
      background: none;
      border: none;
      padding: 4px 8px;
      color: var(--mj-text-muted);
      cursor: pointer;
      border-radius: 4px;
    }

    .menu-btn:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
    }

    .card-body {
      padding: 12px 16px;
    }

    .card-title {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .card-description {
      margin: 0 0 12px;
      font-size: 13px;
      color: var(--mj-text-secondary);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-meta {
      display: flex;
      gap: 16px;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    /* Tag chips on a card. Stop-propagation is set on the wrapper so
       clicks on chips don't open the underlying list. */
    .card-tags {
      margin-top: 8px;
    }

    /* Favorite star on cards (Phase 5.3). */
    .favorite-btn {
      background: none;
      border: none;
      padding: 4px;
      margin: -4px;
      cursor: pointer;
      color: var(--mj-text-muted);
      font-size: 14px;
      border-radius: 4px;
      transition: color 0.12s ease, background 0.12s ease;
    }

    .favorite-btn:hover {
      background: var(--mj-bg-surface-card);
      color: var(--mj-status-warning);
    }

    .favorite-btn--active {
      color: var(--mj-status-warning);
    }

    /* Favorites-only toggle in the toolbar. */
    .favorite-filter-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: none;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 12.5px;
      color: var(--mj-text-secondary);
      cursor: pointer;
    }

    .favorite-filter-toggle:hover {
      border-color: var(--mj-status-warning);
      color: var(--mj-status-warning);
    }

    .favorite-filter-toggle--active {
      background: color-mix(in srgb, var(--mj-status-warning) 12%, var(--mj-bg-surface));
      border-color: var(--mj-status-warning);
      color: var(--mj-status-warning);
      font-weight: 600;
    }

    /* Active-tag filter row above the grid (Phase 4.3). */
    .tag-filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      background: var(--mj-bg-surface-sunken);
      border: 1px dashed var(--mj-border-default);
      border-radius: 8px;
      font-size: 12.5px;
    }

    .tag-filter-row__label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--mj-text-muted);
      font-weight: 500;
    }

    .tag-filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
      border: 1px solid var(--mj-brand-primary);
      font-size: 11.5px;
      cursor: pointer;
    }

    .tag-filter-chip:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-bg-surface));
    }

    .tag-filter-row__clear {
      background: none;
      border: none;
      color: var(--mj-text-link);
      font-size: 11.5px;
      cursor: pointer;
      margin-left: auto;
    }

    .tag-filter-row__clear:hover {
      text-decoration: underline;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
    }

    .owner-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--mj-text-secondary);
    }

    .owner-tag.is-me {
      color: var(--mj-brand-primary);
    }

    .date-info {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    /* Hierarchy View */
    .category-tree {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .category-section {
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      overflow: hidden;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .category-header:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .category-header i:first-child {
      width: 16px;
      text-align: center;
      color: var(--mj-text-muted);
    }

    .category-header .fa-folder,
    .category-header .fa-folder-open {
      color: var(--mj-status-warning);
    }

    .category-header.uncategorized .fa-inbox {
      color: var(--mj-text-muted);
    }

    .category-name {
      flex: 1;
      font-weight: 500;
      color: var(--mj-text-primary);
    }

    .category-count {
      font-size: 12px;
      color: var(--mj-text-muted);
      background: var(--mj-bg-surface-sunken);
      padding: 2px 8px;
      border-radius: 10px;
    }

    .category-lists {
      border-top: 1px solid var(--mj-border-default);
    }

    .hierarchy-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px 12px 40px;
      cursor: pointer;
      transition: background 0.2s;
      outline: none;
    }

    .hierarchy-row:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .hierarchy-row:focus {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
    }

    .hierarchy-row:focus-visible {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      box-shadow: inset 3px 0 0 var(--mj-brand-primary);
    }

    .list-info {
      flex: 1;
      min-width: 0;
    }

    .list-meta {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .list-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .hierarchy-row:hover .list-actions {
      opacity: 1;
    }

    /* Context Menu */
    .context-menu-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 999;
    }

    .context-menu {
      position: fixed;
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-md);
      min-width: 160px;
      padding: 4px 0;
      z-index: 1000;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 16px;
      background: none;
      border: none;
      text-align: left;
      font-size: 14px;
      color: var(--mj-text-primary);
      cursor: pointer;
      transition: background 0.15s;
    }

    .menu-item:hover {
      background: var(--mj-bg-surface-sunken);
    }

    .menu-item.danger {
      color: var(--mj-status-error);
    }

    .menu-item.danger:hover {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
    }

    .menu-divider {
      height: 1px;
      background: var(--mj-border-default);
      margin: 4px 0;
    }

    .menu-viewer-hint {
      padding: 10px 14px;
      font-size: 12px;
      color: var(--mj-text-muted);
      display: flex;
      align-items: center;
      gap: 8px;
      font-style: italic;
    }
    .menu-viewer-hint i { color: var(--mj-text-muted); }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--mj-bg-overlay);
      z-index: 1000;
    }

    .modal-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--mj-bg-surface-card);
      border-radius: 12px;
      box-shadow: var(--mj-shadow-lg);
      width: 500px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
      z-index: 1001;
    }

    .confirm-dialog {
      width: 400px;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--mj-border-default);
    }

    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .modal-close {
      background: none;
      border: none;
      padding: 4px 8px;
      color: var(--mj-text-muted);
      cursor: pointer;
      border-radius: 4px;
    }

    .modal-close:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
    }

    .modal-body {
      padding: 20px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .modal-body p {
      margin: 0 0 8px;
      color: var(--mj-text-primary);
    }

    .warning-text {
      color: var(--mj-status-error) !important;
      font-size: 13px;
    }

    .modal-footer {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      padding: 10px 20px;
      background: var(--mj-bg-surface-card);
      color: var(--mj-text-secondary);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-secondary:hover:not(:disabled) {
      background: var(--mj-bg-surface-sunken);
    }

    .btn-danger {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: var(--mj-status-error);
      color: var(--mj-text-inverse);
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-danger:hover:not(:disabled) {
      background: color-mix(in srgb, var(--mj-status-error) 85%, black);
    }

    /* Form Styles */
    .form-group {
      margin-bottom: 16px;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-secondary);
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    }

    .form-input:disabled {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-muted);
    }

    textarea.form-input {
      resize: vertical;
      min-height: 80px;
    }

    select.form-input {
      cursor: pointer;
    }

    .custom-select-wrapper {
      position: relative;
    }

    /* Portal Dropdown */
    .entity-dropdown-portal {
      position: fixed;
      z-index: 10002;
    }

    .entity-dropdown-content {
      max-height: 200px;
      overflow-y: auto;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      box-shadow: var(--mj-shadow-md);
    }

    .entity-dropdown-content.open-above {
      position: absolute;
      bottom: 0;
    }

    .dropdown-item {
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.15s;
      font-size: 14px;
      color: var(--mj-text-primary);
    }

    .dropdown-item:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
    }

    .dropdown-item:first-child {
      border-radius: 6px 6px 0 0;
    }

    .dropdown-item:last-child {
      border-radius: 0 0 6px 6px;
    }

    .dropdown-empty {
      padding: 10px 12px;
      color: var(--mj-text-muted);
      font-style: italic;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .header-row {
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
      }

      .btn-create {
        width: 100%;
        justify-content: center;
      }

      .header-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .search-box {
        max-width: none;
      }

      .filter-group {
        width: 100%;
      }

      .filter-select {
        flex: 1;
        width: 100%;
      }

      .view-toggle-group {
        justify-content: center;
      }

      .lists-table {
        overflow-x: auto;
      }

      .col-entity, .col-items, .col-updated {
        display: none;
      }

      .lists-grid {
        grid-template-columns: 1fr;
      }

      .modal-dialog {
        width: 95vw;
      }
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ListsBrowseResource extends BaseResourceComponent implements OnDestroy {
  protected override destroy$ = new Subject<void>();

  isLoading = true;
  searchTerm = '';
  viewMode: ViewMode = 'card';
  selectedEntity = 'all';
  selectedOwner = 'mine';
  selectedSort = 'name';

  /**
   * Active tag filters (Phase 4.3). Multi-tag = AND — a list must have
   * every active tag to appear. URL state mirrors this via the `tags`
   * query param (comma-separated tag IDs).
   */
  tagFilters: Array<{ TagID: string; Name: string }> = [];

  /**
   * Set of List IDs that match the current `tagFilters` (intersection).
   * `null` means "no tag filter active" — pass-through. Populated by
   * `recomputeTagMembership` whenever `tagFilters` changes; consumed by
   * `applyFilters` to narrow the visible list.
   */
  private tagFilteredListIds: Set<string> | null = null;

  /**
   * Favorite-list IDs for the current user (Phase 5.3). Backed by the
   * existing `MJ: User Favorites` entity. `null` while loading; a Set
   * once populated so card-side toggling is O(1).
   */
  favoriteListIds: Set<string> = new Set();

  /** When true, only favorited lists appear in the grid. */
  showOnlyFavorites = false;

  allLists: BrowseListItem[] = [];
  filteredLists: BrowseListItem[] = [];
  categories: MJListCategoryEntity[] = [];
  categoryTree: CategoryNode[] = [];
  flatCategories: Array<{ ID: string; displayName: string }> = [];
  availableEntities: Array<{ ID: string; Name: string }> = [];
  filteredEntitiesList: Array<{ ID: string; Name: string }> = [];

  entityOptions: Array<{ name: string; value: string }> = [{ name: 'All Entities', value: 'all' }];
  ownerOptions: Array<{ name: string; value: string }> = [
    { name: 'My Lists', value: 'mine' },
    { name: 'All Lists', value: 'all' },
    { name: 'Others', value: 'others' }
  ];
  sortOptions: Array<{ name: string; value: string }> = [
    { name: 'Name', value: 'name' },
    { name: 'Recently Updated', value: 'updated' },
    { name: 'Most Items', value: 'items' },
    { name: 'Entity', value: 'entity' }
  ];

  // Context menu state
  showContextMenu = false;
  contextMenuX = 0;
  contextMenuY = 0;
  selectedContextItem: BrowseListItem | null = null;

  // Create/Edit dialog state
  showCreateDialog = false;
  editingList: MJListEntity | null = null;
  newListName = '';
  newListDescription = '';
  selectedEntityId = '';
  selectedCategoryId: string | null = null;
  entitySearchTerm = '';
  showEntityDropdown = false;
  entityDropdownPosition = { top: 0, left: 0, width: 0, openAbove: false };

  // Delete confirmation state
  showDeleteConfirm = false;
  deleteListName = '';
  listToDelete: MJListEntity | null = null;

  // Operation states
  isSaving = false;
  isDeleting = false;

  // Sharing dialog state
  showShareDialog = false;
  shareDialogConfig: ListShareDialogConfig | null = null;

  // Viewer-perspective gating (Phase 2.8). Capabilities are computed
  // lazily when the user opens the context menu — running per-card
  // would mean N permission-resolve calls per browse render. The
  // resolved level is cached on the item so re-opening the same menu
  // doesn't refetch.
  public contextItemCapabilities: ListCapabilities = capabilitiesForLevel('Owner');
  private capabilityCache = new Map<string, SharePermissionLevel | null>();

  // Tracks whether the in-memory categories list is known-stale
  // relative to the DB. Flipped to true by the BaseEntity event
  // subscription whenever any `MJ: List Categories` row is saved or
  // deleted (most often from the Categories tab next door). Reset to
  // false after `refreshCategoriesForDialog` reloads. Initial true so
  // the first dialog open always populates from a fresh fetch.
  private categoriesDirty = true;

  // Invitations / audit log dialogs (mockups 16, 18) — opened from
  // the share dialog. Each dialog binds to a single list at a time,
  // tracked by `activeShareListId`/`activeShareListName` lifted from
  // shareDialogConfig at open time so we keep the context after the
  // share dialog closes.
  showInvitationsDialog = false;
  showAuditLogDialog = false;
  activeShareListId: string | null = null;
  activeShareListName: string | null = null;

  private entityColorMap: Map<string, string> = new Map();
  private entityIconMap: Map<string, string> = new Map();
  private categoryMap: Map<string, MJListCategoryEntity> = new Map();
  private currentUserId = '';

  constructor(
    private cdr: ChangeDetectorRef,
    private tabService: TabService,
    private notificationService: MJNotificationService,
    private elementRef: ElementRef,
    private listSharingService: ListSharingService
  ) {
    super();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.showEntityDropdown) {
      const target = event.target as HTMLElement;
      if (!target.closest('.custom-select-wrapper') && !target.closest('.entity-dropdown-portal')) {
        this.showEntityDropdown = false;
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.showContextMenu) {
      this.closeContextMenu();
    }
    if (this.showCreateDialog) {
      this.closeCreateDialog();
    }
    if (this.showDeleteConfirm) {
      this.cancelDelete();
    }
    if (this.showEntityDropdown) {
      this.closeEntityDropdown();
    }
  }

  async ngOnInit() {
    super.ngOnInit();
    this.subscribeToCategoryChanges();
    await this.loadData();
    this.NotifyLoadComplete();
  }

  /**
   * Mark the in-memory categories list dirty whenever any BaseEntity
   * raises a save / delete event for `MJ: List Categories`. The
   * Create/Edit dialog uses this flag to skip the per-open RunView
   * unless something has actually changed since last load — keeps the
   * dialog snappy without showing stale categories.
   *
   * Subscribes to MJGlobal's event bus rather than wiring each
   * category entity's per-instance listener, because the Categories
   * tab creates fresh BaseEntity instances we can't see from here.
   */
  private subscribeToCategoryChanges(): void {
    MJGlobal.Instance.GetEventListener()
      .pipe(takeUntil(this.destroy$))
      .subscribe((mjEvt) => {
        if (mjEvt.eventCode !== BaseEntity.BaseEventCode) return;
        const beEvt = mjEvt.args as BaseEntityEvent | undefined;
        if (!beEvt) return;
        const entityName = beEvt.baseEntity?.EntityInfo.Name ?? beEvt.entityName;
        if (entityName !== 'MJ: List Categories') return;
        if (beEvt.type === 'save' || beEvt.type === 'delete') {
          this.categoriesDirty = true;
        }
      });
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadData() {
    this.isLoading = true;

    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      this.currentUserId = md.CurrentUser?.ID || '';

      // Load all lists, categories, details, and users in parallel
      const [listsResult, categoriesResult, detailsResult, usersResult] = await rv.RunViews([
        {
          EntityName: 'MJ: Lists',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: List Categories',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: List Details',
          Fields: ['ListID'],
          ResultType: 'simple'
        },
        {
          EntityName: 'MJ: Users',
          Fields: ['ID', 'Name'],
          ResultType: 'simple'
        }
      ]);

      if (!listsResult.Success) {
        console.error('Failed to load lists');
        return;
      }

      const lists = listsResult.Results as MJListEntity[];
      this.categories = (categoriesResult.Results || []) as MJListCategoryEntity[];
      const details = (detailsResult.Results || []) as Array<{ ListID: string }>;
      const users = (usersResult.Results || []) as Array<{ ID: string; Name: string }>;

      // Build category map
      this.categoryMap.clear();
      for (const cat of this.categories) {
        this.categoryMap.set(cat.ID, cat);
      }

      // Build flat categories for dropdown
      this.flatCategories = this.buildFlatCategories(this.categories);
      // loadData() already pulled fresh categories — clear the dirty
      // flag so the first dialog open doesn't redundantly refetch.
      this.categoriesDirty = false;

      // Build user map
      const userMap = new Map<string, string>();
      for (const user of users) {
        userMap.set(user.ID, user.Name);
      }

      // Count items per list
      const itemCounts = new Map<string, number>();
      for (const detail of details) {
        const count = itemCounts.get(detail.ListID) || 0;
        itemCounts.set(detail.ListID, count + 1);
      }

      // Build entity info
      const entities = md.Entities;
      const entitySet = new Set<string>();

      for (const entity of entities) {
        this.entityColorMap.set(entity.Name, this.generateEntityColor(entity.Name));
        this.entityIconMap.set(entity.Name, entity.Icon || 'fa-solid fa-table');
      }

      // Build available entities for dropdown
      this.availableEntities = entities
        .filter(e => e.IncludeInAPI)
        .map(e => ({ ID: e.ID, Name: e.Name }))
        .sort((a, b) => a.Name.localeCompare(b.Name));
      this.filteredEntitiesList = [...this.availableEntities];

      // Build list items
      this.allLists = lists.map(list => {
        const entityName = list.Entity || 'Unknown';
        entitySet.add(entityName);
        return {
          list,
          itemCount: itemCounts.get(list.ID) || 0,
          entityName,
          ownerName: userMap.get(list.UserID) || 'Unknown',
          isOwner: UUIDsEqual(list.UserID, this.currentUserId)
        };
      });

      // Build entity filter options
      this.entityOptions = [
        { name: 'All Entities', value: 'all' },
        ...Array.from(entitySet).sort().map(e => ({ name: e, value: e }))
      ];

      this.applyFilters();
      this.buildCategoryTree();

      // Load favorites in parallel — not critical-path, but cheap.
      void this.loadFavorites();

      // Load sharing info in the background
      this.loadSharingInfo();
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private buildFlatCategories(categories: MJListCategoryEntity[]): Array<{ ID: string; displayName: string }> {
    const result: Array<{ ID: string; displayName: string }> = [];
    const topLevel = categories.filter(c => !c.ParentID);

    const processCategory = (cat: MJListCategoryEntity, level: number) => {
      const indent = '\u00A0\u00A0'.repeat(level);
      result.push({ ID: cat.ID, displayName: `${indent}${cat.Name}` });

      const children = categories.filter(c => UUIDsEqual(c.ParentID, cat.ID));
      for (const child of children) {
        processCategory(child, level + 1);
      }
    };

    for (const cat of topLevel) {
      processCategory(cat, 0);
    }

    return result;
  }

  private buildCategoryTree() {
    const rootNodes: CategoryNode[] = [];
    const categoryNodes = new Map<string, CategoryNode>();

    // Create nodes for all categories
    for (const cat of this.categories) {
      categoryNodes.set(cat.ID, {
        category: cat,
        lists: [],
        children: [],
        isExpanded: true
      });
    }

    // Build tree structure
    for (const cat of this.categories) {
      const node = categoryNodes.get(cat.ID)!;
      if (cat.ParentID && categoryNodes.has(cat.ParentID)) {
        categoryNodes.get(cat.ParentID)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    // Assign lists to categories
    const uncategorizedLists: BrowseListItem[] = [];
    for (const item of this.filteredLists) {
      if (item.list.CategoryID && categoryNodes.has(item.list.CategoryID)) {
        categoryNodes.get(item.list.CategoryID)!.lists.push(item);
      } else {
        uncategorizedLists.push(item);
      }
    }

    // Add uncategorized node if there are uncategorized lists
    if (uncategorizedLists.length > 0) {
      rootNodes.unshift({
        category: null,
        lists: uncategorizedLists,
        children: [],
        isExpanded: true
      });
    }

    this.categoryTree = rootNodes;
  }

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
  }

  onSearchChange(_term: string) {
    this.applyFilters();
    this.buildCategoryTree();
  }

  onEntityFilterChange(_value: string) {
    this.applyFilters();
    this.buildCategoryTree();
  }

  onOwnerFilterChange(_value: string) {
    this.applyFilters();
    this.buildCategoryTree();
  }

  onSortChange(_value: string) {
    this.applyFilters();
    this.buildCategoryTree();
  }

  clearSearch() {
    this.searchTerm = '';
    this.applyFilters();
    this.buildCategoryTree();
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedEntity = 'all';
    this.selectedOwner = 'mine';
    this.applyFilters();
    this.buildCategoryTree();
  }

  private applyFilters() {
    let result = [...this.allLists];

    // Owner filter
    if (this.selectedOwner === 'mine') {
      result = result.filter(item => item.isOwner);
    } else if (this.selectedOwner === 'others') {
      result = result.filter(item => !item.isOwner);
    }

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(item =>
        item.list.Name.toLowerCase().includes(term) ||
        (item.list.Description && item.list.Description.toLowerCase().includes(term)) ||
        item.entityName.toLowerCase().includes(term) ||
        item.ownerName.toLowerCase().includes(term)
      );
    }

    // Entity filter
    if (this.selectedEntity !== 'all') {
      result = result.filter(item => item.entityName === this.selectedEntity);
    }

    // Tag filter (Phase 4.3 — intersection of all active tags).
    if (this.tagFilteredListIds !== null) {
      const matches = this.tagFilteredListIds;
      result = result.filter(item => matches.has(item.list.ID));
    }

    // Favorites-only toggle (Phase 5.3).
    if (this.showOnlyFavorites) {
      const favs = this.favoriteListIds;
      result = result.filter(item => favs.has(item.list.ID));
    }

    // Sort
    switch (this.selectedSort) {
      case 'name':
        result.sort((a, b) => a.list.Name.localeCompare(b.list.Name));
        break;
      case 'updated':
        result.sort((a, b) => {
          const dateA = new Date(a.list.__mj_UpdatedAt).getTime();
          const dateB = new Date(b.list.__mj_UpdatedAt).getTime();
          return dateB - dateA;
        });
        break;
      case 'items':
        result.sort((a, b) => b.itemCount - a.itemCount);
        break;
      case 'entity':
        result.sort((a, b) => a.entityName.localeCompare(b.entityName));
        break;
    }

    this.filteredLists = result;
  }

  toggleCategory(node: CategoryNode) {
    node.isExpanded = !node.isExpanded;
  }

  getListCountInCategory(node: CategoryNode): number {
    let count = node.lists.length;
    for (const child of node.children) {
      count += this.getListCountInCategory(child);
    }
    return count;
  }

  getEntityColor(entityName: string): string {
    return this.entityColorMap.get(entityName) || '#607D8B';
  }

  getEntityIcon(entityName: string): string {
    return this.entityIconMap.get(entityName) || 'fa-solid fa-table';
  }

  private generateEntityColor(entityName: string): string {
    let hash = 0;
    for (let i = 0; i < entityName.length; i++) {
      hash = entityName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336',
      '#00BCD4', '#795548', '#607D8B', '#E91E63', '#3F51B5'
    ];
    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(date: Date): string {
    if (!date) return '';
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  }

  openList(item: BrowseListItem) {
    const appId = this.Data?.Configuration?.applicationId || '';
    this.tabService.OpenList(item.list.ID, item.list.Name, appId);
  }

  /**
   * Handle a tag chip click on a list card — adds the tag to the
   * filter row (multi-tag = AND). Wired by Phase 4.3; the chip
   * component emits the (TagID, Name) pair so we can both display
   * the chip name and filter by ID.
   */
  onCardTagClicked(payload: { TagID: string; Name: string }): void {
    if (this.tagFilters.some((f) => f.TagID === payload.TagID)) return;
    this.tagFilters = [...this.tagFilters, payload];
    void this.recomputeTagMembership();
  }

  /** Remove a tag from the filter row. */
  removeTagFilter(tagId: string): void {
    this.tagFilters = this.tagFilters.filter((f) => f.TagID !== tagId);
    void this.recomputeTagMembership();
  }

  /** Clear all active tag filters. */
  clearTagFilters(): void {
    this.tagFilters = [];
    this.tagFilteredListIds = null;
    this.applyFilters();
  }

  /**
   * Resolve which lists have ALL active tags. Done server-side so the
   * filter works regardless of which lists the user has scrolled past.
   * Result is cached on `tagFilteredListIds`; `applyFilters` consumes it.
   */
  private async recomputeTagMembership(): Promise<void> {
    if (this.tagFilters.length === 0) {
      this.tagFilteredListIds = null;
      this.applyFilters();
      return;
    }
    try {
      const md = this.ProviderToUse;
      const listsEntity = md.Entities.find((e) => e.Name === 'MJ: Lists');
      if (!listsEntity) {
        this.tagFilteredListIds = new Set();
        this.applyFilters();
        return;
      }
      const tagIds = this.tagFilters.map((f) => `'${f.TagID}'`).join(',');
      const rv = RunView.FromMetadataProvider(md);
      const result = await rv.RunView<{ RecordID: string; TagID: string }>({
        EntityName: 'MJ: Tagged Items',
        ExtraFilter: `EntityID='${listsEntity.ID}' AND TagID IN (${tagIds})`,
        Fields: ['RecordID', 'TagID'],
        ResultType: 'simple',
      });
      // Intersection: count tag hits per list, keep only those with
      // exactly `tagFilters.length` matches (one per required tag).
      const counts = new Map<string, number>();
      for (const row of result.Results ?? []) {
        const id = String(row.RecordID);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const required = this.tagFilters.length;
      const matches = new Set<string>();
      for (const [id, count] of counts) {
        if (count >= required) matches.add(id);
      }
      this.tagFilteredListIds = matches;
    } catch (e) {
      // On failure, fall back to "no match" so the user sees an empty
      // state rather than every list — avoids leaking unfiltered data
      // when the filter intent failed silently.
      this.tagFilteredListIds = new Set();
    }
    this.applyFilters();
  }

  /**
   * Load the current user's favorite lists into `favoriteListIds`.
   * Cheap — typically <100 rows per user. Driven by the `MJ: User
   * Favorites` entity scoped by the Lists EntityID. Best-effort: on
   * failure the star icons just stay dim.
   */
  private async loadFavorites(): Promise<void> {
    try {
      const md = this.ProviderToUse;
      const listsEntity = md.Entities.find((e) => e.Name === 'MJ: Lists');
      if (!listsEntity || !md.CurrentUser) return;
      const rv = RunView.FromMetadataProvider(md);
      const result = await rv.RunView<{ RecordID: string }>({
        EntityName: 'MJ: User Favorites',
        ExtraFilter: `UserID='${md.CurrentUser.ID}' AND EntityID='${listsEntity.ID}'`,
        Fields: ['RecordID'],
        ResultType: 'simple',
      });
      this.favoriteListIds = new Set((result.Results ?? []).map((r) => String(r.RecordID)));
    } catch {
      // Silent — favorites are a polish feature, not load-bearing.
      this.favoriteListIds = new Set();
    }
  }

  /**
   * Toggle a list's favorite state. Optimistic: flips the local Set
   * first, then writes through. Reverts on failure.
   */
  async toggleFavorite(event: Event, item: BrowseListItem): Promise<void> {
    event.stopPropagation();
    const wasFav = this.favoriteListIds.has(item.list.ID);
    // Optimistic update.
    if (wasFav) this.favoriteListIds.delete(item.list.ID);
    else this.favoriteListIds.add(item.list.ID);
    // Re-trigger filter recompute since the favorites-only toggle
    // may be on.
    this.applyFilters();

    try {
      const md = this.ProviderToUse;
      const listsEntity = md.Entities.find((e) => e.Name === 'MJ: Lists');
      if (!listsEntity || !md.CurrentUser) throw new Error('Cannot resolve user favorites entity');

      if (wasFav) {
        // Find + delete the existing favorite row.
        const rv = RunView.FromMetadataProvider(md);
        const result = await rv.RunView<MJUserFavoriteEntity>({
          EntityName: 'MJ: User Favorites',
          ExtraFilter:
            `UserID='${md.CurrentUser.ID}' AND EntityID='${listsEntity.ID}' AND RecordID='${item.list.ID}'`,
          ResultType: 'entity_object',
        });
        for (const row of result.Results ?? []) await row.Delete();
      } else {
        const fav = await md.GetEntityObject<MJUserFavoriteEntity>('MJ: User Favorites', md.CurrentUser);
        fav.NewRecord();
        fav.UserID = md.CurrentUser.ID;
        fav.EntityID = listsEntity.ID;
        fav.RecordID = item.list.ID;
        await fav.Save();
      }
    } catch {
      // Revert on failure.
      if (wasFav) this.favoriteListIds.add(item.list.ID);
      else this.favoriteListIds.delete(item.list.ID);
      this.applyFilters();
    }
  }

  isFavorite(listId: string): boolean {
    return this.favoriteListIds.has(listId);
  }

  toggleShowOnlyFavorites(): void {
    this.showOnlyFavorites = !this.showOnlyFavorites;
    this.applyFilters();
  }

  openListMenu(event: Event, item: BrowseListItem) {
    event.stopPropagation();
    const mouseEvent = event as MouseEvent;
    this.selectedContextItem = item;
    this.contextMenuX = mouseEvent.clientX;
    this.contextMenuY = mouseEvent.clientY;
    // Fast path: owners always have full capabilities. Avoid an extra
    // permission-resolve round trip for the common case.
    if (item.isOwner) {
      this.contextItemCapabilities = capabilitiesForLevel('Owner');
      this.showContextMenu = true;
      return;
    }
    // Render the menu immediately with a conservative viewer-level cap
    // set, then refine via async resolve. The flicker is a single tick
    // — and viewers/editors stay correctly gated even if resolve fails.
    const cached = this.capabilityCache.get(item.list.ID);
    if (cached !== undefined) {
      this.contextItemCapabilities = capabilitiesForLevel(cached);
    } else {
      this.contextItemCapabilities = capabilitiesForLevel('View');
      void this.refineContextCapabilities(item.list.ID);
    }
    this.showContextMenu = true;
  }

  /** Resolve the current user's permission level for a list and update
   *  the open context menu in place. Cached so re-opening the same menu
   *  doesn't re-hit the resolver. */
  private async refineContextCapabilities(listId: string): Promise<void> {
    try {
      const sharing = new ListSharing(this.ProviderToUse.CurrentUser!, this.ProviderToUse);
      const level = await sharing.ResolveEffectivePermission(listId);
      this.capabilityCache.set(listId, level);
      // Only mutate state if the user is still on this same menu — they
      // may have closed it before resolve finished.
      if (this.showContextMenu && this.selectedContextItem?.list.ID === listId) {
        this.contextItemCapabilities = capabilitiesForLevel(level);
        this.cdr.detectChanges();
      }
    } catch {
      // Conservative fallback already applied at menu open time.
    }
  }

  closeContextMenu() {
    this.showContextMenu = false;
    this.selectedContextItem = null;
  }

  createNewList() {
    this.editingList = null;
    this.newListName = '';
    this.newListDescription = '';
    this.selectedEntityId = '';
    this.entitySearchTerm = '';
    this.selectedCategoryId = null;
    this.showEntityDropdown = false;
    this.showCreateDialog = true;
    // Refresh categories so newly-created ones appear without a page
    // reload. Cheap RunView; runs in the background while the user is
    // typing the list name.
    void this.refreshCategoriesForDialog();
  }

  editList() {
    if (!this.selectedContextItem) return;

    const list = this.selectedContextItem.list;
    this.editingList = list;
    this.newListName = list.Name;
    this.newListDescription = list.Description || '';
    this.selectedEntityId = list.EntityID;
    this.entitySearchTerm = list.Entity || '';
    this.selectedCategoryId = list.CategoryID || null;
    // Ensure no stale state from a previous Create attempt — the entity
    // dropdown portal renders at z-index 10002 and could otherwise sit on
    // top of the edit dialog and block interaction.
    this.showEntityDropdown = false;
    // Close the context menu BEFORE opening the dialog. Doing it after
    // leaves a one-tick window where both the menu and the modal-overlay
    // are stacked, and the menu's outer click-overlay can swallow the
    // first click into the form fields below it.
    this.closeContextMenu();
    this.showCreateDialog = true;
    this.cdr.detectChanges();
    void this.refreshCategoriesForDialog();
  }

  /** Re-pull MJ: List Categories so the dropdown reflects any
   *  newly-created categories. Skips the round trip when nothing has
   *  changed since the last load — `categoriesDirty` is flipped on
   *  by the BaseEntity event subscription whenever a category row
   *  is saved/deleted, so the only times this actually fetches are
   *  (a) the first dialog open, and (b) after the user touched a
   *  category somewhere else. */
  private async refreshCategoriesForDialog(): Promise<void> {
    if (!this.categoriesDirty) return;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJListCategoryEntity>({
        EntityName: 'MJ: List Categories',
        OrderBy: 'Name',
        ResultType: 'simple',
      });
      if (!result.Success) return;
      this.categories = (result.Results ?? []) as MJListCategoryEntity[];
      this.categoryMap.clear();
      for (const cat of this.categories) this.categoryMap.set(cat.ID, cat);
      this.flatCategories = this.buildFlatCategories(this.categories);
      this.categoriesDirty = false;
      this.cdr.detectChanges();
    } catch {
      // Best-effort — the dialog still works with the previously-loaded list.
    }
  }

  selectEntity(entity: { ID: string; Name: string }) {
    this.selectedEntityId = entity.ID;
    this.entitySearchTerm = entity.Name;
    this.showEntityDropdown = false;
  }

  filterEntities(term: string) {
    const lowerTerm = term.toLowerCase();
    this.filteredEntitiesList = this.availableEntities.filter(e =>
      e.Name.toLowerCase().includes(lowerTerm)
    );
    // Ensure dropdown is visible while typing
    if (!this.showEntityDropdown && term) {
      this.showEntityDropdown = true;
    }
    // Clear selection when user modifies the search text
    this.selectedEntityId = '';
  }

  openEntityDropdown(inputElement: HTMLInputElement) {
    const rect = inputElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 200;
    const spaceBelow = viewportHeight - rect.bottom;
    const openAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    this.entityDropdownPosition = {
      top: openAbove ? rect.top - dropdownHeight : rect.bottom,
      left: rect.left,
      width: rect.width,
      openAbove
    };
    this.showEntityDropdown = true;
    this.filteredEntitiesList = [...this.availableEntities];
  }

  closeEntityDropdown() {
    this.showEntityDropdown = false;
  }

  async duplicateList() {
    if (!this.selectedContextItem) return;

    const listToDuplicate = this.selectedContextItem.list;
    this.closeContextMenu();

    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      const newList = await md.GetEntityObject<MJListEntity>('MJ: Lists');
      newList.Name = `${listToDuplicate.Name} (Copy)`;
      newList.Description = listToDuplicate.Description;
      newList.EntityID = listToDuplicate.EntityID;
      newList.CategoryID = listToDuplicate.CategoryID;
      newList.UserID = md.CurrentUser!.ID;

      const listSaved = await newList.Save();
      if (!listSaved) {
        this.notificationService.CreateSimpleNotification('Failed to duplicate list', 'error', 4000);
        return;
      }

      const itemsResult = await rv.RunView<MJListDetailEntity>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID = '${listToDuplicate.ID}'`,
        ResultType: 'entity_object'
      });

      if (itemsResult.Success && itemsResult.Results.length > 0) {
        let copiedCount = 0;
        for (const item of itemsResult.Results) {
          const newItem = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details');
          newItem.ListID = newList.ID;
          newItem.RecordID = item.RecordID;
          newItem.Sequence = item.Sequence;
          const itemSaved = await newItem.Save();
          if (itemSaved) copiedCount++;
        }
        this.notificationService.CreateSimpleNotification(
          `List duplicated with ${copiedCount} item${copiedCount !== 1 ? 's' : ''}`,
          'success',
          3000
        );
      } else {
        this.notificationService.CreateSimpleNotification('List duplicated successfully', 'success', 3000);
      }

      await this.loadData();
    } catch (error) {
      console.error('Error duplicating list:', error);
      this.notificationService.CreateSimpleNotification('Error duplicating list. Please try again.', 'error', 4000);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  confirmDeleteList() {
    if (!this.selectedContextItem) return;
    this.listToDelete = this.selectedContextItem.list;
    this.deleteListName = this.selectedContextItem.list.Name;
    this.showDeleteConfirm = true;
    this.closeContextMenu();
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.listToDelete = null;
    this.deleteListName = '';
  }

  async deleteList() {
    if (!this.listToDelete) return;

    const listToDelete = this.listToDelete;
    const listName = listToDelete.Name;

    this.isDeleting = true;
    this.cdr.detectChanges();

    try {
      // spDeleteList doesn't cascade to MJ: List Details, so the FK
      // constraint (FK_ListDetail_List) blocks the delete if the list
      // has any members. Cascade-delete the details first in a
      // transaction group so the whole thing rolls back if any single
      // delete fails. The proper long-term fix is a migration that
      // adds ON DELETE CASCADE (or extends the SP); this keeps the UI
      // unblocked in the meantime.
      const cascadeOk = await this.cascadeDeleteListMembers(listToDelete.ID);
      if (!cascadeOk) {
        this.notificationService.CreateSimpleNotification(
          `Failed to delete list members for "${listName}" — list not deleted`,
          'error', 6000,
        );
        return;
      }

      const deleted = await listToDelete.Delete();
      if (deleted) {
        this.notificationService.CreateSimpleNotification(`"${listName}" deleted`, 'success', 3000);
        // Optimistic removal from local state so the card disappears
        // immediately. Without this, the user sees the just-deleted list
        // until loadData() rebuilds — and worse, can click Delete on it
        // again (which hangs because the in-memory entity still has the
        // now-deleted record's ID).
        const deletedId = listToDelete.ID;
        this.allLists = this.allLists.filter(item => !UUIDsEqual(item.list.ID, deletedId));
        this.applyFilters();
        this.buildCategoryTree();
        this.cdr.detectChanges();
      } else {
        const errorMessage = listToDelete.LatestResult?.Message || 'Unknown error occurred';
        console.error('Failed to delete list:', listToDelete.LatestResult);
        this.notificationService.CreateSimpleNotification(`Failed to delete list: ${errorMessage}`, 'error', 6000);
      }
      this.cancelDelete();
      // Background refresh for authoritative state — don't block the UI
      // on it. If the optimistic update was wrong (rare), this corrects.
      void this.loadData();
    } catch (error) {
      console.error('Error deleting list:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.notificationService.CreateSimpleNotification(`Error deleting list: ${errorMessage}`, 'error', 6000);
    } finally {
      this.isDeleting = false;
      this.cdr.detectChanges();
    }
  }

  /** Delete every MJ: List Details row for a given list in a single
   *  transaction group. Returns true if everything succeeded (including
   *  the trivial "no members" case). */
  private async cascadeDeleteListMembers(listId: string): Promise<boolean> {
    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(md);
    const lookup = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID='${listId}'`,
      ResultType: 'entity_object',
    });
    if (!lookup.Success) {
      console.error('Failed to load list details for cascade-delete:', lookup.ErrorMessage);
      return false;
    }
    const details = lookup.Results ?? [];
    if (details.length === 0) return true;

    const tg = await md.CreateTransactionGroup();
    for (const d of details) {
      d.TransactionGroup = tg;
      await d.Delete();
    }
    const ok = await tg.Submit();
    if (!ok) {
      console.error('Cascade-delete transaction failed for list', listId);
    }
    return ok;
  }

  closeCreateDialog() {
    this.showCreateDialog = false;
    this.editingList = null;
    this.showEntityDropdown = false;
  }

  async saveList() {
    this.isSaving = true;
    this.cdr.detectChanges();

    const isEditing = !!this.editingList;
    const listName = this.newListName;

    try {
      const md = this.ProviderToUse;
      let list: MJListEntity;

      if (this.editingList) {
        list = this.editingList;
      } else {
        list = await md.GetEntityObject<MJListEntity>('MJ: Lists');
        list.UserID = md.CurrentUser!.ID;
        list.EntityID = this.selectedEntityId;
      }

      list.Name = this.newListName;
      list.Description = this.newListDescription || null;
      list.CategoryID = this.selectedCategoryId || null;

      const saved = await list.Save();
      if (saved) {
        this.notificationService.CreateSimpleNotification(
          isEditing ? `"${listName}" updated` : `"${listName}" created`,
          'success',
          3000
        );
        this.closeCreateDialog();
        await this.loadData();
      } else {
        const errorMessage = list.LatestResult?.Message || 'Unknown error occurred';
        const action = isEditing ? 'update' : 'create';
        console.error(`Failed to ${action} list:`, list.LatestResult);
        this.notificationService.CreateSimpleNotification(
          `Failed to ${action} list: ${errorMessage}`,
          'error',
          6000
        );
      }
    } catch (error) {
      console.error('Error saving list:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.notificationService.CreateSimpleNotification(`Error saving list: ${errorMessage}`, 'error', 6000);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  // Sharing methods
  openShareDialog() {
    if (!this.selectedContextItem) return;

    const item = this.selectedContextItem;
    this.shareDialogConfig = {
      listId: item.list.ID,
      listName: item.list.Name,
      currentUserId: this.currentUserId,
      isOwner: item.isOwner
    };
    this.showShareDialog = true;
    this.closeContextMenu();
  }

  onShareComplete(_result: ListShareDialogResult) {
    this.showShareDialog = false;
    this.shareDialogConfig = null;
    // Reload sharing info for all lists
    this.loadSharingInfo();
    this.cdr.detectChanges();
  }

  onShareCancel() {
    this.showShareDialog = false;
    this.shareDialogConfig = null;
  }

  /** "Manage Invitations" clicked inside the share dialog — opens a
   *  modal hosting `<mj-list-invitations>` for the same list. The
   *  share dialog is closed so dialogs don't visually stack. */
  onManageInvitations() {
    if (!this.shareDialogConfig) return;
    this.activeShareListId = this.shareDialogConfig.listId;
    this.activeShareListName = this.shareDialogConfig.listName;
    this.showShareDialog = false;
    this.showInvitationsDialog = true;
    this.cdr.detectChanges();
  }

  closeInvitationsDialog() {
    this.showInvitationsDialog = false;
    this.cdr.detectChanges();
  }

  /** "View audit log" link in share dialog. */
  onViewAuditLog() {
    if (!this.shareDialogConfig) return;
    this.activeShareListId = this.shareDialogConfig.listId;
    this.activeShareListName = this.shareDialogConfig.listName;
    this.showShareDialog = false;
    this.showAuditLogDialog = true;
    this.cdr.detectChanges();
  }

  closeAuditLogDialog() {
    this.showAuditLogDialog = false;
    this.cdr.detectChanges();
  }

  private async loadSharingInfo() {
    // Load sharing summaries for all lists that the user owns
    const ownedLists = this.allLists.filter(item => item.isOwner);

    for (const item of ownedLists) {
      try {
        const summary = await this.listSharingService.getListSharingSummary(item.list.ID);
        item.sharingInfo = summary;
      } catch (error) {
        console.error(`Error loading sharing info for list ${item.list.ID}:`, error);
      }
    }

    this.cdr.detectChanges();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Lists';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-list-check';
  }
}
