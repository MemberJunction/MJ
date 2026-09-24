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
  ParseAtRiskRows,
  ResolveRenewalPolarity,
  type RenewalPolarityResult,
  type RowDriver,
} from '../at-risk.view-models';
import {
  type OutcomeConfig,
  type OutcomeBand,
  resolveOutcomeConfig,
  resolveScoreBand,
  resolveOutcomeStyle,
  formatPredictionScore,
} from '@memberjunction/predictive-studio-core';
import {
  PredictiveStudioScoreHistoryService,
  type ModelScoreHistoryPoint,
} from '../predictive-studio-score-history.service';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';

ModuleRegistry.registerModules([AllCommunityModule]);

/** One displayed prediction row in the unified grid. */
export interface PredictionGridRow {
  recordId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  recordName: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  score: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  scoreFormatted: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  riskPct: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  band: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  badgeColor?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  icon?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  class: string | null;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  drivers: RowDriver[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  status: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  scoredAtDate: Date | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** Summary of one dynamic outcome band for toolbar filtering and KPI cards. */
export interface VisibleBandSummary {
  key: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  label: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  count: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  pct: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  avgScore: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  avgScoreFormatted: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  badgeColor: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  icon?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
  description?: string;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
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
  @Input() RunId: string | null = null;

  /** @deprecated Use {@link RunId}. */
  @Input() set runId(value: string | null) {
    this.RunId = value;
  }
  /** @deprecated Use {@link RunId}. */
  get runId(): string | null {
    return this.RunId;
  }
  @Input() entityName: string | null = null;
  @Input() ProblemType: string | null = 'classification';

  /** @deprecated Use {@link ProblemType}. */
  @Input() set problemType(value: string | null) {
    this.ProblemType = value;
  }
  /** @deprecated Use {@link ProblemType}. */
  get problemType(): string | null {
    return this.ProblemType;
  }
  @Input() title: string | null = null;
  @Input() height = '560px';
  @Input() ReadOnly = false;

  /** @deprecated Use {@link ReadOnly}. */
  @Input() set readOnly(value: PSPredictionsGridComponent['ReadOnly']) {
    this.ReadOnly = value;
  }
  /** @deprecated Use {@link ReadOnly}. */
  get readOnly(): PSPredictionsGridComponent['ReadOnly'] {
    return this.ReadOnly;
  }

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly navigationService = inject(NavigationService);
  private readonly scoreHistoryService = inject(PredictiveStudioScoreHistoryService);

  public readonly Math = Math;

  public isLoading = false;
  public loadError: string | null = null;

  public AllRows: PredictionGridRow[] = [];

  /** @deprecated Use {@link AllRows}. */
  public get allRows(): PredictionGridRow[] {
    return this.AllRows;
  }
  /** @deprecated Use {@link AllRows}. */
  public set allRows(value: PredictionGridRow[]) {
    this.AllRows = value;
  }
  public FilteredRows: PredictionGridRow[] = [];

  /** @deprecated Use {@link FilteredRows}. */
  public get filteredRows(): PredictionGridRow[] {
    return this.FilteredRows;
  }
  /** @deprecated Use {@link FilteredRows}. */
  public set filteredRows(value: PredictionGridRow[]) {
    this.FilteredRows = value;
  }

  public SearchText = '';

  /** @deprecated Use {@link SearchText}. */
  public get searchText() {
    return this.SearchText;
  }
  /** @deprecated Use {@link SearchText}. */
  public set searchText(value) {
    this.SearchText = value;
  }
  public SelectedTier: string = 'all';

  /** @deprecated Use {@link SelectedTier}. */
  public get selectedTier(): string {
    return this.SelectedTier;
  }
  /** @deprecated Use {@link SelectedTier}. */
  public set selectedTier(value: string) {
    this.SelectedTier = value;
  }
  public OutcomeConfig: OutcomeConfig = resolveOutcomeConfig();

  /** @deprecated Use {@link OutcomeConfig}. */
  public get outcomeConfig(): OutcomeConfig {
    return this.OutcomeConfig;
  }
  /** @deprecated Use {@link OutcomeConfig}. */
  public set outcomeConfig(value: OutcomeConfig) {
    this.OutcomeConfig = value;
  }
  public VisibleBands: VisibleBandSummary[] = [];

  /** @deprecated Use {@link VisibleBands}. */
  public get visibleBands(): VisibleBandSummary[] {
    return this.VisibleBands;
  }
  /** @deprecated Use {@link VisibleBands}. */
  public set visibleBands(value: VisibleBandSummary[]) {
    this.VisibleBands = value;
  }

  public ActiveView: 'grid' | 'chart' = 'grid';

  /** @deprecated Use {@link ActiveView}. */
  public get activeView(): 'grid' | 'chart' {
    return this.ActiveView;
  }
  /** @deprecated Use {@link ActiveView}. */
  public set activeView(value: 'grid' | 'chart') {
    this.ActiveView = value;
  }
  public readonly ViewOptions = [
    { key: 'grid', icon: 'fa-solid fa-table', title: 'Grid View' },
    { key: 'chart', icon: 'fa-solid fa-chart-column', title: 'Chart View' },
  ];

  /** @deprecated Use {@link ViewOptions}. */
  public get viewOptions() {
    return this.ViewOptions;
  }

  // Slide-in detail state
  public DetailOpen = false;

  /** @deprecated Use {@link DetailOpen}. */
  public get detailOpen() {
    return this.DetailOpen;
  }
  /** @deprecated Use {@link DetailOpen}. */
  public set detailOpen(value) {
    this.DetailOpen = value;
  }
  public DrawerWidthPx = 640;

  /** @deprecated Use {@link DrawerWidthPx}. */
  public get drawerWidthPx() {
    return this.DrawerWidthPx;
  }
  /** @deprecated Use {@link DrawerWidthPx}. */
  public set drawerWidthPx(value) {
    this.DrawerWidthPx = value;
  }
  public SelectedRow: PredictionGridRow | null = null;

  /** @deprecated Use {@link SelectedRow}. */
  public get selectedRow(): PredictionGridRow | null {
    return this.SelectedRow;
  }
  /** @deprecated Use {@link SelectedRow}. */
  public set selectedRow(value: PredictionGridRow | null) {
    this.SelectedRow = value;
  }
  public HistoryLoading = false;

  /** @deprecated Use {@link HistoryLoading}. */
  public get historyLoading() {
    return this.HistoryLoading;
  }
  /** @deprecated Use {@link HistoryLoading}. */
  public set historyLoading(value) {
    this.HistoryLoading = value;
  }
  public HistoryPoints: ModelScoreHistoryPoint[] = [];

  /** @deprecated Use {@link HistoryPoints}. */
  public get historyPoints(): ModelScoreHistoryPoint[] {
    return this.HistoryPoints;
  }
  /** @deprecated Use {@link HistoryPoints}. */
  public set historyPoints(value: ModelScoreHistoryPoint[]) {
    this.HistoryPoints = value;
  }

  public ResolvedEntityId: string | null = null;

  /** @deprecated Use {@link ResolvedEntityId}. */
  public get resolvedEntityId(): string | null {
    return this.ResolvedEntityId;
  }
  /** @deprecated Use {@link ResolvedEntityId}. */
  public set resolvedEntityId(value: string | null) {
    this.ResolvedEntityId = value;
  }
  public ResolvedEntityName: string | null = null;

  /** @deprecated Use {@link ResolvedEntityName}. */
  public get resolvedEntityName(): string | null {
    return this.ResolvedEntityName;
  }
  /** @deprecated Use {@link ResolvedEntityName}. */
  public set resolvedEntityName(value: string | null) {
    this.ResolvedEntityName = value;
  }

  public SubjectEntityName: string | null = null;

  /** @deprecated Use {@link SubjectEntityName}. */
  public get subjectEntityName(): string | null {
    return this.SubjectEntityName;
  }
  /** @deprecated Use {@link SubjectEntityName}. */
  public set subjectEntityName(value: string | null) {
    this.SubjectEntityName = value;
  }
  public SubjectRecordId: string | null = null;

  /** @deprecated Use {@link SubjectRecordId}. */
  public get subjectRecordId(): string | null {
    return this.SubjectRecordId;
  }
  /** @deprecated Use {@link SubjectRecordId}. */
  public set subjectRecordId(value: string | null) {
    this.SubjectRecordId = value;
  }
  public SubjectRecordName: string | null = null;

  /** @deprecated Use {@link SubjectRecordName}. */
  public get subjectRecordName(): string | null {
    return this.SubjectRecordName;
  }
  /** @deprecated Use {@link SubjectRecordName}. */
  public set subjectRecordName(value: string | null) {
    this.SubjectRecordName = value;
  }

  private gridApi: GridApi<PredictionGridRow> | null = null;
  private chartGridApi: GridApi<PredictionGridRow> | null = null;

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
    onBodyScrollEnd: () => this.ScheduleVisibleRowsLookup(),
    onViewportChanged: () => this.ScheduleVisibleRowsLookup(),
    onFirstDataRendered: () => this.ScheduleVisibleRowsLookup(),
    onModelUpdated: () => this.ScheduleVisibleRowsLookup(),
    onCellClicked: (event: CellClickedEvent<PredictionGridRow>) => this.OnCellClicked(event),
  };

  public ChartGridOptions: GridOptions<PredictionGridRow> = {
    animateRows: true,
    rowHeight: 46,
    headerHeight: 40,
    suppressCellFocus: true,
    enableCellTextSelection: true,
    suppressNoRowsOverlay: true,
    rowSelection: { mode: 'singleRow', enableClickSelection: false },
    getRowId: (params: GetRowIdParams<PredictionGridRow>) => params.data.recordId,
    onBodyScrollEnd: () => this.ScheduleVisibleRowsLookup(),
    onViewportChanged: () => this.ScheduleVisibleRowsLookup(),
    onFirstDataRendered: () => this.ScheduleVisibleRowsLookup(),
    onModelUpdated: () => this.ScheduleVisibleRowsLookup(),
    onCellClicked: (event: CellClickedEvent<PredictionGridRow>) => this.OnCellClicked(event),
  };

  /** @deprecated Use {@link ChartGridOptions}. */
  public get chartGridOptions(): GridOptions<PredictionGridRow> {
    return this.ChartGridOptions;
  }
  /** @deprecated Use {@link ChartGridOptions}. */
  public set chartGridOptions(value: GridOptions<PredictionGridRow>) {
    this.ChartGridOptions = value;
  }

  public DefaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    minWidth: 80,
  };

