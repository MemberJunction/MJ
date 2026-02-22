import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunQuery, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { QueryEngine, ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { QueryGridColumnConfig, QueryEntityLinkClickEvent, resolveTargetEntity } from '@memberjunction/ng-query-viewer';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab, NavigationRequest } from '../base-artifact-viewer.component';
import { SaveQueryResult } from './save-query-dialog.component';

/**
 * JSON schema for Data artifact content.
 * The agent produces this structure when emitting query/view results.
 */
interface DataArtifactSpec {
  /** Data source type */
  source: 'query' | 'view';

  /** Display title for the data */
  title?: string;

  /** For query source: the query ID to render via mj-query-viewer */
  queryId?: string;

  /** For query source: parameter values to pass */
  parameters?: Record<string, string | number | boolean>;

  /** For view source: the entity name */
  entityName?: string;

  /** For view source: extra WHERE filter */
  extraFilter?: string;

  /** Column definitions for inline data display */
  columns?: DataArtifactColumn[];

  /** Inline row data (when results are embedded directly) */
  rows?: Record<string, unknown>[];

  /** Optional markdown plan/approach description (mermaid diagrams, explanations) */
  plan?: string;

  /** Query metadata */
  metadata?: {
    sql?: string;
    rowCount?: number;
    executionTimeMs?: number;
  };

  /** ID of saved query (set after user saves from artifact) */
  savedQueryId?: string;

  /** Name of saved query (for display) */
  savedQueryName?: string;

  /** Version number this query was saved/updated from */
  savedAtVersionNumber?: number;
}

interface DataArtifactColumn {
  field: string;
  headerName?: string;
  width?: number;

  /** MJ entity name this column originates from (e.g., "Members") */
  sourceEntity?: string;

  /** Field name in that entity (e.g., "ID", "FirstName") */
  sourceFieldName?: string;

  /** True for calculated expressions (CASE, ROUND, CONCAT, etc.) */
  isComputed?: boolean;

  /** True for aggregate functions (SUM, COUNT, AVG, etc.) */
  isSummary?: boolean;

