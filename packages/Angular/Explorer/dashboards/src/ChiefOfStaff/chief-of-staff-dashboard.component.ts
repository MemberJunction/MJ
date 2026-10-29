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
import { CompositeKey, LogError, RunView, RunViewParams } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJConversationEntity,
    MJEnvironmentEntityExtended,
    MJUserRoutineEntity,
    ResourceData,
} from '@memberjunction/core-entities';
import { RegisterClass, UUIDMap, MJGlobal, EscapeSQLString } from '@memberjunction/global';
import { ActionParam } from '@memberjunction/actions-base';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AgentRequestPanelResult } from '@memberjunction/ng-agent-requests';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    AgentContextRecord,
    BuildChiefOfStaffAgentContext,
    BuildCockpitScopeFilters,
    CalculateChiefOfStaffMetrics,
    CHIEF_OF_STAFF_AGENT_NAME,
    ChiefOfStaffMetrics,
    ChiefOfStaffTab,
    CORE_CHIEF_OF_STAFF_TABS,
    IsApprovalRequest,
    PolicyCalendarChannelModeValue,
    PolicyCoordinationModeValue,
    PolicyDataAccessModeValue,
    PolicyEmailChannelModeValue,
    PolicyGovernanceSummary,
    PolicyMessagingChannelModeValue,
    PolicyPhoneChannelModeValue,
    PolicyStatusValue,
    RequestSummaryItem,
    RoutineSummaryItem,
    IsSpentOneShotRoutine,
    ParseEmailApprovalPayload,
    FormatEmailDraftForClipboard,
    type EmailApprovalDraft,
    RoutineDisplayStatus,
    SortRoutinesForDisplay,
    type RoutineDisplayStatusValue,
    ValidateChiefOfStaffTabParam,
    ValidateSearchQueryParam,
} from './chief-of-staff-agent-context';
import {
    ChiefOfStaffPanelContext,
    ChiefOfStaffPanelRegistration,
    CollectChiefOfStaffPanels,
} from './chief-of-staff-panel';
import { IsCockpitEntityChange } from './chief-of-staff-live-refresh';


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

    public PolicyEntity: MJAIAgentUserPolicyEntity | null = null;
    public DraftPolicy: GovernancePolicyDraft = this.createDefaultDraftPolicy();
    public PolicyDirty = false;

    public Routines: MJUserRoutineEntity[] = [];
    public Requests: MJAIAgentRequestEntity[] = [];
    public Metrics: ChiefOfStaffMetrics = CalculateChiefOfStaffMetrics([], []);

    public SelectedRequest: MJAIAgentRequestEntity | null = null;
    public ShowRequestDialog = false;


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

    // ── Extension panels: Open Apps add tabs and Overview panels by registering a BaseChiefOfStaffPanel ──
    /** Every registered extension panel, collected once when the cockpit is created. */
    public readonly Panels: readonly ChiefOfStaffPanelRegistration[] = CollectChiefOfStaffPanels();
    /** Increments on each reload; panels reload when it changes. */
    private refreshToken = 0;
    /** The latest agent-context fields each panel reported, keyed by panel key. */
    private readonly panelAgentContext = new Map<string, AgentContextRecord>();
    /** The context object handed to every panel; replaced (not mutated) so panel inputs see the change. */
    public PanelContext: ChiefOfStaffPanelContext = this.buildPanelContext();

    public get TabPanels(): readonly ChiefOfStaffPanelRegistration[] {
        return this.Panels.filter((p) => p.Metadata.placement === 'tab');
    }

    public get OverviewPanels(): readonly ChiefOfStaffPanelRegistration[] {
        return this.Panels.filter((p) => p.Metadata.placement === 'overview');
    }

    /** The registered extension tab shown now, or null on a core tab. */
    public get ActiveTabPanel(): ChiefOfStaffPanelRegistration | null {
        return this.TabPanels.find((p) => p.Metadata.panelKey === this.ActiveTab) ?? null;
    }

    /** Core tab keys plus every registered extension tab key. */
    public get ValidTabs(): string[] {
        return [...CORE_CHIEF_OF_STAFF_TABS, ...this.TabPanels.map((p) => p.Metadata.panelKey)];
    }

    /** Entities the registered panels want live reloads for. */
    private get panelLiveEntities(): string[] {
        return this.Panels.flatMap((p) => p.Metadata.liveEntities ?? []);
    }

    private buildPanelContext(): ChiefOfStaffPanelContext {
        return {
            RefreshToken: this.refreshToken,
            SearchText: this.SearchText,
            AgentID: this.chiefOfStaffAgentId ?? null,
            ReportAgentContext: (panelKey, fields) => {
                this.panelAgentContext.set(panelKey, fields);
                this.publishAgentContext();
            },
            ShowBanner: (type, message) => this.showBanner(type, message),
        };
    }

    /** Hands the panels a fresh context; `reload` also bumps the refresh token so they reload. */
    private refreshPanelContext(reload: boolean): void {
        if (reload) {
            this.refreshToken++;
        }
        this.PanelContext = this.buildPanelContext();
    }

    public get Tabs(): TabConfig[] {
        const core: TabConfig[] = [
            { key: 'overview', label: 'Overview', icon: 'fa-solid fa-compass' },
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
        const extensionTabs: TabConfig[] = this.TabPanels.map((p) => ({
            key: p.Metadata.panelKey,
            label: p.Metadata.label,
            icon: p.Metadata.icon ?? 'fa-solid fa-puzzle-piece',
        }));
        // Extension tabs sit after Overview, before the core work tabs.
        return [core[0], ...extensionTabs, ...core.slice(1)];
    }

    public get ChiefOfStaffDisplayName(): string {
        const override = this.DraftPolicy.DisplayNameOverride.trim();
        return override.length > 0 ? override : 'My Chief of Staff';
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

    /** When true, the wake schedule also lists spent one-shots (reminders that have fired). Off by default. */
    public ShowFiredRoutines = false;

    /** Routines in display order: next wake first, unscheduled next, spent one-shots last. */
    public get SortedRoutines(): MJUserRoutineEntity[] {
        return SortRoutinesForDisplay(this.Routines);
    }

    /** Routines that still have something ahead of them: everything but spent one-shots. */
    public get UpcomingRoutines(): MJUserRoutineEntity[] {
        return this.SortedRoutines.filter((r) => !IsSpentOneShotRoutine(r));
    }

    /** Spent one-shots: reminders and one-time wakes that have already fired. */
    public get FiredRoutineCount(): number {
        return this.Routines.filter((r) => IsSpentOneShotRoutine(r)).length;
    }

    public get FilteredRoutines(): MJUserRoutineEntity[] {
        const search = this.SearchText.trim().toLowerCase();
        const base = this.ShowFiredRoutines ? this.SortedRoutines : this.UpcomingRoutines;
        if (!search) {
            return base;
        }
        return base.filter(
            (r) =>
                r.Name.toLowerCase().includes(search) ||
                (r.Description ?? '').toLowerCase().includes(search),
        );
    }

    /** 'Fired' for a spent one-shot, otherwise the routine's Status. */
    public RoutineStatusLabel(routine: MJUserRoutineEntity): RoutineDisplayStatusValue {
        return RoutineDisplayStatus(routine);
    }

    public IsSpentRoutine(routine: MJUserRoutineEntity): boolean {
        return IsSpentOneShotRoutine(routine);
    }

    public ToggleShowFiredRoutines(): void {
        this.ShowFiredRoutines = !this.ShowFiredRoutines;
        this.cdr.markForCheck();
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
            filter((event) => IsCockpitEntityChange(event, this.panelLiveEntities)),
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
        const rawTab = params['tab'];
        this.ActiveTab = rawTab && this.ValidTabs.includes(rawTab) ? rawTab : 'overview';

        this.SearchText = params['search'] ?? '';
        this.refreshPanelContext(false);
    }

    private syncQueryParams(): void {
        if (!this.initialParamsApplied) {
            return;
        }
        this.UpdateQueryParams({
            tab: this.ActiveTab === 'overview' ? null : this.ActiveTab,
            search: this.SearchText.trim().length > 0 ? this.SearchText.trim() : null,
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

            const results = await rv.RunViews(viewParams);
            const [policyRes, routineRes, requestRes] = results;

            const policies = policyRes?.Success
                ? (policyRes.Results as MJAIAgentUserPolicyEntity[])
                : [];
            this.PolicyEntity = policies.length > 0 ? policies[0] : null;
            this.DraftPolicy = this.buildDraftFromEntity(this.PolicyEntity);
            this.PolicyDirty = false;

            this.Routines = routineRes?.Success
                ? (routineRes.Results as MJUserRoutineEntity[])
                : [];

            this.emailDraftsByRequest.Clear();
            this.Requests = requestRes?.Success
                ? (requestRes.Results as MJAIAgentRequestEntity[])
                : [];

            this.recalculateMetrics();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to load Chief of Staff data: ${msg}`);
        } finally {
            this.IsLoading = false;
            this.refreshPanelContext(true);
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

        this.Metrics = CalculateChiefOfStaffMetrics(routineSummaries, requestSummaries);
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
        if (this.ValidTabs.includes(tabId)) {
            this.ActiveTab = tabId;
            this.syncQueryParams();
            this.publishAgentContext();
            this.cdr.markForCheck();
        }
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.refreshPanelContext(false);
        this.syncQueryParams();
        this.publishAgentContext();
        this.cdr.markForCheck();
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

    private readonly actionIdsByName = new Map<string, string>();
    /** The ID of a core action, looked up by name once per cockpit instance. */
    private async resolveActionIdByName(actionName: string): Promise<string | null> {
        const cached = this.actionIdsByName.get(actionName);
        if (cached) {
            return cached;
        }
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Actions',
                ExtraFilter: `Name = '${EscapeSQLString(actionName)}'`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            });
            if (result.Success && result.Results && result.Results.length > 0) {
                this.actionIdsByName.set(actionName, result.Results[0].ID);
                return result.Results[0].ID;
            }
            return null;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ChiefOfStaffDashboard: failed to resolve '${actionName}' action: ${msg}`);
            return null;
        }
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

    private readonly emailDraftsByRequest = new UUIDMap<EmailApprovalDraft | null>();

    /** The outbound email an approval request carries, or null when the request is not an email. */
    public EmailDraftFor(request: MJAIAgentRequestEntity): EmailApprovalDraft | null {
        const cached = this.emailDraftsByRequest.Get(request.ID);
        if (cached !== undefined) {
            return cached;
        }
        const draft = ParseEmailApprovalPayload(request.Comments);
        this.emailDraftsByRequest.Set(request.ID, draft);
        return draft;
    }

    /** Copies the draft as plain text (headers, blank line, body) for pasting into a mail client. */
    public async CopyEmailDraft(request: MJAIAgentRequestEntity, event?: Event): Promise<void> {
        event?.stopPropagation();
        const draft = this.EmailDraftFor(request);
        if (!draft) {
            return;
        }
        const text = FormatEmailDraftForClipboard(draft);
        try {
            await navigator.clipboard.writeText(text);
            this.showBanner('success', `Copied the email to ${draft.To} to the clipboard.`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Could not copy to the clipboard: ${msg}`);
        }
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
            // Run the routine out of schedule. Setting NextRunAt to now would make the dispatcher
            // CLAIM it, and a claimed one-shot (a reminder) is spent: it fires now and never again.
            // The action runs it without touching the schedule; the run row and the routine's
            // conversation then update through the live refresh.
            const actionId = await this.resolveActionIdByName('Run User Routine Now');
            if (!actionId) {
                this.showBanner('error', "The 'Run User Routine Now' action is not installed; push metadata/actions and restart MJAPI.");
                return;
            }
            const actionClient = new GraphQLActionClient(this.ProviderToUse as GraphQLDataProvider);
            const result = await actionClient.RunAction(actionId, [
                { Name: 'RoutineID', Value: routine.ID, Type: 'Input' } as ActionParam,
            ]);
            if (result.Success) {
                const keeps = routine.NextRunAt ? ' Its scheduled wake is unchanged.' : '';
                this.showBanner('success', `Running "${routine.Name}" now. The result lands in its conversation and a notification.${keeps}`);
            } else {
                this.showBanner('error', result.Message || `Could not run "${routine.Name}".`);
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

    private showBanner(type: 'success' | 'error', message: string): void {
        this.FeedbackBanner = { Type: type, Message: message };
        this.cdr.markForCheck();
    }

    // =========================================================================
    // UI Formatting Helpers
    // =========================================================================

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

        const extensionContext: AgentContextRecord = {};
        for (const fields of this.panelAgentContext.values()) {
            Object.assign(extensionContext, fields);
        }
        const context = BuildChiefOfStaffAgentContext({
            ActiveTab: this.ActiveTab,
            SearchText: this.SearchText,
            ExtensionContext: extensionContext,
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
                    "Switch the active tab in the Chief of Staff Cockpit ('overview', 'approvals-wakes', 'governance', or a tab added by an installed extension).",
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        tab: {
                            type: 'string',
                            enum: this.ValidTabs,
                            description: 'Target tab ID',
                        },
                    },
                    required: ['tab'],
                },
                Handler: async (params) => {
                    const raw = params['tab'] as string | undefined;
                    const check = ValidateChiefOfStaffTabParam(raw, this.ValidTabs);
                    if (!check.ok) {
                        return check.result;
                    }
                    this.OnTabChange(check.value);
                    return { Success: true, Data: { ActiveTab: this.ActiveTab } };
                },
            },
            {
                Name: 'SearchChiefOfStaffCockpit',
                Description:
                    'Filter visible requests and wake routines (and extension panels that filter) by search text. Pass empty string to clear.',
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
                            PendingRequestCount: this.PendingRequests.length,
                            VisibleRoutineCount: this.FilteredRoutines.length,
                        },
                    };
                },
            },
            {
                Name: 'RefreshChiefOfStaffCockpit',
                Description:
                    'Reload pending approvals, wake routines, governance policy and extension panels from the server.',
                ParameterSchema: {
                    type: 'object',
                    properties: {},
                },
                Handler: async () => {
                    await this.LoadCockpitData();
                    return {
                        Success: true,
                        Data: {
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
