import { ChangeDetectorRef, Directive, OnDestroy, OnInit, inject } from '@angular/core';
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
import { UUIDMap, MJGlobal, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { ActionParam } from '@memberjunction/actions-base';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { AgentRequestPanelResult } from '@memberjunction/ng-agent-requests';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    AgentDisplayName,
    BuildChiefOfStaffAgentContext,
    BuildChiefOfStaffScopeFilters,
    BuildGovernanceSummary,
    BuildPolicyDraftFromEntity,
    CalculateChiefOfStaffMetrics,
    CHIEF_OF_STAFF_AGENT_NAME,
    CHIEF_OF_STAFF_APP_NAME,
    CHIEF_OF_STAFF_PAGE_ICONS,
    CHIEF_OF_STAFF_PAGE_LABELS,
    CHIEF_OF_STAFF_PAGES,
    ChiefOfStaffMetrics,
    ChiefOfStaffPage,
    FormatEmailDraftForClipboard,
    GovernancePolicyDraft,
    IsApprovalRequest,
    IsSpentOneShotRoutine,
    ParseEmailApprovalPayload,
    RequestSummaryItem,
    ResolveSelectableAgent,
    RoutineDisplayStatus,
    RoutineSummaryItem,
    SelectableAgentsForGovernance,
    SortRoutinesForDisplay,
    ValidateChiefOfStaffPageParam,
    ValidateSearchQueryParam,
    type EmailApprovalDraft,
    type RoutineDisplayStatusValue,
    type SelectableGovernanceAgent,
} from './chief-of-staff-agent-context';
import { IsChiefOfStaffEntityChange } from './chief-of-staff-live-refresh';

/** A client tool a Chief of Staff page registers for the co-agent. */
export interface ChiefOfStaffClientTool {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Shared base of the Chief of Staff application's pages. Each page is its own nav item
 * (Overview, Approvals & Wakes, Governance) and its own resource component; this class holds
 * what they share: the user's policy, wake routines and approval requests, the request and
 * routine actions, the briefing reader, live reload and the agent context.
 *
 * Other apps add pages to the Chief of Staff application as nav items, through `NavItem.*`
 * application settings; they do not extend this class.
 */
@Directive()
export abstract class BaseChiefOfStaffPage extends BaseResourceComponent implements OnInit, OnDestroy {
    protected cdr = inject(ChangeDetectorRef);
    protected appManager = inject(ApplicationManager);
    protected confirmService = inject(MJConfirmService, { optional: true });
    protected override destroy$ = new Subject<void>();

    /** Which page this component is. */
    protected abstract readonly Page: ChiefOfStaffPage;

    public IsLoading = true;
    public BusyRequestID: string | null = null;
    public BusyRoutineID: string | null = null;
    public FeedbackBanner: { Type: 'success' | 'error'; Message: string } | null = null;

    /** Filters requests and routines on pages that show a search box. */
    public SearchText = '';

    public PolicyEntity: MJAIAgentUserPolicyEntity | null = null;
    /** The policy as the pages show it; the Governance page edits it. */
    public DraftPolicy: GovernancePolicyDraft = BuildPolicyDraftFromEntity(null);

    public Routines: MJUserRoutineEntity[] = [];
    public Requests: MJAIAgentRequestEntity[] = [];
    public Metrics: ChiefOfStaffMetrics = CalculateChiefOfStaffMetrics([], []);

    public SelectedRequest: MJAIAgentRequestEntity | null = null;
    public ShowRequestDialog = false;

    // ── Briefing reader: a wake routine's conversation, read without leaving the page ────
    /** The routine whose briefings the reader shows; null while the reader is closed. */
    public BriefingRoutine: MJUserRoutineEntity | null = null;
    /** The routine's conversation ID, bound to the embedded chat area. */
    public BriefingConversationId: string | null = null;
    /** The conversation entity when it could be loaded (title, pinned agent); the chat area loads messages by ID either way. */
    public BriefingConversation: MJConversationEntity | null = null;

    /** Agents available in the toolbar agent picker (Chief of Staff, Software Factory, etc.). */
    public AvailableAgents: SelectableGovernanceAgent[] = [];
    /** Currently selected agent ID for Policy, Wake Routines, and Approvals. */
    public SelectedAgentID: string | null = null;
    /** Metadata Name of the currently selected agent. */
    public SelectedAgentName: string = CHIEF_OF_STAFF_AGENT_NAME;
    protected chiefOfStaffAgentId: string | null = null;
    private requestedAgentQueryParam: string | null = null;
    private agentQueryParamInitialized = false;
    private _loadGeneration = 0;

