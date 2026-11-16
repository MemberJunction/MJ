/**
 * @fileoverview Server-side entity subclass for MJ: AI Agent Requests.
 *
 * After a human responds to an agent feedback request (from the Dashboard panel
 * or API), this subclass detects the status change and automatically triggers
 * agent resumption by spawning a new agent run with `lastRunId`.
 *
 * Guard: `ResumingAgentRunID` being null means "not yet processed". Once the
 * new run is created, the field is populated and the record is saved a second
 * time. The second save short-circuits because the guard is no longer null.
 *
 * Conversation-originated responses are handled by the chat resolver's
 * `syncFeedbackRequestFromConversation()` and never reach this code path.
 *
 * Ownership: a request is private to the user it is for. The UI role may create and update
 * requests (granted in `metadata/entity-permissions`), so `Validate()` keeps the rows per-user:
 * a non-Owner-type user may create a request only for themselves and may update only a request
 * that was already theirs (the PRE-save `RequestForUserID`). Owner-type users, the scheduler's
 * system user among them, are exempt, which is what cross-user paths such as Send Inter-Agent
 * Request run under. `AgentFeedbackCoordinator.CreateFeedbackRequest` saves a feedback request
 * as the system user only when its assignee came from metadata (agent type, category, request
 * type); an assignee the caller chose is held to this rule.
 *
 * Responder: `ResponseByUserID` is the server's record of who answered. A save that answers the request
 * (moves it into a responded status, a create included) sets it to the user the save runs as. On a workflow
 * step's request it does so only when the save is that user's own client request
 * (`ServerOperationScopeManager.IsInDirectClientCrud`), and sets nobody when server code answers, such as
 * an agent run calling Update Record as that user. No other save may change it.
 *
 * Workflow requests: a request naming a task-graph step (`OriginatingTaskID`) is how a person releases
 * that step, and the dispatcher settles the step from it. So only the dispatcher raises one (inside its
 * runtime-security scope), no request's `OriginatingTaskID` ever changes, a workflow request's question
 * (`Request`, `ResponseSchema`) is the dispatcher's, only a person's own request reassigns it, its answer
 * is written only by the save that gives it, and it cannot change once given. Server
 * code acting as the step's assignee could otherwise point an answer the person gave elsewhere at the
 * step, pre-create the request the dispatcher then adopts, or rewrite the question the person answers.
 */

import { BaseEntity, EntitySaveOptions, LogError, LogStatus, Metadata, IMetadataProvider, ServerOperationScopeManager, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentRequestEntity, MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { AgentResponseForm, ConversationUtility, MJAIAgentEntityExtended, ExecuteAgentParams, TASK_GRAPH_RUNTIME_SECURITY_OPERATION } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AgentRunner } from './AgentRunner';
import { AgentWakeTriggerService } from './AgentWakeTriggerService';

/** Statuses that indicate a human has responded */
const RESPONDED_STATUSES = ['Approved', 'Rejected', 'Responded'];
/** A workflow request's question: written by the task-graph dispatcher that raises it, and by nothing else. */
const WORKFLOW_QUESTION_FIELDS = ['Request', 'ResponseSchema'];
/** A request's answer: fixed for a workflow request once it is given. */
const ANSWER_FIELDS = ['Status', 'Response', 'ResponseData'];
/** What an answer says: written to an open workflow request only by the save that answers it. */
const ANSWER_DATA_FIELDS = ['Response', 'ResponseData'];

