import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  Optional,
  inject,
} from '@angular/core';
import { RunView } from '@memberjunction/core';
import {
  MJApplicationEntity,
  MJComponentEntity,
  MJLearningPathEntity,
  MJLearningPathTourEntity,
  MJRoleEntity,
  MJTourEntity,
  MJTourOverrideEntity,
  MJTourRunEntity,
  MJTourRunStepEntity,
  MJTourStepEntity,
  MJTourStepEntity_ITourAnchor,
  MJTourStepEntity_ITourCompletion,
  MJTourStepEntity_ITourCompletionCheck,
  MJTourStepEntity_ITourStepConfiguration,
  MJTourStepEntity_ITourStepLocalization,
  MJTourStepEntity_ITourStepPrepare,
  MJTourStepPathEntity,
  MJTourStepTypeEntity,
  MJTourSurfaceEntity,
  MJTourSurfaceTourEntity,
  MJTourVersionEntity,
  MJUserEntity,
  ResourceData,
  TourEngine,
} from '@memberjunction/core-entities';
import { GroupByUUID, RegisterClass, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard, SafeDetectChanges } from '@memberjunction/ng-shared';
import { MJ_TOUR_HOST } from '@memberjunction/ng-tours';
import { FilterFieldConfig, TabConfig } from '@memberjunction/ng-ui-components';
import {
  ComputeTourGraphLayout,
  ITourHost,
  TourDefinition,
  TourLaunchSource,
  TourSessionGuideMode,
  TourSignals,
  ValidateTourGraph,
  CompileTourGraph,
} from '@memberjunction/tours-runtime';
import { ValidateStringParam } from '../shared/agent-tool-validation';
import {
  BuildTourNotFoundError,
  BuildTourStudioAgentContext,
  IsValidTourStudioTab,
  ResolveTourByIdOrKeyOrName,
  ResolveTourStudioTab,
  TOUR_STUDIO_TABS,
  TourCandidate,
} from './tour-studio-agent-context';
import {
  BuildTourDefinitionFromEntities,
  ComputeSurfaceCapabilityWarnings,
  GraphSvgData,
  GraphSvgEdge,
  GraphSvgNode,
  GuideModeMetricRow,
  LearningPathView,
  OverrideView,
  ParseConfigSchemaFields,
  ProposedAnchorResult,
  SchemaFieldDescriptor,
  TourAnalyticsSummary,
  TourCatalogItem,
  TourStepAnchorHealthRow,
  TourStudioTab,
  TourSurfaceCapabilityWarning,
} from './tour-studio.types';

interface TourLauncherHost extends ITourHost {
  StartTour?(
    tourKey: string,
    options?: {
      Mode?: TourSessionGuideMode;
      LaunchSource?: TourLaunchSource;
      StartAtStepKey?: string;
      TourOverride?: TourDefinition;
      SimulatedRoles?: string[];
    },
  ): Promise<unknown>;
}

const QUERY_PARAM_TAB = 'tab';
const QUERY_PARAM_TOUR = 'tourKey';

/**
 * Tour Studio Dashboard — visual authoring, pathway DAG graph inspection, schema-driven
 * step editing, element picker & recorder, role/surface simulation, learning path & override
 * governance, and completion / goal-lift / anchor-health analytics for MemberJunction Guided Tours.
 *
 * 🔒 SAFETY BOUNDARY:
 * The AI agent receives ONLY navigation, filtering, search, selection, read-only validation,
 * and preview tools (`SwitchTourStudioTab`, `SearchTours`, `FilterTours`, `SelectTour`,
 * `PreviewSelectedTour`, `ValidateSelectedTourGraph`, `RefreshTourStudio`).
 * Mutating / publishing / org-impacting operations (`PublishTour`, `SaveTour`, `SaveStep`,
 * `SaveStepPath`, `SaveTourOverride`, `DeleteTour`, `SaveLearningPath`) are deliberately NOT
 * exposed to the agent and stay strictly user-triggered in the UI.
 */