    public get SelectedAgentDisplayName(): string {
        return AgentDisplayName(this.DraftPolicy, this.SelectedAgentName ?? CHIEF_OF_STAFF_AGENT_NAME);
    }

    public get ChiefOfStaffDisplayName(): string {
        return this.SelectedAgentDisplayName;
    }

    /** Approval requests awaiting a decision, filtered by the search text. */
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

    /** Routines in display order: next wake first, unscheduled next, spent one-shots last. */
    public get SortedRoutines(): MJUserRoutineEntity[] {
        return SortRoutinesForDisplay(this.Routines);
    }

    /** Routines that still have something ahead of them: everything but spent one-shots. */
    public get UpcomingRoutines(): MJUserRoutineEntity[] {
        return this.SortedRoutines.filter((r) => !IsSpentOneShotRoutine(r));
    }

    /** 'Fired' for a spent one-shot, otherwise the routine's Status. */
    public RoutineStatusLabel(routine: MJUserRoutineEntity): RoutineDisplayStatusValue {
        return RoutineDisplayStatus(routine);
    }

    public IsSpentRoutine(routine: MJUserRoutineEntity): boolean {
        return IsSpentOneShotRoutine(routine);
    }

    async ngOnInit(): Promise<void> {
        super.ngOnInit();
        this.requestedAgentQueryParam = this.GetQueryParams()['agent'] ?? null;
        this.OnPageInit();
        this.agentQueryParamInitialized = true;

        await this.LoadChiefOfStaffData();
        this.navigationService.SetAgentClientTools(this, [...this.coreAgentTools(), ...this.PageAgentTools()]);

        this.navigationService.ResourceReattached$.pipe(
            filter((c) => c === this),
            takeUntil(this.destroy$),
        ).subscribe(() => this.publishAgentContext());
        this.subscribeToLiveEntityChanges();

        this.NotifyLoadComplete();
    }

    protected override OnQueryParamsChanged(
        params: Record<string, string>,
        _source: 'popstate' | 'deeplink',
    ): void {
        const nextAgent = params['agent'] ?? null;
        const resolved = nextAgent
            ? ResolveSelectableAgent(this.AvailableAgents, nextAgent)
            : ResolveSelectableAgent(this.AvailableAgents, CHIEF_OF_STAFF_AGENT_NAME);
        if (resolved && !UUIDsEqual(resolved.ID, this.chiefOfStaffAgentId ?? this.SelectedAgentID)) {
            void this.requestAgentSwitch(resolved, false);
        }
    }

    public OnSelectedAgentSelectionChanged(): void {
        if (!this.SelectedAgentID) {
            return;
        }
        void this.applySelectedAgentId(this.SelectedAgentID, true);
    }

    public OnSelectedAgentChange(agentId: string): void {
        if (!agentId || UUIDsEqual(agentId, this.chiefOfStaffAgentId ?? this.SelectedAgentID)) {
            return;
        }
        void this.applySelectedAgentId(agentId, false);
    }

    private async applySelectedAgentId(agentId: string, allowSameId: boolean): Promise<boolean> {
        if (!allowSameId && UUIDsEqual(agentId, this.SelectedAgentID)) {
            return false;
        }
        const match = this.AvailableAgents.find((a) => UUIDsEqual(a.ID, agentId));
        if (!match) {
            return false;
        }
        if (UUIDsEqual(match.ID, this.chiefOfStaffAgentId)) {
            return false;
        }
        return this.requestAgentSwitch(match, true);
    }

    private async requestAgentSwitch(
        targetAgent: SelectableGovernanceAgent,
        syncQueryParam: boolean,
    ): Promise<boolean> {
        const prevId = this.chiefOfStaffAgentId;
        const prevName = this.SelectedAgentName ?? CHIEF_OF_STAFF_AGENT_NAME;

        if (this.IsPageSaveInFlight()) {
            this.SelectedAgentID = prevId;
            if (!syncQueryParam) {
                this.syncSelectedAgentQueryParam();
            }
            this.cdr.markForCheck();
            return false;
        }

        if (this.HasUnsavedPageEdits()) {
            const confirmed = this.confirmService
                ? await this.confirmService.Confirm({
                      title: 'Discard changes?',
                      message: `Leave "${prevName}" without saving?`,
                      detail: 'Your unsaved governance policy changes will be lost.',
                      type: 'warning',
                      confirmText: 'Discard changes',
                      cancelText: 'Keep editing',
                  })
                : true;
            if (!confirmed) {
                this.SelectedAgentID = prevId;
                if (!syncQueryParam) {
                    this.syncSelectedAgentQueryParam();
                }
                this.cdr.markForCheck();
                return false;
            }
            this.ResetUnsavedPageEdits();
        }

        this.SelectedAgentID = targetAgent.ID;
        this.SelectedAgentName = targetAgent.Name;
        this.chiefOfStaffAgentId = targetAgent.ID;
        this.requestedAgentQueryParam = null;
        if (syncQueryParam) {
            this.syncSelectedAgentQueryParam();
        }
        await this.LoadChiefOfStaffData();
        return true;
    }

