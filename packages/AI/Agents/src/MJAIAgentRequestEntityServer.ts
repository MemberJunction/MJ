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
 * Request run under.
 */

import { BaseEntity, EntitySaveOptions, LogError, LogStatus, Metadata, IMetadataProvider, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentRequestEntity, MJAIAgentRunEntity, MJAIAgentRunStepEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { AgentResponseForm, ConversationUtility, MJAIAgentEntityExtended, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AgentRunner } from './AgentRunner';
import { AgentWakeTriggerService } from './AgentWakeTriggerService';

/** Statuses that indicate a human has responded */
const RESPONDED_STATUSES = ['Approved', 'Rejected', 'Responded'];

@RegisterClass(BaseEntity, 'MJ: AI Agent Requests')
export class MJAIAgentRequestEntityServer extends MJAIAgentRequestEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateOwnership(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
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
        const params: ExecuteAgentParams = {
            agent: agentEntity,
            conversationMessages,
            contextUser,
            lastRunId: this.OriginatingAgentRunID!,
            autoPopulateLastRunPayload: true,
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
