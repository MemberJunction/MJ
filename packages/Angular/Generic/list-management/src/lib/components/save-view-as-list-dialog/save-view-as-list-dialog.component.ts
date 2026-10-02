import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RunView } from '@memberjunction/core';
import { MJListCategoryEntity } from '@memberjunction/core-entities';

/**
 * Form payload emitted when the user clicks Save. The parent component is
 * responsible for calling `GraphQLListsClient.MaterializeFromView` with these
 * options — we keep the dialog generic so it doesn't have to know about the
 * GraphQL transport.
 */
export interface SaveViewAsListResult {
  ListName: string;
  Description?: string;
  CategoryId?: string;
  RememberLineage: boolean;
  UseSnapshot: boolean;
  RefreshMode: 'Additive' | 'Sync';
}

/**
 * Dialog for materializing a User View into a new static List. Matches
 * mockup `09-save-view-as-list.html`: name + description + category, then
 * a radio group for source-lineage (remember vs one-time snapshot), then a
 * "freeze filter" checkbox that maps to `UseSnapshot` on the list.
 *
 * The dialog is reusable — pass `ViewId` + `ViewName` + the displayed
 * record count and listen for `Save` / `Cancel`. Multi-provider safe via
 * `BaseAngularComponent.ProviderToUse`.
 */
@Component({
  standalone: false,
  selector: 'mj-save-view-as-list-dialog',
  templateUrl: './save-view-as-list-dialog.component.html',
  styleUrls: ['./save-view-as-list-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveViewAsListDialogComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  /** Visibility toggle, getter/setter so opening resets the form. */
  @Input()
  get Visible(): boolean {
    return this._visible;
  }
  set Visible(value: boolean) {
    if (value && !this._visible) this.resetForm();
    this._visible = value;
  }
  private _visible = false;

  /** Required — the User View we're materializing from. */
  @Input() ViewId: string | null = null;

  /** Display name of the source view (shown in the info banner + default list name). */
  @Input() ViewName: string | null = null;

  /** Optional — record count shown in the button label + info banner. */
  @Input() RecordCount: number | null = null;

  @Output() Save = new EventEmitter<SaveViewAsListResult>();
  @Output() Cancel = new EventEmitter<void>();

  public ListName = '';

  /** @deprecated Use {@link ListName}. */
  public get listName() {
    return this.ListName;
  }
  /** @deprecated Use {@link ListName}. */
  public set listName(value) {
    this.ListName = value;
  }
  public description = '';
  public CategoryId: string | null = null;

  /** @deprecated Use {@link CategoryId}. */
  public get categoryId(): string | null {
    return this.CategoryId;
  }
  /** @deprecated Use {@link CategoryId}. */
  public set categoryId(value: string | null) {
    this.CategoryId = value;
  }
  public RememberLineage = true;

  /** @deprecated Use {@link RememberLineage}. */
  public get rememberLineage() {
    return this.RememberLineage;
  }
  /** @deprecated Use {@link RememberLineage}. */
  public set rememberLineage(value) {
    this.RememberLineage = value;
  }
  public UseSnapshot = true;

  /** @deprecated Use {@link UseSnapshot}. */
  public get useSnapshot() {
    return this.UseSnapshot;
  }
  /** @deprecated Use {@link UseSnapshot}. */
  public set useSnapshot(value) {
    this.UseSnapshot = value;
  }
  public RefreshMode: 'Additive' | 'Sync' = 'Additive';

  /** @deprecated Use {@link RefreshMode}. */
  public get refreshMode(): 'Additive' | 'Sync' {
    return this.RefreshMode;
  }
  /** @deprecated Use {@link RefreshMode}. */
  public set refreshMode(value: 'Additive' | 'Sync') {
    this.RefreshMode = value;
  }

  public Categories: MJListCategoryEntity[] = [];

  /** @deprecated Use {@link Categories}. */
  public get categories(): MJListCategoryEntity[] {
    return this.Categories;
  }
  /** @deprecated Use {@link Categories}. */
  public set categories(value: MJListCategoryEntity[]) {
    this.Categories = value;
  }
  public LoadingCategories = false;

  /** @deprecated Use {@link LoadingCategories}. */
  public get loadingCategories() {
    return this.LoadingCategories;
  }
  /** @deprecated Use {@link LoadingCategories}. */
  public set loadingCategories(value) {
    this.LoadingCategories = value;
  }
  public Submitting = false;

  /** @deprecated Use {@link Submitting}. */
  public get submitting() {
    return this.Submitting;
  }
  /** @deprecated Use {@link Submitting}. */
  public set submitting(value) {
    this.Submitting = value;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCategories();
  }

  public OnSave(): void {
    if (!this.CanSave) return;
    this.Submitting = true;
    const payload: SaveViewAsListResult = {
      ListName: this.ListName.trim(),
      Description: this.description.trim() || undefined,
      CategoryId: this.CategoryId ?? undefined,
      RememberLineage: this.RememberLineage,
      // UseSnapshot only meaningful when lineage is remembered.
      UseSnapshot: this.RememberLineage && this.UseSnapshot,
      RefreshMode: this.RefreshMode,
    };
    this.Save.emit(payload);
  }

  public OnCancel(): void {
    this.Cancel.emit();
  }

  public OnLineageChange(remember: boolean): void {
    this.RememberLineage = remember;
    // If lineage is off, snapshot has no meaning — keep the checkbox state
    // intact so re-enabling lineage restores it, but the emitted payload
    // forces UseSnapshot=false (see `OnSave`).
  }

  public get CanSave(): boolean {
    return !!this.ViewId && this.ListName.trim().length > 0 && !this.Submitting;
  }

  /** @deprecated Use {@link CanSave}. */
  public get canSave(): boolean {
    return this.CanSave;
  }

  public get ConfirmButtonLabel(): string {
    if (this.Submitting) return 'Saving...';
    if (this.RecordCount != null) return `Save List (${this.RecordCount} records)`;
    return 'Save List';
  }

  /** @deprecated Use {@link ConfirmButtonLabel}. */
  public get confirmButtonLabel(): string {
    return this.ConfirmButtonLabel;
  }

  /**
   * Load list categories for the category dropdown. Multi-provider safe.
   * Failures degrade gracefully — the dropdown just shows "Uncategorized"
   * and we log so the user can troubleshoot.
   */
  private async loadCategories(): Promise<void> {
    this.LoadingCategories = true;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJListCategoryEntity>({
        EntityName: 'MJ: List Categories',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
      });
      if (result.Success) {
        this.Categories = result.Results ?? [];
      }
    } finally {
      this.LoadingCategories = false;
      this.cdr.markForCheck();
    }
  }

  private resetForm(): void {
    this.ListName = this.ViewName ? `${this.ViewName} — Snapshot ${new Date().toISOString().slice(0, 10)}` : '';
    this.description = '';
    this.CategoryId = null;
    this.RememberLineage = true;
    this.UseSnapshot = true;
    this.RefreshMode = 'Additive';
    this.Submitting = false;
  }
}