    protected syncSelectedAgentQueryParam(): void {
        if (!this.agentQueryParamInitialized) {
            return;
        }
        const selectedName = this.SelectedAgentName ?? CHIEF_OF_STAFF_AGENT_NAME;
        const isDefault =
            selectedName.trim().toLowerCase() === CHIEF_OF_STAFF_AGENT_NAME.toLowerCase();
        this.UpdateQueryParams({
            agent: isDefault ? null : selectedName,
        });
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy();
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return CHIEF_OF_STAFF_PAGE_LABELS[this.Page];
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return CHIEF_OF_STAFF_PAGE_ICONS[this.Page];
    }

    /** Runs before the first load; a page reads its query params here. */
    protected OnPageInit(): void {
        // default: nothing
    }

    /** Runs after every load, before the agent context is published. */
    protected OnDataLoaded(): void {
        // default: nothing
    }

    /** Client tools only this page offers, added to the shared ones. */
    protected PageAgentTools(): ChiefOfStaffClientTool[] {
        return [];
    }

    /** True when the page holds unsaved user edits that would be clobbered by an agent switch or live reload. */
    protected HasUnsavedPageEdits(): boolean {
        return false;
    }

    /** True when the page is actively persisting user edits. */
    protected IsPageSaveInFlight(): boolean {
        return false;
    }

    /** Clears unsaved-edit state after the user confirms discarding changes. */
    protected ResetUnsavedPageEdits(): void {
        // default: nothing
    }

    /** A change arrived while the tab was detached; reload once when it is shown again. */
    private liveReloadPending = false;

    /**
     * Reloads the page when an entity it shows changes anywhere. MJAPI broadcasts every save
     * and delete to browsers, including saves made by server-side code (a wake run creating an
     * approval request or a run row), and the client raises each as a `remote-invalidate`
     * BaseEntity event. A burst of events is one reload. A detached tab does not reload in the
     * background; it reloads once when it is shown again.
     */
    private subscribeToLiveEntityChanges(): void {
        MJGlobal.Instance.GetEventListener(false).pipe(
            filter((event) => IsChiefOfStaffEntityChange(event)),
            debounceTime(750),
            takeUntil(this.destroy$),
        ).subscribe(() => {
            if (this.navigationService.IsResourceDetached(this) || this.HasUnsavedPageEdits() || this.IsPageSaveInFlight()) {
                this.liveReloadPending = true;
                return;
            }
            void this.LoadChiefOfStaffData();
        });

        this.navigationService.ResourceReattached$.pipe(
            filter((c) => c === this && this.liveReloadPending),
            takeUntil(this.destroy$),
        ).subscribe(() => {
            if (this.HasUnsavedPageEdits() || this.IsPageSaveInFlight()) {
                return;
            }
            this.liveReloadPending = false;
            void this.LoadChiefOfStaffData();
        });
    }

    public async LoadChiefOfStaffData(): Promise<void> {
        const generation = ++this._loadGeneration;
        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const currentUserId = this.ProviderToUse.CurrentUser?.ID;
            if (!currentUserId) {
                // Every query is user-scoped; without a user there is nothing safe to show.
                this.showBanner('error', 'No signed-in user is available; the Chief of Staff cannot load.');
                return;
            }

            const selectedAgent = await this.resolveSelectedAgent();
            if (generation !== this._loadGeneration) {
                return;
            }
            if (!selectedAgent) {
                this.showBanner('error', `The "${CHIEF_OF_STAFF_AGENT_NAME}" agent is not installed in this environment.`);
                return;
            }
            this.SelectedAgentID = selectedAgent.ID;
            this.SelectedAgentName = selectedAgent.Name;
            this.chiefOfStaffAgentId = selectedAgent.ID;

            const scope = BuildChiefOfStaffScopeFilters(currentUserId, selectedAgent.ID);

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

            const [policyRes, routineRes, requestRes] = await rv.RunViews(viewParams);
            if (generation !== this._loadGeneration) {
                return;
            }

            const policies = policyRes?.Success
                ? (policyRes.Results as MJAIAgentUserPolicyEntity[])
                : [];
            this.PolicyEntity = policies.length > 0 ? policies[0] : null;
            this.DraftPolicy = BuildPolicyDraftFromEntity(this.PolicyEntity, this.SelectedAgentName);

            this.Routines = routineRes?.Success
                ? (routineRes.Results as MJUserRoutineEntity[])
                : [];

            this.emailDraftsByRequest.Clear();
            this.Requests = requestRes?.Success
                ? (requestRes.Results as MJAIAgentRequestEntity[])
                : [];

            this.recalculateMetrics();
            this.OnDataLoaded();
        } catch (err) {
            if (generation !== this._loadGeneration) {
                return;
            }
            const msg = err instanceof Error ? err.message : String(err);
            this.showBanner('error', `Failed to load Chief of Staff data: ${msg}`);
        } finally {
            if (generation === this._loadGeneration) {
                this.IsLoading = false;
                this.publishAgentContext();
                this.cdr.markForCheck();
            }
        }
    }

