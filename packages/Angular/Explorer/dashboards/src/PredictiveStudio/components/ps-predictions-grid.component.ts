import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
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
import { CompositeFilterSQLCompiler, CompositeKey, LogError, RunView, type CompositeFilterDescriptor, type EntityInfo, type IMetadataProvider, type RunViewParams, type UserInfo, EntityRecordNameInput, EntityRecordNameResult } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { MJMLModelEntity, UserInfoEngine, type MJMLModelScoringBindingEntity, type MJUserViewEntity } from '@memberjunction/core-entities';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BuildRecordIdFilter } from '../../shared/record-id-filter';
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
  AtRiskRules,
  OutputBindingRows,
  ProblemTypes,
  type AtRiskModelOptions,
  type AtRiskRow,
  type OutputBindingEntityRow,
  type RowDriver,
  type OutcomeConfig,
  type SemanticsCheckBinding,
  ResolveOutcomeConfig,
  ResolveScoreBand,
  ResolveOutcomeStyle,
  FormatPredictionScore,
} from '@memberjunction/predictive-studio-core';
import {
  PredictiveStudioScoreHistoryService,
  type ModelScoreHistoryPoint,
} from '../predictive-studio-score-history.service';
import { PredictiveStudioEngine, type PSRunDetailRow, type PSRunDetails } from '../engine/predictive-studio.engine';
import { LatestPredictionRows, type LatestPredictionBinding, type LatestPredictionRow } from '../latest-prediction-rows';
import { PSRowDriversComponent } from './ps-row-drivers.component';

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

/** The tier a row is shown in: its key (filter and count), status label, badge colour and icon. */
interface RowTier {
  Key: string;
  Label: string;
  BadgeColor: string;
  Icon?: string;
}

/** The surfaces the grid renders as: the business At-Risk list, or the analyst predictions grid. */
export type PredictionGridSurface = Extract<SemanticsCheckBinding['Surface'], 'at-risk-list' | 'predictions-grid'>;

/** The `MJ: ML Models` fields the grid reads. */
export type PredictionGridModelFields = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'ProblemType' | 'TargetVariable' | 'Lineage' | 'OutputSemantics'>;

/** The fields of {@link PredictionGridModelFields}, as the read names them. */
const PREDICTION_GRID_MODEL_FIELDS = ['ID', 'PipelineID', 'ProblemType', 'TargetVariable', 'Lineage', 'OutputSemantics'] as const satisfies readonly (keyof PredictionGridModelFields)[];

/** What {@link PSPredictionsGridComponent.LoadModelWithBindings} reads in one batch: the model and the binding rows the grid renders from. */
export interface PredictionGridModelRead {
  /** The model, or null when no model row has the bound id. */
  Model: PredictionGridModelFields | null;
  /** The binding row of the grid's {@link PSPredictionsGridComponent.Surface}; null when the model has none. */
  Binding: SemanticsCheckBinding | null;
  /** The model's `why-badge` binding row (the drivers' label and direction); null when the model has none. */
  WhyBadge: SemanticsCheckBinding | null;
}

/** {@link PSPredictionsGridComponent.RowsLoaded}'s payload: the parsed at-risk rows of the run the grid shows. */
export interface PredictionGridRowsLoadedEvent {
  /** The run's at-risk rows, highest risk first, exactly as the grid parsed them. */
  Rows: AtRiskRow[];
  /** True when the run has more predictions than {@link PredictiveStudioEngine.MaxRunDetailRows}; `Rows` holds the first ones. */
  Capped: boolean;
  /** The grid's own `MJ: ML Output Bindings` row (its {@link PSPredictionsGridComponent.Surface}); null when the model has none. */
  Binding: SemanticsCheckBinding | null;
}

