import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  NgZone,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import {
  BaseEntity,
  BaseEntityEvent,
  CompositeKey,
  EntityFieldInfo,
  EntityFieldTSType,
  RunView,
} from '@memberjunction/core';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { MJRecordChangeEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { diffChars, diffWords, Change } from 'diff';
import { RestoreCommitEvent } from './restore-preview-panel/restore-preview-panel.component';

/** Lightweight shape for displaying a version label associated with this record */
interface RecordLabel {
  ID: string;
  Name: string;
  Description: string | null;
  Scope: string;
  Status: string;
  CreatedAt: Date;
  ItemCount: number;
}

/**
 * Event payload emitted when the user confirms a restore.
 *
 * The host component (typically `record-form-container`) is responsible for:
 *   1. Reloading the live record (concurrency safety),
 *   2. Calling `record.SetRestoreContext(SourceChangeID, Reason)`,
 *   3. Calling `record.Set(FieldName, Value)` for each entry in `FieldValues`,
 *   4. Calling `record.Save()`,
 *   5. Calling `record.ClearRestoreContext()` after the save returns.
 *
 * The provider will write a new RecordChange row with `Source='Restore'`,
 * `RestoredFromID = SourceChangeID`, and `RestoreReason = Reason` —
 * producing the auditable lineage chain.
 */
export interface RestoreVersionEvent {
  /** ID of the historical RecordChange row whose state is being restored. */
  SourceChangeID: string;
  /** When the historical change was made. */
  ChangedAt: Date;
  /** Display name / email of who made the historical change. */
  ChangedByUser: string;
  /** Optional user-entered reason for the restore. */
  Reason: string | null;
  /** Selected field values, ready to pass to BaseEntity.Set(). */
  FieldValues: Array<{ FieldName: string; Value: unknown }>;
}

/** A single field change with type-aware rendering info (timeline display only). */
export interface FieldChangeInfo {
  field: string;
  displayName: string;
  oldValue: string;
  newValue: string;
  fieldType: 'boolean' | 'date' | 'number' | 'text';
  diffHtml?: SafeHtml;
}

/** A group of changes that share the same date. */
export interface DateGroup {
  label: string;
  changes: MJRecordChangeEntity[];
}

/** A conditional filter pill (one per type/source actually present in loaded data). */
export interface FilterPill {
  /** Unique key for selection state ('Update', 'Create', 'Delete', 'Snapshot', 'Restore'). */
  Key: string;
  /** User-facing label (pluralized: 'Updates', 'Restored', etc.). */
  Label: string;
  /** Font Awesome icon class. */
  Icon: string;
  /** Number of changes of this kind in the loaded data. */
  Count: number;
  /** Selection style — neutral type pill or violet restore pill. */
  Variant: 'type' | 'restore';
}

/**
 * Slide-out timeline of all changes to a single record. Hosts the reusable
 * {@link RestorePreviewPanelComponent} for the actual restore confirmation
 * flow, and exposes a `RestoreRequested` event the host can act on to
 * persist the restore.
 *
 * @example
 *   <mj-record-changes
 *     [record]="myEntity"
 *     [AllowRestore]="true"
 *     (dialogClosed)="showHistory = false"
 *     (RestoreRequested)="onRestoreRequested($event)">
 *   </mj-record-changes>
 */
@Component({
  standalone: false,
  selector: 'mj-record-changes',
  templateUrl: './ng-record-changes.component.html',
  styleUrls: ['./ng-record-changes.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class RecordChangesComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  public IsLoading = false;
  public IsVisible = false;
  @Output() dialogClosed = new EventEmitter();
  @Input() record!: BaseEntity;

  /** Whether to show a "Restore" button on each historical version row. Default false. */
  @Input() AllowRestore = false;

  /**
   * Emitted when the user confirms a restore in the preview panel.
   * The host is responsible for applying the snapshot to the record and
   * saving with `record.SetRestoreContext()` set first.
   */
  @Output() RestoreRequested = new EventEmitter<RestoreVersionEvent>();

  viewData: MJRecordChangeEntity[] = [];
  filteredData: MJRecordChangeEntity[] = [];

  /**
   * Change lookup keyed by NormalizeUUID(ID), rebuilt whenever {@link viewData}
   * loads. Lets {@link getRestoredFromSourceChange} resolve a restore row's
   * source change in O(1) instead of an O(rows) `UUIDsEqual` scan — which was
   * previously executed twice per restore row per CD cycle (once in the
   * template `@if` and once inside `getChangeSummary`), giving O(rows^2)/CD.
   */
  private viewDataById = new Map<string, MJRecordChangeEntity>();
  dateGroups: DateGroup[] = [];
  expandedItems: Set<string> = new Set();

  /** The change record currently selected for restore preview, or null. */
  RestorePreviewChange: MJRecordChangeEntity | null = null;
  /** Visibility of the embedded restore preview slide-in. */
  RestorePreviewVisible = false;
  /** Whether the restore commit is in progress (between confirmation and host response). */
  IsRestoring = false;

  // Version label state
  RecordLabels: RecordLabel[] = [];
  IsLoadingLabels = false;
  ShowCreateWizard = false;

  // Filter properties
  searchTerm = '';
  /** Single selected type filter (legacy, kept for backwards compat). */
  selectedType = '';
  selectedSource = '';
  /** Map of Key → selected, used by the conditional chip system. */
  ChipSelections: Record<string, boolean> = {};
  /** Whether the overflow popover is open. */
  ShowFilterOverflow = false;
  /** Highlighted change ID for the lineage-jump indicator (transient). */
  HighlightedChangeID: string | null = null;

  /**
   * Conditional filter pills derived from loaded data. Always includes 'All'
   * implicitly. Other pills only render when at least one matching change
   * exists. Overflows into a popover when the count exceeds 2.
   */
  ConditionalPills: FilterPill[] = [];

  /** Threshold above which conditional chips collapse into the overflow popover. */
  private readonly OVERFLOW_THRESHOLD = 2;

  /**
   * Subscription to the record's BaseEntity event stream. We listen for
   * 'save' events and auto-refresh the timeline so the user immediately
   * sees the new RecordChange row produced by either a normal save or a
   * restore. Cleaned up in ngOnDestroy.
   */
  private _entitySaveSub: Subscription | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private mjNotificationService: MJNotificationService,
    private sanitizer: DomSanitizer,
  ) { super(); }

  ngOnInit(): void {
    if (this.record) {
      this.IsLoading = true;
      this.IsVisible = true;
      this.cdr.markForCheck();
      this.LoadRecordChanges(this.record.PrimaryKey, '', this.record.EntityInfo.Name);
      this.LoadRecordLabels();
      this.subscribeToRecordSaves();
    }
  }

  ngOnDestroy(): void {
    this._entitySaveSub?.unsubscribe();
    this._entitySaveSub = null;
  }

  /**
   * Wires up an event handler on the live record so the timeline auto-
   * refreshes immediately after any save lands — including the one
   * produced by the restore flow. Without this the user sees their record
   * update in the form but the panel above still shows the pre-restore
   * change list, which is confusing.
   */
  private subscribeToRecordSaves(): void {
    if (!this.record) return;
    this._entitySaveSub?.unsubscribe();
    this._entitySaveSub = this.record.RegisterEventHandler((event: BaseEntityEvent) => {
      if (event?.type === 'save') {
        this.ngZone.run(() => this.Refresh());
      }
    });
  }

  /**
   * Reloads the record changes list from the database.
   * Called by the parent container after a save completes while the drawer is open.
   */
  public Refresh(): void {
    if (this.record) {
      this.IsLoading = true;
      this.cdr.markForCheck();
      this.LoadRecordChanges(this.record.PrimaryKey, '', this.record.EntityInfo.Name);
    }
  }

  public OnClose(): void {
    this.IsVisible = false;
    this.cdr.markForCheck();
    // Allow the slide-out animation to complete before emitting
    setTimeout(() => this.dialogClosed.emit(), 300);
  }

  public async LoadRecordChanges(pkey: CompositeKey, appName: string, entityName: string): Promise<void> {
    if (pkey && entityName) {
      const md = this.ProviderToUse;
      const entityInfo = md.EntityByName(entityName);
      let changes: MJRecordChangeEntity[] = [];
      if (entityInfo?.TrackRecordChanges) {
        const rvResult = await RunView.FromMetadataProvider(md).RunView<MJRecordChangeEntity>({
          EntityName: 'MJ: Record Changes',
          ExtraFilter: `Entity='${entityName}' AND RecordID='${pkey.ToConcatenatedString()}'`,
          OrderBy: 'ChangedAt DESC',
          ResultType: 'entity_object',
        });
        if (rvResult.Success) changes = rvResult.Results;
      }
      this.ngZone.run(() => {
        if (changes) {
          this.viewData = changes.sort(
            (a: MJRecordChangeEntity, b: MJRecordChangeEntity) => new Date(b.ChangedAt).getTime() - new Date(a.ChangedAt).getTime(),
          );
          this.rebuildViewDataIndex();
          this.rebuildConditionalPills();
          this.applyFilters();
          this.IsLoading = false;
        } else {
          this.mjNotificationService.CreateSimpleNotification(
            `Error loading record changes for ${entityName} with primary key ${pkey.ToString()}.`,
            'error',
          );
          this.IsLoading = false;
        }
        this.cdr.markForCheck();
      });
    }
  }

  // ─── Filter & Search ────────────────────────────────────────────

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  /**
   * Toggles the "All" pill — clears every conditional selection.
   */
  public SelectAllPill(): void {
    for (const k of Object.keys(this.ChipSelections)) this.ChipSelections[k] = false;
    this.applyFilters();
  }

  /**
   * Toggles a conditional pill on/off.
   */
  public TogglePill(key: string): void {
    this.ChipSelections[key] = !this.ChipSelections[key];
    this.applyFilters();
  }

  /**
   * Returns true when no conditional pills are selected (i.e. "All" mode).
   */
  public get IsAllSelected(): boolean {
    return !Object.values(this.ChipSelections).some(v => v);
  }

  /**
   * Whether any conditional pills are actually visible at all.
   */
  public get HasConditionalPills(): boolean {
    return this.ConditionalPills.length > 0;
  }

  /**
   * True when the conditional chips should collapse into an overflow popover
   * because there are more than the threshold.
   */
  public get UseOverflowPopover(): boolean {
    return this.ConditionalPills.length > this.OVERFLOW_THRESHOLD;
  }

  /** Number of currently selected conditional pills (for the popover trigger label). */
  public get SelectedConditionalCount(): number {
    return Object.values(this.ChipSelections).filter(v => v).length;
  }

  public ToggleFilterOverflow(): void {
    this.ShowFilterOverflow = !this.ShowFilterOverflow;
    this.cdr.markForCheck();
  }

  public CloseFilterOverflow(): void {
    this.ShowFilterOverflow = false;
    this.cdr.markForCheck();
  }

  public ClearFilters(): void {
    this.searchTerm = '';
    for (const k of Object.keys(this.ChipSelections)) this.ChipSelections[k] = false;
    this.applyFilters();
  }

  /**
   * Builds the list of conditional pills from currently loaded data —
   * a pill only appears for change types/sources that actually exist.
   */
  private rebuildConditionalPills(): void {
    const counts: Record<string, number> = {};
    let restoreCount = 0;

    for (const c of this.viewData) {
      const type = c.Type ?? 'Update';
      counts[type] = (counts[type] ?? 0) + 1;
      if (this.isRestoreChange(c)) restoreCount++;
    }

    const pills: FilterPill[] = [];
    if ((counts['Update'] ?? 0) > 0) {
      pills.push({ Key: 'Update', Label: 'Updates', Icon: 'fa-pen', Count: counts['Update'], Variant: 'type' });
    }
    if ((counts['Create'] ?? 0) > 0) {
      pills.push({ Key: 'Create', Label: 'Creates', Icon: 'fa-plus', Count: counts['Create'], Variant: 'type' });
    }
    if ((counts['Delete'] ?? 0) > 0) {
      pills.push({ Key: 'Delete', Label: 'Deletes', Icon: 'fa-trash', Count: counts['Delete'], Variant: 'type' });
    }
    if ((counts['Snapshot'] ?? 0) > 0) {
      pills.push({ Key: 'Snapshot', Label: 'Snapshots', Icon: 'fa-camera', Count: counts['Snapshot'], Variant: 'type' });
    }
    if (restoreCount > 0) {
      pills.push({ Key: 'Restore', Label: 'Restored', Icon: 'fa-clock-rotate-left', Count: restoreCount, Variant: 'restore' });
    }

    // Initialize/prune selection state
    const validKeys = new Set(pills.map(p => p.Key));
    for (const k of Object.keys(this.ChipSelections)) {
      if (!validKeys.has(k)) delete this.ChipSelections[k];
    }
    for (const p of pills) {
      if (this.ChipSelections[p.Key] === undefined) this.ChipSelections[p.Key] = false;
    }

    this.ConditionalPills = pills;
  }

  private isRestoreChange(c: MJRecordChangeEntity): boolean {
    return c.Source === 'Restore' || (c as any).RestoredFromID != null;
  }

  private applyFilters(): void {
    let filtered = [...this.viewData];

    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        change =>
          change.ChangesDescription?.toLowerCase().includes(search) ||
          change.User?.toLowerCase().includes(search) ||
          change.Comments?.toLowerCase().includes(search),
      );
    }

    // Apply conditional pill filters — if any are selected, only show changes matching ANY of them (OR semantics).
    const selectedKeys = Object.keys(this.ChipSelections).filter(k => this.ChipSelections[k]);
    if (selectedKeys.length > 0) {
      filtered = filtered.filter(change => {
        for (const key of selectedKeys) {
          if (key === 'Restore') {
            if (this.isRestoreChange(change)) return true;
          } else {
            if (change.Type === key) return true;
          }
        }
        return false;
      });
    }

    this.filteredData = filtered;
    this.dateGroups = this.buildDateGroups(this.filteredData);
    this.cdr.markForCheck();
  }

  // ─── Version Labels ─────────────────────────────────────────────

  public async LoadRecordLabels(): Promise<void> {
    if (!this.record) return;

    this.IsLoadingLabels = true;
    this.cdr.markForCheck();

    try {
      const entityId = this.record.EntityInfo.ID;
      const recordId = this.record.PrimaryKey.ToConcatenatedString();

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const itemsResult = await rv.RunView<{ VersionLabelID: string }>({
        EntityName: 'MJ: Version Label Items',
        Fields: ['VersionLabelID'],
        ExtraFilter: `EntityID='${entityId}' AND RecordID='${recordId}'`,
        ResultType: 'simple',
      });

      if (!itemsResult.Success || itemsResult.Results.length === 0) {
        this.ngZone.run(() => {
          this.RecordLabels = [];
          this.IsLoadingLabels = false;
          this.cdr.markForCheck();
        });
        return;
      }

      const labelIds = [...new Set(itemsResult.Results.map(i => i.VersionLabelID))];
      const labelIdFilter = labelIds.map(id => `'${id}'`).join(',');

      const labelsResult = await rv.RunView<{
        ID: string;
        Name: string;
        Description: string | null;
        Scope: string;
        Status: string;
        ItemCount: number;
        __mj_CreatedAt: Date;
      }>({
        EntityName: 'MJ: Version Labels',
        Fields: ['ID', 'Name', 'Description', 'Scope', 'Status', 'ItemCount', '__mj_CreatedAt'],
        ExtraFilter: `ID IN (${labelIdFilter})`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple',
      });

      if (labelsResult.Success) {
        this.RecordLabels = labelsResult.Results.map(l => ({
          ID: l.ID,
          Name: l.Name,
          Description: l.Description,
          Scope: l.Scope,
          Status: l.Status,
          CreatedAt: l.__mj_CreatedAt,
          ItemCount: l.ItemCount,
        }));
      }
    } catch (error) {
      console.error('Error loading version labels for record:', error);
      this.RecordLabels = [];
    } finally {
      this.ngZone.run(() => {
        this.IsLoadingLabels = false;
        this.cdr.markForCheck();
      });
    }
  }

  public OpenCreateWizard(): void {
    this.ShowCreateWizard = true;
    this.cdr.markForCheck();
  }

  public OnLabelCreated(event: { LabelCount: number; ItemCount: number }): void {
    this.ShowCreateWizard = false;
    this.cdr.markForCheck();
    this.LoadRecordLabels();
    this.mjNotificationService.CreateSimpleNotification(
      `Version label created with ${event.ItemCount} snapshot${event.ItemCount !== 1 ? 's' : ''}`,
      'info',
      2000,
    );
  }

  public OnLabelCreateCancelled(): void {
    this.ShowCreateWizard = false;
    this.cdr.markForCheck();
  }

  public getLabelStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'label-status-active';
      case 'Archived': return 'label-status-archived';
      case 'Restored': return 'label-status-restored';
      default: return '';
    }
  }

  // ─── Timeline Interaction ───────────────────────────────────────

  toggleExpansion(changeId: string): void {
    if (this.expandedItems.has(changeId)) {
      this.expandedItems.delete(changeId);
    } else {
      this.expandedItems.add(changeId);
    }
    this.cdr.markForCheck();
  }

  onTimelineItemKeydown(event: KeyboardEvent, changeId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleExpansion(changeId);
    }
  }

  /**
   * Opens the embedded restore preview panel for a given change record.
   * The panel computes a full-record diff (current vs the change's
   * FullRecordJSON snapshot) — this is the semantic-correctness fix:
   * we restore TO the state at that point in time, not just undo the
   * one delta the user clicked.
   */
  OnRestoreVersion(change: MJRecordChangeEntity, event: MouseEvent): void {
    event.stopPropagation();
    this.RestorePreviewChange = change;
    this.RestorePreviewVisible = true;
    this.cdr.markForCheck();
  }

  /**
   * Called when the user confirms the restore in the embedded panel.
   * Translates the panel's RestoreCommitEvent into the broader-shape
   * RestoreVersionEvent the host is wired to handle.
   */
  OnRestorePanelConfirmed(commit: RestoreCommitEvent): void {
    if (!this.RestorePreviewChange) return;

    const change = this.RestorePreviewChange;
    this.IsRestoring = true;
    this.cdr.markForCheck();

    this.RestoreRequested.emit({
      SourceChangeID: commit.SourceChangeID,
      ChangedAt: change.ChangedAt,
      ChangedByUser: change.User || '',
      Reason: commit.Reason,
      FieldValues: commit.FieldValues,
    });

    // Close the panel after a brief delay so the host has a moment to react.
    setTimeout(() => {
      this.RestorePreviewVisible = false;
      this.RestorePreviewChange = null;
      this.IsRestoring = false;
      this.cdr.markForCheck();
    }, 500);
  }

  /**
   * Called when the user dismisses the restore preview without confirming.
   */
  OnRestorePanelCancelled(): void {
    this.RestorePreviewVisible = false;
    this.RestorePreviewChange = null;
    this.cdr.markForCheck();
  }

  // ─── Lineage chip ───────────────────────────────────────────────

  /**
   * Returns the source change for a given restored row, if found in the
   * currently loaded changes. Returns null when the source isn't loaded
   * (e.g., it's been pruned from history) or when this row isn't a restore.
   */
  public getRestoredFromSourceChange(change: MJRecordChangeEntity): MJRecordChangeEntity | null {
    const sourceId = (change as any).RestoredFromID;
    if (!sourceId) return null;
    return this.viewDataById.get(NormalizeUUID(sourceId)) ?? null;
  }

  /**
   * Rebuilds {@link viewDataById} from the current {@link viewData}. Called once
   * per data load so source-change resolution is an O(1) Map read.
   */
  private rebuildViewDataIndex(): void {
    this.viewDataById.clear();
    for (const c of this.viewData) {
      this.viewDataById.set(NormalizeUUID(c.ID), c);
    }
  }

  /**
   * True when the row was produced by a restore operation (either the
   * `Source` is `'Restore'` OR `RestoredFromID` is populated).
   */
  public isRestoreRow(change: MJRecordChangeEntity): boolean {
    return this.isRestoreChange(change);
  }

  /**
   * True when this change is the most recent in the loaded history.
   * `viewData` is sorted DESC by `ChangedAt`, so the most recent is index 0.
   * Restoring to the most recent version is a no-op, so the timeline hides
   * the Restore button on this row.
   */
  public isMostRecentChange(change: MJRecordChangeEntity): boolean {
    return this.viewData.length > 0 && this.viewData[0] === change;
  }

  /**
   * Click handler for the lineage chip — scrolls/highlights the source
   * change row in the timeline. Auto-clears after a few seconds.
   */
  public JumpToSourceChange(sourceChange: MJRecordChangeEntity, event: MouseEvent): void {
    event.stopPropagation();
    this.HighlightedChangeID = sourceChange.ID;
    this.expandedItems.add(sourceChange.ID);
    this.cdr.markForCheck();

    // Auto-clear the highlight after 3s
    setTimeout(() => {
      if (this.HighlightedChangeID && UUIDsEqual(this.HighlightedChangeID, sourceChange.ID)) {
        this.HighlightedChangeID = null;
        this.cdr.markForCheck();
      }
    }, 3000);

    // Scroll into view
    setTimeout(() => {
      const el = document.querySelector(`[data-change-id="${sourceChange.ID}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  // ─── Date Grouping ─────────────────────────────────────────────

  private buildDateGroups(changes: MJRecordChangeEntity[]): DateGroup[] {
    const groups = new Map<string, MJRecordChangeEntity[]>();

    for (const change of changes) {
      const label = this.formatDateGroupLabel(new Date(change.ChangedAt));
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push(change);
    }

    return Array.from(groups.entries()).map(([label, items]) => ({ label, changes: items }));
  }

  private formatDateGroupLabel(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

    const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);

    if (diffDays === 0) return `Today \u2014 ${formatted}`;
    if (diffDays === 1) return `Yesterday \u2014 ${formatted}`;
    return formatted;
  }

  // ─── Display Helpers ────────────────────────────────────────────

  getChangeTypeCardClass(type: string): string {
    switch (type) {
      case 'Create': return 'type-create';
      case 'Update': return 'type-update';
      case 'Delete': return 'type-delete';
      case 'Snapshot': return 'type-snapshot';
      default: return 'type-update';
    }
  }

  getChangeTypeBadgeText(type: string): string {
    switch (type) {
      case 'Create': return 'Created';
      case 'Delete': return 'Deleted';
      case 'Snapshot': return 'Snapshot';
      default: return type;
    }
  }

  /**
   * Badge text for the row's primary type tag. For restore rows we override
   * the underlying `Type='Update'` and show "Restore" instead — matches the
   * mockup's intent of treating restore as a first-class operation in the
   * timeline rather than a flavor of update.
   */
  getEffectiveBadgeText(change: MJRecordChangeEntity): string {
    if (this.isRestoreRow(change)) return 'Restore';
    return this.getChangeTypeBadgeText(change.Type);
  }

  /**
   * Optional restore reason — pulled from the dynamic `RestoreReason`
   * column added by the lineage migration. Returns null when not present
   * or not a restore row.
   */
  getRestoreReason(change: MJRecordChangeEntity): string | null {
    if (!this.isRestoreRow(change)) return null;
    const reason = (change as unknown as { RestoreReason?: string | null }).RestoreReason;
    return reason && reason.trim().length > 0 ? reason : null;
  }

  getSourceClass(source: string): string {
    if (source === 'Restore') return 'source-restore';
    if (source === 'Internal') return 'source-internal';
    return 'source-external';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Complete': return 'status-complete';
      case 'Pending': return 'status-pending';
      case 'Error': return 'status-error';
      default: return 'status-unknown';
    }
  }

  getTimelineItemLabel(change: MJRecordChangeEntity): string {
    return `${change.Type} by ${change.User || 'Unknown User'} on ${this.formatFullDateTime(change.ChangedAt)}`;
  }

  getUserInitials(user: string | null): string {
    if (!user) return '?';
    if (user.includes('@')) {
      const local = user.split('@')[0];
      return local.substring(0, 2).toUpperCase();
    }
    const parts = user.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.substring(0, 2).toUpperCase();
  }

  getUserDisplayName(user: string | null): string {
    if (!user) return 'Unknown';
    if (user.includes('@')) return user.split('@')[0];
    return user;
  }

  getUniqueContributorCount(): number {
    const users = new Set(this.viewData.map(c => c.User).filter(Boolean));
    return users.size;
  }

  formatTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));
  }

  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: diffDays > 365 ? 'numeric' : undefined,
    }).format(new Date(date));
  }

  formatFullDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      timeZoneName: 'short',
    }).format(new Date(date));
  }

  // ─── Change Summary ─────────────────────────────────────────────

  getChangeSummary(change: MJRecordChangeEntity): string {
    // Restore rows get a distinctive summary so the timeline reads like a
    // sentence — "Restored to 5:56 PM version" rather than yet another
    // "Name and Description changed". The lineage chip carries the full
    // source-version detail.
    if (this.isRestoreRow(change)) {
      const src = this.getRestoredFromSourceChange(change);
      if (src) return `Restored to ${this.formatTime(src.ChangedAt)} version`;
      return 'Restored from earlier version';
    }
    if (change.Type === 'Create') return 'Record created';
    if (change.Type === 'Delete') return 'Record deleted';
    if (change.Type === 'Snapshot') return change.ChangesDescription || 'Snapshot captured';

    try {
      const changesJson = JSON.parse(change.ChangesJSON || '{}');
      const fieldNames = this.extractFieldDisplayNames(changesJson);
      if (fieldNames.length === 0) return 'No field changes detected';

      return this.buildFieldListSummary(fieldNames);
    } catch {
      return change.ChangesDescription || 'Changes made';
    }
  }

  getCreatedFieldCount(change: MJRecordChangeEntity): number {
    try {
      if (!change.FullRecordJSON) return 0;
      const record = JSON.parse(change.FullRecordJSON);
      return this.record.EntityInfo.Fields.filter(
        (f: EntityFieldInfo) => record[f.Name] != null && record[f.Name] !== '',
      ).length;
    } catch {
      return 0;
    }
  }

  private extractFieldDisplayNames(changesJson: Record<string, { field?: string }>): string[] {
    return Object.keys(changesJson).map(fieldKey => {
      const changeInfo = changesJson[fieldKey];
      const field = this.record.EntityInfo.Fields.find(
        (f: EntityFieldInfo) => f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase(),
      );
      return field?.DisplayNameOrName || changeInfo.field || fieldKey;
    });
  }

  private buildFieldListSummary(fieldNames: string[]): string {
    if (fieldNames.length === 1) return `${fieldNames[0]} changed`;
    if (fieldNames.length === 2) return `${fieldNames[0]} and ${fieldNames[1]} changed`;
    if (fieldNames.length <= 4) {
      const last = fieldNames[fieldNames.length - 1];
      return `${fieldNames.slice(0, -1).join(', ')}, and ${last} changed`;
    }
    const remaining = fieldNames.length - 3;
    return `${fieldNames.slice(0, 3).join(', ')}, and ${remaining} other field${remaining > 1 ? 's' : ''} changed`;
  }

  // ─── Field Changes (type-aware) ────────────────────────────────

  getFieldChanges(change: MJRecordChangeEntity): FieldChangeInfo[] {
    try {
      const changesJson = JSON.parse(change.ChangesJSON || '{}');
      return Object.keys(changesJson).map(fieldKey => this.buildFieldChangeInfo(changesJson[fieldKey]));
    } catch {
      return [];
    }
  }

  private buildFieldChangeInfo(changeInfo: { field?: string; oldValue?: unknown; newValue?: unknown }): FieldChangeInfo {
    const field = this.record.EntityInfo.Fields.find(
      (f: EntityFieldInfo) => f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase(),
    );

    const fieldType = this.classifyFieldType(field);
    const isDateField = fieldType === 'date';
    const formattedOld = this.formatChangeValue(changeInfo.oldValue, isDateField);
    const formattedNew = this.formatChangeValue(changeInfo.newValue, isDateField);

    let diffHtml: SafeHtml | undefined;
    if (fieldType === 'text' && formattedOld !== formattedNew) {
      diffHtml = this.generateDiffHtml(formattedOld, formattedNew);
    }

    return {
      field: changeInfo.field || '',
      displayName: field?.DisplayNameOrName || changeInfo.field || '',
      oldValue: formattedOld,
      newValue: formattedNew,
      fieldType,
      diffHtml,
    };
  }

  private classifyFieldType(field: EntityFieldInfo | undefined): 'boolean' | 'date' | 'number' | 'text' {
    if (!field) return 'text';
    if (field.TSType === EntityFieldTSType.Boolean) return 'boolean';
    if (field.TSType === EntityFieldTSType.Date) return 'date';
    if (field.TSType === EntityFieldTSType.Number) return 'number';
    return 'text';
  }

  getCreatedFields(change: MJRecordChangeEntity): Array<{ name: string; displayName: string; value: string }> {
    try {
      if (!change.FullRecordJSON) return [];

      const record = JSON.parse(change.FullRecordJSON);
      const fields = this.record.EntityInfo.Fields;

      return fields
        .filter((field: EntityFieldInfo) => record[field.Name] != null && record[field.Name] !== '')
        .map((field: EntityFieldInfo) => ({
          name: field.Name,
          displayName: field.DisplayNameOrName,
          value: this.formatChangeValue(record[field.Name], field.TSType === EntityFieldTSType.Date),
        }));
    } catch {
      return [];
    }
  }

  // ─── Value Formatting ───────────────────────────────────────────

  private formatChangeValue(value: unknown, isDateField: boolean): string {
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

  // ─── Diff Generation (text fields only) ─────────────────────────

  private generateDiffHtml(oldValue: string, newValue: string): SafeHtml {
    if (!oldValue && !newValue) {
      return this.sanitizer.bypassSecurityTrustHtml('<span class="rc-diff-unchanged">(no change)</span>');
    }

    if (!oldValue) {
      return this.sanitizer.bypassSecurityTrustHtml(`<span class="rc-diff-added">${this.escapeHtml(newValue)}</span>`);
    }

    if (!newValue) {
      return this.sanitizer.bypassSecurityTrustHtml(`<span class="rc-diff-removed">${this.escapeHtml(oldValue)}</span>`);
    }

    const useWordDiff = this.shouldUseWordDiff(oldValue, newValue);
    const diffs = useWordDiff ? diffWords(oldValue, newValue) : diffChars(oldValue, newValue);

    const html = diffs
      .map((part: Change) => {
        const escaped = this.escapeHtml(part.value);
        if (part.added) return `<span class="rc-diff-added">${escaped}</span>`;
        if (part.removed) return `<span class="rc-diff-removed">${escaped}</span>`;
        return `<span class="rc-diff-unchanged">${escaped}</span>`;
      })
      .join('');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private shouldUseWordDiff(oldValue: string, newValue: string): boolean {
    const hasMultipleWords = (text: string) => text.includes(' ') && text.split(' ').length > 3;
    const isLongText = (text: string) => text.length > 50;

    return (hasMultipleWords(oldValue) || hasMultipleWords(newValue)) && (isLongText(oldValue) || isLongText(newValue));
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
