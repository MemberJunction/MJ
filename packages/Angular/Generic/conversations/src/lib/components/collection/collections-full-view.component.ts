import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import { CollectionEntity, ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { DialogService } from '../../services/dialog.service';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { CollectionStateService } from '../../services/collection-state.service';
import { CollectionPermissionService, CollectionPermission } from '../../services/collection-permission.service';
import { ArtifactIconService } from '@memberjunction/ng-artifacts';
import { Subject, takeUntil } from 'rxjs';
import { CollectionViewMode, CollectionViewItem, CollectionSortBy, CollectionSortOrder } from '../../models/collection-view.model';

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
          <div class="breadcrumb-item">
            <i class="fas fa-home"></i>
            <a class="breadcrumb-link" (click)="navigateToRoot()">Collections</a>
          </div>
          <span class="breadcrumb-path" *ngIf="breadcrumbs.length > 0">
            <ng-container *ngFor="let crumb of breadcrumbs; let last = last">
              <i class="fas fa-chevron-right breadcrumb-separator"></i>
              <a class="breadcrumb-link"
                 [class.active]="last"
                 (click)="navigateTo(crumb)">
                {{ crumb.name }}
              </a>
            </ng-container>
          </span>
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
          <div class="dropdown-container" *ngIf="viewMode === 'grid'">
            <button class="btn-icon"
                    (click)="showSortDropdown = !showSortDropdown"
                    title="Sort options">
              <i class="fas fa-sort"></i>
            </button>
            <div class="dropdown-menu" *ngIf="showSortDropdown">
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
          </div>

          <!-- Search -->
          <div class="search-container">
            <i class="fas fa-search"></i>
            <input type="text"
                   class="search-input"
                   placeholder="Search..."
                   [(ngModel)]="searchQuery"
                   (ngModelChange)="onSearchChange($event)">
            <button class="search-clear"
                    *ngIf="searchQuery"
                    (click)="searchQuery = ''; onSearchChange('')"
                    title="Clear search">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <!-- New dropdown -->
          <div class="dropdown-container" *ngIf="canEditCurrent()">
            <button class="btn-primary"
                    (click)="showNewDropdown = !showNewDropdown">
              <i class="fas fa-plus"></i>
              <span>New</span>
              <i class="fas fa-chevron-down"></i>
            </button>
            <div class="dropdown-menu dropdown-menu-right" *ngIf="showNewDropdown">
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
          </div>

          <!-- Refresh button -->
          <button class="btn-icon" (click)="refresh()" title="Refresh">
            <i class="fas fa-sync"></i>
          </button>
        </div>
      </div>

      <!-- Multi-select toolbar (appears when items selected) -->
      <div class="selection-toolbar" *ngIf="selectedItems.size > 0">
        <div class="selection-info">
          <span class="selection-count">{{ selectedItems.size }} selected</span>
        </div>
        <div class="selection-actions">
          <button class="btn-toolbar" (click)="clearSelection()">
            <i class="fas fa-times"></i>
            Clear Selection
          </button>
          <button class="btn-toolbar btn-danger" (click)="deleteSelected()">
            <i class="fas fa-trash"></i>
            Delete Selected
          </button>
        </div>
      </div>

      <!-- Content area -->
      <div class="collections-content">
        <!-- Loading state -->
        <div *ngIf="isLoading" class="loading-state">
          <mj-loading text="Loading collections..." size="large"></mj-loading>
        </div>

        <!-- Empty state -->
        <div *ngIf="!isLoading && unifiedItems.length === 0" class="empty-state">
          <i class="fas fa-folder-open"></i>

          <!-- Search returned no results -->
          <ng-container *ngIf="searchQuery">
            <h3>No items found</h3>
            <p>Try adjusting your search</p>
          </ng-container>

          <!-- Empty root level -->
          <ng-container *ngIf="!searchQuery && !currentCollectionId">
            <h3>No collections yet</h3>
            <p>Create your first collection to get started</p>
            <button class="btn-primary"
                    (click)="createCollection()"
                    *ngIf="canEditCurrent()">
              <i class="fas fa-plus"></i>
              Create Collection
            </button>
          </ng-container>

          <!-- Empty collection (has parent) -->
          <ng-container *ngIf="!searchQuery && currentCollectionId">
            <h3>This collection is empty</h3>
            <p>Use the <strong>New</strong> button above to add collections or artifacts</p>
          </ng-container>
        </div>

        <!-- Grid view -->
        <div *ngIf="!isLoading && unifiedItems.length > 0 && viewMode === 'grid'"
             class="unified-grid"
             [class.select-mode]="isSelectMode">
          <div *ngFor="let item of unifiedItems"
               class="grid-item"
               [class.selected]="item.selected"
               [class.active]="item.type === 'artifact' && item.artifact?.ID === activeArtifactId"
               (click)="onItemClick(item, $event)"
               (dblclick)="onItemDoubleClick(item, $event)"
               (contextmenu)="onItemContextMenu(item, $event)">

            <!-- Selection checkbox (only visible in select mode) -->
            <div class="item-checkbox"
                 *ngIf="isSelectMode"
                 (click)="toggleItemSelection(item, $event)">
              <i class="fas"
                 [ngClass]="item.selected ? 'fa-check-circle' : 'fa-circle'"></i>
            </div>

            <!-- Folder item -->
            <div *ngIf="item.type === 'folder'"
                 class="grid-item-content"
                 [title]="item.description || item.name">
              <div class="grid-icon folder-icon">
                <i class="fas fa-folder"></i>
                <div class="shared-badge" *ngIf="item.isShared" title="Shared">
                  <i class="fas fa-users"></i>
                </div>
              </div>
              <div class="grid-info">
                <div class="grid-name">{{ item.name }}</div>
                <div class="grid-description" *ngIf="item.description">
                  {{ item.description }}
                </div>
                <div class="grid-meta" *ngIf="item.itemCount !== undefined">
                  {{ getItemCountText(item.itemCount) }}
                </div>
                <div class="grid-owner" *ngIf="item.isShared && item.owner">
                  <i class="fas fa-user"></i>
                  {{ item.owner }}
                </div>
              </div>
            </div>

            <!-- Artifact item -->
            <div *ngIf="item.type === 'artifact'"
                 class="grid-item-content"
                 [title]="item.description || item.name">
              <div class="grid-icon artifact-icon">
                <i class="fas" [ngClass]="item.icon"></i>
              </div>
              <div class="grid-info">
                <div class="grid-name">{{ item.name }}</div>
                <div class="grid-description" *ngIf="item.description">
                  {{ item.description }}
                </div>
                <div class="grid-meta">
                  <span class="version-badge" *ngIf="item.versionNumber">
                    v{{ item.versionNumber }}
                  </span>
                  <span class="artifact-type-badge" *ngIf="item.artifactType">
                    {{ item.artifactType }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- List view -->
        <div *ngIf="!isLoading && unifiedItems.length > 0 && viewMode === 'list'"
             class="unified-list"
             [class.select-mode]="isSelectMode">
          <table class="list-table">
            <thead>
              <tr>
                <th class="col-checkbox" *ngIf="isSelectMode">
                  <i class="fas"
                     [ngClass]="selectedItems.size === unifiedItems.length ? 'fa-check-square' : 'fa-square'"
                     (click)="selectedItems.size === unifiedItems.length ? clearSelection() : selectAll()"></i>
                </th>
                <th class="col-name sortable" (click)="setSortBy('name')">
                  <span>Name</span>
                  <i class="fas fa-sort" *ngIf="sortBy !== 'name'"></i>
                  <i class="fas" *ngIf="sortBy === 'name'"
                     [ngClass]="sortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down'"></i>
                </th>
                <th class="col-type sortable" (click)="setSortBy('type')">
                  <span>Type</span>
                  <i class="fas fa-sort" *ngIf="sortBy !== 'type'"></i>
                  <i class="fas" *ngIf="sortBy === 'type'"
                     [ngClass]="sortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down'"></i>
                </th>
                <th class="col-modified sortable" (click)="setSortBy('date')">
                  <span>Modified</span>
                  <i class="fas fa-sort" *ngIf="sortBy !== 'date'"></i>
                  <i class="fas" *ngIf="sortBy === 'date'"
                     [ngClass]="sortOrder === 'asc' ? 'fa-sort-up' : 'fa-sort-down'"></i>
                </th>
                <th class="col-owner">Owner</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of unifiedItems"
                  class="list-item"
                  [class.selected]="item.selected"
                  [class.active]="item.type === 'artifact' && item.artifact?.ID === activeArtifactId"
                  (click)="onItemClick(item, $event)"
                  (dblclick)="onItemDoubleClick(item, $event)"
                  (contextmenu)="onItemContextMenu(item, $event)">

                <td class="col-checkbox" *ngIf="isSelectMode">
                  <i class="fas"
                     [ngClass]="item.selected ? 'fa-check-circle' : 'fa-circle'"
                     (click)="toggleItemSelection(item, $event)"></i>
                </td>

                <td class="col-name">
                  <div class="list-name-cell">
                    <i class="fas"
                       [ngClass]="item.type === 'folder' ? 'fa-folder' : item.icon"></i>
                    <span>{{ item.name }}</span>
                    <i class="fas fa-users shared-indicator"
                       *ngIf="item.isShared"
                       title="Shared"></i>
                  </div>
                </td>

                <td class="col-type">
                  <span *ngIf="item.type === 'folder'">Folder</span>
                  <span *ngIf="item.type === 'artifact'" class="artifact-type-badge">
                    {{ item.artifactType }}
                  </span>
                </td>

                <td class="col-modified">
                  <span *ngIf="item.lastModified">
                    {{ item.lastModified | date:'short' }}
                  </span>
                </td>

                <td class="col-owner">
                  <span *ngIf="item.owner">{{ item.owner }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modals (unchanged) -->
    <mj-collection-form-modal
      [isOpen]="isFormModalOpen"
      [collection]="editingCollection"
      [parentCollection]="currentCollection || undefined"
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
    /* Main container */
    .collections-view {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #FAFAFA;
      position: relative;
    }

    /* Header */
    .collections-header {
      display: flex;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid #E5E7EB;
      gap: 16px;
      background: white;
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
      color: #6B7280;
      font-size: 14px;
    }

    .breadcrumb-link {
      color: #111827;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
      transition: color 150ms ease;
      font-size: 14px;
    }

    .breadcrumb-link:hover {
      color: #0076D6;
    }

    .breadcrumb-link.active {
      color: #6B7280;
      cursor: default;
    }

    .breadcrumb-path {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
    }

    .breadcrumb-separator {
      color: #D1D5DB;
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
      background: #007AFF;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 150ms ease;
    }

    .btn-primary:hover {
      background: #0051D5;
    }

    .btn-primary i.fa-chevron-down {
      font-size: 10px;
      margin-left: 2px;
    }

    .btn-icon {
      padding: 6px 10px;
      background: transparent;
      border: 1px solid #D1D5DB;
      border-radius: 6px;
      cursor: pointer;
      color: #6B7280;
      transition: all 150ms ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-icon:hover {
      background: #F9FAFB;
      color: #111827;
      border-color: #9CA3AF;
    }

    .btn-icon.active {
      background: #EFF6FF;
      color: #007AFF;
      border-color: #007AFF;
    }

    .btn-icon.active:hover {
      background: #DBEAFE;
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
      background: white;
      border: 1px solid #E5E7EB;
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
      color: #111827;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: background 100ms ease;
    }

    .dropdown-item:hover:not(:disabled) {
      background: #F3F4F6;
    }

    .dropdown-item:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .dropdown-item.active {
      background: #EFF6FF;
      color: #007AFF;
    }

    .dropdown-item i {
      font-size: 14px;
      width: 16px;
      text-align: center;
      color: #6B7280;
    }

    .dropdown-item.active i {
      color: #007AFF;
    }

    .dropdown-divider {
      height: 1px;
      background: #E5E7EB;
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
      color: #9CA3AF;
      font-size: 13px;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 6px 32px 6px 32px;
      border: 1px solid #D1D5DB;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
      transition: all 150ms ease;
    }

    .search-input:focus {
      border-color: #007AFF;
      box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
    }

    .search-clear {
      position: absolute;
      right: 6px;
      padding: 4px;
      background: transparent;
      border: none;
      color: #9CA3AF;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .search-clear:hover {
      background: #F3F4F6;
      color: #6B7280;
    }

    /* Selection toolbar */
    .selection-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 20px;
      background: #EFF6FF;
      border-bottom: 1px solid #BFDBFE;
    }

    .selection-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .selection-count {
      font-size: 13px;
      font-weight: 600;
      color: #1E40AF;
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
      background: white;
      border: 1px solid #D1D5DB;
      border-radius: 6px;
      color: #374151;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
    }

    .btn-toolbar:hover {
      background: #F9FAFB;
      border-color: #9CA3AF;
    }

    .btn-toolbar.btn-danger {
      color: #DC2626;
      border-color: #FCA5A5;
    }

    .btn-toolbar.btn-danger:hover {
      background: #FEE2E2;
      border-color: #DC2626;
    }

    /* Content area */
    .collections-content {
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
      height: 100%;
      color: #9CA3AF;
      text-align: center;
      padding: 48px 24px;
    }

    .empty-state i {
      font-size: 64px;
      margin-bottom: 24px;
      opacity: 0.3;
      color: #D1D5DB;
    }

    .empty-state h3 {
      margin: 0 0 8px 0;
      color: #374151;
      font-size: 18px;
      font-weight: 600;
    }

    .empty-state p {
      margin: 0 0 24px 0;
      font-size: 14px;
      color: #6B7280;
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
    }

    .grid-item {
      display: flex;
      flex-direction: column;
      padding: 12px;
      background: white;
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 150ms ease;
      position: relative;
      user-select: none;
    }

    .grid-item:hover {
      background: #F9FAFB;
      border-color: #D1D5DB;
    }

    .grid-item.selected {
      background: #EFF6FF;
      border-color: #007AFF;
    }

    .grid-item.active {
      background: #FEF3C7;
      border-color: #F59E0B;
      box-shadow: 0 0 0 1px #F59E0B;
    }

    .grid-item.active:hover {
      background: #FDE68A;
    }

    /* Select mode styling for grid */
    .unified-grid.select-mode .grid-item {
      cursor: pointer;
    }

    .unified-grid.select-mode .grid-item:hover {
      background: #EFF6FF;
      border-color: #93C5FD;
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
      color: #9CA3AF;
      transition: color 150ms ease;
    }

    .grid-item.selected .item-checkbox i,
    .item-checkbox:hover i {
      color: #007AFF;
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
      background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%);
    }

    .grid-icon.folder-icon i {
      font-size: 36px;
      color: white;
    }

    .grid-icon.artifact-icon {
      background: #F3F4F6;
    }

    .grid-icon.artifact-icon i {
      font-size: 32px;
      color: #6B7280;
    }

    .shared-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      background: #10B981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
    }

    .shared-badge i {
      font-size: 10px;
      color: white;
    }

    .grid-info {
      width: 100%;
      text-align: center;
    }

    .grid-name {
      font-size: 13px;
      font-weight: 500;
      color: #111827;
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
      color: #6B7280;
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
      color: #6B7280;
      margin-top: 4px;
    }

    .grid-owner {
      font-size: 11px;
      color: #6B7280;
      margin-top: 2px;
    }

    .grid-owner i {
      font-size: 10px;
      margin-right: 3px;
    }

    .version-badge {
      display: inline-block;
      padding: 2px 6px;
      background: #FEF3C7;
      color: #92400E;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      font-family: monospace;
      margin-right: 4px;
    }

    .artifact-type-badge {
      display: inline-block;
      padding: 2px 6px;
      background: #DBEAFE;
      color: #1E40AF;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    /* List view */
    .unified-list {
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      overflow: hidden;
    }

    .list-table {
      width: 100%;
      border-collapse: collapse;
    }

    .list-table thead {
      background: #F9FAFB;
      border-bottom: 1px solid #E5E7EB;
    }

    .list-table th {
      padding: 10px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .list-table th.sortable {
      cursor: pointer;
      user-select: none;
      transition: color 150ms ease;
    }

    .list-table th.sortable:hover {
      color: #007AFF;
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
      border-bottom: 1px solid #F3F4F6;
      transition: background 150ms ease;
      cursor: pointer;
      user-select: none;
    }

    .list-table tbody tr:last-child {
      border-bottom: none;
    }

    .list-table tbody tr:hover {
      background: #F9FAFB;
    }

    .list-table tbody tr.selected {
      background: #EFF6FF;
    }

    .list-table tbody tr.active {
      background: #FEF3C7;
      border-left: 3px solid #F59E0B;
    }

    .list-table tbody tr.active:hover {
      background: #FDE68A;
    }

    .list-table td {
      padding: 12px 16px;
      font-size: 13px;
      color: #374151;
    }

    .col-checkbox {
      width: 40px;
      text-align: center;
    }

    .col-checkbox i {
      font-size: 16px;
      color: #9CA3AF;
      cursor: pointer;
      transition: color 150ms ease;
    }

    .col-checkbox i:hover,
    .list-table tbody tr.selected .col-checkbox i {
      color: #007AFF;
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
      color: #6B7280;
      width: 20px;
      text-align: center;
    }

    .list-name-cell .fa-folder {
      color: #3B82F6;
    }

    .shared-indicator {
      font-size: 12px;
      color: #10B981;
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
  `]
})
export class CollectionsFullViewComponent implements OnInit, OnDestroy {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  @Output() collectionNavigated = new EventEmitter<{
    collectionId: string | null;
    versionId?: string | null;
  }>();

  public collections: CollectionEntity[] = [];
  public artifactVersions: Array<{ version: ArtifactVersionEntity; artifact: ArtifactEntity }> = [];
  public filteredCollections: CollectionEntity[] = [];
  public filteredArtifactVersions: Array<{ version: ArtifactVersionEntity; artifact: ArtifactEntity }> = [];
  public isLoading: boolean = false;
  public breadcrumbs: Array<{ id: string; name: string }> = [];
  public currentCollectionId: string | null = null;
  public currentCollection: CollectionEntity | null = null;

  public isFormModalOpen: boolean = false;
  public editingCollection?: CollectionEntity;
  public isArtifactModalOpen: boolean = false;

  public userPermissions: Map<string, CollectionPermission> = new Map();
  public isShareModalOpen: boolean = false;
  public sharingCollection: CollectionEntity | null = null;

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
  public isSelectMode: boolean = false; // Toggle for selection mode

  private destroy$ = new Subject<void>();
  private isNavigatingProgrammatically = false;

  constructor(
    private dialogService: DialogService,
    private artifactState: ArtifactStateService,
    private collectionState: CollectionStateService,
    private permissionService: CollectionPermissionService,
    private artifactIconService: ArtifactIconService
  ) {}

  ngOnInit() {
    // Subscribe to collection state changes for deep linking FIRST
    // This ensures that if there's a URL with collectionId, we set it before loading data
    this.subscribeToCollectionState();

    // Subscribe to artifact state changes to track active artifact
    this.subscribeToArtifactState();

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
    }
  }

  private async loadCollections(): Promise<void> {
    try {
      const rv = new RunView();

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

      const result = await rv.RunView<CollectionEntity>(
        {
          EntityName: 'MJ: Collections',
          ExtraFilter: filter,
          OrderBy: 'Name ASC',
          MaxRows: 1000,
          ResultType: 'entity_object'
        },
        this.currentUser
      );

      if (result.Success) {
        this.collections = result.Results || [];
        await this.loadUserPermissions();
        this.filteredCollections = [...this.collections];
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
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

  private async loadArtifacts(): Promise<void> {
    if (!this.currentCollectionId) {
      this.artifactVersions = [];
      this.filteredArtifactVersions = [];
      return;
    }

    try {
      this.artifactVersions = await this.artifactState.loadArtifactVersionsForCollection(
        this.currentCollectionId,
        this.currentUser
      );
      this.filteredArtifactVersions = [...this.artifactVersions];
    } catch (error) {
      console.error('Failed to load artifact versions:', error);
    }
  }

  async openCollection(collection: CollectionEntity): Promise<void> {
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
        const md = new Metadata();
        this.currentCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
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
   * Navigate to a collection by ID, building the breadcrumb trail
   * Used for deep linking from search results or URL parameters
   */
  async navigateToCollectionById(collectionId: string): Promise<void> {
    this.isNavigatingProgrammatically = true;
    try {
      console.log('📁 Navigating to collection by ID:', collectionId);

      // Load the target collection
      const md = new Metadata();
      const targetCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
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
        const parentCollection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
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

  async editCollection(collection: CollectionEntity): Promise<void> {
    const canEdit = await this.validatePermission(collection, 'edit');
    if (!canEdit) return;

    this.editingCollection = collection;
    this.isFormModalOpen = true;
  }

  async deleteCollection(collection: CollectionEntity): Promise<void> {
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
        await this.loadCollections();
      } catch (error) {
        console.error('Error deleting collection:', error);
        await this.dialogService.alert('Error', `An error occurred while deleting the collection: ${error}`);
      }
    }
  }

  private async deleteCollectionRecursive(collectionId: string): Promise<void> {
    const rv = new RunView();

    // Step 1: Find and delete all child collections recursively
    const childrenResult = await rv.RunView<CollectionEntity>(
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
    const md = new Metadata();
    const collection = await md.GetEntityObject<CollectionEntity>('MJ: Collections', this.currentUser);
    await collection.Load(collectionId);
    const deleted = await collection.Delete();

    if (!deleted) {
      throw new Error(`Failed to delete collection: ${collection.LatestResult?.Message || 'Unknown error'}`);
    }
  }

  async onCollectionSaved(collection: CollectionEntity): Promise<void> {
    this.isFormModalOpen = false;
    this.editingCollection = undefined;
    await this.loadCollections();
    // Reload current collection permission (it was cleared by loadUserPermissions)
    await this.loadCurrentCollectionPermission();
    // Rebuild unified list to show new collection
    this.buildUnifiedItemList();
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

  async onArtifactSaved(artifact: ArtifactEntity): Promise<void> {
    this.isArtifactModalOpen = false;
    await this.loadArtifacts();
  }

  onArtifactModalCancelled(): void {
    this.isArtifactModalOpen = false;
  }

  async removeArtifact(item: { version: ArtifactVersionEntity; artifact: ArtifactEntity }): Promise<void> {
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
        const rv = new RunView();
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
          await this.loadArtifacts();
        } else {
          await this.dialogService.alert('Error', 'Collection artifact link not found.');
        }
      } catch (error) {
        console.error('Error removing artifact version:', error);
        await this.dialogService.alert('Error', 'Failed to remove artifact version from collection.');
      }
    }
  }

  viewArtifact(item: { version: ArtifactVersionEntity; artifact: ArtifactEntity }): void {
    this.activeArtifactId = item.artifact.ID;
    this.artifactState.openArtifact(item.artifact.ID, item.version.VersionNumber);
  }

  // Permission validation and checking methods
  private async validatePermission(
    collection: CollectionEntity | null,
    requiredPermission: 'edit' | 'delete' | 'share'
  ): Promise<boolean> {
    // Owner has all permissions (including backwards compatibility for null OwnerID)
    if (!collection?.OwnerID || collection.OwnerID === this.currentUser.ID) {
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

  canEdit(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canEdit || false;
  }

  canDelete(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) return true;

    // Check permission record
    const permission = this.userPermissions.get(collection.ID);
    return permission?.canDelete || false;
  }

  canShare(collection: CollectionEntity): boolean {
    // Backwards compatibility: treat null OwnerID as owned by current user
    if (!collection.OwnerID || collection.OwnerID === this.currentUser.ID) return true;

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

  isShared(collection: CollectionEntity): boolean {
    // Collection is shared if user is not the owner and OwnerID is set
    return collection.OwnerID != null && collection.OwnerID !== this.currentUser.ID;
  }

  // Sharing methods
  async shareCollection(collection: CollectionEntity): Promise<void> {
    // Validate user has share permission
    const canShare = await this.validatePermission(collection, 'share');
    if (!canShare) return;

    this.sharingCollection = collection;
    this.isShareModalOpen = true;
  }

  async onPermissionsChanged(): Promise<void> {
    // Reload collections and permissions after sharing changes
    await this.loadCollections();
  }

  onShareModalCancelled(): void {
    this.isShareModalOpen = false;
    this.sharingCollection = null;
  }

  /**
   * Get the icon for an artifact using the centralized icon service.
   * Fallback priority: Plugin icon > Metadata icon > Hardcoded mapping > Generic icon
   */
  public getArtifactIcon(artifact: ArtifactEntity): string {
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
        itemCount: 0, // TODO: calculate actual count
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

    // Apply sorting
    this.unifiedItems = this.sortItems(items);
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
      // Clear selection when exiting select mode
      this.clearSelection();
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

    if (event.metaKey || event.ctrlKey) {
      // Cmd/Ctrl+Click: Toggle individual selection
      if (this.selectedItems.has(item.id)) {
        this.selectedItems.delete(item.id);
      } else {
        this.selectedItems.add(item.id);
      }
    } else if (event.shiftKey) {
      // Shift+Click: Select range (TODO: implement range selection)
      this.selectedItems.add(item.id);
    } else {
      // Regular click: Select only this item
      this.selectedItems.clear();
      this.selectedItems.add(item.id);
    }

    this.buildUnifiedItemList(); // Refresh to update selected states
  }

  /**
   * Multi-select: Select all items (Phase 3)
   */
  public selectAll(): void {
    this.selectedItems.clear();
    for (const item of this.unifiedItems) {
      this.selectedItems.add(item.id);
    }
    this.buildUnifiedItemList();
  }

  /**
   * Multi-select: Clear selection (Phase 3)
   */
  public clearSelection(): void {
    this.selectedItems.clear();
    this.buildUnifiedItemList();
  }

  /**
   * Multi-select: Delete selected items (Phase 3)
   */
  public async deleteSelected(): Promise<void> {
    if (this.selectedItems.size === 0) return;

    const confirmed = await this.dialogService.confirm({
      title: `Delete ${this.selectedItems.size} item(s)?`,
      message: 'This action cannot be undone.',
      dangerous: true
    });

    if (!confirmed) return;

    // TODO: Implement batch delete
    this.clearSelection();
  }

  /**
   * Get count of items in folder (Phase 1)
   */
  private async getCollectionItemCount(collectionId: string): Promise<number> {
    // TODO: Query for actual count
    return 0;
  }

  /**
   * Handle clicking on unified item
   * In select mode: toggles selection
   * In normal mode: opens item (folder or artifact)
   */
  public onItemClick(item: CollectionViewItem, event?: MouseEvent): void {
    // In select mode, single click toggles selection
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
    this.buildUnifiedItemList();
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
   * Handle right-click context menu
   * Opens browser context menu for now - can be extended with custom menu
   */
  public onItemContextMenu(item: CollectionViewItem, event: MouseEvent): void {
    // Select the item if not already selected
    if (!item.selected) {
      this.clearSelection();
      this.toggleItemSelection(item, event);
    }

    // Allow browser's default context menu for now
    // Future enhancement: implement custom context menu with actions
    // event.preventDefault();
  }
}
