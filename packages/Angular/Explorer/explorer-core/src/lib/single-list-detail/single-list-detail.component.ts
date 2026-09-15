import { Component, Input, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { BaseEntity, CompositeKey, EntityInfo, LogError, LogErrorEx, LogStatus, Metadata, RunView, RunViewResult } from '@memberjunction/core';
import { MJListDetailEntity, MJListDetailEntityExtended, MJListEntity, MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import { ListDetailGridComponent, ListGridRowClickedEvent } from '@memberjunction/ng-list-detail-grid';
import { GridToolbarConfig } from '@memberjunction/ng-entity-viewer';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import { CapabilitiesForLevel, type ListCapabilities, type ListDelta, type ListRefreshMode, type SharePermissionLevel } from '@memberjunction/lists-base';
import { ListSharingService, GetRecordDisplayField, IsTextSearchableField, FormatRecordDisplayValue } from '@memberjunction/ng-list-management';
import { ExportService } from '@memberjunction/ng-export-service';
import { Subject, debounceTime, takeUntil } from 'rxjs';
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
export class SingleListDetailComponent extends BaseAngularComponent implements OnInit, OnDestroy {

  @Input() public ListID: string = "";

  /**
   * Bumped on every list-membership mutation so the Usage stats sidebar
   * re-queries member count / growth / last-activity. Without this nudge,
   * those numbers drift from reality until a full page reload because the
   * stats component otherwise only loads on init.
   */
  public StatsRefreshTrigger = 0;

  /** @deprecated Use {@link StatsRefreshTrigger}. */
  public get statsRefreshTrigger() {
    return this.StatsRefreshTrigger;
  }
  /** @deprecated Use {@link StatsRefreshTrigger}. */
  public set statsRefreshTrigger(value) {
    this.StatsRefreshTrigger = value;
  }
  private bumpStatsRefresh(): void { this.StatsRefreshTrigger++; }

  @ViewChild('listDetailGrid') listDetailGrid: ListDetailGridComponent | undefined;

  // List record
  public ListRecord: MJListEntity | null = null;

  /** @deprecated Use {@link ListRecord}. */
  public get listRecord(): MJListEntity | null {
    return this.ListRecord;
  }
  /** @deprecated Use {@link ListRecord}. */
  public set listRecord(value: MJListEntity | null) {
    this.ListRecord = value;
  }
  public ShowLoader: boolean = false;

  /** @deprecated Use {@link ShowLoader}. */
  public get showLoader(): boolean {
    return this.ShowLoader;
  }
  /** @deprecated Use {@link ShowLoader}. */
  public set showLoader(value: boolean) {
    this.ShowLoader = value;
  }

  // Permission-level gating (Phase 2.8). Resolved lazily after the list
  // loads. Capabilities is exposed to the template for `@if` gating; the
  // server-side enforcement remains the source of truth — these flags
  // are a UX convenience so users don't see buttons they'll be rejected on.
  public Capabilities: ListCapabilities = CapabilitiesForLevel(null);

  /** @deprecated Use {@link Capabilities}. */
  public get capabilities(): ListCapabilities {
    return this.Capabilities;
  }
  /** @deprecated Use {@link Capabilities}. */
  public set capabilities(value: ListCapabilities) {
    this.Capabilities = value;
  }
  public CurrentLevel: SharePermissionLevel | null = null;

  /** @deprecated Use {@link CurrentLevel}. */
  public get currentLevel(): SharePermissionLevel | null {
    return this.CurrentLevel;
  }
  /** @deprecated Use {@link CurrentLevel}. */
  public set currentLevel(value: SharePermissionLevel | null) {
    this.CurrentLevel = value;
  }

  // Lineage / refresh-from-source state. `sourceViewName` is loaded after
  // listRecord so the lineage badge can show a friendly view name; the
  // refresh-mode default falls back to the list's RefreshMode field but
  // can be overridden per-user via localStorage (see `loadLastUsedMode`).
  public SourceViewName: string | null = null;

  /** @deprecated Use {@link SourceViewName}. */
  public get sourceViewName(): string | null {
    return this.SourceViewName;
  }
  /** @deprecated Use {@link SourceViewName}. */
  public set sourceViewName(value: string | null) {
    this.SourceViewName = value;
  }

  // Bulk-edit (Phase 5.2). Status, Move, Copy, Remove. Move flows through
  // the delta-confirm dialog because it produces drops on the source list.
  public BulkStatus: 'Active' | 'Complete' | 'Disabled' | 'Pending' | 'Rejected' | '' = '';

  /** @deprecated Use {@link BulkStatus}. */
  public get bulkStatus(): 'Active' | 'Complete' | 'Disabled' | 'Pending' | 'Rejected' | '' {
    return this.BulkStatus;
  }
  /** @deprecated Use {@link BulkStatus}. */
  public set bulkStatus(value: 'Active' | 'Complete' | 'Disabled' | 'Pending' | 'Rejected' | '') {
    this.BulkStatus = value;
  }
  public IsApplyingBulkStatus = false;

  /** @deprecated Use {@link IsApplyingBulkStatus}. */
  public get isApplyingBulkStatus() {
    return this.IsApplyingBulkStatus;
  }
  /** @deprecated Use {@link IsApplyingBulkStatus}. */
  public set isApplyingBulkStatus(value) {
    this.IsApplyingBulkStatus = value;
  }

  // Move / Copy state (mockups 23, 24). The picker dialog lists candidate
  // target lists scoped to the same entity. We load it lazily on first
  // open and cache for the session — opening the picker twice in a row
  // doesn't re-fetch unless the user explicitly hits "Refresh".
  public ShowMoveCopyDialog = false;

  /** @deprecated Use {@link ShowMoveCopyDialog}. */
  public get showMoveCopyDialog() {
    return this.ShowMoveCopyDialog;
  }
  /** @deprecated Use {@link ShowMoveCopyDialog}. */
  public set showMoveCopyDialog(value) {
    this.ShowMoveCopyDialog = value;
  }
  public MoveCopyMode: 'move' | 'copy' = 'move';

  /** @deprecated Use {@link MoveCopyMode}. */
  public get moveCopyMode(): 'move' | 'copy' {
    return this.MoveCopyMode;
  }
  /** @deprecated Use {@link MoveCopyMode}. */
  public set moveCopyMode(value: 'move' | 'copy') {
    this.MoveCopyMode = value;
  }
  public MoveCopyTargetSearch = '';

  /** @deprecated Use {@link MoveCopyTargetSearch}. */
  public get moveCopyTargetSearch() {
    return this.MoveCopyTargetSearch;
  }
  /** @deprecated Use {@link MoveCopyTargetSearch}. */
  public set moveCopyTargetSearch(value) {
    this.MoveCopyTargetSearch = value;
  }
  public MoveCopyTargetCandidates: MJListEntity[] = [];

  /** @deprecated Use {@link MoveCopyTargetCandidates}. */
  public get moveCopyTargetCandidates(): MJListEntity[] {
    return this.MoveCopyTargetCandidates;
  }
  /** @deprecated Use {@link MoveCopyTargetCandidates}. */
  public set moveCopyTargetCandidates(value: MJListEntity[]) {
    this.MoveCopyTargetCandidates = value;
  }
  public MoveCopyTargetCandidatesLoading = false;

  /** @deprecated Use {@link MoveCopyTargetCandidatesLoading}. */
  public get moveCopyTargetCandidatesLoading() {
    return this.MoveCopyTargetCandidatesLoading;
  }
  /** @deprecated Use {@link MoveCopyTargetCandidatesLoading}. */
  public set moveCopyTargetCandidatesLoading(value) {
    this.MoveCopyTargetCandidatesLoading = value;
  }
  public MoveCopySelectedTarget: MJListEntity | null = null;

  /** @deprecated Use {@link MoveCopySelectedTarget}. */
  public get moveCopySelectedTarget(): MJListEntity | null {
    return this.MoveCopySelectedTarget;
  }
  /** @deprecated Use {@link MoveCopySelectedTarget}. */
  public set moveCopySelectedTarget(value: MJListEntity | null) {
    this.MoveCopySelectedTarget = value;
  }
  public IsApplyingMoveCopy = false;

  /** @deprecated Use {@link IsApplyingMoveCopy}. */
  public get isApplyingMoveCopy() {
    return this.IsApplyingMoveCopy;
  }
  /** @deprecated Use {@link IsApplyingMoveCopy}. */
  public set isApplyingMoveCopy(value) {
    this.IsApplyingMoveCopy = value;
  }
  public MoveCopyProgress = 0;

  /** @deprecated Use {@link MoveCopyProgress}. */
  public get moveCopyProgress() {
    return this.MoveCopyProgress;
  }
  /** @deprecated Use {@link MoveCopyProgress}. */
  public set moveCopyProgress(value) {
    this.MoveCopyProgress = value;
  }
  public MoveCopyTotal = 0;

  /** @deprecated Use {@link MoveCopyTotal}. */
  public get moveCopyTotal() {
    return this.MoveCopyTotal;
  }
  /** @deprecated Use {@link MoveCopyTotal}. */
  public set moveCopyTotal(value) {
    this.MoveCopyTotal = value;
  }

  // Move delta-confirm. Built locally from the in-hand RecordIDs — no
  // server round-trip needed since we already know exactly what will be
  // added to the target and removed from the source. The drop-guard is
  // enforced at confirm time (mode='move' + ack checkbox).
  public MoveDeltaConfirmVisible = false;

  /** @deprecated Use {@link MoveDeltaConfirmVisible}. */
  public get moveDeltaConfirmVisible() {
    return this.MoveDeltaConfirmVisible;
  }
  /** @deprecated Use {@link MoveDeltaConfirmVisible}. */
  public set moveDeltaConfirmVisible(value) {
    this.MoveDeltaConfirmVisible = value;
  }
  public MoveDelta: ListDelta | null = null;

  /** @deprecated Use {@link MoveDelta}. */
  public get moveDelta(): ListDelta | null {
    return this.MoveDelta;
  }
  /** @deprecated Use {@link MoveDelta}. */
  public set moveDelta(value: ListDelta | null) {
    this.MoveDelta = value;
  }

  // Export picker (Phase 5.1, mockup 26). Opens before any export; lets
  // the user pick format + which entity fields to include. Fields are
  // resolved from EntityInfo on the loaded provider — no separate fetch.
  public ShowExportDialog = false;

  /** @deprecated Use {@link ShowExportDialog}. */
  public get showExportDialog() {
    return this.ShowExportDialog;
  }
  /** @deprecated Use {@link ShowExportDialog}. */
  public set showExportDialog(value) {
    this.ShowExportDialog = value;
  }
  public ExportFormat: 'excel' | 'csv' | 'json' = 'excel';

  /** @deprecated Use {@link ExportFormat}. */
  public get exportFormat(): 'excel' | 'csv' | 'json' {
    return this.ExportFormat;
  }
  /** @deprecated Use {@link ExportFormat}. */
  public set exportFormat(value: 'excel' | 'csv' | 'json') {
    this.ExportFormat = value;
  }
  public ExportFields: Array<{ Name: string; DisplayName: string; Selected: boolean }> = [];

  /** @deprecated Use {@link ExportFields}. */
  public get exportFields(): Array<{ Name: string; DisplayName: string; Selected: boolean }> {
    return this.ExportFields;
  }
  /** @deprecated Use {@link ExportFields}. */
  public set exportFields(value: Array<{ Name: string; DisplayName: string; Selected: boolean }>) {
    this.ExportFields = value;
  }
  public ExportRecordCount = 0;

  /** @deprecated Use {@link ExportRecordCount}. */
  public get exportRecordCount() {
    return this.ExportRecordCount;
  }
  /** @deprecated Use {@link ExportRecordCount}. */
  public set exportRecordCount(value) {
    this.ExportRecordCount = value;
  }
  public IsExporting = false;

  /** @deprecated Use {@link IsExporting}. */
  public get isExporting() {
    return this.IsExporting;
  }
  /** @deprecated Use {@link IsExporting}. */
  public set isExporting(value) {
    this.IsExporting = value;
  }
  public RefreshMode: ListRefreshMode = 'Additive';

  /** @deprecated Use {@link RefreshMode}. */
  public get refreshMode(): ListRefreshMode {
    return this.RefreshMode;
  }
  /** @deprecated Use {@link RefreshMode}. */
  public set refreshMode(value: ListRefreshMode) {
    this.RefreshMode = value;
  }
  public IsPreviewingRefresh = false;

  /** @deprecated Use {@link IsPreviewingRefresh}. */
  public get isPreviewingRefresh() {
    return this.IsPreviewingRefresh;
  }
  /** @deprecated Use {@link IsPreviewingRefresh}. */
  public set isPreviewingRefresh(value) {
    this.IsPreviewingRefresh = value;
  }
  public IsApplyingRefresh = false;

  /** @deprecated Use {@link IsApplyingRefresh}. */
  public get isApplyingRefresh() {
    return this.IsApplyingRefresh;
  }
  /** @deprecated Use {@link IsApplyingRefresh}. */
  public set isApplyingRefresh(value) {
    this.IsApplyingRefresh = value;
  }
  public RefreshDelta: ListDelta | null = null;

  /** @deprecated Use {@link RefreshDelta}. */
  public get refreshDelta(): ListDelta | null {
    return this.RefreshDelta;
  }
  /** @deprecated Use {@link RefreshDelta}. */
  public set refreshDelta(value: ListDelta | null) {
    this.RefreshDelta = value;
  }
  public RefreshConfirmVisible = false;

  /** @deprecated Use {@link RefreshConfirmVisible}. */
  public get refreshConfirmVisible() {
    return this.RefreshConfirmVisible;
  }
  /** @deprecated Use {@link RefreshConfirmVisible}. */
  public set refreshConfirmVisible(value) {
    this.RefreshConfirmVisible = value;
  }

  // Grid state
  public SelectedKeys: string[] = [];

  /** @deprecated Use {@link SelectedKeys}. */
  public get selectedKeys(): string[] {
    return this.SelectedKeys;
  }
  /** @deprecated Use {@link SelectedKeys}. */
  public set selectedKeys(value: string[]) {
    this.SelectedKeys = value;
  }
  public RowCount: number = 0;

  /** @deprecated Use {@link RowCount}. */
  public get rowCount(): number {
    return this.RowCount;
  }
  /** @deprecated Use {@link RowCount}. */
  public set rowCount(value: number) {
    this.RowCount = value;
  }

  // Toolbar config - hide EDG toolbar, we'll use our own
  public GridToolbarConfig: GridToolbarConfig = {
    showSearch: false,
    showRefresh: false,
    showAdd: false,
    showDelete: false,
    showExport: false,
    showRowCount: false,
    showSelectionCount: false
  };

  /** @deprecated Use {@link GridToolbarConfig}. */
  public get gridToolbarConfig(): GridToolbarConfig {
    return this.GridToolbarConfig;
  }
  /** @deprecated Use {@link GridToolbarConfig}. */
  public set gridToolbarConfig(value: GridToolbarConfig) {
    this.GridToolbarConfig = value;
  }

  // Remove from list dialog
  public ShowRemoveDialog: boolean = false;

  /** @deprecated Use {@link ShowRemoveDialog}. */
  public get showRemoveDialog(): boolean {
    return this.ShowRemoveDialog;
  }
  /** @deprecated Use {@link ShowRemoveDialog}. */
  public set showRemoveDialog(value: boolean) {
    this.ShowRemoveDialog = value;
  }
  public IsRemoving: boolean = false;

  /** @deprecated Use {@link IsRemoving}. */
  public get isRemoving(): boolean {
    return this.IsRemoving;
  }
  /** @deprecated Use {@link IsRemoving}. */
  public set isRemoving(value: boolean) {
    this.IsRemoving = value;
  }
  public RemoveProgress: number = 0;

  /** @deprecated Use {@link RemoveProgress}. */
  public get removeProgress(): number {
    return this.RemoveProgress;
  }
  /** @deprecated Use {@link RemoveProgress}. */
  public set removeProgress(value: number) {
    this.RemoveProgress = value;
  }
  public RemoveTotal: number = 0;

  /** @deprecated Use {@link RemoveTotal}. */
  public get removeTotal(): number {
    return this.RemoveTotal;
  }
  /** @deprecated Use {@link RemoveTotal}. */
  public set removeTotal(value: number) {
    this.RemoveTotal = value;
  }

  // Add records dialog
  public ShowAddRecordsDialog: boolean = false;

  /** @deprecated Use {@link ShowAddRecordsDialog}. */
  public get showAddRecordsDialog(): boolean {
    return this.ShowAddRecordsDialog;
  }
  /** @deprecated Use {@link ShowAddRecordsDialog}. */
  public set showAddRecordsDialog(value: boolean) {
    this.ShowAddRecordsDialog = value;
  }
  public AddDialogLoading: boolean = false;

  /** @deprecated Use {@link AddDialogLoading}. */
  public get addDialogLoading(): boolean {
    return this.AddDialogLoading;
  }
  /** @deprecated Use {@link AddDialogLoading}. */
  public set addDialogLoading(value: boolean) {
    this.AddDialogLoading = value;
  }
  public AddDialogSaving: boolean = false;

  /** @deprecated Use {@link AddDialogSaving}. */
  public get addDialogSaving(): boolean {
    return this.AddDialogSaving;
  }
  /** @deprecated Use {@link AddDialogSaving}. */
  public set addDialogSaving(value: boolean) {
    this.AddDialogSaving = value;
  }
  public AddableRecords: AddableRecord[] = [];

  /** @deprecated Use {@link AddableRecords}. */
  public get addableRecords(): AddableRecord[] {
    return this.AddableRecords;
  }
  /** @deprecated Use {@link AddableRecords}. */
  public set addableRecords(value: AddableRecord[]) {
    this.AddableRecords = value;
  }
  public AddRecordsSearchFilter: string = "";

  /** @deprecated Use {@link AddRecordsSearchFilter}. */
  public get addRecordsSearchFilter(): string {
    return this.AddRecordsSearchFilter;
  }
  /** @deprecated Use {@link AddRecordsSearchFilter}. */
  public set addRecordsSearchFilter(value: string) {
    this.AddRecordsSearchFilter = value;
  }

  /** Empty-state title shown when an add-records search returns no matches. */
  public get AddRecordsNoMatchTitle(): string {
    return `No records found matching "${this.AddRecordsSearchFilter}"`;
  }

  public ExistingListDetailIds: Set<string> = new Set();

  /** @deprecated Use {@link ExistingListDetailIds}. */
  public get existingListDetailIds(): Set<string> {
    return this.ExistingListDetailIds;
  }
  /** @deprecated Use {@link ExistingListDetailIds}. */
  public set existingListDetailIds(value: Set<string>) {
    this.ExistingListDetailIds = value;
  }
  public AddProgress: number = 0;

  /** @deprecated Use {@link AddProgress}. */
  public get addProgress(): number {
    return this.AddProgress;
  }
  /** @deprecated Use {@link AddProgress}. */
  public set addProgress(value: number) {
    this.AddProgress = value;
  }
  public AddTotal: number = 0;

  /** @deprecated Use {@link AddTotal}. */
  public get addTotal(): number {
    return this.AddTotal;
  }
  /** @deprecated Use {@link AddTotal}. */
  public set addTotal(value: number) {
    this.AddTotal = value;
  }
  private searchSubject: Subject<string> = new Subject();
  private destroy$ = new Subject<void>();

  // Add from view dialog (existing)
  public ShowAddFromViewDialog: boolean = false;

  /** @deprecated Use {@link ShowAddFromViewDialog}. */
  public get showAddFromViewDialog(): boolean {
    return this.ShowAddFromViewDialog;
  }
  /** @deprecated Use {@link ShowAddFromViewDialog}. */
  public set showAddFromViewDialog(value: boolean) {
    this.ShowAddFromViewDialog = value;
  }
  public ShowAddFromViewLoader: boolean = false;

  /** @deprecated Use {@link ShowAddFromViewLoader}. */
  public get showAddFromViewLoader(): boolean {
    return this.ShowAddFromViewLoader;
  }
  /** @deprecated Use {@link ShowAddFromViewLoader}. */
  public set showAddFromViewLoader(value: boolean) {
    this.ShowAddFromViewLoader = value;
  }
  public UserViews: MJUserViewEntityExtended[] | null = null;

  /** @deprecated Use {@link UserViews}. */
  public get userViews(): MJUserViewEntityExtended[] | null {
    return this.UserViews;
  }
  /** @deprecated Use {@link UserViews}. */
  public set userViews(value: MJUserViewEntityExtended[] | null) {
    this.UserViews = value;
  }
  public UserViewsToAdd: MJUserViewEntityExtended[] = [];

  /** @deprecated Use {@link UserViewsToAdd}. */
  public get userViewsToAdd(): MJUserViewEntityExtended[] {
    return this.UserViewsToAdd;
  }
  /** @deprecated Use {@link UserViewsToAdd}. */
  public set userViewsToAdd(value: MJUserViewEntityExtended[]) {
    this.UserViewsToAdd = value;
  }
  /**
   * Normalized-UUID set of the IDs in {@link userViewsToAdd}, kept in sync with that
   * array. Lets {@link isViewSelected} (bound per-row in the dialog's @for, ~2x/row)
   * do an O(1) lookup instead of scanning the array with UUIDsEqual on every check.
   */
  private userViewsToAddIds: Set<string> = new Set<string>();
  public AddFromViewProgress: number = 0;

  /** @deprecated Use {@link AddFromViewProgress}. */
  public get addFromViewProgress(): number {
    return this.AddFromViewProgress;
  }
  /** @deprecated Use {@link AddFromViewProgress}. */
  public set addFromViewProgress(value: number) {
    this.AddFromViewProgress = value;
  }
  public AddFromViewTotal: number = 0;

  /** @deprecated Use {@link AddFromViewTotal}. */
  public get addFromViewTotal(): number {
    return this.AddFromViewTotal;
  }
  /** @deprecated Use {@link AddFromViewTotal}. */
  public set addFromViewTotal(value: number) {
    this.AddFromViewTotal = value;
  }
  /**
   * Stored percent (0–100) for the progress bar. Backed instead of computed
   * via getter because the original getter recomputed on every Angular CD
   * read and the async save loop mutated addFromViewProgress between the
   * initial check and dev-mode re-check — producing NG0100
   * ExpressionChangedAfterItHasBeenCheckedError floods in the console.
   * Updated via setAddFromViewProgress(...) at controlled points.
   */
  public AddFromViewProgressPercent: number = 0;

  /** @deprecated Use {@link AddFromViewProgressPercent}. */
  public get addFromViewProgressPercent(): number {
    return this.AddFromViewProgressPercent;
  }
  /** @deprecated Use {@link AddFromViewProgressPercent}. */
  public set addFromViewProgressPercent(value: number) {
    this.AddFromViewProgressPercent = value;
  }
  public FetchingRecordsToSave: boolean = false;

  /** @deprecated Use {@link FetchingRecordsToSave}. */
  public get fetchingRecordsToSave(): boolean {
    return this.FetchingRecordsToSave;
  }
  /** @deprecated Use {@link FetchingRecordsToSave}. */
  public set fetchingRecordsToSave(value: boolean) {
    this.FetchingRecordsToSave = value;
  }

  // Dropdown button toggle state
  public ShowAddDropdown: boolean = false;

  /** @deprecated Use {@link ShowAddDropdown}. */
  public get showAddDropdown(): boolean {
    return this.ShowAddDropdown;
  }
  /** @deprecated Use {@link ShowAddDropdown}. */
  public set showAddDropdown(value: boolean) {
    this.ShowAddDropdown = value;
  }

  // Dropdown menu options
  public AddOptions: NewItemOption[] = [
    {
      Text: 'Add Records',
      Description: 'Search and add specific records to this list',
      Icon: 'search',
      Action: () => this.OpenAddRecordsDialog()
    },
    {
      Text: 'Add From View',
      Description: 'Add all records from a saved view',
      Icon: 'folder',
      Action: () => this.OpenAddFromViewDialog()
    }
  ];

  /** @deprecated Use {@link AddOptions}. */
  public get addOptions(): NewItemOption[] {
    return this.AddOptions;
  }
  /** @deprecated Use {@link AddOptions}. */
  public set addOptions(value: NewItemOption[]) {
    this.AddOptions = value;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.ShowAddDropdown) {
      const target = event.target as HTMLElement;
      if (!this.elementRef.nativeElement.querySelector('.add-dropdown-wrapper')?.contains(target)) {
        this.ShowAddDropdown = false;
      }
    }
  }

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private exportService: ExportService,
    private listSharingService: ListSharingService,
  ) {
    super();
    // Debounce search input
    this.searchSubject
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe((searchText) => this.searchRecords(searchText));
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

    this.ShowLoader = true;

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
        this.ListRecord = null;
      } else {
        this.ListRecord = list;
        await this.loadLineageContext();
        await this.loadCapabilities();
      }
    } catch (error) {
      LogError("Error loading list", undefined, error);
      this.ListRecord = null;
    } finally {
      this.ShowLoader = false;
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
    if (!this.ListRecord?.SourceViewID) {
      this.SourceViewName = null;
      return;
    }
    this.RefreshMode = this.loadLastUsedMode() ?? this.ListRecord.RefreshMode;
    try {
      const view = await this.ProviderToUse.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views');
      const loaded = await view.Load(this.ListRecord.SourceViewID);
      this.SourceViewName = loaded ? view.Name : null;
    } catch (e) {
      LogError(`Failed to load source view name for list ${this.ListID}: ${e}`);
      this.SourceViewName = null;
    }
  }

  /**
   * Resolve the caller's permission level for this list (Owner / Edit /
   * View / null) and derive UI capability flags. Best-effort — if the
   * resolve fails we conservatively default to no-mutation (Viewer-like)
   * so we don't accidentally surface buttons the server will reject.
   */
  private async loadCapabilities(): Promise<void> {
    if (!this.ListRecord) {
      this.Capabilities = CapabilitiesForLevel(null);
      this.CurrentLevel = null;
      return;
    }
    try {
      const currentUserId = this.ProviderToUse.CurrentUser?.ID;
      if (!currentUserId) {
        this.Capabilities = CapabilitiesForLevel('View');
        this.CurrentLevel = 'View';
        return;
      }
      // Fast path: the list's UserID is its owner. Owners always have full
      // capabilities and don't carry a Resource Permission row (ownership
      // is implicit), so the permission-row lookup below would return null
      // and incorrectly hide all edit/share/delete buttons. Mirrors the
      // owner short-circuit in the server-side ListSharing.ResolveEffectivePermission.
      if (UUIDsEqual(this.ListRecord.UserID, currentUserId)) {
        this.CurrentLevel = 'Owner';
        this.Capabilities = CapabilitiesForLevel('Owner');
        return;
      }
      // Non-owner: resolve via ListSharingService (GraphQL). Never instantiate
      // the server-side `ListSharing` class from a browser bundle.
      const level = (await this.listSharingService.getUserPermissionLevel(this.ListRecord.ID, currentUserId)) as SharePermissionLevel | null;
      this.CurrentLevel = level;
      this.Capabilities = CapabilitiesForLevel(level);
    } catch (e) {
      LogError(`loadCapabilities failed: ${e instanceof Error ? e.message : String(e)}`);
      this.Capabilities = CapabilitiesForLevel('View');
      this.CurrentLevel = 'View';
    }
  }

  public get HasLineage(): boolean {
    return !!this.ListRecord?.SourceViewID;
  }

  /** @deprecated Use {@link HasLineage}. */
  public get hasLineage(): boolean {
    return this.HasLineage;
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
  public async OnRefreshFromSource(): Promise<void> {
    if (!this.HasLineage || this.IsPreviewingRefresh) return;
    this.IsPreviewingRefresh = true;
    this.RefreshDelta = null;
    this.cdr.detectChanges();
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const client = new GraphQLListsClient(provider);
      const delta = await client.PreviewListDelta({
        Target: this.ListID,
        Source: { kind: 'view', viewId: this.ListRecord!.SourceViewID! },
        Mode: this.RefreshMode,
      });
      this.RefreshDelta = delta;
      this.RefreshConfirmVisible = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Refresh preview failed: ${message}`, 'error', 5000);
    } finally {
      this.IsPreviewingRefresh = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link OnRefreshFromSource}. */
  public async onRefreshFromSource(): Promise<void> {
    return this.OnRefreshFromSource();
  }

  public OnRefreshConfirmCancel(): void {
    this.RefreshConfirmVisible = false;
    this.RefreshDelta = null;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnRefreshConfirmCancel}. */
  public onRefreshConfirmCancel(): void {
    return this.OnRefreshConfirmCancel();
  }

  public async OnRefreshConfirmCommit(deltaToken: string): Promise<void> {
    if (!this.RefreshDelta) return;
    this.IsApplyingRefresh = true;
    this.cdr.detectChanges();
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const client = new GraphQLListsClient(provider);
      const result = await client.ApplyListDelta({
        Delta: { ...this.RefreshDelta, DeltaToken: deltaToken },
        ConfirmDrops: (this.RefreshDelta.Counts.Remove ?? 0) > 0,
      });
      if (result.Success) {
        this.saveLastUsedMode(this.RefreshMode);
        this.RefreshConfirmVisible = false;
        this.RefreshDelta = null;
        this.sharedService.CreateSimpleNotification(
          `Refresh applied: +${result.Counts?.Added ?? 0} / -${result.Counts?.Removed ?? 0}`,
          'success',
          3000,
        );
        // Reload list (for LastRefreshedAt) + grid in parallel.
        await this.loadListRecord();
        this.RefreshGrid();
        this.bumpStatsRefresh();
      } else {
        this.sharedService.CreateSimpleNotification(`Refresh failed: ${result.Message}`, 'error', 5000);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Refresh failed: ${message}`, 'error', 5000);
    } finally {
      this.IsApplyingRefresh = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link OnRefreshConfirmCommit}. */
  public async onRefreshConfirmCommit(deltaToken: string): Promise<void> {
    return this.OnRefreshConfirmCommit(deltaToken);
  }

  public OnRefreshModeChange(mode: ListRefreshMode): void {
    this.RefreshMode = mode;
  }

  /** @deprecated Use {@link OnRefreshModeChange}. */
  public onRefreshModeChange(mode: ListRefreshMode): void {
    return this.OnRefreshModeChange(mode);
  }

  // ==========================================
  // Grid Event Handlers
  // ==========================================

  OnRowClicked(_event: ListGridRowClickedEvent): void {
    // Selection is handled by the grid
  }

  /** @deprecated Use {@link OnRowClicked}. */
  onRowClicked(_event: ListGridRowClickedEvent): void {
    return this.OnRowClicked(_event);
  }

  OnRowDoubleClicked(_event: ListGridRowClickedEvent): void {
    // Navigation is handled by mj-list-detail-grid
  }

  /** @deprecated Use {@link OnRowDoubleClicked}. */
  onRowDoubleClicked(_event: ListGridRowClickedEvent): void {
    return this.OnRowDoubleClicked(_event);
  }

  OnSelectionChange(keys: string[]): void {
    this.SelectedKeys = keys;
  }

  /** @deprecated Use {@link OnSelectionChange}. */
  onSelectionChange(keys: string[]): void {
    return this.OnSelectionChange(keys);
  }

  OnDataLoaded(event: { totalCount: number }): void {
    this.RowCount = event.totalCount;
  }

  /** @deprecated Use {@link OnDataLoaded}. */
  onDataLoaded(event: { totalCount: number }): void {
    return this.OnDataLoaded(event);
  }

  RefreshGrid(): void {
    if (this.listDetailGrid) {
      this.listDetailGrid.refresh();
    }
  }

  /** @deprecated Use {@link RefreshGrid}. */
  refreshGrid(): void {
    return this.RefreshGrid();
  }

  // ==========================================
  // Toolbar Actions
  // ==========================================

  // ==========================================
  // Progress Percentage Getters
  // ==========================================

  get RemoveProgressPercent(): number {
    return this.RemoveTotal > 0 ? Math.round((this.RemoveProgress / this.RemoveTotal) * 100) : 0;
  }

  /** @deprecated Use {@link RemoveProgressPercent}. */
  get removeProgressPercent(): number {
    return this.RemoveProgressPercent;
  }

  get AddProgressPercent(): number {
    return this.AddTotal > 0 ? Math.round((this.AddProgress / this.AddTotal) * 100) : 0;
  }

  /** @deprecated Use {@link AddProgressPercent}. */
  get addProgressPercent(): number {
    return this.AddProgressPercent;
  }

  /** Update progress + recompute the stored percent atomically. Call this
   *  from inside the save loop so the bound value is set in lockstep with
   *  the underlying counter (avoids NG0100). */
  private setAddFromViewProgress(progress: number): void {
    this.AddFromViewProgress = progress;
    this.AddFromViewProgressPercent = this.AddFromViewTotal > 0
      ? Math.round((progress / this.AddFromViewTotal) * 100)
      : 0;
  }

  OnRefreshClick(): void {
    this.RefreshGrid();
  }

  /** @deprecated Use {@link OnRefreshClick}. */
  onRefreshClick(): void {
    return this.OnRefreshClick();
  }

  OnExportClick(): void {
    this.OpenExportDialog();
  }

  /** @deprecated Use {@link OnExportClick}. */
  onExportClick(): void {
    return this.OnExportClick();
  }

  /**
   * Open the format + column picker (mockup 26). Resolves the candidate
   * field list from EntityInfo on the loaded provider — no extra
   * RunView. Default selection is every non-virtual entity field, which
   * matches what the underlying grid's "export all" path produced.
   */
  public OpenExportDialog(): void {
    if (!this.ListRecord) {
      this.sharedService.CreateSimpleNotification('Load a list first before exporting.', 'info', 3000);
      return;
    }
    const md = this.ProviderToUse;
    const entityInfo = md.EntityByID(this.ListRecord.EntityID);
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
    this.ExportFields = entityInfo.Fields
      .filter((f) => f.IsVirtual !== true)
      .map((f) => ({
        Name: f.Name,
        DisplayName: f.DisplayName || f.Name,
        Selected: true,
      }));
    this.ExportRecordCount = this.RowCount;
    this.ExportFormat = 'excel';
    this.ShowExportDialog = true;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OpenExportDialog}. */
  public openExportDialog(): void {
    return this.OpenExportDialog();
  }

  public CloseExportDialog(): void {
    this.ShowExportDialog = false;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link CloseExportDialog}. */
  public closeExportDialog(): void {
    return this.CloseExportDialog();
  }

  public SelectAllExportFields(): void {
    for (const f of this.ExportFields) f.Selected = true;
  }

  /** @deprecated Use {@link SelectAllExportFields}. */
  public selectAllExportFields(): void {
    return this.SelectAllExportFields();
  }
  public SelectNoneExportFields(): void {
    for (const f of this.ExportFields) f.Selected = false;
  }

  /** @deprecated Use {@link SelectNoneExportFields}. */
  public selectNoneExportFields(): void {
    return this.SelectNoneExportFields();
  }
  public get SelectedExportFieldCount(): number {
    return this.ExportFields.filter((f) => f.Selected).length;
  }

  /** @deprecated Use {@link SelectedExportFieldCount}. */
  public get selectedExportFieldCount(): number {
    return this.SelectedExportFieldCount;
  }

  /**
   * Run the export with the user's chosen format + columns. Resolves
   * the list's member RecordIDs from the in-memory grid when possible
   * (avoids an extra RunView), then bulk-loads the underlying entity
   * rows restricted to the chosen Fields. Output is projected to
   * exactly the user's selected columns + ordering.
   */
  public async ExecuteExport(): Promise<void> {
    if (!this.ListRecord) return;
    const selectedFields = this.ExportFields.filter((f) => f.Selected).map((f) => f.Name);
    if (selectedFields.length === 0) return;

    this.IsExporting = true;
    this.cdr.detectChanges();
    try {
      const md = this.ProviderToUse;
      const entityInfo = md.EntityByID(this.ListRecord.EntityID)!;

      // Cheap emptiness check before doing any row work
      const rv = RunView.FromMetadataProvider(md);
      const countResult = await rv.RunView({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID='${this.ListRecord.ID}'`,
        ResultType: 'count_only',
      });
      if (countResult.Success && countResult.TotalRowCount === 0) {
        this.sharedService.CreateSimpleNotification(
          'List is empty — nothing to export.', 'info', 3000,
        );
        this.ShowExportDialog = false;
        return;
      }

      // Pull underlying entity rows restricted to the chosen fields, with
      // membership filtered by buildListMemberFilter (server-side subquery
      // for a single-column key). Always include the key column(s) so the
      // projection round-trips cleanly.
      const fieldsForQuery = Array.from(new Set([...entityInfo.PrimaryKeys.map((pk) => pk.Name), ...selectedFields]));
      const rowResult = await rv.RunView<Record<string, unknown>>({
        EntityName: entityInfo.Name,
        ExtraFilter: await this.buildListMemberFilter(entityInfo, this.ListRecord.ID, rv),
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
      const safeName = (this.ListRecord.Name || 'list').replace(/[^a-z0-9_-]+/gi, '_');
      const ext = this.ExportFormat === 'excel' ? 'xlsx' : this.ExportFormat;
      const fileName = `${safeName}-${dateStamp}.${ext}`;
      const exportResult = this.ExportFormat === 'excel'
        ? await this.exportService.toExcel(rows, { fileName, includeHeaders: true })
        : this.ExportFormat === 'csv'
          ? await this.exportService.toCSV(rows, { fileName, includeHeaders: true })
          : await this.exportService.toJSON(rows, { fileName });

      if (exportResult.success) {
        this.exportService.downloadResult(exportResult);
        this.sharedService.CreateSimpleNotification(
          `Exported ${rows.length} record(s)`, 'success', 3000,
        );
        this.ShowExportDialog = false;
      } else {
        this.sharedService.CreateSimpleNotification('Export failed', 'error', 5000);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Export error: ${message}`, 'error', 5000);
    } finally {
      this.IsExporting = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link ExecuteExport}. */
  public async executeExport(): Promise<void> {
    return this.ExecuteExport();
  }

  ToggleAddDropdown(): void {
    this.ShowAddDropdown = !this.ShowAddDropdown;
  }

  /** @deprecated Use {@link ToggleAddDropdown}. */
  toggleAddDropdown(): void {
    return this.ToggleAddDropdown();
  }

  OnDropdownItemClick(item: NewItemOption): void {
    this.ShowAddDropdown = false;
    if (item.Action) {
      item.Action();
    }
  }

  /** @deprecated Use {@link OnDropdownItemClick}. */
  onDropdownItemClick(item: NewItemOption): void {
    return this.OnDropdownItemClick(item);
  }

  // ==========================================
  /**
   * Predicate selecting the underlying entity rows that are members of a list. For a
   * single-column key membership is filtered SERVER-SIDE via a subquery on the List Details
   * view (RecordID holds the raw key value), so no member id round-trips to the client and no
   * IN(...) clause breaks on a large list. A composite key stores RecordID as "F1|v1||F2|v2",
   * which no single column can be compared to, so the member ids are fetched and each expanded
   * to its full key predicate.
   */
  private async buildListMemberFilter(entityInfo: EntityInfo, listId: string, rv: RunView): Promise<string> {
    if (entityInfo.PrimaryKeys.length === 1) {
      const listDetailInfo = this.ProviderToUse.EntityByName('MJ: List Details');
      const listDetailsView = `${listDetailInfo?.SchemaName ?? '__mj'}.${listDetailInfo?.BaseView ?? 'vwListDetails'}`;
      return `${entityInfo.FirstPrimaryKey.Name} IN (SELECT RecordID FROM ${listDetailsView} WHERE ListID='${listId}')`; // first-pk-ok: guarded by PrimaryKeys.length === 1 above
    }
    const members = await rv.RunView<{ RecordID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID='${listId}'`,
      Fields: ['RecordID'],
      ResultType: 'simple',
    });
    const clauses = (members.Results ?? []).map((m) => `(${CompositeKey.FromURLSegment(entityInfo, m.RecordID).ToWhereClause()})`);
    return clauses.length > 0 ? clauses.join(' OR ') : '1=0';
  }

  /**
   * Apply the chosen status to all selected list-detail rows. Re-uses
   * the existing extract-record-id-from-composite-key logic to map
   * `selectedKeys` to the actual `MJ: List Detail.RecordID` values.
   */
  public async ApplyBulkStatus(): Promise<void> {
    if (!this.ListRecord || this.SelectedKeys.length === 0 || !this.BulkStatus) return;
    this.IsApplyingBulkStatus = true;
    this.cdr.detectChanges();
    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(md);
      const entityInfo = md.EntityByID(this.ListRecord.EntityID);
      const recordIds = this.SelectedKeys.map((key) => {
        if (entityInfo && entityInfo.PrimaryKeys.length === 1) {
          const ck = new CompositeKey();
          ck.LoadFromConcatenatedString(key);
          return ck.KeyValuePairs[0]?.Value || key;
        }
        return key;
      });
      const filter = `ListID='${this.ListRecord.ID}' AND RecordID IN (${recordIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',')})`;
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
        detail.Status = this.BulkStatus as never;
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
          ? `Updated ${updated} item(s) to '${this.BulkStatus}'`
          : `Updated ${updated}, ${failed} failed: ${failureMessages.join(' | ')}`,
        failed === 0 ? 'success' : 'warning',
        failed === 0 ? 3000 : 8000,
      );
      this.BulkStatus = '';
      // Defer the grid refresh to the next microtask — see comment in
      // confirmRemoveFromList for why running it synchronously here
      // triggers NG0100 and silently breaks the UI refresh.
      await Promise.resolve();
      this.RefreshGrid();
      this.bumpStatsRefresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Bulk update failed: ${message}`, 'error', 5000);
    } finally {
      this.IsApplyingBulkStatus = false;
      this.cdr.detectChanges();
    }
  }

  /** @deprecated Use {@link ApplyBulkStatus}. */
  public async applyBulkStatus(): Promise<void> {
    return this.ApplyBulkStatus();
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

  public OpenMoveDialog(): void { this.openMoveCopyDialog('move'); }

  /** @deprecated Use {@link OpenMoveDialog}. */
  public openMoveDialog(): void {
    return this.OpenMoveDialog();
  }
  public OpenCopyDialog(): void { this.openMoveCopyDialog('copy'); }

  /** @deprecated Use {@link OpenCopyDialog}. */
  public openCopyDialog(): void {
    return this.OpenCopyDialog();
  }

  private openMoveCopyDialog(mode: 'move' | 'copy'): void {
    if (!this.ListRecord || this.SelectedKeys.length === 0) {
      this.sharedService.CreateSimpleNotification('Please select records first', 'warning', 2500);
      return;
    }
    this.MoveCopyMode = mode;
    this.MoveCopySelectedTarget = null;
    this.MoveCopyTargetSearch = '';
    this.ShowMoveCopyDialog = true;
    // Load candidates once per dialog open. We don't keep them in
    // permanent component state because the user could create/delete
    // lists between opens, and the target picker isn't visible often
    // enough to justify long-lived caching.
    void this.loadMoveCopyTargets();
    this.cdr.detectChanges();
  }

  public CloseMoveCopyDialog(): void {
    this.ShowMoveCopyDialog = false;
    this.MoveCopyTargetCandidates = [];
    this.MoveCopySelectedTarget = null;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link CloseMoveCopyDialog}. */
  public closeMoveCopyDialog(): void {
    return this.CloseMoveCopyDialog();
  }

  public SelectMoveCopyTarget(target: MJListEntity): void {
    this.MoveCopySelectedTarget = target;
  }

  /** @deprecated Use {@link SelectMoveCopyTarget}. */
  public selectMoveCopyTarget(target: MJListEntity): void {
    return this.SelectMoveCopyTarget(target);
  }

  public get FilteredMoveCopyTargets(): MJListEntity[] {
    const term = this.MoveCopyTargetSearch.trim().toLowerCase();
    if (!term) return this.MoveCopyTargetCandidates;
    return this.MoveCopyTargetCandidates.filter((l) =>
      l.Name.toLowerCase().includes(term) ||
      (l.Description?.toLowerCase().includes(term) ?? false)
    );
  }

  /** @deprecated Use {@link FilteredMoveCopyTargets}. */
  public get filteredMoveCopyTargets(): MJListEntity[] {
    return this.FilteredMoveCopyTargets;
  }

  public get MoveCopyProgressPercent(): number {
    return this.MoveCopyTotal > 0 ? Math.round((this.MoveCopyProgress / this.MoveCopyTotal) * 100) : 0;
  }

  /** @deprecated Use {@link MoveCopyProgressPercent}. */
  public get moveCopyProgressPercent(): number {
    return this.MoveCopyProgressPercent;
  }

  /** Load candidate target lists — same Entity, owned by or shared with
   *  the current user, excluding the list we're standing on. One RunView
   *  on open; results stay in memory until the dialog closes. */
  private async loadMoveCopyTargets(): Promise<void> {
    if (!this.ListRecord) return;
    this.MoveCopyTargetCandidatesLoading = true;
    this.cdr.detectChanges();
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      // Filter to same EntityID + exclude the current list. UserID filter
      // would over-restrict (Shared-With-Me lists should be valid targets
      // when the user has Edit there); the server enforces the real
      // permission on the per-row Save, so listing extra entries is fine.
      const filter = `EntityID='${this.ListRecord.EntityID}' AND ID<>'${this.ListRecord.ID}'`;
      const result = await rv.RunView<MJListEntity>({
        EntityName: 'MJ: Lists',
        ExtraFilter: filter,
        OrderBy: 'Name',
        ResultType: 'simple',
        MaxRows: 500,
      });
      if (result.Success) {
        this.MoveCopyTargetCandidates = (result.Results ?? []) as MJListEntity[];
      } else {
        this.MoveCopyTargetCandidates = [];
        this.sharedService.CreateSimpleNotification(`Failed to load target lists: ${result.ErrorMessage}`, 'error', 4000);
      }
    } catch (e) {
      this.MoveCopyTargetCandidates = [];
      const message = e instanceof Error ? e.message : String(e);
      this.sharedService.CreateSimpleNotification(`Failed to load target lists: ${message}`, 'error', 4000);
    } finally {
      this.MoveCopyTargetCandidatesLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * "Continue" / "Copy" click in the target picker. For Copy we apply
   * immediately. For Move we build a local Delta and show the confirm
   * dialog — the actual mutation fires from onMoveConfirmCommit().
   */
  public async ConfirmMoveCopy(): Promise<void> {
    if (!this.ListRecord || !this.MoveCopySelectedTarget || this.SelectedKeys.length === 0) return;
    if (this.MoveCopyMode === 'copy') {
      await this.applyMoveCopy(false);
      return;
    }
    // Move: show delta-confirm so the user explicitly acks the source-side drop.
    const recordIds = this.extractSelectedRecordIds();
    this.MoveDelta = this.buildMoveDelta(recordIds);
    this.ShowMoveCopyDialog = false;
    this.MoveDeltaConfirmVisible = true;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link ConfirmMoveCopy}. */
  public async confirmMoveCopy(): Promise<void> {
    return this.ConfirmMoveCopy();
  }

  public OnMoveConfirmCancel(): void {
    this.MoveDeltaConfirmVisible = false;
    this.MoveDelta = null;
    // Re-open the target picker so the user can change their mind without
    // losing their selection.
    this.ShowMoveCopyDialog = true;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnMoveConfirmCancel}. */
  public onMoveConfirmCancel(): void {
    return this.OnMoveConfirmCancel();
  }

  public async OnMoveConfirmCommit(_deltaToken: string): Promise<void> {
    this.MoveDeltaConfirmVisible = false;
    this.cdr.detectChanges();
    await this.applyMoveCopy(true);
  }

  /** @deprecated Use {@link OnMoveConfirmCommit}. */
  public async onMoveConfirmCommit(_deltaToken: string): Promise<void> {
    return this.OnMoveConfirmCommit(_deltaToken);
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
    const entityInfo = this.ListRecord ? md.EntityByID(this.ListRecord.EntityID) : null;
    return this.SelectedKeys.map((key) => {
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
      TargetListId: this.ListRecord!.ID,
      EntityName: this.ListRecord!.Entity ?? '',
      ToAdd: [],
      ToRemove: recordIds,
      Unchanged: [],
      Counts: {
        Add: 0,
        Remove: removeCount,
        Unchanged: 0,
        SourceTotal: 0,
        TargetTotal: this.RowCount,
      },
      Warnings: [{
        Code: 'WILL_REMOVE_RECORDS',
        Message: `${removeCount} record(s) will be removed from "${this.ListRecord!.Name}" as part of the move`,
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
    if (!this.ListRecord || !this.MoveCopySelectedTarget) return;
    const source = this.ListRecord;
    const target = this.MoveCopySelectedTarget;
    const recordIds = this.extractSelectedRecordIds();
    if (recordIds.length === 0) return;

    this.IsApplyingMoveCopy = true;
    this.MoveCopyTotal = recordIds.length;
    this.MoveCopyProgress = 0;
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
      this.MoveCopyProgress = this.MoveCopyTotal;

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
      this.CloseMoveCopyDialog();
      this.MoveDelta = null;
      if (isMove) {
        this.listDetailGrid?.clearSelection();
        this.RefreshGrid();
        this.bumpStatsRefresh();
      }
      this.cdr.detectChanges();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      LogError(`Move/Copy failed: ${message}`);
      this.sharedService.CreateSimpleNotification(`${isMove ? 'Move' : 'Copy'} failed: ${message}`, 'error', 5000);
    } finally {
      this.IsApplyingMoveCopy = false;
      this.cdr.detectChanges();
    }
  }

  // ==========================================
  // Remove from List Dialog
  // ==========================================

  OpenRemoveDialog(): void {
    if (this.SelectedKeys.length === 0) {
      this.sharedService.CreateSimpleNotification("Please select records to remove", 'warning', 2500);
      return;
    }
    this.ShowRemoveDialog = true;
  }

  /** @deprecated Use {@link OpenRemoveDialog}. */
  openRemoveDialog(): void {
    return this.OpenRemoveDialog();
  }

  CloseRemoveDialog(): void {
    this.ShowRemoveDialog = false;
    this.IsRemoving = false;
    this.RemoveProgress = 0;
    this.RemoveTotal = 0;
  }

  /** @deprecated Use {@link CloseRemoveDialog}. */
  closeRemoveDialog(): void {
    return this.CloseRemoveDialog();
  }

  async ConfirmRemoveFromList(): Promise<void> {
    if (!this.ListRecord || this.SelectedKeys.length === 0) return;

    this.IsRemoving = true;
    this.RemoveTotal = this.SelectedKeys.length;
    this.RemoveProgress = 0;

    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const entityInfo = md.EntityByID(this.ListRecord.EntityID);

    // selectedKeys from grid are in concatenated format (ID|value)
    // For single PK entities, RecordID in DB is just the raw value
    // For composite PK entities, RecordID in DB is the concatenated format
    // Extract the appropriate format for the query
    const selectedRecordIds = this.SelectedKeys.map(key => {
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

    const listDetailsFilter = `ListID = '${this.ListRecord.ID}' AND RecordID IN (${selectedRecordIds.map(id => `'${id}'`).join(',')})`;

    const listDetailsResult = await rv.RunView<MJListDetailEntity>({
      EntityName: 'MJ: List Details',
      ExtraFilter: listDetailsFilter,
      ResultType: 'entity_object'
    }, md.CurrentUser);

    if (!listDetailsResult.Success) {
      LogError("Error loading list details for removal", undefined, listDetailsResult.ErrorMessage);
      this.sharedService.CreateSimpleNotification("Failed to remove records", 'error', 2500);
      this.IsRemoving = false;
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
      this.RemoveProgress = this.RemoveTotal;
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
      this.CloseRemoveDialog();
      this.listDetailGrid?.clearSelection();
      this.RefreshGrid();
      this.bumpStatsRefresh();
      this.cdr.detectChanges();
    } else {
      LogError("Error removing records from list");
      this.sharedService.CreateSimpleNotification("Failed to remove some records", 'error', 2500);
      this.IsRemoving = false;
    }
  }

  /** @deprecated Use {@link ConfirmRemoveFromList}. */
  async confirmRemoveFromList(): Promise<void> {
    return this.ConfirmRemoveFromList();
  }

  // ==========================================
  // Add Records Dialog
  // ==========================================

  async OpenAddRecordsDialog(): Promise<void> {
    this.ShowAddRecordsDialog = true;
    this.AddableRecords = [];
    this.AddRecordsSearchFilter = "";
    this.AddDialogLoading = true;
    this.AddDialogSaving = false;

    // Load existing list detail IDs to mark which records are already in the list
    await this.loadExistingListDetailIds();
    this.AddDialogLoading = false;
    // Explicit CD: the GraphQL promise resolution doesn't reliably produce an
    // Angular tick, so without this the spinner stays up until the next user
    // event (click/keystroke) forces a change-detection cycle.
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OpenAddRecordsDialog}. */
  async openAddRecordsDialog(): Promise<void> {
    return this.OpenAddRecordsDialog();
  }

  CloseAddRecordsDialog(): void {
    this.ShowAddRecordsDialog = false;
    this.AddableRecords = [];
    this.AddRecordsSearchFilter = "";
    this.ExistingListDetailIds.clear();
    this.AddDialogSaving = false;
    this.AddProgress = 0;
    this.AddTotal = 0;
  }

  /** @deprecated Use {@link CloseAddRecordsDialog}. */
  closeAddRecordsDialog(): void {
    return this.CloseAddRecordsDialog();
  }

  private async loadExistingListDetailIds(): Promise<void> {
    if (!this.ListRecord) return;

    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);

    const result = await rv.RunView<{ RecordID: string }>({
      EntityName: 'MJ: List Details',
      ExtraFilter: `ListID = '${this.ListRecord.ID}'`,
      Fields: ['RecordID'],
      ResultType: 'simple'
    }, md.CurrentUser);

    if (result.Success) {
      this.ExistingListDetailIds = new Set(result.Results.map(r => NormalizeUUID(r.RecordID)));
    }
  }

  OnAddRecordsSearchInputEvent(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.OnAddRecordsSearchChange(value);
  }

  /** @deprecated Use {@link OnAddRecordsSearchInputEvent}. */
  onAddRecordsSearchInputEvent(event: Event): void {
    return this.OnAddRecordsSearchInputEvent(event);
  }

  OnAddRecordsSearchChange(value: string): void {
    this.AddRecordsSearchFilter = value;
    this.searchSubject.next(value);
  }

  /** @deprecated Use {@link OnAddRecordsSearchChange}. */
  onAddRecordsSearchChange(value: string): void {
    return this.OnAddRecordsSearchChange(value);
  }

  private async searchRecords(searchText: string): Promise<void> {
    if (!this.ListRecord || !searchText || searchText.length < 2) {
      this.AddableRecords = [];
      this.cdr.detectChanges();
      return;
    }

    this.AddDialogLoading = true;
    this.cdr.detectChanges();

    const md = this.ProviderToUse;
    const sourceEntityInfo = md.EntityByID(this.ListRecord.EntityID);
    if (!sourceEntityInfo) {
      this.AddDialogLoading = false;
      this.cdr.detectChanges();
      return;
    }

    // NameField when present; otherwise the fallback display field
    // (first non-PK/non-FK/non-system field). Text-typed fields also
    // drive the LIKE search so name-less entities remain searchable.
    const displayField = GetRecordDisplayField(sourceEntityInfo);

    let filter: string | undefined;
    if (displayField.Field && IsTextSearchableField(displayField.Field)) {
      filter = `${displayField.Field.Name} LIKE '%${searchText.replace(/'/g, "''")}%'`;
    }

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result: RunViewResult = await rv.RunView({
      EntityName: this.ListRecord.Entity,
      ExtraFilter: filter,
      MaxRows: 100,
      ResultType: 'simple'
    });

    if (result.Success) {
      this.AddableRecords = result.Results.map((record: Record<string, unknown>) => {
        // Compact key segment (raw value, or "F1|v1||F2|v2" for a composite key) — the form ListDetail.RecordID stores
        const recordId = CompositeKey.FromEntityRecord(sourceEntityInfo, record).ToCompactURLSegment();
        return {
          ID: recordId,
          Name: displayField.Field
            ? FormatRecordDisplayValue(recordId, record[displayField.Field.Name], displayField)
            : recordId,
          isInList: this.ExistingListDetailIds.has(NormalizeUUID(recordId)),
          isSelected: false
        };
      });
    }

    this.AddDialogLoading = false;
    this.cdr.detectChanges();
  }

  ToggleRecordSelection(record: AddableRecord): void {
    if (record.isInList) return; // Can't select records already in list
    record.isSelected = !record.isSelected;
  }

  /** @deprecated Use {@link ToggleRecordSelection}. */
  toggleRecordSelection(record: AddableRecord): void {
    return this.ToggleRecordSelection(record);
  }

  get SelectedAddableRecords(): AddableRecord[] {
    return this.AddableRecords.filter(r => r.isSelected);
  }

  /** @deprecated Use {@link SelectedAddableRecords}. */
  get selectedAddableRecords(): AddableRecord[] {
    return this.SelectedAddableRecords;
  }

  SelectAllAddable(): void {
    this.AddableRecords.forEach(r => {
      if (!r.isInList) r.isSelected = true;
    });
  }

  /** @deprecated Use {@link SelectAllAddable}. */
  selectAllAddable(): void {
    return this.SelectAllAddable();
  }

  DeselectAllAddable(): void {
    this.AddableRecords.forEach(r => r.isSelected = false);
  }

  /** @deprecated Use {@link DeselectAllAddable}. */
  deselectAllAddable(): void {
    return this.DeselectAllAddable();
  }

  async ConfirmAddRecords(): Promise<void> {
    const recordsToAdd = this.SelectedAddableRecords;
    if (recordsToAdd.length === 0 || !this.ListRecord) return;

    this.AddDialogSaving = true;
    // Reserve 20% of progress for tg.Submit()
    this.AddTotal = recordsToAdd.length;
    this.AddProgress = 0;
    const progressPerRecord = 0.8 / recordsToAdd.length; // 80% for individual saves

    const md = this.ProviderToUse;

    // Use transaction group for bulk insert
    const tg = await md.CreateTransactionGroup();

    for (let i = 0; i < recordsToAdd.length; i++) {
      const record = recordsToAdd[i];
      const listDetail = await md.GetEntityObject<MJListDetailEntityExtended>("MJ: List Details", md.CurrentUser);
      listDetail.ListID = this.ListRecord.ID;
      listDetail.RecordID = record.ID;
      listDetail.TransactionGroup = tg;
      const result = await listDetail.Save();
      if (!result) {
        LogErrorEx({
          message: listDetail.LatestResult?.CompleteMessage
        });
      }
      // Update progress (0-80%)
      this.AddProgress = Math.round((i + 1) * progressPerRecord * this.AddTotal);
    }

    // Show 80% complete before submit
    this.AddProgress = Math.round(this.AddTotal * 0.8);

    const success = await tg.Submit();

    if (success) {
      this.AddProgress = this.AddTotal;
      this.sharedService.CreateSimpleNotification(
        `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
        'success',
        2500
      );
      // Defer dialog close + grid refresh to the next microtask. See
      // confirmRemoveFromList for the NG0100 background.
      await Promise.resolve();
      this.CloseAddRecordsDialog();
      this.RefreshGrid();
      this.bumpStatsRefresh();
      this.cdr.detectChanges();
    } else {
      LogError("Error adding records to list");
      this.sharedService.CreateSimpleNotification("Failed to add some records", 'error', 2500);
      this.AddDialogSaving = false;
    }
  }

  /** @deprecated Use {@link ConfirmAddRecords}. */
  async confirmAddRecords(): Promise<void> {
    return this.ConfirmAddRecords();
  }

  // ==========================================
  // Add From View Dialog (existing functionality, cleaned up)
  // ==========================================

  async OpenAddFromViewDialog(): Promise<void> {
    this.ShowAddFromViewDialog = true;
    this.UserViewsToAdd = [];
    this.userViewsToAddIds.clear();

    if (!this.UserViews) {
      await this.loadEntityViews();
    }
  }

  /** @deprecated Use {@link OpenAddFromViewDialog}. */
  async openAddFromViewDialog(): Promise<void> {
    return this.OpenAddFromViewDialog();
  }

  CloseAddFromViewDialog(): void {
    this.ShowAddFromViewDialog = false;
    this.UserViewsToAdd = [];
    this.userViewsToAddIds.clear();
    this.ShowAddFromViewLoader = false;
    this.AddFromViewTotal = 0;
    this.setAddFromViewProgress(0);
  }

  /** @deprecated Use {@link CloseAddFromViewDialog}. */
  closeAddFromViewDialog(): void {
    return this.CloseAddFromViewDialog();
  }

  private async loadEntityViews(): Promise<void> {
    if (!this.ListRecord || !this.ListRecord.Entity) return;

    this.ShowAddFromViewLoader = true;

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const md = this.ProviderToUse;

    const runViewResult = await rv.RunView<MJUserViewEntityExtended>({
      EntityName: "MJ: User Views",
      ExtraFilter: `UserID = '${md.CurrentUser.ID}' AND EntityID = '${this.ListRecord.EntityID}'`,
      ResultType: 'entity_object'
    }, md.CurrentUser);

    if (!runViewResult.Success) {
      LogError(`Error loading User Views for entity ${this.ListRecord.Entity}`);
    } else {
      this.UserViews = runViewResult.Results;
    }

    this.ShowAddFromViewLoader = false;
    this.cdr.detectChanges();
  }

  ToggleViewSelection(view: MJUserViewEntityExtended): void {
    const index = this.UserViewsToAdd.findIndex(v => UUIDsEqual(v.ID, view.ID));
    if (index >= 0) {
      this.UserViewsToAdd.splice(index, 1);
      this.userViewsToAddIds.delete(NormalizeUUID(view.ID));
    } else {
      this.UserViewsToAdd.push(view);
      this.userViewsToAddIds.add(NormalizeUUID(view.ID));
    }
  }

  /** @deprecated Use {@link ToggleViewSelection}. */
  toggleViewSelection(view: MJUserViewEntityExtended): void {
    return this.ToggleViewSelection(view);
  }

  IsViewSelected(view: MJUserViewEntityExtended): boolean {
    return this.userViewsToAddIds.has(NormalizeUUID(view.ID));
  }

  /** @deprecated Use {@link IsViewSelected}. */
  isViewSelected(view: MJUserViewEntityExtended): boolean {
    return this.IsViewSelected(view);
  }

  async ConfirmAddFromView(): Promise<void> {
    if (!this.ListRecord || this.UserViewsToAdd.length === 0) return;

    this.ShowAddFromViewLoader = true;
    this.FetchingRecordsToSave = true;
    this.cdr.detectChanges();

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const md = this.ProviderToUse;

    // Collect all unique record IDs from selected views.
    // Batch every selected view into a single RunViews call rather than issuing a
    // sequential RunView per view (N round-trips → 1). Each view has a distinct ViewID,
    // so this can't collapse to one query, but RunViews parallelizes the round trips.
    const recordIdSet = new Set<string>();

    const viewResults = await rv.RunViews(
      this.UserViewsToAdd.map(userView => ({
        ViewID: userView.ID,
        ViewEntity: userView,
        Fields: ["ID"]
      })),
      md.CurrentUser
    );

    for (const runViewResult of viewResults) {
      if (runViewResult.Success) {
        const records = runViewResult.Results as Array<Record<string, string>>;
        records.forEach(r => recordIdSet.add(NormalizeUUID(r.ID)));
      }
    }

    // Filter out records already in the list
    await this.loadExistingListDetailIds();
    const recordsToAdd = [...recordIdSet].filter(id => !this.ExistingListDetailIds.has(id));

    this.AddFromViewTotal = recordsToAdd.length;
    this.setAddFromViewProgress(0);
    this.FetchingRecordsToSave = false;
    this.cdr.detectChanges();
    const progressPerRecord = 0.8 / Math.max(recordsToAdd.length, 1); // 80% for individual saves

    if (recordsToAdd.length === 0) {
      this.sharedService.CreateSimpleNotification("All records already in list", 'info', 2500);
      this.ShowAddFromViewLoader = false;
      this.cdr.detectChanges();
      return;
    }

    LogStatus(`Adding ${recordsToAdd.length} records to list`);

    // Use transaction group for bulk insert
    const tg = await md.CreateTransactionGroup();

    for (let i = 0; i < recordsToAdd.length; i++) {
      const recordID = recordsToAdd[i];
      const listDetail = await md.GetEntityObject<MJListDetailEntityExtended>("MJ: List Details", md.CurrentUser);
      listDetail.ListID = this.ListRecord.ID;
      listDetail.RecordID = recordID;
      listDetail.TransactionGroup = tg;
      const result = await listDetail.Save();
      if (!result) {
        LogErrorEx({
          message: listDetail.LatestResult?.CompleteMessage
        });
      }
      // Update progress (0-80%) via the helper so both the counter and the
      // bound percent move in lockstep, then detectChanges() to close the
      // CD cycle on this iteration. Without detectChanges() the next await
      // can yield in the middle of a cycle and Angular's dev-mode re-check
      // catches the percent changing → NG0100 flood.
      this.setAddFromViewProgress(Math.round((i + 1) * progressPerRecord * this.AddFromViewTotal));
      this.cdr.detectChanges();
    }

    // Show 80% complete before submit
    this.setAddFromViewProgress(Math.round(this.AddFromViewTotal * 0.8));
    this.cdr.detectChanges();

    const success = await tg.Submit();

    if (success) {
      this.setAddFromViewProgress(this.AddFromViewTotal);
      this.sharedService.CreateSimpleNotification(
        `Added ${recordsToAdd.length} record${recordsToAdd.length !== 1 ? 's' : ''} to list`,
        'success',
        2500
      );
      // Defer dialog close + grid refresh to the next microtask. See
      // confirmRemoveFromList for the NG0100 background.
      await Promise.resolve();
      this.CloseAddFromViewDialog();
      this.RefreshGrid();
      this.bumpStatsRefresh();
      this.cdr.detectChanges();
    } else {
      LogError("Error adding records from view to list");
      this.sharedService.CreateSimpleNotification("Failed to add some records", 'error', 2500);
      this.ShowAddFromViewLoader = false;
    }
  }

  /** @deprecated Use {@link ConfirmAddFromView}. */
  async confirmAddFromView(): Promise<void> {
    return this.ConfirmAddFromView();
  }
}