  /** @deprecated Use {@link DefaultColDef}. */
  public get defaultColDef(): ColDef {
    return this.DefaultColDef;
  }
  /** @deprecated Use {@link DefaultColDef}. */
  public set defaultColDef(value: ColDef) {
    this.DefaultColDef = value;
  }

  public IsRenewalModel = false;

  /** @deprecated Use {@link IsRenewalModel}. */
  public get isRenewalModel() {
    return this.IsRenewalModel;
  }
  /** @deprecated Use {@link IsRenewalModel}. */
  public set isRenewalModel(value) {
    this.IsRenewalModel = value;
  }
  public SelectedDecileIndex: number | null = null;

  /** @deprecated Use {@link SelectedDecileIndex}. */
  public get selectedDecileIndex(): number | null {
    return this.SelectedDecileIndex;
  }
  /** @deprecated Use {@link SelectedDecileIndex}. */
  public set selectedDecileIndex(value: number | null) {
    this.SelectedDecileIndex = value;
  }

  public get IsRegression(): boolean {
    return (
      (this.ProblemType ?? '').toLowerCase() === 'regression' ||
      this.OutcomeConfig?.Format === 'currency' ||
      this.OutcomeConfig?.Format === 'number'
    );
  }

  /** @deprecated Use {@link IsRegression}. */
  public get isRegression(): boolean {
    return this.IsRegression;
  }