    protected recalculateMetrics(): void {
        this.Metrics = CalculateChiefOfStaffMetrics(
            this.Routines.map((r) => this.toRoutineSummary(r)),
            this.Requests.map((r) => this.toRequestSummary(r)),
        );
    }

    private toRoutineSummary(r: MJUserRoutineEntity): RoutineSummaryItem {
        return {
            ID: r.ID,
            Name: r.Name,
            Status: r.Status,
            ScheduleMode: r.ScheduleMode,
            CronExpression: r.CronExpression,
            NextRunAt: r.NextRunAt,
            LastRunAt: r.LastRunAt,
            LastRunStatus: r.LastRunStatus,
        };
    }

    private toRequestSummary(req: MJAIAgentRequestEntity): RequestSummaryItem {
        return {
            ID: req.ID,
            Request: req.Request,
            Status: req.Status,
            Priority: req.Priority,
            RequestedAt: req.RequestedAt,
            ExpiresAt: req.ExpiresAt,
            RequestType: req.RequestType,
            RequestTypeID: req.RequestTypeID,
        };
    }

    /**
     * Loads the selectable governance agents from `AIEngineBase` and resolves the currently active
     * agent from `?agent=` query param, current selection, or `'Chief of Staff'`.
     */
    private async resolveSelectedAgent(): Promise<SelectableGovernanceAgent | null> {
        const engine = <AIEngineBase>AIEngineBase.GetProviderInstance(this.ProviderToUse, AIEngineBase);
        await engine.EnsureLoaded(this.ProviderToUse.CurrentUser, this.ProviderToUse);
        this.AvailableAgents = SelectableAgentsForGovernance(engine.Agents);

        if (this.requestedAgentQueryParam) {
            const matchedFromQuery = ResolveSelectableAgent(this.AvailableAgents, this.requestedAgentQueryParam);
            this.requestedAgentQueryParam = null;
            if (matchedFromQuery) {
                return matchedFromQuery;
            }
        }

        if (this.SelectedAgentID) {
            const existing = this.AvailableAgents.find((a) => UUIDsEqual(a.ID, this.SelectedAgentID));
            if (existing) {
                return existing;
            }
        }

        return (
            ResolveSelectableAgent(this.AvailableAgents, CHIEF_OF_STAFF_AGENT_NAME) ??
            this.AvailableAgents[0] ??
            null
        );
    }

