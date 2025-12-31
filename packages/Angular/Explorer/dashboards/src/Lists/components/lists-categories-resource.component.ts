import { Component, ViewEncapsulation, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, ListCategoryEntity, ListEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { Subject } from 'rxjs';

export function LoadListsCategoriesResource() {
  const test = new ListsCategoriesResource(null!);
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
      <div class="loading-container" *ngIf="isLoading">
        <mj-loading text="Loading categories..." size="medium"></mj-loading>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!isLoading && categoryViewModels.length === 0">
        <i class="fa-solid fa-folder-tree"></i>
        <h3>No Categories Yet</h3>
        <p>Create categories to organize your lists.</p>
        <button class="btn-create-large" (click)="createCategory()">
          <i class="fa-solid fa-plus"></i>
          Create Your First Category
        </button>
      </div>

      <!-- Categories Content -->
      <div class="categories-content" *ngIf="!isLoading && categoryViewModels.length > 0">
        <div class="categories-layout">
          <!-- Category Tree -->
          <div class="category-tree-panel">
            <div class="panel-header">
              <h3>Categories</h3>
              <span class="count-badge">{{categories.length}}</span>
            </div>
            <div class="tree-content">
              <ng-container *ngFor="let vm of getTopLevelCategories()">
                <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { vm: vm }"></ng-container>
              </ng-container>
            </div>
          </div>

          <!-- Category Details -->
          <div class="category-detail-panel" *ngIf="selectedCategory">
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
              <div class="detail-field" *ngIf="selectedCategory.Description">
                <label>Description</label>
                <span class="field-value">{{selectedCategory.Description}}</span>
              </div>
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
              <div class="category-lists" *ngIf="selectedCategoryLists.length > 0">
                <h4>Lists in this category</h4>
                <div class="mini-list">
                  <div class="mini-list-item" *ngFor="let list of selectedCategoryLists">
                    <i class="fa-solid fa-list"></i>
                    <span>{{list.Name}}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- No Selection State -->
          <div class="category-detail-panel empty" *ngIf="!selectedCategory">
            <div class="no-selection">
              <i class="fa-solid fa-arrow-left"></i>
              <p>Select a category to view details</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Category Node Template -->
      <ng-template #categoryNodeTemplate let-vm="vm">
        <div class="category-node" [style.padding-left.px]="vm.depth * 20">
          <div
            class="node-content"
            [class.selected]="selectedCategory?.ID === vm.category.ID"
            (click)="selectCategory(vm.category)">
            <button
              class="expand-btn"
              *ngIf="hasChildren(vm.category)"
              (click)="toggleExpand($event, vm)">
              <i [class]="vm.isExpanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"></i>
            </button>
            <span class="expand-placeholder" *ngIf="!hasChildren(vm.category)"></span>
            <i class="fa-solid fa-folder" [class.fa-folder-open]="vm.isExpanded"></i>
            <span class="node-name">{{vm.category.Name}}</span>
            <span class="node-count">{{vm.listCount}}</span>
          </div>
          <div class="node-children" *ngIf="vm.isExpanded && hasChildren(vm.category)">
            <ng-container *ngFor="let childVm of getChildCategories(vm.category)">
              <ng-container *ngTemplateOutlet="categoryNodeTemplate; context: { vm: childVm }"></ng-container>
            </ng-container>
          </div>
        </div>
      </ng-template>

      <!-- Create/Edit Dialog -->
      <kendo-dialog
        *ngIf="showDialog"
        [title]="editingCategory ? 'Edit Category' : 'Create Category'"
        (close)="closeDialog()"
        [width]="450">
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
            <kendo-dropdownlist
              [data]="availableParents"
              [textField]="'displayName'"
              [valueField]="'ID'"
              [(ngModel)]="dialogParentId"
              [valuePrimitive]="true"
              placeholder="(Top Level)">
            </kendo-dropdownlist>
          </div>
        </div>
        <kendo-dialog-actions>
          <button kendoButton (click)="closeDialog()">Cancel</button>
          <button
            kendoButton
            [primary]="true"
            (click)="saveCategory()"
            [disabled]="!dialogName">
            {{editingCategory ? 'Save' : 'Create'}}
          </button>
        </kendo-dialog-actions>
      </kendo-dialog>
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
      padding: 40px;
      text-align: center;
    }

    .empty-state i {
      font-size: 64px;
      color: #ccc;
      margin-bottom: 16px;
    }

    .empty-state h3 {
      margin: 0 0 8px;
      font-size: 20px;
      color: #666;
    }

    .empty-state p {
      margin: 0 0 24px;
      color: #999;
    }

    .btn-create-large {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
    }

    .btn-create-large:hover {
      background: #1976D2;
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

    .node-content.selected {
      background: #e3f2fd;
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

    /* Responsive */
    @media (max-width: 768px) {
      .categories-layout {
        grid-template-columns: 1fr;
      }

      .category-detail-panel.empty {
        display: none;
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

  private listsByCategoryId: Map<string, ListEntity[]> = new Map();
  private categoryMap: Map<string, ListCategoryEntity> = new Map();

  constructor(private cdr: ChangeDetectorRef) {
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
          ResultType: 'entity_object'
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

  async deleteCategory() {
    if (!this.selectedCategory) return;

    const listsInCategory = this.listsByCategoryId.get(this.selectedCategory.ID) || [];
    const childCategories = this.categories.filter(c => c.ParentID === this.selectedCategory!.ID);

    let message = `Are you sure you want to delete "${this.selectedCategory.Name}"?`;
    if (listsInCategory.length > 0) {
      message += `\n\n${listsInCategory.length} list(s) will be uncategorized.`;
    }
    if (childCategories.length > 0) {
      message += `\n\n${childCategories.length} subcategory(ies) will become top-level.`;
    }

    if (confirm(message)) {
      const deleted = await this.selectedCategory.Delete();
      if (deleted) {
        this.selectedCategory = null;
        await this.loadData();
      }
    }
  }

  closeDialog() {
    this.showDialog = false;
    this.editingCategory = null;
  }

  async saveCategory() {
    const md = new Metadata();
    let category: ListCategoryEntity;

    if (this.editingCategory) {
      category = this.editingCategory;
    } else {
      category = await md.GetEntityObject<ListCategoryEntity>('List Categories');
    }

    category.Name = this.dialogName;
    category.Description = this.dialogDescription || undefined;
    category.ParentID = this.dialogParentId || undefined;

    const saved = await category.Save();
    if (saved) {
      this.closeDialog();
      await this.loadData();

      // Re-select the saved category
      if (this.editingCategory) {
        this.selectedCategory = category;
        this.selectedCategoryLists = this.listsByCategoryId.get(category.ID) || [];
      }
    }
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Categories';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-tags';
  }
}