@RegisterClass(BaseEntity, 'MJ: AI Agent Requests')
export class MJAIAgentRequestEntityServer extends MJAIAgentRequestEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateOwnership(result);
        this.validateResponderUnchanged(result);
        this.validateWorkflowRequest(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /** Whether this save answers the request: moves it into a responded status, a create included. */
    private answersRequest(): boolean {
        if (!RESPONDED_STATUSES.includes(this.Status)) {
            return false;
        }
        return !this.IsSaved || this.GetFieldByName('Status')?.OldValue !== this.Status;
    }

    /**
     * `ResponseByUserID` is the server's record of who answered ({@link Save} sets it when a save answers
     * the request), so no other save may change it, an Owner-type user's included.
     */
    private validateResponderUnchanged(result: ValidationResult): void {
        if (this.IsSaved && !this.answersRequest() && this.GetFieldByName('ResponseByUserID')?.Dirty) {
            result.Errors.push(new ValidationErrorInfo(
                'ResponseByUserID',
                'ResponseByUserID records who answered the request: the server sets it when the request is answered, and it cannot be changed.',
                this.ResponseByUserID,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
     * The workflow-request rules (see the file header): `OriginatingTaskID` never changes; outside the
     * dispatcher's scope, a workflow request cannot be created, its question cannot change, and once
     * answered its answer cannot change.
     */
    private validateWorkflowRequest(result: ValidationResult): void {
        const refuse = (field: string, message: string): void => {
            result.Errors.push(new ValidationErrorInfo(field, message, this.GetFieldByName(field)?.Value, ValidationErrorType.Failure));
        };
        if (this.IsSaved && this.GetFieldByName('OriginatingTaskID')?.Dirty) {
            refuse('OriginatingTaskID', 'OriginatingTaskID cannot change after a request is created: a workflow step settles from the requests that name it.');
            return;
        }
        if (this.OriginatingTaskID == null || this.inDispatcherScope()) {
            return;
        }
        if (!this.IsSaved) {
            refuse('OriginatingTaskID', 'Only the task-graph dispatcher raises a request for a workflow step.');
            return;
        }
        for (const field of WORKFLOW_QUESTION_FIELDS) {
            if (this.GetFieldByName(field)?.Dirty) {
                refuse(field, `${field} of a workflow step's request is the dispatcher's question and cannot be changed.`);
            }
        }
        // Who answers: a person may hand it to someone else (Reassign), but code acting as them cannot.
        if (this.GetFieldByName('RequestForUserID')?.Dirty && !ServerOperationScopeManager.Instance.IsInDirectClientCrud()) {
            refuse('RequestForUserID', "A workflow step's request is reassigned only by a person's own request.");
        }
        const storedStatus = this.GetFieldByName('Status')?.OldValue as string | null | undefined;
        if (storedStatus && RESPONDED_STATUSES.includes(storedStatus)) {
            for (const field of ANSWER_FIELDS) {
                if (this.GetFieldByName(field)?.Dirty) {
                    refuse(field, `A workflow step's request cannot change ${field} once it has been answered.`);
                }
            }
        } else if (!this.answersRequest()) {
            // Open: the answer is written by the save that gives it. Filled in beforehand, it would ride on the
            // person's approval (an approve button leaves it as it is) into the step's output as reviewed data.
            for (const field of ANSWER_DATA_FIELDS) {
                if (this.GetFieldByName(field)?.Dirty) {
                    refuse(field, `A workflow step's request takes ${field} only from the save that answers it.`);
                }
            }
        }
    }

    /** Whether this save runs inside the task-graph dispatcher's runtime-security scope, bound to its user. */
    private inDispatcherScope(): boolean {
        // No user, no scope: without one, IsOperationActive would match a frame bound to anybody.
        return this.ContextCurrentUser != null && ServerOperationScopeManager.Instance.IsOperationActive(
            [TASK_GRAPH_RUNTIME_SECURITY_OPERATION], 'MJ: AI Agent Requests', this.ContextCurrentUser,
        );
    }

    /**
     * A non-Owner-type user may only save a request that is for them: on create, the one they
     * are creating; on update, the one it was for before this save (so reassigning
     * RequestForUserID cannot bypass the gate).
     */
    private validateOwnership(result: ValidationResult): void {
        const user = this.ContextCurrentUser;
        if (!user || user.Type?.trim().toLowerCase() === 'owner') {
            return;
        }
        const preSaveOwner = (this.GetFieldByName('RequestForUserID')?.OldValue as string | null | undefined) ?? this.RequestForUserID;
        if (preSaveOwner && !UUIDsEqual(preSaveOwner, user.ID)) {
            result.Errors.push(new ValidationErrorInfo(
                'RequestForUserID',
                'An agent request is private to the user it is for — you can only create or modify your own requests.',
                this.RequestForUserID,
                ValidationErrorType.Failure
            ));
        }
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Capture pre-save state to detect status transitions
        const statusField = this.GetFieldByName('Status');
        const wasNewRecord = !this.IsSaved;
        const wasRequested = statusField?.OldValue === 'Requested' || (!this.IsSaved && statusField?.Value === 'Requested');
        const isNowResponded = RESPONDED_STATUSES.includes(this.Status);
        if (this.answersRequest()) {
            // The responder is the user this save runs as, whatever the caller wrote. On a workflow step's request it
            // is recorded only when the save is that user's own client request, and nobody when server code answers:
            // a task-graph Human step clears taint only when its assignee answered (`HumanReviewClearsTaint` in
            // @memberjunction/task-graph), the assignee is the graph's submitter, and that user's agent runs answer as
            // the same user, so only where the save came from tells a person from code. Any other request (an agent
            // answering an inter-agent request, say) keeps its responder: its OriginatingTaskID can never be set later.
            const person = ServerOperationScopeManager.Instance.IsInDirectClientCrud();
            this.ResponseByUserID = person || this.OriginatingTaskID == null ? (this.ContextCurrentUser?.ID ?? null) : null;
        }

        const saved = await super.Save(options);
        if (!saved) return false;

        // Only trigger resumption when:
        // 1. Status transitioned from 'Requested' to a responded status
        // 2. There's an originating run to resume from
        // 3. No resuming run has been created yet (guard against re-trigger)
        // 4. It is not a WORKFLOW approval. A request raised by a task graph carries
        //    OriginatingTaskID, and resuming is exactly the wrong thing for it: the graph OUTLIVES
        //    the run that submitted it, so nothing is suspended and nothing needs resuming — the
        //    dispatcher settles the waiting task and releases its dependents on the next poll.
        //    Resuming re-runs the Flow agent, which submits a BRAND-NEW graph, which raises its own
        //    new approval. Every dashboard or API approval would both settle the step (correct) and
        //    silently start a duplicate execution — observed in the wild: approving one request at
        //    13:56 produced a second, unasked-for graph at 14:05.
        const shouldResume =
            wasRequested &&
            isNowResponded &&
            this.OriginatingAgentRunID != null &&
            this.ResumingAgentRunID == null &&
            this.OriginatingTaskID == null;

        if (shouldResume) {
            // Fire-and-forget: don't block the save response
            this.resumeAgent().catch(error => {
                LogError(`Failed to resume agent for request ${this.ID}: ${(error as Error).message}`, undefined, error);
            });
        } else if (
            this.OriginatingAgentRunID == null &&
            this.ResumingAgentRunID == null &&
            this.OriginatingTaskID == null &&
            this.AgentID != null
        ) {
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            if (wasRequested && isNowResponded) {
                // Action-created approval or inter-agent request was resolved — schedule immediate AgentWake
                AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                    this,
                    this.ContextCurrentUser,
                    md
                ).catch(error => {
                    LogError(`Failed to schedule resolution wake for request ${this.ID}: ${(error as Error).message}`, undefined, error);
                });
            } else if (wasNewRecord && this.Status === 'Requested') {
                // Newly created peer-to-peer InterAgent request — schedule immediate AgentWake for target user's CoS
                AgentWakeTriggerService.Instance.TriggerWakeOnIncomingInterAgentRequest(
                    this,
                    this.ContextCurrentUser,
                    md
                ).catch(error => {
                    LogError(`Failed to schedule incoming inter-agent wake for request ${this.ID}: ${(error as Error).message}`, undefined, error);
                });
            }
        }

        return true;
    }

    /**
     * Compose a user message from Response + ResponseData and spawn a new agent
     * run via AgentRunner. Then update this request with the new run's ID.
     */
    private async resumeAgent(): Promise<void> {
        const contextUser = this.ContextCurrentUser;
        if (!contextUser) {
            LogError(`Cannot resume agent for request ${this.ID}: no context user`);
            return;
        }

        // Load the originating agent run to get AgentID and ConversationID
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const originatingRun = await md.GetEntityObject<MJAIAgentRunEntity>(
            'MJ: AI Agent Runs',
            contextUser
        );
        if (!(await originatingRun.Load(this.OriginatingAgentRunID!))) {
            LogError(`Cannot resume agent for request ${this.ID}: originating run ${this.OriginatingAgentRunID} not found`);
            return;
        }

        // Load the agent entity
        const agentEntity = await md.GetEntityObject<MJAIAgentEntityExtended>(
            'MJ: AI Agents',
            contextUser
        );
        if (!(await agentEntity.Load(originatingRun.AgentID))) {
            LogError(`Cannot resume agent for request ${this.ID}: agent ${originatingRun.AgentID} not found`);
            return;
        }

        // Compose the user message from Response + ResponseData
        const userMessage = this.composeUserMessage();

        const conversationMessages: ChatMessage[] = [];
        if (userMessage) {
            conversationMessages.push({
                role: 'user',
                content: userMessage
            });
        }

        // Plan Mode resumes must re-enable plan mode so the framework's gate re-engages and can
        // distinguish an approved plan (proceed) from a rejected one (present a revised plan). Only
        // do this when the request originated from a 'Plan' run-step — regular Chat-clarification
        // resumes stay exactly as they were (planMode left undefined). resolvePlanModeGate then reads
        // this run's request status to decide approved-vs-rejected; see base-agent.ts.
        const isPlanResume = await this.isPlanStepResume(md, contextUser);

        // The resumed run writes and reads on the fork of the message that spawned the originating run.
        const branchId = await this.resolveOriginatingBranchId(md, contextUser, originatingRun);

        // Run the agent with lastRunId to continue the conversation
        const runner = new AgentRunner();
        const allowHandoff = !(contextUser?.IsMagicLinkAnonymous || Boolean(contextUser?.WidgetGuestContext));
        const initialMessages = [...conversationMessages];
        const params: ExecuteAgentParams = {
            agent: agentEntity,
            conversationMessages: [...initialMessages],
            contextUser,
            lastRunId: this.OriginatingAgentRunID!,
            autoPopulateLastRunPayload: true,
            ...(allowHandoff ? { handoffChain: [] } : {}),
            ...(isPlanResume ? { planMode: true } : {}),
            ...(branchId ? { ConversationBranchID: branchId } : {})
        };

        LogStatus(`🔄 Resuming agent "${agentEntity.Name}" for feedback request ${this.ID}`);

        const result = await runner.RunAgentInConversation(params, {
            conversationId: originatingRun.ConversationID || undefined,
            userMessage: userMessage || undefined
        });

        // Link the new run to this request
        if (result.agentResult.agentRun?.ID) {
            this.ResumingAgentRunID = result.agentResult.agentRun.ID;
            const linkSaved = await super.Save();
            if (linkSaved) {
                LogStatus(`📋 Linked feedback request ${this.ID} → resuming run ${this.ResumingAgentRunID}`);
            } else {
                LogError(`Failed to save ResumingAgentRunID for request ${this.ID}`);
            }
        }

        if (allowHandoff && result.agentResult.handoff && result.conversationId && result.agentResponseDetailId) {
            await runner.FollowHandoffs({
                params: { ...params, conversationMessages: initialMessages },
                sourceResult: result.agentResult,
                conversationId: result.conversationId,
                sourceConversationDetailId: result.agentResponseDetailId,
                createArtifacts: true
            });
        }
    }

    /**
     * Returns the conversation branch of the message that spawned the originating run, or null
     * (Main) when the run has no conversation or message. A message that cannot be read is logged
     * and also gives null.
     */
    private async resolveOriginatingBranchId(
        md: IMetadataProvider,
        contextUser: BaseEntity['ContextCurrentUser'],
        originatingRun: MJAIAgentRunEntity
    ): Promise<string | null> {
        const detailId = originatingRun.ConversationDetailID;
        if (!originatingRun.ConversationID || !detailId) return null;
        try {
            const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', contextUser);
            if (!(await detail.Load(detailId))) {
                LogError(`Resume for request ${this.ID}: conversation detail ${detailId} of run ${originatingRun.ID} not found; resuming on Main`);
                return null;
            }
            return detail.BranchID ?? null;
        } catch (error) {
            LogError(`Resume for request ${this.ID}: failed to load conversation detail ${detailId} of run ${originatingRun.ID}; resuming on Main: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Returns true when this request originated from a Plan Mode 'Plan' run-step, meaning the
     * resumed run should re-enable plan mode (so approved-vs-rejected is honored). Fails safe to
     * false (regular resume, plan mode off) if the originating step can't be loaded — the worst case
     * is that an approved plan proceeds, which is the desired outcome anyway.
     */
    private async isPlanStepResume(md: IMetadataProvider, contextUser: BaseEntity['ContextCurrentUser']): Promise<boolean> {
        if (!this.OriginatingAgentRunStepID) return false;
        try {
            const step = await md.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', contextUser);
            if (!(await step.Load(this.OriginatingAgentRunStepID))) return false;
            return step.StepType === 'Plan';
        } catch (error) {
            LogError(`isPlanStepResume: failed to load originating step ${this.OriginatingAgentRunStepID}: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * Build a conversation message from the structured ResponseData and
     * free-text Response fields. Uses the @{_mode:"form",...} token format
     * so the conversation UI renders the response as a styled card/pill.
     *
     * The token is also understood by ConversationUtility.FormToAgentContext()
     * which converts it to structured JSON for the agent's consumption.
     */
    private composeUserMessage(): string {
        const parts: string[] = [];

        // Include structured form data as @{...} token if present
        if (this.ResponseData) {
            try {
                const data = JSON.parse(this.ResponseData) as Record<string, unknown>;
                const entries = Object.entries(data);
                if (entries.length > 0) {
                    const fields = this.buildFormResponseFields(data);
                    const title = this.resolveFormTitle();
                    parts.push(ConversationUtility.CreateFormResponse('formSubmit', fields, title));
                }
            } catch {
                // If ResponseData isn't valid JSON, include it raw
                parts.push(this.ResponseData);
            }
        }

        // Include free-text response
        if (this.Response) {
            parts.push(this.Response);
        }

        // Prefix with the action taken for clarity
        const statusPrefix = this.Status === 'Approved'
            ? 'Approved.'
            : this.Status === 'Rejected'
                ? 'Rejected.'
                : '';

        if (statusPrefix && parts.length > 0) {
            return `${statusPrefix}\n\n${parts.join('\n\n')}`;
        } else if (statusPrefix) {
            return statusPrefix;
        }

        return parts.join('\n\n');
    }

    /**
     * Build the fields array for CreateFormResponse, resolving labels from
     * the ResponseSchema when available.
     */
    private buildFormResponseFields(
        data: Record<string, unknown>
    ): Array<{ name: string; value: unknown; label?: string; type?: string; displayValue?: string }> {
        const schema = this.parseResponseSchema();

        return Object.entries(data)
            .filter(([, value]) => value != null && value !== '')
            .map(([key, value]) => {
                const question = schema?.questions.find(q => q.id === key);
                const questionType = question
                    ? (typeof question.type === 'string' ? question.type : question.type.type)
                    : undefined;

                // Resolve display value for choice types
                let displayValue: string | undefined;
                if (question && questionType && ['buttongroup', 'radio', 'dropdown', 'checkbox'].includes(questionType)) {
                    displayValue = this.resolveChoiceLabel(question, value);
                }

                return {
                    name: key,
                    value,
                    label: question?.label || key,
                    type: questionType,
                    displayValue
                };
            });
    }

    /** Parse the ResponseSchema JSON into an AgentResponseForm, or null if unavailable */
    private parseResponseSchema(): AgentResponseForm | null {
        if (!this.ResponseSchema) return null;
        try {
            return JSON.parse(this.ResponseSchema) as AgentResponseForm;
        } catch {
            return null;
        }
    }

    /** Resolve the form title from the schema */
    private resolveFormTitle(): string | undefined {
        return this.parseResponseSchema()?.title;
    }

    /** Look up the display label for a choice value from the question's options */
    private resolveChoiceLabel(
        question: AgentResponseForm['questions'][number],
        value: unknown
    ): string | undefined {
        if (typeof question.type !== 'object' || !('options' in question.type)) return undefined;
        const options = question.type.options;
        const match = options.find(o => String(o.value) === String(value));
        return match?.label;
    }
}