    private readonly actionIdsByName = new Map<string, string>();
    /** The ID of a core action, looked up by name once per page instance. */
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
                SkipTotalRowCount: true,
                ResultType: 'simple',
            });
            if (result.Success && result.Results && result.Results.length > 0) {
                this.actionIdsByName.set(actionName, result.Results[0].ID);
                return result.Results[0].ID;
            }
            return null;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`Chief of Staff: failed to resolve '${actionName}' action: ${msg}`);
            return null;
        }
    }

    // =========================================================================
    // Navigation between the Chief of Staff pages
    // =========================================================================

    /** Opens another Chief of Staff page through its nav item, preserving a non-default agent selection. */
    public OpenPage(page: ChiefOfStaffPage): void {
        const app = this.appManager.GetAppByName(CHIEF_OF_STAFF_APP_NAME);
        const selectedName = this.SelectedAgentName ?? CHIEF_OF_STAFF_AGENT_NAME;
        const isDefault =
            selectedName.trim().toLowerCase() === CHIEF_OF_STAFF_AGENT_NAME.toLowerCase();
        if (isDefault) {
            void this.navigationService.OpenNavItemByName(
                CHIEF_OF_STAFF_PAGE_LABELS[page],
                undefined,
                app?.ID,
            );
            return;
        }
        const queryParams = { agent: selectedName };
        void this.navigationService.OpenNavItemByName(
            CHIEF_OF_STAFF_PAGE_LABELS[page],
            queryParams,
            app?.ID,
            { queryParams },
        );
    }

    // =========================================================================
    // Briefings: where a wake routine's replies live
    // =========================================================================
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

    /** Opens the slide-in reader on the routine's conversation without leaving the page. */
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
            void this.LoadChiefOfStaffData();
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
            request.Response = `${decision} via the Chief of Staff app`;

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
    // Banner
    // =========================================================================

    public DismissBanner(): void {
        this.FeedbackBanner = null;
        this.cdr.markForCheck();
    }

    protected showBanner(type: 'success' | 'error', message: string): void {
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
    // Agent Context & Client Tools
    // =========================================================================

    protected publishAgentContext(): void {
        if (this.navigationService.IsResourceDetached(this)) {
            return;
        }
        const context = BuildChiefOfStaffAgentContext({
            Page: this.Page,
            SearchText: this.SearchText,
            SelectedAgentID: this.SelectedAgentID,
            SelectedAgentName: this.SelectedAgentName,
            AvailableAgentNames: this.AvailableAgents.map((a) => a.Name),
            Metrics: this.Metrics,
            Governance: BuildGovernanceSummary(
                this.DraftPolicy,
                this.PolicyEntity !== null,
                this.SelectedAgentName,
            ),
            Routines: this.Routines.map((r) => this.toRoutineSummary(r)),
            PendingRequests: this.PendingRequests.map((r) => this.toRequestSummary(r)),
        });
        this.navigationService.SetAgentContext(this, context);
    }

    private coreAgentTools(): ChiefOfStaffClientTool[] {
        return [
            {
                Name: 'OpenChiefOfStaffPage',
                Description:
                    "Open one of the Chief of Staff app's pages: 'overview', 'approvals-wakes' or 'governance'.",
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        page: {
                            type: 'string',
                            enum: [...CHIEF_OF_STAFF_PAGES],
                            description: 'Target page',
                        },
                    },
                    required: ['page'],
                },
                Handler: async (params) => {
                    const check = ValidateChiefOfStaffPageParam(params['page'] as string | undefined);
                    if (!check.ok) {
                        return check.result;
                    }
                    this.OpenPage(check.value);
                    return { Success: true, Data: { Page: check.value } };
                },
            },
            {
                Name: 'SelectGovernedAgent',
                Description:
                    'Switch the agent picker on the current page (by agent ID or name, e.g. "Chief of Staff" or "Software Factory") to view that agent\'s approvals, wakes, and governance policy.',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        agent: {
                            type: 'string',
                            description: 'Agent ID or name',
                        },
                    },
                    required: ['agent'],
                },
                Handler: async (params) => {
                    const check = ValidateSearchQueryParam(params['agent'] as string | undefined);
                    if (!check.ok) {
                        return check.result;
                    }
                    const match = ResolveSelectableAgent(this.AvailableAgents, check.value);
                    if (!match) {
                        return {
                            Success: false,
                            Error: `No selectable agent matched "${check.value}". Available agents: ${this.AvailableAgents.map((a) => a.Name).join(', ')}`,
                        };
                    }
                    if (!UUIDsEqual(match.ID, this.chiefOfStaffAgentId) && (this.HasUnsavedPageEdits() || this.IsPageSaveInFlight())) {
                        return {
                            Success: false,
                            Error: `Cannot switch governed agent while "${this.SelectedAgentName}" has unsaved governance policy changes. Ask the user to save or reset their changes first.`,
                        };
                    }
                    await this.applySelectedAgentId(match.ID, false);
                    return {
                        Success: true,
                        Data: { SelectedAgentID: match.ID, SelectedAgentName: match.Name },
                    };
                },
            },
            {
                Name: 'RefreshChiefOfStaff',
                Description:
                    'Reload pending approvals, wake routines and the governance policy from the server.',
                ParameterSchema: {
                    type: 'object',
                    properties: {},
                },
                Handler: async () => {
                    await this.LoadChiefOfStaffData();
                    return {
                        Success: true,
                        Data: {
                            SelectedAgentName: this.SelectedAgentName,
                            PendingApprovalCount: this.Metrics.PendingApprovalCount,
                            ActiveWakeRoutineCount: this.Metrics.ActiveWakeRoutineCount,
                        },
                    };
                },
            },
        ];
    }
}
