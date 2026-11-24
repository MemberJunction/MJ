import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, ViewContainerRef, inject } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import {
    MJAIAgentEntity,
    MJAIAgentStepEntity,
    MJAIAgentStepPathEntity,
    MJScheduledJobEntity,
    MJTaskEntity,
    ResourceData,
    UserInfoEngine,
    WorkflowSaveOperation,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import type { AgentInvocationOpenRequestedEventArgs } from '@memberjunction/ng-agents';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import type { FilterFieldConfig, ViewToggleOption } from '@memberjunction/ng-ui-components';
import {
    BuildBlueprintSvgLayout,
    BuildRunSparkBars,
    FormatShortDuration,
} from './workflow-blueprint.util';
import type {
    PendingPersonDecision,
    WorkflowDraftRequest,
    WorkflowListItem,
    WorkflowsCatalogViewMode,
    WorkflowTriggerKind,
} from './workflows.types';

const VIEW_PREF_KEY = 'mj.workflows.catalogView.v1';

type WorkflowsAgentTool = {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
};

export type WorkflowStudioTab = 'canvas' | 'triggers' | 'runs';

export interface StudioWorkflowRunItem {
    ID: string;
    Name: string;
    Status: MJTaskEntity['Status'];
    StartedAt: Date | null;
    CompletedAt: Date | null;
    Duration: string;
}

/**
 * The Workflows app — Spatial-First Hybrid Catalog (Blueprint Gallery + Ops Table),
 * Split-Compiler Create Front Door, and In-App Authoring Studio (reusing `<mj-flow-agent-editor>`
 * and `<mj-agent-invocations>` 100% DRY).
 */
@Component({
    standalone: false,
    selector: 'mj-workflows-dashboard',
    templateUrl: './workflows-dashboard.component.html',
    styleUrls: ['./workflows-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseDashboard, 'WorkflowsDashboard')
export class WorkflowsDashboardComponent extends BaseDashboard implements AfterViewInit {
    /** Optional tab ResourceData forwarded by `<mj-workflows-resource>` so query-param updates know their tab ID. */
    @Input()
    public set HostData(value: ResourceData | undefined) {
        if (value) {
            this.Data = value;
        }
    }

    public IsLoading = false;
    public Workflows: WorkflowListItem[] = [];
    public LoadError: string | null = null;

    /** Search & filter state for the catalog. */
    public SearchText = '';
    public FilterValues: Record<string, unknown> = {
        status: 'all',
        trigger: 'all',
        feature: 'all',
    };

    public readonly FilterFields: FilterFieldConfig[] = [
        {
            key: 'status',
            label: 'Status',
            type: 'chips',
            options: [
                { text: 'All', value: 'all' },
                { text: 'Active', value: 'Active' },
                { text: 'Pending', value: 'Pending' },
                { text: 'Disabled', value: 'Disabled' },
            ],
        },
        {
            key: 'trigger',
            label: 'Starts By',
            type: 'chips',
            options: [
                { text: 'All', value: 'all' },
                { text: 'On demand', value: 'manual' },
                { text: 'Scheduled', value: 'schedule' },
                { text: 'Event', value: 'event' },
            ],
        },
        {
            key: 'feature',
            label: 'Capabilities',
            type: 'chips',
            options: [
                { text: 'Any', value: 'all' },
                { text: 'Has Person Step', value: 'human' },
                { text: 'Has Loop', value: 'loop' },
            ],
        },
    ];

    public readonly ViewOptions: ViewToggleOption[] = [
        { key: 'blueprints', label: 'Blueprints', icon: 'fa-solid fa-table-cells-large' },
        { key: 'table', label: 'Ops Table', icon: 'fa-solid fa-list' },
    ];

    public ViewMode: WorkflowsCatalogViewMode = 'blueprints';

    /** Conditional Person-Approval Inbox banner items. */
    public PendingDecisions: PendingPersonDecision[] = [];
    public ActiveRunningCount = 0;

    /** True while the Create Front Door is open. */
    public IsCreating = false;
    public IsSaving = false;
    public SaveError: string | null = null;

    /** Active workflow opened inside the In-App Authoring Studio, or null when browsing catalog. */
    public ActiveStudioWorkflow: WorkflowListItem | null = null;
    public StudioTab: WorkflowStudioTab = 'canvas';
    public StudioRuns: StudioWorkflowRunItem[] = [];
    public StudioRunsLoading = false;
    public SelectedStudioRunID: string | null = null;
    private pendingWorkflowQueryID: string | null = null;

    private readonly testHarnessDialog = inject(AITestHarnessDialogService);
    private readonly viewContainerRef = inject(ViewContainerRef);

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Workflows';
    }

    initDashboard(): void {
        try {
            const savedView = UserInfoEngine.Instance.GetSetting(VIEW_PREF_KEY);
            if (savedView === 'blueprints' || savedView === 'table') {
                this.ViewMode = savedView;
            }
        } catch {
            // Engine not bootstrapped in unit tests
        }
        const params = this.GetQueryParams();
        this.applyParams(params);
    }

    ngAfterViewInit(): void {
        this.publishAgentContext();
    }

    /** Public seam so `<mj-workflows-resource>` forwards tab query params cleanly. */
    public ApplyQueryParams(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
        this.OnQueryParamsChanged(params, source);
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        this.applyParams(params);
        this.cdr.markForCheck();
    }

    private applyParams(params: Record<string, string>): void {
        if (params['view'] === 'blueprints' || params['view'] === 'table') {
            this.ViewMode = params['view'];
        }
        if (params['tab'] === 'canvas' || params['tab'] === 'triggers' || params['tab'] === 'runs') {
            this.StudioTab = params['tab'];
        }
        const wfId = params['workflow'] ?? null;
        if (wfId) {
            this.IsCreating = false;
            const match = this.Workflows.find((w) => UUIDsEqual(w.ID, wfId));
            if (match) {
                this.ActiveStudioWorkflow = match;
                this.pendingWorkflowQueryID = null;
            } else {
                this.pendingWorkflowQueryID = wfId;
            }
        } else {
            this.ActiveStudioWorkflow = null;
            this.pendingWorkflowQueryID = null;
        }
    }

    public get ActiveFilterCount(): number {
        let count = 0;
        if (this.FilterValues['status'] && this.FilterValues['status'] !== 'all') count++;
        if (this.FilterValues['trigger'] && this.FilterValues['trigger'] !== 'all') count++;
        if (this.FilterValues['feature'] && this.FilterValues['feature'] !== 'all') count++;
        return count;
    }

    public get FilteredWorkflows(): WorkflowListItem[] {
        const q = this.SearchText.trim().toLowerCase();
        const statusFilter = String(this.FilterValues['status'] ?? 'all');
        const triggerFilter = String(this.FilterValues['trigger'] ?? 'all');
        const featureFilter = String(this.FilterValues['feature'] ?? 'all');

        return this.Workflows.filter((w) => {
            if (q) {
                const hay = `${w.Name} ${w.Description ?? ''} ${w.TriggerSummary}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (statusFilter !== 'all' && w.Status !== statusFilter) return false;
            if (triggerFilter !== 'all' && (w.TriggerKind ?? 'manual') !== triggerFilter) return false;
            if (featureFilter === 'human' && !w.HasHumanStep) return false;
            if (featureFilter === 'loop' && !w.HasLoop) return false;
            return true;
        });
    }

    /**
     * Loads saved workflows, their step/path topologies for miniature SVG Blueprints,
     * reconciled trigger metadata, recent 10-run health telemetry, and pending Person decisions.
     */
    async loadData(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [agentsRes, jobsRes, runsRes, humanTasksRes] = await Promise.all([
                rv.RunView<MJAIAgentEntity>({
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `TypeID IN (SELECT ID FROM __mj.vwAIAgentTypes WHERE Name='Flow')`,
                    OrderBy: '__mj_UpdatedAt DESC',
                    ResultType: 'entity_object',
                }),
                rv.RunView<MJScheduledJobEntity>({
                    EntityName: 'MJ: Scheduled Jobs',
                    ExtraFilter: `Status='Active'`,
                    MaxRows: 200,
                    ResultType: 'entity_object',
                }),
                rv.RunView<MJTaskEntity>({
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID IS NULL`,
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 200,
                    ResultType: 'entity_object',
                    BypassCache: true,
                }),
                rv.RunView<MJTaskEntity>({
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID IS NOT NULL AND StepType='Human' AND Status='In Progress'`,
                    OrderBy: 'StartedAt DESC',
                    MaxRows: 10,
                    ResultType: 'entity_object',
                    BypassCache: true,
                }),
            ]);

            if (!agentsRes.Success) {
                this.LoadError = agentsRes.ErrorMessage ?? 'Workflows could not be loaded.';
                this.Workflows = [];
                return;
            }

            const agents = agentsRes.Results ?? [];
            const agentIds = agents.map((a) => a.ID);

            // Load steps and paths in parallel for miniature Blueprint SVG previews
            const stepsByAgent = new Map<string, MJAIAgentStepEntity[]>();
            const pathsByAgent = new Map<string, MJAIAgentStepPathEntity[]>();
            if (agentIds.length > 0) {
                const inClause = agentIds.map((id) => `'${id}'`).join(',');
                const [stepsRes, pathsRes] = await Promise.all([
                    rv.RunView<MJAIAgentStepEntity>({
                        EntityName: 'MJ: AI Agent Steps',
                        ExtraFilter: `AgentID IN (${inClause})`,
                        ResultType: 'entity_object',
                    }),
                    rv.RunView<MJAIAgentStepPathEntity>({
                        EntityName: 'MJ: AI Agent Step Paths',
                        ExtraFilter: `OriginStepID IN (SELECT ID FROM [__mj].[vwAIAgentSteps] WHERE AgentID IN (${inClause}))`,
                        ResultType: 'entity_object',
                    }),
                ]);

                const stepToAgent = new Map<string, string>();
                if (stepsRes.Success) {
                    for (const step of stepsRes.Results ?? []) {
                        const aid = step.AgentID.toLowerCase();
                        stepToAgent.set(step.ID.toLowerCase(), aid);
                        const list = stepsByAgent.get(aid) ?? [];
                        list.push(step);
                        stepsByAgent.set(aid, list);
                    }
                }
                if (pathsRes.Success) {
                    for (const p of pathsRes.Results ?? []) {
                        const aid = stepToAgent.get(p.OriginStepID.toLowerCase());
                        if (!aid) continue;
                        const list = pathsByAgent.get(aid) ?? [];
                        list.push(p);
                        pathsByAgent.set(aid, list);
                    }
                }
            }

            // Reconcile Scheduled Jobs by inspecting Configuration JSON for AgentID
            const scheduleByAgent = new Map<string, string>();
            if (jobsRes.Success) {
                for (const job of jobsRes.Results ?? []) {
                    const cfg = job.Configuration ?? '';
                    for (const a of agents) {
                        if (cfg.toLowerCase().includes(a.ID.toLowerCase())) {
                            scheduleByAgent.set(a.ID.toLowerCase(), job.CronExpression ? `Scheduled (${job.CronExpression})` : `Scheduled: ${job.Name}`);
                        }
                    }
                }
            }

            // Group recent runs by AgentID and compute live running count
            const allRuns = runsRes.Success ? (runsRes.Results ?? []) : [];
            this.ActiveRunningCount = allRuns.filter((r) => r.Status === 'In Progress').length;
            const runsByAgent = new Map<string, MJTaskEntity[]>();
            const runNameByID = new Map<string, string>();
            for (const r of allRuns) {
                runNameByID.set(r.ID.toLowerCase(), r.Name);
                if (!r.AgentID) continue;
                const key = r.AgentID.toLowerCase();
                const list = runsByAgent.get(key) ?? [];
                list.push(r);
                runsByAgent.set(key, list);
            }

            // Pending Person Decisions inbox
            this.PendingDecisions = (humanTasksRes.Success ? (humanTasksRes.Results ?? []) : []).map((t) => ({
                TaskID: t.ID,
                ParentTaskID: t.ParentID ?? t.ID,
                StepName: t.Name,
                WorkflowName: runNameByID.get((t.ParentID ?? '').toLowerCase()) ?? 'Workflow Run',
                StartedAt: t.StartedAt,
            }));

            this.Workflows = agents.map((a) => {
                const key = a.ID.toLowerCase();
                const steps = stepsByAgent.get(key) ?? [];
                const paths = pathsByAgent.get(key) ?? [];
                const agentRuns = runsByAgent.get(key) ?? [];
                const health = BuildRunSparkBars(agentRuns);
                const scheduleLabel = scheduleByAgent.get(key);
                const triggerKind: WorkflowTriggerKind = scheduleLabel ? 'schedule' : (a.ExposeAsAction ? 'event' : 'manual');
                const triggerSummary = scheduleLabel
                    ? scheduleLabel
                    : (a.ExposeAsAction ? 'Action / Event' : 'On demand');

                return {
                    ID: a.ID,
                    Name: a.Name ?? '(unnamed workflow)',
                    Description: a.Description,
                    Status: a.Status,
                    TriggerSummary: triggerSummary,
                    TriggerKind: triggerKind,
                    UpdatedAt: a.__mj_UpdatedAt,
                    IconClass: a.IconClass || 'fa-solid fa-diagram-project',
                    StepCount: steps.length,
                    HasHumanStep: steps.some((s) => s.StepType === 'Human'),
                    HasLoop: steps.some((s) => s.StepType === 'ForEach' || s.StepType === 'While' || !!s.LoopBodyType),
                    RecentBars: health.RecentBars,
                    HealthPercent: health.HealthPercent,
                    P50Duration: health.P50Duration,
                    LastRunStatus: health.LastRunStatus,
                    BlueprintSvg: BuildBlueprintSvgLayout(
                        steps.map((s) => ({ ID: s.ID, StepType: s.StepType, LoopType: s.LoopBodyType })),
                        paths.map((p) => ({ OriginStepID: p.OriginStepID, DestinationStepID: p.DestinationStepID })),
                    ),
                    ExposeAsAction: a.ExposeAsAction,
                };
            });

            // Resolve pending deep-link workflow if any, or refresh active studio reference
            const targetId = this.pendingWorkflowQueryID ?? this.ActiveStudioWorkflow?.ID ?? null;
            if (targetId) {
                const found = this.Workflows.find((w) => UUIDsEqual(w.ID, targetId)) ?? null;
                this.ActiveStudioWorkflow = found;
                this.pendingWorkflowQueryID = null;
            }
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
            this.Workflows = [];
        } finally {
            this.IsLoading = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.cdr.markForCheck();
    }

    public OnFilterValuesChange(values: Record<string, unknown>): void {
        this.FilterValues = { ...values };
        this.cdr.markForCheck();
    }

    public OnResetFilters(): void {
        this.FilterValues = { status: 'all', trigger: 'all', feature: 'all' };
        this.SearchText = '';
        this.cdr.markForCheck();
    }

    public OnViewModeChange(key: string): void {
        if (key !== 'blueprints' && key !== 'table') return;
        this.ViewMode = key;
        try {
            UserInfoEngine.Instance.SetSettingDebounced(VIEW_PREF_KEY, key);
        } catch {
            // Engine not bootstrapped in unit tests
        }
        this.UpdateQueryParams({ view: key });
        this.cdr.markForCheck();
    }

    public OnStartCreate(): void {
        this.IsCreating = true;
        this.ActiveStudioWorkflow = null;
        this.UpdateQueryParams({ workflow: null, tab: null });
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnCancelCreate(): void {
        this.IsCreating = false;
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    /**
     * Commits the approved workflow via `WorkflowSaveOperation` and opens it straight inside
     * the In-App Workflow Studio (never ejecting the user out of the Workflows app).
     */
    public async OnCreated(request: WorkflowDraftRequest): Promise<void> {
        this.IsSaving = true;
        this.SaveError = null;
        this.cdr.markForCheck();
        try {
            const spec: TaskGraphSpec = (request.Draft as TaskGraphSpec | undefined) ?? {
                workflowName: request.Name,
                reasoning: request.Description,
                tasks: [],
            };

            const op = new WorkflowSaveOperation();
            const result = await op.Execute(
                {
                    spec: {
                        name: request.Name,
                        description: request.Description,
                        status: 'Draft',
                        graph: { ...spec, workflowName: request.Name },
                        triggers: [],
                    },
                },
                { provider: this.ProviderToUse, user: this.ProviderToUse.CurrentUser },
            );

            const agentID = result.Success ? result.Output?.agentID : undefined;
            if (!agentID) {
                this.SaveError =
                    result.Output?.errorMessage ??
                    result.ErrorMessage ??
                    'The workflow could not be saved.';
                return;
            }

            this.IsCreating = false;
            this.pendingWorkflowQueryID = agentID;
            this.StudioTab = 'canvas';
            await this.loadData();
            if (this.ActiveStudioWorkflow) {
                this.UpdateQueryParams({ workflow: this.ActiveStudioWorkflow.ID, tab: 'canvas' });
            }
        } catch (e) {
            this.SaveError = e instanceof Error ? e.message : String(e);
        } finally {
            this.IsSaving = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    /** Opens a saved workflow inside the In-App Studio with full query-param persistence. */
    public OnOpenWorkflow(item: WorkflowListItem): void {
        this.IsCreating = false;
        this.ActiveStudioWorkflow = item;
        this.StudioTab = 'canvas';
        this.StudioRuns = [];
        this.SelectedStudioRunID = null;
        this.UpdateQueryParams({ workflow: item.ID, tab: 'canvas' });
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnBackToCatalog(): void {
        this.ActiveStudioWorkflow = null;
        this.StudioRuns = [];
        this.SelectedStudioRunID = null;
        this.UpdateQueryParams({ workflow: null, tab: null });
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnSelectStudioTab(tab: WorkflowStudioTab): void {
        this.StudioTab = tab;
        if (this.ActiveStudioWorkflow) {
            this.UpdateQueryParams({ workflow: this.ActiveStudioWorkflow.ID, tab });
            if (tab === 'runs') {
                void this.loadStudioRuns(this.ActiveStudioWorkflow.ID);
            }
        }
        this.cdr.markForCheck();
    }

    /** Launches the workflow runner modal (`AITestHarnessDialogService` in workflow Run mode). */
    public OnRunWorkflow(item: WorkflowListItem, event?: Event): void {
        event?.stopPropagation();
        this.testHarnessDialog.OpenForAgent(item.ID, this.viewContainerRef, { initialDebugMode: false });
    }

    /** Launches the workflow debugger modal (`AITestHarnessDialogService` in Debug / Start-Paused mode). */
    public OnDebugWorkflow(item: WorkflowListItem, event?: Event): void {
        event?.stopPropagation();
        this.testHarnessDialog.OpenForAgent(item.ID, this.viewContainerRef, { initialDebugMode: true });
    }

    public OnSelectStudioRun(runID: string): void {
        this.SelectedStudioRunID = UUIDsEqual(this.SelectedStudioRunID ?? '', runID) ? null : runID;
        this.cdr.markForCheck();
    }

    public get SelectedStudioRun(): StudioWorkflowRunItem | null {
        if (!this.SelectedStudioRunID) return null;
        return this.StudioRuns.find((r) => UUIDsEqual(r.ID, this.SelectedStudioRunID!)) ?? null;
    }

    public async RefreshStudioRuns(): Promise<void> {
        if (this.ActiveStudioWorkflow) {
            await this.loadStudioRuns(this.ActiveStudioWorkflow.ID);
        }
    }

    private async loadStudioRuns(agentID: string): Promise<void> {
        this.StudioRunsLoading = true;
        this.cdr.markForCheck();
        try {
            const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<MJTaskEntity>({
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID IS NULL AND AgentID='${agentID}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 50,
                ResultType: 'entity_object',
                BypassCache: true,
            });
            if (!UUIDsEqual(this.ActiveStudioWorkflow?.ID ?? '', agentID)) return;
            this.StudioRuns = (res.Success ? (res.Results ?? []) : []).map((t) => {
                const durMs = t.StartedAt
                    ? Math.max(0, (t.CompletedAt ? new Date(t.CompletedAt).getTime() : Date.now()) - new Date(t.StartedAt).getTime())
                    : null;
                return {
                    ID: t.ID,
                    Name: t.Name ?? '(unnamed run)',
                    Status: t.Status,
                    StartedAt: t.StartedAt,
                    CompletedAt: t.CompletedAt,
                    Duration: durMs != null ? FormatShortDuration(durMs) : '—',
                };
            });
            if (!this.SelectedStudioRunID && this.StudioRuns.length > 0) {
                this.SelectedStudioRunID = this.StudioRuns[0].ID;
            }
        } catch {
            this.StudioRuns = [];
        } finally {
            this.StudioRunsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /** Handles record navigation requested by `<mj-agent-invocations>` in the Triggers tab. */
    public OnOpenInvocationRecord(event: AgentInvocationOpenRequestedEventArgs): void {
        const entityInfo = this.ProviderToUse.EntityByName(event.EntityName);
        if (!entityInfo) return;
        this.navigationService.OpenEntityRecord(event.EntityName, CompositeKey.FromURLSegment(entityInfo, event.RecordID));
    }

    /** Opens a pending Person step task record for immediate review. */
    public OnReviewPendingDecision(decision: PendingPersonDecision): void {
        this.navigationService.OpenEntityRecord('MJ: Tasks', CompositeKey.FromID(decision.TaskID));
    }

    private publishAgentContext(): void {
        this.navigationService.SetAgentContext(this, {
            Surface: 'Workflows',
            ViewMode: this.ViewMode,
            IsCreating: this.IsCreating,
            IsSaving: this.IsSaving,
            SaveError: this.SaveError,
            ActiveStudioWorkflowID: this.ActiveStudioWorkflow?.ID ?? null,
            ActiveStudioWorkflowName: this.ActiveStudioWorkflow?.Name ?? null,
            StudioTab: this.ActiveStudioWorkflow ? this.StudioTab : null,
            WorkflowCount: this.Workflows.length,
            PendingDecisionCount: this.PendingDecisions.length,
            WorkflowNames: this.Workflows.slice(0, 10).map((w) => w.Name),
        });

        const tools: WorkflowsAgentTool[] = [
            {
                Name: 'OpenCreateWorkflow',
                Description: 'Open the Create Workflow front door',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.OnStartCreate();
                    return { Success: true };
                },
            },
            {
                Name: 'OpenWorkflow',
                Description: 'Open a saved workflow in the studio by name',
                ParameterSchema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                    required: ['name'],
                },
                Handler: async (params: Record<string, unknown>) => {
                    const wanted = String(params['name'] ?? '').trim().toLowerCase();
                    const match = this.Workflows.find((w) => w.Name.trim().toLowerCase() === wanted);
                    if (!match) {
                        return { Success: false, Message: `No workflow named "${params['name']}".` };
                    }
                    this.OnOpenWorkflow(match);
                    return { Success: true };
                },
            },
        ];
        this.navigationService.SetAgentClientTools(this, tools);
    }
}
