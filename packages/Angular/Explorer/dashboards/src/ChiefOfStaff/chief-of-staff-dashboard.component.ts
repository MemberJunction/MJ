import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { CompositeKey, EntityInfo, LogError, RunView, RunViewParams } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJConversationEntity,
    MJEnvironmentEntityExtended,
    MJUserRoutineEntity,
    ResourceData,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDsEqual, UUIDSet, UUIDMap, MJGlobal } from '@memberjunction/global';
import { ActionParam } from '@memberjunction/actions-base';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { AgentRequestPanelResult } from '@memberjunction/ng-agent-requests';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    BizAppsTaskRecordLike,
    BuildTaskRecordKey,
    BuildChiefOfStaffAgentContext,
    BuildCockpitScopeFilters,
    CalculateChiefOfStaffMetrics,
    CHIEF_OF_STAFF_AGENT_NAME,
    GetTaskPriorityClass,
    ChiefOfStaffMetrics,
    ChiefOfStaffTab,
    HealthFilter,
    IsApprovalRequest,
    PolicyCalendarChannelModeValue,
    PolicyCoordinationModeValue,
    PolicyDataAccessModeValue,
    PolicyEmailChannelModeValue,
    PolicyGovernanceSummary,
    PolicyMessagingChannelModeValue,
    PolicyPhoneChannelModeValue,
    ResolvePersonTaskScope,
    BIZAPPS_PEOPLE_ENTITY_NAME,
    BIZAPPS_TASKS_ENTITY_NAME,
    PolicyStatusValue,
    PriorityObjectiveCardViewModel,
    RequestSummaryItem,
    ResolvePriorityObjectiveByIDOrName,
    RoutineSummaryItem,
    TaskHealthStatus,
    VALID_CHIEF_OF_STAFF_TABS,
    VALID_HEALTH_FILTERS,
    ValidateChiefOfStaffTabParam,
    ValidateHealthFilterParam,
    ValidateSearchQueryParam,
    LoadTaskAssignees,
    TaskAssigneeMap,
} from './chief-of-staff-agent-context';
import { IsCockpitEntityChange } from './chief-of-staff-live-refresh';

/** OpenApp entity the cockpit reads and edits for priorities and OKRs. Not a core entity: never assume its key is `ID`. */

export interface GovernancePolicyDraft {
    DisplayNameOverride: string;
    Status: PolicyStatusValue;
    OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'];
    CoordinationMode: PolicyCoordinationModeValue;
    DefaultDataAccessMode: PolicyDataAccessModeValue;
    EmailChannelMode: PolicyEmailChannelModeValue;
    CalendarChannelMode: PolicyCalendarChannelModeValue;
    PhoneChannelMode: PolicyPhoneChannelModeValue;
    MessagingChannelMode: PolicyMessagingChannelModeValue;
    AllowInterAgentCoordination: boolean;
    RequireApprovalForExternalComms: boolean;
    RequireApprovalForFinancials: boolean;
    RequireApprovalForDestructiveActions: boolean;
    AutoApproveAmountThreshold: number | null;
    InstructionsOverride: string;
}

export interface TaskQuickEditDraft {
    Status: string;
    HealthStatus: TaskHealthStatus | null;
    PercentComplete: number | null;
    ConfidenceScore: number | null;
    DueAt: string;
    Description: string;
}

