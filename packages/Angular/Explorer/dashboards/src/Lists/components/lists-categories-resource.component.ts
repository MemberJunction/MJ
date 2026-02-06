import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, ListCategoryEntity, ListEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export function LoadListsCategoriesResource() {
  // tree shaker 
}

interface CategoryViewModel {
  category: ListCategoryEntity;
  listCount: number;
  childCount: number;
  depth: number;
  isExpanded: boolean;
}

@RegisterClass(BaseResourceComponent, 'ListsCategoriesResource')
@Component({
  standalone: false,
  selector: 'mj-lists-categories-resource',
  template: `
    <div class="lists-categories-container">
      <!-- Header -->
      <div class="categories-header">
        <div class="header-title">
          <i class="fa-solid fa-tags"></i>
          <h2>List Categories</h2>
        </div>
        <div class="header-actions">
          <button class="btn-create" (click)="createCategory()">
            <i class="fa-solid fa-plus"></i>
            <span>New Category</span>
          </button>
        </div>
      </div>
    
      <!-- Loading State -->
      @if (isLoading) {
        <div class="loading-container">
          <mj-loading text="Loading categories..." size="medium"></mj-loading>
        </div>
      }
    
      <!-- Empty State -->
      @if (!isLoading && categoryViewModels.length === 0) {
        <div class="empty-state">
          <div class="empty-state-icon-wrapper">
            <div class="icon-bg"></div>
            <i class="fa-solid fa-folder-tree"></i>
          </div>
          <h3>No Categories Yet</h3>
          <p>Categories help you organize lists into logical groups.</p>
          <div class="empty-state-features">
            <div class="feature-item">
              <i class="fa-solid fa-check-circle"></i>
              <span>Create hierarchical folder structures</span>
            </div>
            <div class="feature-item">
              <i class="fa-solid fa-check-circle"></i>
              <span>Quickly find related lists</span>
            </div>
          </div>
          <button class="btn-create-large" (click)="createCategory()">
            <i class="fa-solid fa-plus"></i>
            Create Your First Category
          </button>
        </div>
      }
    
      <!-- Categories Content -->
      @if (!isLoading && categoryViewModels.length > 0) {
        <div class="categories-content">
          <div class="categories-layout">
            <!-- Category Tree -->
            <div class="category-tree-panel">
              <div class="panel-header">
                <h3>Categories</h3>
                <span class="count-badge">{{categories.length}}</span>
              </div>
              <div class="tree-content" role="tree" aria-label="Category tree">
                @for (vm of getTopLevelCategories(); track vm) {
                  <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { vm: vm }"></ng-container>
                }
              </div>
            </div>
            <!-- Category Details -->
            @if (selectedCategory) {
              <div class="category-detail-panel">
                <div class="panel-header">
                  <h3>Category Details</h3>
                  <div class="panel-actions">
                    <button class="icon-btn" (click)="editCategory()" title="Edit">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="icon-btn danger" (click)="deleteCategory()" title="Delete">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
                <div class="detail-content">
                  <div class="detail-field">
                    <label>Name</label>
                    <span class="field-value">{{selectedCategory.Name}}</span>
                  </div>
                  @if (selectedCategory.Description) {
                    <div class="detail-field">
                      <label>Description</label>
                      <span class="field-value">{{selectedCategory.Description}}</span>
                    </div>
                  }
                  <div class="detail-field">
                    <label>Parent Category</label>
                    <span class="field-value">
                      {{getParentCategoryName(selectedCategory) || '(Top Level)'}}
                    </span>
                  </div>
                  <div class="detail-stats">
                    <div class="stat-item">
                      <span class="stat-value">{{getSelectedCategoryListCount()}}</span>
                      <span class="stat-label">Lists</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-value">{{getSelectedCategoryChildCount()}}</span>
                      <span class="stat-label">Subcategories</span>
                    </div>
                  </div>
                  <!-- Lists in this category -->
                  @if (selectedCategoryLists.length > 0) {
                    <div class="category-lists">
                      <h4>Lists in this category</h4>
                      <div class="mini-list">
                        @for (list of selectedCategoryLists; track list) {
                          <div class="mini-list-item">
                            <i class="fa-solid fa-list"></i>
                            <span>{{list.Name}}</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- No Selection State -->
            @if (!selectedCategory) {
              <div class="category-detail-panel empty">
                <div class="no-selection">
                  <i class="fa-solid fa-arrow-left"></i>
                  <p>Select a category to view details</p>
                </div>
              </div>
            }
          </div>
        </div>
      }
    
      <!-- Category Node Template -->
      <ng-template #categoryNodeTemplate let-vm="vm">
        <div class="category-node" [style.padding-left.px]="vm.depth * 20">
          <div
            class="node-content"
            [class.selected]="selectedCategory?.ID === vm.category.ID"
            (click)="selectCategory(vm.category)"
            (keydown.enter)="selectCategory(vm.category)"
            (keydown.space)="selectCategory(vm.category); $event.preventDefault()"
            (keydown.arrowRight)="expandNode($event, vm)"
            (keydown.arrowLeft)="collapseNode($event, vm)"
            tabindex="0"
            role="treeitem"
            [attr.aria-expanded]="hasChildren(vm.category) ? vm.isExpanded : null"
            [attr.aria-selected]="selectedCategory?.ID === vm.category.ID"
            [attr.aria-label]="vm.category.Name + ' - ' + vm.listCount + ' lists'">
            @if (hasChildren(vm.category)) {
              <button
                class="expand-btn"
                (click)="toggleExpand($event, vm)"
                tabindex="-1"
                aria-hidden="true">
                <i [class]="vm.isExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"></i>
              </button>
            }
            @if (!hasChildren(vm.category)) {
              <span class="expand-placeholder"></span>
            }
            <i class="fa-solid fa-folder" [class.fa-folder-open]="vm.isExpanded" aria-hidden="true"></i>
            <span class="node-name">{{vm.category.Name}}</span>
            <span class="node-count" aria-hidden="true">{{vm.listCount}}</span>
          </div>
          @if (vm.isExpanded && hasChildren(vm.category)) {
            <div class="node-children" role="group">
              @for (childVm of getChildCategories(vm.category); track childVm) {
                <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { vm: childVm }"></ng-container>
              }
            </div>
          }
        </div>
      </ng-template>
    
      <!-- Create/Edit Dialog -->
      @if (showDialog) {
        <div class="modal-overlay" (click)="closeDialog()">
          <div class="modal-dialog" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{editingCategory ? 'Edit Category' : 'Create Category'}}</h3>
              <button class="modal-close" (click)="closeDialog()" [disabled]="isSaving">
                <i class="fa-solid fa-times"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="category-form">
                <div class="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    [(ngModel)]="dialogName"
                    placeholder="Enter category name"
                    class="form-input" />
                </div>
                <div class="form-group">
                  <label>Description</label>
                  <textarea
                    [(ngModel)]="dialogDescription"
                    placeholder="Optional description"
                    class="form-input"
                  rows="3"></textarea>
                </div>
                <div class="form-group">
                  <label>Parent Category</label>
                  <select
                    [(ngModel)]="dialogParentId"
                    class="form-input">
                    @for (parent of availableParents; track parent) {
                      <option [ngValue]="parent.ID">{{parent.displayName}}</option>
                    }
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button
                class="btn-primary"
                (click)="saveCategory()"
                [disabled]="!dialogName || isSaving">
                @if (isSaving) {
                  <i class="fa-solid fa-spinner fa-spin"></i>
                }
                {{isSaving ? 'Saving...' : (editingCategory ? 'Save' : 'Create')}}
              </button>
              <button class="btn-secondary" (click)="closeDialog()" [disabled]="isSaving">Cancel</button>
            </div>
          </div>
        </div>
      }
    
      <!-- Delete Confirmation Dialog -->
      @if (showDeleteConfirm) {
        <div class="modal-overlay" (click)="cancelDelete()">
          <div class="modal-dialog modal-sm" (click)="$event.stopPropagation()">
            <div class="modal-header danger">
              <h3>Delete Category</h3>
              <button class="modal-close" (click)="cancelDelete()">
                <i class="fa-solid fa-times"></i>
              </button>
            </div>
            <div class="modal-body">
              <p>{{deleteConfirmMessage}}</p>
            </div>
            <div class="modal-footer">
              <button class="btn-danger" (click)="confirmDelete()">
                Delete
              </button>
              <button class="btn-secondary" (click)="cancelDelete()">Cancel</button>
            </div>
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

    .lists-categories-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f5f7fa;
      overflow: hidden;
    }

    /* Header */
    .categories-header {
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
      max-width: 420px;
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
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(33, 150, 243, 0.1) 0%, rgba(33, 150, 243, 0.05) 100%);
    }

    .empty-state-icon-wrapper > i {
      position: relative;
      font-size: 48px;
      color: #2196F3;
      z-index: 1;
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

    .empty-state-features {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 16px 0 24px;
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

    /* Content Layout */
    .categories-content {
      flex: 1;
      padding: 16px 24px;
      overflow: hidden;
    }

    .categories-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      height: 100%;
    }

    .category-tree-panel,
    .category-detail-panel {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .count-badge {
      font-size: 12px;
      color: #999;
      background: #f0f0f0;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .panel-actions {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      background: none;
      border: none;
      padding: 6px 8px;
      color: #666;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      background: #f0f0f0;
      color: #333;
    }

    .icon-btn.danger:hover {
      background: #ffebee;
      color: #d32f2f;
    }

    /* Tree Content */
    .tree-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .category-node {
      user-select: none;
    }

    .node-content {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .node-content:hover {
      background: #f5f5f5;
    }

    .node-content:focus {
      outline: none;
      background: #e8f4fd;
    }

    .node-content:focus-visible {
      outline: 2px solid #2196F3;
      outline-offset: -2px;
      background: #e8f4fd;
    }

    .node-content.selected {
      background: #e3f2fd;
    }

    .node-content.selected:focus-visible {
      outline: 2px solid #1976D2;
    }

    .expand-btn {
      background: none;
      border: none;
      padding: 2px;
      color: #999;
      cursor: pointer;
      width: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .expand-btn:hover {
      color: #666;
    }

    .expand-placeholder {
      width: 20px;
    }

    .node-content .fa-folder,
    .node-content .fa-folder-open {
      color: #ffc107;
    }

    .node-name {
      flex: 1;
      font-size: 14px;
      color: #333;
    }

    .node-count {
      font-size: 12px;
      color: #999;
      background: #f0f0f0;
      padding: 1px 6px;
      border-radius: 8px;
    }

    /* Detail Panel */
    .detail-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
    }

    .detail-field {
      margin-bottom: 16px;
    }

    .detail-field label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .field-value {
      font-size: 14px;
      color: #333;
    }

    .detail-stats {
      display: flex;
      gap: 24px;
      margin: 24px 0;
      padding: 16px;
      background: #f5f7fa;
      border-radius: 8px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: #2196F3;
    }

    .stat-label {
      font-size: 12px;
      color: #999;
    }

    .category-lists h4 {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 600;
      color: #666;
    }

    .mini-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .mini-list-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #f5f7fa;
      border-radius: 4px;
      font-size: 13px;
      color: #333;
    }

    .mini-list-item i {
      color: #999;
    }

    /* No Selection */
    .category-detail-panel.empty {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .no-selection {
      text-align: center;
      color: #999;
    }

    .no-selection i {
      font-size: 32px;
      margin-bottom: 12px;
    }

    .no-selection p {
      margin: 0;
    }

    /* Form */
    .category-form {
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

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal-dialog {
      background: white;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      width: 450px;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      animation: slideIn 0.2s ease-out;
    }

    .modal-dialog.modal-sm {
      width: 400px;
    }

    @keyframes slideIn {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e0e0e0;
    }

    .modal-header.danger {
      background: #ffebee;
      border-bottom-color: #ffcdd2;
    }

    .modal-header.danger h3 {
      color: #c62828;
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
      transition: all 0.15s;
    }

    .modal-close:hover:not(:disabled) {
      background: #f0f0f0;
      color: #333;
    }

    .modal-close:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .modal-body {
      padding: 20px;
      overflow-y: auto;
    }

    .modal-body p {
      margin: 0;
      color: #666;
      line-height: 1.6;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid #e0e0e0;
      background: #fafafa;
    }

    .btn-secondary {
      padding: 8px 16px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      color: #666;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #f5f5f5;
      border-color: #ccc;
    }

    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #2196F3;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1976D2;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-danger {
      padding: 8px 16px;
      background: #d32f2f;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-danger:hover {
      background: #c62828;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .categories-layout {
        grid-template-columns: 1fr;
      }

      .category-detail-panel.empty {
        display: none;
      }

      .modal-dialog {
        width: 95vw;
      }
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ListsCategoriesResource extends BaseResourceComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  isLoading = true;
  categories: ListCategoryEntity[] = [];
  categoryViewModels: CategoryViewModel[] = [];
  selectedCategory: ListCategoryEntity | null = null;
  selectedCategoryLists: ListEntity[] = [];

  // Dialog
  showDialog = false;
  editingCategory: ListCategoryEntity | null = null;
  dialogName = '';
  dialogDescription = '';
  dialogParentId: string | null = null;
  availableParents: Array<{ ID: string | null; displayName: string }> = [];

  // Operation states
  isSaving = false;

  // Delete confirmation dialog
  showDeleteConfirm = false;
  deleteConfirmMessage = '';
  private categoryToDelete: ListCategoryEntity | null = null;

  private listsByCategoryId: Map<string, ListEntity[]> = new Map();
  private categoryMap: Map<string, ListCategoryEntity> = new Map();

  constructor(
    private cdr: ChangeDetectorRef,
    private notificationService: MJNotificationService
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

      const [categoriesResult, listsResult] = await rv.RunViews([
        {
          EntityName: 'List Categories',
          OrderBy: 'Name',
          ResultType: 'entity_object',
          CacheLocal: true  // Categories rarely change, cache for performance
        },
        {
          EntityName: 'Lists',
          ExtraFilter: userId ? `UserID = '${userId}'` : '',
          ResultType: 'entity_object'
        }
      ]);

      if (!categoriesResult.Success) {
        console.error('Failed to load categories');
        return;
      }

      this.categories = categoriesResult.Results as ListCategoryEntity[];
      const lists = listsResult.Results as ListEntity[];

      // Build category map
      this.categoryMap.clear();
      for (const cat of this.categories) {
        this.categoryMap.set(cat.ID, cat);
      }

      // Group lists by category
      this.listsByCategoryId.clear();
      for (const list of lists) {
        if (list.CategoryID) {
          const existing = this.listsByCategoryId.get(list.CategoryID) || [];
          existing.push(list);
          this.listsByCategoryId.set(list.CategoryID, existing);
        }
      }

      // Build view models
      this.buildCategoryViewModels();
      this.buildAvailableParents();
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private buildCategoryViewModels() {
    this.categoryViewModels = [];

    const buildVm = (category: ListCategoryEntity, depth: number): CategoryViewModel => {
      const lists = this.listsByCategoryId.get(category.ID) || [];
      const children = this.categories.filter(c => c.ParentID === category.ID);

      return {
        category,
        listCount: lists.length,
        childCount: children.length,
        depth,
        isExpanded: true
      };
    };

    const processCategory = (category: ListCategoryEntity, depth: number) => {
      this.categoryViewModels.push(buildVm(category, depth));
      const children = this.categories.filter(c => c.ParentID === category.ID);
      for (const child of children) {
        processCategory(child, depth + 1);
      }
    };

    const topLevel = this.categories.filter(c => !c.ParentID);
    for (const cat of topLevel) {
      processCategory(cat, 0);
    }
  }

  private buildAvailableParents() {
    this.availableParents = [{ ID: null, displayName: '(Top Level)' }];

    const addCategory = (cat: ListCategoryEntity, prefix: string) => {
      // Exclude the editing category and its descendants
      if (this.editingCategory && this.isDescendantOf(cat, this.editingCategory)) {
        return;
      }
      this.availableParents.push({ ID: cat.ID, displayName: prefix + cat.Name });
      const children = this.categories.filter(c => c.ParentID === cat.ID);
      for (const child of children) {
        addCategory(child, prefix + '\u00A0\u00A0');
      }
    };

    const topLevel = this.categories.filter(c => !c.ParentID);
    for (const cat of topLevel) {
      if (this.editingCategory?.ID !== cat.ID) {
        addCategory(cat, '');
      }
    }
  }

  private isDescendantOf(category: ListCategoryEntity, ancestor: ListCategoryEntity): boolean {
    if (category.ID === ancestor.ID) return true;
    if (!category.ParentID) return false;
    const parent = this.categoryMap.get(category.ParentID);
    return parent ? this.isDescendantOf(parent, ancestor) : false;
  }

  getTopLevelCategories(): CategoryViewModel[] {
    return this.categoryViewModels.filter(vm => !vm.category.ParentID);
  }

  getChildCategories(parent: ListCategoryEntity): CategoryViewModel[] {
    return this.categoryViewModels.filter(vm => vm.category.ParentID === parent.ID);
  }

  hasChildren(category: ListCategoryEntity): boolean {
    return this.categories.some(c => c.ParentID === category.ID);
  }

  toggleExpand(event: Event, vm: CategoryViewModel) {
    event.stopPropagation();
    vm.isExpanded = !vm.isExpanded;
  }

  expandNode(event: Event, vm: CategoryViewModel) {
    event.preventDefault();
    if (this.hasChildren(vm.category) && !vm.isExpanded) {
      vm.isExpanded = true;
    }
  }

  collapseNode(event: Event, vm: CategoryViewModel) {
    event.preventDefault();
    if (vm.isExpanded) {
      vm.isExpanded = false;
    }
  }

  selectCategory(category: ListCategoryEntity) {
    this.selectedCategory = category;
    this.selectedCategoryLists = this.listsByCategoryId.get(category.ID) || [];
  }

  getParentCategoryName(category: ListCategoryEntity): string | null {
    if (!category.ParentID) return null;
    return this.categoryMap.get(category.ParentID)?.Name || null;
  }

  getSelectedCategoryListCount(): number {
    if (!this.selectedCategory) return 0;
    return this.listsByCategoryId.get(this.selectedCategory.ID)?.length || 0;
  }

  getSelectedCategoryChildCount(): number {
    if (!this.selectedCategory) return 0;
    return this.categories.filter(c => c.ParentID === this.selectedCategory!.ID).length;
  }

  createCategory() {
    this.editingCategory = null;
    this.dialogName = '';
    this.dialogDescription = '';
    this.dialogParentId = null;
    this.buildAvailableParents();
    this.showDialog = true;
  }

  editCategory() {
    if (!this.selectedCategory) return;
    this.editingCategory = this.selectedCategory;
    this.dialogName = this.selectedCategory.Name;
    this.dialogDescription = this.selectedCategory.Description || '';
    this.dialogParentId = this.selectedCategory.ParentID || null;
    this.buildAvailableParents();
    this.showDialog = true;
  }

  deleteCategory() {
    if (!this.selectedCategory) return;

    this.categoryToDelete = this.selectedCategory;
    const categoryName = this.categoryToDelete.Name;
    const listsInCategory = this.listsByCategoryId.get(this.categoryToDelete.ID) || [];
    const childCategories = this.categories.filter(c => c.ParentID === this.categoryToDelete!.ID);

    let message = `Are you sure you want to delete "${categoryName}"?`;
    if (listsInCategory.length > 0) {
      message += ` ${listsInCategory.length} list(s) will be uncategorized.`;
    }
    if (childCategories.length > 0) {
      message += ` ${childCategories.length} subcategory(ies) will become top-level.`;
    }

    this.deleteConfirmMessage = message;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.categoryToDelete = null;
    this.deleteConfirmMessage = '';
  }

  async confirmDelete() {
    if (!this.categoryToDelete) return;

    const categoryName = this.categoryToDelete.Name;
    const categoryToDelete = this.categoryToDelete;
    this.showDeleteConfirm = false;
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const deleted = await categoryToDelete.Delete();
      if (deleted) {
        this.notificationService.CreateSimpleNotification(`"${categoryName}" deleted`, 'success', 3000);
      } else {
        // Get the detailed error message from LatestResult
        const errorMessage = categoryToDelete.LatestResult?.Message || 'Unknown error occurred';
        console.error('Failed to delete category:', categoryToDelete.LatestResult);
        this.notificationService.CreateSimpleNotification(`Failed to delete category: ${errorMessage}`, 'error', 6000);
      }
      this.selectedCategory = null;
      this.categoryToDelete = null;
      await this.loadData();
    } catch (error) {
      console.error('Error deleting category:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.notificationService.CreateSimpleNotification(`Error deleting category: ${errorMessage}`, 'error', 6000);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  closeDialog() {
    this.showDialog = false;
    this.editingCategory = null;
  }

  async saveCategory() {
    this.isSaving = true;
    this.cdr.detectChanges();

    const isEditing = !!this.editingCategory;
    const categoryName = this.dialogName;

    try {
      const md = new Metadata();
      let category: ListCategoryEntity;

      if (this.editingCategory) {
        category = this.editingCategory;
      } else {
        category = await md.GetEntityObject<ListCategoryEntity>('List Categories');
        category.UserID = md.CurrentUser!.ID;
      }

      category.Name = this.dialogName;
      category.Description = this.dialogDescription || null;
      category.ParentID = this.dialogParentId || null;

      const saved = await category.Save();
      if (saved) {
        this.notificationService.CreateSimpleNotification(
          isEditing ? `"${categoryName}" updated` : `"${categoryName}" created`,
          'success',
          3000
        );
        this.closeDialog();
        await this.loadData();

        // Re-select the saved category
        if (isEditing) {
          this.selectedCategory = category;
          this.selectedCategoryLists = this.listsByCategoryId.get(category.ID) || [];
        }
      } else {
        // Get the detailed error message from LatestResult
        const errorMessage = category.LatestResult?.Message || 'Unknown error occurred';
        const action = isEditing ? 'update' : 'create';
        console.error(`Failed to ${action} category:`, category.LatestResult);
        this.notificationService.CreateSimpleNotification(
          `Failed to ${action} category: ${errorMessage}`,
          'error',
          6000
        );
      }
    } catch (error) {
      console.error('Error saving category:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.notificationService.CreateSimpleNotification(`Error saving category: ${errorMessage}`, 'error', 6000);
    } finally {
      this.isSaving = false;
      this.cdr.detectChanges();
    }
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Categories';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-tags';
  }
}
