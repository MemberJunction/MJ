import { Component, Input, OnInit, ViewChild, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { BaseEntity, CompositeKey, LogError, LogErrorEx, LogStatus, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { MJListDetailEntity, MJListDetailEntityExtended, MJListEntity, MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { ListDetailGridComponent, ListGridRowClickedEvent } from '@memberjunction/ng-list-detail-grid';
import { GridToolbarConfig } from '@memberjunction/ng-entity-viewer';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import { CapabilitiesForLevel, ListSharing, type ListCapabilities, type ListDelta, type ListRefreshMode, type SharePermissionLevel } from '@memberjunction/lists';
import { ExportService } from '@memberjunction/ng-export-service';
import { Subject, debounceTime } from 'rxjs';
import { NewItemOption } from '../../generic/Item.types';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
/**
 * Represents a record that can be added to a list
 */
interface AddableRecord {
  ID: string;
  Name: string;
  isInList: boolean;
  isSelected: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-list-detail',
  templateUrl: './single-list-detail.component.html',
  styleUrls: ['./single-list-detail.component.css', '../../shared/first-tab-styles.css']
})
export class SingleListDetailComponent extends BaseAngularComponent implements OnInit {

  @Input() public ListID: string = "";

  /**
   * Bumped on every list-membership mutation so the Usage stats sidebar
   * re-queries member count / growth / last-activity. Without this nudge,
   * those numbers drift from reality until a full page reload because the
   * stats component otherwise only loads on init.
   */
  public statsRefreshTrigger = 0;
  private bumpStatsRefresh(): void { this.statsRefreshTrigger++; }

  @ViewChild('listDetailGrid') listDetailGrid: ListDetailGridComponent | undefined;

  // List record
  public listRecord: MJListEntity | null = null;
  public showLoader: boolean = false;

  // Permission-level gating (Phase 2.8). Resolved lazily after the list
  // loads. Capabilities is exposed to the template for `@if` gating; the
  // server-side enforcement remains the source of truth — these flags
  // are a UX convenience so users don't see buttons they'll be rejected on.
  public capabilities: ListCapabilities = CapabilitiesForLevel(null);
  public currentLevel: SharePermissionLevel | null = null;

  // Lineage / refresh-from-source state. `sourceViewName` is loaded after
  // listRecord so the lineage badge can show a friendly view name; the
  // refresh-mode default falls back to the list's RefreshMode field but
  // can be overridden per-user via localStorage (see `loadLastUsedMode`).
  public sourceViewName: string | null = null;

  // Bulk-edit (Phase 5.2). Status, Move, Copy, Remove. Move flows through
  // the delta-confirm dialog because it produces drops on the source list.
  public bulkStatus: 'Active' | 'Complete' | 'Disabled' | 'Pending' | 'Rejected' | '' = '';
  public isApplyingBulkStatus = false;

  // Move / Copy state (mockups 23, 24). The picker dialog lists candidate
  // target lists scoped to the same entity. We load it lazily on first
  // open and cache for the session — opening the picker twice in a row
  // doesn't re-fetch unless the user explicitly hits "Refresh".
  public showMoveCopyDialog = false;
  public moveCopyMode: 'move' | 'copy' = 'move';
  public moveCopyTargetSearch = '';
  public moveCopyTargetCandidates: MJListEntity[] = [];
  public moveCopyTargetCandidatesLoading = false;
  public moveCopySelectedTarget: MJListEntity | null = null;
  public isApplyingMoveCopy = false;
  public moveCopyProgress = 0;
  public moveCopyTotal = 0;

  // Move delta-confirm. Built locally from the in-hand RecordIDs — no
  // server round-trip needed since we already know exactly what will be
  // added to the target and removed from the source. The drop-guard is
  // enforced at confirm time (mode='move' + ack checkbox).
  public moveDeltaConfirmVisible = false;
  public moveDelta: ListDelta | null = null;

  // Export picker (Phase 5.1, mockup 26). Opens before any export; lets
  // the user pick format + which entity fields to include. Fields are
  // resolved from EntityInfo on the loaded provider — no separate fetch.
  public showExportDialog = false;
  public exportFormat: 'excel' | 'csv' | 'json' = 'excel';
  public exportFields: Array<{ Name: string; DisplayName: string; Selected: boolean }> = [];
  public exportRecordCount = 0;
  public isExporting = false;
  public refreshMode: ListRefreshMode = 'Additive';
  public isPreviewingRefresh = false;
  public isApplyingRefresh = false;
  public refreshDelta: ListDelta | null = null;
  public refreshConfirmVisible = false;

  // Grid state
  public selectedKeys: string[] = [];
  public rowCount: number = 0;

  // Toolbar config - hide EDG toolbar, we'll use our own
  public gridToolbarConfig: GridToolbarConfig = {
    showSearch: false,
    showRefresh: false,
    showAdd: false,
    showDelete: false,
    showExport: false,
    showRowCount: false,
    showSelectionCount: false
  };

  // Remove from list dialog
  public showRemoveDialog: boolean = false;
  public isRemoving: boolean = false;
  public removeProgress: number = 0;
  public removeTotal: number = 0;

  // Add records dialog
  public showAddRecordsDialog: boolean = false;
  public addDialogLoading: boolean = false;
  public addDialogSaving: boolean = false;
  public addableRecords: AddableRecord[] = [];
  public addRecordsSearchFilter: string = "";
  public existingListDetailIds: Set<string> = new Set();
  public addProgress: number = 0;
  public addTotal: number = 0;
  private searchSubject: Subject<string> = new Subject();

  // Add from view dialog (existing)
  public showAddFromViewDialog: boolean = false;
  public showAddFromViewLoader: boolean = false;
  public userViews: MJUserViewEntityExtended[] | null = null;
  public userViewsToAdd: MJUserViewEntityExtended[] = [];
  public addFromViewProgress: number = 0;
  public addFromViewTotal: number = 0;
  public fetchingRecordsToSave: boolean = false;

  // Dropdown button toggle state
  public showAddDropdown: boolean = false;

  // Dropdown menu options
  public addOptions: NewItemOption[] = [
    {
      Text: 'Add Records',
      Description: 'Search and add specific records to this list',
      Icon: 'search',
      Action: () => this.openAddRecordsDialog()
    },
    {
      Text: 'Add From View',
      Description: 'Add all records from a saved view',
      Icon: 'folder',
      Action: () => this.openAddFromViewDialog()
    }
  ];

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showAddDropdown) {
      const target = event.target as HTMLElement;
      if (!this.elementRef.nativeElement.querySelector('.add-dropdown-wrapper')?.contains(target)) {
        this.showAddDropdown = false;
      }
    }
  }

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private exportService: ExportService,
  ) {
    super();
    // Debounce search input
    this.searchSubject
      .pipe(debounceTime(300))
      .subscribe((searchText) => this.searchRecords(searchText));
  }

  public ngOnInit(): void {
    if (this.ListID) {
      // Defer the load to a macrotask so the initial assignment of
      // `listRecord` cannot land during Angular's dev-mode verify pass
      // (NG0100). The first CD cycle renders with listRecord=null
      // ("List"); the macrotask then loads, assigns, and fires its own
      // detectChanges in a fresh cycle.
      setTimeout(() => { void this.loadListRecord(); }, 0);
    }
  }

  /**
   * Load the list entity record
   */
  private async loadListRecord(): Promise<void> {
    if (!this.ListID) return;

    this.showLoader = true;

    try {
      const md = this.ProviderToUse;
      // Build + load against a LOCAL handle. Only assign to
      // this.listRecord after Load() succeeds — otherwise Angular's
      // change detector sees a transiently-populated half-loaded
      // entity (Name=null) before Load fills it in, and the title
      // binding throws ExpressionChangedAfterItHasBeenCheckedError.
      const list = await md.GetEntityObject<MJListEntity>("MJ: Lists");
      const loadResult = await list.Load(this.ListID);

      if (!loadResult) {
        LogError("Error loading list with ID " + this.ListID, undefined, list.LatestResult);
        this.listRecord = null;
      } else {
        this.listRecord = list;
        await this.loadLineageContext();
        await this.loadCapabilities();
      }
    } catch (error) {
      LogError("Error loading list", undefined, error);
      this.listRecord = null;
    } finally {
      this.showLoader = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Load lineage context for the refresh-from-source UI:
   *   - Resolve the source view's display name for the lineage badge.
   *   - Initialize the refresh-mode dropdown from per-user last-used
   *     preference, falling back to the list's RefreshMode field.
   * Silent on failure — the badge / refresh button just won't render
   * rather than blocking the rest of the detail view.
   */
  private async loadLineageContext(): Promise<void> {
    if (!this.listRecord?.SourceViewID) {
      this.sourceViewName = null;
      return;
    }
    this.refreshMode = this.loadLastUsedMode() ?? this.listRecord.RefreshMode;
    try {
      const view = await this.ProviderToUse.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views');
      const loaded = await view.Load(this.listRecord.SourceViewID);
      this.sourceViewName = loaded ? view.Name : null;
    } catch (e) {
      LogError(`Failed to load source view name for list ${this.ListID}: ${e}`);
      this.sourceViewName = null;
    }
  }

  /**
   * Resolve the caller's permission level for this list (Owner / Edit /
   * View / null) and derive UI capability flags. Best-effort — if the
   * resolve fails we conservatively default to no-mutation (Viewer-like)
   * so we don't accidentally surface buttons the server will reject.
   */
  private async loadCapabilities(): Promise<void> {
    if (!this.listRecord) {
      this.capabilities = CapabilitiesForLevel(null);
      this.currentLevel = null;
      return;
    }
    try {
      const sharing = new ListSharing(this.ProviderToUse.CurrentUser!, this.ProviderToUse);
      const level = await sharing.ResolveEffectivePermission(this.listRecord.ID);
      this.currentLevel = level;
      this.capabilities = CapabilitiesForLevel(level);
    } catch (e) {
      LogError(`loadCapabilities failed: ${e instanceof Error ? e.message : String(e)}`);
      this.capabilities = CapabilitiesForLevel('View');
      this.currentLevel = 'View';
    }
  }

  public get hasLineage(): boolean {
    return !!this.listRecord?.SourceViewID;
  }

  private loadLastUsedMode(): ListRefreshMode | null {
    try {
      const stored = localStorage.getItem(`mj.lists.refreshMode.${this.ListID}`);
      if (stored === 'Additive' || stored === 'Sync') return stored;
    } catch {
      // localStorage may not be available (SSR, private mode) — fall through.
    }
    return null;
  }

  private saveLastUsedMode(mode: ListRefreshMode): void {
    try {
      localStorage.setItem(`mj.lists.refreshMode.${this.ListID}`, mode);
    } catch {
      // ignore
    }
  }

  /**
   * Kick off a refresh-from-source preview. Builds the delta server-side
   * and opens the confirm dialog when it returns. The dialog enforces the
   * acknowledgement UX; the server enforces the actual drop guard.
   */
  public async onRefreshFromSource(): Promise<void> {
    if (!this.hasLineage || this.isPreviewingRefresh) return;
    this.isPreviewingRefresh = true;
    this.refreshDelta = null;
    this.cdr.detectChanges();
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const client = new GraphQLListsClient(provider);
      const delta = await client.PreviewListDelta({
        Target: this.ListID,
        Source: { kind: 'view', viewId: this.listRecord!.SourceViewID! },
        Mode: this.refreshMode,
      });
      this.refreshDelta = delta;
      this.refreshConfirmVisible = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Refresh preview failed: ${message}`, 'error', 5000);
    } finally {
      this.isPreviewingRefresh = false;
      this.cdr.detectChanges();
    }
  }

  public onRefreshConfirmCancel(): void {
    this.refreshConfirmVisible = false;
    this.refreshDelta = null;
    this.cdr.detectChanges();
  }

  public async onRefreshConfirmCommit(deltaToken: string): Promise<void> {
    if (!this.refreshDelta) return;
    this.isApplyingRefresh = true;
    this.cdr.detectChanges();
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const client = new GraphQLListsClient(provider);
      const result = await client.ApplyListDelta({
        Delta: { ...this.refreshDelta, DeltaToken: deltaToken },
        ConfirmDrops: (this.refreshDelta.Counts.Remove ?? 0) > 0,
      });
      if (result.Success) {
        this.saveLastUsedMode(this.refreshMode);
        this.refreshConfirmVisible = false;
        this.refreshDelta = null;
        this.sharedService.CreateSimpleNotification(
          `Refresh applied: +${result.Counts?.Added ?? 0} / -${result.Counts?.Removed ?? 0}`,
          'success',
          3000,
        );
        // Reload list (for LastRefreshedAt) + grid in parallel.
        await this.loadListRecord();
        this.refreshGrid();
        this.bumpStatsRefresh();
      } else {
        this.sharedService.CreateSimpleNotification(`Refresh failed: ${result.Message}`, 'error', 5000);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Refresh failed: ${message}`, 'error', 5000);
    } finally {
      this.isApplyingRefresh = false;
      this.cdr.detectChanges();
    }
  }

  public onRefreshModeChange(mode: ListRefreshMode): void {
    this.refreshMode = mode;
  }

  // ==========================================
  // Grid Event Handlers
  // ==========================================

  onRowClicked(_event: ListGridRowClickedEvent): void {
    // Selection is handled by the grid
  }

  onRowDoubleClicked(_event: ListGridRowClickedEvent): void {
    // Navigation is handled by mj-list-detail-grid
  }

  onSelectionChange(keys: string[]): void {
    this.selectedKeys = keys;
  }

  onDataLoaded(event: { totalCount: number }): void {
    this.rowCount = event.totalCount;
  }

  refreshGrid(): void {
    if (this.listDetailGrid) {
      this.listDetailGrid.refresh();
    }
  }

  // ==========================================
  // Toolbar Actions
  // ==========================================

  // ==========================================
  // Progress Percentage Getters
  // ==========================================

  get removeProgressPercent(): number {
    return this.removeTotal > 0 ? Math.round((this.removeProgress / this.removeTotal) * 100) : 0;
  }

  get addProgressPercent(): number {
    return this.addTotal > 0 ? Math.round((this.addProgress / this.addTotal) * 100) : 0;
  }

  get addFromViewProgressPercent(): number {
    return this.addFromViewTotal > 0 ? Math.round((this.addFromViewProgress / this.addFromViewTotal) * 100) : 0;
  }

  onRefreshClick(): void {
    this.refreshGrid();
  }

  onExportClick(): void {
    this.openExportDialog();
  }

  /**
   * Open the format + column picker (mockup 26). Resolves the candidate
   * field list from EntityInfo on the loaded provider — no extra
   * RunView. Default selection is every non-virtual entity field, which
   * matches what the underlying grid's "export all" path produced.
   */
  public openExportDialog(): void {
    if (!this.listRecord) {
      this.sharedService.CreateSimpleNotification('Load a list first before exporting.', 'info', 3000);
      return;
    }
    const md = this.ProviderToUse;
    const entityInfo = md.EntityByID(this.listRecord.EntityID);
    if (!entityInfo) {
      this.sharedService.CreateSimpleNotification(
        `Entity for this list not found in metadata.`,
        'error', 4000,
      );
      return;
    }
    if (entityInfo.PrimaryKeys.length !== 1) {
      this.sharedService.CreateSimpleNotification(
        `Composite-PK entities ('${entityInfo.Name}') aren't yet supported for List export.`,
        'warning', 5000,
      );
      return;
    }
    this.exportFields = entityInfo.Fields
      .filter((f) => f.IsVirtual !== true)
      .map((f) => ({
        Name: f.Name,
        DisplayName: f.DisplayName || f.Name,
        Selected: true,
      }));
    this.exportRecordCount = this.rowCount;
    this.exportFormat = 'excel';
    this.showExportDialog = true;
    this.cdr.detectChanges();
  }

  public closeExportDialog(): void {
    this.showExportDialog = false;
    this.cdr.detectChanges();
  }

  public selectAllExportFields(): void {
    for (const f of this.exportFields) f.Selected = true;
  }
  public selectNoneExportFields(): void {
    for (const f of this.exportFields) f.Selected = false;
  }
  public get selectedExportFieldCount(): number {
    return this.exportFields.filter((f) => f.Selected).length;
  }

  /**
   * Run the export with the user's chosen format + columns. Resolves
   * the list's member RecordIDs from the in-memory grid when possible
   * (avoids an extra RunView), then bulk-loads the underlying entity
   * rows restricted to the chosen Fields. Output is projected to
   * exactly the user's selected columns + ordering.
   */
  public async executeExport(): Promise<void> {
    if (!this.listRecord) return;
    const selectedFields = this.exportFields.filter((f) => f.Selected).map((f) => f.Name);
    if (selectedFields.length === 0) return;

    this.isExporting = true;
    this.cdr.detectChanges();
    try {
      const md = this.ProviderToUse;
      const entityInfo = md.EntityByID(this.listRecord.EntityID)!;
      const pk = entityInfo.PrimaryKeys[0].Name;

      // Fetch the list's member record IDs. The grid only holds the
      // current page, so we hit MJ: List Details directly to get the
      // full set — same single-PK assumption guarded at dialog open.
      const rv = RunView.FromMetadataProvider(md);
      const memberResult = await rv.RunView<{ RecordID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID='${this.listRecord.ID}'`,
        Fields: ['RecordID'],
        ResultType: 'simple',
      });
      if (!memberResult.Success) {
        this.sharedService.CreateSimpleNotification(
          `Export failed loading members: ${memberResult.ErrorMessage}`, 'error', 5000,
        );
        return;
      }
      const recordIds = (memberResult.Results ?? []).map((r) => String(r.RecordID));
      if (recordIds.length === 0) {
        this.sharedService.CreateSimpleNotification(
          'List is empty — nothing to export.', 'info', 3000,
        );
        this.showExportDialog = false;
        return;
      }

      // Pull underlying entity rows restricted to the chosen fields.
      // Always include the PK so the projection round-trips cleanly.
      const fieldsForQuery = Array.from(new Set([pk, ...selectedFields]));
      const escaped = recordIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
      const rowResult = await rv.RunView<Record<string, unknown>>({
        EntityName: entityInfo.Name,
        ExtraFilter: `${pk} IN (${escaped})`,
        Fields: fieldsForQuery,
        ResultType: 'simple',
      });
      if (!rowResult.Success) {
        this.sharedService.CreateSimpleNotification(
          `Export failed loading rows: ${rowResult.ErrorMessage}`, 'error', 5000,
        );
        return;
      }
      // Project rows to exactly the columns + ordering the user picked.
      const rows = (rowResult.Results ?? []).map((row) => {
        const projected: Record<string, unknown> = {};
        for (const f of selectedFields) projected[f] = row[f];
        return projected;
      });

      const dateStamp = new Date().toISOString().slice(0, 10);
      const safeName = (this.listRecord.Name || 'list').replace(/[^a-z0-9_-]+/gi, '_');
      const ext = this.exportFormat === 'excel' ? 'xlsx' : this.exportFormat;
      const fileName = `${safeName}-${dateStamp}.${ext}`;
      const exportResult = this.exportFormat === 'excel'
        ? await this.exportService.toExcel(rows, { fileName, includeHeaders: true })
        : this.exportFormat === 'csv'
          ? await this.exportService.toCSV(rows, { fileName, includeHeaders: true })
          : await this.exportService.toJSON(rows, { fileName });

      if (exportResult.success) {
        this.exportService.downloadResult(exportResult);
        this.sharedService.CreateSimpleNotification(
          `Exported ${rows.length} record(s)`, 'success', 3000,
        );
        this.showExportDialog = false;
      } else {
        this.sharedService.CreateSimpleNotification('Export failed', 'error', 5000);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Export error: ${message}`, 'error', 5000);
    } finally {
      this.isExporting = false;
      this.cdr.detectChanges();
    }
  }

  toggleAddDropdown(): void {
    this.showAddDropdown = !this.showAddDropdown;
  }

  onDropdownItemClick(item: NewItemOption): void {
    this.showAddDropdown = false;
    if (item.Action) {
      item.Action();
    }
  }

  // ==========================================
  /**
   * Apply the chosen status to all selected list-detail rows. Re-uses
   * the existing extract-record-id-from-composite-key logic to map
   * `selectedKeys` to the actual `MJ: List Detail.RecordID` values.
   */
  public async applyBulkStatus(): Promise<void> {
    if (!this.listRecord || this.selectedKeys.length === 0 || !this.bulkStatus) return;
    this.isApplyingBulkStatus = true;
    this.cdr.detectChanges();
    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(md);
      const entityInfo = md.EntityByID(this.listRecord.EntityID);
      const recordIds = this.selectedKeys.map((key) => {
        if (entityInfo && entityInfo.PrimaryKeys.length === 1) {
          const ck = new CompositeKey();
          ck.LoadFromConcatenatedString(key);
          return ck.KeyValuePairs[0]?.Value || key;
        }
        return key;
      });
      const filter = `ListID='${this.listRecord.ID}' AND RecordID IN (${recordIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',')})`;
      // Two-step: fetch just the IDs via a 'simple' RunView, then load each
      // entity through GetEntityObject(..., CurrentUser) so the entity is
      // born with the user context that Save() requires. RunView with
      // 'entity_object' returns entities WITHOUT a CurrentUser bound — fine
      // for read-only use, broken for Save (`ContextCurrentUser cannot be
      // null`).
      const idResult = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: filter,
        Fields: ['ID'],
        ResultType: 'simple',
      });
      if (!idResult.Success) {
        this.sharedService.CreateSimpleNotification(`Failed to load list details: ${idResult.ErrorMessage}`, 'error', 4000);
        return;
      }
      let updated = 0;
      let failed = 0;
      const failureMessages: string[] = [];
      for (const row of idResult.Results ?? []) {
        const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', md.CurrentUser);
        const loaded = await detail.Load(row.ID);
        if (!loaded) {
          failed++;
          const reason = detail.LatestResult?.CompleteMessage ?? 'load failed';
          if (failureMessages.length < 3) failureMessages.push(reason);
          continue;
        }
        detail.Status = this.bulkStatus as never;
        const ok = await detail.Save();
        if (ok) {
          updated++;
        } else {
          failed++;
          const reason = detail.LatestResult?.CompleteMessage ?? 'unknown error';
          if (failureMessages.length < 3) failureMessages.push(reason);
          LogError(`Bulk status update failed for List Detail ${row.ID}: ${reason}`);
        }
      }
      this.sharedService.CreateSimpleNotification(
        failed === 0
          ? `Updated ${updated} item(s) to '${this.bulkStatus}'`
          : `Updated ${updated}, ${failed} failed: ${failureMessages.join(' | ')}`,
        failed === 0 ? 'success' : 'warning',
        failed === 0 ? 3000 : 8000,
      );
      this.bulkStatus = '';
      // Defer the grid refresh to the next microtask — see comment in
      // confirmRemoveFromList for why running it synchronously here
      // triggers NG0100 and silently breaks the UI refresh.
      await Promise.resolve();
      this.refreshGrid();
      this.bumpStatsRefresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Bulk update failed: ${message}`, 'error', 5000);
    } finally {
      this.isApplyingBulkStatus = false;
      this.cdr.detectChanges();
    }
  }

  // ==========================================
  // Bulk Move / Copy (mockups 23, 24)
  //
  // Move = insert into target + delete from source (drops on source).
  // Copy = insert into target only (additive — no drops).
  //
  // The drop-guard for Move is enforced by routing through the local
  // delta-confirm dialog: the user must ack the removal before the
  // mutation runs. We build a synthetic ListDelta locally because we
  // already know the exact ToAdd / ToRemove sets — no server round-trip
  // needed for the preview. Apply step uses direct entity Save/Delete
  // inside a single TransactionGroup (same pattern as Remove).
  // ==========================================

  public openMoveDialog(): void { this.openMoveCopyDialog('move'); }
  public openCopyDialog(): void { this.openMoveCopyDialog('copy'); }

  private openMoveCopyDialog(mode: 'move' | 'copy'): void {
    if (!this.listRecord || this.selectedKeys.length === 0) {
      this.sharedService.CreateSimpleNotification('Please select records first', 'warning', 2500);
      return;
    }
    this.moveCopyMode = mode;
    this.moveCopySelectedTarget = null;
    this.moveCopyTargetSearch = '';
    this.showMoveCopyDialog = true;
    // Load candidates once per dialog open. We don't keep them in
    // permanent component state because the user could create/delete
    // lists between opens, and the target picker isn't visible often
    // enough to justify long-lived caching.
    void this.loadMoveCopyTargets();
    this.cdr.detectChanges();
  }

  public closeMoveCopyDialog(): void {
    this.showMoveCopyDialog = false;
    this.moveCopyTargetCandidates = [];
    this.moveCopySelectedTarget = null;
    this.cdr.detectChanges();
  }

  public selectMoveCopyTarget(target: MJListEntity): void {
    this.moveCopySelectedTarget = target;
  }

  public get filteredMoveCopyTargets(): MJListEntity[] {
    const term = this.moveCopyTargetSearch.trim().toLowerCase();
    if (!term) return this.moveCopyTargetCandidates;
    return this.moveCopyTargetCandidates.filter((l) =>
      l.Name.toLowerCase().includes(term) ||
      (l.Description?.toLowerCase().includes(term) ?? false)
    );
  }

  public get moveCopyProgressPercent(): number {
    return this.moveCopyTotal > 0 ? Math.round((this.moveCopyProgress / this.moveCopyTotal) * 100) : 0;
  }

  /** Load candidate target lists — same Entity, owned by or shared with
   *  the current user, excluding the list we're standing on. One RunView
   *  on open; results stay in memory until the dialog closes. */
  private async loadMoveCopyTargets(): Promise<void> {
    if (!this.listRecord) return;
    this.moveCopyTargetCandidatesLoading = true;
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Filter to same EntityID + exclude the current list. UserID filter
      // would over-restrict (Shared-With-Me lists should be valid targets
      // when the user has Edit there); the server enforces the real
      // permission on the per-row Save, so listing extra entries is fine.
      const filter = `EntityID='${this.listRecord.EntityID}' AND ID<>'${this.listRecord.ID}'`;
      const result = await rv.RunView<MJListEntity>({
        EntityName: 'MJ: Lists',
        ExtraFilter: filter,
        OrderBy: 'Name',
        ResultType: 'simple',
        MaxRows: 500,
      });
      if (result.Success) {
        this.moveCopyTargetCandidates = (result.Results ?? []) as MJListEntity[];
      } else {
        this.moveCopyTargetCandidates = [];
        this.sharedService.CreateSimpleNotification(`Failed to load target lists: ${result.ErrorMessage}`, 'error', 4000);
      }
    } catch (e) {
      this.moveCopyTargetCandidates = [];
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Failed to load target lists: ${message}`, 'error', 4000);
    } finally {
      this.moveCopyTargetCandidatesLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * "Continue" / "Copy" click in the target picker. For Copy we apply
   * immediately. For Move we build a local Delta and show the confirm
   * dialog — the actual mutation fires from onMoveConfirmCommit().
   */
  public async confirmMoveCopy(): Promise<void> {
    if (!this.listRecord || !this.moveCopySelectedTarget || this.selectedKeys.length === 0) return;
    if (this.moveCopyMode === 'copy') {
      await this.applyMoveCopy(false);
      return;
    }
    // Move: show delta-confirm so the user explicitly acks the source-side drop.
    const recordIds = this.extractSelectedRecordIds();
    this.moveDelta = this.buildMoveDelta(recordIds);
    this.showMoveCopyDialog = false;
    this.moveDeltaConfirmVisible = true;
    this.cdr.detectChanges();
  }

  public onMoveConfirmCancel(): void {
    this.moveDeltaConfirmVisible = false;
    this.moveDelta = null;
    // Re-open the target picker so the user can change their mind without
    // losing their selection.
    this.showMoveCopyDialog = true;
    this.cdr.detectChanges();
  }

  public async onMoveConfirmCommit(_deltaToken: string): Promise<void> {
    this.moveDeltaConfirmVisible = false;
    this.cdr.detectChanges();
    await this.applyMoveCopy(true);
  }

  /**
   * Pull RecordIDs out of selectedKeys. selectedKeys arrive from the
   * grid in concatenated-key format ("ID|<value>"). For single-PK entities
   * MJ: List Details stores the raw value; for composite-PK entities it
   * stores the full concatenated string. We normalize based on entity
   * metadata — same logic as confirmRemoveFromList.
   */
  private extractSelectedRecordIds(): string[] {
    const md = this.ProviderToUse;
    const entityInfo = this.listRecord ? md.EntityByID(this.listRecord.EntityID) : null;
    return this.selectedKeys.map((key) => {
      if (entityInfo && entityInfo.PrimaryKeys.length === 1) {
        const ck = new CompositeKey();
        ck.LoadFromConcatenatedString(key);
        return String(ck.KeyValuePairs[0]?.Value ?? key);
      }
      return key;
    });
  }

  /**
   * Build a synthetic ListDelta for the Move-confirm dialog. Token is
   * a sentinel — we never call server-side ApplyDelta for this flow,
   * the mutations run client-side inside a transaction group. The
   * delta-confirm component only reads counts + ToAdd/ToRemove + Warnings;
   * the token round-trips through the (Confirm) emit but is unused.
   */
  private buildMoveDelta(recordIds: string[]): ListDelta {
    const removeCount = recordIds.length;
    return {
      TargetListId: this.listRecord!.ID,
      EntityName: this.listRecord!.Entity ?? '',
      ToAdd: [],
      ToRemove: recordIds,
      Unchanged: [],
      Counts: {
        Add: 0,
        Remove: removeCount,
        Unchanged: 0,
        SourceTotal: 0,
        TargetTotal: this.rowCount,
      },
      Warnings: [{
        Code: 'WILL_REMOVE_RECORDS',
        Message: `${removeCount} record(s) will be removed from "${this.listRecord!.Name}" as part of the move`,
        Details: { Count: removeCount },
      }],
      // Sentinel — client-side flow doesn't round-trip this.
      DeltaToken: 'client-move-delta',
    };
  }

  /**
   * Execute the move/copy. Insert all records into the target, and for
   * Move also delete the matching MJ: List Details from the source. All
   * mutations run in a single TransactionGroup so partial failures don't
   * leave records duplicated in both lists.
   */
  private async applyMoveCopy(isMove: boolean): Promise<void> {
    if (!this.listRecord || !this.moveCopySelectedTarget) return;
    const source = this.listRecord;
    const target = this.moveCopySelectedTarget;
    const recordIds = this.extractSelectedRecordIds();
    if (recordIds.length === 0) return;

    this.isApplyingMoveCopy = true;
    this.moveCopyTotal = recordIds.length;
    this.moveCopyProgress = 0;
    this.cdr.detectChanges();

    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(md);

    try {
      // Dedupe against the target: skip records already present so a
      // partially-completed previous run can be re-tried cleanly.
      const filterIds = recordIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
      const existingTarget = await rv.RunView<{ RecordID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID='${target.ID}' AND RecordID IN (${filterIds})`,
        Fields: ['RecordID'],
        ResultType: 'simple',
      });
      const alreadyInTarget = new Set(
        (existingTarget.Results ?? []).map((r) => String((r as { RecordID: string }).RecordID))
      );
      const toAdd = recordIds.filter((id) => !alreadyInTarget.has(id));

      // For Move, look up the source-side ListDetail rows to delete.
      let sourceRows: MJListDetailEntity[] = [];
      if (isMove) {
        const lookup = await rv.RunView<MJListDetailEntity>({
          EntityName: 'MJ: List Details',
          ExtraFilter: `ListID='${source.ID}' AND RecordID IN (${filterIds})`,
          ResultType: 'entity_object',
        });
        if (!lookup.Success) {
          throw new Error(`Failed to load source rows: ${lookup.ErrorMessage}`);
        }
        sourceRows = lookup.Results ?? [];
      }

      const tg = await md.CreateTransactionGroup();

      // Queue inserts into target.
      for (const recordId of toAdd) {
        const newDetail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', md.CurrentUser);
        newDetail.NewRecord();
        newDetail.ListID = target.ID;
        newDetail.RecordID = recordId;
        newDetail.Sequence = 0;
        newDetail.TransactionGroup = tg;
        await newDetail.Save();
      }

      // Queue source-side deletes for Move only.
      if (isMove) {
        for (const row of sourceRows) {
          row.TransactionGroup = tg;
          await row.Delete();
        }
      }

      const ok = await tg.Submit();
      this.moveCopyProgress = this.moveCopyTotal;

      if (!ok) {
        this.sharedService.CreateSimpleNotification(
          `${isMove ? 'Move' : 'Copy'} partially failed — some changes may not have applied`,
          'error',
          5000,
        );
        return;
      }

      const skippedNote = alreadyInTarget.size > 0
        ? ` (${alreadyInTarget.size} already in target — skipped)`
        : '';
      this.sharedService.CreateSimpleNotification(
        `${isMove ? 'Moved' : 'Copied'} ${toAdd.length} record(s) to "${target.Name}"${skippedNote}`,
        'success',
        3000,
      );

      // Same NG0100 pattern as confirmRemoveFromList — defer cleanup +
      // refresh by a microtask so the dialog/visibility flips happen in
      // a fresh change-detection cycle.
      await Promise.resolve();
      this.closeMoveCopyDialog();
      this.moveDelta = null;
      if (isMove) {
        this.listDetailGrid?.clearSelection();
        this.refreshGrid();
        this.bumpStatsRefresh();
      }
      this.cdr.detectChanges();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`Move/Copy failed: ${message}`);
      this.sharedService.CreateSimpleNotification(`${isMove ? 'Move' : 'Copy'} failed: ${message}`, 'error', 5000);
    } finally {
      this.isApplyingMoveCopy = false;
      this.cdr.detectChanges();
    }
  }

  // ==========================================
  // Remove from List Dialog
  // ==========================================

  openRemoveDialog(): void {
    if (this.selectedKeys.length === 0) {
      this.sharedService.CreateSimpleNotification("Please select records to remove", 'warning', 2500);
      return;
    }
    this.showRemoveDialog = true;
  }

  closeRemoveDialog(): void {
    this.showRemoveDialog = false;
    this.isRemoving = false;
    this.removeProgress = 0;
    this.removeTotal = 0;
  }

  async confirmRemoveFromList(): Promise<void> {
    if (!this.listRecord || this.selectedKeys.length === 0) return;

    this.isRemoving = true;
    this.removeTotal = this.selectedKeys.length;
    this.removeProgress = 0;

    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const entityInfo = md.EntityByID(this.listRecord.EntityID);

    // selectedKeys from grid are in concatenated format (ID|value)
    // For single PK entities, RecordID in DB is just the raw value
    // For composite PK entities, RecordID in DB is the concatenated format
    // Extract the appropriate format for the query
    const selectedRecordIds = this.selectedKeys.map(key => {
      if (entityInfo && entityInfo.PrimaryKeys.length === 1) {
        // Single PK: extract just the value from concatenated format
        const compositeKey = new CompositeKey();
        compositeKey.LoadFromConcatenatedString(key);
        return compositeKey.KeyValuePairs[0]?.Value || key;
      } else {
        // Composite PK: use full concatenated format as-is
        return key;
      }
    });

    const listDetailsFilter = `ListID = '${this.listRecord.ID}' AND RecordID IN (${selectedRecordIds.map(id => `'${id}'`).join(',')})`;

    const listDetailsResult = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: listDetailsFilter,
      ResultType: 'entity_object'
    }, md.CurrentUser);

    if (!listDetailsResult.Success) {
      LogError("Error loading list details for removal", undefined, listDetailsResult.ErrorMessage);
      this.sharedService.CreateSimpleNotification("Failed to remove records", 'error', 2500);
      this.isRemoving = false;
      return;
    }

    // Use transaction group for bulk delete
    const tg = await md.CreateTransactionGroup();
    const listDetails = listDetailsResult.Results;

    for (const listDetail of listDetails) {
      listDetail.TransactionGroup = tg;
      await listDetail.Delete();
    }

    const success = await tg.Submit();

    if (success) {
      this.removeProgress = this.removeTotal;
      this.sharedService.CreateSimpleNotification(
        `Removed ${listDetails.length} record${listDetails.length !== 1 ? 's' : ''} from list`,
        'success',
        2500
      );
      // Defer cleanup + refresh to the next microtask. Running these
      // synchronously inside the current change-detection cycle
      // triggers NG0100 (`@if (showRemoveDialog)` flips false while
      // children are still being checked), which leaves the grid in a
      // stale state — the deletion succeeds server-side but the UI
      // doesn't re-fetch until the user navigates away and back.
      await Promise.resolve();
      this.closeRemoveDialog();
      this.listDetailGrid?.clearSelection();
      this.refreshGrid();
      this.bumpStatsRefresh();
      this.cdr.detectChanges();
    } else {
      LogError("Error removing records from list");
      this.sharedService.CreateSimpleNotification("Failed to remove some records", 'error', 2500);
      this.isRemoving = false;
    }
  }

  // ==========================================
  // Add Records Dialog
  // ==========================================

  async openAddRecordsDialog(): Promise<void> {
    this.showAddRecordsDialog = true;
    this.addableRecords = [];
    this.addRecordsSearchFilter = "";
    this.addDialogLoading = true;
    this.addDialogSaving = false;

    // Load existing list detail IDs to mark which records are already in the list
    await this.loadExistingListDetailIds();
    this.addDialogLoading = false;
  }

  closeAddRecordsDialog(): void {
    this.showAddRecordsDialog = false;
    this.addableRecords = [];
    this.addRecordsSearchFilter = "";
    this.existingListDetailIds.clear();
    this.addDialogSaving = false;
    this.addProgress = 0;
    this.addTotal = 0;
  }

  private async loadExistingListDetailIds(): Promise<void> {
    if (!this.listRecord) return;

    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);

    const result = await rv.RunView<{ RecordID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID = '${this.listRecord.ID}'`,
      Fields: ['RecordID'],
      ResultType: 'simple'
    }, md.CurrentUser);

    if (result.Success) {
      this.existingListDetailIds = new Set(result.Results.map(r => NormalizeUUID(r.RecordID)));
    }
  }

  onAddRecordsSearchInputEvent(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.onAddRecordsSearchChange(value);
  }

  onAddRecordsSearchChange(value: string): void {
    this.addRecordsSearchFilter = value;
    this.searchSubject.next(value);
  }

  private async searchRecords(searchText: string): Promise<void> {
    if (!this.listRecord || !searchText || searchText.length < 2) {
      this.addableRecords = [];
      return;
    }

    this.addDialogLoading = true;

    const md = this.ProviderToUse;
    const sourceEntityInfo = md.EntityByID(this.listRecord.EntityID);
    if (!sourceEntityInfo) {
      this.addDialogLoading = false;
      return;
    }

    const nameField = sourceEntityInfo.Fields.find(field => field.IsNameField);
    const pkField = sourceEntityInfo.FirstPrimaryKey?.Name || 'ID';

    let filter: string | undefined;
    if (nameField) {
      filter = `${nameField.Name} LIKE '%${searchText}%'`;
    }

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result: RunViewResult = await rv.RunView({
      EntityName: this.listRecord.Entity,
      ExtraFilter: filter,
      MaxRows: 100,
      ResultType: 'simple'
    });

    if (result.Success) {
      this.addableRecords = result.Results.map((record: Record<string, unknown>) => {
        const recordId = String(record[pkField]);
        return {
          ID: recordId,
          Name: nameField ? String(record[nameField.Name]) : recordId,
          isInList: this.existingListDetailIds.has(NormalizeUUID(recordId)),
          isSelected: false
        };
      });
    }

    this.addDialogLoading = false;
    this.cdr.detectChanges();
  }

  toggleRecordSelection(record: AddableRecord): void {
    if (record.isInList) return; // Can't select records already in list
    record.isSelected = !record.isSelected;
  }

  get selectedAddableRecords(): AddableRecord[] {
    return this.addableRecords.filter(r => r.isSelected);
  }

  selectAllAddable(): void {
    this.addableRecords.forEach(r => {
      if (!r.isInList) r.isSelected = true;
    });
  }

  deselectAllAddable(): void {
    this.addableRecords.forEach(r => r.isSelected = false);
  }

  async confirmAddRecords(): Promise<void> {
    const recordsToAdd = this.selectedAddableRecords;
    if (recordsToAdd.length === 0 || !this.listRecord) return;

    this.addDialogSaving = true;
    // Reserve 20% of progress for tg.Submit()
    this.addTotal = recordsToAdd.length;
    this.addProgress = 0;
    const progressPerRecord = 0.8 / recordsToAdd.length; // 80% for individual saves

    const md = this.ProviderToUse;

    // Use transaction group for bulk insert
    const tg = await md.CreateTransactionGroup();

    for (let i = 0; i < recordsToAdd.length; i++) {
      const record = recordsToAdd[i];
      const listDetail = await md.GetEntityObject<MJListDetailEntityExtended>("MJ: List Details", md.CurrentUser);
      listDetail.ListID = this.listRecord.ID;
      listDetail.RecordID = record.ID;
      listDetail.TransactionGroup = tg;
      const result = await listDetail.Save();
      if (!result) {
        LogErrorEx({
          message: listDetail.LatestResult?.CompleteMessage
        });
      }
      // Update progress (0-80%)
      this.addProgress = Math.round((i + 1) * progressPerRecord * this.addTotal);
    }

    // Show 80% complete before submit
    this.addProgress = Math.round(this.addTotal * 0.8);

    const success = await tg.Submit();

    if (success) {
      this.addProgress = this.addTotal;
      this.sharedService.CreateSimpleNotification(
        `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
        'success',
        2500
      );
      // Defer dialog close + grid refresh to the next microtask. See
      // confirmRemoveFromList for the NG0100 background.
      await Promise.resolve();
      this.closeAddRecordsDialog();
      this.refreshGrid();
      this.bumpStatsRefresh();
      this.cdr.detectChanges();
    } else {
      LogError("Error adding records to list");
      this.sharedService.CreateSimpleNotification("Failed to add some records", 'error', 2500);
      this.addDialogSaving = false;
    }
  }

  // ==========================================
  // Add From View Dialog (existing functionality, cleaned up)
  // ==========================================

  async openAddFromViewDialog(): Promise<void> {
    this.showAddFromViewDialog = true;
    this.userViewsToAdd = [];

    if (!this.userViews) {
      await this.loadEntityViews();
    }
  }

  closeAddFromViewDialog(): void {
    this.showAddFromViewDialog = false;
    this.userViewsToAdd = [];
    this.showAddFromViewLoader = false;
    this.addFromViewProgress = 0;
    this.addFromViewTotal = 0;
  }

  private async loadEntityViews(): Promise<void> {
    if (!this.listRecord || !this.listRecord.Entity) return;

    this.showAddFromViewLoader = true;

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const md = this.ProviderToUse;

    const runViewResult = await rv.RunView<MJUserViewEntityExtended>({
      EntityName: "MJ: User Views",
      ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this.listRecord.EntityID}'`,
      ResultType: 'entity_object'
    }, md.CurrentUser);

    if (!runViewResult.Success) {
      LogError(`Error loading User Views for entity ${this.listRecord.Entity}`);
    } else {
      this.userViews = runViewResult.Results;
    }

    this.showAddFromViewLoader = false;
    this.cdr.detectChanges();
  }

  toggleViewSelection(view: MJUserViewEntityExtended): void {
    const index = this.userViewsToAdd.findIndex(v => UUIDsEqual(v.ID, view.ID));
    if (index >= 0) {
      this.userViewsToAdd.splice(index, 1);
    } else {
      this.userViewsToAdd.push(view);
    }
  }

  isViewSelected(view: MJUserViewEntityExtended): boolean {
    return this.userViewsToAdd.some(v => UUIDsEqual(v.ID, view.ID));
  }

  async confirmAddFromView(): Promise<void> {
    if (!this.listRecord || this.userViewsToAdd.length === 0) return;

    this.showAddFromViewLoader = true;
    this.fetchingRecordsToSave = true;
    this.cdr.detectChanges();

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const md = this.ProviderToUse;

    // Collect all unique record IDs from selected views
    const recordIdSet = new Set<string>();

    for (const userView of this.userViewsToAdd) {
      const runViewResult = await rv.RunView({
        ViewID: userView.ID,
        ViewEntity: userView,
        Fields: ["ID"]
      }, md.CurrentUser);

      if (runViewResult.Success) {
        const records = runViewResult.Results as Array<Record<string, string>>;
        records.forEach(r => recordIdSet.add(NormalizeUUID(r.ID)));
      }
    }

    // Filter out records already in the list
    await this.loadExistingListDetailIds();
    const recordsToAdd = [...recordIdSet].filter(id => !this.existingListDetailIds.has(id));

    this.addFromViewTotal = recordsToAdd.length;
    this.addFromViewProgress = 0;
    this.fetchingRecordsToSave = false;
    this.cdr.detectChanges();
    const progressPerRecord = 0.8 / Math.max(recordsToAdd.length, 1); // 80% for individual saves

    if (recordsToAdd.length === 0) {
      this.sharedService.CreateSimpleNotification("All records already in list", 'info', 2500);
      this.showAddFromViewLoader = false;
      this.cdr.detectChanges();
      return;
    }

    LogStatus(`Adding ${recordsToAdd.length} records to list`);

    // Use transaction group for bulk insert
    const tg = await md.CreateTransactionGroup();

    for (let i = 0; i < recordsToAdd.length; i++) {
      const recordID = recordsToAdd[i];
      const listDetail = await md.GetEntityObject<MJListDetailEntityExtended>("MJ: List Details", md.CurrentUser);
      listDetail.ListID = this.listRecord.ID;
      listDetail.RecordID = recordID;
      listDetail.TransactionGroup = tg;
      const result = await listDetail.Save();
      if (!result) {
        LogErrorEx({
          message: listDetail.LatestResult?.CompleteMessage
        });
      }
      // Update progress (0-80%)
      this.addFromViewProgress = Math.round((i + 1) * progressPerRecord * this.addFromViewTotal);
    }

    // Show 80% complete before submit
    this.addFromViewProgress = Math.round(this.addFromViewTotal * 0.8);

    const success = await tg.Submit();

    if (success) {
      this.addFromViewProgress = this.addFromViewTotal;
      this.sharedService.CreateSimpleNotification(
        `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
        'success',
        2500
      );
      // Defer dialog close + grid refresh to the next microtask. See
      // confirmRemoveFromList for the NG0100 background.
      await Promise.resolve();
      this.closeAddFromViewDialog();
      this.refreshGrid();
      this.bumpStatsRefresh();
      this.cdr.detectChanges();
    } else {
      LogError("Error adding records from view to list");
      this.sharedService.CreateSimpleNotification("Failed to add some records", 'error', 2500);
      this.showAddFromViewLoader = false;
    }
  }
}
