import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter, Type, ViewChild } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { DataSnapshot, DataTable, DataComputation, MJColumnDescriptor, NormalizeToTables, Metadata, RunQuery, RunView, CompositeKey } from '@memberjunction/core';
import { QueryEngine, ArtifactMetadataEngine, ParseQuerySaveMessage } from '@memberjunction/core-entities';
import type { MJArtifactVersionEntity, MJQueryEntity, MJQueryParameterEntity, QueryDiagnosticLine } from '@memberjunction/core-entities';
import { ExcelAddinClient } from '@memberjunction/excel-addin';
import {
  HasRequiredParameterValues,
  QueryDataGridComponent,
  QueryGridColumnConfig,
  QueryEntityLinkClickEvent,
  InferNameFieldLinks,
  ResolveTargetEntity,
  ToExcelParameterValues,
} from '@memberjunction/ng-query-viewer';
import { PageChangeEvent } from '@memberjunction/ng-pagination';
import { BaseArtifactViewerPluginComponent, ArtifactExportOption, ArtifactViewerTab, IArtifactVersionDiffViewer, NavigationRequest } from '../base-artifact-viewer.component';
import { QueryVersionDiffComponent } from '../version-diff/query-version-diff.component';
import { SaveQueryResult } from './save-query-dialog.component';
import type { SaveAsListKeyColumn, SaveAsListRequest } from './save-as-list-dialog.component';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CreateDataSnapshot, BuildMultiTableSql } from '../../snapshot-helpers';
import { CreateLiveSheetHelperForProvider } from '../../services/live-sheet-client-tool.helper';

/**
 * Data artifact content shape as parsed from JSON.
 *
 * Core tabular data fields (source, columns, rows, tables, metadata, etc.)
 * are handled by NormalizeToTables() from @memberjunction/core.
 * This interface adds viewer-specific fields for query sync and display.
 *
 * Columns may use either `displayName` (new) or `headerName` (legacy).
 * BuildColumnConfigsForTable handles both.
 */
interface DataArtifactSpec {
  source?: 'query' | 'view';
  title?: string;
  queryId?: string;
  parameters?: Record<string, string | number | boolean>;
  entityName?: string;
  extraFilter?: string;
  columns?: Array<MJColumnDescriptor & { headerName?: string }>;
  rows?: DataTable['rows'];
  tables?: DataTable[];
  plan?: string;
  interpretation?: string;
  computations?: DataComputation[];
  metadata?: { sql?: string; rowCount?: number; executionTimeMs?: number };
  savedQueryId?: string;
  savedQueryName?: string;
  savedAtVersionNumber?: number;
}

/** The column set of a result with no columns, shared so cached lookups keyed on it stay stable. */
const NO_COLUMNS: MJColumnDescriptor[] = [];

/** The result formats the Export menu offers, in menu order. */
type ResultExportFormat = 'excel' | 'csv' | 'json';

/** Export menu entries for the results, without their group (the group names the active table). */
const RESULT_EXPORT_OPTIONS: ReadonlyArray<Omit<ArtifactExportOption, 'Group'> & { Key: ResultExportFormat }> = [
  { Key: 'excel', Label: 'Excel (.xlsx)', Icon: 'fa-solid fa-file-excel', Description: 'Workbook with typed columns' },
  { Key: 'csv', Label: 'CSV (.csv)', Icon: 'fa-solid fa-file-csv', Description: 'Plain text, opens anywhere' },
  { Key: 'json', Label: 'JSON (.json)', Icon: 'fa-solid fa-file-code', Description: 'Rows as objects, for code' },
];

const SAVE_AS_GROUP = 'Save as';

/** Export menu entry that opens the save panel for a query that has no saved query yet. */
const SAVE_QUERY_OPTION: ArtifactExportOption = {
  Key: 'saved-query',
  Label: 'Saved Query',
  Icon: 'fa-solid fa-floppy-disk',
  Description: 'Reuse it in Queries and dashboards',
  Group: SAVE_AS_GROUP,
};

/** Export menu entry that saves this version's SQL as a second saved query. */
const NEW_SAVED_QUERY_OPTION: ArtifactExportOption = {
  Key: 'saved-query-new',
  Label: 'New saved query',
  Icon: 'fa-solid fa-plus',
  Description: 'Keep the original as it is',
  Group: SAVE_AS_GROUP,
};

/** Why a target that reads the saved query is unavailable, for the states that block it. */
const SAVED_QUERY_NEEDED: Partial<Record<QuerySyncState, string>> = {
  'no-query-latest': 'Save the query first',
  'outdated-latest': 'Update the saved query first',
};

/**
 * Describes the relationship between the current artifact version's SQL
 * and the saved query record. Drives the toolbar UI.
 */
type QuerySyncState =
  | 'no-query-latest'    // No saved query, viewing latest version → show "Save Query"
  | 'no-query-older'     // No saved query, viewing older version → no actions
  | 'synced'             // SQL matches saved query → green badge + "Open Query"
  | 'outdated-latest'    // SQL differs, viewing latest → amber badge + dropdown
  | 'query-ahead'        // Viewing older version, query was updated at a newer version
  | 'query-behind';      // Viewing middle version, saved at older, not latest → muted

/**
 * Viewer component for Data artifacts.
 *
 * Displays tabular data using AG Grid via mj-query-data-grid. Supports two modes:
 * 1. **Live data**: When metadata.sql is present, executes the query dynamically via RunQuery({ SQL })
 *    to fetch fresh data on each view. Falls back to inline rows on error.
 * 2. **Inline data**: Rows embedded directly in the artifact JSON (backward compat with older artifacts)
 *
 * The Query Builder agent emits artifacts with metadata.sql for live execution.
 */
