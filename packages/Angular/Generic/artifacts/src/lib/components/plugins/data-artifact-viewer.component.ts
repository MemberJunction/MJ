import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunQuery, CompositeKey, KeyValuePair } from '@memberjunction/core';
import { QueryGridColumnConfig, QueryEntityLinkClickEvent, resolveTargetEntity } from '@memberjunction/ng-query-viewer';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab } from '../base-artifact-viewer.component';
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
  template: `
    <div class="data-artifact-viewer" [ngClass]="cssClass">
      @if (spec) {
        @if (HasData || IsLoading) {
          <!-- Toolbar -->
          <div class="data-toolbar">
            <div class="data-title">
              <i class="fas fa-table"></i>
              <span>{{ spec.title || 'Data Results' }}</span>
              @if (IsLive) {
                <span class="live-badge">Live</span>
              }
              @if (DisplayRowCount != null) {
                <span class="row-count">{{ DisplayRowCount }} rows</span>
              }
              @if (DisplayExecutionTime != null) {
                <span class="exec-time">{{ DisplayExecutionTime }}ms</span>
              }
            </div>
            <div class="data-actions">
              @if (IsLive) {
                <button class="btn-icon" title="Refresh data" (click)="OnRefresh()" [disabled]="IsLoading">
                  <i class="fas fa-sync-alt" [class.fa-spin]="IsLoading"></i> Refresh
                </button>
              }
              @if (CanSaveQuery) {
                <button class="btn-icon btn-save" title="Save as reusable query"
                  (click)="ShowSaveDialog = true">
                  <i class="fas fa-save"></i> Save Query
                </button>
              }
              @if (spec.savedQueryId) {
                <button class="btn-icon btn-open" title="Open saved query record"
                  (click)="OnOpenSavedQuery()">
                  <i class="fas fa-external-link-alt"></i> Open Query
                </button>
              }
            </div>
          </div>

          <!-- Grid -->
          <div class="grid-container">
            @if (IsLoading) {
              <mj-loading text="Loading data..."></mj-loading>
            } @else if (HasError && HasData) {
              <div class="error-banner">
                <i class="fas fa-exclamation-triangle"></i>
                <span>{{ ErrorMessage }}</span>
                <span class="fallback-note">(Showing cached data)</span>
              </div>
              <mj-query-data-grid
                [ColumnConfigs]="GridColumnConfigs"
                [Data]="GridData"
                [ShowToolbar]="false"
                [ShowRefresh]="false"
                [PersistState]="false"
                [SelectionMode]="'none'"
                (EntityLinkClick)="OnEntityLinkClick($event)"
                Height="100%">
              </mj-query-data-grid>
            } @else if (HasError) {
              <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>{{ ErrorMessage }}</p>
              </div>
            } @else {
              <mj-query-data-grid
                [ColumnConfigs]="GridColumnConfigs"
                [Data]="GridData"
                [ShowToolbar]="false"
                [ShowRefresh]="false"
                [PersistState]="false"
                [SelectionMode]="'none'"
                (EntityLinkClick)="OnEntityLinkClick($event)"
                Height="100%">
              </mj-query-data-grid>
            }
          </div>
        } @else if (spec.plan) {
          <!-- Plan-only view (no results yet) -->
          <div class="data-toolbar">
            <div class="data-title">
              <i class="fas fa-diagram-project"></i>
              <span>{{ spec.title || 'Query Plan' }}</span>
            </div>
          </div>
          <div class="plan-content">
            <mj-markdown
              [data]="spec.plan"
              [enableMermaid]="true"
              [enableHighlight]="true"
              [enableCollapsibleHeadings]="false"
              [enableSmartypants]="true">
            </mj-markdown>
          </div>
        } @else {
          <!-- No data and no plan -->
          <div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No data to display</p>
          </div>
        }
      } @else if (HasError) {
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>{{ ErrorMessage }}</p>
        </div>
      } @else {
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No data to display</p>
        </div>
      }

      <!-- Save Query Panel (slide-in) -->
      @if (ShowSaveDialog) {
        <mj-save-query-panel
          [QueryName]="spec?.title || 'Untitled Query'"
          [QueryDescription]="''"
          [SQL]="spec?.metadata?.sql || ''"
          (Saved)="OnQuerySaved($event)"
          (Cancelled)="ShowSaveDialog = false">
        </mj-save-query-panel>
      }
    </div>
  `,
  styles: [`
    .data-artifact-viewer {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .data-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }

    .data-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 13px;
      color: #333;
    }

    .data-title i {
      color: #6c757d;
    }

    .row-count {
      padding: 2px 8px;
      background: #e9ecef;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
      color: #495057;
    }

    .exec-time {
      padding: 2px 8px;
      background: #d4edda;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
      color: #155724;
    }

    .live-badge {
      padding: 2px 8px;
      background: #cce5ff;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      color: #004085;
    }

    .data-actions {
      display: flex;
      gap: 6px;
    }

    .btn-icon {
      padding: 4px 10px;
      background: white;
      border: 1px solid #ced4da;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      color: #495057;
    }

    .btn-icon:hover {
      background: #e9ecef;
      border-color: #adb5bd;
    }

    .btn-icon:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-icon.btn-save {
      color: #16a34a;
      border-color: #86efac;
    }

    .btn-icon.btn-save:hover {
      background: #f0fdf4;
      border-color: #16a34a;
    }

    .btn-icon.btn-open {
      color: #2563eb;
      border-color: #93c5fd;
    }

    .btn-icon.btn-open:hover {
      background: #eff6ff;
      border-color: #2563eb;
    }

    .grid-container {
      flex: 1;
      overflow: hidden;
      min-height: 200px;
      height: 500px;
    }

    .error-banner {
      padding: 8px 12px;
      background: #fff3cd;
      border-bottom: 1px solid #ffc107;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #856404;
    }

    .fallback-note {
      font-style: italic;
      color: #6c757d;
    }

    .empty-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: #6c757d;
      text-align: center;
      gap: 12px;
    }

    .empty-state i, .error-state i {
      font-size: 32px;
    }

    .error-state {
      color: #dc3545;
    }

    .plan-content {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }
  `]
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'DataArtifactViewerPlugin')
export class DataArtifactViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  public spec: DataArtifactSpec | null = null;
  public GridData: Record<string, unknown>[] = [];
  public GridColumnConfigs: QueryGridColumnConfig[] | null = null;
  public IsLoading = false;
  public IsLive = false;
  public HasError = false;
  public ErrorMessage = '';
  public ShowSaveDialog = false;

  /** Metadata from live execution (overrides spec.metadata when live) */
  private liveRowCount: number | null = null;
  private liveExecutionTime: number | null = null;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  public override get hasDisplayContent(): boolean {
    return this.spec != null && (this.HasData || this.IsLoading || !!this.spec.plan);
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

      // If SQL is available, execute it live
      if (this.spec.metadata?.sql) {
        await this.LoadLiveData();
      } else if (this.HasInlineData) {
        // Fall back to embedded rows
        this.GridData = this.spec.rows!;
      }
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

  /** Whether this query can be saved (has SQL but hasn't been saved yet) */
  public get CanSaveQuery(): boolean {
    return !!this.spec?.metadata?.sql && !this.spec?.savedQueryId;
  }

  /** Open the saved query's entity record */
  public OnOpenSavedQuery(): void {
    if (!this.spec?.savedQueryId) return;
    const compositeKey = new CompositeKey([
      new KeyValuePair('ID', this.spec.savedQueryId)
    ]);
    this.openEntityRecord.emit({
      entityName: 'MJ: Queries',
      compositeKey
    });
  }

  /** Handle successful save from the dialog */
  public async OnQuerySaved(event: SaveQueryResult): Promise<void> {
    this.ShowSaveDialog = false;

    // Mutate spec to record the saved query
    this.spec!.savedQueryId = event.queryId;
    this.spec!.savedQueryName = event.queryName;

    // Persist updated content to artifact version
    await this.UpdateArtifactContent();
    this.cdr.detectChanges();
  }

  /** Persist updated spec back to the artifact version entity */
  private async UpdateArtifactContent(): Promise<void> {
    if (!this.artifactVersion || !this.spec) return;
    this.artifactVersion.Content = JSON.stringify(this.spec);
    await this.artifactVersion.Save();
  }

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
