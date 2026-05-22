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

  public listName = '';
  public description = '';
  public categoryId: string | null = null;
  public rememberLineage = true;
  public useSnapshot = true;
  public refreshMode: 'Additive' | 'Sync' = 'Additive';

  public categories: MJListCategoryEntity[] = [];
  public loadingCategories = false;
  public submitting = false;

  async ngOnInit(): Promise<void> {
    await this.loadCategories();
  }

  public OnSave(): void {
    if (!this.canSave) return;
    this.submitting = true;
    const payload: SaveViewAsListResult = {
      ListName: this.listName.trim(),
      Description: this.description.trim() || undefined,
      CategoryId: this.categoryId ?? undefined,
      RememberLineage: this.rememberLineage,
      // UseSnapshot only meaningful when lineage is remembered.
      UseSnapshot: this.rememberLineage && this.useSnapshot,
      RefreshMode: this.refreshMode,
    };
    this.Save.emit(payload);
  }

  public OnCancel(): void {
    this.Cancel.emit();
  }

  public OnLineageChange(remember: boolean): void {
    this.rememberLineage = remember;
    // If lineage is off, snapshot has no meaning — keep the checkbox state
    // intact so re-enabling lineage restores it, but the emitted payload
    // forces UseSnapshot=false (see `OnSave`).
  }

  public get canSave(): boolean {
    return !!this.ViewId && this.listName.trim().length > 0 && !this.submitting;
  }

  public get confirmButtonLabel(): string {
    if (this.submitting) return 'Saving...';
    if (this.RecordCount != null) return `Save List (${this.RecordCount} records)`;
    return 'Save List';
  }

  /**
   * Load list categories for the category dropdown. Multi-provider safe.
   * Failures degrade gracefully — the dropdown just shows "Uncategorized"
   * and we log so the user can troubleshoot.
   */
  private async loadCategories(): Promise<void> {
    this.loadingCategories = true;
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJListCategoryEntity>({
        EntityName: 'MJ: List Categories',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
      });
      if (result.Success) {
        this.categories = result.Results ?? [];
      }
    } finally {
      this.loadingCategories = false;
      this.cdr.markForCheck();
    }
  }

  private resetForm(): void {
    this.listName = this.ViewName ? `${this.ViewName} — Snapshot ${new Date().toISOString().slice(0, 10)}` : '';
    this.description = '';
    this.categoryId = null;
    this.rememberLineage = true;
    this.useSnapshot = true;
    this.refreshMode = 'Additive';
    this.submitting = false;
  }
}
