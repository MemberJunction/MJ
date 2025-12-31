import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { ListEntity, ListCategoryEntity, ListDetailEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { TabService } from '@memberjunction/ng-base-application';
import { DialogService } from '@progress/kendo-angular-dialog';

export function LoadListsMyListsResource() {
  const test = new ListsMyListsResource(null!, null!, null!);
}

interface ListViewModel {
  list: ListEntity;
  itemCount: number;
  entityName: string;
}

interface CategoryNode {
  category: ListCategoryEntity | null;
  lists: ListViewModel[];
  children: CategoryNode[];
  isExpanded: boolean;
}

@RegisterClass(BaseResourceComponent, 'ListsMyListsResource')
@Component({
  selector: 'mj-lists-my-lists-resource',
  template: `
    <div class="lists-my-lists-container">
      <!-- Header -->
      <div class="lists-header">
        <div class="header-title">
          <i class="fa-solid fa-list-check"></i>
          <h2>My Lists</h2>
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
          <button class="btn-create" (click)="createNewList()">
            <i class="fa-solid fa-plus"></i>
            <span>New List</span>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-container" *ngIf="isLoading">
        <mj-loading text="Loading lists..." size="medium"></mj-loading>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!isLoading && filteredLists.length === 0 && !searchTerm">
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

      <!-- No Results State -->
      <div class="empty-state search-empty" *ngIf="!isLoading && filteredLists.length === 0 && searchTerm">
        <div class="empty-state-icon-wrapper search">
          <i class="fa-solid fa-search"></i>
        </div>
        <h3>No Results Found</h3>
        <p>No lists match "<strong>{{searchTerm}}</strong>"</p>
        <p class="empty-hint">Try a different search term or clear your search.</p>
        <button class="btn-clear" (click)="clearSearch()">Clear Search</button>
      </div>

      <!-- Lists Grid -->
      <div class="lists-content" *ngIf="!isLoading && filteredLists.length > 0">
        <!-- View Toggle -->
        <div class="view-controls">
          <button
            class="view-toggle"
            [class.active]="viewMode === 'grid'"
            (click)="viewMode = 'grid'"
            title="Grid view">
            <i class="fa-solid fa-grip"></i>
          </button>
          <button
            class="view-toggle"
            [class.active]="viewMode === 'list'"
            (click)="viewMode = 'list'"
            title="List view">
            <i class="fa-solid fa-list"></i>
          </button>
          <span class="list-count">{{filteredLists.length}} list{{filteredLists.length !== 1 ? 's' : ''}}</span>
        </div>

        <!-- Category Tree View -->
        <div class="category-tree" *ngIf="viewMode === 'list'">
          <ng-container *ngFor="let node of categoryTree">
            <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { node: node, depth: 0 }"></ng-container>
          </ng-container>
        </div>

        <!-- Grid View -->
        <div class="lists-grid" *ngIf="viewMode === 'grid'" role="list" aria-label="My Lists">
          <div
            class="list-card"
            *ngFor="let item of filteredLists"
            (click)="openList(item.list)"
            (keydown.enter)="openList(item.list)"
            (keydown.space)="openList(item.list); $event.preventDefault()"
            tabindex="0"
            role="listitem"
            [attr.aria-label]="item.list.Name + ' - ' + item.entityName + ' - ' + item.itemCount + ' items'">
            <div class="card-header">
              <div class="card-icon" [style.background-color]="getEntityColor(item.list.Entity)" aria-hidden="true">
                <i [class]="getEntityIcon(item.list.Entity)"></i>
              </div>
              <div class="card-menu">
                <button class="menu-btn" (click)="openListMenu($event, item.list)" aria-label="More options for {{item.list.Name}}">
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
              <span class="category-tag" *ngIf="item.list.CategoryID">
                <i class="fa-solid fa-folder"></i>
                {{getCategoryName(item.list.CategoryID)}}
              </span>
              <span class="date-info">Updated {{formatDate(item.list.__mj_UpdatedAt)}}</span>
            </div>
          </div>
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
              class="list-row"
              *ngFor="let item of node.lists"
              (click)="openList(item.list)"
              (keydown.enter)="openList(item.list)"
              (keydown.space)="openList(item.list); $event.preventDefault()"
              tabindex="0"
              role="listitem"
              [attr.aria-label]="item.list.Name + ' - ' + item.entityName + ' - ' + item.itemCount + ' items'">
              <div class="list-icon" [style.background-color]="getEntityColor(item.list.Entity)" aria-hidden="true">
                <i [class]="getEntityIcon(item.list.Entity)"></i>
              </div>
              <div class="list-info">
                <span class="list-name">{{item.list.Name}}</span>
                <span class="list-meta">{{item.entityName}} &middot; {{item.itemCount}} items</span>
              </div>
              <div class="list-actions">
                <button class="action-btn" (click)="openListMenu($event, item.list)" [attr.aria-label]="'More options for ' + item.list.Name">
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

      <!-- Create/Edit List Dialog -->
      <kendo-dialog
        *ngIf="showCreateDialog"
        [title]="editingList ? 'Edit List' : 'Create New List'"
        (close)="closeCreateDialog()"
        [width]="500">
        <div class="create-list-form">
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
          <div class="form-group">
            <label>Entity *</label>
            <kendo-dropdownlist
              [data]="availableEntities"
              [textField]="'Name'"
              [valueField]="'ID'"
              [(ngModel)]="selectedEntityId"
              [disabled]="!!editingList"
              [filterable]="true"
              (filterChange)="filterEntities($event)"
              placeholder="Select an entity">
            </kendo-dropdownlist>
          </div>
          <div class="form-group">
            <label>Category</label>
            <kendo-dropdownlist
              [data]="flatCategories"
              [textField]="'displayName'"
              [valueField]="'ID'"
              [(ngModel)]="selectedCategoryId"
              [valuePrimitive]="true"
              placeholder="No category">
            </kendo-dropdownlist>
          </div>
        </div>
        <kendo-dialog-actions>
          <button kendoButton (click)="closeCreateDialog()" [disabled]="isSaving">Cancel</button>
          <button
            kendoButton
            [primary]="true"
            (click)="saveList()"
            [disabled]="!newListName || !selectedEntityId || isSaving">
            <span *ngIf="isSaving" class="k-icon k-i-loading"></span>
            {{isSaving ? 'Saving...' : (editingList ? 'Save' : 'Create')}}
          </button>
        </kendo-dialog-actions>
      </kendo-dialog>

      <!-- Context Menu -->
      <kendo-popup
        *ngIf="showContextMenu"
        [anchor]="contextMenuAnchor"
        (anchorViewportLeave)="closeContextMenu()">
        <div class="context-menu">
          <button class="menu-item" (click)="editList()">
            <i class="fa-solid fa-pen"></i>
            Edit
          </button>
          <button class="menu-item" (click)="duplicateList()">
            <i class="fa-solid fa-copy"></i>
            Duplicate
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item danger" (click)="deleteList()">
            <i class="fa-solid fa-trash"></i>
            Delete
          </button>
        </div>
      </kendo-popup>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .lists-my-lists-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f5f7fa;
      overflow: hidden;
    }

    /* Header */
    .lists-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
      flex-shrink: 0;
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
      gap: 16px;
    }

    .search-box {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-box i.fa-search {
      position: absolute;
      left: 12px;
      color: #999;
    }

    .search-box input {
      padding: 8px 36px 8px 36px;
      border: 1px solid #ddd;
      border-radius: 20px;
      font-size: 14px;
      width: 250px;
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
      padding: 4px;
    }

    .clear-search:hover {
      color: #666;
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

    .search-empty .empty-state-icon-wrapper {
      margin-bottom: 20px;
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
    }

    .btn-clear:hover {
      background: #e0e0e0;
    }

    /* Content */
    .lists-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    }

    .view-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .view-toggle {
      padding: 8px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      color: #666;
      cursor: pointer;
      transition: all 0.2s;
    }

    .view-toggle:hover {
      background: #f5f5f5;
    }

    .view-toggle.active {
      background: #2196F3;
      border-color: #2196F3;
      color: white;
    }

    .list-count {
      margin-left: auto;
      color: #999;
      font-size: 14px;
    }

    /* Grid View */
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

    .category-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #666;
      background: #e8f4fd;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .date-info {
      font-size: 12px;
      color: #999;
    }

    /* Category Tree */
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

    .list-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px 12px 40px;
      cursor: pointer;
      transition: background 0.2s;
      outline: none;
    }

    .list-row:hover {
      background: #f5f5f5;
    }

    .list-row:focus {
      background: #e3f2fd;
    }

    .list-row:focus-visible {
      background: #e3f2fd;
      box-shadow: inset 3px 0 0 #2196F3;
    }

    .list-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
      flex-shrink: 0;
    }

    .list-info {
      flex: 1;
      min-width: 0;
    }

    .list-name {
      display: block;
      font-weight: 500;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .list-meta {
      font-size: 12px;
      color: #999;
    }

    .list-actions {
      display: flex;
      gap: 4px;
    }

    .action-btn {
      background: none;
      border: none;
      padding: 4px 8px;
      color: #999;
      cursor: pointer;
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .list-row:hover .action-btn {
      opacity: 1;
    }

    .action-btn:hover {
      background: #e0e0e0;
      color: #666;
    }

    /* Context Menu */
    .context-menu {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      min-width: 160px;
      padding: 4px 0;
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

    /* Create Dialog */
    .create-list-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 13px;
      font-weight: 500;
      color: #666;
    }

    .form-input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .form-input:focus {
      outline: none;
      border-color: #2196F3;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .lists-header {
        flex-direction: column;
        gap: 16px;
        align-items: stretch;
      }

      .header-actions {
        flex-direction: column;
      }

      .search-box input {
        width: 100%;
      }

      .btn-create {
        width: 100%;
        justify-content: center;
      }

      .lists-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ListsMyListsResource extends BaseResourceComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  isLoading = true;
  searchTerm = '';
  viewMode: 'grid' | 'list' = 'grid';

  allLists: ListViewModel[] = [];
  filteredLists: ListViewModel[] = [];
  categories: ListCategoryEntity[] = [];
  categoryTree: CategoryNode[] = [];
  flatCategories: Array<{ ID: string | null; displayName: string }> = [];
  availableEntities: Array<{ ID: string; Name: string }> = [];
  filteredEntities: Array<{ ID: string; Name: string }> = [];

  // Context menu
  showContextMenu = false;
  contextMenuAnchor: Element | null = null;
  selectedContextList: ListEntity | null = null;

  // Create/Edit dialog
  showCreateDialog = false;
  editingList: ListEntity | null = null;
  newListName = '';
  newListDescription = '';
  selectedEntityId = '';
  selectedCategoryId: string | null = null;

  // Operation states
  isSaving = false;
  isDeleting = false;

  private categoryMap: Map<string, ListCategoryEntity> = new Map();
  private entityColorMap: Map<string, string> = new Map();
  private entityIconMap: Map<string, string> = new Map();

  constructor(
    private cdr: ChangeDetectorRef,
    private tabService: TabService,
    private dialogService: DialogService
  ) {
    super();
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
      const userId = md.CurrentUser?.ID;

      if (!userId) {
        console.error('No current user');
        return;
      }

      // Load lists, categories, and item counts in parallel
      const [listsResult, categoriesResult, detailsResult] = await rv.RunViews([
        {
          EntityName: 'Lists',
          ExtraFilter: `UserID = '${userId}'`,
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
          ExtraFilter: `ListID IN (SELECT ID FROM __mj.List WHERE UserID = '${userId}')`,
          ResultType: 'simple'
        }
      ]);

      if (!listsResult.Success || !categoriesResult.Success) {
        console.error('Failed to load lists data');
        return;
      }

      const lists = listsResult.Results as ListEntity[];
      this.categories = categoriesResult.Results as ListCategoryEntity[];
      const details = detailsResult.Results as Array<{ ListID: string }>;

      // Build category map
      this.categoryMap.clear();
      for (const cat of this.categories) {
        this.categoryMap.set(cat.ID, cat);
      }

      // Count items per list
      const itemCounts = new Map<string, number>();
      for (const detail of details) {
        const count = itemCounts.get(detail.ListID) || 0;
        itemCounts.set(detail.ListID, count + 1);
      }

      // Build entity info
      const entities = md.Entities;
      for (const entity of entities) {
        this.entityColorMap.set(entity.Name, this.generateEntityColor(entity.Name));
        this.entityIconMap.set(entity.Name, entity.Icon || 'fa-solid fa-table');
      }

      // Build list view models
      this.allLists = lists.map(list => ({
        list,
        itemCount: itemCounts.get(list.ID) || 0,
        entityName: list.Entity || 'Unknown'
      }));

      // Build available entities for dropdown
      this.availableEntities = entities
        .filter(e => e.IncludeInAPI)
        .map(e => ({ ID: e.ID, Name: e.Name }))
        .sort((a, b) => a.Name.localeCompare(b.Name));
      this.filteredEntities = [...this.availableEntities];

      // Build flat categories for dropdown
      this.flatCategories = [
        { ID: null, displayName: '(No Category)' },
        ...this.buildFlatCategories(this.categories)
      ];

      this.applyFilter();
      this.buildCategoryTree();
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private buildFlatCategories(categories: ListCategoryEntity[], parentName = '', depth = 0): Array<{ ID: string; displayName: string }> {
    const result: Array<{ ID: string; displayName: string }> = [];
    const topLevel = categories.filter(c => !c.ParentID);

    const processCategory = (cat: ListCategoryEntity, prefix: string, level: number) => {
      const indent = '\u00A0\u00A0'.repeat(level);
      result.push({ ID: cat.ID, displayName: `${indent}${cat.Name}` });

      const children = categories.filter(c => c.ParentID === cat.ID);
      for (const child of children) {
        processCategory(child, prefix, level + 1);
      }
    };

    for (const cat of topLevel) {
      processCategory(cat, '', 0);
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
    const uncategorizedLists: ListViewModel[] = [];
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

  onSearchChange(term: string) {
    this.applyFilter();
    this.buildCategoryTree();
  }

  clearSearch() {
    this.searchTerm = '';
    this.applyFilter();
    this.buildCategoryTree();
  }

  private applyFilter() {
    if (!this.searchTerm) {
      this.filteredLists = [...this.allLists];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredLists = this.allLists.filter(item =>
        item.list.Name.toLowerCase().includes(term) ||
        (item.list.Description && item.list.Description.toLowerCase().includes(term)) ||
        item.entityName.toLowerCase().includes(term)
      );
    }
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

  getCategoryName(categoryId: string): string {
    return this.categoryMap.get(categoryId)?.Name || 'Unknown';
  }

  getEntityColor(entityName: string): string {
    return this.entityColorMap.get(entityName) || '#607D8B';
  }

  getEntityIcon(entityName: string): string {
    return this.entityIconMap.get(entityName) || 'fa-solid fa-table';
  }

  private generateEntityColor(entityName: string): string {
    // Generate a consistent color from entity name
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

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return d.toLocaleDateString();
  }

  openList(list: ListEntity) {
    // Get the application ID from the resource data
    const appId = this.Data?.ApplicationId || '';

    // Open the list in a new tab using the ListDetailResource
    this.tabService.OpenList(list.ID, list.Name, appId);
  }

  openListMenu(event: Event, list: ListEntity) {
    event.stopPropagation();
    this.selectedContextList = list;
    this.contextMenuAnchor = event.target as Element;
    this.showContextMenu = true;
  }

  closeContextMenu() {
    this.showContextMenu = false;
    this.selectedContextList = null;
    this.contextMenuAnchor = null;
  }

  createNewList() {
    this.editingList = null;
    this.newListName = '';
    this.newListDescription = '';
    this.selectedEntityId = '';
    this.selectedCategoryId = null;
    this.showCreateDialog = true;
  }

  editList() {
    if (!this.selectedContextList) return;

    this.editingList = this.selectedContextList;
    this.newListName = this.selectedContextList.Name;
    this.newListDescription = this.selectedContextList.Description || '';
    this.selectedEntityId = this.selectedContextList.EntityID;
    this.selectedCategoryId = this.selectedContextList.CategoryID || null;
    this.showCreateDialog = true;
    this.closeContextMenu();
  }

  async duplicateList() {
    if (!this.selectedContextList) return;

    const listToDuplicate = this.selectedContextList;
    this.closeContextMenu();

    // Show loading state
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const md = new Metadata();
      const newList = await md.GetEntityObject<ListEntity>('Lists');
      newList.Name = `${listToDuplicate.Name} (Copy)`;
      newList.Description = listToDuplicate.Description;
      newList.EntityID = listToDuplicate.EntityID;
      newList.CategoryID = listToDuplicate.CategoryID;
      newList.UserID = md.CurrentUser!.ID;

      await newList.Save();
      await this.loadData();
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteList() {
    if (!this.selectedContextList) return;

    const listToDelete = this.selectedContextList;
    this.closeContextMenu();

    const confirmDialog = this.dialogService.open({
      title: 'Delete List',
      content: `Are you sure you want to delete "${listToDelete.Name}"? This will also remove all items in the list.`,
      actions: [
        { text: 'Cancel' },
        { text: 'Delete', themeColor: 'error' }
      ],
      width: 450,
      height: 200
    });

    try {
      const result = await firstValueFrom(confirmDialog.result);
      if (result && (result as { text: string }).text === 'Delete') {
        // Show loading state during delete
        this.isDeleting = true;
        this.isLoading = true;
        this.cdr.detectChanges();

        try {
          await listToDelete.Delete();
          await this.loadData();
        } finally {
          this.isDeleting = false;
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      }
    } catch {
      // Dialog was closed without action
    }
  }

  closeCreateDialog() {
    this.showCreateDialog = false;
    this.editingList = null;
  }

  filterEntities(filter: string) {
    const term = filter.toLowerCase();
    this.filteredEntities = this.availableEntities.filter(e =>
      e.Name.toLowerCase().includes(term)
    );
  }

  async saveList() {
    this.isSaving = true;
    this.cdr.detectChanges();

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
      list.Description = this.newListDescription || undefined;
      list.CategoryID = this.selectedCategoryId || undefined;

      const saved = await list.Save();
      if (saved) {
        this.closeCreateDialog();
        await this.loadData();
      }
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'My Lists';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-list-check';
  }
}