  public ColumnDefs: ColDef<PredictionGridRow>[] = [];

  /** @deprecated Use {@link ColumnDefs}. */
  public get columnDefs(): ColDef<PredictionGridRow>[] {
    return this.ColumnDefs;
  }
  /** @deprecated Use {@link ColumnDefs}. */
  public set columnDefs(value: ColDef<PredictionGridRow>[]) {
    this.ColumnDefs = value;
  }

  public SetupColumnDefs(): void {
    const scoreLabel = this.OutcomeConfig.ScoreLabel || 'Prediction Score';
    const statusLabel = this.OutcomeConfig.StatusLabel || 'Risk Level';

    this.ColumnDefs = [
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
        headerName: scoreLabel,
        width: 175,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data) return '';
          const badgeColor = params.data.badgeColor || 'gray';
          const colorClass = `badge-${badgeColor}`;
          const formatted = this.escapeHtml(params.data.scoreFormatted);

          if (this.IsRegression) {
            return `
              <div class="pg-score-cell">
                <span class="pg-score-val ${colorClass}" style="font-weight: 600; font-size: 13.5px;">${formatted}</span>
              </div>
            `;
          }

          const pct = Math.min(100, Math.max(0, Math.round(params.data.score * 100)));
          return `
            <div class="pg-score-cell">
              <span class="pg-score-val ${colorClass}">${formatted}</span>
              <div class="pg-score-bar">
                <div class="pg-score-fill ${colorClass}" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        },
      },
      {
        field: 'riskPct',
        headerName: statusLabel,
        width: 155,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data) return '';
          const badgeColor = params.data.badgeColor || 'gray';
          const icon = params.data.icon ? `<i class="fa-solid ${this.escapeHtml(params.data.icon)}"></i> ` : '';
          const label = this.escapeHtml(params.data.status || params.data.band);
          if (this.IsRegression) {
            return `<span class="ps-badge ${badgeColor}" title="${scoreLabel}: ${this.escapeHtml(params.data.scoreFormatted)}">${icon}${label}</span>`;
          }
          const pct = Math.round(params.data.score * 100);
          return `<span class="ps-badge ${badgeColor}" title="${pct}% ${scoreLabel}">${icon}${label} (${pct}%)</span>`;
        },
      },
      {
        field: 'class',
        headerName: 'Predicted Outcome',
        width: 135,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data || !params.data.class) return '<span class="ps-muted">—</span>';
          const cls = this.escapeHtml(params.data.class);
          const style = resolveOutcomeStyle(params.data.class, this.OutcomeConfig);
          const icon = style.Icon ? `<i class="fa-solid ${style.Icon}"></i> ` : '';
          return `<span class="ps-badge ${style.BadgeColor}">${icon}${cls}</span>`;
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
      this.gridApi.setGridOption('columnDefs', this.ColumnDefs);
    }
    if (this.chartGridApi) {
      this.chartGridApi.setGridOption('columnDefs', this.ColumnDefs);
    }
  }

  /** @deprecated Use {@link SetupColumnDefs}. */
  public setupColumnDefs(): void {
    return this.SetupColumnDefs();
  }

  ngOnInit(): void {
    const pref = UserInfoEngine.Instance.GetSetting('mj.predictiveStudio.predictions.drawerWidth');
    if (pref) {
      const w = parseInt(pref, 10);
      if (!isNaN(w) && w >= 360 && w <= 1400) {
        this.DrawerWidthPx = w;
      }
    }
    this.SetupColumnDefs();
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
    this.chartGridApi = null;
  }

  // ── Data Loading & Name Resolution ──

  public async Reload(): Promise<void> {
    await this.loadPredictions();
  }

  /** @deprecated Use {@link Reload}. */
  public async reload(): Promise<void> {
    return this.Reload();
  }

  private async loadPredictions(): Promise<void> {
    if (!this.modelId && !this.RunId) {
      this.AllRows = [];
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
      let effectiveRunId = this.RunId;
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
        this.AllRows = [];
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
        this.AllRows = [];
        this.applyFilter();
        this.isLoading = false;
        this.cdr.markForCheck();
        return;
      }

      // 4. Resolve OutcomeConfig and determine polarity
      if (model?.ProblemType) {
        this.ProblemType = model.ProblemType.toLowerCase();
      }
      this.OutcomeConfig = resolveOutcomeConfig(model ?? undefined);
      this.IsRenewalModel = this.OutcomeConfig.Polarity === 'positive' && !this.IsRegression;
      this.SetupColumnDefs();

      const polarity = ResolveRenewalPolarity(
        detailsRes.Results.map((d) => d.ResultPayload),
        model?.TargetVariable,
      );

      // When the model outputs P(Renewed) (scoreIsLapseRisk = false), adverse risk is inverted (1 - score).
      // When the model outputs P(Lapse) (scoreIsLapseRisk = true), adverse risk is ALREADY score (invertedRisk = false).
      const shouldInvertRisk = polarity.IsRenewalModel ? !polarity.ScoreIsLapseRisk : false;

      const parsedAtRisk = ParseAtRiskRows(
        detailsRes.Results.map((d) => ({ recordId: d.RecordID, ResultPayload: d.ResultPayload })),
        { InvertedRisk: shouldInvertRisk, OutcomeConfig: this.OutcomeConfig },
      );

      // Map details into indexed lookup for scoredAt timestamp
      const detailByRecord = new Map<string, MJProcessRunDetailEntity>();
      for (const d of detailsRes.Results) {
        detailByRecord.set(NormalizeUUID(d.RecordID), d);
      }

      this.AllRows = parsedAtRisk.map((r) => {
        const detail = detailByRecord.get(NormalizeUUID(r.recordId));
        const dt = detail?.CompletedAt ?? detail?.__mj_CreatedAt ?? null;
        // For renewal models, the primary displayed score is Renewal Probability (0–1).
        // If the raw score was lapse risk, renewal probability is 1 - r.score.
        // Otherwise, raw score is already renewal probability.
        const displayScore = polarity.IsRenewalModel
          ? (polarity.ScoreIsLapseRisk ? Math.max(0, Math.min(1, 1 - r.score)) : r.score)
          : r.score;

        const resolved = this.OutcomeConfig
          ? resolveScoreBand(displayScore, this.OutcomeConfig)
          : null;

        const formatted = formatPredictionScore(displayScore, this.OutcomeConfig, this.ProblemType);

        return {
          recordId: r.recordId,
          recordName: r.label ?? r.recordId,
          score: displayScore,
          scoreFormatted: formatted,
          riskPct: r.riskPct,
          band: resolved?.Key ?? r.band,
          badgeColor: resolved?.BadgeColor ?? r.badgeColor,
          icon: resolved?.Icon ?? r.icon,
          class: r.class,
          drivers: r.drivers ?? [],
          status: resolved?.Label ?? r.status ?? detail?.Status ?? 'Succeeded',
          scoredAtDate: dt instanceof Date ? dt : dt ? new Date(dt) : null,
        };
      });

      this.computeVisibleBands();
      this.applyFilter();

      // 5. Schedule lazy lookup of record names for visible rows
      this.ScheduleVisibleRowsLookup(0);
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
        this.ResolvedEntityId = e.ID;
        this.ResolvedEntityName = e.Name;
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
            this.ResolvedEntityId = e.ID;
            this.ResolvedEntityName = e.Name;
            return;
          }
        }
      }
    }
  }

  /**
   * Returns row nodes currently rendered in the AG Grid viewport.
   * Virtualized grids only render rows visible on screen (plus a small buffer).
   */
  private getVisibleRowNodes(): IRowNode<PredictionGridRow>[] {
    const apis = [this.gridApi, this.chartGridApi].filter((api): api is GridApi<PredictionGridRow> => Boolean(api));
    if (apis.length === 0) return [];

    const nodes: IRowNode<PredictionGridRow>[] = [];
    for (const api of apis) {
      const rendered = api.getRenderedNodes();
      if (rendered && rendered.length > 0) {
        nodes.push(...rendered);
        continue;
      }

      const firstIdx = api.getFirstDisplayedRowIndex();
      const lastIdx = api.getLastDisplayedRowIndex();
      if (firstIdx < 0 || lastIdx < 0) continue;

      for (let i = firstIdx; i <= lastIdx; i++) {
        const node = api.getDisplayedRowAtIndex(i);
        if (node) {
          nodes.push(node);
        }
      }
    }
    return nodes;
  }

  /**
   * Schedule lazy lookup of record names for rows currently visible in the AG Grid viewport.
   * Debounced so rapid scrolling does not trigger redundant batches.
   */
  public ScheduleVisibleRowsLookup(delayMs: number = 60): void {
    if (this.visibleLookupDebounceTimer) {
      clearTimeout(this.visibleLookupDebounceTimer);
    }
    this.visibleLookupDebounceTimer = setTimeout(() => {
      void this.resolveVisibleRecordNames();
    }, delayMs);
  }

  /** @deprecated Use {@link ScheduleVisibleRowsLookup}. */
  public scheduleVisibleRowsLookup(delayMs: number = 60): void {
    return this.ScheduleVisibleRowsLookup(delayMs);
  }

  /**
   * Resolve display names (e.g. member name, company name) ONLY for visible rows in the viewport
   * using ProviderToUse.GetEntityRecordNames.
   */
  private async resolveVisibleRecordNames(): Promise<void> {
    if ((!this.gridApi && !this.chartGridApi) || !this.ResolvedEntityName) {
      return;
    }

    const provider = this.ProviderToUse;
    const entity = provider.EntityByName(this.ResolvedEntityName);
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

    if (cachedToUpdate.length > 0) {
      if (this.gridApi) {
        this.gridApi.refreshCells({ rowNodes: cachedToUpdate, columns: ['recordName'], force: true });
      }
      if (this.chartGridApi) {
        this.chartGridApi.refreshCells({ rowNodes: cachedToUpdate, columns: ['recordName'], force: true });
      }
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
      for (const row of this.AllRows) {
        const cached = this.recordNameCache.get(NormalizeUUID(row.recordId));
        if (cached && row.recordName !== cached) {
          row.recordName = cached;
        }
      }

      if (nodesToRefresh.length > 0) {
        if (this.gridApi) {
          this.gridApi.refreshCells({ rowNodes: nodesToRefresh, columns: ['recordName'], force: true });
        }
        if (this.chartGridApi) {
          this.chartGridApi.refreshCells({ rowNodes: nodesToRefresh, columns: ['recordName'], force: true });
        }
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

  public OnGridReady(event: GridReadyEvent<PredictionGridRow>): void {
    this.gridApi = event.api;
    this.ScheduleVisibleRowsLookup(50);
  }

  /** @deprecated Use {@link OnGridReady}. */
  public onGridReady(event: GridReadyEvent<PredictionGridRow>): void {
    return this.OnGridReady(event);
  }

  public OnChartGridReady(event: GridReadyEvent<PredictionGridRow>): void {
    this.chartGridApi = event.api;
    this.ScheduleVisibleRowsLookup(50);
  }

  /** @deprecated Use {@link OnChartGridReady}. */
  public onChartGridReady(event: GridReadyEvent<PredictionGridRow>): void {
    return this.OnChartGridReady(event);
  }

  public OnCellClicked(event: CellClickedEvent<PredictionGridRow>): void {
    const target = event.event?.target as HTMLElement | null;
    if (target && target.closest('[data-action="open-record"]')) {
      if (event.data) {
        this.DrillThrough(event.data);
      }
    }
  }

  /** @deprecated Use {@link OnCellClicked}. */
  public onCellClicked(event: CellClickedEvent<PredictionGridRow>): void {
    return this.OnCellClicked(event);
  }

  public OnRowClicked(event: RowClickedEvent<PredictionGridRow>): void {
    const target = event.event?.target as HTMLElement | null;
    if (target && target.closest('[data-action="open-record"]')) {
      return; // Handled by cell link click; do not open detail drawer
    }
    if (event.data) {
      this.OpenDetail(event.data);
    }
  }

  /** @deprecated Use {@link OnRowClicked}. */
  public onRowClicked(event: RowClickedEvent<PredictionGridRow>): void {
    return this.OnRowClicked(event);
  }

  public OnSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.SearchText = target.value ?? '';
    this.applyFilter();
  }

  /** @deprecated Use {@link OnSearchInput}. */
  public onSearchInput(event: Event): void {
    return this.OnSearchInput(event);
  }

  public SetTier(tier: string): void {
    this.SelectedTier = tier;
    this.applyFilter();
  }

  /** @deprecated Use {@link SetTier}. */
  public setTier(tier: string): void {
    return this.SetTier(tier);
  }

  public SetTierAndGrid(tier: string): void {
    this.SelectedTier = tier;
    this.ActiveView = 'grid';
    this.applyFilter();
  }

  /** @deprecated Use {@link SetTierAndGrid}. */
  public setTierAndGrid(tier: string): void {
    return this.SetTierAndGrid(tier);
  }

  public GetOutcomeBadgeClass(className: string | null | undefined): string {
    return resolveOutcomeStyle(className, this.OutcomeConfig).BadgeColor;
  }

  /** @deprecated Use {@link GetOutcomeBadgeClass}. */
  public getOutcomeBadgeClass(className: string | null | undefined): string {
    return this.GetOutcomeBadgeClass(className);
  }

  public GetBadgeColorVar(color: string): string {
    switch (color) {
      case 'green':
        return 'var(--mj-status-success)';
      case 'red':
        return 'var(--mj-status-error)';
      case 'amber':
        return 'var(--mj-status-warning)';
      case 'blue':
        return 'var(--mj-brand-primary)';
      default:
        return 'var(--mj-text-muted)';
    }
  }

  /** @deprecated Use {@link GetBadgeColorVar}. */
  public getBadgeColorVar(color: string): string {
    return this.GetBadgeColorVar(color);
  }

  private computeVisibleBands(): void {
    const total = this.AllRows.length;
    const bands = this.OutcomeConfig.Bands ?? [];
    this.VisibleBands = bands.map((b) => {
      const matching = this.AllRows.filter((r) => r.band === b.Key);
      const count = matching.length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const rawAvg = count > 0 ? matching.reduce((sum, r) => sum + r.score, 0) / count : 0;
      const avgScore = Math.round(rawAvg * 100);
      const avgScoreFormatted = formatPredictionScore(rawAvg, this.OutcomeConfig, this.ProblemType);
      return {
        key: b.Key,
        label: b.Label,
        count,
        pct,
        avgScore,
        avgScoreFormatted,
        badgeColor: b.BadgeColor,
        icon: b.Icon,
        description: b.Description,
      };
    });

    const knownKeys = new Set(bands.map((b) => b.Key));
    const extraKeys = new Set(this.AllRows.map((r) => r.band).filter((k) => !knownKeys.has(k)));
    for (const k of extraKeys) {
      const matching = this.AllRows.filter((r) => r.band === k);
      const count = matching.length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      const rawAvg = count > 0 ? matching.reduce((sum, r) => sum + r.score, 0) / count : 0;
      const avgScore = Math.round(rawAvg * 100);
      const avgScoreFormatted = formatPredictionScore(rawAvg, this.OutcomeConfig, this.ProblemType);
      this.VisibleBands.push({
        key: k,
        label: k.charAt(0).toUpperCase() + k.slice(1),
        count,
        pct,
        avgScore,
        avgScoreFormatted,
        badgeColor: 'gray',
      });
    }
  }

  public OnViewToggle(key: string): void {
    this.ActiveView = key === 'chart' ? 'chart' : 'grid';
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link OnViewToggle}. */
  public onViewToggle(key: string): void {
    return this.OnViewToggle(key);
  }

  public ClearSearch(): void {
    this.SearchText = '';
    this.applyFilter();
  }

  /** @deprecated Use {@link ClearSearch}. */
  public clearSearch(): void {
    return this.ClearSearch();
  }

  public SelectDecile(idx: number): void {
    if (this.SelectedDecileIndex === idx) {
      this.SelectedDecileIndex = null;
    } else {
      this.SelectedDecileIndex = idx;
    }
    this.applyFilter();

    if (this.SelectedDecileIndex !== null) {
      setTimeout(() => {
        const el = document.getElementById('pg-drilldown-anchor');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }

  /** @deprecated Use {@link SelectDecile}. */
  public selectDecile(idx: number): void {
    return this.SelectDecile(idx);
  }

  public ClearDecileFilter(): void {
    this.SelectedDecileIndex = null;
    this.applyFilter();
  }

  /** @deprecated Use {@link ClearDecileFilter}. */
  public clearDecileFilter(): void {
    return this.ClearDecileFilter();
  }

  public get SelectedDecileLabel(): string {
    if (this.SelectedDecileIndex === null) return '';
    return `${this.SelectedDecileIndex * 10}%–${(this.SelectedDecileIndex + 1) * 10}%`;
  }

  /** @deprecated Use {@link SelectedDecileLabel}. */
  public get selectedDecileLabel(): string {
    return this.SelectedDecileLabel;
  }

  private applyFilter(): void {
    let rows = this.AllRows;

    if (this.SelectedTier !== 'all') {
      rows = rows.filter((r) => r.band === this.SelectedTier);
    }

    if (this.SelectedDecileIndex !== null) {
      const minScore = this.SelectedDecileIndex * 0.10;
      const maxScore = this.SelectedDecileIndex === 9 ? 1.01 : (this.SelectedDecileIndex + 1) * 0.10;
      rows = rows.filter((r) => r.score >= minScore && r.score < maxScore);
    }

    if (this.SearchText.trim()) {
      const q = this.SearchText.trim().toLowerCase();
      rows = rows.filter((r) =>
        r.recordName.toLowerCase().includes(q) ||
        r.recordId.toLowerCase().includes(q) ||
        (r.class && r.class.toLowerCase().includes(q)) ||
        r.drivers.some((d) => d.label.toLowerCase().includes(q)),
      );
    }

    this.FilteredRows = rows;
    this.cdr.markForCheck();
    this.ScheduleVisibleRowsLookup(30);
  }

  // ── Drill-Through Navigation ──

  public DrillThrough(row: PredictionGridRow): void {
    const entName = this.ResolvedEntityName || this.entityName;
    if (!entName) return;

    try {
      const entity = this.ProviderToUse.EntityByName(entName);
      const ck = CompositeKey.FromURLSegment(entity, row.recordId);
      this.navigationService.OpenEntityRecord(entName, ck);
    } catch (err) {
      LogError(`PSPredictionsGridComponent.drillThrough failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** @deprecated Use {@link DrillThrough}. */
  public drillThrough(row: PredictionGridRow): void {
    return this.DrillThrough(row);
  }

  // ── Slide-In Detail & Score History ──

  public OnDrawerWidthChanged(width: number): void {
    this.DrawerWidthPx = width;
    UserInfoEngine.Instance.SetSettingDebounced('mj.predictiveStudio.predictions.drawerWidth', width.toString());
  }

  /** @deprecated Use {@link OnDrawerWidthChanged}. */
  public onDrawerWidthChanged(width: number): void {
    return this.OnDrawerWidthChanged(width);
  }

  public OpenDetail(row: PredictionGridRow): void {
    this.SelectedRow = row;
    this.DetailOpen = true;
    this.HistoryPoints = [];
    this.HistoryLoading = true;
    this.SubjectEntityName = null;
    this.SubjectRecordId = null;
    this.SubjectRecordName = null;
    this.cdr.markForCheck();

    void this.loadScoreHistory(row.recordId);

    const entName = this.ResolvedEntityName || this.entityName;
    if (entName) {
      void this.resolveSubjectRecord(entName, row.recordId);
    }
  }

  /** @deprecated Use {@link OpenDetail}. */
  public openDetail(row: PredictionGridRow): void {
    return this.OpenDetail(row);
  }

  public CloseDetail(): void {
    this.DetailOpen = false;
    this.SelectedRow = null;
    this.HistoryPoints = [];
    this.SubjectEntityName = null;
    this.SubjectRecordId = null;
    this.SubjectRecordName = null;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CloseDetail}. */
  public closeDetail(): void {
    return this.CloseDetail();
  }

  public OpenSubjectRecord(): void {
    if (!this.SubjectEntityName || !this.SubjectRecordId) return;
    try {
      const entity = this.ProviderToUse.EntityByName(this.SubjectEntityName);
      if (!entity) return;
      const ck = CompositeKey.FromURLSegment(entity, this.SubjectRecordId);
      this.navigationService.OpenEntityRecord(this.SubjectEntityName, ck);
    } catch (err) {
      LogError(`PSPredictionsGridComponent.openSubjectRecord failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** @deprecated Use {@link OpenSubjectRecord}. */
  public openSubjectRecord(): void {
    return this.OpenSubjectRecord();
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
          this.SubjectEntityName = targetRelatedEntityName;
          this.SubjectRecordId = subjectId;

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
              this.SubjectRecordName = names[0].RecordName ?? null;
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
    this.HistoryLoading = true;
    try {
      this.HistoryPoints = await this.scoreHistoryService.LoadRecordScoreHistory({
        provider: this.ProviderToUse,
        User: this.ProviderToUse.CurrentUser ?? undefined,
        entityId: this.ResolvedEntityId,
        recordId,
        modelId: this.modelId,
        OutcomeConfig: this.OutcomeConfig,
        ProblemType: this.ProblemType,
      });
    } finally {
      this.HistoryLoading = false;
      this.cdr.markForCheck();
    }
  }

  public get EntityDisplayName(): string {
    return this.ResolvedEntityName || this.entityName || 'Entity Record';
  }

  /** @deprecated Use {@link EntityDisplayName}. */
  public get entityDisplayName(): string {
    return this.EntityDisplayName;
  }

  // ── KPI & Chart Computations ──

  public get HighCount(): number {
    return this.AllRows.filter((r) => r.band === 'high').length;
  }

  /** @deprecated Use {@link HighCount}. */
  public get highCount(): number {
    return this.HighCount;
  }
  public get MediumCount(): number {
    return this.AllRows.filter((r) => r.band === 'medium').length;
  }

  /** @deprecated Use {@link MediumCount}. */
  public get mediumCount(): number {
    return this.MediumCount;
  }
  public get LowCount(): number {
    return this.AllRows.filter((r) => r.band === 'low').length;
  }

  /** @deprecated Use {@link LowCount}. */
  public get lowCount(): number {
    return this.LowCount;
  }

  public get HighPct(): number {
    return this.AllRows.length > 0 ? Math.round((this.HighCount / this.AllRows.length) * 100) : 0;
  }

  /** @deprecated Use {@link HighPct}. */
  public get highPct(): number {
    return this.HighPct;
  }
  public get MediumPct(): number {
    return this.AllRows.length > 0 ? Math.round((this.MediumCount / this.AllRows.length) * 100) : 0;
  }

  /** @deprecated Use {@link MediumPct}. */
  public get mediumPct(): number {
    return this.MediumPct;
  }
  public get LowPct(): number {
    return this.AllRows.length > 0 ? Math.round((this.LowCount / this.AllRows.length) * 100) : 0;
  }

  /** @deprecated Use {@link LowPct}. */
  public get lowPct(): number {
    return this.LowPct;
  }

  public get HighAvg(): number {
    return this.HighAvgRisk;
  }

  /** @deprecated Use {@link HighAvg}. */
  public get highAvg(): number {
    return this.HighAvg;
  }
  public get MediumAvg(): number {
    return this.MediumAvgRisk;
  }

  /** @deprecated Use {@link MediumAvg}. */
  public get mediumAvg(): number {
    return this.MediumAvg;
  }
  public get LowAvg(): number {
    return this.LowAvgRisk;
  }

  /** @deprecated Use {@link LowAvg}. */
  public get lowAvg(): number {
    return this.LowAvg;
  }

  public get HighAvgRisk(): number {
    const list = this.AllRows.filter((r) => r.band === 'high');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }

  /** @deprecated Use {@link HighAvgRisk}. */
  public get highAvgRisk(): number {
    return this.HighAvgRisk;
  }
  public get MediumAvgRisk(): number {
    const list = this.AllRows.filter((r) => r.band === 'medium');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }

  /** @deprecated Use {@link MediumAvgRisk}. */
  public get mediumAvgRisk(): number {
    return this.MediumAvgRisk;
  }
  public get LowAvgRisk(): number {
    const list = this.AllRows.filter((r) => r.band === 'low');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }

  /** @deprecated Use {@link LowAvgRisk}. */
  public get lowAvgRisk(): number {
    return this.LowAvgRisk;
  }

  public get MeanScorePct(): number {
    if (this.AllRows.length === 0) return 0;
    const total = this.AllRows.reduce((acc, r) => acc + r.score, 0);
    return Math.round((total / this.AllRows.length) * 100);
  }

  /** @deprecated Use {@link MeanScorePct}. */
  public get meanScorePct(): number {
    return this.MeanScorePct;
  }

  public get MeanScoreFormatted(): string {
    if (this.AllRows.length === 0) return '—';
    const total = this.AllRows.reduce((acc, r) => acc + r.score, 0);
    const avg = total / this.AllRows.length;
    return formatPredictionScore(avg, this.OutcomeConfig, this.ProblemType);
  }

  /** @deprecated Use {@link MeanScoreFormatted}. */
  public get meanScoreFormatted(): string {
    return this.MeanScoreFormatted;
  }

  public get HistogramBins(): HistogramBin[] {
    const total = this.AllRows.length;
    if (total === 0) return [];

    const isReg = this.IsRegression;
    let minScore = 0;
    let maxScore = 1;

    if (isReg) {
      const scores = this.AllRows.map((r) => r.score);
      minScore = Math.min(...scores);
      maxScore = Math.max(...scores);
      if (maxScore <= minScore) {
        maxScore = minScore + 1;
      }
    }

    const range = maxScore - minScore;
    const step = range / 10;
    const counts = new Array(10).fill(0);

    for (const r of this.AllRows) {
      const normalized = isReg ? (r.score - minScore) / range : r.score;
      const idx = Math.min(9, Math.max(0, Math.floor(normalized * 10)));
      counts[idx]++;
    }

    const maxCount = Math.max(...counts, 1);

    return counts.map((count, idx) => {
      const binMin = minScore + idx * step;
      const binMax = minScore + (idx + 1) * step;
      const pct = (count / total) * 100;
      const pctFormatted = pct < 0.1 && count > 0 ? '<0.1%' : pct.toFixed(1) + '%';

      // Power scale height so smaller decile bins (e.g. 2, 21, 35) are visible alongside 5,390
      const height = count === 0 ? 0 : Math.round(14 + Math.pow(count / maxCount, 0.45) * 116);

      const centerScore = (binMin + binMax) / 2;
      const band = resolveScoreBand(centerScore, this.OutcomeConfig);
      const color = band ? this.GetBadgeColorVar(band.BadgeColor) : 'var(--mj-brand-primary)';

      let label: string;
      let shortLabel: string;
      if (isReg) {
        const fmtMin = formatPredictionScore(binMin, this.OutcomeConfig, this.ProblemType);
        const fmtMax = formatPredictionScore(binMax, this.OutcomeConfig, this.ProblemType);
        label = `${fmtMin}–${fmtMax}`;
        shortLabel = fmtMin;
      } else {
        const lower = idx * 10;
        const upper = (idx + 1) * 10;
        label = `${lower}%–${upper}%`;
        shortLabel = `${lower}%`;
      }
      const riskLabel = band ? band.Label : label;

      return {
        idx,
        label,
        shortLabel,
        count,
        pct: Math.round(pct),
        pctFormatted,
        height,
        color,
        riskLabel,
      };
    });
  }

  /** @deprecated Use {@link HistogramBins}. */
  public get histogramBins(): HistogramBin[] {
    return this.HistogramBins;
  }

  public get ClassBreakdown(): ClassShare[] {
    const total = this.AllRows.length;
    if (total === 0) return [];

    const counts = new Map<string, number>();
    for (const r of this.AllRows) {
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

  /** @deprecated Use {@link ClassBreakdown}. */
  public get classBreakdown(): ClassShare[] {
    return this.ClassBreakdown;
  }

  // ── Trendline SVG Plotting ──

  public get TrendlinePlotPoints(): TrendlinePlotPoint[] {
    const pts = this.HistoryPoints;
    if (pts.length === 0) return [];

    const isReg = this.IsRegression;
    let minScore = 0;
    let maxScore = 1;
    if (isReg) {
      const scores = pts.map((p) => p.score);
      minScore = Math.min(...scores);
      maxScore = Math.max(...scores);
      if (maxScore <= minScore) {
        maxScore = minScore + 1;
      }
    }
    const range = maxScore - minScore;

    const xStart = 60;
    const xEnd = 500;
    const yTop = 20;
    const yBottom = 130;
    const ySpan = yBottom - yTop;

    const step = pts.length > 1 ? (xEnd - xStart) / (pts.length - 1) : 0;

    return pts.map((pt, i) => {
      const x = pts.length === 1 ? (xStart + xEnd) / 2 : Math.round(xStart + i * step);
      const clampedScore = isReg
        ? Math.max(0, Math.min(1, (pt.score - minScore) / range))
        : Math.max(0, Math.min(1, pt.score));
      const y = Math.round(yBottom - clampedScore * ySpan);
      const band = resolveScoreBand(pt.score, this.OutcomeConfig);
      const color = band ? this.GetBadgeColorVar(band.BadgeColor) : 'var(--mj-brand-primary)';
      return {
        runId: pt.runId,
        x,
        y,
        scoreFormatted: pt.ScoreFormatted,
        dateStr: pt.RunDate.toLocaleDateString(),
        class: pt.class,
        color,
      };
    });
  }

  /** @deprecated Use {@link TrendlinePlotPoints}. */
  public get trendlinePlotPoints(): TrendlinePlotPoint[] {
    return this.TrendlinePlotPoints;
  }

  public get TrendlineLinePoints(): string {
    return this.TrendlinePlotPoints.map((p) => `${p.x},${p.y}`).join(' ');
  }

  /** @deprecated Use {@link TrendlineLinePoints}. */
  public get trendlineLinePoints(): string {
    return this.TrendlineLinePoints;
  }

  public get TrendlineAreaPoints(): string {
    const plot = this.TrendlinePlotPoints;
    if (plot.length === 0) return '';
    const first = plot[0];
    const last = plot[plot.length - 1];
    return `${first.x},130 ` + plot.map((p) => `${p.x},${p.y}`).join(' ') + ` ${last.x},130`;
  }

  /** @deprecated Use {@link TrendlineAreaPoints}. */
  public get trendlineAreaPoints(): string {
    return this.TrendlineAreaPoints;
  }

  // ── CSV Export ──

  public ExportCSV(): void {
    if (this.AllRows.length === 0) return;

    const scoreHeader = this.OutcomeConfig.ScoreLabel || 'Prediction Score';
    const statusHeader = this.OutcomeConfig.StatusLabel || 'Risk Level';
    const headers = ['Record ID', 'Record Name', scoreHeader, statusHeader, 'Predicted Class', 'Top Drivers', 'Scored At'];
    const lines = [headers.join(',')];

    for (const r of this.FilteredRows) {
      const driversStr = r.drivers.map((d) => `${d.up ? '+' : '-'}${d.label}`).join('; ');
      const statusStr = `${r.status || r.band} (${r.scoreFormatted})`;
      const rowData = [
        `"${r.recordId.replace(/"/g, '""')}"`,
        `"${(r.recordName || r.recordId).replace(/"/g, '""')}"`,
        r.scoreFormatted,
        statusStr,
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
    a.download = `predictions_${this.ResolvedEntityName || 'records'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** @deprecated Use {@link ExportCSV}. */
  public exportCSV(): void {
    return this.ExportCSV();
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