@Component({
  standalone: false,
  selector: 'mj-data-artifact-viewer',
  templateUrl: './data-artifact-viewer.component.html',
  styleUrls: ['./data-artifact-viewer.component.css']
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'DataArtifactViewerPlugin')
export class DataArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  @Output() OpenEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;
  @Output() override navigationRequest = new EventEmitter<NavigationRequest>();
  public override tabsChanged = new EventEmitter<void>();

  /** The grid showing the active table. The Export menu exports through it. */
  @ViewChild(QueryDataGridComponent) public ResultsGrid?: QueryDataGridComponent;

  /** Most rows one export fetches, so a very large result cannot exhaust the browser. Same cap as the Query Viewer. */
  private static readonly EXPORT_MAX_ROWS = 100000;

  /** How the last full-result fetch for an export ended, so the user hears when it was cut short. */
  private lastExportFetch: 'complete' | 'capped' | 'failed' = 'complete';

  /** True when the host serves the Excel add-in, so the Export menu can offer Excel (live). */
  public ExcelAddinEnabled = false;

  public spec: DataArtifactSpec | null = null;
  public GridData: DataTable['rows'] = [];
  public GridColumnConfigs: QueryGridColumnConfig[] | null = null;
  public IsLoading = false;
  public IsLive = false;
  public HasError = false;
  public ErrorMessage = '';
  public ShowSaveDialog = false;
  public IsSaving = false;
  public SavingMessage = '';

  /** Paging state — passed through to mj-query-data-grid's embedded pager */
  public PagerTotalRowCount = 0;
  public PagerPageNumber = 1;
  public PagerPageSize = 100;

  // ─── Multi-Table State ───

  /** All resolved tables (from multi-table or wrapped single-table) */
  public ResolvedTables: DataTable[] = [];

  /** Index of the currently active table tab */
  public ActiveTableIndex = 0;

  /** Per-table paging state */
  private tablePageState: Map<number, { pageNumber: number; pageSize: number; totalRowCount: number }> = new Map();

  /** Per-table live data cache (loaded lazily on tab switch) */
  private tableDataCache: Map<number, DataTable['rows']> = new Map();

  /** Per-table column configs cache */
  private tableColumnConfigsCache: Map<number, QueryGridColumnConfig[]> = new Map();

  /** Whether we're in multi-table mode */
  public get IsMultiTable(): boolean {
    return this.ResolvedTables.length > 1;
  }

  /** The currently active table */
  public get ActiveTable(): DataTable | null {
    return this.ResolvedTables[this.ActiveTableIndex] ?? null;
  }

  // ─── Save as list ───

  public ShowSaveAsList = false;
  public SavingAsList = false;
  public SaveAsListError: string | null = null;

  /**
   * The result columns that hold a record's primary key (a single-column key of the entity the
   * column traces to), so the rows can become a list of those records. Empty for results that are
   * not records, such as counts and totals.
   */
  public get ListKeyColumns(): SaveAsListKeyColumn[] {
    const columns: MJColumnDescriptor[] = this.ActiveTable?.columns ?? this.spec?.columns ?? NO_COLUMNS;
    // Cached per column set: a template binding must see the same array until the columns change.
    if (this.listKeyColumnsCache?.Source !== columns) {
      this.listKeyColumnsCache = { Source: columns, Keys: this.findListKeyColumns(columns) };
    }
    return this.listKeyColumnsCache.Keys;
  }
  private listKeyColumnsCache: { Source: MJColumnDescriptor[]; Keys: SaveAsListKeyColumn[] } | null = null;

  private findListKeyColumns(columns: MJColumnDescriptor[]): SaveAsListKeyColumn[] {
    const keys: SaveAsListKeyColumn[] = [];
    for (const column of columns) {
      if (!column.sourceEntity || !column.sourceFieldName || column.isComputed || column.isSummary) continue;
      const entity = this.ProviderToUse?.EntityByName(column.sourceEntity);
      if (!entity || entity.PrimaryKeys.length !== 1) continue;
      const pkName = entity.FirstPrimaryKey.Name; // first-pk-ok: a list made from a query needs a single-column key, checked above
      if (pkName.toLowerCase() === column.sourceFieldName.toLowerCase()) {
        keys.push({ Column: column.field, EntityName: entity.Name, EntityDisplayName: entity.DisplayNameOrName });
      }
    }
    return keys;
  }

  /** Save as list is offered for the latest version of a single-table result whose rows are records. */
  public get CanSaveAsList(): boolean {
    return !this.IsMultiTable && !!this.spec?.metadata?.sql && this.IsLatestVersion && this.ListKeyColumns.length > 0;
  }

  /** The saved query the list will link to: only when this version's SQL is the saved query's. */
  public get SaveAsListQueryName(): string | null {
    return this.QuerySyncState === 'synced' ? this.SavedQueryDisplayName : null;
  }

  public OnShowSaveAsList(): void {
    this.SaveAsListError = null;
    this.ShowSaveAsList = true;
  }

  /**
   * Creates the list on the server. A saved query that matches this version is linked as is;
   * otherwise the SQL is saved Pending in the user's User Lists. Calls the operation directly,
   * never through an agent turn.
   */
  public async OnSaveAsList(request: SaveAsListRequest): Promise<void> {
    const sql = this.spec?.metadata?.sql;
    if (!sql) return;
    this.SavingAsList = true;
    this.SaveAsListError = null;
    this.cdr.detectChanges();
    try {
      const linkSaved = this.QuerySyncState === 'synced' && !!this.spec?.savedQueryId;
      const client = new GraphQLListsClient(this.ProviderToUse as unknown as GraphQLDataProvider);
      const result = await client.CreateListFromQuery({
        ListName: request.ListName,
        QueryID: linkSaved ? this.spec!.savedQueryId : undefined,
        SQL: linkSaved ? undefined : sql,
        EntityName: request.KeyColumn.EntityName,
        KeyField: request.KeyColumn.Column,
        RefreshMode: request.RefreshMode,
        AutoRefresh: request.AutoRefresh,
      });
      if (!result.CreatedListId) {
        this.SaveAsListError = result.Message;
        return;
      }
      this.ShowSaveAsList = false;
      MJNotificationService.Instance.CreateSimpleNotification(this.describeSavedList(request.ListName, result), result.Success ? 'success' : 'warning', 6000);
    } catch (error) {
      this.SaveAsListError = error instanceof Error ? error.message : String(error);
    } finally {
      this.SavingAsList = false;
      this.cdr.detectChanges();
    }
  }

  private describeSavedList(listName: string, result: { Counts?: { Added: number; Failed: number }; Refreshes: boolean; StaticReason?: string }): string {
    const added = result.Counts?.Added ?? 0;
    const failed = result.Counts?.Failed ? `, ${result.Counts.Failed} could not be added` : '';
    const refresh = result.Refreshes ? '' : ` It won't refresh: ${result.StaticReason ?? 'it has no source'}.`;
    return `List "${listName}" created with ${added} record(s)${failed}.${refresh}`;
  }

  /** Query sync state — drives the toolbar UI for saved query actions */
  public QuerySyncState: QuerySyncState = 'no-query-latest';

  /**
   * Latest version number for this artifact: the greatest of {@link VisibleVersionNumbers} when
   * the viewer passes them, otherwise the artifact-wide latest from the cache.
   */
  public LatestVersionNumber = 0;

  /** Metadata from live execution (overrides spec.metadata when live) */
  private liveRowCount: number | null = null;
  private liveExecutionTime: number | null = null;

  /** SQL from the saved query record (for comparison) */
  private savedQuerySql: string | null = null;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  public override get hasDisplayContent(): boolean {
    return this.spec != null && (this.HasData || this.IsLoading || this.ResolvedTables.length > 0);
  }

  public override get SupportsVersionDiff(): boolean {
    return true;
  }

  public override GetVersionDiffComponentType(): Type<IArtifactVersionDiffViewer> {
    return QueryVersionDiffComponent;
  }

  public override get parentShouldShowRawContent(): boolean {
    return true;
  }

  public get HasData(): boolean {
    return this.GridData.length > 0;
  }

  public get HasInlineData(): boolean {
    // Check root-level rows (legacy single-table) or any resolved table with rows
    return !!(this.spec?.rows && this.spec.rows.length > 0) ||
           this.ResolvedTables.some(t => t.rows && t.rows.length > 0);
  }

  public get DisplayRowCount(): number | null {
    // In live/paged mode the pager tracks the TRUE total row count
    // (PagerTotalRowCount, from RunQueryResult.TotalRowCount) — surface that as
    // the headline count so the title reflects the full result size, not just the
    // current page (which the bottom pager already shows as a range). Falls back
    // to the page/inline row count when there's no paged total.
    if (this.PagerTotalRowCount > 0) {
      return this.PagerTotalRowCount;
    }
    return this.liveRowCount ?? this.spec?.metadata?.rowCount ?? null;
  }

  public get DisplayExecutionTime(): number | null {
    return this.liveExecutionTime ?? this.spec?.metadata?.executionTimeMs ?? null;
  }

  /** Current artifact version number */
  public get CurrentVersionNumber(): number {
    return this.artifactVersion?.VersionNumber || 1;
  }

  /** Whether this is the latest version of the artifact */
  public get IsLatestVersion(): boolean {
    return this.CurrentVersionNumber === this.LatestVersionNumber;
  }

  /**
   * The effective version number at which the query was last saved/updated.
   * When viewing an older version, this looks ahead through newer versions
   * to find the most recent savedAtVersionNumber for the same query,
   * giving the user accurate context (e.g., "Query updated at v3" instead
   * of the stale "Saved at v1" from this version's snapshot).
   */
  public EffectiveSavedAtVersion: number | null = null;

  /** Alias used by the template */
  public get SavedAtVersion(): number | null {
    return this.EffectiveSavedAtVersion;
  }

  /** Display name for the saved query */
  public get SavedQueryDisplayName(): string {
    return this.spec?.savedQueryName || 'Saved Query';
  }

  async ngOnInit(): Promise<void> {
    try {
      this.spec = this.parseJsonContent<DataArtifactSpec>();
      if (!this.spec) {
        this.HasError = true;
        this.ErrorMessage = 'Failed to parse data artifact content';
        return;
      }

      // Resolve to tables array (handles both single and multi-table)
      this.ResolvedTables = NormalizeToTables(
        { ...this.spec } as Record<string, string | number | boolean | object | null | undefined>,
        this.spec.title || 'Results'
      );

      if (this.ResolvedTables.length === 0 && !this.spec.plan) {
        return;
      }

      // Build enriched column configs for the first table
      if (this.ResolvedTables.length > 0) {
        this.GridColumnConfigs = this.buildColumnConfigsForTable(this.ResolvedTables[0]);
      }

      // Initialize paging state for all tables
      for (let i = 0; i < this.ResolvedTables.length; i++) {
        this.tablePageState.set(i, { pageNumber: 1, pageSize: 100, totalRowCount: 0 });
      }

      // Set loading early (synchronously) so hasDisplayContent is true immediately
      if (this.ResolvedTables.some(t => t.metadata?.sql) || this.HasInlineData) {
        this.IsLoading = true;
      }

      // Load cached metadata and resolve query sync state
      await this.initQuerySyncState();
      void this.resolveExcelAddinAvailability();

      // Load data for the first (active) table
      if (this.ResolvedTables.length > 0) {
        await this.loadTableData(0);
      }

      // Signal parent that tabs/display content may have changed after async load
      this.tabsChanged.emit();
    } catch (error) {
      this.HasError = true;
      this.ErrorMessage = error instanceof Error ? error.message : 'Failed to load data';
    }
  }

  /**
   * Re-execute the live SQL query for the active table
   */
  public async OnRefresh(): Promise<void> {
    this.tableDataCache.delete(this.ActiveTableIndex);
    await this.loadTableData(this.ActiveTableIndex);
  }

  /**
   * Handle entity link click from the grid and bubble up as openEntityRecord.
   * Converts the grid's recordId string into a CompositeKey for the artifact viewer pipeline.
   */
  public OnEntityLinkClick(event: QueryEntityLinkClickEvent): void {
    const md = this.ProviderToUse;
    // recordId may be a bare value or a "F1|v1||F2|v2" segment; FromURLSegment reads both against
    // the entity's real primary key(s) instead of assuming a single column.
    const compositeKey = CompositeKey.FromURLSegment(md.EntityByName(event.entityName), event.recordId);
    this.OpenEntityRecord.emit({
      entityName: event.entityName,
      compositeKey
    });
  }

  /**
   * Handle page change from the data grid's embedded pager.
   * Re-executes the query for the active table with new page parameters.
   */
  public async OnPageChange(event: PageChangeEvent): Promise<void> {
    const pageState = this.tablePageState.get(this.ActiveTableIndex);
    if (!pageState) return;

    pageState.pageNumber = event.PageNumber;
    pageState.pageSize = event.PageSize;

    // Clear cache so it reloads
    this.tableDataCache.delete(this.ActiveTableIndex);
    await this.loadTableData(this.ActiveTableIndex);
  }

  /**
   * Switch to a different table tab.
   * Loads data lazily if not already cached.
   */
  public async OnTableTabClick(index: number): Promise<void> {
    if (index === this.ActiveTableIndex) return;
    this.ActiveTableIndex = index;

    const table = this.ResolvedTables[index];
    if (!table) return;

    // Use cached column configs or build new
    if (!this.tableColumnConfigsCache.has(index)) {
      const configs = this.buildColumnConfigsForTable(table);
      if (configs) this.tableColumnConfigsCache.set(index, configs);
    }
    this.GridColumnConfigs = this.tableColumnConfigsCache.get(index) ?? null;

    // Use cached data or load fresh
    if (this.tableDataCache.has(index)) {
      this.GridData = this.tableDataCache.get(index)!;
      const pageState = this.tablePageState.get(index)!;
      this.PagerPageNumber = pageState.pageNumber;
      this.PagerPageSize = pageState.pageSize;
      this.PagerTotalRowCount = pageState.totalRowCount;
    } else {
      await this.loadTableData(index);
    }

    this.cdr.detectChanges();
  }

  /**
   * Load data for a specific table.
   * Handles live SQL execution, inline rows, and caching.
   */
  private async loadTableData(tableIndex: number): Promise<void> {
    const table = this.ResolvedTables[tableIndex];
    if (!table) return;

    this.IsLoading = true;
    this.HasError = false;
    this.cdr.detectChanges();

    try {
      if (table.metadata?.sql) {
        // Live SQL execution
        const pageState = this.tablePageState.get(tableIndex)!;
        const rq = this.RunQueryToUse;
        const startRow = (pageState.pageNumber - 1) * pageState.pageSize;
        const result = await rq.RunQuery({
          SQL: table.metadata.sql,
          StartRow: startRow,
          MaxRows: pageState.pageSize
        });

        if (result.Success) {
          this.tableDataCache.set(tableIndex, result.Results);
          this.GridData = result.Results;
          this.IsLive = true;

          pageState.totalRowCount = result.TotalRowCount ?? result.RowCount ?? 0;
          this.PagerTotalRowCount = pageState.totalRowCount;
          this.PagerPageNumber = pageState.pageNumber;
          this.PagerPageSize = pageState.pageSize;

          this.liveRowCount = result.RowCount;
          this.liveExecutionTime = result.ExecutionTime;
        } else {
          this.handleTableError(tableIndex, result.ErrorMessage || 'Query failed');
        }
      } else if (table.rows && table.rows.length > 0) {
        // Inline data
        this.tableDataCache.set(tableIndex, table.rows);
        this.GridData = table.rows;
        this.liveRowCount = table.rows.length;
      } else {
        this.GridData = [];
      }
    } catch (error) {
      this.handleTableError(tableIndex, error instanceof Error ? error.message : 'Load failed');
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Build QueryGridColumnConfig[] from a DataTable's column metadata.
   * Returns null if columns have no entity metadata (grid falls back to auto-inference).
   */
  private buildColumnConfigsForTable(table: DataTable): QueryGridColumnConfig[] | null {
    const columns = table.columns;
    if (!columns?.length) return null;

    // Only build if at least one column has entity metadata or type info
    const hasMetadata = columns.some(c => c.sourceEntity || c.sqlBaseType);
    if (!hasMetadata) return null;

    const md = this.ProviderToUse;
    const configs = columns.map((col, index) => {
      const target = ResolveTargetEntity(col.sourceEntity, col.sourceFieldName, md);
      // An explicit key field makes the column a link to its source entity, opened by that field.
      const explicitTarget = col.linkKeyField ? md.EntityByName(col.sourceEntity ?? '') : undefined;
      const isEntityLink = !!explicitTarget || !!(target.targetEntityName && (target.isPrimaryKey || target.isForeignKey));
      const baseType = (col.sqlBaseType || 'nvarchar').toLowerCase();

      let align: 'left' | 'center' | 'right' = 'left';
      if (['int', 'bigint', 'decimal', 'numeric', 'float', 'money', 'smallmoney', 'real'].includes(baseType)) {
        align = 'right';
      } else if (baseType === 'bit') {
        align = 'center';
      }

      const title = col.displayName || col.field;

      return {
        field: col.field,
        title,
        visible: true,
        sortable: true,
        resizable: true,
        reorderable: true,
        sqlBaseType: col.sqlBaseType || 'nvarchar',
        sqlFullType: col.sqlFullType || col.sqlBaseType || 'nvarchar',
        align,
        order: index,
        sourceEntityName: col.sourceEntity,
        sourceFieldName: col.sourceFieldName,
        isEntityLink,
        targetEntityName: explicitTarget ? explicitTarget.Name : target.targetEntityName,
        targetEntityId: explicitTarget ? explicitTarget.ID : target.targetEntityId,
        targetEntityIcon: explicitTarget ? explicitTarget.Icon || undefined : target.targetEntityIcon,
        linkKeyField: explicitTarget ? col.linkKeyField : undefined,
        isPrimaryKey: explicitTarget ? false : target.isPrimaryKey,
        isForeignKey: explicitTarget ? false : target.isForeignKey,
        pinned: null,
      } as QueryGridColumnConfig;
    });
    // A column holding its entity's name links by that entity's key column when the table has one.
    return InferNameFieldLinks(configs, md);
  }

  /**
   * Handle a table load error by setting error state and falling back to inline data
   */
  private handleTableError(tableIndex: number, message: string): void {
    this.HasError = true;
    this.ErrorMessage = message;
    const table = this.ResolvedTables[tableIndex];
    if (table?.rows && table.rows.length > 0) {
      this.GridData = table.rows;
    }
  }

  private get artifactMetadataEngine(): ArtifactMetadataEngine {
    return this.Provider
      ? (ArtifactMetadataEngine.GetProviderInstance(
          this.Provider,
          ArtifactMetadataEngine,
        ) as ArtifactMetadataEngine)
      : ArtifactMetadataEngine.Instance;
  }

  private get queryEngine(): QueryEngine {
    return this.Provider
      ? (QueryEngine.GetProviderInstance(this.Provider, QueryEngine) as QueryEngine)
      : QueryEngine.Instance;
  }

  // ─── Query Sync State ────────────────────────────────────────────

  /**
   * Initialize query sync state by loading cached metadata.
   * Resolves the latest version number and compares saved query SQL.
   */
  private async initQuerySyncState(): Promise<void> {
    const currentUser = this.ProviderToUse?.CurrentUser;
    // Ensure the artifact-type registry is loaded (not registered for startup).
    await this.artifactMetadataEngine.Config(false, currentUser);

    // Load THIS artifact's versions on demand (including Content, which
    // resolveEffectiveSavedAtVersion parses). Versions are no longer bulk-loaded
    // at boot — the payload here is bounded to a single artifact's versions.
    if (this.artifactVersion?.ArtifactID) {
      await this.artifactMetadataEngine.LoadVersionsForArtifact(
        this.artifactVersion.ArtifactID,
        currentUser,
        this.Provider ?? undefined,
      );
    }

    this.LatestVersionNumber = this.resolveLatestVersionNumber();

    // If the loaded versions don't yet include the one we're viewing (a newer
    // version was created after we first loaded), force a re-fetch and re-resolve.
    if (this.LatestVersionNumber < this.CurrentVersionNumber && this.artifactVersion?.ArtifactID) {
      await this.artifactMetadataEngine.LoadVersionsForArtifact(
        this.artifactVersion.ArtifactID,
        currentUser,
        this.Provider ?? undefined,
        true,
      );
      this.LatestVersionNumber = this.resolveLatestVersionNumber();
    }

    this.EffectiveSavedAtVersion = this.resolveEffectiveSavedAtVersion();
    await this.resolveSavedQuerySql();
    this.QuerySyncState = this.computeQuerySyncState();
  }

  /**
   * Determine the latest version number for this artifact: the greatest visible version when the
   * viewer passes {@link VisibleVersionNumbers}, otherwise the newest cached version.
   * Falls back to current version if cache miss.
   */
  private resolveLatestVersionNumber(): number {
    const visible = this.VisibleVersionNumbers;
    if (visible && visible.length > 0) {
      return Math.max(...visible);
    }

    if (!this.artifactVersion?.ArtifactID) {
      return this.CurrentVersionNumber;
    }

    const versions = this.artifactMetadataEngine.GetCachedVersionsForArtifact(this.artifactVersion.ArtifactID);
    if (versions.length > 0) {
      // GetCachedVersionsForArtifact returns DESC sorted
      return versions[0].VersionNumber || 1;
    }

    // Cache miss — current version is our best guess
    return this.CurrentVersionNumber;
  }

  /**
   * Scan all versions of this artifact to find the most recent savedAtVersionNumber
   * for the same savedQueryId. When viewing an older version, this tells the user
   * where the query was *actually* last updated, not just what this version's
   * snapshot recorded at the time.
   */
  private resolveEffectiveSavedAtVersion(): number | null {
    const queryId = this.spec?.savedQueryId;
    if (!queryId) return null;

    // Start with this version's own value
    let effective = this.spec?.savedAtVersionNumber ?? null;

    if (!this.artifactVersion?.ArtifactID) return effective;

    // GetCachedVersionsForArtifact returns DESC sorted — scan all versions
    const versions = this.artifactMetadataEngine.GetCachedVersionsForArtifact(this.artifactVersion.ArtifactID);
    for (const v of versions) {
      try {
        if (!v.Content) continue;
        const content = typeof v.Content === 'string' ? JSON.parse(v.Content) : v.Content;
        if (content.savedQueryId === queryId && content.savedAtVersionNumber != null) {
          const vSavedAt = content.savedAtVersionNumber as number;
          if (effective == null || vSavedAt > effective) {
            effective = vSavedAt;
          }
        }
      } catch {
        // Skip versions with unparseable content
      }
    }

    return effective;
  }

  /**
   * Look up the saved query's SQL from QueryEngine cache for comparison.
   * Only fetches if savedQueryId is present.
   */
  private async resolveSavedQuerySql(): Promise<void> {
    if (!this.spec?.savedQueryId) {
      this.savedQuerySql = null;
      return;
    }

    // QueryEngine is registered for startup, should already be loaded
    let query = QueryEngine.Instance.FindQueryByID(this.spec.savedQueryId);

    if (!query) {
      // Cache miss — force refresh and retry
      await QueryEngine.Instance.Config(true);
      query = QueryEngine.Instance.FindQueryByID(this.spec.savedQueryId);
    }

    this.savedQuerySql = query?.SQL ?? null;
  }

  /**
   * Compute the query sync state from current spec, version, and saved query SQL.
   * Implements the decision tree from the UX design.
   */
  private computeQuerySyncState(): QuerySyncState {
    const hasSavedQuery = !!this.spec?.savedQueryId;
    const isLatest = this.IsLatestVersion;

    if (!hasSavedQuery) {
      return isLatest ? 'no-query-latest' : 'no-query-older';
    }

    // Compare SQL (normalize whitespace for reliable comparison)
    const specSql = this.normalizeSql(this.spec?.metadata?.sql);
    const querySql = this.normalizeSql(this.savedQuerySql);
    const sqlMatches = specSql != null && querySql != null && specSql === querySql;

    // Only truly synced if SQL matches AND this is the version it was saved at.
    // Even with identical SQL, a newer version should show the dropdown so the
    // user can update the version association (re-save at current version).
    const savedAtCurrent = this.EffectiveSavedAtVersion === this.CurrentVersionNumber;
    if (sqlMatches && savedAtCurrent) {
      return 'synced';
    }

    // SQL differs — determine position relative to saved version
    if (isLatest) {
      return 'outdated-latest';
    }

    // Use effective saved-at (looks ahead through newer versions)
    const savedAt = this.EffectiveSavedAtVersion;
    if (savedAt != null && this.CurrentVersionNumber < savedAt) {
      return 'query-ahead'; // query was updated at a newer version
    }

    return 'query-behind'; // ahead of saved but not latest
  }

  /** Normalize SQL for comparison: trim and collapse whitespace */
  private normalizeSql(sql: string | null | undefined): string | null {
    if (sql == null) return null;
    return sql.trim().replace(/\s+/g, ' ');
  }

  // ─── Actions ────────────────────────────────────────────────────

  /** Navigate to the saved query in the Data Explorer's Queries browser */
  public OnOpenSavedQuery(): void {
    if (!this.spec?.savedQueryId) return;
    this.navigationRequest.emit({
      appName: 'Data Explorer',
      navItemName: 'Queries',
      queryParams: { queryId: this.spec.savedQueryId }
    });
  }

  /** Show the save panel for creating a brand-new query */
  public OnShowSaveDialog(): void {
    this.ShowSaveDialog = true;
  }

  /**
   * Update the existing saved query's SQL to match this version.
   * Only available from the latest version (Scenario 3).
   */
  public async OnUpdateExistingQuery(): Promise<void> {
    if (!this.spec?.savedQueryId || !this.spec.metadata?.sql) return;
    this.UpdateQueryError = null;
    this.UpdateQueryDiagnostics = [];

    this.IsSaving = true;
    this.SavingMessage = `Updating "${this.SavedQueryDisplayName}"...`;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries');
      const loaded = await query.Load(this.spec.savedQueryId);

      if (!loaded) {
        console.error('Failed to load saved query for update');
        this.UpdateQueryError = 'The saved query could not be loaded, so it was not updated.';
        return;
      }

      query.SQL = this.spec.metadata.sql;
      if (this.spec.plan?.trim()) {
        query.TechnicalDescription = this.spec.plan.trim();
      }
      const saved = await query.Save();

      if (saved) {
        // Persist query metadata on a new immutable artifact version (`N4`)
        this.spec.savedAtVersionNumber = this.CurrentVersionNumber + 1;
        await this.persistArtifactContent();

        // Refresh caches so future lookups see the updated data
        await this.queryEngine.Config(true, this.ProviderToUse?.CurrentUser);
        await this.artifactMetadataEngine.Config(true, this.ProviderToUse?.CurrentUser);

        this.savedQuerySql = this.spec.metadata.sql;
        this.EffectiveSavedAtVersion = this.CurrentVersionNumber;
        this.QuerySyncState = 'synced';
      } else {
        this.showUpdateFailure(query.LatestResult?.Message || query.LatestResult?.CompleteMessage);
      }
    } catch (error) {
      console.error('Failed to update saved query:', error);
      this.UpdateQueryError = error instanceof Error ? error.message : String(error);
    } finally {
      this.IsSaving = false;
      this.cdr.detectChanges();
    }
  }

  /** Why updating the saved query failed; `null` when the last update did not fail. */
  public UpdateQueryError: string | null = null;
  /** The server's findings when the query's rules refused the update (rule code, line, column, fix). */
  public UpdateQueryDiagnostics: QueryDiagnosticLine[] = [];

  /** Records why an update was refused: the findings and their headline, or the server's message. */
  private showUpdateFailure(message: string | null | undefined): void {
    const parsed = ParseQuerySaveMessage(message);
    const isRuleRefusal = parsed.Diagnostics.some(d => d.Code !== null);
    this.UpdateQueryDiagnostics = isRuleRefusal ? [...parsed.Diagnostics] : [];
    this.UpdateQueryError = isRuleRefusal
      ? (parsed.Headline ?? 'The saved query was not updated:')
      : (message?.trim() || 'The saved query could not be updated.');
  }

  /** Handle successful save from the dialog (both initial save and "save as new") */
  public async OnQuerySaved(event: SaveQueryResult): Promise<void> {
    this.ShowSaveDialog = false;
    this.UpdateQueryError = null;
    this.UpdateQueryDiagnostics = [];
    this.IsSaving = true;
    this.SavingMessage = 'Saving query...';
    this.cdr.detectChanges();

    try {
      // Persist query metadata on a new immutable artifact version (`N4`, `S-h`)
      this.spec!.savedQueryId = event.queryId;
      this.spec!.savedQueryName = event.queryName;

      // Persist and refresh caches (persistArtifactContent resolves latest VersionNumber & updates savedAtVersionNumber)
      await this.persistArtifactContent();
      await this.queryEngine.Config(true, this.ProviderToUse?.CurrentUser);
      await this.artifactMetadataEngine.Config(true, this.ProviderToUse?.CurrentUser);
      await this.ProviderToUse.Refresh();

      this.savedQuerySql = this.spec!.metadata?.sql ?? null;
      this.EffectiveSavedAtVersion = this.CurrentVersionNumber;
      this.QuerySyncState = 'synced';
    } catch (error) {
      console.error('Failed to save query:', error);
      this.UpdateQueryError = error instanceof Error ? error.message : String(error);
      this.UpdateQueryDiagnostics = [];
    } finally {
      this.IsSaving = false;
      this.cdr.detectChanges();
    }
  }

  /** Persist updated spec as a new immutable artifact version (`N4`, `S-h`). */
  private async persistArtifactContent(): Promise<void> {
    if (!this.artifactVersion || !this.spec) return;
    const md = this.ProviderToUse;
    if (!md) {
      throw new Error('Metadata provider is unavailable to persist artifact version.');
    }
    const currentUser = md.CurrentUser;
    let latestVersionNumber = this.CurrentVersionNumber;
    let baseName = this.artifactVersion.Name;
    let baseConfiguration = this.artifactVersion.Configuration;

    if (this.artifactVersion.ArtifactID) {
      const rv = RunView.FromMetadataProvider(md);
      const latestRes = await rv.RunView<{
        VersionNumber?: number;
        Name?: string | null;
        Configuration?: string | null;
      }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(this.artifactVersion.ArtifactID)}'`,
          Fields: ['VersionNumber', 'Name', 'Configuration'],
          OrderBy: 'VersionNumber DESC',
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        currentUser,
      );
      const latestRow = latestRes.Success ? latestRes.Results?.[0] : undefined;
      if (latestRow) {
        if (typeof latestRow.VersionNumber === 'number' && latestRow.VersionNumber > latestVersionNumber) {
          latestVersionNumber = latestRow.VersionNumber;
        }
        if (latestRow.Name) baseName = latestRow.Name;
        if (latestRow.Configuration !== undefined) baseConfiguration = latestRow.Configuration;
      }
    }

    const nextVersionNumber = latestVersionNumber + 1;
    this.spec.savedAtVersionNumber = nextVersionNumber;

    const nextVersion = await md.GetEntityObject<MJArtifactVersionEntity>(
      'MJ: Artifact Versions',
      currentUser,
    );
    nextVersion.NewRecord();
    nextVersion.ArtifactID = this.artifactVersion.ArtifactID;
    nextVersion.VersionNumber = nextVersionNumber;
    if (baseName) {
      nextVersion.Name = baseName;
    }
    if (currentUser?.ID) {
      nextVersion.UserID = currentUser.ID;
    }
    // Persisted Content is always JSON text here, so never copy File ContentMode without a FileID (`N9`).
    nextVersion.ContentMode = 'Text';
    nextVersion.MimeType = 'application/json';
    if (baseConfiguration !== undefined && baseConfiguration !== null) {
      nextVersion.Configuration = baseConfiguration;
    }
    nextVersion.Content = JSON.stringify(this.spec);
    nextVersion.Comments = 'Updated saved query metadata';
    const saved = await nextVersion.Save();
    if (!saved) {
      const msg =
        nextVersion.LatestResult?.CompleteMessage ||
        nextVersion.LatestResult?.Message ||
        'Failed to save new artifact version.';
      throw new Error(msg);
    }
    this.artifactVersion = nextVersion;
  }

  /**
   * Returns a DataSnapshot with live grid data, current page state,
   * and query sync state.
   */
  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    if (!this.spec) return null;

    const tables = NormalizeToTables(
      { ...this.spec } as Record<string, string | number | boolean | object | null | undefined>,
      this.spec.title || 'Results'
    );
    const activeTable = tables[this.ActiveTableIndex];

    if (activeTable) {
      // Override with live data for the active table
      if (this.IsLive) activeTable.rows = this.GridData;
      activeTable.pageNumber = this.PagerPageNumber;
      activeTable.metadata = {
        ...activeTable.metadata,
        ...(this.liveRowCount != null ? { rowCount: this.liveRowCount } : {}),
        ...(this.liveExecutionTime != null
          ? { executionTimeMs: this.liveExecutionTime } : {}),
        ...(this.PagerTotalRowCount > 0
          ? { totalAvailableRows: this.PagerTotalRowCount } : {}),
        pageSize: this.PagerPageSize
      };
    }

    return DataSnapshot.FromTables(tables, this.spec.title);
  }

  // ─── Export ─────────────────────────────────────────────────────

  /**
   * The Export menu: the active table's results as files (and as a live Excel workbook), the SQL,
   * and the places the query or its records can be saved.
   */
  public override GetExportOptions(): ArtifactExportOption[] {
    return [...this.resultExportOptions(), ...this.queryExportOptions(), ...this.saveAsExportOptions()];
  }

  public override async RunExport(key: string): Promise<void> {
    const resultFormat = RESULT_EXPORT_OPTIONS.find((option) => option.Key === key)?.Key;
    if (resultFormat) {
      return this.exportResults(resultFormat);
    }
    switch (key) {
      case 'excel-live':
        return this.openInExcel();
      case 'sql':
        return this.downloadSql();
      case 'saved-query-update':
        return this.OnUpdateExistingQuery();
      case 'live-sheet':
        return this.createLiveSheet();
      case 'saved-query':
      case 'saved-query-new':
        this.OnShowSaveDialog();
        break;
      case 'list':
        this.OnShowSaveAsList();
        break;
      default:
        return super.RunExport(key);
    }
    this.cdr.detectChanges();
  }

  /** Excel, CSV, JSON and Excel (live) of the active table, while its results are on screen. */
  private resultExportOptions(): ArtifactExportOption[] {
    const table = this.ActiveTable;
    if (!table || !this.HasData || this.IsLoading) {
      return [];
    }
    const options: ArtifactExportOption[] = [...RESULT_EXPORT_OPTIONS];
    if (this.ExcelAddinEnabled && this.offersSavedQueryTargets) {
      options.push({
        Key: 'excel-live',
        Label: 'Excel (live)',
        Icon: 'fa-solid fa-arrows-rotate',
        Description: 'Workbook that refreshes from MemberJunction',
        DisabledReason: this.savedQueryBlocker ?? this.missingParameterBlocker,
      });
    }
    const group = this.IsMultiTable ? `Results · ${table.name}` : 'Results';
    return options.map((option) => ({ ...option, Group: group }));
  }

  private queryExportOptions(): ArtifactExportOption[] {
    if (!this.getArtifactSql()) {
      return [];
    }
    return [{ Key: 'sql', Label: 'SQL (.sql)', Icon: 'fa-solid fa-database', Description: 'The query text', Group: 'Query' }];
  }

  /** Saved query (save, update or save new), List, and Live Sheet. */
  private saveAsExportOptions(): ArtifactExportOption[] {
    const options = this.savedQueryOptions();
    if (this.CanSaveAsList) {
      options.push({ Key: 'list', Label: 'List', Icon: 'fa-solid fa-list-check', Description: 'These records, kept up to date', Group: SAVE_AS_GROUP });
    }
    if (this.offersSavedQueryTargets) {
      options.push({
        Key: 'live-sheet',
        Label: 'Live Sheet',
        Icon: 'fa-solid fa-table-cells',
        Description: 'Spreadsheet artifact that stays current',
        Group: SAVE_AS_GROUP,
        DisabledReason: this.savedQueryBlocker,
      });
    }
    return options;
  }

  private savedQueryOptions(): ArtifactExportOption[] {
    if (!this.offersSavedQueryTargets) {
      return [];
    }
    if (this.QuerySyncState === 'no-query-latest') {
      return [SAVE_QUERY_OPTION];
    }
    if (this.QuerySyncState === 'outdated-latest') {
      const update: ArtifactExportOption = {
        Key: 'saved-query-update',
        Label: `Update “${this.SavedQueryDisplayName}”`,
        Icon: 'fa-solid fa-arrow-up-from-bracket',
        Description: 'Replace the saved SQL with this version',
        Group: SAVE_AS_GROUP,
      };
      return [update, NEW_SAVED_QUERY_OPTION];
    }
    return [];
  }

  /**
   * True when the menu offers the targets that save or read the saved query: the artifact has SQL,
   * and this is the latest version or the version the query was saved at.
   */
  private get offersSavedQueryTargets(): boolean {
    const state = this.QuerySyncState;
    return !!this.spec?.metadata?.sql && (state === 'no-query-latest' || state === 'synced' || state === 'outdated-latest');
  }

  /** Why Excel (live) and Live Sheet can't run yet: there is no saved query, or it is behind this version. */
  private get savedQueryBlocker(): string | undefined {
    return SAVED_QUERY_NEEDED[this.QuerySyncState];
  }

  private get missingParameterBlocker(): string | undefined {
    return HasRequiredParameterValues(this.spec?.parameters ?? null, this.savedQueryParameters)
      ? undefined
      : 'A required parameter has no value';
  }

  /** The saved query's parameter definitions. */
  private get savedQueryParameters(): MJQueryParameterEntity[] {
    const queryId = this.spec?.savedQueryId;
    return queryId ? this.queryEngine.GetQueryParameters(queryId) : [];
  }

  /** Asks the host, once per provider (the client caches the answer), whether it serves the Excel add-in. */
  private async resolveExcelAddinAvailability(): Promise<void> {
    try {
      this.ExcelAddinEnabled = await ExcelAddinClient.Instance.IsEnabled(this.ProviderToUse);
    } catch (error) {
      // The menu then leaves out Excel (live); the client already treats an unreadable status as off.
      console.warn('[DataArtifactViewer] Excel add-in status check failed:', error);
    }
  }

  /** Downloads a workbook that loads the saved query, with this artifact's parameter values, and refreshes it. */
  private async openInExcel(): Promise<void> {
    const queryId = this.spec?.savedQueryId;
    if (!queryId) {
      throw new Error('Save the query first.');
    }
    const parameters = ToExcelParameterValues(this.spec?.parameters ?? null, this.savedQueryParameters);
    const result = await ExcelAddinClient.Instance.OpenInExcel([{ Kind: 'Query', ID: queryId, Parameters: parameters }], this.ProviderToUse);
    if (!result.Success) {
      throw new Error(result.ErrorMessage || 'The workbook could not be built.');
    }
    MJNotificationService.Instance.CreateSimpleNotification(
      `Downloaded ${result.FileName}. Open it in Excel and sign in to load the data.`, 'success', 5000);
  }

  /**
   * Creates a Sheets artifact with a live table on the saved query, then asks the host to open it.
   * A host that does not open artifacts finds no nav item named '' and does nothing.
   */
  private async createLiveSheet(): Promise<void> {
    const queryId = this.spec?.savedQueryId;
    if (!queryId) {
      throw new Error('Save the query first.');
    }
    const helper = CreateLiveSheetHelperForProvider(this.ProviderToUse, this.ProviderToUse?.CurrentUser);
    if (!helper) {
      throw new Error('A live sheet needs a signed-in user on a server connection.');
    }
    const parameters = this.spec?.parameters;
    const result = await helper.CreateLiveSheetFromQuery({
      QueryID: queryId,
      QueryName: this.SavedQueryDisplayName,
      ...(parameters && Object.keys(parameters).length > 0 ? { Parameters: { ...parameters } } : {}),
    });
    if (!result.Success || !result.ArtifactID) {
      throw new Error(result.ErrorMessage || 'The live sheet could not be created.');
    }
    const name = result.ArtifactName || `${this.SavedQueryDisplayName} — Live Sheet`;
    MJNotificationService.Instance.CreateSimpleNotification(`Created "${name}". Opening it…`, 'success', 5000);
    this.navigationRequest.emit({ navItemName: '', ArtifactID: result.ArtifactID, ArtifactName: name });
  }

  /**
   * Every row of the active table, for export. A live query runs again without paging, up to
   * {@link EXPORT_MAX_ROWS} rows; inline rows are returned as they are.
   * Bound to the grid's `ExportDataProvider`, so it must stay an arrow function.
   */
  public readonly ExportAllRows = async (): Promise<Record<string, unknown>[]> => {
    const table = this.ActiveTable;
    const sql = table?.metadata?.sql;
    if (!sql) {
      return table?.rows ?? [];
    }
    const maxRows = DataArtifactViewerComponent.EXPORT_MAX_ROWS;
    const result = await this.RunQueryToUse.RunQuery({ SQL: sql, StartRow: 0, MaxRows: maxRows });
    if (!result.Success) {
      this.lastExportFetch = 'failed';
      throw new Error(result.ErrorMessage || 'Query failed');
    }
    this.lastExportFetch = result.Results.length >= maxRows ? 'capped' : 'complete';
    return result.Results;
  };

  /** Exports the active table through the results grid, which fetches every row through {@link ExportAllRows}. */
  private async exportResults(format: ResultExportFormat): Promise<void> {
    if (!this.ResultsGrid) {
      throw new Error('The results are not on screen yet.');
    }
    this.lastExportFetch = 'complete';
    const result = await this.ResultsGrid.Export({ format, fileName: this.exportFileName }, true);
    if (!result.success) {
      throw new Error(result.error || `The ${format} export failed.`);
    }
    this.notifyIfExportIncomplete();
  }

  /** The grid falls back to the rows on screen when the full fetch fails, so say when that happened. */
  private notifyIfExportIncomplete(): void {
    if (this.lastExportFetch === 'capped') {
      const cap = DataArtifactViewerComponent.EXPORT_MAX_ROWS.toLocaleString();
      MJNotificationService.Instance.CreateSimpleNotification(`Exported the first ${cap} rows. The query returns more.`, 'warning', 6000);
    } else if (this.lastExportFetch === 'failed') {
      MJNotificationService.Instance.CreateSimpleNotification('Could not run the query again, so the file has only the rows on screen.', 'warning', 6000);
    }
  }

  private downloadSql(): void {
    const sql = this.getArtifactSql();
    if (!sql) {
      throw new Error('This artifact has no SQL.');
    }
    this.DownloadTextFile(sql, `${this.exportFileName}.sql`, 'application/sql');
  }

  /** File name for exports, without the extension. */
  private get exportFileName(): string {
    return this.spec?.title?.trim() || 'query-results';
  }

  /** The artifact's SQL: every table's query with headers for a multi-table artifact, else the single query. */
  private getArtifactSql(): string | null {
    if (this.IsMultiTable) {
      return BuildMultiTableSql(this.ResolvedTables) || null;
    }
    return this.spec?.metadata?.sql || null;
  }

  // ─── Tabs ───────────────────────────────────────────────────────

  /**
   * Provide Plan tab (markdown), SQL tab (code), and Interpretation tab when available
   */
  public GetAdditionalTabs(): ArtifactViewerTab[] {
    const tabs: ArtifactViewerTab[] = [];

    if (this.spec?.plan) {
      tabs.push({
        label: 'Plan',
        icon: 'fa-diagram-project',
        contentType: 'markdown',
        content: this.spec.plan
      });
    }

    // SQL tab — multi-table shows all queries with headers
    const sql = this.getArtifactSql();
    if (sql) {
      tabs.push({
        label: 'SQL',
        icon: 'fa-database',
        contentType: 'code',
        language: 'sql',
        content: sql
      });
    }

    // Interpretation tab
    if (this.spec?.interpretation) {
      tabs.push({
        label: 'Interpretation',
        icon: 'fa-lightbulb',
        contentType: 'markdown',
        content: this.spec.interpretation
      });
    }

    return tabs;
  }
}
