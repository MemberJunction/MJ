import { Component, Input, Output, EventEmitter, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { Metadata, CompositeKey, KeyValuePair, BaseEntity } from '@memberjunction/core';
import { MJQueryEntity, MJQueryCategoryEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { TreeBranchConfig, TreeNode } from '@memberjunction/ng-trees';
import { TreeDropdownComponent } from '@memberjunction/ng-trees';

/**
 * Result emitted when a query is successfully saved
 */
export interface SaveQueryResult {
  queryId: string;
  queryName: string;
}

/**
 * Slide-in panel for saving an ad-hoc SQL query as a reusable MJ Query record.
 * Pre-populates name from the artifact title and provides a tree dropdown
 * for selecting a query category, with inline category creation.
 *
 * Follows the CreateAgentSlideInComponent pattern for slide-in UX.
 */
@Component({
  standalone: false,
  selector: 'mj-save-query-panel',
  template: `
    <!-- Backdrop -->
    <div class="sqp-backdrop" [class.sqp-visible]="IsVisible" (click)="OnCancel()"></div>

    <!-- Slide panel -->
    <div class="sqp-panel" [class.sqp-visible]="IsVisible">
      <!-- Header -->
      <div class="sqp-header">
        <div class="sqp-title-group">
          <i class="fa-solid fa-save sqp-title-icon"></i>
          <h2 class="sqp-title">Save Query</h2>
        </div>
        <button class="sqp-close-btn" (click)="OnCancel()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Body -->
      <div class="sqp-body">
        <!-- Name -->
        <div class="sqp-field">
          <label class="sqp-label">
            Name <span class="sqp-required">*</span>
          </label>
          <input
            type="text"
            class="sqp-input"
            [(ngModel)]="Name"
            placeholder="Query name"
            (keydown.enter)="OnSave()">
        </div>

        <!-- Category -->
        <div class="sqp-field">
          <div class="sqp-label-row">
            <label class="sqp-label">Category</label>
            @if (!IsCreatingCategory) {
              <button class="sqp-add-btn" (click)="StartCreateCategory()" title="Create new category">
                <i class="fa-solid fa-plus"></i> New
              </button>
            }
          </div>

          <mj-tree-dropdown
            #categoryTree
            [BranchConfig]="CategoryBranchConfig"
            [SelectionMode]="'single'"
            [SelectableTypes]="'branch'"
            [Placeholder]="'Select a category (optional)'"
            [Value]="SelectedCategoryKey"
            (SelectionChange)="OnCategoryChanged($event)">
          </mj-tree-dropdown>

          <!-- Inline create category form -->
          @if (IsCreatingCategory) {
            <div class="sqp-create-category">
              <div class="sqp-create-header">
                <i class="fa-solid fa-folder-plus"></i>
                <span>New Category</span>
              </div>
              <div class="sqp-create-fields">
                <input
                  type="text"
                  class="sqp-input"
                  [(ngModel)]="NewCategoryName"
                  placeholder="Category name"
                  (keydown.enter)="CreateCategory()"
                  (keydown.escape)="CancelCreateCategory()">
                <div class="sqp-create-parent">
                  <label class="sqp-sublabel">Parent (optional)</label>
                  <mj-tree-dropdown
                    [BranchConfig]="CategoryBranchConfig"
                    [SelectionMode]="'single'"
                    [SelectableTypes]="'branch'"
                    [Placeholder]="'None (top level)'"
                    (SelectionChange)="OnNewCategoryParentChanged($event)">
                  </mj-tree-dropdown>
                </div>
              </div>
              <div class="sqp-create-actions">
                <button class="sqp-btn sqp-btn-create"
                  (click)="CreateCategory()"
                  [disabled]="!NewCategoryName.trim() || IsCreatingCategorySaving">
                  @if (IsCreatingCategorySaving) {
                    <i class="fa-solid fa-spinner fa-spin"></i>
                  } @else {
                    <i class="fa-solid fa-check"></i>
                  }
                  {{ IsCreatingCategorySaving ? 'Creating...' : 'Create' }}
                </button>
                <button class="sqp-btn sqp-btn-cancel-create"
                  (click)="CancelCreateCategory()"
                  [disabled]="IsCreatingCategorySaving">
                  Cancel
                </button>
              </div>
              @if (CreateCategoryError) {
                <div class="sqp-inline-error">{{ CreateCategoryError }}</div>
              }
            </div>
          }
        </div>

        <!-- Description -->
        <div class="sqp-field">
          <label class="sqp-label">Description</label>
          <textarea
            class="sqp-textarea"
            [(ngModel)]="Description"
            placeholder="Optional description"
            rows="3">
          </textarea>
        </div>

        @if (ErrorMessage) {
          <div class="sqp-error">
            <i class="fa-solid fa-exclamation-circle"></i>
            {{ ErrorMessage }}
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="sqp-footer">
        <button class="sqp-btn sqp-btn-save"
          (click)="OnSave()"
          [disabled]="!CanSave || IsSaving">
          @if (IsSaving) {
            <i class="fa-solid fa-spinner fa-spin"></i> Saving...
          } @else {
            <i class="fa-solid fa-save"></i> Save Query
          }
        </button>
        <button class="sqp-btn sqp-btn-cancel"
          (click)="OnCancel()"
          [disabled]="IsSaving">
          Cancel
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* Backdrop */
    .sqp-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0);
      z-index: 1000;
      transition: background 0.3s ease;
      pointer-events: none;
    }
    .sqp-backdrop.sqp-visible {
      background: rgba(0, 0, 0, 0.3);
      pointer-events: auto;
    }

    /* Panel — uses right offset instead of transform to avoid creating
       a new containing block that breaks position:fixed children
       (e.g., the tree-dropdown popup). */
    .sqp-panel {
      position: fixed;
      top: 0;
      right: -440px;
      height: 100vh;
      width: 440px;
      background: var(--card-background, #ffffff);
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
      z-index: 1001;
      display: flex;
      flex-direction: column;
      transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .sqp-panel.sqp-visible {
      right: 0;
    }

    /* Header */
    .sqp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--border-color, #e5e7eb);
      flex-shrink: 0;
    }
    .sqp-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sqp-title-icon {
      font-size: 20px;
      color: #5c6bc0;
    }
    .sqp-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary, #1f2937);
    }
    .sqp-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: none;
      border: none;
      border-radius: 8px;
      color: var(--text-secondary, #6b7280);
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 16px;
      flex-shrink: 0;
    }
    .sqp-close-btn:hover {
      background: var(--hover-background, #f3f4f6);
      color: var(--text-primary, #1f2937);
    }

    /* Body */
    .sqp-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    /* Fields */
    .sqp-field {
      margin-bottom: 20px;
    }
    .sqp-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .sqp-label {
      display: block;
      margin-bottom: 6px;
      font-weight: 600;
      font-size: 13px;
      color: var(--text-primary, #374151);
    }
    .sqp-label-row .sqp-label {
      margin-bottom: 0;
    }
    .sqp-sublabel {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
      font-size: 12px;
      color: #6b7280;
    }
    .sqp-required {
      color: #dc2626;
    }
    .sqp-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      color: #1f2937;
      background: #fff;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      box-sizing: border-box;
    }
    .sqp-input:focus {
      outline: none;
      border-color: #5c6bc0;
      box-shadow: 0 0 0 3px rgba(92, 107, 192, 0.15);
    }
    .sqp-input::placeholder {
      color: #9ca3af;
    }
    .sqp-textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      color: #1f2937;
      background: #fff;
      resize: vertical;
      font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      box-sizing: border-box;
    }
    .sqp-textarea:focus {
      outline: none;
      border-color: #5c6bc0;
      box-shadow: 0 0 0 3px rgba(92, 107, 192, 0.15);
    }
    .sqp-textarea::placeholder {
      color: #9ca3af;
    }

    /* Add category button */
    .sqp-add-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      background: none;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
      color: #5c6bc0;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .sqp-add-btn:hover {
      background: #eef2ff;
      border-color: #5c6bc0;
    }

    /* Inline create category */
    .sqp-create-category {
      margin-top: 12px;
      padding: 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .sqp-create-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 10px;
    }
    .sqp-create-header i {
      color: #5c6bc0;
    }
    .sqp-create-fields {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .sqp-create-parent {
      margin-top: 2px;
    }
    .sqp-create-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .sqp-inline-error {
      margin-top: 8px;
      font-size: 12px;
      color: #dc2626;
    }

    /* Buttons */
    .sqp-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .sqp-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .sqp-btn-save {
      background: #5c6bc0;
      color: #fff;
      padding: 10px 20px;
      font-size: 14px;
    }
    .sqp-btn-save:hover:not(:disabled) {
      background: #3f51b5;
    }
    .sqp-btn-cancel {
      background: none;
      border: 1px solid #d1d5db;
      color: #6b7280;
      padding: 10px 20px;
      font-size: 14px;
    }
    .sqp-btn-cancel:hover:not(:disabled) {
      background: #f3f4f6;
      color: #374151;
    }
    .sqp-btn-create {
      background: #16a34a;
      color: #fff;
    }
    .sqp-btn-create:hover:not(:disabled) {
      background: #15803d;
    }
    .sqp-btn-cancel-create {
      background: none;
      color: #6b7280;
    }
    .sqp-btn-cancel-create:hover:not(:disabled) {
      color: #374151;
      background: #f1f5f9;
    }

    /* Footer */
    .sqp-footer {
      display: flex;
      gap: 10px;
      padding: 16px 24px;
      border-top: 1px solid var(--border-color, #e5e7eb);
      flex-shrink: 0;
    }

    /* Error */
    .sqp-error {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      color: #dc2626;
      font-size: 13px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .sqp-panel {
        width: 100% !important;
        right: -100%;
      }
      .sqp-panel.sqp-visible {
        right: 0;
      }
      .sqp-header {
        padding: 16px 20px 12px;
      }
      .sqp-body {
        padding: 16px;
      }
      .sqp-footer {
        padding: 12px 16px;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SaveQueryPanelComponent {
  @Input() QueryName = '';
  @Input() QueryDescription = '';
  @Input() SQL = '';

  @Output() Saved = new EventEmitter<SaveQueryResult>();
  @Output() Cancelled = new EventEmitter<void>();

  @ViewChild('categoryTree') categoryTree!: TreeDropdownComponent;

  // Form state
  public Name = '';
  public Description = '';
  public IsSaving = false;
  public ErrorMessage = '';
  public IsVisible = false;

  // Category selection
  private selectedCategoryId: string | null = null;
  public SelectedCategoryKey: CompositeKey | null = null;

  // Inline category creation
  public IsCreatingCategory = false;
  public IsCreatingCategorySaving = false;
  public NewCategoryName = '';
  public CreateCategoryError = '';
  private newCategoryParentId: string | null = null;

  /** Tree config for query category hierarchy */
  public CategoryBranchConfig: TreeBranchConfig = {
    EntityName: 'MJ: Query Categories',
    DisplayField: 'Name',
    IDField: 'ID',
    ParentIDField: 'ParentID',
    DefaultIcon: 'fa-solid fa-folder',
    OrderBy: 'Name ASC'
  };

  constructor(private cdr: ChangeDetectorRef) {}

  public get CanSave(): boolean {
    return !!this.Name?.trim();
  }

  ngOnInit(): void {
    // Sync input values
    this.Name = this.QueryName;
    this.Description = this.QueryDescription;

    // Trigger slide-in on next microtask (ensures DOM is ready)
    Promise.resolve().then(() => {
      this.IsVisible = true;
      this.cdr.markForCheck();
    });
  }

  @HostListener('document:keydown.escape')
  public OnEscapeKey(): void {
    if (this.IsCreatingCategory) {
      this.CancelCreateCategory();
    } else if (!this.IsSaving) {
      this.OnCancel();
    }
  }

  // =========================================================================
  // Category Selection
  // =========================================================================

  public OnCategoryChanged(selection: TreeNode | TreeNode[] | null): void {
    if (!selection) {
      this.selectedCategoryId = null;
    } else if (Array.isArray(selection)) {
      this.selectedCategoryId = selection.length > 0 ? selection[0].ID : null;
    } else {
      this.selectedCategoryId = selection.ID;
    }
  }

  // =========================================================================
  // Inline Category Creation
  // =========================================================================

  public StartCreateCategory(): void {
    this.IsCreatingCategory = true;
    this.NewCategoryName = '';
    this.newCategoryParentId = null;
    this.CreateCategoryError = '';
    this.cdr.markForCheck();
  }

  public CancelCreateCategory(): void {
    this.IsCreatingCategory = false;
    this.NewCategoryName = '';
    this.newCategoryParentId = null;
    this.CreateCategoryError = '';
    this.cdr.markForCheck();
  }

  public OnNewCategoryParentChanged(selection: TreeNode | TreeNode[] | null): void {
    if (!selection) {
      this.newCategoryParentId = null;
    } else if (Array.isArray(selection)) {
      this.newCategoryParentId = selection.length > 0 ? selection[0].ID : null;
    } else {
      this.newCategoryParentId = selection.ID;
    }
  }

  public async CreateCategory(): Promise<void> {
    const name = this.NewCategoryName.trim();
    if (!name || this.IsCreatingCategorySaving) return;

    this.IsCreatingCategorySaving = true;
    this.CreateCategoryError = '';
    this.cdr.markForCheck();

    try {
      const md = new Metadata();
      const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories');

      category.Name = name;
      category.UserID = md.CurrentUser.ID;
      if (this.newCategoryParentId) {
        category.ParentID = this.newCategoryParentId;
      }

      const saved = await category.Save();
      if (saved) {
        MJNotificationService.Instance.CreateSimpleNotification(`Category "${name}" created`, 'success', 2500);

        // Refresh core metadata so Metadata.QueryCategories is up to date
        await md.Refresh();

        // Refresh tree to pick up the new category
        await this.categoryTree.Refresh();

        // Auto-select the newly created category.
        // Must use detectChanges() (not markForCheck) to immediately propagate
        // the new Value input to the tree dropdown, since this panel uses OnPush.
        const newKey = new CompositeKey([new KeyValuePair('ID', category.ID)]);
        this.SelectedCategoryKey = newKey;
        this.selectedCategoryId = category.ID;
        this.cdr.detectChanges();

        // Collapse the create form
        this.IsCreatingCategory = false;
        this.NewCategoryName = '';
        this.newCategoryParentId = null;
      } else {
        const errorMsg = this.getEntityErrorMessage(category, 'create category');
        this.CreateCategoryError = errorMsg;
        MJNotificationService.Instance.CreateSimpleNotification(errorMsg, 'error', 5000);
        console.error('Failed to create category:', category.LatestResult);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create category';
      this.CreateCategoryError = errorMsg;
      MJNotificationService.Instance.CreateSimpleNotification(errorMsg, 'error', 5000);
      console.error('Error creating category:', error);
    } finally {
      this.IsCreatingCategorySaving = false;
      this.cdr.markForCheck();
    }
  }

  // =========================================================================
  // Save / Cancel
  // =========================================================================

  public async OnSave(): Promise<void> {
    if (!this.CanSave || this.IsSaving) return;

    this.IsSaving = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    try {
      const md = new Metadata();
      const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries');

      query.Name = this.Name.trim();
      query.SQL = this.SQL;
      query.Status = 'Approved';

      if (this.Description?.trim()) {
        query.Description = this.Description.trim();
      }
      if (this.selectedCategoryId) {
        query.CategoryID = this.selectedCategoryId;
      }

      const saved = await query.Save();
      if (saved) {
        MJNotificationService.Instance.CreateSimpleNotification(`Query "${query.Name}" saved`, 'success', 2500);

        // Animate out, then emit
        this.IsVisible = false;
        this.cdr.markForCheck();
        setTimeout(() => {
          this.Saved.emit({
            queryId: query.ID,
            queryName: query.Name
          });
        }, 300);
      } else {
        const errorMsg = this.getEntityErrorMessage(query, 'save query');
        this.ErrorMessage = errorMsg;
        MJNotificationService.Instance.CreateSimpleNotification(errorMsg, 'error', 5000);
        console.error('Failed to save query:', query.LatestResult);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
      this.ErrorMessage = errorMsg;
      MJNotificationService.Instance.CreateSimpleNotification(errorMsg, 'error', 5000);
      console.error('Error saving query:', error);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  public OnCancel(): void {
    if (this.IsSaving) return;
    this.IsVisible = false;
    this.cdr.markForCheck();
    setTimeout(() => this.Cancelled.emit(), 300);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private getEntityErrorMessage(entity: BaseEntity, operation: string): string {
    const result = entity.LatestResult;
    if (result?.Message) {
      return result.Message;
    }
    return `Failed to ${operation}. Please try again.`;
  }
}
