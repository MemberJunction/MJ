import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { NavigationService } from '@memberjunction/ng-shared';
import {
  MJButtonDirective,
  MJViewToggleComponent,
  MjSlidePanelComponent,
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CompositeKey, LogError, RunView, EntityRecordNameInput, EntityRecordNameResult } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { MJProcessRunDetailEntity, MJMLModelEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { AgGridModule } from 'ag-grid-angular';
import {
  AllCommunityModule,
  CellClickedEvent,
  ColDef,
  GetRowIdParams,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ICellRendererParams,
  IRowNode,
  ModuleRegistry,
  RowClickedEvent,
  Theme,
  themeAlpine,
} from 'ag-grid-community';

import {
  parseAtRiskRows,
  type RowDriver,
} from '../at-risk.view-models';
import {
  PredictiveStudioScoreHistoryService,
  type ModelScoreHistoryPoint,
} from '../predictive-studio-score-history.service';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';

ModuleRegistry.registerModules([AllCommunityModule]);

/** One displayed prediction row in the unified grid. */
export interface PredictionGridRow {
  recordId: string;
  recordName: string;
  score: number;
  scoreFormatted: string;
  riskPct: number;
  band: 'high' | 'medium' | 'low';
  class: string | null;
  drivers: RowDriver[];
  status: string;
  scoredAtDate: Date | null;
}

interface HistogramBin {
  idx: number;
  label: string;
  shortLabel: string;
  count: number;
  pct: number;
  pctFormatted: string;
  height: number;
  color: string;
  riskLabel: string;
}

interface ClassShare {
  name: string;
  count: number;
  pct: number;
  color: string;
}

interface TrendlinePlotPoint {
  runId: string;
  x: number;
  y: number;
  scoreFormatted: string;
  dateStr: string;
  class: string | null;
  color: string;
}

/**
 * **PSPredictionsGridComponent** — Unified enterprise grid and analytics component for
 * model predictions. Shared between:
 *   1. **Predictions tab** (`PSPredictionsResourceComponent`) — business view of all at-risk records.
 *   2. **Models tab** (`PSProductionComponent`) — analyst run drill-in view.
 *
 * Supports:
 *   - Virtualized AG Grid scrolling for thousands of rows (no artificial 50/200 cap).
 *   - Automatic target entity record display name resolution (e.g. member/customer names).
 *   - Direct drill-through to the entity record in MemberJunction Explorer.
 *   - Slide-in detail drawer (`mj-slide-panel`) with local explainability and historical trendlines across runs.
 *   - Segmented view toggle (`mj-view-toggle`) between Grid View and Chart View (10-decile histogram + risk tiers).
 */
@Component({
  standalone: true,
  selector: 'ps-predictions-grid',
  templateUrl: './ps-predictions-grid.component.html',
  styleUrls: ['../predictive-studio.shared.css', './ps-predictions-grid.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    MJButtonDirective,
    MJViewToggleComponent,
    MjSlidePanelComponent,
    AgGridModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSPredictionsGridComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  @Input() modelId: string | null = null;
  @Input() runId: string | null = null;
  @Input() entityName: string | null = null;
  @Input() problemType: string | null = 'classification';
  @Input() title: string | null = null;
  @Input() height = '560px';
  @Input() readOnly = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly navigationService = inject(NavigationService);
  private readonly scoreHistoryService = inject(PredictiveStudioScoreHistoryService);

  public readonly Math = Math;

  public isLoading = false;
  public loadError: string | null = null;

  public allRows: PredictionGridRow[] = [];
  public filteredRows: PredictionGridRow[] = [];

  public searchText = '';
  public selectedTier: 'all' | 'high' | 'medium' | 'low' = 'all';

  public activeView: 'grid' | 'chart' = 'grid';
  public readonly viewOptions = [
    { key: 'grid', icon: 'fa-solid fa-table', title: 'Grid View' },
    { key: 'chart', icon: 'fa-solid fa-chart-column', title: 'Chart View' },
  ];

  // Slide-in detail state
  public detailOpen = false;
  public drawerWidthPx = 640;
  public selectedRow: PredictionGridRow | null = null;
  public historyLoading = false;
  public historyPoints: ModelScoreHistoryPoint[] = [];

  public resolvedEntityId: string | null = null;
  public resolvedEntityName: string | null = null;

  public subjectEntityName: string | null = null;
  public subjectRecordId: string | null = null;
  public subjectRecordName: string | null = null;

  private gridApi: GridApi<PredictionGridRow> | null = null;

  // Viewport-visible record name lookup cache and state
  private recordNameCache = new Map<string, string>();
  private inFlightLookups = new Set<string>();
  private visibleLookupDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── AG Grid Configuration ──
  public Theme: Theme = themeAlpine.withParams({
    backgroundColor: 'var(--mj-bg-surface)',
    foregroundColor: 'var(--mj-text-primary)',
    textColor: 'var(--mj-text-primary)',
    borderColor: 'var(--mj-border-default)',
    chromeBackgroundColor: 'var(--mj-bg-surface-card)',
    headerBackgroundColor: 'var(--mj-bg-surface-card)',
    headerTextColor: 'var(--mj-text-secondary)',
    cellTextColor: 'var(--mj-text-primary)',
    subtleTextColor: 'var(--mj-text-muted)',
    dataBackgroundColor: 'var(--mj-bg-surface)',
    oddRowBackgroundColor: 'var(--mj-bg-surface-card)',
    rowHoverColor: 'var(--mj-bg-surface-hover, color-mix(in srgb, var(--mj-brand-primary) 5%, var(--mj-bg-surface)))',
    selectedRowBackgroundColor: 'color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface))',
    accentColor: 'var(--mj-brand-primary)',
    borderRadius: 'var(--mj-radius-sm)',
    browserColorScheme: 'inherit',
  });

  public GridOptions: GridOptions<PredictionGridRow> = {
    animateRows: true,
    rowHeight: 46,
    headerHeight: 40,
    suppressCellFocus: true,
    enableCellTextSelection: true,
    suppressNoRowsOverlay: true,
    rowSelection: { mode: 'singleRow', enableClickSelection: false },
    getRowId: (params: GetRowIdParams<PredictionGridRow>) => params.data.recordId,
    onBodyScrollEnd: () => this.scheduleVisibleRowsLookup(),
    onViewportChanged: () => this.scheduleVisibleRowsLookup(),
    onFirstDataRendered: () => this.scheduleVisibleRowsLookup(),
    onModelUpdated: () => this.scheduleVisibleRowsLookup(),
    onCellClicked: (event: CellClickedEvent<PredictionGridRow>) => this.onCellClicked(event),
  };

  public defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    minWidth: 80,
  };

  public isRenewalModel = false;
  public selectedDecileIndex: number | null = null;

  public columnDefs: ColDef<PredictionGridRow>[] = [];

  public setupColumnDefs(): void {
    const isRenewal = this.isRenewalModel;
    this.columnDefs = [
      {
        field: 'recordName',
        headerName: 'Record',
        flex: 2,
        minWidth: 220,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data) return '';
          const hasCustomName = Boolean(params.data.recordName && params.data.recordName !== params.data.recordId);
          const name = this.escapeHtml(params.data.recordName || params.data.recordId);
          const id = this.escapeHtml(params.data.recordId);
          return `
            <div class="pg-record-cell">
              <div class="pg-record-title-row">
                <a class="pg-record-link" data-action="open-record" href="javascript:void(0)" title="Open record in Explorer">
                  <span class="pg-record-name">${name}</span>
                  <i class="fa-solid fa-arrow-up-right-from-square pg-record-open-icon"></i>
                </a>
              </div>
              ${hasCustomName ? `<span class="pg-record-id ps-mono" title="${id}">${id}</span>` : ''}
            </div>
          `;
        },
      },
      {
        field: 'score',
        headerName: isRenewal ? 'Renewal Probability' : 'Prediction Score',
        width: 175,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data) return '';
          const pct = Math.min(100, Math.max(0, Math.round(params.data.score * 100)));
          const band = params.data.band;
          const colorClass = isRenewal
            ? (band === 'low' ? 'risk-low' : band === 'medium' ? 'risk-medium' : 'risk-high')
            : (band === 'high' ? 'risk-high' : band === 'medium' ? 'risk-medium' : 'risk-low');
          const formatted = this.escapeHtml(params.data.scoreFormatted);
          return `
            <div class="pg-score-cell">
              <span class="pg-score-pct ${colorClass}">${formatted}</span>
              <div class="pg-score-bar-track">
                <div class="pg-score-bar-fill ${colorClass}" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        },
      },
      {
        field: 'riskPct',
        headerName: 'Risk Level',
        width: 140,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data) return '';
          const band = params.data.band;
          const riskPct = params.data.riskPct;
          if (band === 'high') {
            return `<span class="ps-badge red" title="${riskPct}% Churn Risk"><i class="fa-solid fa-circle-exclamation"></i> High Risk (${riskPct}%)</span>`;
          } else if (band === 'medium') {
            return `<span class="ps-badge amber" title="${riskPct}% Churn Risk"><i class="fa-solid fa-triangle-exclamation"></i> Med Risk (${riskPct}%)</span>`;
          } else {
            return `<span class="ps-badge green" title="${riskPct}% Churn Risk"><i class="fa-solid fa-circle-check"></i> Low Risk (${riskPct}%)</span>`;
          }
        },
      },
      {
        field: 'class',
        headerName: 'Predicted Outcome',
        width: 135,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data || !params.data.class) return '<span class="ps-muted">—</span>';
          const cls = this.escapeHtml(params.data.class);
          const lower = cls.toLowerCase();
          if (lower === 'renewed' || lower === 'active') {
            return `<span class="ps-badge green"><i class="fa-solid fa-check"></i> ${cls}</span>`;
          } else if (lower === 'lapsed' || lower === 'cancelled' || lower === 'churn') {
            return `<span class="ps-badge red"><i class="fa-solid fa-xmark"></i> ${cls}</span>`;
          }
          return `<span class="ps-badge gray">${cls}</span>`;
        },
      },
      {
        field: 'drivers',
        headerName: 'Key Factors',
        flex: 2,
        minWidth: 220,
        sortable: false,
        cellDataType: false,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data || !params.data.drivers || params.data.drivers.length === 0) {
            return '<span class="ps-muted">—</span>';
          }
          const chips = params.data.drivers.slice(0, 2).map((d) => {
            const cls = d.up ? 'up' : 'down';
            const icon = d.up ? 'fa-arrow-up' : 'fa-arrow-down';
            const label = this.escapeHtml(d.label);
            return `<span class="ps-why-chip ${cls}" title="${label}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
          }).join('');
          return `<div class="pg-drivers-cell">${chips}</div>`;
        },
      },
      {
        field: 'scoredAtDate',
        headerName: 'Scored At',
        width: 145,
        comparator: (_a: Date | null, _b: Date | null, nodeA, nodeB): number =>
          (nodeA.data?.scoredAtDate?.getTime() ?? 0) - (nodeB.data?.scoredAtDate?.getTime() ?? 0),
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data || !params.data.scoredAtDate) return '<span class="ps-muted">—</span>';
          const d = params.data.scoredAtDate;
          return `<span class="ps-small ps-muted">${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
        },
      },
      {
        headerName: '',
        width: 50,
        sortable: false,
        resizable: false,
        cellRenderer: (): string => {
          return `<button class="pg-action-btn" title="View details & score history"><i class="fa-solid fa-chevron-right"></i></button>`;
        },
      },
    ];

    if (this.gridApi) {
      this.gridApi.setGridOption('columnDefs', this.columnDefs);
    }
  }

  ngOnInit(): void {
    const pref = UserInfoEngine.Instance.GetSetting('mj.predictiveStudio.predictions.drawerWidth');
    if (pref) {
      const w = parseInt(pref, 10);
      if (!isNaN(w) && w >= 360 && w <= 1400) {
        this.drawerWidthPx = w;
      }
    }
    this.setupColumnDefs();
    void this.loadPredictions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['modelId'] && !changes['modelId'].firstChange) ||
      (changes['runId'] && !changes['runId'].firstChange) ||
      (changes['entityName'] && !changes['entityName'].firstChange)
    ) {
      void this.loadPredictions();
    }
  }

  ngOnDestroy(): void {
    if (this.visibleLookupDebounceTimer) {
      clearTimeout(this.visibleLookupDebounceTimer);
      this.visibleLookupDebounceTimer = null;
    }
    this.recordNameCache.clear();
    this.inFlightLookups.clear();
    this.gridApi = null;
  }

  // ── Data Loading & Name Resolution ──

  public async reload(): Promise<void> {
    await this.loadPredictions();
  }

  private async loadPredictions(): Promise<void> {
    if (!this.modelId && !this.runId) {
      this.allRows = [];
      this.applyFilter();
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.cdr.markForCheck();

    try {
      const provider = this.ProviderToUse;
      const user = provider.CurrentUser ?? undefined;

      // 1. Resolve effective run ID and model entity
      let effectiveRunId = this.runId;
      let model: MJMLModelEntity | null = null;

      if (this.modelId) {
        const modelsRes = await RunView.FromMetadataProvider(provider).RunView<MJMLModelEntity>(
          {
            EntityName: 'MJ: ML Models',
            ExtraFilter: `ID = '${this.modelId.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
          },
          user,
        );
        model = modelsRes.Success && modelsRes.Results ? modelsRes.Results[0] : null;
      }

      if (!effectiveRunId && this.modelId) {
        // Query latest process run for this model using engine
        try {
          const engine = PredictiveStudioEngine.Instance;
          const runs = await engine.LoadRecentRunsForModel(this.modelId, provider, user, { maxRows: 1 });
          if (runs && runs.length > 0) {
            effectiveRunId = runs[0].ID;
          }
        } catch {
          // Fallback if engine is not yet primed
        }
      }

      if (!effectiveRunId) {
        this.allRows = [];
        this.applyFilter();
        this.isLoading = false;
        this.cdr.markForCheck();
        return;
      }

      // 2. Resolve target entity
      await this.resolveTargetEntity(model);

      // 3. Load full process run details (removing 50/200 cap)
      const detailsRes = await RunView.FromMetadataProvider(provider).RunView<MJProcessRunDetailEntity>(
        {
          EntityName: 'MJ: Process Run Details',
          ExtraFilter: `ProcessRunID = '${effectiveRunId.replace(/'/g, "''")}'`,
          OrderBy: '__mj_CreatedAt ASC',
          MaxRows: 10000,
          ResultType: 'entity_object',
        },
        user,
      );

      if (!detailsRes.Success || !detailsRes.Results) {
        this.allRows = [];
        this.applyFilter();
        this.isLoading = false;
        this.cdr.markForCheck();
        return;
      }

      // 4. Determine polarity and parse per-record predictions
      const isInverted = this.checkIsInvertedRisk(
        detailsRes.Results.map((d) => d.ResultPayload),
        model,
      );
      this.isRenewalModel = isInverted;
      this.setupColumnDefs();

      const parsedAtRisk = parseAtRiskRows(
        detailsRes.Results.map((d) => ({ recordId: d.RecordID, ResultPayload: d.ResultPayload })),
        { invertedRisk: isInverted },
      );

      // Map details into indexed lookup for scoredAt timestamp
      const detailByRecord = new Map<string, MJProcessRunDetailEntity>();
      for (const d of detailsRes.Results) {
        detailByRecord.set(NormalizeUUID(d.RecordID), d);
      }

      this.allRows = parsedAtRisk.map((r) => {
        const detail = detailByRecord.get(NormalizeUUID(r.recordId));
        const dt = detail?.CompletedAt ?? detail?.__mj_CreatedAt ?? null;
        return {
          recordId: r.recordId,
          recordName: r.label ?? r.recordId,
          score: r.score,
          scoreFormatted: (r.score * 100).toFixed(1) + '%',
          riskPct: r.riskPct,
          band: r.band,
          class: r.class,
          drivers: r.drivers ?? [],
          status: detail?.Status ?? 'Succeeded',
          scoredAtDate: dt instanceof Date ? dt : dt ? new Date(dt) : null,
        };
      });

      this.applyFilter();

      // 5. Schedule lazy lookup of record names for visible rows
      this.scheduleVisibleRowsLookup(0);
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err);
      LogError(`PSPredictionsGridComponent.loadPredictions: ${this.loadError}`);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  private async resolveTargetEntity(model: MJMLModelEntity | null): Promise<void> {
    const provider = this.ProviderToUse;
    if (this.entityName) {
      const e = provider.EntityByName(this.entityName);
      if (e) {
        this.resolvedEntityId = e.ID;
        this.resolvedEntityName = e.Name;
        return;
      }
    }

    if (model?.PipelineID) {
      const pRes = await RunView.FromMetadataProvider(provider).RunView<Record<string, unknown>>(
        {
          EntityName: 'MJ: ML Training Pipelines',
          ExtraFilter: `ID = '${model.PipelineID.replace(/'/g, "''")}'`,
          MaxRows: 1,
          ResultType: 'simple',
          Fields: ['TargetEntityID'],
        },
        provider.CurrentUser ?? undefined,
      );
      if (pRes.Success && pRes.Results && pRes.Results.length > 0) {
        const tId = pRes.Results[0]['TargetEntityID'];
        if (typeof tId === 'string' && tId) {
          const e = provider.Entities.find((ent) => UUIDsEqual(ent.ID, tId));
          if (e) {
            this.resolvedEntityId = e.ID;
            this.resolvedEntityName = e.Name;
            return;
          }
        }
      }
    }
  }

  private checkIsInvertedRisk(rawPayloads: Array<string | null | undefined>, model: MJMLModelEntity | null): boolean {
    const target = (model?.TargetVariable ?? '').toLowerCase();
    if (target === 'status' || target === 'renewed' || target === 'renewal' || target === 'retention') {
      return true;
    }
    for (const p of rawPayloads.slice(0, 50)) {
      if (p && (p.includes('"Renewed"') || p.includes('"renewed"') || p.includes('"Lapsed"'))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns row nodes currently rendered in the AG Grid viewport.
   * Virtualized grids only render rows visible on screen (plus a small buffer).
   */
  private getVisibleRowNodes(): IRowNode<PredictionGridRow>[] {
    if (!this.gridApi) return [];

    const rendered = this.gridApi.getRenderedNodes();
    if (rendered && rendered.length > 0) {
      return rendered;
    }

    const firstIdx = this.gridApi.getFirstDisplayedRowIndex();
    const lastIdx = this.gridApi.getLastDisplayedRowIndex();
    if (firstIdx < 0 || lastIdx < 0) return [];

    const nodes: IRowNode<PredictionGridRow>[] = [];
    for (let i = firstIdx; i <= lastIdx; i++) {
      const node = this.gridApi.getDisplayedRowAtIndex(i);
      if (node) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  /**
   * Schedule lazy lookup of record names for rows currently visible in the AG Grid viewport.
   * Debounced so rapid scrolling does not trigger redundant batches.
   */
  public scheduleVisibleRowsLookup(delayMs: number = 60): void {
    if (this.visibleLookupDebounceTimer) {
      clearTimeout(this.visibleLookupDebounceTimer);
    }
    this.visibleLookupDebounceTimer = setTimeout(() => {
      void this.resolveVisibleRecordNames();
    }, delayMs);
  }

  /**
   * Resolve display names (e.g. member name, company name) ONLY for visible rows in the viewport
   * using ProviderToUse.GetEntityRecordNames.
   */
  private async resolveVisibleRecordNames(): Promise<void> {
    if (!this.gridApi || !this.resolvedEntityName) {
      return;
    }

    const provider = this.ProviderToUse;
    const entity = provider.EntityByName(this.resolvedEntityName);
    if (!entity) {
      return;
    }

    const visibleNodes = this.getVisibleRowNodes();
    if (visibleNodes.length === 0) {
      return;
    }

    const needed: { normId: string; recordId: string; node: IRowNode<PredictionGridRow> }[] = [];
    const cachedToUpdate: IRowNode<PredictionGridRow>[] = [];

    for (const node of visibleNodes) {
      const data = node.data;
      if (!data || !data.recordId) continue;

      const normId = NormalizeUUID(data.recordId);
      if (this.recordNameCache.has(normId)) {
        const cachedName = this.recordNameCache.get(normId);
        if (cachedName && data.recordName !== cachedName) {
          data.recordName = cachedName;
          cachedToUpdate.push(node);
        }
        continue;
      }

      if (this.inFlightLookups.has(normId)) {
        continue;
      }

      needed.push({ normId, recordId: data.recordId, node });
    }

    if (cachedToUpdate.length > 0 && this.gridApi) {
      this.gridApi.refreshCells({ rowNodes: cachedToUpdate, columns: ['recordName'], force: true });
    }

    if (needed.length === 0) {
      return;
    }

    // Mark as in-flight
    for (const item of needed) {
      this.inFlightLookups.add(item.normId);
    }

    try {
      const inputs: EntityRecordNameInput[] = needed.map((item) => ({
        EntityName: entity.Name,
        CompositeKey: CompositeKey.FromURLSegment(entity, item.recordId),
      }));

      const results: EntityRecordNameResult[] = await provider.GetEntityRecordNames(
        inputs,
        provider.CurrentUser ?? undefined,
      );

      const nodesToRefresh: IRowNode<PredictionGridRow>[] = [];

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const item = needed[i];
        if (!item) continue;

        if (res && res.Success && res.RecordName) {
          this.recordNameCache.set(item.normId, res.RecordName);
          if (item.node.data) {
            item.node.data.recordName = res.RecordName;
            nodesToRefresh.push(item.node);
          }
        } else {
          // Fallback: cache the recordId to avoid repeatedly re-querying failed records
          this.recordNameCache.set(item.normId, item.recordId);
        }
      }

      // Keep allRows in sync so client-side filter and view toggle retain resolved names
      for (const row of this.allRows) {
        const cached = this.recordNameCache.get(NormalizeUUID(row.recordId));
        if (cached && row.recordName !== cached) {
          row.recordName = cached;
        }
      }

      if (this.gridApi && nodesToRefresh.length > 0) {
        this.gridApi.refreshCells({ rowNodes: nodesToRefresh, columns: ['recordName'], force: true });
      }

      this.cdr.markForCheck();
    } catch (err) {
      LogError(`PSPredictionsGridComponent.resolveVisibleRecordNames failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      for (const item of needed) {
        this.inFlightLookups.delete(item.normId);
      }
    }
  }

  // ── Grid & Toolbar Event Handlers ──

  public onGridReady(event: GridReadyEvent<PredictionGridRow>): void {
    this.gridApi = event.api;
    this.scheduleVisibleRowsLookup(50);
  }

  public onCellClicked(event: CellClickedEvent<PredictionGridRow>): void {
    const target = event.event?.target as HTMLElement | null;
    if (target && target.closest('[data-action="open-record"]')) {
      if (event.data) {
        this.drillThrough(event.data);
      }
    }
  }

  public onRowClicked(event: RowClickedEvent<PredictionGridRow>): void {
    const target = event.event?.target as HTMLElement | null;
    if (target && target.closest('[data-action="open-record"]')) {
      return; // Handled by cell link click; do not open detail drawer
    }
    if (event.data) {
      this.openDetail(event.data);
    }
  }

  public onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchText = target.value ?? '';
    this.applyFilter();
  }

  public setTier(tier: 'all' | 'high' | 'medium' | 'low'): void {
    this.selectedTier = tier;
    this.applyFilter();
  }

  public setTierAndGrid(tier: 'high' | 'medium' | 'low'): void {
    this.selectedTier = tier;
    this.activeView = 'grid';
    this.applyFilter();
  }

  public onViewToggle(key: string): void {
    this.activeView = key === 'chart' ? 'chart' : 'grid';
    this.cdr.markForCheck();
  }

  public clearSearch(): void {
    this.searchText = '';
    this.applyFilter();
  }

  public selectDecile(idx: number): void {
    if (this.selectedDecileIndex === idx) {
      this.selectedDecileIndex = null;
    } else {
      this.selectedDecileIndex = idx;
    }
    this.applyFilter();
  }

  public clearDecileFilter(): void {
    this.selectedDecileIndex = null;
    this.applyFilter();
  }

  public get selectedDecileLabel(): string {
    if (this.selectedDecileIndex === null) return '';
    return `${this.selectedDecileIndex * 10}%–${(this.selectedDecileIndex + 1) * 10}%`;
  }

  private applyFilter(): void {
    let rows = this.allRows;

    if (this.selectedTier !== 'all') {
      rows = rows.filter((r) => r.band === this.selectedTier);
    }

    if (this.selectedDecileIndex !== null) {
      const minScore = this.selectedDecileIndex * 0.10;
      const maxScore = this.selectedDecileIndex === 9 ? 1.01 : (this.selectedDecileIndex + 1) * 0.10;
      rows = rows.filter((r) => r.score >= minScore && r.score < maxScore);
    }

    if (this.searchText.trim()) {
      const q = this.searchText.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.recordName.toLowerCase().includes(q) ||
        r.recordId.toLowerCase().includes(q) ||
        (r.class && r.class.toLowerCase().includes(q)) ||
        r.drivers.some((d) => d.label.toLowerCase().includes(q)),
      );
    }

    this.filteredRows = rows;
    this.cdr.markForCheck();
    this.scheduleVisibleRowsLookup(30);
  }

  // ── Drill-Through Navigation ──

  public drillThrough(row: PredictionGridRow): void {
    const entName = this.resolvedEntityName || this.entityName;
    if (!entName) return;

    try {
      const entity = this.ProviderToUse.EntityByName(entName);
      const ck = CompositeKey.FromURLSegment(entity, row.recordId);
      this.navigationService.OpenEntityRecord(entName, ck);
    } catch (err) {
      LogError(`PSPredictionsGridComponent.drillThrough failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Slide-In Detail & Score History ──

  public onDrawerWidthChanged(width: number): void {
    this.drawerWidthPx = width;
    UserInfoEngine.Instance.SetSettingDebounced('mj.predictiveStudio.predictions.drawerWidth', width.toString());
  }

  public openDetail(row: PredictionGridRow): void {
    this.selectedRow = row;
    this.detailOpen = true;
    this.historyPoints = [];
    this.historyLoading = true;
    this.subjectEntityName = null;
    this.subjectRecordId = null;
    this.subjectRecordName = null;
    this.cdr.markForCheck();

    void this.loadScoreHistory(row.recordId);

    const entName = this.resolvedEntityName || this.entityName;
    if (entName) {
      void this.resolveSubjectRecord(entName, row.recordId);
    }
  }

  public closeDetail(): void {
    this.detailOpen = false;
    this.selectedRow = null;
    this.historyPoints = [];
    this.subjectEntityName = null;
    this.subjectRecordId = null;
    this.subjectRecordName = null;
    this.cdr.markForCheck();
  }

  public openSubjectRecord(): void {
    if (!this.subjectEntityName || !this.subjectRecordId) return;
    try {
      const entity = this.ProviderToUse.EntityByName(this.subjectEntityName);
      if (!entity) return;
      const ck = CompositeKey.FromURLSegment(entity, this.subjectRecordId);
      this.navigationService.OpenEntityRecord(this.subjectEntityName, ck);
    } catch (err) {
      LogError(`PSPredictionsGridComponent.openSubjectRecord failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async resolveSubjectRecord(targetEntityName: string, recordId: string): Promise<void> {
    try {
      const provider = this.ProviderToUse;
      const entity = provider.EntityByName(targetEntityName);
      if (!entity) return;

      const candidates = [
        { field: 'PersonID', entity: 'MJ_BizApps_Common: People' },
        { field: 'MemberID', entity: 'MoreCheese: Member Profiles' },
        { field: 'ContactID', entity: 'MJ_BizApps_Common: Contacts' },
        { field: 'AccountID', entity: 'MJ_BizApps_Common: Accounts' },
        { field: 'CustomerID', entity: 'MJ_BizApps_Common: Customers' },
      ];

      let matchedField: string | null = null;
      let targetRelatedEntityName: string | null = null;

      for (const c of candidates) {
        const f = entity.Fields.find((fld) => fld.Name.toLowerCase() === c.field.toLowerCase());
        if (f) {
          matchedField = f.Name;
          targetRelatedEntityName = f.RelatedEntity || c.entity;
          break;
        }
      }

      if (!matchedField || !targetRelatedEntityName) {
        const personField = entity.Fields.find((fld) => fld.RelatedEntity && fld.RelatedEntity.toLowerCase().includes('people'));
        if (personField) {
          matchedField = personField.Name;
          targetRelatedEntityName = personField.RelatedEntity;
        }
      }

      if (!matchedField || !targetRelatedEntityName) return;

      const recRes = await RunView.FromMetadataProvider(provider).RunView<Record<string, unknown>>(
        {
          EntityName: entity.Name,
          ExtraFilter: `${entity.FirstPrimaryKey.Name} = '${recordId.replace(/'/g, "''")}'`, // first-pk-ok: Single-key entity lookup by recordId
          MaxRows: 1,
          ResultType: 'simple',
          Fields: [matchedField],
        },
        provider.CurrentUser ?? undefined,
      );

      if (recRes.Success && recRes.Results && recRes.Results.length > 0) {
        const subjectId = recRes.Results[0][matchedField];
        if (typeof subjectId === 'string' && subjectId) {
          this.subjectEntityName = targetRelatedEntityName;
          this.subjectRecordId = subjectId;

          const relatedEntity = provider.EntityByName(targetRelatedEntityName);
          if (relatedEntity) {
            const names = await provider.GetEntityRecordNames(
              [
                {
                  EntityName: targetRelatedEntityName,
                  CompositeKey: CompositeKey.FromURLSegment(relatedEntity, subjectId),
                },
              ],
              provider.CurrentUser ?? undefined,
            );

            if (names && names.length > 0 && names[0].Success) {
              this.subjectRecordName = names[0].RecordName ?? null;
            }
          }
          this.cdr.markForCheck();
        }
      }
    } catch (err) {
      LogError(`PSPredictionsGridComponent.resolveSubjectRecord failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async loadScoreHistory(recordId: string): Promise<void> {
    this.historyLoading = true;
    try {
      this.historyPoints = await this.scoreHistoryService.LoadRecordScoreHistory({
        provider: this.ProviderToUse,
        user: this.ProviderToUse.CurrentUser ?? undefined,
        entityId: this.resolvedEntityId,
        recordId,
        modelId: this.modelId,
      });
    } finally {
      this.historyLoading = false;
      this.cdr.markForCheck();
    }
  }

  public get entityDisplayName(): string {
    return this.resolvedEntityName || this.entityName || 'Entity Record';
  }

  // ── KPI & Chart Computations ──

  public get highCount(): number {
    return this.allRows.filter((r) => r.band === 'high').length;
  }
  public get mediumCount(): number {
    return this.allRows.filter((r) => r.band === 'medium').length;
  }
  public get lowCount(): number {
    return this.allRows.filter((r) => r.band === 'low').length;
  }

  public get highPct(): number {
    return this.allRows.length > 0 ? Math.round((this.highCount / this.allRows.length) * 100) : 0;
  }
  public get mediumPct(): number {
    return this.allRows.length > 0 ? Math.round((this.mediumCount / this.allRows.length) * 100) : 0;
  }
  public get lowPct(): number {
    return this.allRows.length > 0 ? Math.round((this.lowCount / this.allRows.length) * 100) : 0;
  }

  public get highAvg(): number {
    return this.highAvgRisk;
  }
  public get mediumAvg(): number {
    return this.mediumAvgRisk;
  }
  public get lowAvg(): number {
    return this.lowAvgRisk;
  }

  public get highAvgRisk(): number {
    const list = this.allRows.filter((r) => r.band === 'high');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }
  public get mediumAvgRisk(): number {
    const list = this.allRows.filter((r) => r.band === 'medium');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }
  public get lowAvgRisk(): number {
    const list = this.allRows.filter((r) => r.band === 'low');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }

  public get meanScorePct(): number {
    if (this.allRows.length === 0) return 0;
    const total = this.allRows.reduce((acc, r) => acc + r.score, 0);
    return Math.round((total / this.allRows.length) * 100);
  }

  public get histogramBins(): HistogramBin[] {
    const total = this.allRows.length;
    if (total === 0) return [];

    const counts = new Array(10).fill(0);
    for (const r of this.allRows) {
      const idx = Math.min(9, Math.floor(r.score * 10));
      counts[idx]++;
    }

    const maxCount = Math.max(...counts, 1);

    return counts.map((count, idx) => {
      const lower = idx * 10;
      const upper = (idx + 1) * 10;
      const pct = (count / total) * 100;
      const pctFormatted = pct < 0.1 && count > 0 ? '<0.1%' : pct.toFixed(1) + '%';

      // Power scale height so smaller decile bins (e.g. 2, 21, 35) are visible alongside 5,390
      const height = count === 0 ? 0 : Math.round(14 + Math.pow(count / maxCount, 0.45) * 116);

      let color: string;
      let riskLabel: string;
      if (this.isRenewalModel) {
        if (idx <= 2) {
          color = 'var(--mj-status-error)';
          riskLabel = 'High Churn Risk';
        } else if (idx <= 5) {
          color = 'var(--mj-status-warning)';
          riskLabel = 'Medium Risk';
        } else {
          color = 'var(--mj-status-success)';
          riskLabel = 'Low Risk / Healthy';
        }
      } else {
        if (idx >= 7) {
          color = 'var(--mj-status-error)';
          riskLabel = 'High Risk';
        } else if (idx >= 4) {
          color = 'var(--mj-status-warning)';
          riskLabel = 'Medium Risk';
        } else {
          color = 'var(--mj-status-success)';
          riskLabel = 'Low Risk';
        }
      }

      return {
        idx,
        label: `${lower}%–${upper}%`,
        shortLabel: `${lower}%`,
        count,
        pct: Math.round(pct),
        pctFormatted,
        height,
        color,
        riskLabel,
      };
    });
  }

  public get classBreakdown(): ClassShare[] {
    const total = this.allRows.length;
    if (total === 0) return [];

    const counts = new Map<string, number>();
    for (const r of this.allRows) {
      if (r.class) {
        counts.set(r.class, (counts.get(r.class) ?? 0) + 1);
      }
    }

    const palette = [
      'var(--mj-brand-primary)',
      'var(--mj-status-error)',
      'var(--mj-status-warning)',
      'var(--mj-status-success)',
      '#7b3ff0',
      '#d98213',
    ];

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({
        name,
        count,
        pct: Math.round((count / total) * 100),
        color: palette[i % palette.length],
      }));
  }

  // ── Trendline SVG Plotting ──

  public get trendlinePlotPoints(): TrendlinePlotPoint[] {
    const pts = this.historyPoints;
    if (pts.length === 0) return [];

    const xStart = 60;
    const xEnd = 500;
    const yTop = 20;
    const yBottom = 130;
    const ySpan = yBottom - yTop;

    const step = pts.length > 1 ? (xEnd - xStart) / (pts.length - 1) : 0;

    return pts.map((pt, i) => {
      const x = pts.length === 1 ? (xStart + xEnd) / 2 : Math.round(xStart + i * step);
      const clampedScore = Math.max(0, Math.min(1, pt.score));
      const y = Math.round(yBottom - clampedScore * ySpan);
      const color = pt.band === 'high' ? 'var(--mj-status-error)' : pt.band === 'medium' ? 'var(--mj-status-warning)' : 'var(--mj-status-success)';
      return {
        runId: pt.runId,
        x,
        y,
        scoreFormatted: pt.scoreFormatted,
        dateStr: pt.runDate.toLocaleDateString(),
        class: pt.class,
        color,
      };
    });
  }

  public get trendlineLinePoints(): string {
    return this.trendlinePlotPoints.map((p) => `${p.x},${p.y}`).join(' ');
  }

  public get trendlineAreaPoints(): string {
    const plot = this.trendlinePlotPoints;
    if (plot.length === 0) return '';
    const first = plot[0];
    const last = plot[plot.length - 1];
    return `${first.x},130 ` + plot.map((p) => `${p.x},${p.y}`).join(' ') + ` ${last.x},130`;
  }

  // ── CSV Export ──

  public exportCSV(): void {
    if (this.allRows.length === 0) return;

    const headers = ['Record ID', 'Record Name', 'Prediction Score', 'Risk Level', 'Predicted Class', 'Top Drivers', 'Scored At'];
    const lines = [headers.join(',')];

    for (const r of this.filteredRows) {
      const driversStr = r.drivers.map((d) => `${d.up ? '+' : '-'}${d.label}`).join('; ');
      const rowData = [
        `"${r.recordId.replace(/"/g, '""')}"`,
        `"${(r.recordName || r.recordId).replace(/"/g, '""')}"`,
        r.scoreFormatted,
        r.band.toUpperCase(),
        `"${(r.class || '').replace(/"/g, '""')}"`,
        `"${driversStr.replace(/"/g, '""')}"`,
        `"${r.scoredAtDate ? r.scoredAtDate.toISOString() : ''}"`,
      ];
      lines.push(rowData.join(','));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions_${this.resolvedEntityName || 'records'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