@RegisterClass(BaseResourceComponent, 'ChiefOfStaffDashboard')
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffResource')
@Component({
    standalone: false,
    selector: 'mj-chief-of-staff-dashboard',
    templateUrl: './chief-of-staff-dashboard.component.html',
    styleUrls: ['./chief-of-staff-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChiefOfStaffDashboardComponent
    extends BaseResourceComponent
    implements OnInit, OnDestroy
{
    private cdr = inject(ChangeDetectorRef);
    private appManager = inject(ApplicationManager);
    protected override destroy$ = new Subject<void>();
    private initialParamsApplied = false;

    public IsLoading = true;
    public IsSavingPolicy = false;
    public BusyRequestID: string | null = null;
    public BusyRoutineID: string | null = null;

    // ── Briefing reader: a wake routine's conversation, read inside the cockpit ──────────
    /** The routine whose briefings the reader shows; null while the reader is closed. */
    public BriefingRoutine: MJUserRoutineEntity | null = null;
    /** The routine's conversation ID, bound to the embedded chat area. */
    public BriefingConversationId: string | null = null;
    /** The conversation entity when it could be loaded (title, pinned agent); the chat area loads messages by ID either way. */
    public BriefingConversation: MJConversationEntity | null = null;
    public FeedbackBanner: { Type: 'success' | 'error'; Message: string } | null = null;

    public ActiveTab: ChiefOfStaffTab = 'overview';
    public SearchText = '';
    public HealthFilter: HealthFilter = 'all';

    public PolicyEntity: MJAIAgentUserPolicyEntity | null = null;
    public DraftPolicy: GovernancePolicyDraft = this.createDefaultDraftPolicy();
    public PolicyDirty = false;

    public Tasks: BizAppsTaskRecordLike[] = [];
    /** Who is assigned to each loaded task, for the objective cards and milestone rows. */
    private taskAssignees: TaskAssigneeMap = new UUIDMap();
    /** The signed-in user's People record, when one resolved; marks the milestones they hold. */
    private currentPersonID: string | null = null;
    /** False when the signed-in user has no `MJ_BizApps_Common: People` record linked via `LinkedUserID`; the Priorities tab then shows guidance instead of tasks. */
    public HasLinkedPerson = true;
    public Routines: MJUserRoutineEntity[] = [];
    public Requests: MJAIAgentRequestEntity[] = [];
    public Metrics: ChiefOfStaffMetrics = CalculateChiefOfStaffMetrics([], [], []);

    public ExpandedPriorityIDs = new UUIDSet();
    public SelectedRequest: MJAIAgentRequestEntity | null = null;
    public ShowRequestDialog = false;

    public SelectedTask: BizAppsTaskRecordLike | null = null;
    public ShowTaskDrawer = false;
    public IsSavingTask = false;
    public TaskDirty = false;
    public DraftTaskEdits: TaskQuickEditDraft = {
        Status: 'Open',
        HealthStatus: 'OnTrack',
        PercentComplete: 0,
        ConfidenceScore: null,
        DueAt: '',
        Description: '',
    };
    public readonly TaskStatusOptions: readonly string[] = [
        'Open',
        'In Progress',
        'Waiting on dependency',
        'Blocked',
        'Completed',
    ];

    public readonly StatusOptions: readonly PolicyStatusValue[] = ['Active', 'Paused', 'Disabled'];
    public readonly CoordinationModeOptions: readonly {
        Value: PolicyCoordinationModeValue;
        Label: string;
        Description: string;
    }[] = [
        {
            Value: 'Observer',
            Label: 'Observer',
            Description: 'Monitors signals and prepares briefings; never initiates changes.',
        },
        {
            Value: 'Coordinator',
            Label: 'Coordinator',
            Description: 'Tracks priorities, drafts communications, and requests approval before high-impact actions.',
        },
        {
            Value: 'Autonomous',
            Label: 'Autonomous',
            Description: 'Executes within policy guardrails and auto-approval thresholds.',
        },
    ];
    public readonly DataAccessModeOptions: readonly {
        Value: PolicyDataAccessModeValue;
        Label: string;
    }[] = [
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'AllowListOnly', Label: 'Allow-List Only' },
        { Value: 'UserCeiling', Label: 'User Ceiling (Full Delegated Access)' },
    ];
    public readonly EmailChannelOptions: readonly {
        Value: PolicyEmailChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'DraftOnly', Label: 'Draft Only' },
        { Value: 'SendAsAgent', Label: 'Send as Chief of Staff' },
        { Value: 'SendAsUser', Label: 'Send on Behalf of User' },
    ];
    public readonly CalendarChannelOptions: readonly {
        Value: PolicyCalendarChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'ReadOnly', Label: 'Read Only' },
        { Value: 'ProposeWithApproval', Label: 'Propose with Approval' },
        { Value: 'Autonomous', Label: 'Autonomous Scheduling' },
    ];
    public readonly PhoneChannelOptions: readonly {
        Value: PolicyPhoneChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'InboundOnly', Label: 'Inbound Only' },
        { Value: 'OutboundWithApproval', Label: 'Outbound with Approval' },
        { Value: 'OutboundAutonomous', Label: 'Outbound Autonomous' },
    ];
    public readonly MessagingChannelOptions: readonly {
        Value: PolicyMessagingChannelModeValue;
        Label: string;
    }[] = [
        { Value: 'Disabled', Label: 'Disabled' },
        { Value: 'Enabled', Label: 'Enabled' },
    ];
    public readonly HealthFilterOptions: readonly {
        Value: HealthFilter;
        Label: string;
    }[] = [
        { Value: 'all', Label: 'All Health States' },
        { Value: 'OnTrack', Label: 'On Track' },
        { Value: 'AtRisk', Label: 'At Risk' },
        { Value: 'OffTrack', Label: 'Off Track' },
        { Value: 'Completed', Label: 'Completed' },
        { Value: 'Paused', Label: 'Paused' },
    ];

    public get Tabs(): TabConfig[] {
        return [
            { key: 'overview', label: 'Overview', icon: 'fa-solid fa-compass' },
            {
                key: 'priorities',
                label: 'Priorities & OKRs',
                icon: 'fa-solid fa-bullseye',
                badge:
                    this.Metrics.PriorityObjectiveCount > 0
                        ? this.Metrics.PriorityObjectiveCount
                        : null,
            },
            {
                key: 'approvals-wakes',
                label: 'Approvals & Wakes',
                icon: 'fa-solid fa-bell-concierge',
                badge:
                    this.Metrics.PendingApprovalCount > 0
                        ? this.Metrics.PendingApprovalCount
                        : null,
                badgeVariant: this.Metrics.PendingApprovalCount > 0 ? 'warning' : undefined,
            },
            {
                key: 'governance',
                label: 'Governance Policy',
                icon: 'fa-solid fa-shield-halved',
            },
        ];
    }

    public get ChiefOfStaffDisplayName(): string {
        const override = this.DraftPolicy.DisplayNameOverride.trim();
        return override.length > 0 ? override : 'My Chief of Staff';
    }

    public get FilteredPriorityCards(): PriorityObjectiveCardViewModel[] {
        const search = this.SearchText.trim().toLowerCase();
        return this.Metrics.PriorityCards.filter((card) => {
            if (this.HealthFilter !== 'all' && card.EffectiveHealth !== this.HealthFilter) {
                return false;
            }
            if (!search) {
                return true;
            }
            const nameMatch = card.Task.Name.toLowerCase().includes(search);
            const descMatch = (card.Task.Description ?? '').toLowerCase().includes(search);
            const subtaskMatch = card.Subtasks.some((sub) =>
                sub.Name.toLowerCase().includes(search),
            );
            return nameMatch || descMatch || subtaskMatch;
        });
    }

    public get PendingRequests(): MJAIAgentRequestEntity[] {
        const search = this.SearchText.trim().toLowerCase();
        return this.Requests.filter((r) => {
            if (r.Status !== 'Requested' || !IsApprovalRequest(r)) {
                return false;
            }
            if (!search) {
                return true;
            }
            return (r.Request ?? '').toLowerCase().includes(search);
        });
    }

    public get RecentResolvedRequests(): MJAIAgentRequestEntity[] {
        return this.Requests.filter((r) => r.Status !== 'Requested' && IsApprovalRequest(r)).slice(
            0,
            8,
        );
    }

    public get FilteredRoutines(): MJUserRoutineEntity[] {
        const search = this.SearchText.trim().toLowerCase();
        if (!search) {
            return this.Routines;
        }
        return this.Routines.filter(
            (r) =>
                r.Name.toLowerCase().includes(search) ||
                (r.Description ?? '').toLowerCase().includes(search),
        );
    }

    async ngOnInit(): Promise<void> {
        super.ngOnInit();
        const initial = this.GetQueryParams();
        this.applyQueryParams(initial);
        this.initialParamsApplied = true;

        await this.LoadCockpitData();
        this.registerAgentTools();

        this.navigationService.ResourceReattached$.pipe(
            filter((c) => c === this),
            takeUntil(this.destroy$),
        ).subscribe(() => this.publishAgentContext());
        this.subscribeToLiveEntityChanges();

        this.NotifyLoadComplete();
    }

    /** A change arrived while the tab was detached; reload once when it is shown again. */
    private liveReloadPending = false;

    /**
     * Reloads the cockpit when an entity it shows changes anywhere. MJAPI broadcasts every save
     * and delete to browsers, including saves made by server-side code (a wake run creating an
     * approval request, a run row, a task), and the client raises each as a `remote-invalidate`
     * BaseEntity event. A burst of events is one reload. A detached tab does not reload in the
     * background; it reloads once when it is shown again.
     */
    private subscribeToLiveEntityChanges(): void {
        MJGlobal.Instance.GetEventListener(false).pipe(
            filter((event) => IsCockpitEntityChange(event)),
            debounceTime(750),
            takeUntil(this.destroy$),
        ).subscribe(() => {
            if (this.navigationService.IsResourceDetached(this)) {
                this.liveReloadPending = true;
                return;
            }
            void this.LoadCockpitData();
        });

        this.navigationService.ResourceReattached$.pipe(
            filter((c) => c === this && this.liveReloadPending),
            takeUntil(this.destroy$),
        ).subscribe(() => {
            this.liveReloadPending = false;
            void this.LoadCockpitData();
        });
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Chief of Staff';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-user-tie';
    }

    protected override OnQueryParamsChanged(
        params: Record<string, string>,
        _source: 'popstate' | 'deeplink',
    ): void {
        this.applyQueryParams(params);
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    private applyQueryParams(params: Record<string, string>): void {
        const rawTab = params['tab'] as ChiefOfStaffTab | undefined;
        this.ActiveTab =
            rawTab && VALID_CHIEF_OF_STAFF_TABS.includes(rawTab) ? rawTab : 'overview';

        this.SearchText = params['search'] ?? '';

        const rawHealth = params['health'] as HealthFilter | undefined;
        this.HealthFilter =
            rawHealth && VALID_HEALTH_FILTERS.includes(rawHealth) ? rawHealth : 'all';
    }

    private syncQueryParams(): void {
        if (!this.initialParamsApplied) {
            return;
        }
        this.UpdateQueryParams({
            tab: this.ActiveTab === 'overview' ? null : this.ActiveTab,
            search: this.SearchText.trim().length > 0 ? this.SearchText.trim() : null,
            health: this.HealthFilter === 'all' ? null : this.HealthFilter,
        });
    }

    public async LoadCockpitData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const currentUserId = this.ProviderToUse.CurrentUser?.ID;
            if (!currentUserId) {
                // Every cockpit query is user-scoped; without a user there is nothing safe to show.
                this.showBanner('error', 'No signed-in user is available; the cockpit cannot load.');
                return;
            }

            const chiefOfStaffAgentId = await this.resolveChiefOfStaffAgentId();
            if (!chiefOfStaffAgentId) {
                this.showBanner('error', `The "${CHIEF_OF_STAFF_AGENT_NAME}" agent is not installed in this environment.`);
                return;
            }
            this.chiefOfStaffAgentId = chiefOfStaffAgentId;

            const bizAppsTasksEntity = this.bizAppsTasksEntityInfo;
            const scope = BuildCockpitScopeFilters(currentUserId, chiefOfStaffAgentId);

            const viewParams: RunViewParams[] = [
                {
                    EntityName: 'MJ: AI Agent User Policies',
                    ExtraFilter: scope.Policy,
                    OrderBy: '__mj_UpdatedAt DESC',
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: scope.Routines,
                    OrderBy: 'NextRunAt ASC, Name ASC',
                    ResultType: 'entity_object',
                },
                {
                    EntityName: 'MJ: AI Agent Requests',
                    ExtraFilter: scope.Requests,
                    OrderBy: 'Priority DESC, RequestedAt DESC',
                    MaxRows: 100,
                    ResultType: 'entity_object',
                },
            ];

            const taskScopeFilter = bizAppsTasksEntity
                ? await this.resolveTaskScopeFilter(rv, currentUserId)
                : null;
            if (bizAppsTasksEntity && taskScopeFilter) {
                viewParams.push(this.buildTasksViewParams(bizAppsTasksEntity, taskScopeFilter));
            }

            const results = await rv.RunViews(viewParams);
            const [policyRes, routineRes, requestRes, taskRes] = results;

            const policies = policyRes?.Success
                ? (policyRes.Results as MJAIAgentUserPolicyEntity[])
                : [];
            this.PolicyEntity = policies.length > 0 ? policies[0] : null;
            this.DraftPolicy = this.buildDraftFromEntity(this.PolicyEntity);
            this.PolicyDirty = false;

            this.Routines = routineRes?.Success
                ? (routineRes.Results as MJUserRoutineEntity[])
                : [];

            this.Requests = requestRes?.Success
                ? (requestRes.Results as MJAIAgentRequestEntity[])
                : [];

            if (taskRes && !taskRes.Success) {
                this.showBanner(
                    'error',
                    `Failed to load Priorities & OKRs: ${taskRes.ErrorMessage || 'Unknown error'}`,
                );
            }

            this.Tasks =
                taskRes && taskRes.Success
                    ? (taskRes.Results as BizAppsTaskRecordLike[])
                    : [];
            this.taskAssignees = await this.loadTaskAssignees(rv);

            this.recalculateMetrics();

            // Auto-expand the first priority card if none expanded yet
            if (this.ExpandedPriorityIDs.Size === 0 && this.Metrics.PriorityCards.length > 0) {
                this.ExpandedPriorityIDs.Add(this.Metrics.PriorityCards[0].Task.ID);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to load Chief of Staff data: ${msg}`);
        } finally {
            this.IsLoading = false;
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    private recalculateMetrics(): void {
        const routineSummaries: RoutineSummaryItem[] = this.Routines.map((r) => ({
            ID: r.ID,
            Name: r.Name,
            Status: r.Status,
            ScheduleMode: r.ScheduleMode,
            CronExpression: r.CronExpression,
            NextRunAt: r.NextRunAt,
            LastRunAt: r.LastRunAt,
            LastRunStatus: r.LastRunStatus,
        }));

        const requestSummaries: RequestSummaryItem[] = this.Requests.map((req) => ({
            ID: req.ID,
            Request: req.Request,
            Status: req.Status,
            Priority: req.Priority,
            RequestedAt: req.RequestedAt,
            ExpiresAt: req.ExpiresAt,
            RequestType: req.RequestType,
            RequestTypeID: req.RequestTypeID,
        }));

        this.Metrics = CalculateChiefOfStaffMetrics(
            this.Tasks,
            routineSummaries,
            requestSummaries,
            new Date(),
            { Assignees: this.taskAssignees, CurrentPersonID: this.currentPersonID },
        );
    }

    private createDefaultDraftPolicy(): GovernancePolicyDraft {
        return {
            DisplayNameOverride: 'Chief of Staff',
            Status: 'Active',
            OnboardingStatus: 'Completed',
            CoordinationMode: 'Coordinator',
            DefaultDataAccessMode: 'UserCeiling',
            EmailChannelMode: 'DraftOnly',
            CalendarChannelMode: 'ProposeWithApproval',
            PhoneChannelMode: 'Disabled',
            MessagingChannelMode: 'Enabled',
            AllowInterAgentCoordination: true,
            RequireApprovalForExternalComms: true,
            RequireApprovalForFinancials: true,
            RequireApprovalForDestructiveActions: true,
            AutoApproveAmountThreshold: 0,
            InstructionsOverride: '',
        };
    }

    private buildDraftFromEntity(
        entity: MJAIAgentUserPolicyEntity | null,
    ): GovernancePolicyDraft {
        if (!entity) {
            return this.createDefaultDraftPolicy();
        }
        return {
            DisplayNameOverride: entity.DisplayNameOverride ?? '',
            Status: entity.Status,
            OnboardingStatus: entity.OnboardingStatus,
            CoordinationMode: entity.CoordinationMode,
            DefaultDataAccessMode: entity.DefaultDataAccessMode,
            EmailChannelMode: entity.EmailChannelMode,
            CalendarChannelMode: entity.CalendarChannelMode,
            PhoneChannelMode: entity.PhoneChannelMode,
            MessagingChannelMode: entity.MessagingChannelMode,
            AllowInterAgentCoordination: entity.AllowInterAgentCoordination,
            RequireApprovalForExternalComms: entity.RequireApprovalForExternalComms,
            RequireApprovalForFinancials: entity.RequireApprovalForFinancials,
            RequireApprovalForDestructiveActions: entity.RequireApprovalForDestructiveActions,
            AutoApproveAmountThreshold: entity.AutoApproveAmountThreshold,
            InstructionsOverride: entity.InstructionsOverride ?? '',
        };
    }

    private buildGovernanceSummary(): PolicyGovernanceSummary {
        return {
            HasPolicyRecord: this.PolicyEntity !== null,
            DisplayName: this.ChiefOfStaffDisplayName,
            Status: this.DraftPolicy.Status,
            OnboardingStatus: this.DraftPolicy.OnboardingStatus,
            CoordinationMode: this.DraftPolicy.CoordinationMode,
            DefaultDataAccessMode: this.DraftPolicy.DefaultDataAccessMode,
            EmailChannelMode: this.DraftPolicy.EmailChannelMode,
            CalendarChannelMode: this.DraftPolicy.CalendarChannelMode,
            PhoneChannelMode: this.DraftPolicy.PhoneChannelMode,
            MessagingChannelMode: this.DraftPolicy.MessagingChannelMode,
            AllowInterAgentCoordination: this.DraftPolicy.AllowInterAgentCoordination,
            RequireApprovalForExternalComms: this.DraftPolicy.RequireApprovalForExternalComms,
            RequireApprovalForFinancials: this.DraftPolicy.RequireApprovalForFinancials,
            RequireApprovalForDestructiveActions:
                this.DraftPolicy.RequireApprovalForDestructiveActions,
            AutoApproveAmountThreshold: this.DraftPolicy.AutoApproveAmountThreshold,
        };
    }

    // =========================================================================
    // Tab / Filter / Search Actions
    // =========================================================================

    public OnTabChange(tabId: string): void {
        if (VALID_CHIEF_OF_STAFF_TABS.includes(tabId as ChiefOfStaffTab)) {
            this.ActiveTab = tabId as ChiefOfStaffTab;
            this.syncQueryParams();
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.syncQueryParams();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public OnHealthFilterChange(filterVal: HealthFilter): void {
        this.HealthFilter = filterVal;
        this.syncQueryParams();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public ClearFilters(): void {
        this.SearchText = '';
        this.HealthFilter = 'all';
        this.syncQueryParams();
        this.publishAgentContext();
        this.cdr.markForCheck();
    }

    public TogglePriorityExpanded(taskId: string): void {
        if (this.ExpandedPriorityIDs.Has(taskId)) {
            this.ExpandedPriorityIDs.Delete(taskId);
        } else {
            this.ExpandedPriorityIDs.Add(taskId);
        }
        this.cdr.markForCheck();
    }

    public IsPriorityExpanded(taskId: string): boolean {
        return this.ExpandedPriorityIDs.Has(taskId);
    }

    public get CanOpenFullTaskForm(): boolean {
        if (!this.SelectedTask) return false;
        return !!MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseFormComponent,
            BIZAPPS_TASKS_ENTITY_NAME,
        );
    }

    public get SelectedTaskIsObjective(): boolean {
        if (!this.SelectedTask) return false;
        return !this.SelectedTask.ParentID;
    }

    /** Resolved once per load from the agent's metadata name; null until LoadCockpitData has run. */
    private chiefOfStaffAgentId: string | null = null;

    /**
     * Looks the Chief of Staff agent up by name through the AI engine's cached agents, so the
     * cockpit carries no hardcoded agent id and follows whichever provider it is embedded under.
     */
    private async resolveChiefOfStaffAgentId(): Promise<string | null> {
        const engine = <AIEngineBase>AIEngineBase.GetProviderInstance(this.ProviderToUse, AIEngineBase);
        await engine.EnsureLoaded(this.ProviderToUse.CurrentUser, this.ProviderToUse);
        const agent = engine.GetAgentByName(CHIEF_OF_STAFF_AGENT_NAME);
        return agent?.ID ?? null;
    }

    private get bizAppsTasksEntityInfo(): EntityInfo | undefined {
        return this.ProviderToUse.EntityByName(BIZAPPS_TASKS_ENTITY_NAME);
    }

    /**
     * Builds the primary key for a BizApps task. Tasks is an OpenApp entity, so the key is
     * derived from its metadata rather than assuming a column named `ID`. Returns null (and
     * surfaces an error banner) when the entity is not installed in this environment.
     */
    private taskRecordKey(task: BizAppsTaskRecordLike): CompositeKey | null {
        const entityInfo = this.requireTasksEntityInfo();
        return entityInfo ? BuildTaskRecordKey(entityInfo, task) : null;
    }

    /** For a task id that is not in the loaded list: the bare value maps onto the entity's first key column. */
    private taskRecordKeyFromId(taskId: string): CompositeKey | null {
        const entityInfo = this.requireTasksEntityInfo();
        return entityInfo ? CompositeKey.FromURLSegment(entityInfo, taskId) : null;
    }

    private requireTasksEntityInfo(): EntityInfo | undefined {
        const entityInfo = this.bizAppsTasksEntityInfo;
        if (!entityInfo) {
            this.showBanner('error', 'The BizApps Tasks entity is not available in this environment.');
        }
        return entityInfo;
    }

    public get SelectedTaskSubtasks(): BizAppsTaskRecordLike[] {
        if (!this.SelectedTask) return [];
        const id = this.SelectedTask.ID;
        return this.Tasks.filter((t) => UUIDsEqual(t.ParentID, id));
    }

    public get SelectedTaskParent(): BizAppsTaskRecordLike | null {
        if (!this.SelectedTask || !this.SelectedTask.ParentID) return null;
        const parentId = this.SelectedTask.ParentID;
        return this.Tasks.find((t) => UUIDsEqual(t.ID, parentId)) ?? null;
    }

    public OpenTaskRecord(taskId: string, event?: Event): void {
        event?.stopPropagation();
        const task = this.Tasks.find((t) => UUIDsEqual(t.ID, taskId));
        if (task) {
            this.SelectedTask = task;
            this.DraftTaskEdits = {
                Status: task.Status || 'Open',
                HealthStatus: task.HealthStatus || null,
                PercentComplete: task.PercentComplete ?? 0,
                ConfidenceScore: task.ConfidenceScore ?? null,
                DueAt: task.DueAt ? this.formatDateForInput(task.DueAt) : '',
                Description: task.Description ?? '',
            };
            this.TaskDirty = false;
            this.ShowTaskDrawer = true;
            this.cdr.markForCheck();
        } else {
            const key = this.taskRecordKeyFromId(taskId);
            if (key) {
                this.navigationService.OpenEntityRecord(BIZAPPS_TASKS_ENTITY_NAME, key);
            }
        }
    }

    public CloseTaskDrawer(): void {
        this.ShowTaskDrawer = false;
        this.SelectedTask = null;
        this.TaskDirty = false;
        this.cdr.markForCheck();
    }

    public OpenFullTaskForm(): void {
        if (!this.SelectedTask) return;
        const key = this.taskRecordKey(this.SelectedTask);
        if (key) {
            this.navigationService.OpenEntityRecord(BIZAPPS_TASKS_ENTITY_NAME, key);
        }
    }

    public MarkTaskDirty(): void {
        this.TaskDirty = true;
        this.cdr.markForCheck();
    }

    public OnTaskStatusChange(event: Event): void {
        if (event.target instanceof HTMLSelectElement) {
            this.DraftTaskEdits.Status = event.target.value;
            this.MarkTaskDirty();
        }
    }

    public OnTaskHealthChange(event: Event): void {
        if (event.target instanceof HTMLSelectElement) {
            const val = event.target.value;
            this.DraftTaskEdits.HealthStatus =
                val === 'none' ? null : (val as TaskHealthStatus);
            this.MarkTaskDirty();
        }
    }

    public OnTaskPercentChange(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            const num = Number(event.target.value);
            this.DraftTaskEdits.PercentComplete = Number.isFinite(num)
                ? Math.max(0, Math.min(100, Math.round(num)))
                : null;
            this.MarkTaskDirty();
        }
    }

    public OnTaskConfidenceChange(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            const raw = event.target.value.trim();
            if (!raw) {
                this.DraftTaskEdits.ConfidenceScore = null;
            } else {
                const num = Number(raw);
                this.DraftTaskEdits.ConfidenceScore = Number.isFinite(num)
                    ? Math.max(0, Math.min(100, Math.round(num)))
                    : null;
            }
            this.MarkTaskDirty();
        }
    }

    public OnTaskDueAtChange(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.DraftTaskEdits.DueAt = event.target.value;
            this.MarkTaskDirty();
        }
    }

    public OnTaskDescriptionChange(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
            this.DraftTaskEdits.Description = event.target.value;
            this.MarkTaskDirty();
        }
    }

    private _updateRecordActionId: string | null = null;
    private async resolveUpdateRecordActionId(): Promise<string | null> {
        if (this._updateRecordActionId) {
            return this._updateRecordActionId;
        }
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Actions',
                ExtraFilter: "Name = 'Update Record'",
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            });
            if (result.Success && result.Results && result.Results.length > 0) {
                this._updateRecordActionId = result.Results[0].ID;
                return this._updateRecordActionId;
            }
            return null;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ChiefOfStaffDashboard: failed to resolve 'Update Record' action: ${msg}`);
            return null;
        }
    }

    public async SaveTaskEdits(): Promise<void> {
        if (!this.SelectedTask || this.IsSavingTask) return;
        this.IsSavingTask = true;
        this.cdr.markForCheck();

        try {
            const taskId = this.SelectedTask.ID;
            const key = this.taskRecordKey(this.SelectedTask);
            if (!key) {
                return;
            }

            const actionId = await this.resolveUpdateRecordActionId();
            if (!actionId) {
                throw new Error("Action 'Update Record' not found in metadata.");
            }

            const updates: Record<string, string | number | Date | null> = {
                Status: this.DraftTaskEdits.Status,
                HealthStatus: this.DraftTaskEdits.HealthStatus,
                PercentComplete: this.DraftTaskEdits.PercentComplete,
                ConfidenceScore: this.DraftTaskEdits.ConfidenceScore,
                DueAt: this.DraftTaskEdits.DueAt ? new Date(this.DraftTaskEdits.DueAt) : null,
                Description:
                    this.DraftTaskEdits.Description.trim().length > 0
                        ? this.DraftTaskEdits.Description.trim()
                        : null,
            };

            const primaryKeyObj: Record<string, unknown> = {};
            for (const kvp of key.KeyValuePairs) {
                primaryKeyObj[kvp.FieldName] = kvp.Value;
            }

            const provider = this.ProviderToUse as GraphQLDataProvider;
            const actionClient = new GraphQLActionClient(provider);
            const params: ActionParam[] = [
                { Name: 'EntityName', Value: BIZAPPS_TASKS_ENTITY_NAME, Type: 'Input' } as ActionParam,
                { Name: 'PrimaryKey', Value: primaryKeyObj, Type: 'Input' } as ActionParam,
                { Name: 'Fields', Value: updates, Type: 'Input' } as ActionParam,
            ];

            const result = await actionClient.RunAction(actionId, params);
            if (result.Success) {
                this.showBanner('success', `Task "${this.SelectedTask.Name}" updated successfully.`);
                this.TaskDirty = false;
                await this.LoadCockpitData();
                this.SelectedTask = this.Tasks.find((t) => UUIDsEqual(t.ID, taskId)) ?? null;
            } else {
                const errText = result.Message || 'Failed to update task.';
                this.showBanner('error', errText);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to update task: ${msg}`);
        } finally {
            this.IsSavingTask = false;
            this.cdr.markForCheck();
        }
    }

    private formatDateForInput(val: Date | string): string {
        const d = val instanceof Date ? val : new Date(val);
        if (isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    public OpenPolicyEntityRecord(): void {
        if (this.PolicyEntity) {
            this.navigationService.OpenEntityRecord(
                'MJ: AI Agent User Policies',
                CompositeKey.FromID(this.PolicyEntity.ID),
            );
        }
    }

    // ── Briefings: where a wake routine's replies live ───────────────────────────────────
    //
    // A wake writes its reply into the routine's own conversation, which is application-scoped
    // and therefore never in the chat sidebar. The conversation is created on the routine's first
    // run, so a routine that has not run yet has nothing to open.

    /** True when the routine has run at least once and so has a conversation to read. */
    public CanOpenBriefing(routine: MJUserRoutineEntity): boolean {
        return !!routine.ConversationID;
    }

    /**
     * Opens the routine's conversation in the Chat app. The ID goes in the query params as well
     * as the nav item configuration: an already-open Chat tab is reused and reacts only to a
     * query-param change.
     */
    public OpenRoutineBriefing(routine: MJUserRoutineEntity, event?: Event): void {
        event?.stopPropagation();
        const conversationId = routine.ConversationID;
        if (!conversationId) {
            return;
        }
        const chatApp = this.appManager.GetAppByName('Chat');
        if (!chatApp) {
            MJNotificationService.Instance.CreateSimpleNotification('The Chat app is not installed, so this briefing cannot be opened there', 'error', 4000);
            return;
        }
        void this.navigationService.OpenNavItemByName(
            'Conversations',
            { conversationId },
            chatApp.ID,
            { queryParams: { conversationId } },
        );
    }

    /** Opens the slide-in reader on the routine's conversation without leaving the cockpit. */
    public async OpenBriefingReader(routine: MJUserRoutineEntity, event?: Event): Promise<void> {
        event?.stopPropagation();
        const conversationId = routine.ConversationID;
        if (!conversationId) {
            return;
        }
        this.BriefingRoutine = routine;
        this.BriefingConversationId = conversationId;
        this.BriefingConversation = await this.loadBriefingConversation(conversationId);
        this.cdr.markForCheck();
    }

    public CloseBriefingReader(): void {
        this.BriefingRoutine = null;
        this.BriefingConversationId = null;
        this.BriefingConversation = null;
        this.cdr.markForCheck();
    }

    public get IsBriefingReaderOpen(): boolean {
        return this.BriefingConversationId != null;
    }

    /** The environment the embedded chat area reads under. */
    public get BriefingEnvironmentId(): string {
        return this.BriefingConversation?.EnvironmentID ?? MJEnvironmentEntityExtended.DefaultEnvironmentID;
    }

    /** The application the routine conversation is filed under, so the chat area stays in that scope. */
    public get BriefingApplicationId(): string | null {
        return this.BriefingConversation?.ApplicationID ?? null;
    }

    /** The conversation entity, or null when it cannot be read; the reader still works by ID. */
    private async loadBriefingConversation(conversationId: string): Promise<MJConversationEntity | null> {
        const p = this.ProviderToUse;
        const conversation = await p.GetEntityObject<MJConversationEntity>('MJ: Conversations', p.CurrentUser);
        return await conversation.Load(conversationId) ? conversation : null;
    }

    public OpenRoutineEntityRecord(routineId: string, event?: Event): void {
        event?.stopPropagation();
        this.navigationService.OpenEntityRecord(
            'MJ: User Routines',
            CompositeKey.FromID(routineId),
        );
    }

    // =========================================================================
    // Approvals & Requests Actions
    // =========================================================================

    public OpenRequestDetail(request: MJAIAgentRequestEntity): void {
        this.SelectedRequest = request;
        this.ShowRequestDialog = true;
        this.cdr.markForCheck();
    }

    public OnRequestDialogClose(result: AgentRequestPanelResult): void {
        this.ShowRequestDialog = false;
        this.SelectedRequest = null;
        if (result.Success) {
            void this.LoadCockpitData();
        } else {
            this.cdr.markForCheck();
        }
    }

    public async QuickRespondToRequest(
        request: MJAIAgentRequestEntity,
        decision: 'Approved' | 'Rejected',
        event: Event,
    ): Promise<void> {
        event.stopPropagation();
        if (this.BusyRequestID) {
            return;
        }
        this.BusyRequestID = request.ID;
        this.cdr.markForCheck();

        try {
            const currentUserId = this.ProviderToUse.CurrentUser?.ID ?? null;
            request.Status = decision;
            request.RespondedAt = new Date();
            request.ResponseSource = 'Dashboard';
            if (currentUserId) {
                request.ResponseByUserID = currentUserId;
            }
            request.Response = `${decision} via Chief of Staff Executive Cockpit`;

            const saved = await request.Save();
            if (saved) {
                this.showBanner('success', `Request marked as ${decision}.`);
                this.recalculateMetrics();
                this.publishAgentContext();
            } else {
                const errText =
                    request.LatestResult?.CompleteMessage ?? 'Failed to save request decision.';
                this.showBanner('error', errText);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to update request: ${msg}`);
        } finally {
            this.BusyRequestID = null;
            this.cdr.markForCheck();
        }
    }

    // =========================================================================
    // Wake Routines Actions
    // =========================================================================

    public async TriggerWakeNow(routine: MJUserRoutineEntity, event?: Event): Promise<void> {
        event?.stopPropagation();
        if (this.BusyRoutineID) {
            return;
        }
        this.BusyRoutineID = routine.ID;
        this.cdr.markForCheck();

        try {
            routine.Status = 'Active';
            routine.NextRunAt = new Date();
            const saved = await routine.Save();
            if (saved) {
                this.showBanner(
                    'success',
                    `Scheduled immediate wake for "${routine.Name}". The User Routine Scheduler will dispatch it on its next tick.`,
                );
                this.recalculateMetrics();
                this.publishAgentContext();
            } else {
                const errText =
                    routine.LatestResult?.CompleteMessage ?? 'Failed to schedule immediate wake.';
                this.showBanner('error', errText);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to trigger wake: ${msg}`);
        } finally {
            this.BusyRoutineID = null;
            this.cdr.markForCheck();
        }
    }

    public async ToggleRoutineStatus(routine: MJUserRoutineEntity, event?: Event): Promise<void> {
        event?.stopPropagation();
        if (this.BusyRoutineID) {
            return;
        }
        this.BusyRoutineID = routine.ID;
        this.cdr.markForCheck();

        try {
            const nextStatus: MJUserRoutineEntity['Status'] =
                routine.Status === 'Active' ? 'Paused' : 'Active';
            routine.Status = nextStatus;
            const saved = await routine.Save();
            if (saved) {
                this.showBanner(
                    'success',
                    `Routine "${routine.Name}" is now ${nextStatus}.`,
                );
                this.recalculateMetrics();
                this.publishAgentContext();
            } else {
                const errText =
                    routine.LatestResult?.CompleteMessage ?? 'Failed to update routine status.';
                this.showBanner('error', errText);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to update routine: ${msg}`);
        } finally {
            this.BusyRoutineID = null;
            this.cdr.markForCheck();
        }
    }

    // =========================================================================
    // Governance Policy Quick-Toggles & Save
    // =========================================================================

    public MarkPolicyDirty(): void {
        this.PolicyDirty = true;
        this.cdr.markForCheck();
    }

    public SetCoordinationMode(mode: PolicyCoordinationModeValue): void {
        this.DraftPolicy.CoordinationMode = mode;
        this.PolicyDirty = true;
        this.cdr.markForCheck();
    }

    public SetPolicyStatus(status: PolicyStatusValue): void {
        this.DraftPolicy.Status = status;
        this.PolicyDirty = true;
        this.cdr.markForCheck();
    }

    public ToggleApprovalGuardrail(
        field:
            | 'AllowInterAgentCoordination'
            | 'RequireApprovalForExternalComms'
            | 'RequireApprovalForFinancials'
            | 'RequireApprovalForDestructiveActions',
    ): void {
        this.DraftPolicy[field] = !this.DraftPolicy[field];
        this.PolicyDirty = true;
        this.cdr.markForCheck();
    }

    public OnDisplayNameInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.DraftPolicy.DisplayNameOverride = event.target.value;
            this.MarkPolicyDirty();
        }
    }

    public OnThresholdInputEvent(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
            this.OnThresholdInput(event.target.value);
        }
    }

    public OnInstructionsOverrideInput(event: Event): void {
        if (event.target instanceof HTMLTextAreaElement) {
            this.DraftPolicy.InstructionsOverride = event.target.value;
            this.MarkPolicyDirty();
        }
    }

    public OnThresholdInput(rawValue: string): void {
        const trimmed = rawValue.trim();
        if (!trimmed) {
            this.DraftPolicy.AutoApproveAmountThreshold = null;
        } else {
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed) && parsed >= 0) {
                this.DraftPolicy.AutoApproveAmountThreshold = parsed;
            }
        }
        this.PolicyDirty = true;
        this.cdr.markForCheck();
    }

    public ResetDraftPolicy(): void {
        this.DraftPolicy = this.buildDraftFromEntity(this.PolicyEntity);
        this.PolicyDirty = false;
        this.cdr.markForCheck();
    }

    public async SaveGovernancePolicy(): Promise<void> {
        if (this.IsSavingPolicy) {
            return;
        }
        this.IsSavingPolicy = true;
        this.cdr.markForCheck();

        try {
            let entity = this.PolicyEntity;
            if (!entity) {
                entity = await this.ProviderToUse.GetEntityObject<MJAIAgentUserPolicyEntity>(
                    'MJ: AI Agent User Policies',
                    this.ProviderToUse.CurrentUser,
                );
                entity.NewRecord();
                if (!this.chiefOfStaffAgentId) {
                    throw new Error(`The "${CHIEF_OF_STAFF_AGENT_NAME}" agent id has not been resolved; reload the cockpit.`);
                }
                entity.AgentID = this.chiefOfStaffAgentId;
                const currentUserId = this.ProviderToUse.CurrentUser?.ID;
                if (currentUserId) {
                    entity.UserID = currentUserId;
                }
            }

            entity.DisplayNameOverride =
                this.DraftPolicy.DisplayNameOverride.trim().length > 0
                    ? this.DraftPolicy.DisplayNameOverride.trim()
                    : null;
            entity.Status = this.DraftPolicy.Status;
            entity.OnboardingStatus = this.DraftPolicy.OnboardingStatus;
            entity.CoordinationMode = this.DraftPolicy.CoordinationMode;
            entity.DefaultDataAccessMode = this.DraftPolicy.DefaultDataAccessMode;
            entity.EmailChannelMode = this.DraftPolicy.EmailChannelMode;
            entity.CalendarChannelMode = this.DraftPolicy.CalendarChannelMode;
            entity.PhoneChannelMode = this.DraftPolicy.PhoneChannelMode;
            entity.MessagingChannelMode = this.DraftPolicy.MessagingChannelMode;
            entity.AllowInterAgentCoordination = this.DraftPolicy.AllowInterAgentCoordination;
            entity.RequireApprovalForExternalComms =
                this.DraftPolicy.RequireApprovalForExternalComms;
            entity.RequireApprovalForFinancials = this.DraftPolicy.RequireApprovalForFinancials;
            entity.RequireApprovalForDestructiveActions =
                this.DraftPolicy.RequireApprovalForDestructiveActions;
            entity.AutoApproveAmountThreshold = this.DraftPolicy.AutoApproveAmountThreshold;
            entity.InstructionsOverride =
                this.DraftPolicy.InstructionsOverride.trim().length > 0
                    ? this.DraftPolicy.InstructionsOverride.trim()
                    : null;

            const saved = await entity.Save();
            if (saved) {
                this.PolicyEntity = entity;
                this.DraftPolicy = this.buildDraftFromEntity(entity);
                this.PolicyDirty = false;
                this.showBanner('success', 'Chief of Staff governance policy saved.');
                this.publishAgentContext();
            } else {
                const errText =
                    entity.LatestResult?.CompleteMessage ?? 'Failed to save governance policy.';
                this.showBanner('error', errText);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to save governance policy: ${msg}`);
        } finally {
            this.IsSavingPolicy = false;
            this.cdr.markForCheck();
        }
    }

    public DismissBanner(): void {
        this.FeedbackBanner = null;
        this.cdr.markForCheck();
    }

    /** True when `personID` is the signed-in user's People record. */
    public IsCurrentPerson(personID: string): boolean {
        return !!this.currentPersonID && UUIDsEqual(personID, this.currentPersonID);
    }

    /** Assignees of the loaded tasks; an empty map when the BizApps Common app is absent or the lookup fails (the cards still render). */
    private async loadTaskAssignees(rv: RunView): Promise<TaskAssigneeMap> {
        const peopleEntity = this.ProviderToUse.EntityByName(BIZAPPS_PEOPLE_ENTITY_NAME);
        if (!peopleEntity || this.Tasks.length === 0) {
            return new UUIDMap();
        }
        try {
            return await LoadTaskAssignees(rv, peopleEntity.ID, this.Tasks.map((t) => t.ID));
        } catch (err) {
            LogError(`Chief of Staff cockpit: could not load task assignees: ${err instanceof Error ? err.message : String(err)}`);
            return new UUIDMap();
        }
    }

    /**
     * Resolve the filter scoping Tasks to the signed-in user's linked person. Returns null (and clears
     * `HasLinkedPerson`) when no person is linked, or when the lookup fails after surfacing the error.
     */
    private async resolveTaskScopeFilter(rv: RunView, currentUserId: string): Promise<string | null> {
        const peopleEntity = this.ProviderToUse.EntityByName(BIZAPPS_PEOPLE_ENTITY_NAME);
        if (!peopleEntity) {
            // The BizApps Common OpenApp is not installed, so no person can be linked.
            this.HasLinkedPerson = false;
            return null;
        }
        try {
            const scope = await ResolvePersonTaskScope(rv, currentUserId, peopleEntity.ID, this.ProviderToUse.CurrentUser?.Email ?? null);
            this.HasLinkedPerson = scope.HasLinkedPerson;
            this.currentPersonID = scope.HasLinkedPerson ? scope.PersonID : null;
            return scope.HasLinkedPerson ? scope.Filter : null;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to resolve your People record for Priorities & OKRs: ${msg}`);
            return null;
        }
    }

    private buildTasksViewParams(tasksEntity: EntityInfo, extraFilter: string): RunViewParams {
        const fieldNames = new Set((tasksEntity.Fields ?? []).map((f) => f.Name.toLowerCase()));
        const orderParts: string[] = [];
        if (fieldNames.has('ispriority')) {
            orderParts.push('IsPriority DESC');
        }
        if (fieldNames.has('dueat')) {
            orderParts.push('DueAt ASC');
        }
        if (fieldNames.has('name')) {
            orderParts.push('Name ASC');
        }
        return {
            EntityName: BIZAPPS_TASKS_ENTITY_NAME,
            ExtraFilter: extraFilter,
            OrderBy: orderParts.length > 0 ? orderParts.join(', ') : 'DueAt ASC, Name ASC',
            MaxRows: 250,
            ResultType: 'simple',
        };
    }

    /** Badge class for a task's `Priority` (Critical/High/Medium/Low). */
    public GetTaskPriorityClass(priority: string | null): string {
        return GetTaskPriorityClass(priority);
    }

    private showBanner(type: 'success' | 'error', message: string): void {
        this.FeedbackBanner = { Type: type, Message: message };
        this.cdr.markForCheck();
    }

    // =========================================================================
    // UI Formatting Helpers
    // =========================================================================

    public GetHealthBadgeLabel(health: TaskHealthStatus): string {
        switch (health) {
            case 'OnTrack':
                return 'On Track';
            case 'AtRisk':
                return 'At Risk';
            case 'OffTrack':
                return 'Off Track';
            case 'Completed':
                return 'Completed';
            case 'Paused':
                return 'Paused';
            default:
                return health;
        }
    }

    public GetHealthBadgeIcon(health: TaskHealthStatus): string {
        switch (health) {
            case 'OnTrack':
                return 'fa-solid fa-circle-check';
            case 'AtRisk':
                return 'fa-solid fa-triangle-exclamation';
            case 'OffTrack':
                return 'fa-solid fa-circle-exclamation';
            case 'Completed':
                return 'fa-solid fa-flag-checkered';
            case 'Paused':
                return 'fa-solid fa-circle-pause';
            default:
                return 'fa-solid fa-circle';
        }
    }

    public GetPriorityTierLabel(priority: number): string {
        if (priority >= 76) return 'Critical';
        if (priority >= 51) return 'High';
        if (priority >= 26) return 'Normal';
        return 'Low';
    }

    public GetPriorityTierClass(priority: number): string {
        if (priority >= 76) return 'priority-critical';
        if (priority >= 51) return 'priority-high';
        if (priority >= 26) return 'priority-normal';
        return 'priority-low';
    }

    public IsRequestExpired(request: MJAIAgentRequestEntity): boolean {
        if (!request.ExpiresAt) return false;
        const expires =
            request.ExpiresAt instanceof Date ? request.ExpiresAt : new Date(request.ExpiresAt);
        return expires.getTime() < Date.now();
    }

    // =========================================================================
    // Agent Context & Client Tools Wiring
    // =========================================================================

    private publishAgentContext(): void {
        if (this.navigationService.IsResourceDetached(this)) {
            return;
        }
        const routineSummaries: RoutineSummaryItem[] = this.Routines.map((r) => ({
            ID: r.ID,
            Name: r.Name,
            Status: r.Status,
            ScheduleMode: r.ScheduleMode,
            CronExpression: r.CronExpression,
            NextRunAt: r.NextRunAt,
            LastRunAt: r.LastRunAt,
            LastRunStatus: r.LastRunStatus,
        }));
        const pendingSummaries: RequestSummaryItem[] = this.PendingRequests.map((req) => ({
            ID: req.ID,
            Request: req.Request,
            Status: req.Status,
            Priority: req.Priority,
            RequestedAt: req.RequestedAt,
            ExpiresAt: req.ExpiresAt,
        }));

        const context = BuildChiefOfStaffAgentContext({
            ActiveTab: this.ActiveTab,
            SearchText: this.SearchText,
            HealthFilter: this.HealthFilter,
            Metrics: this.Metrics,
            Governance: this.buildGovernanceSummary(),
            Routines: routineSummaries,
            PendingRequests: pendingSummaries,
        });

        this.navigationService.SetAgentContext(this, context);
    }

    private registerAgentTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'SwitchChiefOfStaffTab',
                Description:
                    "Switch the active tab in the Chief of Staff Cockpit ('overview', 'priorities', 'approvals-wakes', or 'governance').",
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        tab: {
                            type: 'string',
                            enum: VALID_CHIEF_OF_STAFF_TABS,
                            description: 'Target tab ID',
                        },
                    },
                    required: ['tab'],
                },
                Handler: async (params) => {
                    const raw = params['tab'] as string | undefined;
                    const check = ValidateChiefOfStaffTabParam(raw);
                    if (!check.ok) {
                        return check.result;
                    }
                    this.OnTabChange(check.value);
                    return { Success: true, Data: { ActiveTab: this.ActiveTab } };
                },
            },
            {
                Name: 'FilterPrioritiesByHealth',
                Description:
                    "Filter priority objectives by health status ('all', 'OnTrack', 'AtRisk', 'OffTrack', 'Completed', 'Paused').",
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        health: {
                            type: 'string',
                            enum: VALID_HEALTH_FILTERS,
                            description: 'Health status filter',
                        },
                    },
                    required: ['health'],
                },
                Handler: async (params) => {
                    const raw = params['health'] as string | undefined;
                    const check = ValidateHealthFilterParam(raw);
                    if (!check.ok) {
                        return check.result;
                    }
                    this.OnHealthFilterChange(check.value);
                    if (this.ActiveTab !== 'priorities') {
                        this.OnTabChange('priorities');
                    }
                    return {
                        Success: true,
                        Data: {
                            HealthFilter: this.HealthFilter,
                            FilteredPriorityCount: this.FilteredPriorityCards.length,
                        },
                    };
                },
            },
            {
                Name: 'SearchChiefOfStaffCockpit',
                Description:
                    'Filter visible priority objectives, requests, and wake routines by search text. Pass empty string to clear.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search text; empty string clears.',
                        },
                    },
                    required: ['query'],
                },
                Handler: async (params) => {
                    const raw = params['query'] as string | undefined;
                    const check = ValidateSearchQueryParam(raw);
                    if (!check.ok) {
                        return check.result;
                    }
                    this.OnSearchChange(check.value);
                    return {
                        Success: true,
                        Data: {
                            SearchText: this.SearchText,
                            FilteredPriorityCount: this.FilteredPriorityCards.length,
                        },
                    };
                },
            },
            {
                Name: 'InspectPriorityObjective',
                Description:
                    'Expand and focus a priority objective card by ID or name in the Priorities & OKRs tab.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        objective: {
                            type: 'string',
                            description: 'Priority objective ID or name (partial match supported)',
                        },
                    },
                    required: ['objective'],
                },
                Handler: async (params) => {
                    const raw = params['objective'] as string | undefined;
                    const resolved = ResolvePriorityObjectiveByIDOrName(
                        this.Metrics.PriorityCards,
                        raw,
                    );
                    if (!resolved.ok) {
                        return { Success: false, ErrorMessage: resolved.error };
                    }
                    this.ExpandedPriorityIDs.Add(resolved.value.Task.ID);
                    this.OnTabChange('priorities');
                    return {
                        Success: true,
                        Data: {
                            TaskID: resolved.value.Task.ID,
                            Name: resolved.value.Task.Name,
                            SubtaskCount: resolved.value.Subtasks.length,
                            EffectivePercentComplete: resolved.value.EffectivePercentComplete,
                        },
                    };
                },
            },
            {
                Name: 'RefreshChiefOfStaffCockpit',
                Description:
                    'Reload priority objectives, pending approvals, wake routines, and governance policy from the server.',
                ParameterSchema: {
                    type: 'object',
                    properties: {},
                },
                Handler: async () => {
                    await this.LoadCockpitData();
                    return {
                        Success: true,
                        Data: {
                            PriorityObjectiveCount: this.Metrics.PriorityObjectiveCount,
                            PendingApprovalCount: this.Metrics.PendingApprovalCount,
                            ActiveWakeRoutineCount: this.Metrics.ActiveWakeRoutineCount,
                        },
                    };
                },
            },
        ]);
    }
}

export function LoadChiefOfStaffDashboard(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
