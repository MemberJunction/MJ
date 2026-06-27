import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  EventEmitter,
  Input,
  Output,
  OnInit,
  ViewEncapsulation,
} from '@angular/core';
import {
  BaseEntity,
  EntityFieldInfo,
  EntityFieldTSType,
  EntityInfo,
} from '@memberjunction/core';
import { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Mode controls how the preview is rendered and how the restore is interpreted.
 *
 * - `'live'`: target record exists; the preview shows a current-vs-restore
 *   diff per field. Confirming applies the snapshot to the live record and
 *   triggers an UPDATE.
 * - `'undelete'`: target record was hard-deleted. The preview shows the
 *   snapshot fields that will be inserted; confirming triggers an INSERT.
 */
export type RestorePreviewMode = 'live' | 'undelete';

/**
 * One row in the restore preview table.
 *
 * Renders as a checkbox + field name + (current / restore) values. The
 * `IsChanged` flag drives the default-checked state and the row's visual
 * treatment. `IsMissingInSchema` and `IsFKMissing` surface drift warnings.
 */
export interface RestoreFieldRow {
  /** Raw field name (matches EntityField.Name). */
  FieldName: string;
  /** Friendly label (EntityField.DisplayNameOrName). */
  DisplayName: string;
  /** Formatted current value of the live record (empty in undelete mode). */
  CurrentValue: string;
  /** Formatted snapshot value that would be applied. */
  RestoreValue: string;
  /** Raw snapshot value (the value passed to BaseEntity.Set). */
  RawRestoreValue: unknown;
  /** True when CurrentValue and RestoreValue differ. Drives default checked. */
  IsChanged: boolean;
  /** User's selection — when true, this field will be applied on restore. */
  Selected: boolean;
  /** True when the snapshot references a field that no longer exists on the entity. */
  IsMissingInSchema: boolean;
  /** True when the field is a FK whose target row no longer exists (best-effort). */
  IsFKMissing: boolean;
  /** True when the field is read-only / system / PK and cannot be restored. */
  IsImmutable: boolean;
}

/**
 * Cancelable event fired immediately after the user clicks Restore but
 * before {@link RestorePreviewPanelComponent.RestoreConfirmed} emits.
 *
 * Consumers can set `cancel = true` (and optionally `cancelReason`) to abort
 * the restore — useful for custom approval workflows, audit logging hooks,
 * or for a consumer that wants to take over the actual save itself.
 */
export interface BeforeRestoreCommitEvent {
  /** Set to true to abort. RestoreConfirmed will not fire. */
  cancel: boolean;
  /** Optional explanation surfaced by the consumer. */
  cancelReason?: string;
  /** Selected field names (only fields the user kept checked). */
  SelectedFieldNames: string[];
  /** The full set of rows in the preview, including unselected. */
  AllRows: RestoreFieldRow[];
  /** ID of the source RecordChange row whose state is being restored. */
  SourceChangeID: string;
  /** Optional reason text the user entered. */
  Reason: string | null;
  /** The mode — 'live' (UPDATE) or 'undelete' (INSERT). */
  Mode: RestorePreviewMode;
}

/**
 * Event payload emitted after the user has confirmed a restore.
 *
 * The host component is responsible for applying the snapshot to a
 * BaseEntity instance, calling {@link BaseEntity.SetRestoreContext}, and
 * invoking Save(). This component never touches the database directly so
 * it remains usable in any consumer context.
 */
export interface RestoreCommitEvent {
  /** ID of the source RecordChange row whose state is being restored. */
  SourceChangeID: string;
  /** Optional user-entered reason; persisted to RecordChange.RestoreReason. */
  Reason: string | null;
  /** Selected fields with their snapshot values, ready for BaseEntity.Set. */
  FieldValues: Array<{ FieldName: string; Value: unknown }>;
  /** The full preview rows (including unselected) for audit/logging. */
  AllRows: RestoreFieldRow[];
  /** Mode indicates UPDATE (live) vs INSERT (undelete). */
  Mode: RestorePreviewMode;
}

/**
 * Reusable slide-in panel that previews a restore operation against a
 * historical {@link MJRecordChangeEntity} and lets the user confirm with
 * field-level granularity.
 *
 * This component is rendered by both:
 * - The Record Changes timeline (for restoring a live record from any past
 *   change row)
 * - The Recycle Bin (for re-creating a hard-deleted record from its delete
 *   snapshot)
 *
 * It does NOT perform the save itself — the host component receives a
 * {@link RestoreCommitEvent} with the selected field values and is
 * responsible for applying them to a BaseEntity, setting the restore
 * context, and calling Save(). This keeps the component purely
 * presentational and reusable in any context.
 *
 * ### Semantic correctness
 *
 * The preview compares the **full snapshot** captured in the source
 * change's `FullRecordJSON` to the current live record (or to nothing in
 * un-delete mode). It does NOT roll back a single delta — restoring `v2`
 * means "make the record look like it did at v2", not "undo v3's changes".
 *
 * @example Live restore from the timeline
 *   <mj-restore-preview-panel
 *     [Visible]="showPreview"
 *     [Mode]="'live'"
 *     [RecordChange]="selectedChange"
 *     [LiveRecord]="record"
 *     (RestoreConfirmed)="onRestoreConfirmed($event)"
 *     (RestoreCancelled)="showPreview = false">
 *   </mj-restore-preview-panel>
 *
 * @example Un-delete from the Recycle Bin
 *   <mj-restore-preview-panel
 *     [Visible]="showPreview"
 *     [Mode]="'undelete'"
 *     [RecordChange]="deletedChange"
 *     [EntityName]="'Customers'"
 *     (RestoreConfirmed)="onRecreate($event)"
 *     (RestoreCancelled)="showPreview = false">
 *   </mj-restore-preview-panel>
 */
@Component({
  standalone: false,
  selector: 'mj-restore-preview-panel',
  templateUrl: './restore-preview-panel.component.html',
  styleUrls: ['./restore-preview-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RestorePreviewPanelComponent extends BaseAngularComponent implements OnInit {
  // ─── Inputs ─────────────────────────────────────────────────────

  /**
   * Controls panel visibility. Setting to true opens the slide-in;
   * setting to false closes it. On every closed→open transition the
   * panel auto-resets its transient state (`IsRestoring`, `Reason`,
   * `ShowUnchanged`, row checks) so the host doesn't have to remember
   * to call `Reset()` after a restore completes.
   */
  private _visible = false;
  @Input()
  set Visible(value: boolean) {
    const prev = this._visible;
    this._visible = value;
    if (!prev && value && this.isInitialized) {
      this.Reset();
    }
  }
  get Visible(): boolean {
    return this._visible;
  }

  /**
   * Operating mode — `'live'` for restoring an existing record from a
   * snapshot, `'undelete'` for re-creating a hard-deleted record.
   */
  @Input() Mode: RestorePreviewMode = 'live';

  /**
   * The historical RecordChange row whose state will be restored. Required.
   * The component reads `FullRecordJSON` from this entity to determine the
   * target state. The change's `Type` does not matter — `Create`,
   * `Update`, `Snapshot`, and `Delete` are all valid restore sources.
   */
  private _recordChange: MJRecordChangeEntity | null = null;
  @Input()
  set RecordChange(value: MJRecordChangeEntity | null) {
    this._recordChange = value;
    if (this.isInitialized) this.rebuildRows();
  }
  get RecordChange(): MJRecordChangeEntity | null {
    return this._recordChange;
  }

  /**
   * The current live record to diff against. Required in `'live'` mode,
   * ignored in `'undelete'` mode (since the live record no longer exists).
   */
  private _liveRecord: BaseEntity | null = null;
  @Input()
  set LiveRecord(value: BaseEntity | null) {
    this._liveRecord = value;
    if (this.isInitialized) this.rebuildRows();
  }
  get LiveRecord(): BaseEntity | null {
    return this._liveRecord;
  }

  /**
   * The entity name. Required in `'undelete'` mode (since there's no live
   * record to read it from). In `'live'` mode it can be omitted and is
   * inferred from the LiveRecord.
   */
  @Input() EntityName: string | null = null;

  /**
   * When true, the Restore button is disabled until the user enters a
   * non-empty reason. Useful for regulated environments where every
   * reversal needs justification. Default: false.
   */
  @Input() RequireReason = false;

  /**
   * When true, hides the optional reason text area entirely. Default: false.
   */
  @Input() HideReason = false;

  // ─── Outputs ────────────────────────────────────────────────────

  /**
   * Cancelable event fired when the user clicks Restore but before
   * {@link RestoreConfirmed} emits. Consumers can set `cancel = true` on
   * the event arg to abort the operation — useful for custom approval
   * workflows or for taking over the save themselves.
   */
  @Output() BeforeRestoreCommit = new EventEmitter<BeforeRestoreCommitEvent>();

  /**
   * Emitted after the user confirms the restore (and BeforeRestoreCommit
   * was not cancelled). The host is responsible for applying the field
   * values to a BaseEntity, calling SetRestoreContext, and invoking Save().
   */
  @Output() RestoreConfirmed = new EventEmitter<RestoreCommitEvent>();

  /**
   * Emitted when the user cancels the preview without restoring.
   */
  @Output() RestoreCancelled = new EventEmitter<void>();

  // ─── Public state (read by template) ────────────────────────────

  public Rows: RestoreFieldRow[] = [];
  public Reason = '';
  public IsRestoring = false;
  public ShowUnchanged = false;

  /** Number of rows where the current value differs from the snapshot. */
  public ChangedCount = 0;
  /** Number of rows that are checked (will be applied on restore). */
  public SelectedCount = 0;
  /** Number of rows the schema has dropped or renamed since the snapshot. */
  public DriftCount = 0;

  private isInitialized = false;
  private resolvedEntityInfo: EntityInfo | null = null;

  constructor(private cdr: ChangeDetectorRef) { super(); }

  ngOnInit(): void {
    this.isInitialized = true;
    // If the panel was opened synchronously during host bootstrap, the
    // Visible setter ran before `isInitialized` was true and skipped the
    // auto-reset. Do it here once so the first open is always clean.
    if (this._visible) {
      this.Reset();
    } else {
      this.rebuildRows();
    }
  }

  // ─── Public methods ─────────────────────────────────────────────

  /**
   * Toggles whether unchanged rows are visible in the table. When false
   * (default), only rows where current ≠ snapshot are shown.
   */
  public ToggleUnchanged(): void {
    this.ShowUnchanged = !this.ShowUnchanged;
    this.cdr.markForCheck();
  }

  /**
   * Toggles whether a single row is selected for restore. Updates the
   * SelectedCount in real time so the primary button label reflects it.
   */
  public ToggleRow(row: RestoreFieldRow): void {
    if (row.IsImmutable || row.IsMissingInSchema) return;
    row.Selected = !row.Selected;
    this.recountSelected();
    this.cdr.markForCheck();
  }

  /**
   * Selects every row that can be selected (skips immutable / drifted).
   */
  public SelectAll(): void {
    for (const row of this.Rows) {
      if (!row.IsImmutable && !row.IsMissingInSchema) row.Selected = true;
    }
    this.recountSelected();
    this.cdr.markForCheck();
  }

  /**
   * Deselects every row in the preview.
   */
  public DeselectAll(): void {
    for (const row of this.Rows) row.Selected = false;
    this.recountSelected();
    this.cdr.markForCheck();
  }

  /**
   * User clicked Restore — fire BeforeRestoreCommit (cancelable), then
   * RestoreConfirmed if not cancelled.
   */
  public ConfirmRestore(): void {
    if (!this._recordChange) return;
    if (this.IsRestoreDisabled) return;

    const selected = this.Rows.filter(r => r.Selected && !r.IsMissingInSchema && !r.IsImmutable);
    const reason = this.Reason.trim() ? this.Reason.trim() : null;

    const beforeEvent: BeforeRestoreCommitEvent = {
      cancel: false,
      SelectedFieldNames: selected.map(r => r.FieldName),
      AllRows: this.Rows.slice(),
      SourceChangeID: this._recordChange.ID,
      Reason: reason,
      Mode: this.Mode,
    };
    this.BeforeRestoreCommit.emit(beforeEvent);
    if (beforeEvent.cancel) return;

    this.IsRestoring = true;
    this.cdr.markForCheck();

    const commitEvent: RestoreCommitEvent = {
      SourceChangeID: this._recordChange.ID,
      Reason: reason,
      FieldValues: selected.map(r => ({ FieldName: r.FieldName, Value: r.RawRestoreValue })),
      AllRows: this.Rows.slice(),
      Mode: this.Mode,
    };
    this.RestoreConfirmed.emit(commitEvent);
  }

  /**
   * User cancelled the preview. Resets state and emits RestoreCancelled.
   */
  public Cancel(): void {
    this.RestoreCancelled.emit();
  }

  /**
   * Resets internal state — useful after a save completes so the panel
   * can be reopened cleanly. Called by the host component when needed.
   */
  public Reset(): void {
    this.Reason = '';
    this.IsRestoring = false;
    this.ShowUnchanged = false;
    this.rebuildRows();
  }

  // ─── Computed getters (template) ────────────────────────────────

  public get IsRestoreDisabled(): boolean {
    if (this.IsRestoring) return true;
    if (this.SelectedCount === 0) return true;
    if (this.RequireReason && this.Reason.trim().length === 0) return true;
    return false;
  }

  public get RestoreButtonLabel(): string {
    if (this.IsRestoring) return 'Restoring…';
    if (this.Mode === 'undelete') {
      return this.SelectedCount > 0 ? `Re-create (${this.SelectedCount} field${this.SelectedCount === 1 ? '' : 's'})` : 'Re-create';
    }
    return this.SelectedCount > 0 ? `Restore (${this.SelectedCount} field${this.SelectedCount === 1 ? '' : 's'})` : 'Restore';
  }

  public get HeaderTitle(): string {
    return this.Mode === 'undelete' ? 'Re-create from snapshot' : 'Restore record to this version';
  }

  public get VersionTimestamp(): Date | null {
    return this._recordChange?.ChangedAt ?? null;
  }

  public get VersionUser(): string {
    return this._recordChange?.User ?? '';
  }

  public get UnchangedCount(): number {
    return this.Rows.length - this.ChangedCount;
  }

  // ─── Internal: row building ─────────────────────────────────────

  /**
   * Rebuilds the Rows array from the current RecordChange + LiveRecord.
   * Idempotent and cheap — safe to call from input setters.
   */
  private rebuildRows(): void {
    this.Rows = [];
    this.ChangedCount = 0;
    this.SelectedCount = 0;
    this.DriftCount = 0;

    if (!this._recordChange) {
      this.cdr.markForCheck();
      return;
    }

    const snapshot = this.parseSnapshot(this._recordChange.FullRecordJSON);
    if (!snapshot) {
      this.cdr.markForCheck();
      return;
    }

    const entityInfo = this.resolveEntityInfo();
    if (!entityInfo) {
      this.cdr.markForCheck();
      return;
    }

    // Build a row for every field in the snapshot. We iterate the snapshot
    // (not EntityInfo.Fields) so fields that exist in the snapshot but no
    // longer in the schema surface as drift warnings.
    const seen = new Set<string>();
    for (const fieldName of Object.keys(snapshot)) {
      seen.add(fieldName.toLowerCase());
      const row = this.buildRowFromSnapshot(fieldName, snapshot[fieldName], entityInfo);
      if (row) this.Rows.push(row);
    }

    // Sort: changed rows first, then unchanged. Within each group, by display name.
    this.Rows.sort((a, b) => {
      if (a.IsChanged !== b.IsChanged) return a.IsChanged ? -1 : 1;
      return a.DisplayName.localeCompare(b.DisplayName);
    });

    this.ChangedCount = this.Rows.filter(r => r.IsChanged).length;
    this.DriftCount = this.Rows.filter(r => r.IsMissingInSchema).length;
    this.recountSelected();
    this.cdr.markForCheck();
  }

  private buildRowFromSnapshot(
    fieldName: string,
    snapshotValue: unknown,
    entityInfo: EntityInfo,
  ): RestoreFieldRow | null {
    const field = entityInfo.Fields.find(
      (f: EntityFieldInfo) => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase(),
    );

    // Skip system / timestamp fields that the platform manages.
    if (fieldName.startsWith('__mj_')) return null;

    const isImmutable = !!field && (field.ReadOnly || field.IsPrimaryKey);
    const isMissingInSchema = !field;
    const isDateField = field?.TSType === EntityFieldTSType.Date;

    const formattedRestore = this.formatValue(snapshotValue, isDateField);
    const formattedCurrent = this.Mode === 'undelete'
      ? ''
      : this.getCurrentFieldValue(fieldName, isDateField);

    const isChanged = this.Mode === 'undelete'
      ? snapshotValue != null && snapshotValue !== ''
      : formattedCurrent !== formattedRestore;

    // Default selection: pre-check changed rows that we can actually apply.
    const selected = isChanged && !isImmutable && !isMissingInSchema;

    return {
      FieldName: fieldName,
      DisplayName: field?.DisplayNameOrName ?? fieldName,
      CurrentValue: formattedCurrent,
      RestoreValue: formattedRestore,
      RawRestoreValue: snapshotValue,
      IsChanged: isChanged,
      Selected: selected,
      IsMissingInSchema: isMissingInSchema,
      IsFKMissing: false, // Reserved for future FK-existence check
      IsImmutable: isImmutable,
    };
  }

  private getCurrentFieldValue(fieldName: string, isDateField: boolean): string {
    if (!this._liveRecord) return '';
    const field = this._liveRecord.Fields.find(
      f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase(),
    );
    if (!field) return '';
    return this.formatValue(field.Value, isDateField);
  }

  private parseSnapshot(json: string | null | undefined): Record<string, unknown> | null {
    if (!json) return null;
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Resolves the entity metadata. Prefers LiveRecord.EntityInfo (always
   * accurate). Falls back to looking up by EntityName. Memoized.
   */
  private resolveEntityInfo(): EntityInfo | null {
    if (this.resolvedEntityInfo) return this.resolvedEntityInfo;
    if (this._liveRecord?.EntityInfo) {
      this.resolvedEntityInfo = this._liveRecord.EntityInfo;
      return this.resolvedEntityInfo;
    }
    if (this.EntityName) {
      const md = this.ProviderToUse;
      const ei = md.Entities.find(
        e => e.Name.trim().toLowerCase() === this.EntityName!.trim().toLowerCase(),
      );
      this.resolvedEntityInfo = ei ?? null;
      return this.resolvedEntityInfo;
    }
    return null;
  }

  private formatValue(value: unknown, isDateField: boolean): string {
    if (value == null) return '';
    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>);
      if (keys.length === 0) return '';
      return JSON.stringify(value);
    }
    if (isDateField && typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(date);
      }
    }
    return String(value);
  }

  private recountSelected(): void {
    this.SelectedCount = this.Rows.filter(r => r.Selected).length;
  }

  // ─── Display helpers (template) ─────────────────────────────────

  public formatTimestamp(date: Date | null): string {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));
  }
}