  /** SQL data type: int, nvarchar, uniqueidentifier, datetime, decimal, bit, money, etc. */
  sqlBaseType?: string;
}

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
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() override navigationRequest = new EventEmitter<NavigationRequest>();
  public override tabsChanged = new EventEmitter<void>();

  public spec: DataArtifactSpec | null = null;
  public GridData: Record<string, unknown>[] = [];
  public GridColumnConfigs: QueryGridColumnConfig[] | null = null;
  public IsLoading = false;
  public IsLive = false;
  public HasError = false;
  public ErrorMessage = '';
  public ShowSaveDialog = false;
  public ShowUpdateDropdown = false;
  public IsSaving = false;
  public SavingMessage = '';

  /** Query sync state — drives the toolbar UI for saved query actions */
  public QuerySyncState: QuerySyncState = 'no-query-latest';

  /** Latest version number for this artifact (from cache) */
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
    return this.spec != null && (this.HasData || this.IsLoading);
  }

  public override get parentShouldShowRawContent(): boolean {
    return true;
  }

  public get HasData(): boolean {
    return this.GridData.length > 0;
  }

  public get HasInlineData(): boolean {
    return !!(this.spec?.rows && this.spec.rows.length > 0);
  }

  public get DisplayRowCount(): number | null {
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

      // Build enriched column configs from agent metadata (if available)
      this.GridColumnConfigs = this.BuildColumnConfigs();

      // Set loading early (synchronously) so hasDisplayContent is true immediately.
      // This ensures the Display tab is available when onPluginLoaded fires,
      // showing a loading indicator instead of briefly flashing the Plan tab.
      if (this.spec.metadata?.sql || this.HasInlineData) {
        this.IsLoading = true;
      }

      // Load cached metadata and resolve query sync state
      await this.InitQuerySyncState();

      // If SQL is available, execute it live
      if (this.spec.metadata?.sql) {
        await this.LoadLiveData();
      } else if (this.HasInlineData) {
        // Fall back to embedded rows
        this.GridData = this.spec.rows!;
        this.IsLoading = false;
      }

      // Signal parent that tabs/display content may have changed after async load
      this.tabsChanged.emit();
    } catch (error) {
      this.HasError = true;
      this.ErrorMessage = error instanceof Error ? error.message : 'Failed to load data';
    }
  }

  /**
   * Re-execute the live SQL query
   */
  public async OnRefresh(): Promise<void> {
    if (this.spec?.metadata?.sql) {
      await this.LoadLiveData();
    }
  }

  /**
   * Handle entity link click from the grid and bubble up as openEntityRecord.
   * Converts the grid's recordId string into a CompositeKey for the artifact viewer pipeline.
   */
  public OnEntityLinkClick(event: QueryEntityLinkClickEvent): void {
    const compositeKey = new CompositeKey([
      new KeyValuePair('ID', event.recordId)
    ]);
    this.openEntityRecord.emit({
      entityName: event.entityName,
      compositeKey
    });
  }

  /**
   * Execute the SQL query via RunQuery and populate the grid.
   * Falls back to inline data on error.
   */
  private async LoadLiveData(): Promise<void> {
    this.IsLoading = true;
    this.HasError = false;
    this.cdr.detectChanges();

    try {
      const rq = new RunQuery();
      const result = await rq.RunQuery({ SQL: this.spec!.metadata!.sql! });

      if (result.Success) {
        this.GridData = result.Results;
        this.liveRowCount = result.RowCount;
        this.liveExecutionTime = result.ExecutionTime;
        this.IsLive = true;
      } else {
        this.HandleQueryError(result.ErrorMessage || 'Query execution failed');
      }
    } catch (error) {
      this.HandleQueryError(error instanceof Error ? error.message : 'Query execution failed');
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Build QueryGridColumnConfig[] from enriched artifact column metadata.
   * Returns null if columns have no entity metadata (grid falls back to auto-inference).
   */
  private BuildColumnConfigs(): QueryGridColumnConfig[] | null {
    if (!this.spec?.columns?.length) return null;

    // Only build if at least one column has entity metadata or type info
    const hasMetadata = this.spec.columns.some(c => c.sourceEntity || c.sqlBaseType);
    if (!hasMetadata) return null;

    const md = new Metadata();
    return this.spec.columns.map((col, index) => {
      const target = resolveTargetEntity(col.sourceEntity, col.sourceFieldName, md);
      const isEntityLink = !!(target.targetEntityName && (target.isPrimaryKey || target.isForeignKey));
      const baseType = (col.sqlBaseType || 'nvarchar').toLowerCase();

      let align: 'left' | 'center' | 'right' = 'left';
      if (['int', 'bigint', 'decimal', 'numeric', 'float', 'money', 'smallmoney', 'real'].includes(baseType)) {
        align = 'right';
      } else if (baseType === 'bit') {
        align = 'center';
      }

      return {
        field: col.field,
        title: col.headerName || col.field,
        visible: true,
        sortable: true,
        resizable: true,
        reorderable: true,
        sqlBaseType: col.sqlBaseType || 'nvarchar',
        sqlFullType: col.sqlBaseType || 'nvarchar',
        align,
        order: index,
        sourceEntityName: col.sourceEntity,
        sourceFieldName: col.sourceFieldName,
        isEntityLink,
        targetEntityName: target.targetEntityName,
        targetEntityId: target.targetEntityId,
        targetEntityIcon: target.targetEntityIcon,
        isPrimaryKey: target.isPrimaryKey,
        isForeignKey: target.isForeignKey,
        pinned: null,
      } as QueryGridColumnConfig;
    });
  }

  /**
   * Handle a query error by setting error state and falling back to inline data
   */
  private HandleQueryError(message: string): void {
    this.HasError = true;
    this.ErrorMessage = message;
    if (this.HasInlineData) {
      this.GridData = this.spec!.rows!;
    }
  }

  // ─── Query Sync State ────────────────────────────────────────────

  /**
   * Initialize query sync state by loading cached metadata.
   * Resolves the latest version number and compares saved query SQL.
   */
  private async InitQuerySyncState(): Promise<void> {
    // Ensure artifact cache is loaded (not registered for startup)
    await ArtifactMetadataEngine.Instance.Config(false);

    this.LatestVersionNumber = this.resolveLatestVersionNumber();

    // If cache is stale (doesn't know about the version we're viewing),
    // force-refresh and re-resolve. This happens when new versions are
    // created during a conversation after the cache was first loaded.
    if (this.LatestVersionNumber < this.CurrentVersionNumber) {
      await ArtifactMetadataEngine.Instance.Config(true);
      this.LatestVersionNumber = this.resolveLatestVersionNumber();
    }

    this.EffectiveSavedAtVersion = this.resolveEffectiveSavedAtVersion();
    await this.resolveSavedQuerySql();
    this.QuerySyncState = this.computeQuerySyncState();
  }

  /**
   * Determine the latest version number for this artifact from cache.
   * Falls back to current version if cache miss.
   */
  private resolveLatestVersionNumber(): number {
    if (!this.artifactVersion?.ArtifactID) {
      return this.CurrentVersionNumber;
    }

    const versions = ArtifactMetadataEngine.Instance.GetVersionsForArtifact(this.artifactVersion.ArtifactID);
    if (versions.length > 0) {
      // GetVersionsForArtifact returns DESC sorted
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

    // GetVersionsForArtifact returns DESC sorted — scan all versions
    const versions = ArtifactMetadataEngine.Instance.GetVersionsForArtifact(this.artifactVersion.ArtifactID);
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
    this.ShowUpdateDropdown = false;
  }

  /** Toggle the update query dropdown */
  public OnToggleUpdateDropdown(): void {
    this.ShowUpdateDropdown = !this.ShowUpdateDropdown;
  }

  /** Close the dropdown (e.g., on outside click) */
  public OnCloseDropdown(): void {
    this.ShowUpdateDropdown = false;
  }

  /**
   * Update the existing saved query's SQL to match this version.
   * Only available from the latest version (Scenario 3).
   */
  public async OnUpdateExistingQuery(): Promise<void> {
    this.ShowUpdateDropdown = false;
    if (!this.spec?.savedQueryId || !this.spec.metadata?.sql) return;

    this.IsSaving = true;
    this.SavingMessage = `Updating "${this.SavedQueryDisplayName}"...`;
    this.cdr.detectChanges();

    try {
      const md = new Metadata();
      const query = await md.GetEntityObject<import('@memberjunction/core-entities').MJQueryEntity>('MJ: Queries');
      const loaded = await query.Load(this.spec.savedQueryId);

      if (!loaded) {
        console.error('Failed to load saved query for update');
        return;
      }

      query.SQL = this.spec.metadata.sql;
      const saved = await query.Save();

      if (saved) {
        // Update spec with new version tracking
        this.spec.savedAtVersionNumber = this.CurrentVersionNumber;
        await this.PersistArtifactContent();

        // Refresh caches so future lookups see the updated data
        await QueryEngine.Instance.Config(true);
        await ArtifactMetadataEngine.Instance.Config(true);

        this.savedQuerySql = this.spec.metadata.sql;
        this.EffectiveSavedAtVersion = this.CurrentVersionNumber;
        this.QuerySyncState = 'synced';
      }
    } catch (error) {
      console.error('Failed to update saved query:', error);
    } finally {
      this.IsSaving = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Save as a new query (from the dropdown).
   * Opens the save dialog which creates a fresh query record.
   */
  public OnSaveAsNewQuery(): void {
    this.ShowUpdateDropdown = false;
    this.ShowSaveDialog = true;
  }

  /** Handle successful save from the dialog (both initial save and "save as new") */
  public async OnQuerySaved(event: SaveQueryResult): Promise<void> {
    this.ShowSaveDialog = false;
    this.IsSaving = true;
    this.SavingMessage = 'Saving query...';
    this.cdr.detectChanges();

    try {
      // Update spec with saved query info and version tracking
      this.spec!.savedQueryId = event.queryId;
      this.spec!.savedQueryName = event.queryName;
      this.spec!.savedAtVersionNumber = this.CurrentVersionNumber;

      // Persist and refresh caches
      await this.PersistArtifactContent();
      await QueryEngine.Instance.Config(true);
      await ArtifactMetadataEngine.Instance.Config(true);

      this.savedQuerySql = this.spec!.metadata?.sql ?? null;
      this.EffectiveSavedAtVersion = this.CurrentVersionNumber;
      this.QuerySyncState = 'synced';
    } catch (error) {
      console.error('Failed to save query:', error);
    } finally {
      this.IsSaving = false;
      this.cdr.detectChanges();
    }
  }

  /** Persist updated spec back to the artifact version entity */
  private async PersistArtifactContent(): Promise<void> {
    if (!this.artifactVersion || !this.spec) return;
    this.artifactVersion.Content = JSON.stringify(this.spec);
    await this.artifactVersion.Save();
  }

  // ─── Tabs ───────────────────────────────────────────────────────

  /**
   * Provide Plan tab (markdown) and SQL tab (code) when available
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

    if (this.spec?.metadata?.sql) {
      tabs.push({
        label: 'SQL',
        icon: 'fa-database',
        contentType: 'code',
        language: 'sql',
        content: this.spec.metadata.sql
      });
    }

    return tabs;
  }
}
