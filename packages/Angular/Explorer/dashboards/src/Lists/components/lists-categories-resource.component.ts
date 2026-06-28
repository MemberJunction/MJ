import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJListCategoryEntity, MJListEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { validateStringParam } from '../../shared/agent-tool-validation';
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
  categories: MJListCategoryEntity[] = [];
  categoryViewModels: CategoryViewModel[] = [];
  selectedCategory: MJListCategoryEntity | null = null;
  selectedCategoryLists: MJListEntity[] = [];

  // Dialog
  showDialog = false;
  editingCategory: MJListCategoryEntity | null = null;
  dialogName = '';
  dialogDescription = '';
  dialogParentId: string | null = null;
  availableParents: Array<{ ID: string | null; displayName: string }> = [];

  // Operation states
  isSaving = false;

  // Delete confirmation dialog
  showDeleteConfirm = false;
  deleteConfirmMessage = '';
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
    this.navigationService.SetAgentContext(this, {
      SelectedCategoryId: this.selectedCategory?.ID ?? null,
      SelectedCategoryName: this.selectedCategory?.Name ?? null,
      CategoryCount: this.categories.length,
      SelectedCategoryListCount: this.selectedCategoryLists.length,
    });
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
        Description: 'Select a category by its ID to view its detail and member lists.',
        ParameterSchema: { type: 'object', properties: { categoryId: { type: 'string', description: 'The ID of the category to select' } }, required: ['categoryId'] },
        Handler: async (params: Record<string, unknown>) => {
          const check = validateStringParam(params['categoryId'], 'categoryId');
          if (!check.ok) return check.result;
          const category = this.categories.find(c => UUIDsEqual(c.ID, check.value));
          if (!category) return { Success: false, ErrorMessage: `No category found with ID "${check.value}".` };
          this.selectCategory(category);
          this.publishAgentContext();
          return { Success: true, Data: { categoryName: category.Name, listCount: this.selectedCategoryLists.length } };
        },
      },
      {
        Name: 'ExpandCategory',
        Description: 'Expand (or collapse) a category node in the tree by its ID.',
        ParameterSchema: { type: 'object', properties: { categoryId: { type: 'string', description: 'The ID of the category to toggle' } }, required: ['categoryId'] },
        Handler: async (params: Record<string, unknown>) => {
          const check = validateStringParam(params['categoryId'], 'categoryId');
          if (!check.ok) return check.result;
          const vm = this.categoryViewModels.find(v => UUIDsEqual(v.category.ID, check.value));
          if (!vm) return { Success: false, ErrorMessage: `No category found with ID "${check.value}".` };
          vm.isExpanded = !vm.isExpanded;
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
          this.createCategory();
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

      this.categories = categoriesResult.Results as MJListCategoryEntity[];
      const lists = listsResult.Results as MJListEntity[];

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

    const buildVm = (category: MJListCategoryEntity, depth: number): CategoryViewModel => {
      const lists = this.listsByCategoryId.get(category.ID) || [];
      const children = this.categories.filter(c => UUIDsEqual(c.ParentID, category.ID));

      return {
        category,
        listCount: lists.length,
        childCount: children.length,
        depth,
        isExpanded: true
      };
    };

    const processCategory = (category: MJListCategoryEntity, depth: number) => {
      this.categoryViewModels.push(buildVm(category, depth));
      const children = this.categories.filter(c => UUIDsEqual(c.ParentID, category.ID));
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

    const addCategory = (cat: MJListCategoryEntity, prefix: string) => {
      // Exclude the editing category and its descendants
      if (this.editingCategory && this.isDescendantOf(cat, this.editingCategory)) {
        return;
      }
      this.availableParents.push({ ID: cat.ID, displayName: prefix + cat.Name });
      const children = this.categories.filter(c => UUIDsEqual(c.ParentID, cat.ID));
      for (const child of children) {
        addCategory(child, prefix + '\u00A0\u00A0');
      }
    };

    const topLevel = this.categories.filter(c => !c.ParentID);
    for (const cat of topLevel) {
      if (!UUIDsEqual(this.editingCategory?.ID, cat.ID)) {
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

  getTopLevelCategories(): CategoryViewModel[] {
    return this.categoryViewModels.filter(vm => !vm.category.ParentID);
  }

  getChildCategories(parent: MJListCategoryEntity): CategoryViewModel[] {
    return this.categoryViewModels.filter(vm => UUIDsEqual(vm.category.ParentID, parent.ID));
  }

  hasChildren(category: MJListCategoryEntity): boolean {
    return this.categories.some(c => UUIDsEqual(c.ParentID, category.ID));
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

  IsCategorySelected(category: MJListCategoryEntity): boolean {
    return UUIDsEqual(this.selectedCategory?.ID, category.ID);
  }

  selectCategory(category: MJListCategoryEntity) {
    this.selectedCategory = category;
    this.selectedCategoryLists = this.listsByCategoryId.get(category.ID) || [];
    this.publishAgentContext();
  }

  getParentCategoryName(category: MJListCategoryEntity): string | null {
    if (!category.ParentID) return null;
    return this.categoryMap.get(category.ParentID)?.Name || null;
  }

  getSelectedCategoryListCount(): number {
    if (!this.selectedCategory) return 0;
    return this.listsByCategoryId.get(this.selectedCategory.ID)?.length || 0;
  }

  getSelectedCategoryChildCount(): number {
    if (!this.selectedCategory) return 0;
    return this.categories.filter(c => UUIDsEqual(c.ParentID, this.selectedCategory!.ID)).length
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
    const childCategories = this.categories.filter(c => UUIDsEqual(c.ParentID, this.categoryToDelete!.ID));

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
      const md = this.ProviderToUse;
      let category: MJListCategoryEntity;

      if (this.editingCategory) {
        category = this.editingCategory;
      } else {
        category = await md.GetEntityObject<MJListCategoryEntity>('MJ: List Categories');
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
