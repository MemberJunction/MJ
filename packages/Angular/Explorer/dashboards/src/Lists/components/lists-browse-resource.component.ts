import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy, ElementRef, HostListener } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, ListCategoryEntity } from '@memberjunction/core-entities';
import { ListEntity, ListDetailEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { TabService } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ListSharingService, ListSharingSummary, ListShareDialogConfig, ListShareDialogResult } from '@memberjunction/ng-list-management';

export function LoadListsBrowseResource() {
  // tree shaker
}

interface BrowseListItem {
  list: ListEntity;
  itemCount: number;
  entityName: string;
  ownerName: string;
  isOwner: boolean;
  sharingInfo?: ListSharingSummary;
}

interface CategoryNode {
  category: ListCategoryEntity | null;
  lists: BrowseListItem[];
  children: CategoryNode[];
  isExpanded: boolean;
}

type ViewMode = 'table' | 'card' | 'hierarchy';

@RegisterClass(BaseResourceComponent, 'ListsBrowseResource')
@Component({
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
            <button *ngIf="searchTerm" class="clear-search" (click)="clearSearch()">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>

          <div class="filter-group">
            <select
              [(ngModel)]="selectedOwner"
              (ngModelChange)="onOwnerFilterChange($event)"
              class="filter-select"
              title="Filter by owner">
              <option *ngFor="let opt of ownerOptions" [value]="opt.value">{{opt.name}}</option>
            </select>
          </div>

          <div class="filter-group">
            <select
              [(ngModel)]="selectedEntity"
              (ngModelChange)="onEntityFilterChange($event)"
              class="filter-select"
              title="Filter by entity">
              <option *ngFor="let opt of entityOptions" [value]="opt.value">{{opt.name}}</option>
            </select>
          </div>

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

      <!-- Loading State -->
      <div class="loading-container" *ngIf="isLoading">
        <mj-loading text="Loading lists..." size="medium"></mj-loading>
      </div>

      <!-- Empty State - No Lists -->
      <div class="empty-state" *ngIf="!isLoading && allLists.length === 0">
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

      <!-- Empty State - No Results -->
      <div class="empty-state search-empty" *ngIf="!isLoading && allLists.length > 0 && filteredLists.length === 0">
        <div class="empty-state-icon-wrapper search">
          <i class="fa-solid fa-filter-circle-xmark"></i>
        </div>
        <h3>No Results Found</h3>
        <p>No lists match your current filters.</p>
        <p class="empty-hint">Try adjusting your search or filters.</p>
        <button class="btn-clear" (click)="clearFilters()">Clear All Filters</button>
      </div>

      <!-- Results Content -->
      <div class="browse-content" *ngIf="!isLoading && filteredLists.length > 0">
        <div class="results-header">
          <span class="result-count">{{filteredLists.length}} list{{filteredLists.length !== 1 ? 's' : ''}}</span>
          <div class="sort-options">
            <label>Sort:</label>
            <select
              [(ngModel)]="selectedSort"
              (ngModelChange)="onSortChange($event)"
              class="filter-select sort-select">
              <option *ngFor="let opt of sortOptions" [value]="opt.value">{{opt.name}}</option>
            </select>
          </div>
        </div>

        <!-- Table View -->
        <div class="lists-table" *ngIf="viewMode === 'table'">
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
              <tr
                *ngFor="let item of filteredLists"
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
                      <span class="list-desc" *ngIf="item.list.Description">{{item.list.Description}}</span>
                    </div>
                  </div>
                </td>
                <td class="col-entity" role="gridcell">
                  <span class="entity-badge">{{item.entityName}}</span>
                </td>
                <td class="col-items" role="gridcell">{{item.itemCount}}</td>
                <td class="col-sharing" role="gridcell">
                  <ng-container *ngIf="item.sharingInfo as sharing">
                    <span class="sharing-indicator" *ngIf="sharing.totalShares > 0">
                      <i class="fa-solid fa-share-nodes"></i>
                      <span class="share-count">{{sharing.totalShares}}</span>
                    </span>
                    <span class="sharing-private" *ngIf="sharing.totalShares === 0">
                      <i class="fa-solid fa-lock"></i>
                    </span>
                  </ng-container>
                  <span class="sharing-private" *ngIf="!item.sharingInfo">
                    <i class="fa-solid fa-lock"></i>
                  </span>
                </td>
                <td class="col-owner" role="gridcell">
                  <span class="owner-name" [class.is-me]="item.isOwner">
                    {{item.isOwner ? 'You' : item.ownerName}}
                  </span>
                </td>
                <td class="col-updated" role="gridcell">{{formatDate(item.list.__mj_UpdatedAt)}}</td>
                <td class="col-actions" role="gridcell">
                  <button
                    class="action-btn"
                    *ngIf="item.isOwner"
                    (click)="openListMenu($event, item)"
                    title="More options">
                    <i class="fa-solid fa-ellipsis-v" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Card View -->
        <div class="lists-grid" *ngIf="viewMode === 'card'" role="list" aria-label="Lists">
          <div
            class="list-card"
            *ngFor="let item of filteredLists"
            (click)="openList(item)"
            (keydown.enter)="openList(item)"
            tabindex="0"
            role="listitem">
            <div class="card-header">
              <div class="card-icon" [style.background-color]="getEntityColor(item.entityName)" aria-hidden="true">
                <i [class]="getEntityIcon(item.entityName)"></i>
              </div>
              <div class="card-menu" *ngIf="item.isOwner">
                <button class="menu-btn" (click)="openListMenu($event, item)">
                  <i class="fa-solid fa-ellipsis-v" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="card-body">
              <h3 class="card-title">{{item.list.Name}}</h3>
              <p class="card-description" *ngIf="item.list.Description">{{item.list.Description}}</p>
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
            </div>
            <div class="card-footer">
              <span class="owner-tag" [class.is-me]="item.isOwner">
                <i class="fa-solid fa-user"></i>
                {{item.isOwner ? 'You' : item.ownerName}}
              </span>
              <div class="card-footer-right">
                <ng-container *ngIf="item.sharingInfo as sharing">
                  <span class="sharing-badge" *ngIf="sharing.totalShares > 0" [title]="'Shared with ' + sharing.totalShares + ' user(s)/role(s)'">
                    <i class="fa-solid fa-share-nodes"></i>
                  </span>
                </ng-container>
                <span class="date-info">{{formatDate(item.list.__mj_UpdatedAt)}}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Hierarchy View -->
        <div class="category-tree" *ngIf="viewMode === 'hierarchy'">
          <ng-container *ngFor="let node of categoryTree">
            <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { node: node, depth: 0 }"></ng-container>
          </ng-container>
        </div>
      </div>

      <!-- Category Node Template -->
      <ng-template #categoryNodeTemplate let-node="node" let-depth="depth">
        <div class="category-section" [style.margin-left.px]="depth * 20">
          <!-- Category Header -->
          <div
            class="category-header"
            *ngIf="node.category"
            (click)="toggleCategory(node)">
            <i [class]="node.isExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"></i>
            <i class="fa-solid fa-folder" [class.fa-folder-open]="node.isExpanded"></i>
            <span class="category-name">{{node.category.Name}}</span>
            <span class="category-count">{{getListCountInCategory(node)}}</span>
          </div>

          <!-- Uncategorized Header -->
          <div
            class="category-header uncategorized"
            *ngIf="!node.category && node.lists.length > 0"
            (click)="toggleCategory(node)">
            <i [class]="node.isExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"></i>
            <i class="fa-solid fa-inbox"></i>
            <span class="category-name">Uncategorized</span>
            <span class="category-count">{{node.lists.length}}</span>
          </div>

          <!-- Lists in this category -->
          <div class="category-lists" *ngIf="node.isExpanded" role="list">
            <div
              class="list-row hierarchy-row"
              *ngFor="let item of node.lists"
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
                  <span *ngIf="!item.isOwner"> &middot; {{item.ownerName}}</span>
                </span>
              </div>
              <div class="list-actions" *ngIf="item.isOwner">
                <button class="action-btn" (click)="openListMenu($event, item)">
                  <i class="fa-solid fa-ellipsis-v" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Child categories -->
          <ng-container *ngIf="node.isExpanded">
            <ng-container *ngFor="let child of node.children">
              <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { node: child, depth: depth + 1 }"></ng-container>
            </ng-container>
          </ng-container>
        </div>
      </ng-template>

      <!-- Context Menu -->
      <div class="context-menu-overlay" *ngIf="showContextMenu" (click)="closeContextMenu()"></div>
      <div class="context-menu" *ngIf="showContextMenu" [style.top.px]="contextMenuY" [style.left.px]="contextMenuX">
        <button class="menu-item" (click)="editList()">
          <i class="fa-solid fa-pen"></i>
          Edit
        </button>
        <button class="menu-item" (click)="openShareDialog()">
          <i class="fa-solid fa-share-nodes"></i>
          Share
        </button>
        <button class="menu-item" (click)="duplicateList()">
          <i class="fa-solid fa-copy"></i>
          Duplicate
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item danger" (click)="confirmDeleteList()">
          <i class="fa-solid fa-trash"></i>
          Delete
        </button>
      </div>

      <!-- Create/Edit Dialog -->
      <div class="modal-overlay" *ngIf="showCreateDialog" (click)="closeCreateDialog()"></div>
      <div class="modal-dialog" *ngIf="showCreateDialog">
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
          <div class="form-group" *ngIf="!editingList">
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
          <div class="form-group" *ngIf="editingList">
            <label>Entity</label>
            <input type="text" [value]="entitySearchTerm" class="form-input" disabled />
          </div>
          <div class="form-group">
            <label>Category</label>
            <select [(ngModel)]="selectedCategoryId" class="form-input">
              <option [ngValue]="null">No category</option>
              <option *ngFor="let cat of flatCategories" [ngValue]="cat.ID">{{cat.displayName}}</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button
            class="btn-primary"
            (click)="saveList()"
            [disabled]="!newListName || (!editingList && !selectedEntityId) || isSaving">
            <i *ngIf="isSaving" class="fa-solid fa-spinner fa-spin"></i>
            {{isSaving ? 'Saving...' : (editingList ? 'Save' : 'Create')}}
          </button>
          <button class="btn-secondary" (click)="closeCreateDialog()" [disabled]="isSaving">Cancel</button>
        </div>
      </div>

      <!-- Delete Confirmation Dialog -->
      <div class="modal-overlay" *ngIf="showDeleteConfirm" (click)="cancelDelete()"></div>
      <div class="modal-dialog confirm-dialog" *ngIf="showDeleteConfirm">
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
            <i *ngIf="isDeleting" class="fa-solid fa-spinner fa-spin"></i>
            {{isDeleting ? 'Deleting...' : 'Delete'}}
          </button>
          <button class="btn-secondary" (click)="cancelDelete()" [disabled]="isDeleting">Cancel</button>
        </div>
      </div>

      <!-- Share Dialog -->
      <mj-list-share-dialog
        *ngIf="shareDialogConfig"
        [config]="shareDialogConfig"
        [visible]="showShareDialog"
        (complete)="onShareComplete($event)"
        (cancel)="onShareCancel()">
      </mj-list-share-dialog>

      <!-- Entity Dropdown Portal -->
      <div
        class="entity-dropdown-portal"
        *ngIf="showEntityDropdown && !editingList"
        [style.top.px]="entityDropdownPosition.top"
        [style.left.px]="entityDropdownPosition.left"
        [style.width.px]="entityDropdownPosition.width"
        [class.dropdown-above]="entityDropdownPosition.openAbove">
        <div class="entity-dropdown-backdrop" (click)="closeEntityDropdown()"></div>
        <div class="entity-dropdown-content" [class.open-above]="entityDropdownPosition.openAbove">
          <div
            class="dropdown-item"
            *ngFor="let entity of filteredEntitiesList"
            (click)="selectEntity(entity)">
            {{entity.Name}}
          </div>
          <div class="dropdown-empty" *ngIf="filteredEntitiesList.length === 0">
            No entities found
          </div>
        </div>
      </div>
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
      background: #f5f7fa;
      overflow: hidden;
    }

    /* Header */
    .browse-header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
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
      color: #2196F3;
    }

    .header-title h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
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
      color: #999;
    }

    .search-box input {
      padding: 8px 36px;
      border: 1px solid #ddd;
      border-radius: 20px;
      font-size: 14px;
      width: 100%;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .search-box input:focus {
      outline: none;
      border-color: #2196F3;
      box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
    }

    .clear-search {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .filter-group label {
      font-size: 13px;
      color: #666;
    }

    .filter-select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      background: white;
      cursor: pointer;
      min-width: 120px;
    }

    .filter-select:focus {
      outline: none;
      border-color: #2196F3;
      box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
    }

    .sort-select {
      min-width: 140px;
    }

    .view-toggle-group {
      display: flex;
      border: 1px solid #ddd;
      border-radius: 6px;
      overflow: hidden;
    }

    .view-toggle {
      padding: 8px 12px;
      background: white;
      border: none;
      border-right: 1px solid #ddd;
      color: #666;
      cursor: pointer;
      transition: all 0.2s;
    }

    .view-toggle:last-child {
      border-right: none;
    }

    .view-toggle:hover {
      background: #f5f5f5;
    }

    .view-toggle.active {
      background: #2196F3;
      color: white;
    }

    .btn-create {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-create:hover {
      background: #1976D2;
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
      background: linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(33, 150, 243, 0.05) 100%);
    }

    .empty-state-icon-wrapper > i {
      position: relative;
      font-size: 56px;
      color: #2196F3;
      z-index: 1;
    }

    .empty-state-icon-wrapper.search > i {
      font-size: 48px;
      color: #9e9e9e;
    }

    .empty-state h3 {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 600;
      color: #333;
    }

    .empty-state p {
      margin: 0 0 8px;
      color: #666;
      font-size: 15px;
      line-height: 1.5;
    }

    .empty-state p:last-of-type {
      margin-bottom: 24px;
    }

    .empty-hint {
      color: #999 !important;
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
      color: #555;
    }

    .feature-item i {
      font-size: 14px !important;
      color: #4CAF50 !important;
    }

    .btn-create-large {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 28px;
      background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
    }

    .btn-create-large:hover {
      background: linear-gradient(135deg, #1976D2 0%, #1565C0 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
    }

    .btn-clear {
      padding: 10px 20px;
      background: #f0f0f0;
      border: none;
      border-radius: 6px;
      color: #666;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-clear:hover {
      background: #e0e0e0;
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
      color: #666;
    }

    .sort-options {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sort-options label {
      font-size: 13px;
      color: #666;
    }

    /* Table View */
    .lists-table {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
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
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .lists-table td {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
      color: #333;
    }

    .list-row {
      cursor: pointer;
      transition: background 0.15s;
      outline: none;
    }

    .list-row:hover {
      background: #f5f5f5;
    }

    .list-row:focus {
      background: #e8f4fd;
    }

    .list-row:focus-visible {
      background: #e3f2fd;
      box-shadow: inset 3px 0 0 #2196F3;
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
      color: #2196F3;
      font-size: 13px;
    }

    .sharing-indicator i {
      font-size: 14px;
    }

    .share-count {
      font-weight: 500;
    }

    .sharing-private {
      color: #999;
      font-size: 13px;
    }

    .sharing-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: #e3f2fd;
      border-radius: 50%;
      color: #2196F3;
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
      color: white;
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
      color: #999;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .entity-badge {
      display: inline-block;
      padding: 2px 8px;
      background: #e8f4fd;
      border-radius: 4px;
      font-size: 12px;
      color: #1976D2;
    }

    .owner-name {
      color: #666;
    }

    .owner-name.is-me {
      color: #2196F3;
      font-weight: 500;
    }

    .action-btn {
      background: none;
      border: none;
      padding: 6px 10px;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: #e0e0e0;
      color: #666;
    }

    /* Card View */
    .lists-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .list-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s, outline 0.1s;
      outline: 2px solid transparent;
    }

    .list-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }

    .list-card:focus {
      outline: 2px solid #2196F3;
      outline-offset: 2px;
    }

    .list-card:focus:not(:focus-visible) {
      outline: none;
    }

    .list-card:focus-visible {
      outline: 2px solid #2196F3;
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
      color: white;
      font-size: 18px;
    }

    .menu-btn {
      background: none;
      border: none;
      padding: 4px 8px;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
    }

    .menu-btn:hover {
      background: #f5f5f5;
      color: #666;
    }

    .card-body {
      padding: 12px 16px;
    }

    .card-title {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .card-description {
      margin: 0 0 12px;
      font-size: 13px;
      color: #666;
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
      color: #999;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-top: 1px solid #f0f0f0;
      background: #fafafa;
    }

    .owner-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #666;
    }

    .owner-tag.is-me {
      color: #2196F3;
    }

    .date-info {
      font-size: 12px;
      color: #999;
    }

    /* Hierarchy View */
    .category-tree {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .category-section {
      background: white;
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
      background: #f5f5f5;
    }

    .category-header i:first-child {
      width: 16px;
      text-align: center;
      color: #999;
    }

    .category-header .fa-folder,
    .category-header .fa-folder-open {
      color: #ffc107;
    }

    .category-header.uncategorized .fa-inbox {
      color: #999;
    }

    .category-name {
      flex: 1;
      font-weight: 500;
      color: #333;
    }

    .category-count {
      font-size: 12px;
      color: #999;
      background: #f0f0f0;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .category-lists {
      border-top: 1px solid #f0f0f0;
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
      background: #f5f5f5;
    }

    .hierarchy-row:focus {
      background: #e3f2fd;
    }

    .hierarchy-row:focus-visible {
      background: #e3f2fd;
      box-shadow: inset 3px 0 0 #2196F3;
    }

    .list-info {
      flex: 1;
      min-width: 0;
    }

    .list-meta {
      font-size: 12px;
      color: #999;
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
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
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
      color: #333;
      cursor: pointer;
      transition: background 0.15s;
    }

    .menu-item:hover {
      background: #f5f5f5;
    }

    .menu-item.danger {
      color: #d32f2f;
    }

    .menu-item.danger:hover {
      background: #ffebee;
    }

    .menu-divider {
      height: 1px;
      background: #e0e0e0;
      margin: 4px 0;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
    }

    .modal-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
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
      border-bottom: 1px solid #e0e0e0;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .modal-close {
      background: none;
      border: none;
      padding: 4px 8px;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
    }

    .modal-close:hover {
      background: #f0f0f0;
      color: #666;
    }

    .modal-body {
      padding: 20px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .modal-body p {
      margin: 0 0 8px;
      color: #333;
    }

    .warning-text {
      color: #d32f2f !important;
      font-size: 13px;
    }

    .modal-footer {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1976D2;
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      padding: 10px 20px;
      background: white;
      color: #666;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #f5f5f5;
    }

    .btn-danger {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #d32f2f;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-danger:hover:not(:disabled) {
      background: #c62828;
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
      color: #666;
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }

    .form-input:focus {
      outline: none;
      border-color: #2196F3;
      box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
    }

    .form-input:disabled {
      background: #f5f5f5;
      color: #999;
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

    .entity-dropdown-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: -1;
    }

    .entity-dropdown-content {
      max-height: 200px;
      overflow-y: auto;
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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
      color: #333;
    }

    .dropdown-item:hover {
      background: #e3f2fd;
    }

    .dropdown-item:first-child {
      border-radius: 6px 6px 0 0;
    }

    .dropdown-item:last-child {
      border-radius: 0 0 6px 6px;
    }

    .dropdown-empty {
      padding: 10px 12px;
      color: #999;
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
  private destroy$ = new Subject<void>();

  isLoading = true;
  searchTerm = '';
  viewMode: ViewMode = 'card';
  selectedEntity = 'all';
  selectedOwner = 'mine';
  selectedSort = 'name';

  allLists: BrowseListItem[] = [];
  filteredLists: BrowseListItem[] = [];
  categories: ListCategoryEntity[] = [];
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
  editingList: ListEntity | null = null;
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
  listToDelete: ListEntity | null = null;

  // Operation states
  isSaving = false;
  isDeleting = false;

  // Sharing dialog state
  showShareDialog = false;
  shareDialogConfig: ListShareDialogConfig | null = null;

  private entityColorMap: Map<string, string> = new Map();
  private entityIconMap: Map<string, string> = new Map();
  private categoryMap: Map<string, ListCategoryEntity> = new Map();
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
      if (!target.closest('.custom-select-wrapper')) {
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
    await this.loadData();
    this.NotifyLoadComplete();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadData() {
    this.isLoading = true;

    try {
      const md = new Metadata();
      const rv = new RunView();
      this.currentUserId = md.CurrentUser?.ID || '';

      // Load all lists, categories, details, and users in parallel
      const [listsResult, categoriesResult, detailsResult, usersResult] = await rv.RunViews([
        {
          EntityName: 'Lists',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'List Categories',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'List Details',
          Fields: ['ListID'],
          ResultType: 'simple'
        },
        {
          EntityName: 'Users',
          Fields: ['ID', 'Name'],
          ResultType: 'simple'
        }
      ]);

      if (!listsResult.Success) {
        console.error('Failed to load lists');
        return;
      }

      const lists = listsResult.Results as ListEntity[];
      this.categories = (categoriesResult.Results || []) as ListCategoryEntity[];
      const details = (detailsResult.Results || []) as Array<{ ListID: string }>;
      const users = (usersResult.Results || []) as Array<{ ID: string; Name: string }>;

      // Build category map
      this.categoryMap.clear();
      for (const cat of this.categories) {
        this.categoryMap.set(cat.ID, cat);
      }

      // Build flat categories for dropdown
      this.flatCategories = this.buildFlatCategories(this.categories);

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
          isOwner: list.UserID === this.currentUserId
        };
      });

      // Build entity filter options
      this.entityOptions = [
        { name: 'All Entities', value: 'all' },
        ...Array.from(entitySet).sort().map(e => ({ name: e, value: e }))
      ];

      this.applyFilters();
      this.buildCategoryTree();

      // Load sharing info in the background
      this.loadSharingInfo();
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private buildFlatCategories(categories: ListCategoryEntity[]): Array<{ ID: string; displayName: string }> {
    const result: Array<{ ID: string; displayName: string }> = [];
    const topLevel = categories.filter(c => !c.ParentID);

    const processCategory = (cat: ListCategoryEntity, level: number) => {
      const indent = '\u00A0\u00A0'.repeat(level);
      result.push({ ID: cat.ID, displayName: `${indent}${cat.Name}` });

      const children = categories.filter(c => c.ParentID === cat.ID);
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

  openListMenu(event: Event, item: BrowseListItem) {
    event.stopPropagation();
    const mouseEvent = event as MouseEvent;
    this.selectedContextItem = item;
    this.contextMenuX = mouseEvent.clientX;
    this.contextMenuY = mouseEvent.clientY;
    this.showContextMenu = true;
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
    this.showCreateDialog = true;
    this.closeContextMenu();
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
      const md = new Metadata();
      const rv = new RunView();

      const newList = await md.GetEntityObject<ListEntity>('Lists');
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

      const itemsResult = await rv.RunView<ListDetailEntity>({
        EntityName: 'List Details',
        ExtraFilter: `ListID = '${listToDuplicate.ID}'`,
        ResultType: 'entity_object'
      });

      if (itemsResult.Success && itemsResult.Results.length > 0) {
        let copiedCount = 0;
        for (const item of itemsResult.Results) {
          const newItem = await md.GetEntityObject<ListDetailEntity>('List Details');
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
      const deleted = await listToDelete.Delete();
      if (deleted) {
        this.notificationService.CreateSimpleNotification(`"${listName}" deleted`, 'success', 3000);
      } else {
        const errorMessage = listToDelete.LatestResult?.Message || 'Unknown error occurred';
        console.error('Failed to delete list:', listToDelete.LatestResult);
        this.notificationService.CreateSimpleNotification(`Failed to delete list: ${errorMessage}`, 'error', 6000);
      }
      this.cancelDelete();
      await this.loadData();
    } catch (error) {
      console.error('Error deleting list:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.notificationService.CreateSimpleNotification(`Error deleting list: ${errorMessage}`, 'error', 6000);
    } finally {
      this.isDeleting = false;
      this.cdr.detectChanges();
    }
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
      const md = new Metadata();
      let list: ListEntity;

      if (this.editingList) {
        list = this.editingList;
      } else {
        list = await md.GetEntityObject<ListEntity>('Lists');
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