@Component({
  standalone: false,
  selector: 'mj-tour-studio-dashboard',
  templateUrl: './tour-studio-dashboard.component.html',
  styleUrls: ['./tour-studio-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'TourStudioDashboard')
export class TourStudioDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly tourHost = inject(MJ_TOUR_HOST, { optional: true }) as TourLauncherHost | null;

  public IsLoading = false;
  public IsSaving = false;
  public IsPublishing = false;
  public BannerMessage: string | null = null;
  public BannerKind: 'info' | 'warning' | 'error' = 'info';

  public ActiveTab: TourStudioTab = 'catalog';
  public SearchQuery = '';
  public FilterValues: Record<string, unknown> = {};

  // Loaded entity datasets
  public Tours: MJTourEntity[] = [];
  public Steps: MJTourStepEntity[] = [];
  public StepPaths: MJTourStepPathEntity[] = [];
  public StepTypes: MJTourStepTypeEntity[] = [];
  public Versions: MJTourVersionEntity[] = [];
  public Overrides: MJTourOverrideEntity[] = [];
  public Surfaces: MJTourSurfaceEntity[] = [];
  public SurfaceTours: MJTourSurfaceTourEntity[] = [];
  public LearningPaths: MJLearningPathEntity[] = [];
  public LearningPathTours: MJLearningPathTourEntity[] = [];
  public Runs: MJTourRunEntity[] = [];
  public RunSteps: MJTourRunStepEntity[] = [];
  public Applications: MJApplicationEntity[] = [];
  public Roles: MJRoleEntity[] = [];
  public Users: MJUserEntity[] = [];
  public Components: MJComponentEntity[] = [];

  // Catalog view models
  public CatalogItems: TourCatalogItem[] = [];
  public FilteredCatalogItems: TourCatalogItem[] = [];

  // Builder selection & editors
  public SelectedTour: MJTourEntity | null = null;
  public SelectedTourSteps: MJTourStepEntity[] = [];
  public SelectedTourPaths: MJTourStepPathEntity[] = [];
  public SelectedTourVersions: MJTourVersionEntity[] = [];
  public SelectedTourAssignedSurfaceIDs = new Set<string>();
  public SelectedTourCapabilityWarnings: TourSurfaceCapabilityWarning[] = [];
  public SelectedStep: MJTourStepEntity | null = null;
  public SelectedStepType: MJTourStepTypeEntity | null = null;
  public StepConfigFields: SchemaFieldDescriptor[] = [];
  public GraphData: GraphSvgData | null = null;

  // Step JSON editor fields
  public StepAnchorStrategy: MJTourStepEntity_ITourAnchor['Strategy'] = 'Registered';
  public StepAnchorKey = '';
  public StepAnchorEntity = '';
  public StepAnchorField = '';
  public StepAnchorSection = '';
  public StepAnchorRole = '';
  public StepAnchorName = '';
  public StepAnchorSelector = '';
  public StepAllowSelectorGate = false;

  public StepPrepareApp = '';
  public StepPrepareNavItem = '';
  public StepPrepareUrl = '';

  public StepCompletionMode: 'Manual' | 'Action' | 'Signal' | 'EntityEvent' = 'Manual';
  public StepCompletionSignal = '';
  public StepCompletionEntity = '';
  public StepCompletionEventAction: NonNullable<MJTourStepEntity_ITourCompletionCheck['Action']> = 'Save';

  public StepComponentID = '';
  public StepComponentSpecJson = '';
  public NewLocaleCode = '';
  public StepLocalizations: Array<{ Locale: string; Title: string; Body: string }> = [];

  // New Edge creator
  public NewEdgeFromStepId = '';
  public NewEdgeToStepId = '';
  public NewEdgeLabel = '';
  public NewEdgeCondition = '';
  public NewEdgeIsDefault = false;
  public NewEdgePriority = 0;

  // Preview & Publish controls
  public SimulatedRoleFilter = '';
  public PreviewGuideMode: TourSessionGuideMode = 'Visual';
  public PublishChangeSummary = '';

  // Element Picker & Recorder
  public PickerActive = false;
  public RecorderActive = false;
  public ProposedAnchor: ProposedAnchorResult | null = null;
  private boundCaptureClick = (ev: MouseEvent) => this.handleDocumentPickerClick(ev);
  private boundCaptureKeydown = (ev: KeyboardEvent) => this.handlePickerEscape(ev);

  // Governance tab forms
  public LearningPathViews: LearningPathView[] = [];
  public OverrideViews: OverrideView[] = [];
  public NewPathName = '';
  public NewPathKey = '';
  public NewPathDescription = '';
  public AddMemberPathId = '';
  public AddMemberTourId = '';
  public AddMemberRequired = true;

  public NewOverrideTourId = '';
  public NewOverrideScope: MJTourOverrideEntity['Scope'] = 'Global';
  public NewOverrideRoleId = '';
  public NewOverrideUserId = '';
  public NewOverridePrecedence = 0;
  public NewOverrideIsDisabled = false;
  public NewOverrideStatus: MJTourOverrideEntity['Status'] = 'Active';

  // Analytics tab
  public AnalyticsTourId = '';
  public AnalyticsSummary: TourAnalyticsSummary | null = null;

  // Option lists (strictly derived from entity field unions per Rule #2c)
  public readonly TourStatuses: Array<MJTourEntity['Status']> = ['Draft', 'Active', 'Retired'];
  public readonly TourGuideModes: Array<MJTourEntity['DefaultGuideMode']> = ['Visual', 'Chat', 'Voice', 'User Choice'];
  public readonly StepPlacements: Array<MJTourStepEntity['Placement']> = ['Auto', 'Top', 'Bottom', 'Left', 'Right', 'Center'];
  public readonly StepModes: Array<MJTourStepEntity['Mode']> = ['Show', 'Guide', 'Do'];
  public readonly StepOnMissingOptions: Array<MJTourStepEntity['OnMissing']> = ['Center', 'Skip', 'Stall', 'Agent Recover'];
  public readonly AnchorStrategies: Array<MJTourStepEntity_ITourAnchor['Strategy']> = [
    'Registered',
    'FormField',
    'FormSection',
    'FormRailGroup',
    'FormToolbarAction',
    'NavItem',
    'RailPage',
    'AppSwitcher',
    'GridColumn',
    'Omnibar',
    'ChatComposer',
    'Role',
    'Selector',
  ];
  public readonly OverrideScopes: Array<MJTourOverrideEntity['Scope']> = ['Global', 'Role', 'User'];
  public readonly PreviewModes: TourSessionGuideMode[] = ['Visual', 'Chat', 'Voice'];

  private stepTypeById = new Map<string, MJTourStepTypeEntity>();
  private appById = new Map<string, MJApplicationEntity>();
  private surfaceById = new Map<string, MJTourSurfaceEntity>();
  private tourById = new Map<string, MJTourEntity>();
  private pendingTourKeyFromQuery: string | null = null;

  public get Tabs(): TabConfig[] {
    return [
      { key: 'catalog', label: 'Catalog', icon: 'fa-solid fa-table-cells-large', badge: this.Tours.length || null },
      {
        key: 'builder',
        label: 'Builder',
        icon: 'fa-solid fa-diagram-project',
        badge: this.SelectedTourCapabilityWarnings.length > 0 ? this.SelectedTourCapabilityWarnings.length : null,
        badgeVariant: this.SelectedTourCapabilityWarnings.length > 0 ? 'warning' : 'default',
      },
      { key: 'governance', label: 'Learning Paths & Overrides', icon: 'fa-solid fa-graduation-cap' },
      { key: 'analytics', label: 'Analytics & Holdouts', icon: 'fa-solid fa-chart-line' },
    ];
  }

  public get FilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'status',
        type: 'chips',
        label: 'Status',
        icon: 'fa-solid fa-circle-dot',
        chipOptions: [
          { text: 'All', value: '' },
          { text: 'Active', value: 'Active' },
          { text: 'Draft', value: 'Draft' },
          { text: 'Retired', value: 'Retired' },
        ],
      },
      {
        key: 'guideMode',
        type: 'dropdown',
        label: 'Default Guide Mode',
        icon: 'fa-solid fa-wand-magic-sparkles',
        placeholder: 'Any guide mode',
        options: [
          { text: 'Any guide mode', value: '' },
          ...this.TourGuideModes.map((m) => ({ text: m, value: m })),
        ],
      },
      {
        key: 'applicationId',
        type: 'dropdown',
        label: 'Application',
        icon: 'fa-solid fa-layer-group',
        placeholder: 'All applications',
        filterable: true,
        options: [
          { text: 'All applications', value: '' },
          { text: 'Framework Core (Global)', value: '__core__' },
          ...this.Applications.map((a) => ({ text: a.Name, value: a.ID })),
        ],
      },
      {
        key: 'surfaceId',
        type: 'dropdown',
        label: 'Assigned Surface',
        icon: 'fa-solid fa-window-maximize',
        placeholder: 'All surfaces',
        filterable: true,
        options: [
          { text: 'All surfaces', value: '' },
          ...this.Surfaces.map((s) => ({ text: `${s.Name} (${s.SurfaceType})`, value: s.ID })),
        ],
      },
    ];
  }

  public get ActiveFilterCount(): number {
    let count = 0;
    if (this.stringFilter('status')) count++;
    if (this.stringFilter('guideMode')) count++;
    if (this.stringFilter('applicationId')) count++;
    if (this.stringFilter('surfaceId')) count++;
    return count;
  }

  public get ActiveSchemaFields(): SchemaFieldDescriptor[] {
    return this.StepConfigFields;
  }

  public get SelectedTourLatestVersionNumber(): number {
    const first = this.SelectedTourVersions[0];
    return first?.VersionNumber ?? 0;
  }

  protected initDashboard(): void {
    const params = this.GetQueryParams();
    this.applyQueryParams(params);
  }

  public async ngAfterViewInit(): Promise<void> {
    this.registerAgentClientTools();
    this.publishAgentContext();
  }

  public override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.deactivateCaptureListeners();
  }

  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    this.applyQueryParams(params);
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  private applyQueryParams(params: Record<string, string>): void {
    const tabParam = params[QUERY_PARAM_TAB]?.trim();
    if (tabParam && IsValidTourStudioTab(tabParam)) {
      this.ActiveTab = tabParam;
    }
    const tourParam = params[QUERY_PARAM_TOUR]?.trim();
    if (tourParam) {
      this.pendingTourKeyFromQuery = tourParam;
      const found = this.Tours.find((t) => t.TourKey.toLowerCase() === tourParam.toLowerCase());
      if (found) {
        this.selectTourInternal(found, false);
      }
    }
  }

  private syncQueryParams(): void {
    const next: Record<string, string | null> = {
      [QUERY_PARAM_TAB]: this.ActiveTab,
      [QUERY_PARAM_TOUR]: this.SelectedTour?.TourKey ?? null,
    };
    this.UpdateQueryParams(next);
  }

  public async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Tour Studio';
  }

  public async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-route';
  }

  protected async loadData(): Promise<void> {
    this.IsLoading = true;
    this.BannerMessage = null;
    SafeDetectChanges(this.cdr);

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const results = await rv.RunViews([
        { EntityName: 'MJ: Tours', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Steps', OrderBy: 'Sequence ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Step Paths', OrderBy: 'Sequence ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Step Types', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Versions', OrderBy: 'VersionNumber DESC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Overrides', OrderBy: 'Precedence DESC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Surfaces', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Surface Tours', OrderBy: 'Sequence ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Learning Paths', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Learning Path Tours', OrderBy: 'Sequence ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Runs', OrderBy: '__mj_CreatedAt DESC', MaxRows: 5000, ResultType: 'entity_object' },
        { EntityName: 'MJ: Tour Run Steps', OrderBy: 'EnteredAt DESC', MaxRows: 10000, ResultType: 'entity_object' },
        { EntityName: 'MJ: Applications', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Roles', OrderBy: 'Name ASC', ResultType: 'entity_object' },
        { EntityName: 'MJ: Users', OrderBy: 'Name ASC', MaxRows: 500, ResultType: 'entity_object' },
        { EntityName: 'MJ: Components', OrderBy: 'Name ASC', MaxRows: 500, ResultType: 'entity_object' },
      ]);

      this.Tours = (results[0]?.Results ?? []) as MJTourEntity[];
      this.Steps = (results[1]?.Results ?? []) as MJTourStepEntity[];
      this.StepPaths = (results[2]?.Results ?? []) as MJTourStepPathEntity[];
      this.StepTypes = (results[3]?.Results ?? []) as MJTourStepTypeEntity[];
      this.Versions = (results[4]?.Results ?? []) as MJTourVersionEntity[];
      this.Overrides = (results[5]?.Results ?? []) as MJTourOverrideEntity[];
      this.Surfaces = (results[6]?.Results ?? []) as MJTourSurfaceEntity[];
      this.SurfaceTours = (results[7]?.Results ?? []) as MJTourSurfaceTourEntity[];
      this.LearningPaths = (results[8]?.Results ?? []) as MJLearningPathEntity[];
      this.LearningPathTours = (results[9]?.Results ?? []) as MJLearningPathTourEntity[];
      this.Runs = (results[10]?.Results ?? []) as MJTourRunEntity[];
      this.RunSteps = (results[11]?.Results ?? []) as MJTourRunStepEntity[];
      this.Applications = (results[12]?.Results ?? []) as MJApplicationEntity[];
      this.Roles = (results[13]?.Results ?? []) as MJRoleEntity[];
      this.Users = (results[14]?.Results ?? []) as MJUserEntity[];
      this.Components = (results[15]?.Results ?? []) as MJComponentEntity[];

      this.rebuildIndexes();
      this.rebuildCatalog();
      this.applyCatalogFilters();
      this.rebuildGovernanceViews();

      // Re-bind selected tour cleanly against refreshed entities
      const targetKey = this.pendingTourKeyFromQuery ?? this.SelectedTour?.TourKey ?? null;
      const targetTour =
        (targetKey ? this.Tours.find((t) => t.TourKey.toLowerCase() === targetKey.toLowerCase()) : undefined) ??
        this.Tours[0] ??
        null;
      this.pendingTourKeyFromQuery = null;

      if (targetTour) {
        this.selectTourInternal(targetTour, false);
      } else {
        this.SelectedTour = null;
        this.SelectedTourSteps = [];
        this.SelectedTourPaths = [];
        this.SelectedStep = null;
        this.GraphData = null;
      }

      if (!this.AnalyticsTourId && targetTour) {
        this.AnalyticsTourId = targetTour.ID;
      }
      this.recomputeAnalytics();
    } catch (err) {
      this.showBanner(`Failed to load Tour Studio data: ${errorMessage(err)}`, 'error');
    } finally {
      this.IsLoading = false;
      this.publishAgentContext();
      SafeDetectChanges(this.cdr);
    }
  }

  public override async Refresh(): Promise<void> {
    await this.loadData();
  }

  // =========================================================================
  // TAB / SEARCH / FILTER NAVIGATION
  // =========================================================================

  public OnTabChange(tabKey: string): void {
    if (!IsValidTourStudioTab(tabKey)) {
      return;
    }
    this.ActiveTab = tabKey;
    if (tabKey === 'analytics' && !this.AnalyticsSummary && this.Tours.length > 0) {
      this.AnalyticsTourId = this.AnalyticsTourId || this.SelectedTour?.ID || this.Tours[0].ID;
      this.recomputeAnalytics();
    }
    this.syncQueryParams();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public OnSearchChange(query: string): void {
    this.SearchQuery = query;
    this.applyCatalogFilters();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public OnFilterValuesChange(values: Record<string, unknown>): void {
    this.FilterValues = values;
    this.applyCatalogFilters();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public ResetFilters(): void {
    this.FilterValues = {};
    this.SearchQuery = '';
    this.applyCatalogFilters();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  // =========================================================================
  // CATALOG & BUILDER SELECTION
  // =========================================================================

  public OpenTourInBuilder(tour: MJTourEntity): void {
    this.selectTourInternal(tour, true);
    this.ActiveTab = 'builder';
    this.syncQueryParams();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public OnTourSelectById(tourId: string): void {
    const found = this.tourById.get(tourId.toLowerCase());
    if (found) {
      this.OpenTourInBuilder(found);
    }
  }

  public OpenTourAnalytics(tour: MJTourEntity): void {
    this.AnalyticsTourId = tour.ID;
    this.recomputeAnalytics();
    this.ActiveTab = 'analytics';
    this.selectTourInternal(tour, true);
    this.syncQueryParams();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public SelectStep(step: MJTourStepEntity): void {
    this.SelectedStep = step;
    this.SelectedStepType = this.stepTypeById.get(step.StepTypeID.toLowerCase()) ?? null;
    this.StepConfigFields = ParseConfigSchemaFields(this.SelectedStepType?.ConfigSchema);
    this.hydrateStepEditorFields(step);
    this.rebuildGraphData();
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public SelectStepByKey(stepKey: string): void {
    const step = this.SelectedTourSteps.find((s) => s.StepKey === stepKey);
    if (step) {
      this.SelectStep(step);
    }
  }

  private selectTourInternal(tour: MJTourEntity, updateUrl: boolean): void {
    this.SelectedTour = tour;
    this.SelectedTourSteps = this.Steps
      .filter((s) => UUIDsEqual(s.TourID, tour.ID))
      .sort((a, b) => a.Sequence - b.Sequence);
    this.SelectedTourPaths = this.StepPaths
      .filter((p) => UUIDsEqual(p.TourID, tour.ID))
      .sort((a, b) => a.Sequence - b.Sequence);
    this.SelectedTourVersions = this.Versions
      .filter((v) => UUIDsEqual(v.TourID, tour.ID))
      .sort((a, b) => b.VersionNumber - a.VersionNumber);
    this.SelectedTourAssignedSurfaceIDs = new Set(
      this.SurfaceTours
        .filter((st) => UUIDsEqual(st.TourID, tour.ID))
        .map((st) => st.SurfaceID.toLowerCase()),
    );

    const prevStepId = this.SelectedStep?.ID;
    const nextStep =
      (prevStepId ? this.SelectedTourSteps.find((s) => UUIDsEqual(s.ID, prevStepId)) : undefined) ??
      this.SelectedTourSteps[0] ??
      null;
    this.SelectedStep = nextStep;
    this.SelectedStepType = nextStep ? (this.stepTypeById.get(nextStep.StepTypeID.toLowerCase()) ?? null) : null;
    this.StepConfigFields = ParseConfigSchemaFields(this.SelectedStepType?.ConfigSchema);
    if (nextStep) {
      this.hydrateStepEditorFields(nextStep);
    }
    this.NewEdgeFromStepId = this.SelectedTourSteps[0]?.ID ?? '';
    this.NewEdgeToStepId = this.SelectedTourSteps[1]?.ID ?? this.SelectedTourSteps[0]?.ID ?? '';
    this.recomputeSelectedTourWarningsAndGraph();
    if (updateUrl) {
      this.syncQueryParams();
    }
  }

  private rebuildIndexes(): void {
    this.stepTypeById = new Map(this.StepTypes.map((st) => [st.ID.toLowerCase(), st]));
    this.appById = new Map(this.Applications.map((a) => [a.ID.toLowerCase(), a]));
    this.surfaceById = new Map(this.Surfaces.map((s) => [s.ID.toLowerCase(), s]));
    this.tourById = new Map(this.Tours.map((t) => [t.ID.toLowerCase(), t]));
  }

  private rebuildCatalog(): void {
    const runStepsByRunId = new Map<string, MJTourRunStepEntity[]>();
    for (const rs of this.RunSteps) {
      const key = rs.TourRunID.toLowerCase();
      const list = runStepsByRunId.get(key) ?? [];
      list.push(rs);
      runStepsByRunId.set(key, list);
    }

    const stepsByTourId = GroupByUUID(this.Steps, (s) => s.TourID);
    const versionsByTourId = GroupByUUID(this.Versions, (v) => v.TourID);
    const surfaceToursByTourId = GroupByUUID(this.SurfaceTours, (st) => st.TourID);
    const runsByTourId = GroupByUUID(this.Runs, (r) => r.TourID);

    this.CatalogItems = this.Tours.map((tour) => {
      const tourSteps = stepsByTourId.Get(tour.ID) ?? [];
      const tourVersions = versionsByTourId.Get(tour.ID) ?? [];
      const latestVersionNumber = tourVersions.reduce((max, v) => Math.max(max, v.VersionNumber), 0);
      const assignedSurfaces = (surfaceToursByTourId.Get(tour.ID) ?? [])
        .map((st) => this.surfaceById.get(st.SurfaceID.toLowerCase()))
        .filter((s): s is MJTourSurfaceEntity => s != null);
      const warnings = ComputeSurfaceCapabilityWarnings(tourSteps, this.stepTypeById, assignedSurfaces);

      const tourRuns = runsByTourId.Get(tour.ID) ?? [];
      const treatedRuns = tourRuns.filter((r) => !r.IsHoldout);
      const holdoutRuns = tourRuns.filter((r) => r.IsHoldout);
      const completed = treatedRuns.filter((r) => r.Status === 'Completed');
      const goalMet = treatedRuns.filter((r) => r.GoalMetAt != null);
      const holdoutGoalMet = holdoutRuns.filter((r) => r.GoalMetAt != null);

      const completionRatePct = treatedRuns.length > 0 ? Math.round((completed.length / treatedRuns.length) * 100) : null;
      const goalRatePct = treatedRuns.length > 0 ? Math.round((goalMet.length / treatedRuns.length) * 100) : null;
      const holdoutGoalRatePct = holdoutRuns.length > 0 ? Math.round((holdoutGoalMet.length / holdoutRuns.length) * 100) : null;
      const goalLiftPct =
        goalRatePct != null && holdoutGoalRatePct != null ? goalRatePct - holdoutGoalRatePct : null;

      let anchorAttempts = 0;
      let anchorFailures = 0;
      for (const r of treatedRuns) {
        const rsList = runStepsByRunId.get(r.ID.toLowerCase()) ?? [];
        for (const rs of rsList) {
          if (rs.AnchorResolution && rs.AnchorResolution !== 'None') {
            anchorAttempts++;
            if (rs.AnchorResolution === 'Failed') {
              anchorFailures++;
            }
          }
        }
      }
      const anchorHealthPct = anchorAttempts > 0 ? Math.round(((anchorAttempts - anchorFailures) / anchorAttempts) * 100) : null;

      return {
        Tour: tour,
        ApplicationName: tour.ApplicationID ? (this.appById.get(tour.ApplicationID.toLowerCase())?.Name ?? tour.Application) : null,
        StepCount: tourSteps.length,
        LatestVersionNumber: latestVersionNumber,
        AssignedSurfaces: assignedSurfaces,
        TotalRuns: treatedRuns.length,
        CompletedRuns: completed.length,
        CompletionRatePct: completionRatePct,
        GoalRatePct: goalRatePct,
        HoldoutGoalRatePct: holdoutGoalRatePct,
        GoalLiftPct: goalLiftPct,
        AnchorHealthPct: anchorHealthPct,
        CapabilityWarningCount: warnings.length,
      };
    });
  }

  private applyCatalogFilters(): void {
    const q = this.SearchQuery.trim().toLowerCase();
    const status = this.stringFilter('status');
    const guideMode = this.stringFilter('guideMode');
    const applicationId = this.stringFilter('applicationId');
    const surfaceId = this.stringFilter('surfaceId');
    const wantedSurface = surfaceId ? new UUIDSet([surfaceId]) : null;

    this.FilteredCatalogItems = this.CatalogItems.filter((item) => {
      if (q) {
        const hay = `${item.Tour.Name} ${item.Tour.TourKey} ${item.Tour.Description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status && item.Tour.Status !== status) return false;
      if (guideMode && item.Tour.DefaultGuideMode !== guideMode) return false;
      if (applicationId === '__core__' && item.Tour.ApplicationID != null) return false;
      if (applicationId && applicationId !== '__core__' && !UUIDsEqual(item.Tour.ApplicationID, applicationId)) return false;
      if (wantedSurface && !item.AssignedSurfaces.some((s) => wantedSurface.Has(s.ID))) return false;
      return true;
    });
  }

  private stringFilter(key: string): string {
    const v = this.FilterValues[key];
    return typeof v === 'string' ? v.trim() : '';
  }

  // =========================================================================
  // TOUR CRUD, SURFACE ASSIGNMENT, STEP & PATH AUTHORING
  // =========================================================================

  public async CreateNewTour(): Promise<void> {
    if (this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const user = this.ProviderToUse.CurrentUser;
      const tour = await this.ProviderToUse.GetEntityObject<MJTourEntity>('MJ: Tours', user);
      const stamp = Date.now().toString(36);
      tour.Name = 'Untitled Guided Tour';
      tour.TourKey = `custom.tour-${stamp}`;
      tour.Description = 'Describe what this tour teaches.';
      tour.Status = 'Draft';
      tour.DefaultGuideMode = 'Visual';
      tour.RunInAuthenticatedHosts = true;
      tour.AllowAgentActions = false;
      tour.Priority = 100;
      const saved = await tour.Save();
      if (!saved) {
        this.showBanner(`Could not create tour: ${tour.LatestResult?.Message ?? 'Unknown error'}`, 'error');
        return;
      }
      this.Tours = [...this.Tours, tour];
      this.rebuildIndexes();
      this.rebuildCatalog();
      this.applyCatalogFilters();
      this.OpenTourInBuilder(tour);
      this.showBanner(`Created draft tour "${tour.Name}" (${tour.TourKey}).`, 'info');
    } catch (err) {
      this.showBanner(`Error creating tour: ${errorMessage(err)}`, 'error');
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async SaveSelectedTour(): Promise<void> {
    if (!this.SelectedTour || this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const saved = await this.SelectedTour.Save();
      if (!saved) {
        this.showBanner(`Failed to save tour: ${this.SelectedTour.LatestResult?.Message ?? 'Validation error'}`, 'error');
        return;
      }
      this.rebuildCatalog();
      this.applyCatalogFilters();
      this.recomputeSelectedTourWarningsAndGraph();
      this.publishAgentContext();
      this.showBanner(`Saved tour "${this.SelectedTour.Name}".`, 'info');
    } catch (err) {
      this.showBanner(`Failed to save tour: ${errorMessage(err)}`, 'error');
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async ToggleTourSurfaceAssignment(surface: MJTourSurfaceEntity): Promise<void> {
    if (!this.SelectedTour || this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const existing = this.SurfaceTours.find(
        (st) => UUIDsEqual(st.TourID, this.SelectedTour?.ID) && UUIDsEqual(st.SurfaceID, surface.ID),
      );
      if (existing) {
        const deleted = await existing.Delete();
        if (!deleted) {
          this.showBanner(`Failed to unassign surface: ${existing.LatestResult?.Message ?? 'Unknown error'}`, 'error');
          return;
        }
        this.SurfaceTours = this.SurfaceTours.filter((st) => !UUIDsEqual(st.ID, existing.ID));
      } else {
        const link = await this.ProviderToUse.GetEntityObject<MJTourSurfaceTourEntity>(
          'MJ: Tour Surface Tours',
          this.ProviderToUse.CurrentUser,
        );
        link.TourID = this.SelectedTour.ID;
        link.SurfaceID = surface.ID;
        link.Sequence = this.SurfaceTours.filter((st) => UUIDsEqual(st.SurfaceID, surface.ID)).length + 1;
        link.IsDefault = false;
        const saved = await link.Save();
        if (!saved) {
          this.showBanner(`Failed to assign surface: ${link.LatestResult?.Message ?? 'Unknown error'}`, 'error');
          return;
        }
        this.SurfaceTours = [...this.SurfaceTours, link];
      }
      this.SelectedTourAssignedSurfaceIDs = new Set(
        this.SurfaceTours
          .filter((st) => UUIDsEqual(st.TourID, this.SelectedTour?.ID))
          .map((st) => st.SurfaceID.toLowerCase()),
      );
      this.rebuildCatalog();
      this.applyCatalogFilters();
      this.recomputeSelectedTourWarningsAndGraph();
      this.publishAgentContext();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async AddNewStep(anchorProposal?: ProposedAnchorResult): Promise<void> {
    if (!this.SelectedTour || this.IsSaving) return;
    const defaultType =
      this.StepTypes.find((st) => st.Name === 'Spotlight') ??
      this.StepTypes[0];
    if (!defaultType) {
      this.showBanner('No Tour Step Types metadata found.', 'error');
      return;
    }
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const step = await this.ProviderToUse.GetEntityObject<MJTourStepEntity>(
        'MJ: Tour Steps',
        this.ProviderToUse.CurrentUser,
      );
      const nextSeq =
        this.SelectedTourSteps.reduce((max, s) => Math.max(max, s.Sequence), 0) + 1;
      step.TourID = this.SelectedTour.ID;
      step.StepTypeID = defaultType.ID;
      step.Sequence = nextSeq;
      step.StepKey = `step-${nextSeq}-${Date.now().toString(36).slice(-4)}`;
      step.Title = anchorProposal?.TextPreview
        ? `Explore ${anchorProposal.TextPreview.slice(0, 40)}`
        : `Step ${nextSeq}`;
      step.Body = 'Explain this step to the user.';
      step.Placement = 'Auto';
      step.Mode = 'Show';
      step.OnMissing = 'Center';
      step.IsOptional = false;

      if (anchorProposal) {
        step.AnchorObject = {
          Strategy: anchorProposal.Strategy === 'Semantic' && anchorProposal.Field ? 'FormField' : anchorProposal.Strategy,
          Key: anchorProposal.Key,
          Entity: anchorProposal.Entity,
          Field: anchorProposal.Field,
          Role: anchorProposal.Role,
          Name: anchorProposal.Name,
          Selector: anchorProposal.Selector,
        };
        if (anchorProposal.Strategy === 'Selector') {
          step.ConfigurationObject = { tourAnchorsAllowSelector: true };
        }
      }

      const saved = await step.Save();
      if (!saved) {
        this.showBanner(`Failed to create step: ${step.LatestResult?.Message ?? 'Validation error'}`, 'error');
        return;
      }
      this.Steps = [...this.Steps, step];
      this.selectTourInternal(this.SelectedTour, false);
      this.SelectStep(step);
      this.rebuildCatalog();
      this.applyCatalogFilters();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async SaveSelectedStep(): Promise<void> {
    if (!this.SelectedStep || !this.SelectedTour || this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      // Write structured JSON accessors before saving
      const anchor: MJTourStepEntity_ITourAnchor = {
        Strategy: this.StepAnchorStrategy,
        Key: this.StepAnchorKey.trim() || undefined,
        Entity: this.StepAnchorEntity.trim() || undefined,
        Field: this.StepAnchorField.trim() || undefined,
        Section: this.StepAnchorSection.trim() || undefined,
        Role: this.StepAnchorRole.trim() || undefined,
        Name: this.StepAnchorName.trim() || undefined,
        Selector: this.StepAnchorSelector.trim() || undefined,
      };
      this.SelectedStep.AnchorObject = anchor;

      const prepare: MJTourStepEntity_ITourStepPrepare = {};
      if (this.StepPrepareApp.trim()) prepare.Application = this.StepPrepareApp.trim();
      if (this.StepPrepareNavItem.trim()) prepare.NavItem = this.StepPrepareNavItem.trim();
      if (this.StepPrepareUrl.trim()) prepare.Url = this.StepPrepareUrl.trim();
      this.SelectedStep.PrepareObject = Object.keys(prepare).length > 0 ? prepare : null;

      const checks: MJTourStepEntity_ITourCompletionCheck[] = [];
      if (this.StepCompletionMode === 'Signal' && this.StepCompletionSignal.trim()) {
        checks.push({ Type: 'Signal', Signal: this.StepCompletionSignal.trim() });
      } else if (this.StepCompletionMode === 'EntityEvent' && this.StepCompletionEntity.trim()) {
        checks.push({
          Type: 'EntityEvent',
          Entity: this.StepCompletionEntity.trim(),
          Action: this.StepCompletionEventAction,
        });
      } else if (this.StepCompletionMode === 'Action') {
        checks.push({ Type: 'AnchorInteraction', Event: 'click' });
      }
      const completion: MJTourStepEntity_ITourCompletion | null =
        checks.length > 0 ? { Mode: 'All', Checks: checks } : null;
      this.SelectedStep.CompletionObject = completion;

      const cfg: MJTourStepEntity_ITourStepConfiguration = {
        ...(this.SelectedStep.ConfigurationObject ?? {}),
      };
      if (this.StepAllowSelectorGate) {
        cfg.tourAnchorsAllowSelector = true;
      } else {
        delete cfg.tourAnchorsAllowSelector;
      }
      if (this.StepComponentID.trim()) {
        cfg.componentId = this.StepComponentID.trim();
      } else {
        delete cfg.componentId;
      }
      if (this.StepComponentSpecJson.trim()) {
        try {
          cfg.componentSpec = JSON.parse(this.StepComponentSpecJson) as Record<string, unknown>;
        } catch {
          this.showBanner('ComponentSpec JSON is invalid. Fix syntax before saving.', 'error');
          this.IsSaving = false;
          SafeDetectChanges(this.cdr);
          return;
        }
      } else {
        delete cfg.componentSpec;
      }
      if (this.StepLocalizations.length > 0) {
        const locMap: Record<string, MJTourStepEntity_ITourStepLocalization> = {};
        for (const loc of this.StepLocalizations) {
          if (loc.Locale.trim()) {
            locMap[loc.Locale.trim()] = {
              title: loc.Title || undefined,
              body: loc.Body || undefined,
            };
          }
        }
        cfg.localizations = locMap;
      } else {
        delete cfg.localizations;
      }
      this.SelectedStep.ConfigurationObject = cfg;

      const saved = await this.SelectedStep.Save();
      if (!saved) {
        this.showBanner(`Failed to save step: ${this.SelectedStep.LatestResult?.Message ?? 'Validation error'}`, 'error');
        return;
      }
      this.recomputeSelectedTourWarningsAndGraph();
      this.publishAgentContext();
      this.showBanner(`Saved step "${this.SelectedStep.Title}".`, 'info');
    } catch (err) {
      this.showBanner(`Failed to save step: ${errorMessage(err)}`, 'error');
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async DeleteSelectedStep(): Promise<void> {
    if (!this.SelectedStep || !this.SelectedTour || this.IsSaving) return;
    const step = this.SelectedStep;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      // Remove dependent paths first
      const relatedPaths = this.SelectedTourPaths.filter(
        (p) => UUIDsEqual(p.FromStepID, step.ID) || UUIDsEqual(p.ToStepID, step.ID),
      );
      for (const path of relatedPaths) {
        await path.Delete();
      }
      const deleted = await step.Delete();
      if (!deleted) {
        this.showBanner(`Failed to delete step: ${step.LatestResult?.Message ?? 'Unknown error'}`, 'error');
        return;
      }
      this.Steps = this.Steps.filter((s) => !UUIDsEqual(s.ID, step.ID));
      this.StepPaths = this.StepPaths.filter(
        (p) => !UUIDsEqual(p.FromStepID, step.ID) && !UUIDsEqual(p.ToStepID, step.ID),
      );
      this.selectTourInternal(this.SelectedTour, false);
      this.rebuildCatalog();
      this.applyCatalogFilters();
      this.publishAgentContext();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public OnStepTypeChange(stepTypeId: string): void {
    if (!this.SelectedStep) return;
    this.SelectedStep.StepTypeID = stepTypeId;
    this.SelectedStepType = this.stepTypeById.get(stepTypeId.toLowerCase()) ?? null;
    this.StepConfigFields = ParseConfigSchemaFields(this.SelectedStepType?.ConfigSchema);
    this.recomputeSelectedTourWarningsAndGraph();
    this.cdr.markForCheck();
  }

  public GetStepConfigFieldValue(field: SchemaFieldDescriptor): string {
    const cfg = (this.SelectedStep?.ConfigurationObject ?? {}) as Record<string, unknown>;
    const val = cfg[field.Key];
    if (val === undefined || val === null) {
      return '';
    }
    if (field.Type === 'json') {
      return typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    }
    return String(val);
  }

  public GetStepConfigBooleanValue(field: SchemaFieldDescriptor): boolean {
    const cfg = (this.SelectedStep?.ConfigurationObject ?? {}) as Record<string, unknown>;
    const val = cfg[field.Key];
    return typeof val === 'boolean' ? val : Boolean(field.DefaultValue);
  }

  public SetStepConfigFieldValue(field: SchemaFieldDescriptor, raw: string | boolean): void {
    if (!this.SelectedStep) return;
    const cfg = { ...(this.SelectedStep.ConfigurationObject ?? {}) } as Record<string, unknown>;
    if (field.Type === 'boolean') {
      cfg[field.Key] = Boolean(raw);
    } else if (field.Type === 'number' || field.Type === 'integer') {
      const str = String(raw).trim();
      if (!str) {
        delete cfg[field.Key];
      } else {
        const parsed = field.Type === 'integer' ? parseInt(str, 10) : Number(str);
        if (Number.isFinite(parsed)) {
          cfg[field.Key] = parsed;
        }
      }
    } else if (field.Type === 'json') {
      const str = String(raw).trim();
      if (!str) {
        delete cfg[field.Key];
      } else {
        try {
          cfg[field.Key] = JSON.parse(str) as unknown;
        } catch {
          return;
        }
      }
    } else {
      const str = String(raw);
      if (str.trim().length === 0) {
        delete cfg[field.Key];
      } else {
        cfg[field.Key] = str;
      }
    }
    this.SelectedStep.ConfigurationObject = cfg as MJTourStepEntity_ITourStepConfiguration;
    this.cdr.markForCheck();
  }

  public AddStepLocale(): void {
    const code = this.NewLocaleCode.trim();
    if (!code) return;
    if (this.StepLocalizations.some((l) => l.Locale.toLowerCase() === code.toLowerCase())) {
      return;
    }
    this.StepLocalizations = [
      ...this.StepLocalizations,
      { Locale: code, Title: this.SelectedStep?.Title ?? '', Body: this.SelectedStep?.Body ?? '' },
    ];
    this.NewLocaleCode = '';
    this.cdr.markForCheck();
  }

  public RemoveStepLocale(locale: string): void {
    this.StepLocalizations = this.StepLocalizations.filter((l) => l.Locale !== locale);
    this.cdr.markForCheck();
  }

  public async AddStepPathEdge(): Promise<void> {
    if (!this.SelectedTour || !this.NewEdgeFromStepId || !this.NewEdgeToStepId || this.IsSaving) {
      return;
    }
    if (UUIDsEqual(this.NewEdgeFromStepId, this.NewEdgeToStepId)) {
      this.showBanner('Cannot connect a step to itself.', 'warning');
      return;
    }
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const path = await this.ProviderToUse.GetEntityObject<MJTourStepPathEntity>(
        'MJ: Tour Step Paths',
        this.ProviderToUse.CurrentUser,
      );
      path.TourID = this.SelectedTour.ID;
      path.FromStepID = this.NewEdgeFromStepId;
      path.ToStepID = this.NewEdgeToStepId;
      path.Label = this.NewEdgeLabel.trim() || null;
      path.Condition = this.NewEdgeCondition.trim() || null;
      path.IsDefault = this.NewEdgeIsDefault;
      path.Priority = this.NewEdgePriority;
      path.Sequence = this.SelectedTourPaths.length + 1;
      const saved = await path.Save();
      if (!saved) {
        this.showBanner(`Could not save pathway edge: ${path.LatestResult?.Message ?? 'Validation error'}`, 'error');
        return;
      }
      this.StepPaths = [...this.StepPaths, path];
      this.NewEdgeLabel = '';
      this.NewEdgeCondition = '';
      this.NewEdgeIsDefault = false;
      this.selectTourInternal(this.SelectedTour, false);
      this.publishAgentContext();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async DeleteStepPathEdge(path: MJTourStepPathEntity): Promise<void> {
    if (!this.SelectedTour || this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const deleted = await path.Delete();
      if (!deleted) {
        this.showBanner(`Failed to delete pathway edge: ${path.LatestResult?.Message ?? 'Unknown error'}`, 'error');
        return;
      }
      this.StepPaths = this.StepPaths.filter((p) => !UUIDsEqual(p.ID, path.ID));
      this.selectTourInternal(this.SelectedTour, false);
      this.publishAgentContext();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  // =========================================================================
  // PREVIEW (CURRENT USER OR SIMULATED ROLE) & PUBLISH VERSION
  // =========================================================================

  public PreviewSelectedTour(): void {
    if (!this.SelectedTour) return;
    const def = BuildTourDefinitionFromEntities(
      this.SelectedTour,
      this.SelectedTourSteps,
      this.SelectedTourPaths,
      this.stepTypeById,
      this.SelectedTourVersions,
    );
    const simulatedRoles = this.SimulatedRoleFilter.trim() ? [this.SimulatedRoleFilter.trim()] : undefined;

    if (this.tourHost?.StartTour) {
      void this.tourHost.StartTour(def.TourKey, {
        Mode: this.PreviewGuideMode,
        LaunchSource: 'Launcher',
        TourOverride: def,
        SimulatedRoles: simulatedRoles,
      });
      return;
    }

    TourSignals.Instance.Emit('core.tour.launchRequest', {
      tourKey: def.TourKey,
      mode: this.PreviewGuideMode,
      launchSource: 'Launcher',
      tourOverride: def,
      simulatedRoles,
    });
  }

  public async PublishSelectedTour(): Promise<void> {
    if (!this.SelectedTour || this.IsPublishing) return;
    if (this.GraphData && !this.GraphData.Valid) {
      this.showBanner('Fix pathway graph errors (cycles or unknown step refs) before publishing.', 'error');
      return;
    }

    this.IsPublishing = true;
    this.cdr.markForCheck();
    try {
      const engine = TourEngine.GetProviderInstance<TourEngine>(this.ProviderToUse, TourEngine) as TourEngine;
      const output = await engine.PublishTour(
        this.SelectedTour.ID,
        this.PublishChangeSummary.trim() || undefined,
        true,
      );
      if (!output.Success) {
        this.showBanner(`Publish failed: ${output.ErrorMessage ?? 'Unknown error'}`, 'error');
        return;
      }
      this.PublishChangeSummary = '';
      this.showBanner(
        output.UnchangedSnapshot
          ? `Tour is unchanged since version v${output.VersionNumber ?? this.SelectedTourLatestVersionNumber}.`
          : `Published version v${output.VersionNumber ?? '?'} and activated "${this.SelectedTour.Name}".`,
        'info',
      );
      await engine.Config(true, this.ProviderToUse.CurrentUser, this.ProviderToUse).catch(() => undefined);
      await this.loadData();
    } catch (err) {
      this.showBanner(`Publish failed: ${errorMessage(err)}`, 'error');
    } finally {
      this.IsPublishing = false;
      SafeDetectChanges(this.cdr);
    }
  }

  // =========================================================================
  // PICK ELEMENT INSPECTOR & RECORDER
  // =========================================================================

  public ToggleElementPicker(): void {
    this.PickerActive = !this.PickerActive;
    if (!this.PickerActive) {
      this.RecorderActive = false;
    }
    this.syncCaptureListeners();
    this.cdr.markForCheck();
  }

  public ToggleStepRecorder(): void {
    this.RecorderActive = !this.RecorderActive;
    this.PickerActive = this.RecorderActive;
    this.syncCaptureListeners();
    this.cdr.markForCheck();
  }

  public ApplyProposedAnchorToSelectedStep(): void {
    if (!this.ProposedAnchor) return;
    const p = this.ProposedAnchor;
    this.StepAnchorStrategy = p.Strategy === 'Semantic' && p.Field ? 'FormField' : p.Strategy;
    this.StepAnchorKey = p.Key ?? '';
    this.StepAnchorEntity = p.Entity ?? '';
    this.StepAnchorField = p.Field ?? '';
    this.StepAnchorRole = p.Role ?? '';
    this.StepAnchorName = p.Name ?? '';
    this.StepAnchorSelector = p.Selector ?? '';
    if (p.IsFragileSelector) {
      this.StepAllowSelectorGate = true;
    }
    this.ProposedAnchor = null;
    this.cdr.markForCheck();
  }

  private syncCaptureListeners(): void {
    if (this.PickerActive) {
      document.addEventListener('click', this.boundCaptureClick, true);
      document.addEventListener('keydown', this.boundCaptureKeydown, true);
    } else {
      this.deactivateCaptureListeners();
    }
  }

  private deactivateCaptureListeners(): void {
    document.removeEventListener('click', this.boundCaptureClick, true);
    document.removeEventListener('keydown', this.boundCaptureKeydown, true);
  }

  private handlePickerEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.PickerActive) {
      event.preventDefault();
      event.stopPropagation();
      this.PickerActive = false;
      this.RecorderActive = false;
      this.deactivateCaptureListeners();
      this.cdr.markForCheck();
    }
  }

  private handleDocumentPickerClick(event: MouseEvent): void {
    if (!this.PickerActive) return;
    const rawTarget = event.target;
    if (!(rawTarget instanceof HTMLElement)) return;

    // Allow clicking inside Tour Studio's own floating picker cancel bar
    if (rawTarget.closest('.ts-picker-floating')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const proposal = this.proposeAnchorForElement(rawTarget);
    this.ProposedAnchor = proposal;

    if (this.RecorderActive && this.SelectedTour) {
      void this.AddNewStep(proposal);
    } else {
      this.PickerActive = false;
      this.deactivateCaptureListeners();
    }
    this.cdr.markForCheck();
  }

  private proposeAnchorForElement(el: HTMLElement): ProposedAnchorResult {
    const textPreview = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const tagName = el.tagName.toLowerCase();

    const anchored = el.closest('[data-mj-tour-anchor]') as HTMLElement | null;
    if (anchored) {
      const key = anchored.getAttribute('data-mj-tour-anchor') ?? '';
      return {
        Strategy: 'Registered',
        Key: key,
        TagName: anchored.tagName.toLowerCase(),
        TextPreview: textPreview || key,
        IsFragileSelector: false,
      };
    }

    const semanticField = el.closest('[data-mj-field]') as HTMLElement | null;
    if (semanticField) {
      const field = semanticField.getAttribute('data-mj-field') ?? '';
      const entityEl = semanticField.closest('[data-mj-entity]') as HTMLElement | null;
      return {
        Strategy: 'Semantic',
        Entity: entityEl?.getAttribute('data-mj-entity') ?? undefined,
        Field: field,
        TagName: tagName,
        TextPreview: textPreview || field,
        IsFragileSelector: false,
      };
    }

    const roleEl = el.closest('[role], button, a, input, select, textarea') as HTMLElement | null;
    const ariaName = roleEl?.getAttribute('aria-label') || roleEl?.getAttribute('title') || textPreview;
    const role = roleEl?.getAttribute('role') || (roleEl?.tagName === 'BUTTON' ? 'button' : roleEl?.tagName === 'A' ? 'link' : '');
    if (role && ariaName) {
      return {
        Strategy: 'Role',
        Role: role,
        Name: ariaName,
        TagName: roleEl?.tagName.toLowerCase() ?? tagName,
        TextPreview: ariaName,
        IsFragileSelector: false,
      };
    }

    const selector = buildFallbackSelector(el);
    return {
      Strategy: 'Selector',
      Selector: selector,
      TagName: tagName,
      TextPreview: textPreview || selector,
      IsFragileSelector: true,
    };
  }

  // =========================================================================
  // GOVERNANCE: LEARNING PATHS & OVERRIDES
  // =========================================================================

  public async CreateLearningPath(): Promise<void> {
    if (!this.NewPathName.trim() || !this.NewPathKey.trim() || this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const lp = await this.ProviderToUse.GetEntityObject<MJLearningPathEntity>(
        'MJ: Learning Paths',
        this.ProviderToUse.CurrentUser,
      );
      lp.Name = this.NewPathName.trim();
      lp.PathKey = this.NewPathKey.trim();
      lp.Description = this.NewPathDescription.trim() || null;
      lp.Status = 'Active';
      const saved = await lp.Save();
      if (!saved) {
        this.showBanner(`Failed to create learning path: ${lp.LatestResult?.Message ?? 'Validation error'}`, 'error');
        return;
      }
      this.LearningPaths = [...this.LearningPaths, lp];
      this.NewPathName = '';
      this.NewPathKey = '';
      this.NewPathDescription = '';
      this.rebuildGovernanceViews();
      this.publishAgentContext();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async AddTourToLearningPath(): Promise<void> {
    if (!this.AddMemberPathId || !this.AddMemberTourId || this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const existing = this.LearningPathTours.filter((m) => UUIDsEqual(m.LearningPathID, this.AddMemberPathId));
      const member = await this.ProviderToUse.GetEntityObject<MJLearningPathTourEntity>(
        'MJ: Learning Path Tours',
        this.ProviderToUse.CurrentUser,
      );
      member.LearningPathID = this.AddMemberPathId;
      member.TourID = this.AddMemberTourId;
      member.Sequence = existing.reduce((max, m) => Math.max(max, m.Sequence), 0) + 1;
      member.IsRequired = this.AddMemberRequired;
      const saved = await member.Save();
      if (!saved) {
        this.showBanner(`Failed to add tour to learning path: ${member.LatestResult?.Message ?? 'Error'}`, 'error');
        return;
      }
      this.LearningPathTours = [...this.LearningPathTours, member];
      this.rebuildGovernanceViews();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async RemoveLearningPathMember(member: MJLearningPathTourEntity): Promise<void> {
    if (this.IsSaving) return;
    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      if (await member.Delete()) {
        this.LearningPathTours = this.LearningPathTours.filter((m) => !UUIDsEqual(m.ID, member.ID));
        this.rebuildGovernanceViews();
      }
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async ToggleLearningPathMemberRequired(member: MJLearningPathTourEntity): Promise<void> {
    if (this.IsSaving) return;
    member.IsRequired = !member.IsRequired;
    if (!(await member.Save())) {
      member.IsRequired = !member.IsRequired;
      this.showBanner(`Failed to update requirement: ${member.LatestResult?.Message ?? 'Error'}`, 'error');
    }
    this.cdr.markForCheck();
  }

  public async SaveNewOverride(): Promise<void> {
    if (!this.NewOverrideTourId || this.IsSaving) return;
    if (this.NewOverrideScope === 'Role' && !this.NewOverrideRoleId) {
      this.showBanner('Select a target Role for a Role-scoped override.', 'warning');
      return;
    }
    if (this.NewOverrideScope === 'User' && !this.NewOverrideUserId) {
      this.showBanner('Select a target User for a User-scoped override.', 'warning');
      return;
    }

    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const ov = await this.ProviderToUse.GetEntityObject<MJTourOverrideEntity>(
        'MJ: Tour Overrides',
        this.ProviderToUse.CurrentUser,
      );
      ov.TourID = this.NewOverrideTourId;
      ov.Scope = this.NewOverrideScope;
      ov.RoleID = this.NewOverrideScope === 'Role' ? this.NewOverrideRoleId : null;
      ov.UserID = this.NewOverrideScope === 'User' ? this.NewOverrideUserId : null;
      ov.Precedence = this.NewOverridePrecedence;
      ov.IsDisabled = this.NewOverrideIsDisabled;
      ov.Status = this.NewOverrideStatus;
      const saved = await ov.Save();
      if (!saved) {
        this.showBanner(`Failed to save override: ${ov.LatestResult?.Message ?? 'Validation error'}`, 'error');
        return;
      }
      this.Overrides = [ov, ...this.Overrides];
      this.rebuildGovernanceViews();
      this.publishAgentContext();
    } finally {
      this.IsSaving = false;
      SafeDetectChanges(this.cdr);
    }
  }

  public async ToggleOverrideDisabled(ov: MJTourOverrideEntity): Promise<void> {
    ov.IsDisabled = !ov.IsDisabled;
    if (!(await ov.Save())) {
      ov.IsDisabled = !ov.IsDisabled;
      this.showBanner(`Failed to update override: ${ov.LatestResult?.Message ?? 'Error'}`, 'error');
    }
    this.cdr.markForCheck();
  }

  public async DeleteOverride(ov: MJTourOverrideEntity): Promise<void> {
    if (await ov.Delete()) {
      this.Overrides = this.Overrides.filter((o) => !UUIDsEqual(o.ID, ov.ID));
      this.rebuildGovernanceViews();
      this.publishAgentContext();
    }
    this.cdr.markForCheck();
  }

  private rebuildGovernanceViews(): void {
    const membersByPathId = GroupByUUID(this.LearningPathTours, (m) => m.LearningPathID);
    this.LearningPathViews = this.LearningPaths.map((lp) => {
      const members = [...(membersByPathId.Get(lp.ID) ?? [])]
        .sort((a, b) => a.Sequence - b.Sequence)
        .map((m) => ({
          Membership: m,
          Tour: this.tourById.get(m.TourID.toLowerCase()) ?? null,
        }));
      return { Path: lp, Members: members };
    });

    if (!this.AddMemberPathId && this.LearningPaths[0]) {
      this.AddMemberPathId = this.LearningPaths[0].ID;
    }
    if (!this.AddMemberTourId && this.Tours[0]) {
      this.AddMemberTourId = this.Tours[0].ID;
    }
    if (!this.NewOverrideTourId && this.Tours[0]) {
      this.NewOverrideTourId = this.Tours[0].ID;
    }

    const roleMap = new Map(this.Roles.map((r) => [r.ID.toLowerCase(), r.Name]));
    const userMap = new Map(this.Users.map((u) => [u.ID.toLowerCase(), u.Name]));

    this.OverrideViews = this.Overrides.map((ov) => {
      const tour = this.tourById.get(ov.TourID.toLowerCase());
      let targetLabel = 'All Users (Global)';
      if (ov.Scope === 'Role') {
        targetLabel = `Role: ${ov.RoleID ? (roleMap.get(ov.RoleID.toLowerCase()) ?? ov.RoleID) : '(none)'}`;
      } else if (ov.Scope === 'User') {
        targetLabel = `User: ${ov.UserID ? (userMap.get(ov.UserID.toLowerCase()) ?? ov.UserID) : '(none)'}`;
      }
      return {
        Override: ov,
        TourName: tour?.Name ?? ov.Tour ?? ov.TourID,
        TargetLabel: targetLabel,
      };
    });
  }

  // =========================================================================
  // ANALYTICS TAB
  // =========================================================================

  public OnAnalyticsTourChange(tourId: string): void {
    this.AnalyticsTourId = tourId;
    this.recomputeAnalytics();
    this.cdr.markForCheck();
  }

  private recomputeAnalytics(): void {
    const tour =
      (this.AnalyticsTourId ? this.tourById.get(this.AnalyticsTourId.toLowerCase()) : undefined) ??
      this.SelectedTour ??
      this.Tours[0] ??
      null;
    if (!tour) {
      this.AnalyticsSummary = null;
      return;
    }
    this.AnalyticsTourId = tour.ID;

    const allRuns = this.Runs.filter((r) => UUIDsEqual(r.TourID, tour.ID));
    const treatedRuns = allRuns.filter((r) => !r.IsHoldout);
    const holdoutRuns = allRuns.filter((r) => r.IsHoldout);

    const startedCount = treatedRuns.filter((r) => r.StartedAt != null).length;
    const completedCount = treatedRuns.filter((r) => r.Status === 'Completed').length;
    const dismissedCount = treatedRuns.filter((r) => r.Status === 'Dismissed').length;
    const abandonedCount = treatedRuns.filter((r) => r.Status === 'Abandoned').length;
    const nonStartersCount = treatedRuns.filter((r) => r.StartedAt == null).length;
    const goalMetCount = treatedRuns.filter((r) => r.GoalMetAt != null).length;

    const completionRatePct = treatedRuns.length > 0 ? Math.round((completedCount / treatedRuns.length) * 100) : 0;
    const completers = treatedRuns.filter((r) => r.Status === 'Completed');
    const completersGoalRatePct =
      completers.length > 0
        ? Math.round((completers.filter((r) => r.GoalMetAt != null).length / completers.length) * 100)
        : 0;

    const treatedGoalRatePct = treatedRuns.length > 0 ? Math.round((goalMetCount / treatedRuns.length) * 100) : 0;
    const holdoutGoalRatePct =
      holdoutRuns.length > 0
        ? Math.round((holdoutRuns.filter((r) => r.GoalMetAt != null).length / holdoutRuns.length) * 100)
        : null;
    const goalLiftPct = holdoutGoalRatePct != null ? treatedGoalRatePct - holdoutGoalRatePct : null;

    const runMap = new Map(treatedRuns.map((r) => [r.ID.toLowerCase(), r]));
    const stepsForTour = this.Steps.filter((s) => UUIDsEqual(s.TourID, tour.ID));
    const stepTitleByKey = new Map(stepsForTour.map((s) => [s.StepKey, s.Title]));

    const runStepsForTour = this.RunSteps.filter((rs) => runMap.has(rs.TourRunID.toLowerCase()));
    const questionsByRunId = new Map<string, number>();
    const anchorStats = new Map<string, TourStepAnchorHealthRow>();

    for (const step of stepsForTour) {
      anchorStats.set(step.StepKey, {
        StepKey: step.StepKey,
        StepTitle: step.Title,
        TotalVisits: 0,
        RegisteredCount: 0,
        SemanticCount: 0,
        RoleCount: 0,
        SelectorCount: 0,
        FailedCount: 0,
        MissRatePct: 0,
      });
    }

    for (const rs of runStepsForTour) {
      const rid = rs.TourRunID.toLowerCase();
      questionsByRunId.set(rid, (questionsByRunId.get(rid) ?? 0) + (rs.QuestionCount ?? 0));

      const row = anchorStats.get(rs.StepKey) ?? {
        StepKey: rs.StepKey,
        StepTitle: stepTitleByKey.get(rs.StepKey) ?? rs.StepKey,
        TotalVisits: 0,
        RegisteredCount: 0,
        SemanticCount: 0,
        RoleCount: 0,
        SelectorCount: 0,
        FailedCount: 0,
        MissRatePct: 0,
      };
      row.TotalVisits++;
      switch (rs.AnchorResolution) {
        case 'Registered': row.RegisteredCount++; break;
        case 'Semantic': row.SemanticCount++; break;
        case 'Role': row.RoleCount++; break;
        case 'Selector': row.SelectorCount++; break;
        case 'Failed': row.FailedCount++; break;
      }
      anchorStats.set(rs.StepKey, row);
    }

    const stepAnchorHealth = Array.from(anchorStats.values()).map((r) => ({
      ...r,
      MissRatePct: r.TotalVisits > 0 ? Math.round((r.FailedCount / r.TotalVisits) * 100) : 0,
    }));

    const modes: Array<'Visual' | 'Chat' | 'Voice'> = ['Visual', 'Chat', 'Voice'];
    const guideModes: GuideModeMetricRow[] = modes.map((mode) => {
      const modeRuns = treatedRuns.filter((r) => r.GuideMode === mode);
      const comp = modeRuns.filter((r) => r.Status === 'Completed').length;
      const goal = modeRuns.filter((r) => r.GoalMetAt != null).length;
      const totalQ = modeRuns.reduce((sum, r) => sum + (questionsByRunId.get(r.ID.toLowerCase()) ?? 0), 0);
      return {
        Mode: mode,
        RunCount: modeRuns.length,
        CompletedCount: comp,
        CompletionRatePct: modeRuns.length > 0 ? Math.round((comp / modeRuns.length) * 100) : 0,
        GoalMetCount: goal,
        GoalRatePct: modeRuns.length > 0 ? Math.round((goal / modeRuns.length) * 100) : 0,
        AvgQuestionsPerRun: modeRuns.length > 0 ? Math.round((totalQ / modeRuns.length) * 10) / 10 : 0,
      };
    });

    this.AnalyticsSummary = {
      TourID: tour.ID,
      TourName: tour.Name,
      TotalRuns: treatedRuns.length,
      StartedCount: startedCount,
      CompletedCount: completedCount,
      DismissedCount: dismissedCount,
      AbandonedCount: abandonedCount,
      GoalMetCount: goalMetCount,
      CompletionRatePct: completionRatePct,
      CompletersGoalRatePct: completersGoalRatePct,
      NonStartersCount: nonStartersCount,
      HoldoutCount: holdoutRuns.length,
      HoldoutGoalRatePct: holdoutGoalRatePct,
      GoalLiftPct: goalLiftPct,
      GuideModes: guideModes,
      StepAnchorHealth: stepAnchorHealth,
    };
  }

  // =========================================================================
  // STEP HYDRATION, GRAPH SVG & CAPABILITY WARNINGS
  // =========================================================================

  private hydrateStepEditorFields(step: MJTourStepEntity): void {
    const anchor = step.AnchorObject;
    this.StepAnchorStrategy = anchor?.Strategy ?? 'Registered';
    this.StepAnchorKey = anchor?.Key ?? '';
    this.StepAnchorEntity = anchor?.Entity ?? '';
    this.StepAnchorField = anchor?.Field ?? '';
    this.StepAnchorSection = anchor?.Section ?? '';
    this.StepAnchorRole = anchor?.Role ?? '';
    this.StepAnchorName = anchor?.Name ?? '';
    this.StepAnchorSelector = anchor?.Selector ?? '';

    const cfg = step.ConfigurationObject;
    this.StepAllowSelectorGate = Boolean(cfg?.tourAnchorsAllowSelector);
    this.StepComponentID = cfg?.componentId ?? '';
    this.StepComponentSpecJson = cfg?.componentSpec ? JSON.stringify(cfg.componentSpec, null, 2) : '';

    const locEntries: Array<{ Locale: string; Title: string; Body: string }> = [];
    if (cfg?.localizations) {
      for (const [locale, entry] of Object.entries(cfg.localizations)) {
        locEntries.push({
          Locale: locale,
          Title: entry?.title ?? '',
          Body: entry?.body ?? '',
        });
      }
    }
    this.StepLocalizations = locEntries;

    const prep = step.PrepareObject;
    this.StepPrepareApp = prep?.Application ?? '';
    this.StepPrepareNavItem = prep?.NavItem ?? '';
    this.StepPrepareUrl = prep?.Url ?? '';

    const comp = step.CompletionObject;
    const firstCheck = comp?.Checks?.[0];
    if (firstCheck?.Type === 'Signal') {
      this.StepCompletionMode = 'Signal';
      this.StepCompletionSignal = firstCheck.Signal ?? '';
    } else if (firstCheck?.Type === 'EntityEvent') {
      this.StepCompletionMode = 'EntityEvent';
      this.StepCompletionEntity = firstCheck.Entity ?? '';
      this.StepCompletionEventAction = firstCheck.Action ?? 'Save';
    } else if (firstCheck?.Type === 'AnchorInteraction') {
      this.StepCompletionMode = 'Action';
    } else {
      this.StepCompletionMode = 'Manual';
    }
  }

  private recomputeSelectedTourWarningsAndGraph(): void {
    if (!this.SelectedTour) {
      this.SelectedTourCapabilityWarnings = [];
      this.GraphData = null;
      return;
    }
    const assignedSurfaces = this.SurfaceTours
      .filter((st) => UUIDsEqual(st.TourID, this.SelectedTour?.ID))
      .map((st) => this.surfaceById.get(st.SurfaceID.toLowerCase()))
      .filter((s): s is MJTourSurfaceEntity => s != null);
    this.SelectedTourCapabilityWarnings = ComputeSurfaceCapabilityWarnings(
      this.SelectedTourSteps,
      this.stepTypeById,
      assignedSurfaces,
    );
    this.rebuildGraphData();
  }

  private rebuildGraphData(): void {
    if (!this.SelectedTour) {
      this.GraphData = null;
      return;
    }
    const def = BuildTourDefinitionFromEntities(
      this.SelectedTour,
      this.SelectedTourSteps,
      this.SelectedTourPaths,
      this.stepTypeById,
      this.SelectedTourVersions,
    );
    const compiled = CompileTourGraph(def);
    const validation = ValidateTourGraph(def);
    const nodeWidth = 176;
    const nodeHeight = 56;
    const layout = ComputeTourGraphLayout(def, {
      NodeWidth: nodeWidth,
      NodeHeight: nodeHeight,
      LayerGap: 56,
      SiblingGap: 36,
      Direction: 'LR',
    });

    const nodes: GraphSvgNode[] = compiled.Nodes.map((n) => {
      const pos = layout.Positions.get(n.id) ?? { X: 24, Y: 24 };
      return {
        StepKey: n.id,
        Title: n.name || n.id,
        StepType: n.type ?? 'Spotlight',
        X: pos.X,
        Y: pos.Y,
        Width: nodeWidth,
        Height: nodeHeight,
        IsStart: Boolean(n.isStartNode),
        Selected: this.SelectedStep?.StepKey === n.id,
      };
    });

    const nodeByKey = new Map(nodes.map((n) => [n.StepKey, n]));
    const edges: GraphSvgEdge[] = [];
    for (const edge of compiled.Edges) {
      const from = nodeByKey.get(edge.originNodeId);
      const to = nodeByKey.get(edge.destinationNodeId);
      if (!from || !to) continue;
      const x1 = from.X + from.Width;
      const y1 = from.Y + from.Height / 2;
      const x2 = to.X;
      const y2 = to.Y + to.Height / 2;
      const cx = (x1 + x2) / 2;
      const pathDef = compiled.PathByEdgeId.get(edge.id);
      edges.push({
        ID: edge.id,
        FromStepKey: edge.originNodeId,
        ToStepKey: edge.destinationNodeId,
        Label: pathDef?.Label ?? (pathDef?.Condition ? String(pathDef.Condition) : ''),
        IsDefault: Boolean(pathDef?.IsDefault),
        IsSyntheticLinear: !pathDef,
        PathD: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
        LabelX: cx,
        LabelY: (y1 + y2) / 2 - 6,
      });
    }

    this.GraphData = {
      Width: Math.max(480, layout.Bounds.Width + 40),
      Height: Math.max(180, layout.Bounds.Height + 40),
      Nodes: nodes,
      Edges: edges,
      Valid: validation.Valid,
      HasCycle: validation.CycleResult.hasCycle,
      UnknownStepRefs: validation.UnknownStepRefs,
      DuplicateStepKeys: validation.DuplicateStepKeys,
    };
  }

  // =========================================================================
  // AGENT CONTEXT & READ/NAVIGATION CLIENT TOOLS
  // =========================================================================

  private publishAgentContext(): void {
    const candidates: TourCandidate[] = this.Tours.map((t) => ({
      ID: t.ID,
      TourKey: t.TourKey,
      Name: t.Name,
      Status: t.Status,
    }));
    const selectedCandidate: TourCandidate | null = this.SelectedTour
      ? {
          ID: this.SelectedTour.ID,
          TourKey: this.SelectedTour.TourKey,
          Name: this.SelectedTour.Name,
          Status: this.SelectedTour.Status,
        }
      : null;

    const context = BuildTourStudioAgentContext({
      ActiveTab: this.ActiveTab,
      TotalTourCount: this.Tours.length,
      FilteredTourCount: this.FilteredCatalogItems.length,
      DraftCount: candidates.filter((c) => c.Status === 'Draft').length,
      ActiveCount: candidates.filter((c) => c.Status === 'Active').length,
      RetiredCount: candidates.filter((c) => c.Status === 'Retired').length,
      SearchQuery: this.SearchQuery,
      StatusFilter: this.stringFilter('status'),
      ApplicationFilter: this.stringFilter('applicationId'),
      GuideModeFilter: this.stringFilter('guideMode'),
      SurfaceFilter: this.stringFilter('surfaceId'),
      VisibleTourNames: this.FilteredCatalogItems.map((i) => i.Tour.Name),
      SelectedTour: selectedCandidate,
      SelectedTourStepCount: this.SelectedTourSteps.length,
      SelectedTourCapabilityWarningCount: this.SelectedTourCapabilityWarnings.length,
      SelectedStepKey: this.SelectedStep?.StepKey ?? null,
      SelectedStepTitle: this.SelectedStep?.Title ?? null,
      GraphValid: this.GraphData?.Valid ?? true,
      GraphHasCycle: this.GraphData?.HasCycle ?? false,
      LearningPathCount: this.LearningPaths.length,
      OverrideCount: this.Overrides.length,
      TotalRunCount: this.Runs.length,
      IsLoading: this.IsLoading,
    });
    this.navigationService.SetAgentContext(this, context);
  }

  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SwitchTourStudioTab',
        Description: `Switch the active Tour Studio tab (${TOUR_STUDIO_TABS.join(', ')}).`,
        ParameterSchema: {
          type: 'object',
          properties: { tab: { type: 'string' } },
          required: ['tab'],
        },
        Handler: async (params) => {
          const v = ValidateStringParam(params['tab'], 'tab');
          if (!v.ok) return v.result;
          const resolved = ResolveTourStudioTab(v.value);
          if (!resolved) {
            return { Success: false, ErrorMessage: `Unknown tab "${v.value}". Valid tabs: ${TOUR_STUDIO_TABS.join(', ')}.` };
          }
          this.OnTabChange(resolved);
          return { Success: true, Data: { ActiveTab: resolved } };
        },
      },
      {
        Name: 'SearchTours',
        Description: 'Filter the Tour Studio catalog by search query (empty string clears).',
        ParameterSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
        Handler: async (params) => {
          const query = typeof params['query'] === 'string' ? params['query'] : '';
          this.OnSearchChange(query);
          return { Success: true, Data: { FilteredTourCount: this.FilteredCatalogItems.length } };
        },
      },
      {
        Name: 'FilterTours',
        Description: 'Filter the Tour Studio catalog by status (Active/Draft/Retired/empty) and/or guideMode (Visual/Chat/Voice/User Choice/empty).',
        ParameterSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            guideMode: { type: 'string' },
          },
        },
        Handler: async (params) => {
          const next = { ...this.FilterValues };
          if (typeof params['status'] === 'string') {
            next['status'] = params['status'].trim();
          }
          if (typeof params['guideMode'] === 'string') {
            next['guideMode'] = params['guideMode'].trim();
          }
          this.OnFilterValuesChange(next);
          return { Success: true, Data: { FilteredTourCount: this.FilteredCatalogItems.length } };
        },
      },
      {
        Name: 'SelectTour',
        Description: 'Select a tour in Tour Studio by ID, TourKey, or Name and switch to Builder.',
        ParameterSchema: {
          type: 'object',
          properties: { tour: { type: 'string' } },
          required: ['tour'],
        },
        Handler: async (params) => {
          const v = ValidateStringParam(params['tour'], 'tour');
          if (!v.ok) return v.result;
          const candidates = this.Tours.map((t) => ({ ID: t.ID, TourKey: t.TourKey, Name: t.Name, Status: t.Status }));
          const match = ResolveTourByIdOrKeyOrName(v.value, candidates);
          const tourEntity = match ? this.tourById.get(match.ID.toLowerCase()) : undefined;
          if (!tourEntity) {
            return { Success: false, ErrorMessage: BuildTourNotFoundError(v.value, candidates) };
          }
          this.OpenTourInBuilder(tourEntity);
          return { Success: true, Data: { TourKey: tourEntity.TourKey, Name: tourEntity.Name } };
        },
      },
      {
        Name: 'PreviewSelectedTour',
        Description: 'Launch a read-only preview of the currently selected tour (optionally simulating a role name).',
        ParameterSchema: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['Visual', 'Chat', 'Voice'] },
            simulatedRole: { type: 'string' },
          },
        },
        Handler: async (params) => {
          if (!this.SelectedTour) {
            return { Success: false, ErrorMessage: 'No tour is currently selected in Tour Studio.' };
          }
          if (params['mode'] === 'Visual' || params['mode'] === 'Chat' || params['mode'] === 'Voice') {
            this.PreviewGuideMode = params['mode'];
          }
          if (typeof params['simulatedRole'] === 'string') {
            this.SimulatedRoleFilter = params['simulatedRole'].trim();
          }
          this.PreviewSelectedTour();
          return { Success: true, Data: { TourKey: this.SelectedTour.TourKey, Mode: this.PreviewGuideMode } };
        },
      },
      {
        Name: 'ValidateSelectedTourGraph',
        Description: 'Validate the currently selected tour pathway graph for cycles, dangling step refs, and surface capability mismatches.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          if (!this.SelectedTour) {
            return { Success: false, ErrorMessage: 'No tour is currently selected.' };
          }
          this.recomputeSelectedTourWarningsAndGraph();
          return {
            Success: true,
            Data: {
              TourKey: this.SelectedTour.TourKey,
              Valid: this.GraphData?.Valid ?? true,
              HasCycle: this.GraphData?.HasCycle ?? false,
              UnknownStepRefs: this.GraphData?.UnknownStepRefs ?? [],
              DuplicateStepKeys: this.GraphData?.DuplicateStepKeys ?? [],
              CapabilityWarnings: this.SelectedTourCapabilityWarnings,
            },
          };
        },
      },
      {
        Name: 'RefreshTourStudio',
        Description: 'Reload all tours, steps, surfaces, learning paths, overrides, and analytics from the server.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.loadData();
          return { Success: true, Data: { TourCount: this.Tours.length } };
        },
      },
    ]);
  }

  // =========================================================================
  // TYPED TEMPLATE EVENT HELPERS (NO $any IN TEMPLATES)
  // =========================================================================

  public GetInputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value ?? '';
  }

  public GetSelectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value ?? '';
  }

  public GetCheckboxChecked(event: Event): boolean {
    return Boolean((event.target as HTMLInputElement).checked);
  }

  public GetNumberValue(event: Event, fallback = 0): number {
    const parsed = Number((event.target as HTMLInputElement).value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  public OnTourStatusChange(value: string): void {
    if (!this.SelectedTour) return;
    if (value === 'Draft' || value === 'Active' || value === 'Retired') {
      this.SelectedTour.Status = value;
    }
  }

  public OnTourGuideModeChange(value: string): void {
    if (!this.SelectedTour) return;
    if (value === 'Visual' || value === 'Chat' || value === 'Voice' || value === 'User Choice') {
      this.SelectedTour.DefaultGuideMode = value;
    }
  }

  public OnStepPlacementChange(value: string): void {
    if (!this.SelectedStep) return;
    if (value === 'Auto' || value === 'Top' || value === 'Bottom' || value === 'Left' || value === 'Right' || value === 'Center') {
      this.SelectedStep.Placement = value;
    }
  }

  public OnStepModeChange(value: string): void {
    if (!this.SelectedStep) return;
    if (value === 'Show' || value === 'Guide' || value === 'Do') {
      this.SelectedStep.Mode = value;
    }
  }

  public OnStepOnMissingChange(value: string): void {
    if (!this.SelectedStep) return;
    if (value === 'Center' || value === 'Skip' || value === 'Stall' || value === 'Agent Recover') {
      this.SelectedStep.OnMissing = value;
    }
  }

  public OnStepAnchorStrategyChange(value: string): void {
    this.StepAnchorStrategy = value as MJTourStepEntity_ITourAnchor['Strategy'];
  }

  public OnStepCompletionModeChange(value: string): void {
    if (value === 'Manual' || value === 'Action' || value === 'Signal' || value === 'EntityEvent') {
      this.StepCompletionMode = value;
    }
  }

  public OnStepCompletionEventActionChange(value: string): void {
    if (value === 'Save' || value === 'Create' || value === 'Update' || value === 'Delete') {
      this.StepCompletionEventAction = value;
    }
  }

  public OnPreviewGuideModeChange(value: string): void {
    if (value === 'Visual' || value === 'Chat' || value === 'Voice') {
      this.PreviewGuideMode = value;
    }
  }

  public OnOverrideScopeChange(value: string): void {
    if (value === 'Global' || value === 'Role' || value === 'User') {
      this.NewOverrideScope = value;
    }
  }

  public DismissBanner(): void {
    this.BannerMessage = null;
    this.cdr.markForCheck();
  }

  private showBanner(message: string, kind: 'info' | 'warning' | 'error'): void {
    this.BannerMessage = message;
    this.BannerKind = kind;
    this.cdr.markForCheck();
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildFallbackSelector(el: HTMLElement): string {
  if (el.id) {
    return `#${el.id}`;
  }
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && parts.length < 3 && current.tagName !== 'BODY') {
    const cls = Array.from(current.classList)
      .filter((c) => !c.startsWith('ng-'))
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join('');
    parts.unshift(`${current.tagName.toLowerCase()}${cls}`);
    current = current.parentElement;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}
