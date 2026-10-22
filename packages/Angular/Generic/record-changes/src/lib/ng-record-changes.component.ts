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
import { FormatChangeValue } from './format-change-value';
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

/** Individual change pip rendered inside a burst cluster card. */
export interface ActivityBurstPip {
  /** Normalized RecordChange ID. */
  ID: string;
  /** Visual category of the change ('create' | 'update' | 'restore'). */
  Type: 'create' | 'update' | 'restore';
  /** Hover tooltip for this specific change pip. */
  Tooltip: string;
}

/** A single active editing session / burst cluster in the Burst-Aware Cluster Strip (Option A). */
export interface ActivityChartBucket {
  /** Stable bucket key for selection and track-by. */
  Key: string;
  /** Short session date label (e.g. 'Today', 'Oct 15', 'Apr 12 \'24'). */
  Label: string;
  /** Concise session summary subtitle (e.g. 'Initial creation', '4 edits', '1 restore, 2 edits'). */
  Subtitle: string;
  /** Non-linear quiet time gap label between this burst and the next burst (e.g. '11 mos quiet', '8d quiet'), or null on the final burst. */
  GapAfterLabel: string | null;
  /** Up to 12 individual change pips in chronological order within this burst. */
  Pips: ActivityBurstPip[];
  /** Number of additional changes in this burst beyond the 12 rendered pips. */
  OverflowPipCount: number;
  /** Detailed tooltip text describing the burst range and breakdown. */
  Tooltip: string;
  /** Inclusive burst start timestamp (ms). */
  StartTime: number;
  /** Inclusive burst end timestamp (ms). */
  EndTime: number;
  /** Total changes in this burst. */
  TotalCount: number;
  /** Count of standard updates in this burst. */
  UpdateCount: number;
  /** Count of create events in this burst. */
  CreateCount: number;
  /** Count of restore events in this burst. */
  RestoreCount: number;
  /** Count of delete/other events in this burst. */
  OtherCount: number;
  /** Normalized bar height percentage (22..100). */
  HeightPercent: number;
  /** Proportion of changes for Updates (0..100). */
  UpdateSharePercent: number;
  /** Proportion of changes for Creates (0..100). */
  CreateSharePercent: number;
  /** Proportion of changes for Restores (0..100). */
  RestoreSharePercent: number;
  /** Set of normalized RecordChange IDs falling into this burst. */
  ChangeIDs: Set<string>;
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
  @Output() DialogClosed = new EventEmitter();

  /**
   * @deprecated Use {@link DialogClosed}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (dialogClosed) keeps working. Must stay AFTER DialogClosed: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() dialogClosed = this.DialogClosed;
  @Input() record!: BaseEntity;

  /** Whether to show a "Restore" button on each historical version row. Default false. */
  @Input() AllowRestore = false;

  /**
   * Optional ID of the historical change currently being previewed directly
   * inside the host entity form ("Time Travel" mode).
   */
  @Input() PreviewedChangeID: string | null = null;

  /**
   * Emitted when the user toggles "Preview in Form" on a historical change card
   * (or clears the preview). Emits the selected {@link MJRecordChangeEntity} or
   * `null` when exiting preview.
   */
  @Output() PreviewVersionSelected = new EventEmitter<MJRecordChangeEntity | null>();

  /**
   * Emitted when the user confirms a restore in the preview panel.
   * The host is responsible for applying the snapshot to the record and
   * saving with `record.SetRestoreContext()` set first.
   */
  @Output() RestoreRequested = new EventEmitter<RestoreVersionEvent>();

  ViewData: MJRecordChangeEntity[] = [];

  /** @deprecated Use {@link ViewData}. */
  get viewData(): MJRecordChangeEntity[] {
    return this.ViewData;
  }
  /** @deprecated Use {@link ViewData}. */
  set viewData(value: MJRecordChangeEntity[]) {
    this.ViewData = value;
  }
  FilteredData: MJRecordChangeEntity[] = [];

  /** @deprecated Use {@link FilteredData}. */
  get filteredData(): MJRecordChangeEntity[] {
    return this.FilteredData;
  }
  /** @deprecated Use {@link FilteredData}. */
  set filteredData(value: MJRecordChangeEntity[]) {
    this.FilteredData = value;
  }

  /**
   * Change lookup keyed by NormalizeUUID(ID), rebuilt whenever {@link viewData}
   * loads. Lets {@link getRestoredFromSourceChange} resolve a restore row's
   * source change in O(1) instead of an O(rows) `UUIDsEqual` scan — which was
   * previously executed twice per restore row per CD cycle (once in the
   * template `@if` and once inside `getChangeSummary`), giving O(rows^2)/CD.
   */
  private viewDataById = new Map<string, MJRecordChangeEntity>();
  DateGroups: DateGroup[] = [];

  /** @deprecated Use {@link DateGroups}. */
  get dateGroups(): DateGroup[] {
    return this.DateGroups;
  }
  /** @deprecated Use {@link DateGroups}. */
  set dateGroups(value: DateGroup[]) {
    this.DateGroups = value;
  }
  ExpandedItems: Set<string> = new Set();

