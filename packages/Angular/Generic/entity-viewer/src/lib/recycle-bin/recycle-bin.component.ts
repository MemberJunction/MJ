import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import {
  EntityFieldInfo,
  EntityInfo,
  Metadata,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RestoreCommitEvent } from '@memberjunction/ng-record-changes';
import {
  AfterRecordRestoreEventArgs,
  AfterRecycleBinOpenEventArgs,
  AfterRestoreCommitEventArgs,
  BeforeRecordRestoreEventArgs,
  BeforeRecycleBinOpenEventArgs,
  BeforeRestoreCommitEventArgs,
  RecycleBinEntry,
} from './events/recycle-bin-events';

/**
 * Slide-in panel that lists all hard-deleted records for a single entity
 * and lets a user with `Delete` permission re-create any of them from its
 * historical RecordChange snapshot.
 *
 * ### When to use
 *
 * Surface this component from any entity-viewing context where the user
 * might need to restore a hard-deleted record. The {@link EntityViewerComponent},
 * {@link EntityDataGridComponent}, and {@link EntityCardsComponent}
 * already expose a `ShowRecycleBin` input (default `true`) that renders a
 * chip in their toolbar — you only need to use this component directly if
 * you're building a custom viewer.
 *
 * ### Permissions
 *
 * The chip / panel is gated on `entity.UserPermissions.CanDelete` —
 * rationale: there is no native "undelete" permission in MemberJunction,
 * but if a user has the higher-trust permission to *delete* records of an
 * entity, restoring deleted ones is well within scope. The actual
 * re-create action additionally requires `CanCreate`; without it the
 * Restore button on each card disables with a tooltip.
 *
 * ### Soft deletes vs hard deletes
 *
 * This component only surfaces *hard*-deleted records. Soft-deletes (e.g.,
 * `IsDeleted` flags, `Status='Inactive'`, etc.) leave the record visible
 * in normal entity views, so the standard Record Changes panel + restore
 * preview already handles them — no Recycle Bin needed.
 *
 * ### Cancelable Before/After event surface
 *
 * Every meaningful action emits a paired `before*` / `after*` event. The
 * `before*` event carries `cancel: boolean` so consumers can intercept
 * — useful for custom approval workflows, audit logging, or to take over
 * the actual restore execution entirely. See {@link BeforeRecordRestoreEventArgs}
 * and friends.
 *
 * @example Basic usage (rare — usually embedded by entity-viewer)
 *   <mj-recycle-bin
 *     [Visible]="showBin"
 *     [EntityName]="'Customers'"
 *     (Closed)="showBin = false"
 *     (BeforeRecordRestore)="auditRestore($event)"
 *     (AfterRestoreCommit)="onRestored($event)">
 *   </mj-recycle-bin>
 *
 * @example Intercepting a restore
 *   onBeforeRecordRestore(e: BeforeRecordRestoreEventArgs) {
 *     if (!myCustomApproval(e.entry)) {
 *       e.cancel = true;
 *       e.cancelReason = 'Awaiting compliance approval';
 *     }
 *   }
 */
