import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJListCategoryEntity, MJListEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ValidateStringParam } from '../../shared/agent-tool-validation';
import { BuildListCategoriesAgentContext, ResolveNamedRecord, BuildNotFoundError } from '../lists-agent-context';
interface CategoryViewModel {
  category: MJListCategoryEntity;
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
    <mj-page-layout>
      <mj-page-header Title="List Categories" Icon="fa-solid fa-tags">
        <div actions>
          <button mjButton variant="primary" size="sm" (click)="createCategory()">
            <i class="fa-solid fa-plus"></i> <span class="action-btn-label">New Category</span>
          </button>
        </div>
      </mj-page-header>

      <mj-page-body>
      <!-- Loading State -->
      @if (isLoading) {
        <div class="loading-container">
          <mj-loading text="Loading categories..." size="medium"></mj-loading>
        </div>
      }
    
      <!-- Empty State -->
      @if (!isLoading && categoryViewModels.length === 0) {
        <mj-empty-state Size="large"
          Icon="fa-solid fa-folder-tree"
          Title="No Categories Yet"
          Message="Categories help you organize lists into logical groups."
          ActionText="Create Your First Category"
          ActionIcon="fa-solid fa-plus"
          (Action)="createCategory()">
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
        </mj-empty-state>
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
                <mj-empty-state Size="compact"
                  Icon="fa-solid fa-arrow-left"
                  Title="Select a category to view details" />
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
            [class.selected]="IsCategorySelected(vm.category)"
            (click)="selectCategory(vm.category)"
            (keydown.enter)="selectCategory(vm.category)"
            (keydown.space)="selectCategory(vm.category); $event.preventDefault()"
            (keydown.arrowRight)="expandNode($event, vm)"
            (keydown.arrowLeft)="collapseNode($event, vm)"
            tabindex="0"
            role="treeitem"
            [attr.aria-expanded]="hasChildren(vm.category) ? vm.isExpanded : null"
            [attr.aria-selected]="IsCategorySelected(vm.category)"
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
      </mj-page-body>
    </mj-page-layout>
    `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    /* Header */
    .categories-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
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

    /* Onboarding feature checklist — projected into <mj-empty-state>. */
    .empty-state-features {
      display: flex;
      flex-direction: column;
      gap: var(--mj-space-2);
      margin: var(--mj-space-5) 0 var(--mj-space-2);
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
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-sm);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .count-badge {
      font-size: 12px;
      color: var(--mj-text-muted);
      background: var(--mj-bg-surface-sunken);
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
      color: var(--mj-text-secondary);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }

    .icon-btn.danger:hover {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
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
      background: var(--mj-bg-surface-sunken);
    }

    .node-content:focus {
      outline: none;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
    }

    .node-content:focus-visible {
      outline: 2px solid var(--mj-brand-primary);
      outline-offset: -2px;
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
    }

    .node-content.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
    }

    .node-content.selected:focus-visible {
      outline: 2px solid var(--mj-brand-primary-hover);
    }

    .expand-btn {
      background: none;
      border: none;
      padding: 2px;
      color: var(--mj-text-muted);
      cursor: pointer;
      width: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .expand-btn:hover {
      color: var(--mj-text-secondary);
    }

    .expand-placeholder {
      width: 20px;
    }

    .node-content .fa-folder,
    .node-content .fa-folder-open {
      color: var(--mj-status-warning);
    }

    .node-name {
      flex: 1;
      font-size: 14px;
      color: var(--mj-text-primary);
    }

    .node-count {
      font-size: 12px;
      color: var(--mj-text-muted);
      background: var(--mj-bg-surface-sunken);
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
      color: var(--mj-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .field-value {
      font-size: 14px;
      color: var(--mj-text-primary);
    }

    .detail-stats {
      display: flex;
      gap: 24px;
      margin: 24px 0;
      padding: 16px;
      background: var(--mj-bg-surface);
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
      color: var(--mj-brand-primary);
    }

    .stat-label {
      font-size: 12px;
      color: var(--mj-text-muted);
    }

    .category-lists h4 {
      margin: 0 0 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-secondary);
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
      background: var(--mj-bg-surface);
      border-radius: 4px;
      font-size: 13px;
      color: var(--mj-text-primary);
    }

    .mini-list-item i {
      color: var(--mj-text-muted);
    }

    /* No Selection */
    .category-detail-panel.empty {
      display: flex;
      align-items: center;
      justify-content: center;
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
      color: var(--mj-text-secondary);
    }

    .form-input {
      padding: 8px 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: 4px;
      font-size: 14px;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--mj-brand-primary);
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--mj-bg-overlay);
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
      background: var(--mj-bg-surface-card);
      border-radius: 8px;
      box-shadow: var(--mj-shadow-lg);
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
      border-bottom: 1px solid var(--mj-border-default);
    }

    .modal-header.danger {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      border-bottom-color: color-mix(in srgb, var(--mj-status-error) 30%, transparent);
    }

    .modal-header.danger h3 {
      color: var(--mj-status-error);
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
      transition: all 0.15s;
    }

    .modal-close:hover:not(:disabled) {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
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
      color: var(--mj-text-secondary);
      line-height: 1.6;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-sunken);
    }

    .btn-secondary {
      padding: 8px 16px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 6px;
      color: var(--mj-text-secondary);
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-secondary:hover:not(:disabled) {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
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
      background: var(--mj-brand-primary);
      border: none;
      border-radius: 6px;
      color: var(--mj-text-inverse);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--mj-brand-primary-hover);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-danger {
      padding: 8px 16px;
      background: var(--mj-status-error);
      border: none;
      border-radius: 6px;
      color: var(--mj-text-inverse);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-danger:hover {
      background: var(--mj-status-error);
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
  protected override destroy$ = new Subject<void>();

  isLoading = true;
  Categories: MJListCategoryEntity[] = [];

  /** @deprecated Use {@link Categories}. */
  get categories(): MJListCategoryEntity[] {
    return this.Categories;
  }
  /** @deprecated Use {@link Categories}. */
  set categories(value: MJListCategoryEntity[]) {
    this.Categories = value;
  }
  CategoryViewModels: CategoryViewModel[] = [];

  /** @deprecated Use {@link CategoryViewModels}. */
  get categoryViewModels(): CategoryViewModel[] {
    return this.CategoryViewModels;
  }
  /** @deprecated Use {@link CategoryViewModels}. */
  set categoryViewModels(value: CategoryViewModel[]) {
    this.CategoryViewModels = value;
  }
  SelectedCategory: MJListCategoryEntity | null = null;

  /** @deprecated Use {@link SelectedCategory}. */
  get selectedCategory(): MJListCategoryEntity | null {
    return this.SelectedCategory;
  }
  /** @deprecated Use {@link SelectedCategory}. */
  set selectedCategory(value: MJListCategoryEntity | null) {
    this.SelectedCategory = value;
  }
  SelectedCategoryLists: MJListEntity[] = [];

  /** @deprecated Use {@link SelectedCategoryLists}. */
  get selectedCategoryLists(): MJListEntity[] {
    return this.SelectedCategoryLists;
  }
  /** @deprecated Use {@link SelectedCategoryLists}. */
  set selectedCategoryLists(value: MJListEntity[]) {
    this.SelectedCategoryLists = value;
  }

  // Dialog
  ShowDialog = false;

  /** @deprecated Use {@link ShowDialog}. */
  get showDialog() {
    return this.ShowDialog;
  }
  /** @deprecated Use {@link ShowDialog}. */
  set showDialog(value) {
    this.ShowDialog = value;
  }
  EditingCategory: MJListCategoryEntity | null = null;

  /** @deprecated Use {@link EditingCategory}. */
  get editingCategory(): MJListCategoryEntity | null {
    return this.EditingCategory;
  }
  /** @deprecated Use {@link EditingCategory}. */
  set editingCategory(value: MJListCategoryEntity | null) {
    this.EditingCategory = value;
  }
  DialogName = '';

  /** @deprecated Use {@link DialogName}. */
  get dialogName() {
    return this.DialogName;
  }
  /** @deprecated Use {@link DialogName}. */
  set dialogName(value) {
    this.DialogName = value;
  }
  DialogDescription = '';

  /** @deprecated Use {@link DialogDescription}. */
  get dialogDescription() {
    return this.DialogDescription;
  }
  /** @deprecated Use {@link DialogDescription}. */
  set dialogDescription(value) {
    this.DialogDescription = value;
  }
  DialogParentId: string | null = null;

  /** @deprecated Use {@link DialogParentId}. */
  get dialogParentId(): string | null {
    return this.DialogParentId;
  }
  /** @deprecated Use {@link DialogParentId}. */
  set dialogParentId(value: string | null) {
    this.DialogParentId = value;
  }
  AvailableParents: Array<{ ID: string | null; displayName: string }> = [];

  /** @deprecated Use {@link AvailableParents}. */
  get availableParents(): Array<{ ID: string | null; displayName: string }> {
    return this.AvailableParents;
  }
  /** @deprecated Use {@link AvailableParents}. */
  set availableParents(value: Array<{ ID: string | null; displayName: string }>) {
    this.AvailableParents = value;
  }

  // Operation states
  IsSaving = false;

  /** @deprecated Use {@link IsSaving}. */
  get isSaving() {
    return this.IsSaving;
  }
  /** @deprecated Use {@link IsSaving}. */
  set isSaving(value) {
    this.IsSaving = value;
  }

  // Delete confirmation dialog
  ShowDeleteConfirm = false;

  /** @deprecated Use {@link ShowDeleteConfirm}. */
  get showDeleteConfirm() {
    return this.ShowDeleteConfirm;
  }
  /** @deprecated Use {@link ShowDeleteConfirm}. */
  set showDeleteConfirm(value) {
    this.ShowDeleteConfirm = value;
  }
  DeleteConfirmMessage = '';

  /** @deprecated Use {@link DeleteConfirmMessage}. */
  get deleteConfirmMessage() {
    return this.DeleteConfirmMessage;
  }
  /** @deprecated Use {@link DeleteConfirmMessage}. */
  set deleteConfirmMessage(value) {
    this.DeleteConfirmMessage = value;
  }
  private categoryToDelete: MJListCategoryEntity | null = null;

  private listsByCategoryId: Map<string, MJListEntity[]> = new Map();
  private categoryMap: Map<string, MJListCategoryEntity> = new Map();

  constructor(
    private cdr: ChangeDetectorRef,
    private notificationService: MJNotificationService
  ) {
    super();
  }

  async ngOnInit() {
    super.ngOnInit();
    await this.loadData();
    this.registerAgentTools();
    this.publishAgentContext();
    this.NotifyLoadComplete();
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================================================
  // AI Agent Context & Client Tools
  //
  // SAFETY BOUNDARY: This surface exposes only SAFE (selection / expand)
  // operations plus ONE bounded-mutation tool (CreateCategory) that opens
  // the dialog-validated create flow. INTENTIONALLY EXCLUDED — must NOT be
  // wired in:
  //   - EditCategory   (editCategory)   — mutates an existing record
  //   - DeleteCategory (confirmDelete)  — destructive
  // Edit/delete stay user-driven on purpose.
  // ================================================================

  /**
   * Report the Categories surface's salient state to the AI agent.
   * Re-called whenever the selection changes or data reloads.
   */
  private publishAgentContext(): void {
    this.navigationService.SetAgentContext(this, BuildListCategoriesAgentContext({
      SelectedCategoryId: this.SelectedCategory?.ID ?? null,
      SelectedCategoryName: this.SelectedCategory?.Name ?? null,
      CategoryCount: this.Categories.length,
      SelectedCategoryListCount: this.SelectedCategoryLists.length,
      // Deep context: the member-list NAMES under the selection (bounded) and a
      // bounded view of the category tree (name / count / expanded), so the agent
      // sees what the user sees and can act by name.
      SelectedCategoryListNames: this.SelectedCategoryLists.map(l => l.Name),
      CategoryNodes: this.CategoryViewModels.map(vm => ({
        Name: vm.category.Name,
        ListCount: vm.listCount,
        Expanded: vm.isExpanded,
      })),
    }));
  }

  /**
   * Resolve an agent-supplied reference (a category ID or NAME, exact or
   * partial) to one of the loaded categories via the pure {@link resolveNamedRecord}
   * helper. Returns the matching {@link MJListCategoryEntity}, or null.
   */
  private resolveCategory(input: string): MJListCategoryEntity | null {
    const match = ResolveNamedRecord(input, this.Categories.map(c => ({ ID: c.ID, Name: c.Name })));
    if (!match) {
      return null;
    }
    return this.Categories.find(c => UUIDsEqual(c.ID, match.ID)) ?? null;
  }

  /**
   * Register the Categories surface's agent-actionable tools. SAFE tools
   * select / expand a category; the single bounded-mutation tool only
   * opens the dialog-validated create flow.
   */
  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SelectCategory',
        Description: 'Select a category to view its detail and member lists. Pass the category ID or name (see CategoryNodes) — the tool resolves an exact ID, an exact name, or a partial name match.',
        ParameterSchema: { type: 'object', properties: { category: { type: 'string', description: 'The category ID or name to select' }, categoryId: { type: 'string', description: 'Deprecated alias for "category".' } } },
        Handler: async (params: Record<string, unknown>) => {
          const check = ValidateStringParam(params['category'] ?? params['categoryId'], 'category');
          if (!check.ok) return check.result;
          const category = this.resolveCategory(check.value);
          if (!category) return { Success: false, ErrorMessage: BuildNotFoundError(check.value, this.Categories.map(c => ({ ID: c.ID, Name: c.Name })), 'category') };
          this.SelectCategory(category);
          this.publishAgentContext();
          return { Success: true, Data: { categoryName: category.Name, listCount: this.SelectedCategoryLists.length } };
        },
      },
      {
        Name: 'ExpandCategory',
        Description: 'Expand (or collapse) a category node in the tree. Pass the category ID or name (see CategoryNodes) — the tool resolves an exact ID, an exact name, or a partial name match.',
        ParameterSchema: { type: 'object', properties: { category: { type: 'string', description: 'The category ID or name to toggle' }, categoryId: { type: 'string', description: 'Deprecated alias for "category".' } } },
        Handler: async (params: Record<string, unknown>) => {
          const check = ValidateStringParam(params['category'] ?? params['categoryId'], 'category');
          if (!check.ok) return check.result;
          const category = this.resolveCategory(check.value);
          if (!category) return { Success: false, ErrorMessage: BuildNotFoundError(check.value, this.Categories.map(c => ({ ID: c.ID, Name: c.Name })), 'category') };
          const vm = this.CategoryViewModels.find(v => UUIDsEqual(v.category.ID, category.ID));
          if (!vm) return { Success: false, ErrorMessage: BuildNotFoundError(check.value, this.Categories.map(c => ({ ID: c.ID, Name: c.Name })), 'category') };
          vm.isExpanded = !vm.isExpanded;
          this.publishAgentContext();
          this.cdr.detectChanges();
          return { Success: true, Data: { categoryName: vm.category.Name, isExpanded: vm.isExpanded } };
        },
      },
      {
        // BOUNDED MUTATION: opens the create dialog only. The category name
        // is validated by the dialog before any record is written.
        Name: 'CreateCategory',
        Description: 'Open the "Create Category" dialog. The user confirms the name in the dialog; nothing is saved until they do.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.CreateCategory();
          return { Success: true };
        },
      },
    ]);
  }

  async loadData() {
    this.isLoading = true;

    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const userId = md.CurrentUser?.ID;

      const [categoriesResult, listsResult] = await rv.RunViews([
        {
          EntityName: 'MJ: List Categories',
          OrderBy: 'Name',
          ResultType: 'entity_object',
          CacheLocal: true  // Categories rarely change, cache for performance
        },
        {
          EntityName: 'MJ: Lists',
          ExtraFilter: userId ? `UserID = '${userId}'` : '',
          ResultType: 'entity_object'
        }
      ]);

      if (!categoriesResult.Success) {
        console.error('Failed to load categories');
        return;
      }

      this.Categories = categoriesResult.Results as MJListCategoryEntity[];
      const lists = listsResult.Results as MJListEntity[];

      // Build category map
      this.categoryMap.clear();
      for (const cat of this.Categories) {
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
    this.CategoryViewModels = [];

    const buildVm = (category: MJListCategoryEntity, depth: number): CategoryViewModel => {
      const lists = this.listsByCategoryId.get(category.ID) || [];
      const children = this.Categories.filter(c => UUIDsEqual(c.ParentID, category.ID));

      return {
        category,
        listCount: lists.length,
        childCount: children.length,
        depth,
        isExpanded: true
      };
    };

    const processCategory = (category: MJListCategoryEntity, depth: number) => {
      this.CategoryViewModels.push(buildVm(category, depth));
      const children = this.Categories.filter(c => UUIDsEqual(c.ParentID, category.ID));
      for (const child of children) {
        processCategory(child, depth + 1);
      }
    };

    const topLevel = this.Categories.filter(c => !c.ParentID);
    for (const cat of topLevel) {
      processCategory(cat, 0);
    }
  }

  private buildAvailableParents() {
    this.AvailableParents = [{ ID: null, displayName: '(Top Level)' }];

    const addCategory = (cat: MJListCategoryEntity, prefix: string) => {
      // Exclude the editing category and its descendants
      if (this.EditingCategory && this.isDescendantOf(cat, this.EditingCategory)) {
        return;
      }
      this.AvailableParents.push({ ID: cat.ID, displayName: prefix + cat.Name });
      const children = this.Categories.filter(c => UUIDsEqual(c.ParentID, cat.ID));
      for (const child of children) {
        addCategory(child, prefix + '\u00A0\u00A0');
      }
    };

    const topLevel = this.Categories.filter(c => !c.ParentID);
    for (const cat of topLevel) {
      if (!UUIDsEqual(this.EditingCategory?.ID, cat.ID)) {
        addCategory(cat, '');
      }
    }
  }

  private isDescendantOf(category: MJListCategoryEntity, ancestor: MJListCategoryEntity): boolean {
    if (UUIDsEqual(category.ID, ancestor.ID)) return true;
    if (!category.ParentID) return false;
    const parent = this.categoryMap.get(category.ParentID);
    return parent ? this.isDescendantOf(parent, ancestor) : false;
  }

  GetTopLevelCategories(): CategoryViewModel[] {
    return this.CategoryViewModels.filter(vm => !vm.category.ParentID);
  }

  /** @deprecated Use {@link GetTopLevelCategories}. */
  getTopLevelCategories(): CategoryViewModel[] {
    return this.GetTopLevelCategories();
  }

  GetChildCategories(parent: MJListCategoryEntity): CategoryViewModel[] {
    return this.CategoryViewModels.filter(vm => UUIDsEqual(vm.category.ParentID, parent.ID));
  }

  /** @deprecated Use {@link GetChildCategories}. */
  getChildCategories(parent: MJListCategoryEntity): CategoryViewModel[] {
    return this.GetChildCategories(parent);
  }

  HasChildren(category: MJListCategoryEntity): boolean {
    return this.Categories.some(c => UUIDsEqual(c.ParentID, category.ID));
  }

  /** @deprecated Use {@link HasChildren}. */
  hasChildren(category: MJListCategoryEntity): boolean {
    return this.HasChildren(category);
  }

  ToggleExpand(event: Event, vm: CategoryViewModel) {
    event.stopPropagation();
    vm.isExpanded = !vm.isExpanded;
  }

  /** @deprecated Use {@link ToggleExpand}. */
  toggleExpand(event: Event, vm: CategoryViewModel) {
    return this.ToggleExpand(event, vm);
  }

  ExpandNode(event: Event, vm: CategoryViewModel) {
    event.preventDefault();
    if (this.HasChildren(vm.category) && !vm.isExpanded) {
      vm.isExpanded = true;
    }
  }

  /** @deprecated Use {@link ExpandNode}. */
  expandNode(event: Event, vm: CategoryViewModel) {
    return this.ExpandNode(event, vm);
  }

  CollapseNode(event: Event, vm: CategoryViewModel) {
    event.preventDefault();
    if (vm.isExpanded) {
      vm.isExpanded = false;
    }
  }

  /** @deprecated Use {@link CollapseNode}. */
  collapseNode(event: Event, vm: CategoryViewModel) {
    return this.CollapseNode(event, vm);
  }

  IsCategorySelected(category: MJListCategoryEntity): boolean {
    return UUIDsEqual(this.SelectedCategory?.ID, category.ID);
  }

  SelectCategory(category: MJListCategoryEntity) {
    this.SelectedCategory = category;
    this.SelectedCategoryLists = this.listsByCategoryId.get(category.ID) || [];
    this.publishAgentContext();
  }

  /** @deprecated Use {@link SelectCategory}. */
  selectCategory(category: MJListCategoryEntity) {
    return this.SelectCategory(category);
  }

  GetParentCategoryName(category: MJListCategoryEntity): string | null {
    if (!category.ParentID) return null;
    return this.categoryMap.get(category.ParentID)?.Name || null;
  }

  /** @deprecated Use {@link GetParentCategoryName}. */
  getParentCategoryName(category: MJListCategoryEntity): string | null {
    return this.GetParentCategoryName(category);
  }

  GetSelectedCategoryListCount(): number {
    if (!this.SelectedCategory) return 0;
    return this.listsByCategoryId.get(this.SelectedCategory.ID)?.length || 0;
  }

  /** @deprecated Use {@link GetSelectedCategoryListCount}. */
  getSelectedCategoryListCount(): number {
    return this.GetSelectedCategoryListCount();
  }

  GetSelectedCategoryChildCount(): number {
    if (!this.SelectedCategory) return 0;
    return this.Categories.filter(c => UUIDsEqual(c.ParentID, this.SelectedCategory!.ID)).length
  }

  /** @deprecated Use {@link GetSelectedCategoryChildCount}. */
  getSelectedCategoryChildCount(): number {
    return this.GetSelectedCategoryChildCount();
  }

  CreateCategory() {
    this.EditingCategory = null;
    this.DialogName = '';
    this.DialogDescription = '';
    this.DialogParentId = null;
    this.buildAvailableParents();
    this.ShowDialog = true;
  }

  /** @deprecated Use {@link CreateCategory}. */
  createCategory() {
    return this.CreateCategory();
  }

  EditCategory() {
    if (!this.SelectedCategory) return;
    this.EditingCategory = this.SelectedCategory;
    this.DialogName = this.SelectedCategory.Name;
    this.DialogDescription = this.SelectedCategory.Description || '';
    this.DialogParentId = this.SelectedCategory.ParentID || null;
    this.buildAvailableParents();
    this.ShowDialog = true;
  }

  /** @deprecated Use {@link EditCategory}. */
  editCategory() {
    return this.EditCategory();
  }

  DeleteCategory() {
    if (!this.SelectedCategory) return;

    this.categoryToDelete = this.SelectedCategory;
    const categoryName = this.categoryToDelete.Name;
    const listsInCategory = this.listsByCategoryId.get(this.categoryToDelete.ID) || [];
    const childCategories = this.Categories.filter(c => UUIDsEqual(c.ParentID, this.categoryToDelete!.ID));

    let message = `Are you sure you want to delete "${categoryName}"?`;
    if (listsInCategory.length > 0) {
      message += ` ${listsInCategory.length} list(s) will be uncategorized.`;
    }
    if (childCategories.length > 0) {
      message += ` ${childCategories.length} subcategory(ies) will become top-level.`;
    }

    this.DeleteConfirmMessage = message;
    this.ShowDeleteConfirm = true;
  }

  /** @deprecated Use {@link DeleteCategory}. */
  deleteCategory() {
    return this.DeleteCategory();
  }

  CancelDelete() {
    this.ShowDeleteConfirm = false;
    this.categoryToDelete = null;
    this.DeleteConfirmMessage = '';
  }

  /** @deprecated Use {@link CancelDelete}. */
  cancelDelete() {
    return this.CancelDelete();
  }

  async ConfirmDelete() {
    if (!this.categoryToDelete) return;

    const categoryName = this.categoryToDelete.Name;
    const categoryToDelete = this.categoryToDelete;
    this.ShowDeleteConfirm = false;
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const deleted = await categoryToDelete.Delete();
      if (deleted) {
        this.notificationService.CreateSimpleNotification(`"${categoryName}" deleted`, 'success', 3000);
      } else {
        // Get the detailed error message from LatestResult
        const errorMessage = categoryToDelete.LatestResult?.CompleteMessage || 'Unknown error occurred';
        console.error('Failed to delete category:', categoryToDelete.LatestResult);
        this.notificationService.CreateSimpleNotification(`Failed to delete category: ${errorMessage}`, 'error', 6000);
      }
      this.SelectedCategory = null;
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

  /** @deprecated Use {@link ConfirmDelete}. */
  async confirmDelete() {
    return this.ConfirmDelete();
  }

  CloseDialog() {
    this.ShowDialog = false;
    this.EditingCategory = null;
  }

  /** @deprecated Use {@link CloseDialog}. */
  closeDialog() {
    return this.CloseDialog();
  }

  async SaveCategory() {
    this.IsSaving = true;
    this.cdr.detectChanges();

    const isEditing = !!this.EditingCategory;
    const categoryName = this.DialogName;

    try {
      const md = this.ProviderToUse;
      let category: MJListCategoryEntity;

      if (this.EditingCategory) {
        category = this.EditingCategory;
      } else {
        category = await md.GetEntityObject<MJListCategoryEntity>('MJ: List Categories');
        category.UserID = md.CurrentUser!.ID;
      }

      category.Name = this.DialogName;
      category.Description = this.DialogDescription || null;
      category.ParentID = this.DialogParentId || null;

      const saved = await category.Save();
      if (saved) {
        this.notificationService.CreateSimpleNotification(
          isEditing ? `"${categoryName}" updated` : `"${categoryName}" created`,
          'success',
          3000
        );
        this.CloseDialog();
        await this.loadData();

        // Re-select the saved category
        if (isEditing) {
          this.SelectedCategory = category;
          this.SelectedCategoryLists = this.listsByCategoryId.get(category.ID) || [];
        }
      } else {
        // Get the detailed error message from LatestResult
        const errorMessage = category.LatestResult?.CompleteMessage || 'Unknown error occurred';
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
      this.IsSaving = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link SaveCategory}. */
  async saveCategory() {
    return this.SaveCategory();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Categories';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-tags';
  }
}