  /** @deprecated Use {@link ExpandedItems}. */
  get expandedItems(): Set<string> {
    return this.ExpandedItems;
  }
  /** @deprecated Use {@link ExpandedItems}. */
  set expandedItems(value: Set<string>) {
    this.ExpandedItems = value;
  }

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
  /** Controls whether the compact version labels tray is expanded in the header. */
  ShowLabelsTray = false;

  // Activity spark-bar chart state
  ActivityBuckets: ActivityChartBucket[] = [];
  SelectedBucketKey: string | null = null;
  ActivityChartGranularityLabel = '';

  // Cross-version comparison (vA <-> vB) state
  CompareMode = false;
  CompareBaseChangeID: string | null = null;
  CompareTargetChangeID: string | null = null;

  // Filter properties
  SearchTerm = '';

  /** @deprecated Use {@link SearchTerm}. */
  get searchTerm() {
    return this.SearchTerm;
  }
  /** @deprecated Use {@link SearchTerm}. */
  set searchTerm(value) {
    this.SearchTerm = value;
  }
  /** Single selected type filter (legacy, kept for backwards compat). */
  SelectedType = '';

  /** @deprecated Use {@link SelectedType}. */
  get selectedType() {
    return this.SelectedType;
  }
  /** @deprecated Use {@link SelectedType}. */
  set selectedType(value) {
    this.SelectedType = value;
  }
  SelectedSource = '';

  /** @deprecated Use {@link SelectedSource}. */
  get selectedSource() {
    return this.SelectedSource;
  }
  /** @deprecated Use {@link SelectedSource}. */
  set selectedSource(value) {
    this.SelectedSource = value;
  }
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
    setTimeout(() => this.DialogClosed.emit(), 300);
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
          this.ViewData = changes.sort(
            (a: MJRecordChangeEntity, b: MJRecordChangeEntity) => new Date(b.ChangedAt).getTime() - new Date(a.ChangedAt).getTime(),
          );
          this.rebuildViewDataIndex();
          this.rebuildConditionalPills();
          this.rebuildActivityChart();
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

  OnSearchChange(): void {
    this.applyFilters();
  }

  /** @deprecated Use {@link OnSearchChange}. */
  onSearchChange(): void {
    return this.OnSearchChange();
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
    this.SearchTerm = '';
    this.SelectedBucketKey = null;
    for (const k of Object.keys(this.ChipSelections)) this.ChipSelections[k] = false;
    this.applyFilters();
  }

  public ToggleLabelsTray(): void {
    this.ShowLabelsTray = !this.ShowLabelsTray;
    this.cdr.markForCheck();
  }

  public ToggleBucketFilter(bucketKey: string): void {
    const bucket = this.ActivityBuckets.find(b => b.Key === bucketKey);
    if (!bucket || bucket.TotalCount === 0) return;
    this.SelectedBucketKey = this.SelectedBucketKey === bucketKey ? null : bucketKey;
    this.applyFilters();
  }

  public ClearBucketFilter(): void {
    if (!this.SelectedBucketKey) return;
    this.SelectedBucketKey = null;
    this.applyFilters();
  }

  public get SelectedBucketLabel(): string | null {
    if (!this.SelectedBucketKey) return null;
    return this.ActivityBuckets.find(b => b.Key === this.SelectedBucketKey)?.Label ?? null;
  }

  /**
   * Human-friendly display name for the current entity (uses `EntityInfo.DisplayNameOrName`,
   * stripping technical schema prefixes like `MJ_BizApps_Common: ` when falling back to `Name`).
   */
  public get EntityDisplayName(): string {
    const info = this.record?.EntityInfo as (typeof this.record.EntityInfo & { DisplayNameOrName?: string; DisplayName?: string }) | undefined;
    if (!info) return '';
    if (info.DisplayNameOrName && info.DisplayNameOrName.trim().length > 0) {
      return info.DisplayNameOrName.trim();
    }
    if (info.DisplayName && info.DisplayName.trim().length > 0) {
      return info.DisplayName.trim();
    }
    const rawName = info.Name || '';
    const colonIdx = rawName.indexOf(':');
    return colonIdx >= 0 ? rawName.slice(colonIdx + 1).trim() : rawName.trim();
  }

  /**
   * Icon class for the current entity, falling back to `fa-solid fa-layer-group`.
   */
  public get EntityIcon(): string {
    const icon = (this.record?.EntityInfo as { Icon?: string } | undefined)?.Icon;
    return icon && icon.trim().length > 0 ? icon.trim() : 'fa-solid fa-layer-group';
  }

  /**
   * Display name of the current record (e.g. 'Henry Grantham'), or null if unavailable.
   */
  public get RecordDisplayName(): string | null {
    const rec = this.record as (BaseEntity & {
      NameFieldValue?: unknown;
      Fields?: Array<{ Name: string; Value: unknown }>;
    }) | undefined;
    if (!rec) return null;
    const entityInfo = rec.EntityInfo as { NameField?: { Name?: string } } | undefined;
    const nameFieldName = entityInfo?.NameField?.Name;
    if (nameFieldName && Array.isArray(rec.Fields)) {
      const f = rec.Fields.find(item => item.Name === nameFieldName);
      if (f?.Value != null && String(f.Value).trim().length > 0) {
        return String(f.Value).trim();
      }
    }
    if (Array.isArray(rec.Fields)) {
      for (const candidate of ['DisplayName', 'Name', 'Title', 'FullName']) {
        const f = rec.Fields.find(item => item.Name.toLowerCase() === candidate.toLowerCase());
        if (f?.Value != null && String(f.Value).trim().length > 0) {
          return String(f.Value).trim();
        }
      }
    }
    return null;
  }