/**
 * **PSPredictionsGridComponent** — Unified enterprise grid and analytics component for
 * model predictions. Shared between:
 *   1. **Predictions tab** (`PSPredictionsResourceComponent`) — business view of all at-risk records.
 *   2. **Models tab** (`PSProductionComponent`) — analyst run drill-in view.
 *
 * Reads, with no run bound, the latest values of the model pipeline's scoring binding from `MJ: Latest Feature Values`
 * (§5.8.4); with a run bound, that run's process run details.
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
    PSRowDriversComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSPredictionsGridComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  /** The `MJ: ML Models` row whose predictions the grid shows. */
  @Input() ModelId: string | null = null;
  /** The run to show; null shows the latest values of the model pipeline's scoring binding (or, without one, the latest run). */
  @Input() RunId: string | null = null;
  /**
   * The surface the grid renders as, whose `MJ: ML Output Bindings` row it reads: `at-risk-list` in the business
   * workspace, `predictions-grid` in the analyst's run drill-in.
   */
  @Input() Surface: PredictionGridSurface = 'predictions-grid';
  /** The scored entity's name, when the host knows it; otherwise the grid resolves it from the model's pipeline. */
  @Input() EntityName: string | null = null;
  /** The model's problem type until the model row is read (the row's value then wins). */
  @Input() ProblemType: string | null = 'classification';
  /** The grid's title, as the host names it. */
  @Input() Title: string | null = null;
  /** The grid's CSS height. */
  @Input() Height = '560px';
  /** True when the host shows the grid without actions that change records. */
  @Input() ReadOnly = false;

  /**
   * Emitted after the grid parses a run, with the run's at-risk rows. A host that needs the rows (counts, export, a list)
   * takes them from here rather than reading the run a second time. Also emitted, empty, when the model has no run.
   */
  @Output() RowsLoaded = new EventEmitter<PredictionGridRowsLoadedEvent>();
  /** Emitted with the error message when the run's predictions fail to load. */
  @Output() RowsLoadFailed = new EventEmitter<string>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly navigationService = inject(NavigationService);
  private readonly scoreHistoryService = inject(PredictiveStudioScoreHistoryService);

  /** `Math`, for the template. */
  public readonly Math = Math;

  /** The run-detail cap, formatted for the footer notice. */
  public readonly MaxRunDetailRowsLabel = PredictiveStudioEngine.MaxRunDetailRowsLabel;

  /** The tier of a regression row whose value falls in none of the outcome bands. */
  private static readonly unbandedTier: RowTier = { Key: 'unbanded', Label: 'No band', BadgeColor: 'gray' };

  /** True while the run's predictions load. */
  public IsLoading = false;
  /** The load failure's message, shown with a retry; null when the last load succeeded. */
  public LoadError: string | null = null;
  /** True when the run has more predictions than {@link PredictiveStudioEngine.MaxRunDetailRows}; only the first are shown. */
  public DetailRowsCapped = false;

  /** Every displayed row of the run, in the binding row's order (or highest risk first without one). */
  public AllRows: PredictionGridRow[] = [];

  /** The rows the tier, decile and search filters leave; the grid's row data. */
  public FilteredRows: PredictionGridRow[] = [];

  /** The toolbar's search text. */
  public SearchText = '';

  /** The tier chip in force (`all`, a risk band key, or an outcome band key). */
  public SelectedTier: string = 'all';

  /** The model's resolved outcome config: score and status labels, formatting and outcome bands. */
  public OutcomeConfig: OutcomeConfig = ResolveOutcomeConfig();

  /** The tier chips and KPI cards, with their counts. */
  public VisibleBands: VisibleBandSummary[] = [];

  /** The view the toggle shows. */
  public ActiveView: 'grid' | 'chart' = 'grid';

  /** The grid / chart view toggle's options. */
  public readonly ViewOptions = [
    { key: 'grid', icon: 'fa-solid fa-table', title: 'Grid View' },
    { key: 'chart', icon: 'fa-solid fa-chart-column', title: 'Chart View' },
  ];

  // Slide-in detail state
  /** True while the detail drawer is open. */
  public DetailOpen = false;

  /** The detail drawer's width, from the user's setting. */
  public DrawerWidthPx = 640;

  /** The row the detail drawer shows. */
  public SelectedRow: PredictionGridRow | null = null;

  /** True while the selected record's score history loads. */
  public HistoryLoading = false;

  /** The selected record's scores across runs, oldest first. */
  public HistoryPoints: ModelScoreHistoryPoint[] = [];

  /** The scored entity's ID, once resolved. */
  public ResolvedEntityId: string | null = null;

  /** The scored entity's name, once resolved. */
  public ResolvedEntityName: string | null = null;

  /** The entity of the selected record's subject (a person, account…), when it has one. */
  public SubjectEntityName: string | null = null;

  /** The selected record's subject record ID, when it has one. */
  public SubjectRecordId: string | null = null;

  /** The selected record's subject record name, when resolved. */
  public SubjectRecordName: string | null = null;

  private gridApi: GridApi<PredictionGridRow> | null = null;
  private chartGridApi: GridApi<PredictionGridRow> | null = null;

  // Viewport-visible record name lookup cache and state
  private recordNameCache = new Map<string, string>();
  private inFlightLookups = new Set<string>();
  private visibleLookupDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── AG Grid Configuration ──
  /** The AG Grid theme, on the design tokens. */
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

  /** The main grid's options. */
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

  /** The decile drill-down grid's options. */
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

  /** The column defaults both grids share. */
  public DefaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    minWidth: 80,
  };

  /**
   * True when the model's score is the probability of the good outcome, so risk is `1 - score`. With a binding row this
   * is the declared `OutputSemantics` (`AtRiskRules.BuildAtRiskOptions`), never the model's name.
   */
  public IsRenewalModel = false;

  /** The grid's own `MJ: ML Output Bindings` row ({@link Surface}); null when the model has none (the outcome-config rule applies). */
  public Binding: SemanticsCheckBinding | null = null;

  /** The model's `why-badge` binding row: the drivers' label and direction. Null when the model has none. */
  public WhyBadgeBinding: SemanticsCheckBinding | null = null;

  /** Why the polarity could not be read from the model's semantics although a binding row exists; shown as a notice. */
  public SemanticsProblem: string | null = null;

  /** The histogram decile filtering the rows; null when none. */
  public SelectedDecileIndex: number | null = null;

  /**
   * True for a regression model. Risk bands are classification rules, so a regression model's tiers, row band, status and
   * badge come from its outcome bands on the raw value, and the risk column is hidden.
   */
  public get IsRegression(): boolean {
    return ProblemTypes.IsRegression(this.ProblemType);
  }

  /** Both grids' columns ({@link SetupColumnDefs}). */
  public ColumnDefs: ColDef<PredictionGridRow>[] = [];

  /**
   * Builds the columns (and hands them to both grids once they are ready). With a binding row, its `Label` heads the
   * column it names: the risk column of a classification, the value column of a regression.
   */
  public SetupColumnDefs(): void {
    const bindingLabel = this.Binding?.Label || null;
    const scoreLabel = (this.IsRegression && bindingLabel) || this.OutcomeConfig.ScoreLabel || 'Prediction Score';
    const statusLabel = this.OutcomeConfig.StatusLabel || 'Risk Level';
    const riskLabel = (!this.IsRegression && bindingLabel) || 'Risk';
    const driverLabel = this.WhyBadgeBinding?.Label || 'risk';

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
          const scoreAttrs = `data-testid="ps-score-cell" data-score="${params.data.score}"`;

          if (this.IsRegression) {
            return `
              <div class="pg-score-cell" ${scoreAttrs}>
                <span class="pg-score-val ${colorClass}" style="font-weight: 600; font-size: 13.5px;">${formatted}</span>
              </div>
            `;
          }

          const pct = Math.min(100, Math.max(0, Math.round(params.data.score * 100)));
          return `
            <div class="pg-score-cell" ${scoreAttrs}>
              <span class="pg-score-val ${colorClass}">${formatted}</span>
              <div class="pg-score-bar">
                <div class="pg-score-fill ${colorClass}" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        },
      },
      {
        field: 'status',
        headerName: statusLabel,
        width: 155,
        // The tier order: by risk for classification (the tiers are risk bands), by value for regression.
        comparator: (_a: string, _b: string, nodeA, nodeB): number =>
          this.IsRegression
            ? (nodeA.data?.score || 0) - (nodeB.data?.score || 0)
            : (nodeA.data?.riskPct || 0) - (nodeB.data?.riskPct || 0),
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data) return '';
          const badgeColor = params.data.badgeColor || 'gray';
          const icon = params.data.icon ? `<i class="fa-solid ${this.escapeHtml(params.data.icon)}"></i> ` : '';
          const label = this.escapeHtml(params.data.status || params.data.band);
          return `<span class="ps-badge ${badgeColor}" title="${this.escapeHtml(scoreLabel)}: ${this.escapeHtml(params.data.scoreFormatted)}">${icon}${label}</span>`;
        },
      },
      {
        field: 'riskPct',
        headerName: riskLabel,
        width: 95,
        // Risk is a classification measure (1 - score for a good-outcome model); a regression value has none.
        hide: this.IsRegression,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string =>
          params.data ? `<span class="ps-mono" data-testid="ps-risk-cell">${params.data.riskPct}%</span>` : '',
      },
      {
        field: 'class',
        headerName: 'Predicted Outcome',
        width: 135,
        cellRenderer: (params: ICellRendererParams<PredictionGridRow>): string => {
          if (!params.data || !params.data.class) return '<span class="ps-muted">—</span>';
          const cls = this.escapeHtml(params.data.class);
          const style = ResolveOutcomeStyle(params.data.class, this.OutcomeConfig);
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
            const cls = d.Up ? 'up' : 'down';
            const icon = d.Up ? 'fa-arrow-up' : 'fa-arrow-down';
            const label = this.escapeHtml(d.Label);
            // The arrow is the direction the why-badge's row names (risk, or the raw value), not of the score column.
            const title = `${label}: ${d.Up ? 'raises' : 'lowers'} ${this.escapeHtml(driverLabel)}`;
            return `<span class="ps-why-chip ${cls}" title="${title}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
          }).join(' ');
          return `<div class="pg-drivers-cell">${chips}</div>`;
        },
      },
      {
        field: 'scoredAtDate',
        headerName: 'Scored At',
        width: 145,
        comparator: (_a: Date | null, _b: Date | null, nodeA, nodeB): number =>
          PSPredictionsGridComponent.timeOrZero(nodeA.data?.scoredAtDate) - PSPredictionsGridComponent.timeOrZero(nodeB.data?.scoredAtDate),
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
      (changes['ModelId'] && !changes['ModelId'].firstChange) ||
      (changes['RunId'] && !changes['RunId'].firstChange) ||
      (changes['Surface'] && !changes['Surface'].firstChange) ||
      (changes['EntityName'] && !changes['EntityName'].firstChange)
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

  /** Reloads the run's predictions. */
  public async Reload(): Promise<void> {
    await this.loadPredictions();
  }

  private async loadPredictions(): Promise<void> {
    this.resetRunState();
    if (!this.ModelId && !this.RunId) {
      this.applyFilter();
      return;
    }

    this.IsLoading = true;
    this.cdr.markForCheck();

    try {
      const provider = this.ProviderToUse;
      const user = provider.CurrentUser || undefined;
      const read0 = await this.loadModelAndBindings();
      const model = read0.Model;
      const read = await this.loadScoredRows(model, provider, user);
      if (!read) {
        this.applyFilter();
        this.RowsLoaded.emit({ Rows: [], Capped: false, Binding: read0.Binding });
        return;
      }
      const atRiskOptions = this.applyModelOptions(read0);
      const parsedAtRisk = AtRiskRules.ParseAtRiskRows(
        read.Rows.map((d) => ({ RecordID: d.RecordID, ResultPayload: d.ResultPayload })),
        // the drivers render on the why-badge, so its row (when the model has one) signs them
        { ...atRiskOptions, DriverDirectionRelativeTo: this.WhyBadgeBinding?.DriverDirectionRelativeTo || atRiskOptions.DriverDirectionRelativeTo },
      );
      const detailByRecord = new Map<string, PSRunDetailRow>();
      for (const d of read.Rows) {
        detailByRecord.set(NormalizeUUID(d.RecordID), d);
      }
      this.AllRows = parsedAtRisk.map((r) => this.toGridRow(r, detailByRecord.get(NormalizeUUID(r.RecordID))));
      this.DetailRowsCapped = read.Capped;

      this.computeVisibleBands();
      this.applyFilter();
      this.RowsLoaded.emit({ Rows: parsedAtRisk, Capped: read.Capped, Binding: this.Binding });

      // Lazy lookup of record names for visible rows
      this.ScheduleVisibleRowsLookup(0);
    } catch (err) {
      this.LoadError = err instanceof Error ? err.message : String(err);
      LogError(`PSPredictionsGridComponent.loadPredictions: ${this.LoadError}`);
      this.RowsLoadFailed.emit(this.LoadError);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The rows the grid shows. With no run bound and an `Active` scoring binding on the model's pipeline: the binding's
   * latest values from `MJ: Latest Feature Values` (§5.8.4). With a run bound (an analyst's drill-in to a past run), or a
   * model whose pipeline has no binding: that run's — or the latest run's — process run details, the per-run audit.
   * Null when there is nothing to show (no binding and no run). Throws when a read fails.
   */
  private async loadScoredRows(model: PredictionGridModelFields | null, provider: IMetadataProvider, user: UserInfo | undefined): Promise<PSRunDetails | null> {
    const binding = this.RunId ? null : this.activeScoringBinding(model);
    if (binding) {
      this.resolveBindingEntity(binding);
      const latest = await this.LoadLatestValues(binding);
      return { Rows: latest.Rows.map((r) => LatestPredictionRows.ToRunDetail(r)).filter((r): r is PSRunDetailRow => r !== null), Capped: latest.Capped };
    }
    const runId = this.RunId || (await this.resolveLatestRunId());
    if (!runId) return null;
    await this.resolveTargetEntity(model);
    // The run's process run details by keyset paging, read-only and only the columns the grid uses; throws on failure.
    return PredictiveStudioEngine.Instance.LoadRunDetails(runId, provider, user);
  }

  /**
   * The model pipeline's `Active` scoring binding (with a target entity) the grid shows, from the engine's cache, chosen
   * the same way on every read: when the host opened the grid for an entity (`EntityName`), the Active binding on that
   * entity, or none; otherwise any Active binding. Several candidates (a pipeline's bindings are unique per entity and
   * feature, not per pipeline) are ordered by feature name, then ID, and the first is shown.
   */
  private activeScoringBinding(model: PredictionGridModelFields | null): MJMLModelScoringBindingEntity | null {
    if (!model?.PipelineID) return null;
    const opened = this.EntityName ? this.ProviderToUse.EntityByName(this.EntityName) : undefined;
    const candidates = PredictiveStudioEngine.Instance.ScoringBindingsForPipeline(model.PipelineID)
      .filter((b) => b.Status === 'Active' && !!b.TargetEntityID && (!opened || UUIDsEqual(b.TargetEntityID, opened.ID)))
      .sort((a, b) => a.FeatureName.localeCompare(b.FeatureName) || NormalizeUUID(a.ID).localeCompare(NormalizeUUID(b.ID)));
    return candidates[0] || null;
  }

  /** Resolves the scored entity to the binding's target entity, whose records its values name. */
  private resolveBindingEntity(binding: MJMLModelScoringBindingEntity): void {
    const entity = binding.TargetEntityID ? this.ProviderToUse.EntityByID(binding.TargetEntityID) : undefined;
    this.ResolvedEntityId = entity ? entity.ID : binding.TargetEntityID;
    this.ResolvedEntityName = entity ? entity.Name : null;
  }

  /**
   * The binding's latest scored values (`Source = 'Model'`) from `MJ: Latest Feature Values`, one keyset page at a time,
   * up to {@link PredictiveStudioEngine.MaxRunDetailRows}; `Capped` when more exist. Read past MJAPI's RunView cache: the
   * view entity has no save event to invalidate a cached read. The row-level security filter returns no row to a user
   * who does not hold the binding's view authorization.
   *
   * @throws Error when a page fails to load
   */
  protected async LoadLatestValues(binding: LatestPredictionBinding): Promise<{ Rows: LatestPredictionRow[]; Capped: boolean }> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const user = this.ProviderToUse.CurrentUser || undefined;
    const rows: LatestPredictionRow[] = [];
    let afterKey: CompositeKey | undefined;
    while (true) {
      const page = await rv.RunView<LatestPredictionRow>(
        {
          EntityName: 'MJ: Latest Feature Values',
          ExtraFilter: LatestPredictionRows.Filter(binding),
          Fields: [...LatestPredictionRows.Fields],
          MaxRows: PSPredictionsGridComponent.latestPageSize,
          AfterKey: afterKey,
          ResultType: 'simple',
          BypassCache: true,
        },
        user,
      );
      if (!page.Success || !page.Results) {
        throw new Error(`Could not read the latest values of "${binding.FeatureName}": ${page.ErrorMessage || 'the request failed'}`);
      }
      rows.push(...page.Results);
      if (page.Results.length < PSPredictionsGridComponent.latestPageSize) return { Rows: rows, Capped: false };
      afterKey = CompositeKey.FromID(page.Results[page.Results.length - 1].ID); // first-pk-ok: keyset AfterKey over MJ: Latest Feature Values (single ID key)
      if (rows.length >= PredictiveStudioEngine.MaxRunDetailRows) {
        // Capped only when more really exist: exactly the cap is complete.
        const probe = await rv.RunView<Pick<LatestPredictionRow, 'ID'>>(
          { EntityName: 'MJ: Latest Feature Values', ExtraFilter: LatestPredictionRows.Filter(binding), Fields: ['ID'], MaxRows: 1, SkipTotalRowCount: true, AfterKey: afterKey, ResultType: 'simple', BypassCache: true },
          user,
        );
        return { Rows: rows, Capped: probe.Success && probe.Results.length > 0 };
      }
    }
  }

  /** The page size of {@link LoadLatestValues}. */
  private static readonly latestPageSize = 1000;

  /** Clears everything derived from the previous run, so a model or run switch never shows the old run's rows or notices. */
  private resetRunState(): void {
    this.AllRows = [];
    this.FilteredRows = [];
    this.VisibleBands = [];
    this.DetailRowsCapped = false;
    this.LoadError = null;
    this.SelectedTier = 'all';
    this.SelectedDecileIndex = null;
    this.Binding = null;
    this.WhyBadgeBinding = null;
    this.SemanticsProblem = null;
  }

  /** The bound model and its binding rows, or nothing when no model id is bound. */
  private async loadModelAndBindings(): Promise<PredictionGridModelRead> {
    if (!this.ModelId) return { Model: null, Binding: null, WhyBadge: null };
    return this.LoadModelWithBindings(this.ModelId);
  }

  /**
   * The model and the binding rows the grid renders from — its {@link Surface}'s and the `why-badge`'s — in one batched
   * `RunViews` read (rows are read at render, so an edited row shows on the next load).
   *
   * @throws Error when a read fails (a failed binding read is never taken as "the model has no row")
   */
  protected async LoadModelWithBindings(modelId: string): Promise<PredictionGridModelRead> {
    const provider = this.ProviderToUse;
    const id = EscapeSQLString(modelId);
    const [modelRes, bindingRes, whyBadgeRes] = await RunView.FromMetadataProvider(provider).RunViews<PredictionGridModelFields | OutputBindingEntityRow>(
      [
        { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${id}'`, Fields: [...PREDICTION_GRID_MODEL_FIELDS], MaxRows: 1, SkipTotalRowCount: true, ResultType: 'simple' },
        PSPredictionsGridComponent.bindingParams(id, this.Surface),
        PSPredictionsGridComponent.bindingParams(id, 'why-badge'),
      ],
      provider.CurrentUser || undefined,
    );
    for (const r of [modelRes, bindingRes, whyBadgeRes]) {
      if (!r || !r.Success) throw new Error(`Reading ML Model ${modelId} and its output bindings failed: ${r?.ErrorMessage || 'unknown error'}`);
    }
    return {
      Model: modelRes.Results.find(PSPredictionsGridComponent.isModelRow) || null,
      Binding: OutputBindingRows.ForSurface(bindingRes.Results.filter(PSPredictionsGridComponent.isBindingRow), this.Surface),
      WhyBadge: OutputBindingRows.ForSurface(whyBadgeRes.Results.filter(PSPredictionsGridComponent.isBindingRow), 'why-badge'),
    };
  }

  /** The read of a model's binding row for one surface: a simple read of the binding fields, past the server's RunView cache; at most one row per surface. */
  private static bindingParams(escapedModelId: string, surface: SemanticsCheckBinding['Surface']): RunViewParams {
    return {
      EntityName: 'MJ: ML Output Bindings',
      ExtraFilter: `ModelID='${escapedModelId}' AND Surface='${surface}'`,
      Fields: [...OutputBindingRows.Fields],
      MaxRows: 1,
      SkipTotalRowCount: true,
      ResultType: 'simple',
      // The row is what renders, so it is read past MJAPI's RunView cache: a row changed outside the entity layer (no
      // invalidation event) would otherwise keep rendering its old label and order until the server restarts.
      BypassCache: true,
    };
  }

  private static isModelRow(r: PredictionGridModelFields | OutputBindingEntityRow): r is PredictionGridModelFields {
    return 'TargetVariable' in r;
  }

  private static isBindingRow(r: PredictionGridModelFields | OutputBindingEntityRow): r is OutputBindingEntityRow {
    return 'Surface' in r;
  }

  /** The model's latest run when no run id is bound, or null when it has none. */
  private async resolveLatestRunId(): Promise<string | null> {
    if (!this.ModelId) return null;
    const provider = this.ProviderToUse;
    const runs = await PredictiveStudioEngine.Instance.LoadRecentRunsForModel(this.ModelId, provider, provider.CurrentUser || undefined, { maxRows: 1 });
    return runs[0]?.ID || null;
  }

  /**
   * The model's problem type, outcome config, polarity, sort and driver direction: one rule (`BuildAtRiskOptions` over
   * the model and its binding row), shared with the gate probe.
   */
  private applyModelOptions(read: PredictionGridModelRead): AtRiskModelOptions {
    const model = read.Model;
    if (model?.ProblemType) {
      this.ProblemType = model.ProblemType.toLowerCase();
    }
    this.Binding = read.Binding;
    this.WhyBadgeBinding = read.WhyBadge;
    const atRiskOptions = AtRiskRules.BuildAtRiskOptions(model || undefined, read.Binding);
    this.OutcomeConfig = atRiskOptions.OutcomeConfig;
    this.SemanticsProblem = atRiskOptions.SemanticsProblem;
    // When risk is inverted the score is P(good outcome): risk is 1 - score, while the displayed score stays the model's own.
    this.IsRenewalModel = atRiskOptions.InvertedRisk === true;
    this.SetupColumnDefs();
    return atRiskOptions;
  }

  /** One displayed row: the model's own score, its risk, and its tier (risk band, or outcome band for regression). */
  private toGridRow(r: AtRiskRow, detail: PSRunDetailRow | undefined): PredictionGridRow {
    const dt = detail?.CompletedAt || detail?.__mj_CreatedAt || null;
    const tier = this.tierFor(r);
    return {
      recordId: r.RecordID,
      recordName: r.Label || r.RecordID,
      score: r.Score,
      scoreFormatted: FormatPredictionScore(r.Score, this.OutcomeConfig, this.ProblemType),
      riskPct: r.RiskPct,
      band: tier.Key,
      badgeColor: tier.BadgeColor,
      icon: tier.Icon,
      class: r.Class,
      drivers: r.Drivers || [],
      status: tier.Label,
      scoredAtDate: dt instanceof Date ? dt : dt ? new Date(dt) : null,
    };
  }

  /**
   * A row's tier. Classification: the risk band Core put on the row, so "High" is the riskiest records whatever the
   * polarity. Regression: the outcome band of the raw value (risk bands do not apply to a value such as an LTV).
   */
  private tierFor(r: AtRiskRow): RowTier {
    if (!this.IsRegression) {
      return { Key: r.Band, Label: r.Status, BadgeColor: r.BadgeColor, Icon: r.Icon };
    }
    const band = ResolveScoreBand(r.Score, this.OutcomeConfig);
    return band ? { Key: band.Key, Label: band.Label, BadgeColor: band.BadgeColor, Icon: band.Icon } : PSPredictionsGridComponent.unbandedTier;
  }

  private async resolveTargetEntity(model: PredictionGridModelFields | null): Promise<void> {
    const provider = this.ProviderToUse;
    if (this.EntityName) {
      const e = provider.EntityByName(this.EntityName);
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
          ExtraFilter: `ID = '${EscapeSQLString(model.PipelineID)}'`,
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
          Fields: ['TargetEntityID'],
        },
        provider.CurrentUser || undefined,
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
        provider.CurrentUser || undefined,
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

      // Keep AllRows in sync so client-side filter and view toggle retain resolved names
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

  /** Keeps the main grid's API and resolves the visible rows' names. */
  public OnGridReady(event: GridReadyEvent<PredictionGridRow>): void {
    this.gridApi = event.api;
    this.ScheduleVisibleRowsLookup(50);
  }

  /** Keeps the drill-down grid's API and resolves the visible rows' names. */
  public OnChartGridReady(event: GridReadyEvent<PredictionGridRow>): void {
    this.chartGridApi = event.api;
    this.ScheduleVisibleRowsLookup(50);
  }

  /** Opens the record when its link in the record cell is clicked. */
  public OnCellClicked(event: CellClickedEvent<PredictionGridRow>): void {
    const target = event.event?.target as HTMLElement | null;
    if (target && target.closest('[data-action="open-record"]')) {
      if (event.data) {
        this.DrillThrough(event.data);
      }
    }
  }

  /** Opens the detail drawer for a clicked row (not for a click on the record link). */
  public OnRowClicked(event: RowClickedEvent<PredictionGridRow>): void {
    const target = event.event?.target as HTMLElement | null;
    if (target && target.closest('[data-action="open-record"]')) {
      return; // Handled by cell link click; do not open detail drawer
    }
    if (event.data) {
      this.OpenDetail(event.data);
    }
  }

  /** Applies the toolbar's search text. */
  public OnSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.SearchText = target.value || '';
    this.applyFilter();
  }

  /** Filters by a tier chip. */
  public SetTier(tier: string): void {
    this.SelectedTier = tier;
    this.applyFilter();
  }

  /** Filters by a KPI card's tier and shows the grid. */
  public SetTierAndGrid(tier: string): void {
    this.SelectedTier = tier;
    this.ActiveView = 'grid';
    this.applyFilter();
  }

  /** The badge colour of a predicted class. */
  public GetOutcomeBadgeClass(className: string | null | undefined): string {
    return ResolveOutcomeStyle(className, this.OutcomeConfig).BadgeColor;
  }

  /** The design token of a badge colour. */
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

  /**
   * The tier chips and KPI cards, each with its tier's average model score. Classification: one per risk band (the
   * at-risk list's tiers). Regression: one per configured outcome band, plus any tier a row landed in outside them.
   */
  private computeVisibleBands(): void {
    const tiers: RowTier[] = this.IsRegression ? this.regressionTiers() : AtRiskRules.RiskBands.map((b) => ({ Key: b.Key, Label: b.Label, BadgeColor: b.BadgeColor, Icon: b.Icon }));
    this.VisibleBands = tiers.map((t) => this.summarizeTier(t));
  }

  /** The configured outcome bands, then each other tier the rows carry (e.g. values outside every band), in row order. */
  private regressionTiers(): RowTier[] {
    const tiers: RowTier[] = (this.OutcomeConfig.Bands || []).map((b) => ({ Key: b.Key, Label: b.Label, BadgeColor: b.BadgeColor, Icon: b.Icon }));
    const known = new Set(tiers.map((t) => t.Key));
    for (const r of this.AllRows) {
      if (!known.has(r.band)) {
        known.add(r.band);
        tiers.push({ Key: r.band, Label: r.status, BadgeColor: r.badgeColor || 'gray', Icon: r.icon });
      }
    }
    return tiers;
  }

  /** A tier's chip / KPI card: its row count, share and average model score. */
  private summarizeTier(t: RowTier): VisibleBandSummary {
    const total = this.AllRows.length;
    const matching = this.AllRows.filter((r) => r.band === t.Key);
    const count = matching.length;
    const rawAvg = count > 0 ? matching.reduce((sum, r) => sum + r.score, 0) / count : 0;
    return {
      key: t.Key,
      label: t.Label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      avgScore: Math.round(rawAvg * 100),
      avgScoreFormatted: FormatPredictionScore(rawAvg, this.OutcomeConfig, this.ProblemType),
      badgeColor: t.BadgeColor,
      icon: t.Icon,
    };
  }

  /** Switches between the grid and chart views. */
  public OnViewToggle(key: string): void {
    this.ActiveView = key === 'chart' ? 'chart' : 'grid';
    this.cdr.markForCheck();
  }

  /** Clears the toolbar's search. */
  public ClearSearch(): void {
    this.SearchText = '';
    this.applyFilter();
  }

  /** Filters by a histogram decile (again to clear) and scrolls to the drill-down. */
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

  /** Clears the decile filter. */
  public ClearDecileFilter(): void {
    this.SelectedDecileIndex = null;
    this.applyFilter();
  }

  /** The selected tier's label for the footer ("High risk", or an outcome band's label), empty when all tiers show. */
  public get SelectedTierLabel(): string {
    if (this.SelectedTier === 'all') return '';
    const label = this.VisibleBands.find((b) => b.key === this.SelectedTier)?.label;
    return label === null || label === undefined ? this.SelectedTier : label;
  }

  /** The selected decile's range, e.g. `40%–50%`; empty when none. */
  public get SelectedDecileLabel(): string {
    if (this.SelectedDecileIndex === null) return '';
    return `${this.SelectedDecileIndex * 10}%–${(this.SelectedDecileIndex + 1) * 10}%`;
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
        r.drivers.some((d) => d.Label.toLowerCase().includes(q)),
      );
    }

    this.FilteredRows = rows;
    this.cdr.markForCheck();
    this.ScheduleVisibleRowsLookup(30);
  }

  // ── Drill-Through Navigation ──

  /** Opens a row's record in Explorer. */
  public DrillThrough(row: PredictionGridRow): void {
    const entName = this.ResolvedEntityName || this.EntityName;
    if (!entName) return;

    try {
      const entity = this.ProviderToUse.EntityByName(entName);
      const ck = CompositeKey.FromURLSegment(entity, row.recordId);
      this.navigationService.OpenEntityRecord(entName, ck);
    } catch (err) {
      LogError(`PSPredictionsGridComponent.DrillThrough failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Slide-In Detail & Score History ──

  /** Keeps the drawer width and saves it as the user's setting. */
  public OnDrawerWidthChanged(width: number): void {
    this.DrawerWidthPx = width;
    UserInfoEngine.Instance.SetSettingDebounced('mj.predictiveStudio.predictions.drawerWidth', width.toString());
  }

  /** Opens the detail drawer for a row and loads its score history and subject record. */
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

    const entName = this.ResolvedEntityName || this.EntityName;
    if (entName) {
      void this.resolveSubjectRecord(entName, row.recordId);
    }
  }

  /** Closes the detail drawer. */
  public CloseDetail(): void {
    this.DetailOpen = false;
    this.SelectedRow = null;
    this.HistoryPoints = [];
    this.SubjectEntityName = null;
    this.SubjectRecordId = null;
    this.SubjectRecordName = null;
    this.cdr.markForCheck();
  }

  /** Opens the selected record's subject record in Explorer. */
  public OpenSubjectRecord(): void {
    if (!this.SubjectEntityName || !this.SubjectRecordId) return;
    try {
      const entity = this.ProviderToUse.EntityByName(this.SubjectEntityName);
      if (!entity) return;
      const ck = CompositeKey.FromURLSegment(entity, this.SubjectRecordId);
      this.navigationService.OpenEntityRecord(this.SubjectEntityName, ck);
    } catch (err) {
      LogError(`PSPredictionsGridComponent.OpenSubjectRecord failed: ${err instanceof Error ? err.message : String(err)}`);
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
          ExtraFilter: `${entity.FirstPrimaryKey.Name} = '${EscapeSQLString(recordId)}'`, // first-pk-ok: Single-key entity lookup by recordId
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
          Fields: [matchedField],
        },
        provider.CurrentUser || undefined,
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
              provider.CurrentUser || undefined,
            );

            if (names && names.length > 0 && names[0].Success) {
              const recordName = names[0].RecordName;
              this.SubjectRecordName = recordName === null || recordName === undefined ? null : recordName;
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
        User: this.ProviderToUse.CurrentUser || undefined,
        entityId: this.ResolvedEntityId,
        recordId,
        modelId: this.ModelId,
        OutcomeConfig: this.OutcomeConfig,
        ProblemType: this.ProblemType,
        InvertedRisk: this.IsRenewalModel,
      });
    } finally {
      this.HistoryLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** The scored entity's name for display. */
  public get EntityDisplayName(): string {
    return this.ResolvedEntityName || this.EntityName || 'Entity Record';
  }

  // ── KPI & Chart Computations ──

  /** Rows in the high tier. */
  public get HighCount(): number {
    return this.AllRows.filter((r) => r.band === 'high').length;
  }

  /** Rows in the medium tier. */
  public get MediumCount(): number {
    return this.AllRows.filter((r) => r.band === 'medium').length;
  }

  /** Rows in the low tier. */
  public get LowCount(): number {
    return this.AllRows.filter((r) => r.band === 'low').length;
  }

  /** The high tier's share of the rows, 0–100. */
  public get HighPct(): number {
    return this.AllRows.length > 0 ? Math.round((this.HighCount / this.AllRows.length) * 100) : 0;
  }

  /** The medium tier's share of the rows, 0–100. */
  public get MediumPct(): number {
    return this.AllRows.length > 0 ? Math.round((this.MediumCount / this.AllRows.length) * 100) : 0;
  }

  /** The low tier's share of the rows, 0–100. */
  public get LowPct(): number {
    return this.AllRows.length > 0 ? Math.round((this.LowCount / this.AllRows.length) * 100) : 0;
  }

  /** The high tier's mean risk, 0–100. */
  public get HighAvg(): number {
    return this.HighAvgRisk;
  }

  /** The medium tier's mean risk, 0–100. */
  public get MediumAvg(): number {
    return this.MediumAvgRisk;
  }

  /** The low tier's mean risk, 0–100. */
  public get LowAvg(): number {
    return this.LowAvgRisk;
  }

  /** The high tier's mean risk, 0–100. */
  public get HighAvgRisk(): number {
    const list = this.AllRows.filter((r) => r.band === 'high');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }

  /** The medium tier's mean risk, 0–100. */
  public get MediumAvgRisk(): number {
    const list = this.AllRows.filter((r) => r.band === 'medium');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }

  /** The low tier's mean risk, 0–100. */
  public get LowAvgRisk(): number {
    const list = this.AllRows.filter((r) => r.band === 'low');
    return list.length > 0 ? Math.round(list.reduce((acc, r) => acc + r.riskPct, 0) / list.length) : 0;
  }

  /** The rows' mean model score, 0–100. */
  public get MeanScorePct(): number {
    if (this.AllRows.length === 0) return 0;
    const total = this.AllRows.reduce((acc, r) => acc + r.score, 0);
    return Math.round((total / this.AllRows.length) * 100);
  }

  /** The rows' mean model score, formatted by the outcome config. */
  public get MeanScoreFormatted(): string {
    if (this.AllRows.length === 0) return '—';
    const total = this.AllRows.reduce((acc, r) => acc + r.score, 0);
    const avg = total / this.AllRows.length;
    return FormatPredictionScore(avg, this.OutcomeConfig, this.ProblemType);
  }

  /** The 10-bin score histogram of the chart view. */
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
      const band = ResolveScoreBand(centerScore, this.OutcomeConfig);
      const color = band ? this.GetBadgeColorVar(band.BadgeColor) : 'var(--mj-brand-primary)';

      let label: string;
      let shortLabel: string;
      if (isReg) {
        const fmtMin = FormatPredictionScore(binMin, this.OutcomeConfig, this.ProblemType);
        const fmtMax = FormatPredictionScore(binMax, this.OutcomeConfig, this.ProblemType);
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

  /** The predicted classes' shares, largest first. */
  public get ClassBreakdown(): ClassShare[] {
    const total = this.AllRows.length;
    if (total === 0) return [];

    const counts = new Map<string, number>();
    for (const r of this.AllRows) {
      if (r.class) {
        counts.set(r.class, (counts.get(r.class) || 0) + 1);
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

  /** The score-history trendline's points, in SVG coordinates. */
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
      const band = ResolveScoreBand(pt.score, this.OutcomeConfig);
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

  /** The trendline's polyline points. */
  public get TrendlineLinePoints(): string {
    return this.TrendlinePlotPoints.map((p) => `${p.x},${p.y}`).join(' ');
  }

  /** The trendline's filled-area polygon points. */
  public get TrendlineAreaPoints(): string {
    const plot = this.TrendlinePlotPoints;
    if (plot.length === 0) return '';
    const first = plot[0];
    const last = plot[plot.length - 1];
    return `${first.x},130 ` + plot.map((p) => `${p.x},${p.y}`).join(' ') + ` ${last.x},130`;
  }

  // ── CSV Export ──

  /** True while the selection is being saved as a List. */
  public SavingList = false;

  /** The outcome of the last "Save as list", for the toolbar; null before any. */
  public ListMessage: string | null = null;

  /** The most records a selection saved as a List may hold (its User View names each record). */
  public static readonly MaxListSelection = 5000;

  /** {@link MaxListSelection}, for the template. */
  public readonly ListSelectionLimit = PSPredictionsGridComponent.MaxListSelection;

  /** True when the shown rows can be saved as a List: a resolved target entity and 1..{@link MaxListSelection} rows. */
  public get CanSaveAsList(): boolean {
    return !this.SavingList && !!this.ResolvedEntityName && this.FilteredRows.length > 0 && this.FilteredRows.length <= PSPredictionsGridComponent.MaxListSelection;
  }

  /**
   * Saves the grid's selection — the rows its tier and decile filters show — as a new List (§5.4): a private User View
   * of the target entity naming the selected records, materialized through the existing "Materialize List From View"
   * action (with lineage to the view), then opens the List. No new action and no direct List Detail writes. When the
   * action fails after the view was saved, the view is deleted again, so a failed save leaves nothing behind.
   */
  public async SaveSelectionAsList(): Promise<void> {
    const entity = this.ResolvedEntityName ? this.ProviderToUse.EntityByName(this.ResolvedEntityName) : undefined;
    if (!this.CanSaveAsList || !entity) return;
    this.SavingList = true;
    this.ListMessage = null;
    this.cdr.markForCheck();
    let view: MJUserViewEntity | null = null;
    let listCreated = false;
    try {
      const user = this.ProviderToUse.CurrentUser;
      const name = this.selectionListName();
      view = await this.ProviderToUse.GetEntityObject<MJUserViewEntity>('MJ: User Views', user);
      view.NewRecord();
      view.Name = name;
      view.EntityID = entity.ID;
      view.UserID = user.ID;
      view.IsShared = false;
      // A plain view (not CustomWhereClause, which MJ allows only an Owner), the provider screens its clause when the
      // view runs. The selection is also its FilterState: a later save of the view recompiles WhereClause from
      // FilterState, and this one compiles to the same records, so the lineage-linked List's refresh keeps them.
      const recordIds = this.FilteredRows.map((r) => r.recordId);
      view.WhereClause = BuildRecordIdFilter(entity, recordIds);
      view.FilterState = JSON.stringify(PSPredictionsGridComponent.SelectionFilterState(entity, recordIds));
      if (!(await view.Save())) throw new Error(`the selection's view was not saved: ${view.LatestResult?.CompleteMessage || 'unknown error'}`);
      const actionId = await this.materializeActionID();
      const result = await this.RunListAction(actionId, [
        { Name: 'ViewID', Value: view.ID, Type: 'Input' },
        { Name: 'ListName', Value: name, Type: 'Input' },
        { Name: 'RememberLineage', Value: 'true', Type: 'Input' },
      ]);
      const listId = result.Params?.find((p) => p.Name === 'CreatedListID')?.Value;
      if (!result.Success || typeof listId !== 'string' || !listId) throw new Error(result.Message || 'the action created no list');
      listCreated = true;
      this.ListMessage = `Saved ${this.FilteredRows.length} record(s) as the list "${name}".`;
      this.navigationService.OpenEntityRecord('MJ: Lists', CompositeKey.FromID(listId));
    } catch (e) {
      this.ListMessage = `Could not save the list: ${e instanceof Error ? e.message : String(e)}`;
      LogError(`PSPredictionsGridComponent.SaveSelectionAsList: ${this.ListMessage}`);
    } finally {
      if (!listCreated && view?.IsSaved) await this.deleteSelectionView(view);
      this.SavingList = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The User View FilterState naming exactly `recordIds` (compact key segments) of `entity`: for a single-column key,
   * `in` rules of at most {@link CompositeFilterSQLCompiler.DefaultMaxInValues} IDs (the compiler's limit) ORed
   * together; for a composite key, one AND of `eq` rules per record, ORed together.
   */
  public static SelectionFilterState(entity: EntityInfo, recordIds: readonly string[]): CompositeFilterDescriptor {
    if (entity.PrimaryKeys.length === 1) {
      const field = entity.FirstPrimaryKey.Name; // first-pk-ok: guarded by PrimaryKeys.length === 1
      const chunk = CompositeFilterSQLCompiler.DefaultMaxInValues;
      const filters: CompositeFilterDescriptor['filters'] = [];
      for (let i = 0; i < recordIds.length; i += chunk) filters.push({ field, operator: 'in', value: recordIds.slice(i, i + chunk) });
      return { logic: 'or', filters };
    }
    return {
      logic: 'or',
      filters: recordIds.map((id) => ({
        logic: 'and',
        filters: CompositeKey.FromURLSegment(entity, id).KeyValuePairs.map((kv) => ({ field: kv.FieldName, operator: 'eq', value: kv.Value })),
      })),
    };
  }

  /**
   * Deletes the private view a failed "Save as list" created. Its own failure is logged and does not replace the
   * message the user sees, which names why the list was not created.
   */
  private async deleteSelectionView(view: MJUserViewEntity): Promise<void> {
    try {
      if (!(await view.Delete())) LogError(`PSPredictionsGridComponent.SaveSelectionAsList: the selection's view ${view.ID} was not deleted: ${view.LatestResult?.CompleteMessage || 'unknown error'}`);
    } catch (e) {
      LogError(`PSPredictionsGridComponent.SaveSelectionAsList: the selection's view ${view.ID} was not deleted: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Runs an action through the GraphQL action client of the grid's provider (the way Explorer surfaces run actions).
   *
   * @throws Error when the provider is not a GraphQL data provider
   */
  public async RunListAction(actionId: string, params: ActionParam[]): Promise<Pick<ActionResult, 'Success' | 'Message' | 'Params'>> {
    const provider = this.ProviderToUse;
    if (!(provider instanceof GraphQLDataProvider)) throw new Error('running an action needs a GraphQL data provider');
    return new GraphQLActionClient(provider).RunAction(actionId, params);
  }

  /** The ID of the "Materialize List From View" action, by name. */
  private async materializeActionID(): Promise<string> {
    const r = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{ ID: string }>(
      { EntityName: 'MJ: Actions', ExtraFilter: `Name='${EscapeSQLString(PSPredictionsGridComponent.materializeActionName)}'`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
      this.ProviderToUse.CurrentUser,
    );
    const id = r.Success ? r.Results[0]?.ID : undefined;
    if (!id) throw new Error(`the "${PSPredictionsGridComponent.materializeActionName}" action is not available${r.ErrorMessage ? `: ${r.ErrorMessage}` : ''}`);
    return id;
  }

  private static readonly materializeActionName = 'Materialize List From View';

  /** "<title>: <tier> (<date>)", within the 100 characters of `MJ: Lists.Name`. */
  private selectionListName(): string {
    const title = this.Title || this.ResolvedEntityName || 'Predictions';
    const parts = [this.SelectedTierLabel, this.SelectedDecileLabel].filter((p) => p).join(', ') || 'all';
    const name = `${title}: ${parts} (${new Date().toISOString().slice(0, 10)})`;
    return name.length > 100 ? `${name.slice(0, 99)}…` : name;
  }

  /** Downloads the filtered rows as a CSV. */
  public ExportCSV(): void {
    if (this.AllRows.length === 0) return;

    const scoreHeader = this.OutcomeConfig.ScoreLabel || 'Prediction Score';
    const statusHeader = this.OutcomeConfig.StatusLabel || 'Risk Level';
    const headers = ['Record ID', 'Record Name', scoreHeader, statusHeader, 'Predicted Class', 'Top Drivers (+ raises risk, − lowers risk)', 'Scored At'];
    // Quoted: the drivers header carries a comma.
    const lines = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',')];

    for (const r of this.FilteredRows) {
      const driversStr = r.drivers.map((d) => `${d.Up ? '+' : '−'}${d.Label}`).join('; ');
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

  /** A date's epoch milliseconds for sorting; 0 when there is no date (an invalid date keeps its NaN, as before). */
  private static timeOrZero(d: Date | null | undefined): number {
    const t = d?.getTime();
    return t === null || t === undefined ? 0 : t;
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
