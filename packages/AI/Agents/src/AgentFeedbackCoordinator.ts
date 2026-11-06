/**
 * @fileoverview Human-in-the-loop (HITL) feedback request coordination and assignee resolution
 * for MemberJunction AI Agents.
 *
 * Extracted from `BaseAgent` (`WS-4.5a`) to encapsulate `MJ: AI Agent Requests` creation,
 * response-form request-type detection, assignment strategy hierarchy resolution
 * (invocation -> agent type -> category tree -> request type), and full `List`
 * assignment strategies (`RoundRobin`, `LeastBusy`, `Random`).
 *
 * @module @memberjunction/ai-agents
 */

import { randomInt } from 'node:crypto';
import {
    IMetadataProvider,
    LogError,
    LogStatus,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJListDetailEntity,
    MJListEntity,
    MJUserEntity,
} from '@memberjunction/core-entities';
import {
    AgentRequestAssignmentStrategy,
    AgentResponseForm,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ListAssignmentMode,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    ParseAssignmentStrategy,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, GroupByUUID, IndexByUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';

/**
 * Injectable random-integer generator returning an integer in `[0, maxExclusive)`.
 */
export type AgentRandomIntFn = (maxExclusive: number) => number;

/**
 * Options for configuring {@link AgentFeedbackCoordinator}.
 */
export interface AgentFeedbackCoordinatorOptions {
    /**
     * Optional RNG override for deterministic testing of `List` (`Random`) assignment.
     * Defaults to Node's `crypto.randomInt(0, maxExclusive)`.
     */
    RandomInt?: AgentRandomIntFn;
    /**
     * Optional status logger callback invoked when a feedback request is created.
     */
    OnLogStatus?: (message: string, isVerboseOnly: boolean, params: ExecuteAgentParams) => void;
}

/**
 * Input parameters for {@link AgentFeedbackCoordinator.CreateFeedbackRequest}.
 */
export interface CreateFeedbackRequestInput {
    Params: ExecuteAgentParams;
    StepEntity: MJAIAgentRunStepEntityExtended;
    Decision: BaseAgentNextStep;
    AgentRun?: MJAIAgentRunEntityExtended | null;
    Provider: IMetadataProvider;
    NowMs?: number;
}

/**
 * Who a new request is for, and the user that saves it. See {@link AgentFeedbackCoordinator.CreateFeedbackRequest}.
 */
interface RequestPlacement {
    AssigneeUserID: string | null;
    SaveUser: UserInfo | undefined;
}

type ListSummaryRow = Pick<MJListEntity, 'ID' | 'EntityID' | 'Entity'>;
type ListDetailStatus = MJListDetailEntity['Status'];
type ListDetailSummaryRow = Pick<MJListDetailEntity, 'ID' | 'ListID' | 'RecordID' | 'Sequence' | 'Status'>;
type UserActiveSummaryRow = Pick<MJUserEntity, 'ID' | 'IsActive'>;
type AgentRequestStatus = MJAIAgentRequestEntity['Status'];
type AgentRequestSummaryRow = Pick<
    MJAIAgentRequestEntity,
    'ID' | 'AgentID' | 'RequestForUserID' | 'Status' | 'RequestedAt'
>;

/**
 * `MJ: List Details` statuses that disqualify a row from list membership.
 * Standard rows created with the SQL default (`Status = 'Pending'`), as well as
 * `'Active'`, `'Complete'`, `'Other'`, or `null`, remain eligible candidates.
 */
const EXCLUDED_LIST_DETAIL_STATUSES: readonly ListDetailStatus[] = ['Disabled', 'Error', 'Rejected'];
const EXCLUDED_LIST_DETAIL_SQL_LIST = EXCLUDED_LIST_DETAIL_STATUSES.map(
    (status) => `'${EscapeSQLString(status)}'`
).join(', ');

/**
 * The sole open status on `MJ: AI Agent Requests` (`MJAIAgentRequestEntity['Status']`).
 */
const OPEN_AGENT_REQUEST_STATUS: AgentRequestStatus = 'Requested';

/** How many of the list members' newest assignments LeastBusy reads to break a tie on open-request count. */
const LEAST_BUSY_RECENT_ASSIGNMENT_ROWS = 500;

/**
 * Coordinates creation of persistent `MJ: AI Agent Requests` rows, response-form
 * classification, hierarchical assignment strategy resolution, and `List`-based
 * (`RoundRobin`, `LeastBusy`, `Random`) user assignment.
 */
export class AgentFeedbackCoordinator {
    private readonly randomIntFn: AgentRandomIntFn;
    private readonly onLogStatus?: (message: string, isVerboseOnly: boolean, params: ExecuteAgentParams) => void;

    constructor(options?: AgentFeedbackCoordinatorOptions) {
        this.randomIntFn = options?.RandomInt ?? ((maxExclusive: number) => randomInt(0, maxExclusive));
        this.onLogStatus = options?.OnLogStatus;
    }

    /**
     * Builds the standard editable plan-approval {@link AgentResponseForm} for Plan Mode.
     */
    public BuildPlanApprovalForm(planText: string): AgentResponseForm {
        return {
            title: 'Review Plan',
            description:
                'Review the proposed plan below. Edit it if needed, then approve to proceed — or reject (with a note on what to change) and the agent will re-plan.',
            submitLabel: 'Submit',
            questions: [
                {
                    id: 'plan',
                    label: 'Plan',
                    // markdown: agents author plans in Markdown (see the plan-mode prompt
                    // instructions); the UI renders a formatted preview with an Edit toggle.
                    type: { type: 'textarea', markdown: true },
                    defaultValue: planText,
                    required: true,
                },
                {
                    id: 'reason',
                    label: 'Feedback',
                    type: {
                        type: 'textarea',
                        placeholder:
                            'Optional — if rejecting, tell the agent what to change and it will re-plan.',
                    },
                    required: false,
                },
                {
                    id: 'decision',
                    label: 'Decision',
                    type: {
                        type: 'buttongroup',
                        options: [
                            { value: 'approve', label: 'Approve' },
                            { value: 'reject', label: 'Reject' },
                        ],
                    },
                    required: true,
                },
            ],
        };
    }

    /**
     * Inspects an {@link AgentResponseForm} to determine the request type name.
     * Returns `'Approval'` when the form is a single two-option approve/reject question,
     * otherwise `'Information'`.
     */
    public DetectRequestTypeName(form: AgentResponseForm): 'Approval' | 'Information' {
        const q = form.questions?.[0];
        if (!q || form.questions.length !== 1) {
            return 'Information';
        }
        const qType = q.type;
        if ((qType.type === 'buttongroup' || qType.type === 'radio') && 'options' in qType) {
            const opts = qType.options;
            if (opts.length === 2) {
                const labels = opts.map((o) => o.label.toLowerCase());
                const hasPositive = labels.some(
                    (l) => l.includes('approv') || l.includes('yes') || l.includes('accept')
                );
                const hasNegative = labels.some(
                    (l) => l.includes('reject') || l.includes('no') || l.includes('deny')
                );
                if (hasPositive && hasNegative) {
                    return 'Approval';
                }
            }
        }
        return 'Information';
    }

    /**
     * Resolves the `MJ: AI Agent Request Types` ID for a Chat or Plan step decision:
     * - If the responseForm has only approve/reject-style buttons, uses `"Approval"`
     * - If there's a responseForm with fields, uses `"Information"`
     * - Otherwise defaults to `"Information"`
     *
     * Request types come from the AI engine's cached `MJ: AI Agent Request Types` rows
     * (`AIEngineBase.ResolveAgentRequestTypeID`), the same source the agent actions use.
     */
    public async ResolveRequestTypeID(
        previousDecision: BaseAgentNextStep,
        contextUser?: UserInfo
    ): Promise<string | null> {
        try {
            let typeName: 'Approval' | 'Information' = 'Information';
            if (previousDecision.responseForm) {
                typeName = this.DetectRequestTypeName(previousDecision.responseForm);
            }
            return await AIEngine.Instance.ResolveAgentRequestTypeID(typeName, contextUser);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Error resolving request type: ${message}`);
            return null;
        }
    }

    /**
     * Walks the assignment strategy resolution chain (bottom-up, first-non-null wins):
     * 1. `ExecuteAgentParams.assignmentStrategy` (per-invocation override)
     * 2. Agent Type's `AssignmentStrategy`
     * 3. Agent's Category `AssignmentStrategy` (walks up `ParentID` tree)
     * 4. Request Type's `DefaultAssignmentStrategy`
     * 5. `null`
     */
    public async ResolveAssignmentStrategy(
        params: ExecuteAgentParams,
        requestTypeId: string | null
    ): Promise<AgentRequestAssignmentStrategy | null> {
        if (params.assignmentStrategy) {
            return params.assignmentStrategy;
        }

        const agentType = AIEngine.Instance.AgentTypes.find((at) =>
            UUIDsEqual(at.ID, params.agent.TypeID)
        );
        const typeStrategy = ParseAssignmentStrategy(agentType?.AssignmentStrategy ?? null);
        if (typeStrategy) {
            return typeStrategy;
        }

        const categoryStrategy = await this.ResolveCategoryAssignmentStrategy(params);
        if (categoryStrategy) {
            return categoryStrategy;
        }

        if (requestTypeId) {
            const requestType = AIEngine.Instance.AgentRequestTypes.find((t) =>
                UUIDsEqual(t.ID, requestTypeId)
            );
            if (requestType) {
                const rtStrategy = ParseAssignmentStrategy(requestType.DefaultAssignmentStrategy);
                if (rtStrategy) {
                    return rtStrategy;
                }
            }
        }

        return null;
    }

    /**
     * Walks up the agent's category hierarchy looking for a configured `AssignmentStrategy`.
     */
    public async ResolveCategoryAssignmentStrategy(
        params: ExecuteAgentParams
    ): Promise<AgentRequestAssignmentStrategy | null> {
        const categoryId = params.agent.CategoryID;
        if (!categoryId) {
            return null;
        }

        try {
            const categoriesByID = IndexByUUID(AIEngine.Instance.AgentCategories);
            let currentId: string | null = categoryId;
            const visited = new UUIDSet();
            while (currentId && !visited.Has(currentId)) {
                visited.Add(currentId);
                const cat = categoriesByID.Get(currentId);
                if (!cat) {
                    break;
                }

                const strategy = ParseAssignmentStrategy(cat.AssignmentStrategy);
                if (strategy) {
                    return strategy;
                }

                currentId = cat.ParentID;
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Error resolving category assignment strategy: ${message}`);
        }

        return null;
    }

    /**
     * Synchronously resolves non-`List` assignment strategies (`RunUser`, `AgentOwner`,
     * `SpecificUser`, `SharedInbox`, or `null` fallback).
     */
    public ResolveStaticAssigneeUserID(
        strategy: AgentRequestAssignmentStrategy | null,
        params: ExecuteAgentParams,
        agentRun?: MJAIAgentRunEntityExtended | null
    ): string | null {
        if (!strategy) {
            if (params.contextUser?.ID) {
                LogStatus(
                    `⚠️ No assignment strategy configured for agent ${params.agent.Name}; defaulting to context user`
                );
                return params.contextUser.ID;
            }
            LogStatus(
                `⚠️ No assignment strategy and no context user for agent ${params.agent.Name}; request will be unassigned`
            );
            return null;
        }

        switch (strategy.type) {
            case 'RunUser':
                return params.contextUser?.ID ?? agentRun?.UserID ?? null;
            case 'AgentOwner':
                return params.agent.OwnerUserID ?? null;
            case 'SpecificUser':
                return strategy.userID ?? null;
            case 'SharedInbox':
                return null;
            case 'List':
                return params.contextUser?.ID ?? null;
            default:
                return params.contextUser?.ID ?? null;
        }
    }

    /**
     * Resolves the assignee user ID for a feedback request, including async `List`
     * strategies (`RoundRobin`, `LeastBusy`, `Random`).
     */
    public async ResolveAssigneeUserID(
        strategy: AgentRequestAssignmentStrategy | null,
        params: ExecuteAgentParams,
        agentRun?: MJAIAgentRunEntityExtended | null,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        if (!strategy || strategy.type !== 'List') {
            return this.ResolveStaticAssigneeUserID(strategy, params, agentRun);
        }

        return this.resolveListAssigneeUserID(strategy, params, provider);
    }

    /**
     * Creates and saves a persistent `MJ: AI Agent Requests` row for a Chat or Plan step,
     * returning the new request's `ID` when saved or `null` on failure.
     *
     * **Who saves the row.** `MJAIAgentRequestEntityServer.Validate` keeps requests private: a
     * non-Owner-type user may save a request only for themselves, and Owner-type users (the
     * scheduler's system user among them) are exempt. That rule guards direct saves, such as a
     * GraphQL create where the caller types in `RequestForUserID`, and this method leaves it
     * untouched. The assignee here comes from one of two places, held to different standards:
     * - **Metadata** (agent type, agent category, request type): an administrator configured the
     *   strategy and the caller cannot change it. When it picks someone other than a non-Owner
     *   caller, the row is saved as the system user, the cross-user path the rule exempts (the
     *   same way `AgentWakeTriggerService` saves a wake routine for another user). Saving it as
     *   the caller would fail validation and lose the request: no inbox row, no resume.
     * - **The caller** (`ExecuteAgentParams.assignmentStrategy`): held to the rule a direct save
     *   meets. A non-Owner caller who names someone else gets the request assigned to themselves
     *   (logged), and the row is saved as the caller, so the entity rule still backs this up.
     * The reads that choose the assignee (list members, open counts) run as the caller either way.
     */
    public async CreateFeedbackRequest(input: CreateFeedbackRequestInput): Promise<string | null> {
        const {
            Params: params,
            StepEntity: stepEntity,
            Decision: previousDecision,
            AgentRun: agentRun,
            Provider: provider,
            NowMs: nowMs = Date.now(),
        } = input;

        try {
            const requestTypeId = await this.ResolveRequestTypeID(
                previousDecision,
                params.contextUser
            );
            const resolvedStrategy = await this.ResolveAssignmentStrategy(params, requestTypeId);
            const resolvedAssigneeUserId = await this.ResolveAssigneeUserID(
                resolvedStrategy,
                params,
                agentRun,
                provider
            );
            const { AssigneeUserID: requestForUserId, SaveUser: saveUser } = this.placeRequest(
                resolvedAssigneeUserId,
                params
            );
            const priority = resolvedStrategy?.priority ?? 50;
            const expirationMinutes = resolvedStrategy?.expirationMinutes;

            const request = await provider.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                saveUser
            );
            request.NewRecord();
            request.AgentID = params.agent.ID;
            request.RequestedAt = new Date(nowMs);
            request.RequestForUserID = requestForUserId;
            request.Status = 'Requested';
            request.Request = previousDecision.message || 'Agent needs user input';
            request.RequestTypeID = requestTypeId;
            request.ResponseSchema = previousDecision.responseForm
                ? JSON.stringify(previousDecision.responseForm)
                : null;
            request.Priority = priority;
            request.OriginatingAgentRunID = agentRun?.ID || null;
            request.OriginatingAgentRunStepID = stepEntity.ID;

            if (expirationMinutes != null && expirationMinutes > 0) {
                request.ExpiresAt = new Date(nowMs + expirationMinutes * 60_000);
            }

            const saved = await request.Save();
            if (saved) {
                this.onLogStatus?.(
                    `📋 Created feedback request ${request.ID} for user ${requestForUserId || '(system)'}`,
                    true,
                    params
                );
                return request.ID;
            }

            LogError(
                `Failed to save AIAgentRequest for agent ${params.agent.Name}: ${request.LatestResult?.CompleteMessage ?? 'unknown error'}`
            );
            return null;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Error creating feedback request: ${message}`);
            return null;
        }
    }

    /**
     * Applies the ownership rule described on {@link CreateFeedbackRequest} to a resolved assignee.
     * A request for the caller, for nobody (a shared inbox), with no caller, or from an Owner-type
     * caller is saved as the caller unchanged.
     */
    private placeRequest(assigneeUserID: string | null, params: ExecuteAgentParams): RequestPlacement {
        const caller = params.contextUser;
        if (!caller || !assigneeUserID || UUIDsEqual(assigneeUserID, caller.ID) || this.isOwnerType(caller)) {
            return { AssigneeUserID: assigneeUserID, SaveUser: caller };
        }
        if (params.assignmentStrategy) {
            LogStatus(
                `⚠️ Agent ${params.agent.Name}: the run's assignmentStrategy picked user ${assigneeUserID}, but a non-Owner caller may only assign a request to themselves; assigning it to the caller`
            );
            return { AssigneeUserID: caller.ID, SaveUser: caller };
        }
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            LogStatus(
                `⚠️ Agent ${params.agent.Name}: no system user in UserCache to save a request for user ${assigneeUserID}; assigning it to the caller`
            );
            return { AssigneeUserID: caller.ID, SaveUser: caller };
        }
        return { AssigneeUserID: assigneeUserID, SaveUser: systemUser };
    }

    /** The Owner-type test `MJAIAgentRequestEntityServer.validateOwnership` applies. */
    private isOwnerType(user: UserInfo): boolean {
        return user.Type?.trim().toLowerCase() === 'owner';
    }

    private describeListFallbackTarget(params: ExecuteAgentParams): string {
        return params.contextUser?.ID
            ? 'falling back to context user'
            : 'falling back to unassigned (no context user)';
    }

    private async resolveListAssigneeUserID(
        strategy: AgentRequestAssignmentStrategy,
        params: ExecuteAgentParams,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        const listId = strategy.listID?.trim();
        if (!listId) {
            LogStatus(
                `⚠️ List assignment strategy on agent ${params.agent.Name} is missing listID; ${this.describeListFallbackTarget(params)}`
            );
            return params.contextUser?.ID ?? null;
        }

        try {
            const effectiveProvider = provider ?? params.provider;
            // global-provider-ok: Falls back to default RunView only when caller did not supply a provider
            const rv = effectiveProvider ? RunView.FromMetadataProvider(effectiveProvider) : new RunView();
            const candidateUserIDs = await this.loadListCandidateUserIDs(rv, listId, params, effectiveProvider);
            if (!candidateUserIDs) {
                return params.contextUser?.ID ?? null;
            }
            const mode: ListAssignmentMode = strategy.listStrategy ?? 'RoundRobin';
            return await this.selectFromActiveListMembers(rv, mode, listId, candidateUserIDs, params);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Error resolving List assignment strategy for list ${listId}: ${message}`);
            return params.contextUser?.ID ?? null;
        }
    }

    /**
     * Reads the list and its member rows in one batch and returns the member user IDs in list order,
     * or `null` (logged) when the list cannot be read, does not target `MJ: Users`, or has no members.
     */
    private async loadListCandidateUserIDs(
        rv: RunView,
        listId: string,
        params: ExecuteAgentParams,
        provider?: IMetadataProvider
    ): Promise<string[] | null> {
        const [listResult, detailsResult] = await rv.RunViews(this.buildListViews(listId), params.contextUser);
        if (!listResult?.Success || !detailsResult?.Success) {
            LogError(
                `Failed to load list ${listId} for assignment: ${listResult?.ErrorMessage || detailsResult?.ErrorMessage || 'unknown error'}`
            );
            return null;
        }

        const listRow = ((listResult.Results as ListSummaryRow[]) ?? [])[0];
        if (!listRow || !this.isUsersList(listRow, provider)) {
            LogStatus(
                `⚠️ List ${listId} does not exist or does not target 'MJ: Users'; ${this.describeListFallbackTarget(params)}`
            );
            return null;
        }

        const candidateUserIDs = this.extractOrderedCandidateUserIDs((detailsResult.Results as ListDetailSummaryRow[]) ?? []);
        if (candidateUserIDs.length === 0) {
            LogStatus(`ℹ️ List ${listId} has no active member rows; ${this.describeListFallbackTarget(params)}`);
            return null;
        }
        return candidateUserIDs;
    }

    private isUsersList(listRow: ListSummaryRow, provider?: IMetadataProvider): boolean {
        if (listRow.Entity) {
            const normalized = listRow.Entity.trim().toLowerCase();
            return normalized === 'mj: users' || normalized === 'users';
        }
        if (listRow.EntityID && provider?.Entities) {
            const entityInfo = provider.Entities.find((e) => UUIDsEqual(e.ID, listRow.EntityID));
            if (entityInfo) {
                const normalized = entityInfo.Name.trim().toLowerCase();
                return normalized === 'mj: users' || normalized === 'users';
            }
        }
        return false;
    }

    private isMemberListDetailStatus(status: ListDetailStatus | null | undefined): boolean {
        if (status == null) {
            return true;
        }
        return !EXCLUDED_LIST_DETAIL_STATUSES.includes(status);
    }

    private extractOrderedCandidateUserIDs(detailRows: ListDetailSummaryRow[]): string[] {
        const activeRows = detailRows.filter(
            (row) =>
                this.isMemberListDetailStatus(row.Status) &&
                typeof row.RecordID === 'string' &&
                row.RecordID.trim().length > 0
        );

        const sortedRows = [...activeRows].sort((a, b) => {
            const seqDiff = (a.Sequence ?? 0) - (b.Sequence ?? 0);
            if (seqDiff !== 0) {
                return seqDiff;
            }
            return String(a.ID ?? '').localeCompare(String(b.ID ?? ''));
        });

        const seen = new UUIDSet();
        const orderedUserIDs: string[] = [];
        for (const row of sortedRows) {
            const userId = row.RecordID.trim();
            if (!seen.Has(userId)) {
                seen.Add(userId);
                orderedUserIDs.push(userId);
            }
        }
        return orderedUserIDs;
    }

    /**
     * Reads which candidates are active users, together with the request rows the mode needs, in one
     * batch, then picks among the active members. A failed user read falls back to the caller; a failed
     * request read falls back to the first active member, so the request still lands on the list.
     */
    private async selectFromActiveListMembers(
        rv: RunView,
        mode: ListAssignmentMode,
        listId: string,
        candidateUserIDs: string[],
        params: ExecuteAgentParams
    ): Promise<string | null> {
        const modeViews = this.buildListModeViews(mode, candidateUserIDs, params);
        const [usersResult, ...modeResults] = await rv.RunViews(
            [this.buildActiveUsersView(candidateUserIDs), ...modeViews],
            params.contextUser
        );
        if (!usersResult?.Success) {
            LogError(`Failed to load active users for list ${listId}: ${usersResult?.ErrorMessage || 'unknown error'}`);
            return params.contextUser?.ID ?? null;
        }

        const activeUserIDs = this.filterActiveUserIDs(candidateUserIDs, (usersResult.Results as UserActiveSummaryRow[]) ?? []);
        if (activeUserIDs.length === 0) {
            LogStatus(`ℹ️ List ${listId} has zero active users; ${this.describeListFallbackTarget(params)}`);
            return params.contextUser?.ID ?? null;
        }

        const failedRead = this.findFailedRead(modeViews.length, modeResults);
        if (failedRead !== null) {
            LogError(
                `Failed to load agent requests for list ${listId} (${mode}): ${failedRead}; falling back to first active list member`
            );
            return activeUserIDs[0];
        }
        return this.pickListMember(mode, activeUserIDs, modeResults);
    }

    /** The list row and its member rows (members in a disqualifying status are left out). */
    private buildListViews(listId: string): RunViewParams[] {
        const escapedListId = EscapeSQLString(listId);
        return [
            {
                EntityName: 'MJ: Lists',
                ExtraFilter: `ID = '${escapedListId}'`,
                Fields: ['ID', 'EntityID', 'Entity'],
                ResultType: 'simple',
            },
            {
                EntityName: 'MJ: List Details',
                ExtraFilter: `ListID = '${escapedListId}' AND (Status IS NULL OR Status NOT IN (${EXCLUDED_LIST_DETAIL_SQL_LIST}))`,
                OrderBy: 'Sequence ASC, ID ASC',
                Fields: ['ID', 'ListID', 'RecordID', 'Sequence', 'Status'],
                ResultType: 'simple',
            },
        ];
    }

    /** IDs as a SQL `IN (...)` list body, each value escaped. */
    private toSqlIdList(ids: string[]): string {
        return ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    }

    private buildActiveUsersView(candidateUserIDs: string[]): RunViewParams {
        return {
            EntityName: 'MJ: Users',
            ExtraFilter: `ID IN (${this.toSqlIdList(candidateUserIDs)}) AND IsActive = 1`,
            Fields: ['ID', 'IsActive'],
            ResultType: 'simple',
        };
    }

    /**
     * The `MJ: AI Agent Requests` reads a mode needs: none for `Random`; the agent's latest assignment to a
     * member for `RoundRobin` (also used for an unrecognised mode); for `LeastBusy`, every open request of the
     * members plus their newest assignments for the tie-break.
     */
    private buildListModeViews(
        mode: ListAssignmentMode,
        candidateUserIDs: string[],
        params: ExecuteAgentParams
    ): RunViewParams[] {
        const userInListClause = this.toSqlIdList(candidateUserIDs);
        if (mode === 'Random') {
            return [];
        }
        if (mode === 'LeastBusy') {
            return [
                // Load: every open ('Requested') row with no row cap, so a high volume of recent closed
                // rows never pushes older open requests out of the count.
                {
                    EntityName: 'MJ: AI Agent Requests',
                    ExtraFilter: `RequestForUserID IN (${userInListClause}) AND Status = '${OPEN_AGENT_REQUEST_STATUS}'`,
                    OrderBy: 'RequestedAt DESC, ID DESC',
                    IgnoreMaxRows: true,
                    Fields: ['ID', 'RequestForUserID', 'Status', 'RequestedAt'],
                    ResultType: 'simple',
                },
                // Tie-break: each member's latest assignment of any status. The cap is safe here: a member
                // with no row among the newest assignments was last assigned before all of them, so they
                // already rank as the oldest assignment; only their order among themselves falls back to
                // list sequence.
                {
                    EntityName: 'MJ: AI Agent Requests',
                    ExtraFilter: `RequestForUserID IN (${userInListClause})`,
                    OrderBy: 'RequestedAt DESC, ID DESC',
                    MaxRows: LEAST_BUSY_RECENT_ASSIGNMENT_ROWS,
                    Fields: ['ID', 'RequestForUserID', 'RequestedAt'],
                    ResultType: 'simple',
                },
            ];
        }
        const agentFilter = params.agent?.ID ? `AgentID = '${EscapeSQLString(params.agent.ID)}' AND ` : '';
        return [
            {
                EntityName: 'MJ: AI Agent Requests',
                ExtraFilter: `${agentFilter}RequestForUserID IN (${userInListClause})`,
                OrderBy: 'RequestedAt DESC, ID DESC',
                MaxRows: 1,
                Fields: ['ID', 'AgentID', 'RequestForUserID', 'RequestedAt'],
                ResultType: 'simple',
            },
        ];
    }

    /** The candidates the user read returned as active, in list order. */
    private filterActiveUserIDs(candidateUserIDs: string[], activeUserRows: UserActiveSummaryRow[]): string[] {
        const activeUserSet = new UUIDSet(activeUserRows.filter((u) => u.IsActive !== false).map((u) => u.ID));
        return candidateUserIDs.filter((id) => activeUserSet.Has(id));
    }

    /** The error of the first of `expected` results that is missing or failed, or `null` when all succeeded. */
    private findFailedRead(expected: number, results: RunViewResult[]): string | null {
        for (let i = 0; i < expected; i++) {
            const result = results[i];
            if (!result?.Success) {
                return result?.ErrorMessage || 'unknown error';
            }
        }
        return null;
    }

    private pickListMember(mode: ListAssignmentMode, activeUserIDs: string[], modeResults: RunViewResult[]): string {
        const rowsOf = (result: RunViewResult | undefined): AgentRequestSummaryRow[] =>
            (result?.Results as AgentRequestSummaryRow[] | undefined) ?? [];
        if (mode === 'Random') {
            const index = this.randomIntFn(activeUserIDs.length);
            return activeUserIDs[Math.max(0, Math.min(activeUserIDs.length - 1, index))];
        }
        if (mode === 'LeastBusy') {
            return this.pickLeastBusyMember(activeUserIDs, rowsOf(modeResults[0]), rowsOf(modeResults[1]));
        }
        return this.pickRoundRobinMember(activeUserIDs, rowsOf(modeResults[0]));
    }

    // ponytail: Concurrent RoundRobin selections read the same latest `MaxRows: 1` request row
    // before either caller inserts its new `MJ: AI Agent Requests` record, so simultaneous
    // creations can collide and pick the same next user. The WS-4.5b spec intentionally uses a
    // stateless query cursor rather than a schema lock; the upgrade path when strict
    // non-colliding rotation is required is a persisted cursor/reservation column (or dedicated
    // cursor table) updated atomically via `UPDATE ... OUTPUT` / `UPDLOCK, HOLDLOCK`.
    private pickRoundRobinMember(
        activeUserIDs: string[],
        recentRequests: AgentRequestSummaryRow[]
    ): string {
        const lastAssignedUserID = recentRequests[0]?.RequestForUserID;
        if (!lastAssignedUserID) {
            return activeUserIDs[0];
        }
        const lastIndex = activeUserIDs.findIndex((id) => UUIDsEqual(id, lastAssignedUserID));
        if (lastIndex === -1) {
            return activeUserIDs[0];
        }
        return activeUserIDs[(lastIndex + 1) % activeUserIDs.length];
    }

    /**
     * The member with the fewest open requests; a tie goes to the member whose latest assignment (of
     * any status) is oldest, then to list sequence.
     */
    private pickLeastBusyMember(
        activeUserIDs: string[],
        openRequestRows: AgentRequestSummaryRow[],
        recentAssignmentRows: AgentRequestSummaryRow[]
    ): string {
        const openByUser = GroupByUUID(openRequestRows, (req) => req.RequestForUserID);
        const recentByUser = GroupByUUID(recentAssignmentRows, (req) => req.RequestForUserID);
        let bestUserID = activeUserIDs[0];
        let bestOpenCount = Number.POSITIVE_INFINITY;
        let bestLastAssignedMs = Number.POSITIVE_INFINITY;

        for (const candidateUserID of activeUserIDs) {
            const openCount = (openByUser.Get(candidateUserID) ?? []).filter(
                (req) => req.Status === OPEN_AGENT_REQUEST_STATUS
            ).length;
            let lastAssignedMs = Number.NEGATIVE_INFINITY;
            for (const req of recentByUser.Get(candidateUserID) ?? []) {
                const ts = req.RequestedAt ? new Date(req.RequestedAt).getTime() : Number.NaN;
                if (!Number.isNaN(ts) && ts > lastAssignedMs) {
                    lastAssignedMs = ts;
                }
            }

            const isBetter =
                openCount < bestOpenCount ||
                (openCount === bestOpenCount && lastAssignedMs < bestLastAssignedMs);
            if (isBetter) {
                bestUserID = candidateUserID;
                bestOpenCount = openCount;
                bestLastAssignedMs = lastAssignedMs;
            }
        }

        return bestUserID;
    }
}