  /**
   * Up to 4 unique contributors for the compact avatar stack in the header.
   */
  public get TopContributors(): Array<{ Name: string; Initials: string }> {
    const seen = new Set<string>();
    const out: Array<{ Name: string; Initials: string }> = [];
    for (const c of this.ViewData) {
      const rawUser = (c.User || '').trim();
      if (!rawUser) continue;
      const key = rawUser.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        Name: this.GetUserDisplayName(rawUser),
        Initials: this.GetUserInitials(rawUser),
      });
      if (out.length >= 4) break;
    }
    return out;
  }

  /**
   * Builds the list of conditional pills from currently loaded data —
   * a pill only appears for change types/sources that actually exist.
   */
  private rebuildConditionalPills(): void {
    const counts: Record<string, number> = {};
    let restoreCount = 0;

    for (const c of this.ViewData) {
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
    const withLineage = c as MJRecordChangeEntity & { RestoredFromID?: string | null };
    return c.Source === 'Restore' || withLineage.RestoredFromID != null;
  }

  /**
   * Builds the Burst-Aware Cluster Strip (Option A) with non-linear time-gap compression.
   * Instead of dividing wall-clock time into 12 fixed equal buckets (which leaves mostly empty
   * columns when a record has irregular bursts separated by weeks or months), changes are grouped
   * into active editing sessions separated by compact quiet-gap connectors (`⋯ 11 mos quiet ⋯`).
   */
  private rebuildActivityChart(): void {
    if (!this.ViewData || this.ViewData.length === 0) {
      this.ActivityBuckets = [];
      this.ActivityChartGranularityLabel = '';
      this.SelectedBucketKey = null;
      return;
    }

    const datedChanges = this.ViewData
      .map(c => ({ change: c, time: new Date(c.ChangedAt).getTime() }))
      .filter(item => Number.isFinite(item.time))
      .sort((a, b) => a.time - b.time);

    if (datedChanges.length === 0) {
      this.ActivityBuckets = [];
      this.ActivityChartGranularityLabel = '';
      return;
    }

    const hourMs = 3600 * 1000;
    const sessionGapThresholdMs = 6 * hourMs;
    const maxClusters = 5;

    interface RawCluster {
      items: Array<{ change: MJRecordChangeEntity; time: number }>;
      startTime: number;
      endTime: number;
    }

    // 1. Group chronologically adjacent changes into initial session clusters (same calendar day or <= 6h apart)
    const clusters: RawCluster[] = [];
    for (const entry of datedChanges) {
      const prev = clusters[clusters.length - 1];
      if (!prev) {
        clusters.push({ items: [entry], startTime: entry.time, endTime: entry.time });
        continue;
      }
      const prevDate = new Date(prev.endTime);
      const currDate = new Date(entry.time);
      const sameDay =
        prevDate.getUTCFullYear() === currDate.getUTCFullYear() &&
        prevDate.getUTCMonth() === currDate.getUTCMonth() &&
        prevDate.getUTCDate() === currDate.getUTCDate();
      const withinSessionGap = (entry.time - prev.endTime) <= sessionGapThresholdMs;

      if (sameDay || withinSessionGap) {
        prev.items.push(entry);
        prev.endTime = entry.time;
      } else {
        clusters.push({ items: [entry], startTime: entry.time, endTime: entry.time });
      }
    }

    // 2. If more than maxClusters exist, iteratively merge the closest adjacent pair so the strip stays compact
    while (clusters.length > maxClusters) {
      let minGap = Infinity;
      let mergeIdx = 0;
      for (let i = 0; i < clusters.length - 1; i++) {
        const gap = clusters[i + 1].startTime - clusters[i].endTime;
        if (gap < minGap) {
          minGap = gap;
          mergeIdx = i;
        }
      }
      const left = clusters[mergeIdx];
      const right = clusters[mergeIdx + 1];
      clusters.splice(mergeIdx, 2, {
        items: [...left.items, ...right.items],
        startTime: left.startTime,
        endTime: right.endTime,
      });
    }

    const minTime = datedChanges[0].time;
    const maxTime = datedChanges[datedChanges.length - 1].time;
    const totalSpanMs = Math.max(0, maxTime - minTime);
    const maxCount = Math.max(1, ...clusters.map(c => c.items.length));

    const buckets: ActivityChartBucket[] = clusters.map((cluster, idx) => {
      let updateCount = 0;
      let createCount = 0;
      let restoreCount = 0;
      let otherCount = 0;
      const changeIds = new Set<string>();
      const pips: ActivityBurstPip[] = [];

      for (const { change, time } of cluster.items) {
        const normId = NormalizeUUID(change.ID);
        changeIds.add(normId);
        let pipType: 'create' | 'update' | 'restore' = 'update';
        if (this.isRestoreChange(change)) {
          restoreCount++;
          pipType = 'restore';
        } else if (change.Type === 'Create') {
          createCount++;
          pipType = 'create';
        } else if (change.Type === 'Update' || !change.Type) {
          updateCount++;
          pipType = 'update';
        } else {
          otherCount++;
          pipType = 'update';
        }

        if (pips.length < 12) {
          const userLabel = this.getUserDisplayName(change.User);
          const dateLabel = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(time));
          pips.push({
            ID: normId,
            Type: pipType,
            Tooltip: `${pipType === 'create' ? 'Created' : pipType === 'restore' ? 'Restored' : 'Updated'} by ${userLabel} · ${dateLabel}`,
          });
        }
      }

      const totalCount = cluster.items.length;
      const label = this.formatBurstClusterLabel(cluster.startTime, cluster.endTime, maxTime, totalSpanMs);
      const subtitle = this.formatBurstSubtitle(totalCount, createCount, updateCount + otherCount, restoreCount);
      const nextCluster = idx < clusters.length - 1 ? clusters[idx + 1] : null;
      const gapAfterLabel = nextCluster
        ? this.formatQuietGapLabel(Math.max(0, nextCluster.startTime - cluster.endTime))
        : null;

      const updateShare = Math.round(((updateCount + otherCount) / totalCount) * 100);
      const createShare = Math.round((createCount / totalCount) * 100);
      const restoreShare = Math.max(0, 100 - updateShare - createShare);

      const parts: string[] = [];
      if (updateCount > 0) parts.push(`${updateCount} update${updateCount !== 1 ? 's' : ''}`);
      if (createCount > 0) parts.push(`${createCount} create`);
      if (restoreCount > 0) parts.push(`${restoreCount} restore${restoreCount !== 1 ? 's' : ''}`);
      if (otherCount > 0) parts.push(`${otherCount} other`);

      return {
        Key: `burst-${idx}-${cluster.startTime}`,
        Label: label,
        Subtitle: subtitle,
        GapAfterLabel: gapAfterLabel,
        Pips: pips,
        OverflowPipCount: Math.max(0, totalCount - pips.length),
        Tooltip: `${label} · ${totalCount} change${totalCount !== 1 ? 's' : ''} (${parts.join(', ')})`,
        StartTime: cluster.startTime,
        EndTime: cluster.endTime + 1,
        TotalCount: totalCount,
        UpdateCount: updateCount,
        CreateCount: createCount,
        RestoreCount: restoreCount,
        OtherCount: otherCount,
        HeightPercent: Math.max(22, Math.round((totalCount / maxCount) * 100)),
        UpdateSharePercent: updateShare,
        CreateSharePercent: createShare,
        RestoreSharePercent: restoreShare,
        ChangeIDs: changeIds,
      };
    });

    this.ActivityChartGranularityLabel =
      buckets.length === 1
        ? '1 active editing session'
        : `Editing sessions (${buckets.length} active bursts · quiet gaps compressed)`;
    this.ActivityBuckets = buckets;
    if (this.SelectedBucketKey && !buckets.some(b => b.Key === this.SelectedBucketKey)) {
      this.SelectedBucketKey = null;
    }
  }

  private formatBurstClusterLabel(startMs: number, endMs: number, maxTimeMs: number, totalSpanMs: number): string {
    const start = new Date(startMs);
    const end = new Date(endMs);
    const now = new Date();
    const dayMs = 24 * 3600 * 1000;
    const includeYear = start.getFullYear() !== new Date(maxTimeMs).getFullYear() || totalSpanMs > 240 * dayMs;

    const sameDay =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate();

    if (sameDay) {
      const isToday =
        start.getFullYear() === now.getFullYear() &&
        start.getMonth() === now.getMonth() &&
        start.getDate() === now.getDate();
      if (isToday) {
        return 'Today';
      }
      return new Intl.DateTimeFormat('en-US', includeYear
        ? { month: 'short', day: 'numeric', year: '2-digit' }
        : { month: 'short', day: 'numeric' }
      ).format(start);
    }

    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      const monthStr = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(start);
      const yrSuffix = includeYear ? ` '${String(start.getFullYear()).slice(-2)}` : '';
      return `${monthStr} ${start.getDate()}–${end.getDate()}${yrSuffix}`;
    }

    const fmt = new Intl.DateTimeFormat('en-US', includeYear
      ? { month: 'short', day: 'numeric', year: '2-digit' }
      : { month: 'short', day: 'numeric' }
    );
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  private formatBurstSubtitle(total: number, creates: number, updates: number, restores: number): string {
    if (creates > 0 && total === 1) {
      return 'Initial creation';
    }
    if (restores > 0 && updates > 0) {
      return `${restores} restore${restores !== 1 ? 's' : ''}, ${updates} edit${updates !== 1 ? 's' : ''}`;
    }
    if (restores > 0) {
      return `${restores} restore${restores !== 1 ? 's' : ''}`;
    }
    if (creates > 0 && updates > 0) {
      return `Created + ${updates} edit${updates !== 1 ? 's' : ''}`;
    }
    return `${total} edit${total !== 1 ? 's' : ''}`;
  }

  private formatQuietGapLabel(gapMs: number): string {
    const hourMs = 3600 * 1000;
    const dayMs = 24 * hourMs;
    const gapDays = gapMs / dayMs;
    if (gapDays >= 540) {
      const yrs = (gapDays / 365).toFixed(1).replace(/\.0$/, '');
      return `${yrs} yrs quiet`;
    }
    if (gapDays >= 45) {
      return `${Math.round(gapDays / 30)} mos quiet`;
    }
    if (gapDays >= 1) {
      return `${Math.max(1, Math.round(gapDays))}d quiet`;
    }
    const gapHours = Math.max(1, Math.round(gapMs / hourMs));
    return `${gapHours}h quiet`;
  }

  private applyFilters(): void {
    let filtered = [...this.ViewData];

    if (this.SelectedBucketKey) {
      const activeBucket = this.ActivityBuckets.find(b => b.Key === this.SelectedBucketKey);
      if (activeBucket) {
        filtered = filtered.filter(change => activeBucket.ChangeIDs.has(NormalizeUUID(change.ID)));
      }
    }

    if (this.SearchTerm.trim()) {
      const search = this.SearchTerm.toLowerCase();
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

    this.FilteredData = filtered;
    this.DateGroups = this.buildDateGroups(this.FilteredData);
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

  public GetLabelStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'label-status-active';
      case 'Archived': return 'label-status-archived';
      case 'Restored': return 'label-status-restored';
      default: return '';
    }
  }

  /** @deprecated Use {@link GetLabelStatusClass}. */
  public getLabelStatusClass(status: string): string {
    return this.GetLabelStatusClass(status);
  }

  // ─── Timeline Interaction ───────────────────────────────────────

  ToggleExpansion(changeId: string): void {
    if (this.ExpandedItems.has(changeId)) {
      this.ExpandedItems.delete(changeId);
    } else {
      this.ExpandedItems.add(changeId);
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleExpansion}. */
  toggleExpansion(changeId: string): void {
    return this.ToggleExpansion(changeId);
  }

  OnTimelineItemKeydown(event: KeyboardEvent, changeId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.ToggleExpansion(changeId);
    }
  }

  /** @deprecated Use {@link OnTimelineItemKeydown}. */
  onTimelineItemKeydown(event: KeyboardEvent, changeId: string): void {
    return this.OnTimelineItemKeydown(event, changeId);
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
    this.OpenRestoreForChange(change);
  }

  /**
   * Programmatically opens the restore confirmation panel for a specific
   * historical change (e.g., when triggered from the host form's Time-Travel
   * Preview banner).
   */
  public OpenRestoreForChange(change: MJRecordChangeEntity): void {
    this.RestorePreviewChange = change;
    this.RestorePreviewVisible = true;
    this.cdr.markForCheck();
  }

  /**
   * Returns true when `change` is the historical version currently being
   * previewed in the host form.
   */
  public IsChangePreviewedInForm(change: MJRecordChangeEntity): boolean {
    return this.PreviewedChangeID != null && UUIDsEqual(this.PreviewedChangeID, change.ID);
  }

  /**
   * Toggles in-form Time-Travel preview for the given historical change.
   */
  public OnToggleFormPreview(change: MJRecordChangeEntity, event: MouseEvent): void {
    event.stopPropagation();
    if (this.IsChangePreviewedInForm(change)) {
      this.PreviewedChangeID = null;
      this.PreviewVersionSelected.emit(null);
    } else {
      this.PreviewedChangeID = change.ID;
      this.PreviewVersionSelected.emit(change);
    }
    this.cdr.markForCheck();
  }

  /**
   * Returns all loaded changes that carry a `FullRecordJSON` snapshot and can
   * be previewed in the form, ordered newest-first.
   */
  public GetPreviewableChanges(): MJRecordChangeEntity[] {
    return this.ViewData.filter(c => c.Type !== 'Delete' && !!c.FullRecordJSON);
  }

  /**
   * Toggles Cross-Version Diff Comparison (`vA ↔ vB`) mode.
   * When entering Compare Mode with no versions selected, defaults `vB` to the
   * latest version and `vA` to the immediately preceding snapshot (or live state).
   */
  public ToggleCompareMode(): void {
    this.CompareMode = !this.CompareMode;
    if (this.CompareMode && !this.CompareBaseChangeID && !this.CompareTargetChangeID) {
      const previewable = this.GetPreviewableChanges();
      if (previewable.length >= 2) {
        this.CompareTargetChangeID = previewable[0].ID;
        this.CompareBaseChangeID = previewable[1].ID;
      } else if (previewable.length === 1) {
        this.CompareBaseChangeID = previewable[0].ID;
        this.CompareTargetChangeID = '__CURRENT__';
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Assigns a historical change ID (or `'__CURRENT__'`) to either the `base` (`vA`)
   * or `target` (`vB`) comparison slot.
   */
  public SelectForComparison(slot: 'base' | 'target', changeId: string | null, event?: Event): void {
    event?.stopPropagation();
    if (slot === 'base') {
      this.CompareBaseChangeID = changeId;
    } else {
      this.CompareTargetChangeID = changeId;
    }
    if (!this.CompareMode) {
      this.CompareMode = true;
    }
    this.cdr.markForCheck();
  }

  /**
   * Handles `<select>` change events for the `vA` and `vB` version selectors.
   */
  public OnComparisonSelectChange(slot: 'base' | 'target', event: Event): void {
    const selectEl = event.target as HTMLSelectElement | null;
    if (!selectEl) return;
    this.SelectForComparison(slot, selectEl.value || null);
  }

  /**
   * Swaps the selected `vA` (base) and `vB` (target) comparison versions.
   */
  public SwapComparisonVersions(): void {
    const prevBase = this.CompareBaseChangeID;
    this.CompareBaseChangeID = this.CompareTargetChangeID;
    this.CompareTargetChangeID = prevBase;
    this.cdr.markForCheck();
  }

  public IsChangeSelectedAsCompareBase(change: MJRecordChangeEntity): boolean {
    return (
      this.CompareBaseChangeID != null &&
      this.CompareBaseChangeID !== '__CURRENT__' &&
      UUIDsEqual(this.CompareBaseChangeID, change.ID)
    );
  }

  public IsChangeSelectedAsCompareTarget(change: MJRecordChangeEntity): boolean {
    return (
      this.CompareTargetChangeID != null &&
      this.CompareTargetChangeID !== '__CURRENT__' &&
      UUIDsEqual(this.CompareTargetChangeID, change.ID)
    );
  }

  public get CompareBaseChange(): MJRecordChangeEntity | null {
    if (!this.CompareBaseChangeID || this.CompareBaseChangeID === '__CURRENT__') {
      return null;
    }
    return this.viewDataById.get(NormalizeUUID(this.CompareBaseChangeID)) ?? null;
  }

  public get CompareTargetChange(): MJRecordChangeEntity | null {
    if (!this.CompareTargetChangeID || this.CompareTargetChangeID === '__CURRENT__') {
      return null;
    }
    return this.viewDataById.get(NormalizeUUID(this.CompareTargetChangeID)) ?? null;
  }

  public GetComparisonSlotLabel(slot: 'base' | 'target'): string {
    const id = slot === 'base' ? this.CompareBaseChangeID : this.CompareTargetChangeID;
    if (!id) return 'Select version…';
    if (id === '__CURRENT__') return 'Current Live Record';
    const change = this.viewDataById.get(NormalizeUUID(id));
    if (!change) return 'Selected version';
    return `${this.FormatRelativeTime(change.ChangedAt)} (${this.GetUserDisplayName(change.User)})`;
  }

  private extractSnapshotObject(changeId: string | null): Record<string, unknown> | null {
    if (!changeId) return null;
    if (changeId === '__CURRENT__') {
      const rec = this.record as (BaseEntity & {
        GetAll?: () => Record<string, unknown>;
        Fields?: Array<{ Name: string; Value: unknown }>;
      }) | undefined;
      if (!rec) return null;
      if (typeof rec.GetAll === 'function') {
        return rec.GetAll();
      }
      if (Array.isArray(rec.Fields)) {
        const snapshot: Record<string, unknown> = {};
        for (const f of rec.Fields) {
          snapshot[f.Name] = f.Value;
        }
        return snapshot;
      }
      return null;
    }
    const change = this.viewDataById.get(NormalizeUUID(changeId));
    if (!change?.FullRecordJSON) return null;
    try {
      return JSON.parse(change.FullRecordJSON) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Computes the field-by-field diff between the selected `vA` (`CompareBaseChangeID`)
   * and `vB` (`CompareTargetChangeID`) snapshots.
   */
  public GetComparisonDiffs(): FieldChangeInfo[] {
    const baseSnap = this.extractSnapshotObject(this.CompareBaseChangeID);
    const targetSnap = this.extractSnapshotObject(this.CompareTargetChangeID);
    if (!baseSnap || !targetSnap) {
      return [];
    }

    const entityFields = this.record?.EntityInfo?.Fields ?? [];
    const candidateNames = new Set<string>();
    for (const f of entityFields) {
      if (!f.IsPrimaryKey && !f.Name.startsWith('__mj_')) {
        candidateNames.add(f.Name);
      }
    }
    for (const key of Object.keys(baseSnap)) {
      if (!key.startsWith('__mj_') && key.toLowerCase() !== 'id') {
        candidateNames.add(key);
      }
    }
    for (const key of Object.keys(targetSnap)) {
      if (!key.startsWith('__mj_') && key.toLowerCase() !== 'id') {
        candidateNames.add(key);
      }
    }

    const diffs: FieldChangeInfo[] = [];
    for (const fieldName of candidateNames) {
      const fieldInfo = entityFields.find(
        (f: EntityFieldInfo) => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase(),
      );
      if (fieldInfo?.IsPrimaryKey || fieldName.startsWith('__mj_')) {
        continue;
      }
      const oldVal = baseSnap[fieldName];
      const newVal = targetSnap[fieldName];
      const formattedOld = FormatChangeValue(oldVal, fieldInfo);
      const formattedNew = FormatChangeValue(newVal, fieldInfo);
      if (formattedOld === formattedNew) {
        continue;
      }
      diffs.push(
        this.buildFieldChangeInfo({
          field: fieldInfo?.Name || fieldName,
          oldValue: oldVal,
          newValue: newVal,
        }),
      );
    }
    return diffs;
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
  public GetRestoredFromSourceChange(change: MJRecordChangeEntity): MJRecordChangeEntity | null {
    const withLineage = change as MJRecordChangeEntity & { RestoredFromID?: string | null };
    const sourceId = withLineage.RestoredFromID;
    if (!sourceId) return null;
    return this.viewDataById.get(NormalizeUUID(sourceId)) ?? null;
  }

  /** @deprecated Use {@link GetRestoredFromSourceChange}. */
  public getRestoredFromSourceChange(change: MJRecordChangeEntity): MJRecordChangeEntity | null {
    return this.GetRestoredFromSourceChange(change);
  }

  /**
   * Rebuilds {@link viewDataById} from the current {@link viewData}. Called once
   * per data load so source-change resolution is an O(1) Map read.
   */
  private rebuildViewDataIndex(): void {
    this.viewDataById.clear();
    for (const c of this.ViewData) {
      this.viewDataById.set(NormalizeUUID(c.ID), c);
    }
  }

  /**
   * True when the row was produced by a restore operation (either the
   * `Source` is `'Restore'` OR `RestoredFromID` is populated).
   */
  public IsRestoreRow(change: MJRecordChangeEntity): boolean {
    return this.isRestoreChange(change);
  }

  /** @deprecated Use {@link IsRestoreRow}. */
  public isRestoreRow(change: MJRecordChangeEntity): boolean {
    return this.IsRestoreRow(change);
  }

  /**
   * True when this change is the most recent in the loaded history.
   * `viewData` is sorted DESC by `ChangedAt`, so the most recent is index 0.
   * Restoring to the most recent version is a no-op, so the timeline hides
   * the Restore button on this row.
   */
  public IsMostRecentChange(change: MJRecordChangeEntity): boolean {
    return this.ViewData.length > 0 && this.ViewData[0] === change;
  }

  /** @deprecated Use {@link IsMostRecentChange}. */
  public isMostRecentChange(change: MJRecordChangeEntity): boolean {
    return this.IsMostRecentChange(change);
  }

  /**
   * Click handler for the lineage chip — scrolls/highlights the source
   * change row in the timeline. Auto-clears after a few seconds.
   */
  public JumpToSourceChange(sourceChange: MJRecordChangeEntity, event: MouseEvent): void {
    event.stopPropagation();
    this.HighlightedChangeID = sourceChange.ID;
    this.ExpandedItems.add(sourceChange.ID);
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

  GetChangeTypeCardClass(type: string): string {
    switch (type) {
      case 'Create': return 'type-create';
      case 'Update': return 'type-update';
      case 'Delete': return 'type-delete';
      case 'Snapshot': return 'type-snapshot';
      default: return 'type-update';
    }
  }

  /** @deprecated Use {@link GetChangeTypeCardClass}. */
  getChangeTypeCardClass(type: string): string {
    return this.GetChangeTypeCardClass(type);
  }

  GetChangeTypeBadgeText(type: string): string {
    switch (type) {
      case 'Create': return 'Created';
      case 'Delete': return 'Deleted';
      case 'Snapshot': return 'Snapshot';
      default: return type;
    }
  }

  /** @deprecated Use {@link GetChangeTypeBadgeText}. */
  getChangeTypeBadgeText(type: string): string {
    return this.GetChangeTypeBadgeText(type);
  }

  /**
   * Badge text for the row's primary type tag. For restore rows we override
   * the underlying `Type='Update'` and show "Restore" instead — matches the
   * mockup's intent of treating restore as a first-class operation in the
   * timeline rather than a flavor of update.
   */
  GetEffectiveBadgeText(change: MJRecordChangeEntity): string {
    if (this.IsRestoreRow(change)) return 'Restore';
    return this.GetChangeTypeBadgeText(change.Type);
  }

  /** @deprecated Use {@link GetEffectiveBadgeText}. */
  getEffectiveBadgeText(change: MJRecordChangeEntity): string {
    return this.GetEffectiveBadgeText(change);
  }

  /**
   * Optional restore reason — pulled from the dynamic `RestoreReason`
   * column added by the lineage migration. Returns null when not present
   * or not a restore row.
   */
  GetRestoreReason(change: MJRecordChangeEntity): string | null {
    if (!this.IsRestoreRow(change)) return null;
    const reason = (change as unknown as { RestoreReason?: string | null }).RestoreReason;
    return reason && reason.trim().length > 0 ? reason : null;
  }

  /** @deprecated Use {@link GetRestoreReason}. */
  getRestoreReason(change: MJRecordChangeEntity): string | null {
    return this.GetRestoreReason(change);
  }

  GetSourceClass(source: string): string {
    if (source === 'Restore') return 'source-restore';
    if (source === 'Internal') return 'source-internal';
    return 'source-external';
  }

  /** @deprecated Use {@link GetSourceClass}. */
  getSourceClass(source: string): string {
    return this.GetSourceClass(source);
  }

  GetStatusClass(status: string): string {
    switch (status) {
      case 'Complete': return 'status-complete';
      case 'Pending': return 'status-pending';
      case 'Error': return 'status-error';
      default: return 'status-unknown';
    }
  }

  /** @deprecated Use {@link GetStatusClass}. */
  getStatusClass(status: string): string {
    return this.GetStatusClass(status);
  }

  GetTimelineItemLabel(change: MJRecordChangeEntity): string {
    return `${change.Type} by ${change.User || 'Unknown User'} on ${this.FormatFullDateTime(change.ChangedAt)}`;
  }

  /** @deprecated Use {@link GetTimelineItemLabel}. */
  getTimelineItemLabel(change: MJRecordChangeEntity): string {
    return this.GetTimelineItemLabel(change);
  }

  GetUserInitials(user: string | null): string {
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

  /** @deprecated Use {@link GetUserInitials}. */
  getUserInitials(user: string | null): string {
    return this.GetUserInitials(user);
  }

  GetUserDisplayName(user: string | null): string {
    if (!user) return 'Unknown';
    if (user.includes('@')) return user.split('@')[0];
    return user;
  }

  /** @deprecated Use {@link GetUserDisplayName}. */
  getUserDisplayName(user: string | null): string {
    return this.GetUserDisplayName(user);
  }

  GetUniqueContributorCount(): number {
    const users = new Set(this.ViewData.map(c => c.User).filter(Boolean));
    return users.size;
  }

  /** @deprecated Use {@link GetUniqueContributorCount}. */
  getUniqueContributorCount(): number {
    return this.GetUniqueContributorCount();
  }

  FormatTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(date));
  }

  /** @deprecated Use {@link FormatTime}. */
  formatTime(date: Date): string {
    return this.FormatTime(date);
  }

  FormatRelativeTime(date: Date): string {
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

  /** @deprecated Use {@link FormatRelativeTime}. */
  formatRelativeTime(date: Date): string {
    return this.FormatRelativeTime(date);
  }

  FormatFullDateTime(date: Date): string {
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

  /** @deprecated Use {@link FormatFullDateTime}. */
  formatFullDateTime(date: Date): string {
    return this.FormatFullDateTime(date);
  }

  // ─── Change Summary ─────────────────────────────────────────────

  GetChangeSummary(change: MJRecordChangeEntity): string {
    // Restore rows get a distinctive summary so the timeline reads like a
    // sentence — "Restored to 5:56 PM version" rather than yet another
    // "Name and Description changed". The lineage chip carries the full
    // source-version detail.
    if (this.IsRestoreRow(change)) {
      const src = this.GetRestoredFromSourceChange(change);
      if (src) return `Restored to ${this.FormatTime(src.ChangedAt)} version`;
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

  /** @deprecated Use {@link GetChangeSummary}. */
  getChangeSummary(change: MJRecordChangeEntity): string {
    return this.GetChangeSummary(change);
  }

  GetCreatedFieldCount(change: MJRecordChangeEntity): number {
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

  /** @deprecated Use {@link GetCreatedFieldCount}. */
  getCreatedFieldCount(change: MJRecordChangeEntity): number {
    return this.GetCreatedFieldCount(change);
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

  GetFieldChanges(change: MJRecordChangeEntity): FieldChangeInfo[] {
    try {
      const changesJson = JSON.parse(change.ChangesJSON || '{}');
      return Object.keys(changesJson).map(fieldKey => this.buildFieldChangeInfo(changesJson[fieldKey]));
    } catch {
      return [];
    }
  }

  /** @deprecated Use {@link GetFieldChanges}. */
  getFieldChanges(change: MJRecordChangeEntity): FieldChangeInfo[] {
    return this.GetFieldChanges(change);
  }

  private buildFieldChangeInfo(changeInfo: { field?: string; oldValue?: unknown; newValue?: unknown }): FieldChangeInfo {
    const field = this.record.EntityInfo.Fields.find(
      (f: EntityFieldInfo) => f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase(),
    );

    const fieldType = this.classifyFieldType(field);
    const formattedOld = FormatChangeValue(changeInfo.oldValue, field);
    const formattedNew = FormatChangeValue(changeInfo.newValue, field);

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

  GetCreatedFields(change: MJRecordChangeEntity): Array<{ name: string; displayName: string; value: string }> {
    try {
      if (!change.FullRecordJSON) return [];

      const record = JSON.parse(change.FullRecordJSON);
      const fields = this.record.EntityInfo.Fields;

      return fields
        .filter((field: EntityFieldInfo) => record[field.Name] != null && record[field.Name] !== '')
        .map((field: EntityFieldInfo) => ({
          name: field.Name,
          displayName: field.DisplayNameOrName,
          value: FormatChangeValue(record[field.Name], field),
        }));
    } catch {
      return [];
    }
  }

  /** @deprecated Use {@link GetCreatedFields}. */
  getCreatedFields(change: MJRecordChangeEntity): Array<{ name: string; displayName: string; value: string }> {
    return this.GetCreatedFields(change);
  }

  // ─── Value Formatting ───────────────────────────────────────────

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