@Component({
  standalone: false,
  selector: 'mj-recycle-bin',
  templateUrl: './recycle-bin.component.html',
  styleUrls: ['./recycle-bin.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RecycleBinComponent extends BaseAngularComponent implements OnInit  {
  // ─── Inputs ─────────────────────────────────────────────────────

  /**
   * Controls panel visibility. Set to true to slide in (and trigger an
   * initial load); false to slide out.
   */
  private _visible = false;
  @Input()
  set Visible(value: boolean) {
    const wasVisible = this._visible;
    this._visible = value;
    if (value && !wasVisible && this.isInitialized) {
      this.LoadDeletedRecords();
    }
  }
  get Visible(): boolean {
    return this._visible;
  }

  /**
   * The name of the entity whose deleted records will be listed. Required.
   */
  @Input() EntityName: string | null = null;

  /**
   * Optional context user. When omitted, falls back to
   * {@link this.ProviderToUse.CurrentUser} per standard MJ conventions.
   */
  @Input() ContextUser: UserInfo | null = null;

  /**
   * Maximum number of deleted-record cards to load. Defaults to 200 — this
   * is a UI affordance, not a hard limit; consumers needing pagination
   * should listen to {@link AfterRecycleBinOpen} and surface their own UI
   * if `deletedRecordCount === MaxRecords`.
   */
  @Input() MaxRecords = 200;

  // ─── Outputs ────────────────────────────────────────────────────

  /** Fires when the user closes the panel. */
  @Output() Closed = new EventEmitter<void>();

  /**
   * Cancelable. Fires when {@link Visible} flips to true and the bin is
   * about to query for deleted records. Setting `cancel = true` aborts
   * the query (and the panel will show the empty state).
   */
  @Output() BeforeRecycleBinOpen = new EventEmitter<BeforeRecycleBinOpenEventArgs>();

  /** Fires after the deleted-record query completes. */
  @Output() AfterRecycleBinOpen = new EventEmitter<AfterRecycleBinOpenEventArgs>();

  /**
   * Cancelable. Fires when the user clicks Restore on a deleted-record
   * card, before the preview panel opens. Setting `cancel = true` skips
   * the preview entirely — useful for consumers that want to take over
   * the restore flow themselves.
   */
  @Output() BeforeRecordRestore = new EventEmitter<BeforeRecordRestoreEventArgs>();

  /**
   * Fires after the user closes the restore preview, with `success`
   * indicating whether the actual insert worked.
   */
  @Output() AfterRecordRestore = new EventEmitter<AfterRecordRestoreEventArgs>();

  /**
   * Cancelable. Fires after the user clicks Restore in the preview but
   * before the entity is inserted. Setting `cancel = true` aborts the
   * insert.
   */
  @Output() BeforeRestoreCommit = new EventEmitter<BeforeRestoreCommitEventArgs>();

  /** Fires after the insert completes (success or failure). */
  @Output() AfterRestoreCommit = new EventEmitter<AfterRestoreCommitEventArgs>();

  // ─── Public template state ──────────────────────────────────────

  public IsLoading = false;
  public LoadError: string | null = null;
  public Entries: RecycleBinEntry[] = [];

  /** The currently selected entry whose preview is open. */
  public SelectedEntry: RecycleBinEntry | null = null;
  public PreviewVisible = false;

  /** Permission flags (computed once when EntityName is set). */
  public CanDelete = false;
  public CanCreate = false;

  private isInitialized = false;
  private resolvedEntityInfo: EntityInfo | null = null;

  constructor(private cdr: ChangeDetectorRef) {
  super();}

  ngOnInit(): void {
    this.isInitialized = true;
    if (this.Visible) this.LoadDeletedRecords();
  }

  // ─── Derived state ──────────────────────────────────────────────

  public get HeaderSubtitle(): string {
    if (!this.EntityName) return '';
    const n = this.Entries.length;
    return `${n} record${n === 1 ? '' : 's'} have been deleted from ${this.EntityName}.`;
  }

  /**
   * The user has Delete permission and may browse the bin. The Restore
   * button on each card additionally requires {@link CanCreate}.
   */
  public get HasAccess(): boolean {
    return this.CanDelete;
  }

  // ─── Public actions ─────────────────────────────────────────────

  /**
   * Manually trigger a re-load — useful for consumers who want to refresh
   * after some external event (e.g., a delete happened and they want the
   * bin to re-populate immediately).
   */
  public async LoadDeletedRecords(): Promise<void> {
    if (!this.EntityName) {
      this.LoadError = 'EntityName is required';
      return;
    }

    // Resolve metadata + permissions
    const md = this.ProviderToUse;
    const entityInfo = md.Entities.find(
      e => e.Name.trim().toLowerCase() === this.EntityName!.trim().toLowerCase(),
    );
    if (!entityInfo) {
      this.LoadError = `Entity '${this.EntityName}' not found`;
      this.cdr.markForCheck();
      return;
    }
    this.resolvedEntityInfo = entityInfo;
    const effectiveUser = this.ContextUser ?? md.CurrentUser;
    if (effectiveUser) {
      const perms = entityInfo.GetUserPermisions(effectiveUser);
      this.CanDelete = perms?.CanDelete ?? false;
      this.CanCreate = perms?.CanCreate ?? false;
    } else {
      this.CanDelete = false;
      this.CanCreate = false;
    }

    if (!this.CanDelete) {
      this.Entries = [];
      this.LoadError = 'You do not have Delete permission for this entity.';
      this.cdr.markForCheck();
      return;
    }

    // Fire BeforeRecycleBinOpen — consumer may cancel
    const beforeArgs: BeforeRecycleBinOpenEventArgs = {
      bin: this,
      timestamp: new Date(),
      entityName: this.EntityName,
      cancel: false,
      _kind: 'beforeRecycleBinOpen',
    };
    this.BeforeRecycleBinOpen.emit(beforeArgs);
    if (beforeArgs.cancel) {
      this.LoadError = beforeArgs.cancelReason ?? 'Cancelled by host';
      this.cdr.markForCheck();
      return;
    }

    this.IsLoading = true;
    this.LoadError = null;
    this.Entries = [];
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Get the most recent Delete change per RecordID. We over-fetch and
      // dedupe in JS — the data is small and SQL grouping with the latest
      // change per ID is awkward across dialects.
      const result = await rv.RunView<MJRecordChangeEntity>(
        {
          EntityName: 'MJ: Record Changes',
          ExtraFilter: `EntityID='${entityInfo.ID}' AND Type='Delete'`,
          OrderBy: 'ChangedAt DESC',
          MaxRows: this.MaxRecords * 2, // dedupe headroom
          ResultType: 'entity_object',
        },
        this.ContextUser ?? undefined,
      );

      if (!result.Success) {
        this.LoadError = result.ErrorMessage || 'Failed to load deleted records';
      } else {
        this.Entries = this.dedupeAndBuildEntries(result.Results, entityInfo);
      }
    } catch (e) {
      this.LoadError = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }

    // Fire AfterRecycleBinOpen
    this.AfterRecycleBinOpen.emit({
      bin: this,
      timestamp: new Date(),
      entityName: this.EntityName,
      deletedRecordCount: this.Entries.length,
      _kind: 'afterRecycleBinOpen',
    });
  }

  /**
   * User clicked Restore on a card — open the preview panel (unless a
   * BeforeRecordRestore handler cancelled).
   */
  public OnRestoreClicked(entry: RecycleBinEntry): void {
    if (!this.CanCreate) return; // gated in template too

    const beforeArgs: BeforeRecordRestoreEventArgs = {
      bin: this,
      timestamp: new Date(),
      entityName: this.EntityName ?? '',
      entry,
      cancel: false,
      _kind: 'beforeRecordRestore',
    };
    this.BeforeRecordRestore.emit(beforeArgs);
    if (beforeArgs.cancel) return;

    this.SelectedEntry = entry;
    this.PreviewVisible = true;
    this.cdr.markForCheck();
  }

  /**
   * Preview panel emitted RestoreConfirmed — perform the insert and emit
   * the matching after* events.
   */
  public async OnPreviewConfirmed(commit: RestoreCommitEvent): Promise<void> {
    if (!this.SelectedEntry || !this.resolvedEntityInfo) return;
    const entry = this.SelectedEntry;

    const beforeArgs: BeforeRestoreCommitEventArgs = {
      bin: this,
      timestamp: new Date(),
      entityName: this.EntityName ?? '',
      entry,
      fieldValues: commit.FieldValues,
      reason: commit.Reason,
      cancel: false,
      _kind: 'beforeRestoreCommit',
    };
    this.BeforeRestoreCommit.emit(beforeArgs);
    if (beforeArgs.cancel) {
      this.PreviewVisible = false;
      this.cdr.markForCheck();
      return;
    }

    let success = false;
    let errorMessage: string | undefined;
    let newRecordID: string | undefined;

    try {
      const md = this.ProviderToUse;
      const entity = await md.GetEntityObject(this.resolvedEntityInfo.Name, this.ContextUser ?? undefined);

      // Apply the snapshot fields, including the original primary key
      // (preserves any FK references that still point at this ID).
      for (const fv of commit.FieldValues) {
        entity.Set(fv.FieldName, fv.Value);
      }
      // Also re-apply the original primary key from the snapshot so dangling
      // FK references continue to work. Set() on a fresh entity treats this
      // as the new record's PK.
      try {
        const snapshotData = JSON.parse(entry.RecordChange.FullRecordJSON || '{}');
        for (const pk of this.resolvedEntityInfo.PrimaryKeys) {
          if (snapshotData[pk.Name] != null) {
            entity.Set(pk.Name, snapshotData[pk.Name]);
          }
        }
      } catch {
        // PK preservation is best-effort
      }

      entity.SetRestoreContext(commit.SourceChangeID, commit.Reason);

      try {
        success = await entity.Save();
        if (success) {
          newRecordID = entity.PrimaryKey.ToString();
        } else {
          errorMessage = entity.LatestResult?.CompleteMessage ?? 'Save returned false';
        }
      } finally {
        entity.ClearRestoreContext();
      }
    } catch (e) {
      success = false;
      errorMessage = e instanceof Error ? e.message : 'Unknown error';
    }

    this.AfterRestoreCommit.emit({
      bin: this,
      timestamp: new Date(),
      entityName: this.EntityName ?? '',
      entry,
      success,
      newRecordID,
      errorMessage,
      _kind: 'afterRestoreCommit',
    });

    this.AfterRecordRestore.emit({
      bin: this,
      timestamp: new Date(),
      entityName: this.EntityName ?? '',
      entry,
      success,
      errorMessage,
      _kind: 'afterRecordRestore',
    });

    if (success) {
      // Remove the restored entry from the list and close preview
      this.Entries = this.Entries.filter(e => e !== entry);
    }
    this.PreviewVisible = false;
    this.SelectedEntry = null;
    this.cdr.markForCheck();
  }

  public OnPreviewCancelled(): void {
    this.PreviewVisible = false;
    this.SelectedEntry = null;
    this.cdr.markForCheck();
  }

  public OnClose(): void {
    this._visible = false;
    this.cdr.markForCheck();
    this.Closed.emit();
  }

  // ─── Internal: build entries from raw RecordChange rows ─────────

  /**
   * Dedupes the raw delete-change rows: keeps only the most recent Delete
   * per RecordID (since a record could in principle have been recreated
   * and re-deleted). Builds the display fields heuristically by reading
   * the snapshot JSON.
   */
  private dedupeAndBuildEntries(
    rows: MJRecordChangeEntity[],
    entityInfo: EntityInfo,
  ): RecycleBinEntry[] {
    const seen = new Set<string>();
    const entries: RecycleBinEntry[] = [];

    for (const row of rows) {
      if (entries.length >= this.MaxRecords) break;
      if (seen.has(row.RecordID)) continue;
      seen.add(row.RecordID);

      const snapshot = this.parseSnapshot(row.FullRecordJSON);
      if (!snapshot) continue;

      const entry: RecycleBinEntry = {
        RecordChange: row,
        RecordID: row.RecordID,
        DisplaySummary: this.buildDisplaySummary(snapshot, entityInfo),
        SupportingFields: this.buildSupportingFields(snapshot, entityInfo),
      };
      entries.push(entry);
    }

    return entries;
  }

  /**
   * Builds the headline of the card. Prefers the entity's name field, then
   * any non-PK string field, then the RecordID itself as a last resort.
   */
  private buildDisplaySummary(snapshot: Record<string, unknown>, entityInfo: EntityInfo): string {
    const nameField = entityInfo.NameField;
    if (nameField && snapshot[nameField.Name] != null && snapshot[nameField.Name] !== '') {
      return String(snapshot[nameField.Name]);
    }
    // Fallback: first non-PK, non-empty string field
    for (const f of entityInfo.Fields) {
      if (f.IsPrimaryKey) continue;
      const v = snapshot[f.Name];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return `Record ${snapshot[entityInfo.PrimaryKeys[0]?.Name] ?? ''}`;
  }

  /**
   * Picks up to 3 "interesting" fields from the snapshot to render as
   * supporting metadata under the headline. Heuristic: prefer fields that
   * are non-empty, non-PK, non-system, and have a display name.
   */
  private buildSupportingFields(
    snapshot: Record<string, unknown>,
    entityInfo: EntityInfo,
  ): Array<{ Name: string; DisplayName: string; Value: string }> {
    const out: Array<{ Name: string; DisplayName: string; Value: string }> = [];
    const nameFieldName = entityInfo.NameField?.Name;

    for (const f of entityInfo.Fields) {
      if (out.length >= 3) break;
      if (f.IsPrimaryKey) continue;
      if (f.Name.startsWith('__mj_')) continue;
      if (f.Name === nameFieldName) continue;

      const v = snapshot[f.Name];
      if (v == null || v === '') continue;

      out.push({
        Name: f.Name,
        DisplayName: f.DisplayNameOrName,
        Value: this.formatFieldValue(v, f),
      });
    }
    return out;
  }

  private formatFieldValue(value: unknown, _field: EntityFieldInfo): string {
    if (value == null) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  private parseSnapshot(json: string | null | undefined): Record<string, unknown> | null {
    if (!json) return null;
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // ─── Display helpers (template) ─────────────────────────────────

  public formatTimestamp(date: Date | string | null): string {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));
  }

  public getUserDisplay(user: string | null): string {
    if (!user) return 'Unknown';
    if (user.includes('@')) return user.split('@')[0];
    return user;
  }
}
