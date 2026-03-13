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
 */

import { BaseEntity, EntitySaveOptions, LogError, LogStatus, Metadata, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAIAgentRequestEntity, MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AgentRunner } from './AgentRunner';

/** Statuses that indicate a human has responded */
const RESPONDED_STATUSES = ['Approved', 'Rejected', 'Responded'];

@RegisterClass(BaseEntity, 'MJ: AI Agent Requests')
export class MJAIAgentRequestEntityServer extends MJAIAgentRequestEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Capture pre-save state to detect status transitions
        const statusField = this.GetFieldByName('Status');
        const wasRequested = statusField?.OldValue === 'Requested' || (!this.IsSaved && statusField?.Value === 'Requested');
        const isNowResponded = RESPONDED_STATUSES.includes(this.Status);

        const saved = await super.Save(options);
        if (!saved) return false;

        // Only trigger resumption when:
        // 1. Status transitioned from 'Requested' to a responded status
        // 2. There's an originating run to resume from
        // 3. No resuming run has been created yet (guard against re-trigger)
        const shouldResume =
            wasRequested &&
            isNowResponded &&
            this.OriginatingAgentRunID != null &&
            this.ResumingAgentRunID == null;

        if (shouldResume) {
            // Fire-and-forget: don't block the save response
            this.resumeAgent().catch(error => {
                LogError(`Failed to resume agent for request ${this.ID}: ${(error as Error).message}`, undefined, error);
            });
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
        const md = new Metadata();
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

        // Run the agent with lastRunId to continue the conversation
        const runner = new AgentRunner();
        const params: ExecuteAgentParams = {
            agent: agentEntity,
            conversationMessages,
            contextUser,
            lastRunId: this.OriginatingAgentRunID!,
            autoPopulateLastRunPayload: true
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
     * Build a human-readable message from the structured ResponseData and
     * free-text Response fields. This becomes the user message in the
     * conversation when the agent resumes.
     */
    private composeUserMessage(): string {
        const parts: string[] = [];

        // Include structured form data if present
        if (this.ResponseData) {
            try {
                const data = JSON.parse(this.ResponseData) as Record<string, unknown>;
                const entries = Object.entries(data);
                if (entries.length > 0) {
                    const formattedEntries = entries
                        .map(([key, value]) => `${key}: ${String(value ?? '')}`)
                        .join('\n');
                    parts.push(formattedEntries);
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
}
