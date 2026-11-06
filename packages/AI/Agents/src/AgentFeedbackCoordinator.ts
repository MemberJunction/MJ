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

type ListSummaryRow = Pick<MJListEntity, 'ID' | 'EntityID' | 'Entity'>;
type ListDetailStatus = MJListDetailEntity['Status'];
type ListDetailSummaryRow = Pick<MJListDetailEntity, 'ID' | 'ListID' | 'RecordID' | 'Sequence' | 'Status'>;
type UserActiveSummaryRow = Pick<MJUserEntity, 'ID' | 'IsActive'>;
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
     * Resolves the `MJ: AI Agent Request Types` ID for a Chat or Plan step decision.
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
            const requestForUserId = await this.ResolveAssigneeUserID(
                resolvedStrategy,
                params,
                agentRun,
                provider
            );
            const priority = resolvedStrategy?.priority ?? 50;
            const expirationMinutes = resolvedStrategy?.expirationMinutes;

            const request = await provider.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                params.contextUser
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

    private async resolveListAssigneeUserID(
        strategy: AgentRequestAssignmentStrategy,
        params: ExecuteAgentParams,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        const listId = strategy.listID?.trim();
        if (!listId) {
            LogStatus(
                `⚠️ List assignment strategy on agent ${params.agent.Name} is missing listID; falling back to context user`
            );
            return params.contextUser?.ID ?? null;
        }

        try {
            const effectiveProvider = provider ?? params.provider;
            // global-provider-ok: Falls back to default RunView only when caller did not supply a provider
            const rv = effectiveProvider ? RunView.FromMetadataProvider(effectiveProvider) : new RunView();
            const escapedListId = EscapeSQLString(listId);

            const [listResult, detailsResult] = await rv.RunViews(
                [
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
                ],
                params.contextUser
            );

            if (!listResult?.Success || !detailsResult?.Success) {
                LogError(
                    `Failed to load list ${listId} for assignment: ${listResult?.ErrorMessage || detailsResult?.ErrorMessage || 'unknown error'}`
                );
                return params.contextUser?.ID ?? null;
            }

            const lists = (listResult.Results as ListSummaryRow[]) ?? [];
            const listRow = lists[0];
            if (!listRow || !this.isUsersList(listRow, effectiveProvider)) {
                LogStatus(
                    `⚠️ List ${listId} does not exist or does not target 'MJ: Users'; falling back to context user`
                );
                return params.contextUser?.ID ?? null;
            }

            const detailRows = (detailsResult.Results as ListDetailSummaryRow[]) ?? [];
            const candidateUserIDs = this.extractOrderedCandidateUserIDs(detailRows);
            if (candidateUserIDs.length === 0) {
                LogStatus(
                    `ℹ️ List ${listId} has no active member rows; falling back to context user or SharedInbox`
                );
                return params.contextUser?.ID ?? null;
            }

            const mode: ListAssignmentMode = strategy.listStrategy ?? 'RoundRobin';
            return await this.selectFromActiveListMembers(
                rv,
                mode,
                listId,
                candidateUserIDs,
                params
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Error resolving List assignment strategy for list ${listId}: ${message}`);
            return params.contextUser?.ID ?? null;
        }
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

    private async selectFromActiveListMembers(
        rv: RunView,
        mode: ListAssignmentMode,
        listId: string,
        candidateUserIDs: string[],
        params: ExecuteAgentParams
    ): Promise<string | null> {
        const userInListClause = candidateUserIDs
            .map((id) => `'${EscapeSQLString(id)}'`)
            .join(', ');

        const batchParams: RunViewParams[] = [
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `ID IN (${userInListClause}) AND IsActive = 1`,
                Fields: ['ID', 'IsActive'],
                ResultType: 'simple',
            },
        ];

        if (mode === 'LeastBusy') {
            batchParams.push({
                EntityName: 'MJ: AI Agent Requests',
                ExtraFilter: `RequestForUserID IN (${userInListClause})`,
                OrderBy: 'RequestedAt DESC, ID DESC',
                MaxRows: 500,
                Fields: ['ID', 'RequestForUserID', 'Status', 'RequestedAt'],
                ResultType: 'simple',
            });
        } else if (mode === 'RoundRobin') {
            const agentFilter = params.agent?.ID
                ? `AgentID = '${EscapeSQLString(params.agent.ID)}' AND `
                : '';
            batchParams.push({
                EntityName: 'MJ: AI Agent Requests',
                ExtraFilter: `${agentFilter}RequestForUserID IN (${userInListClause})`,
                OrderBy: 'RequestedAt DESC, ID DESC',
                MaxRows: 1,
                Fields: ['ID', 'AgentID', 'RequestForUserID', 'RequestedAt'],
                ResultType: 'simple',
            });
        }

        const batchResults = await rv.RunViews(batchParams, params.contextUser);
        const usersResult = batchResults[0];
        if (!usersResult?.Success) {
            LogError(
                `Failed to load active users for list ${listId}: ${usersResult?.ErrorMessage || 'unknown error'}`
            );
            return params.contextUser?.ID ?? null;
        }

        const activeUserRows = (usersResult.Results as UserActiveSummaryRow[]) ?? [];
        const activeUserSet = new UUIDSet(
            activeUserRows.filter((u) => u.IsActive !== false).map((u) => u.ID)
        );
        const activeUserIDs = candidateUserIDs.filter((id) => activeUserSet.Has(id));
        if (activeUserIDs.length === 0) {
            LogStatus(
                `ℹ️ List ${listId} has zero active users; falling back to context user or SharedInbox`
            );
            return params.contextUser?.ID ?? null;
        }

        const requestsResult = batchResults[1];
        const requestRows = requestsResult?.Success
            ? ((requestsResult.Results as AgentRequestSummaryRow[]) ?? [])
            : [];

        switch (mode) {
            case 'RoundRobin':
                return this.pickRoundRobinMember(activeUserIDs, requestRows);
            case 'LeastBusy':
                return this.pickLeastBusyMember(activeUserIDs, requestRows);
            case 'Random': {
                const index = this.randomIntFn(activeUserIDs.length);
                const boundedIndex = Math.max(0, Math.min(activeUserIDs.length - 1, index));
                return activeUserIDs[boundedIndex];
            }
            default:
                return this.pickRoundRobinMember(activeUserIDs, requestRows);
        }
    }

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

    private pickLeastBusyMember(
        activeUserIDs: string[],
        requestRows: AgentRequestSummaryRow[]
    ): string {
        const requestsByUser = GroupByUUID(requestRows, (req) => req.RequestForUserID);
        let bestUserID = activeUserIDs[0];
        let bestOpenCount = Number.POSITIVE_INFINITY;
        let bestLastAssignedMs = Number.POSITIVE_INFINITY;

        for (const candidateUserID of activeUserIDs) {
            let openCount = 0;
            let latestAssignedMs = Number.NEGATIVE_INFINITY;
            const userRequests = requestsByUser.Get(candidateUserID) ?? [];

            for (const req of userRequests) {
                const status = String(req.Status ?? '');
                if (status === 'Requested' || status === 'InProgress') {
                    openCount += 1;
                }
                if (req.RequestedAt) {
                    const ts = new Date(req.RequestedAt).getTime();
                    if (!Number.isNaN(ts) && ts > latestAssignedMs) {
                        latestAssignedMs = ts;
                    }
                }
            }

            const isBetter =
                openCount < bestOpenCount ||
                (openCount === bestOpenCount && latestAssignedMs < bestLastAssignedMs);
            if (isBetter) {
                bestUserID = candidateUserID;
                bestOpenCount = openCount;
                bestLastAssignedMs = latestAssignedMs;
            }
        }

        return bestUserID;
    }
}
