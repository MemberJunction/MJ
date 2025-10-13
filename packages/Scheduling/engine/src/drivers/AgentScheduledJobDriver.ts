/**
 * @fileoverview Driver for executing scheduled AI Agent jobs
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ValidationResult, UserInfo, Metadata } from '@memberjunction/core';
import { AIAgentEntity, AIAgentRunEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import {
    ScheduledJobResult,
    NotificationContent,
    AgentJobConfiguration
} from '@memberjunction/scheduling-base-types';

/**
 * Driver for executing scheduled AI Agent jobs
 *
 * Configuration schema (stored in ScheduledJob.Configuration):
 * {
 *   AgentID: string,
 *   ConversationID?: string,
 *   StartingPayload?: any,
 *   InitialMessage?: string,
 *   ConfigurationID?: string,
 *   OverrideModelID?: string
 * }
 *
 * Execution result details (stored in ScheduledJobRun.Details):
 * {
 *   AgentRunID: string,
 *   TokensUsed: number,
 *   Cost: number,
 *   ConversationID?: string
 * }
 */
@RegisterClass(BaseScheduledJob, 'AgentScheduledJobDriver')
export class AgentScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        // Parse agent-specific configuration
        const config = this.parseConfiguration<AgentJobConfiguration>(context.Schedule);

        // Load the agent entity
        const agent = await this.loadAgent(config.AgentID, context.ContextUser);

        this.log(`Executing agent: ${agent.Name}`);

        // Execute the agent
        const runner = new AgentRunner();
        const agentRun = await runner.RunAgent({
            agent: agent,
            conversationID: config.ConversationID,
            initialMessage: config.InitialMessage,
            startingPayload: config.StartingPayload,
            configurationID: config.ConfigurationID,
            overrideModelID: config.OverrideModelID,
            contextUser: context.ContextUser
        });

        // Link agent run back to scheduled job run
        if (agentRun.ID && context.Run.ID) {
            agentRun.ScheduledJobRunID = context.Run.ID;
            await agentRun.Save();
        }

        // Build result with agent-specific details
        return {
            Success: agentRun.Success ?? false,
            ErrorMessage: agentRun.ErrorMessage || undefined,
            Details: {
                AgentRunID: agentRun.ID,
                TokensUsed: agentRun.TotalTokensUsed,
                Cost: agentRun.TotalCost,
                ConversationID: agentRun.ConversationID,
                Status: agentRun.Status
            }
        };
    }

    public ValidateConfiguration(schedule: any): ValidationResult {
        const result = new ValidationResult();

        try {
            const config = this.parseConfiguration<AgentJobConfiguration>(schedule);

            // Validate required fields
            if (!config.AgentID) {
                result.AddError('Configuration.AgentID', 'AgentID is required');
            }

            // Validate StartingPayload is valid JSON if provided
            if (config.StartingPayload) {
                try {
                    JSON.stringify(config.StartingPayload);
                } catch {
                    result.AddError('Configuration.StartingPayload', 'StartingPayload must be valid JSON');
                }
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid configuration';
            result.AddError('Configuration', errorMessage);
        }

        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult
    ): NotificationContent {
        const config = this.parseConfiguration<AgentJobConfiguration>(context.Schedule);
        const details = result.Details as any;

        const subject = result.Success
            ? `Scheduled Agent Completed: ${context.Schedule.Name}`
            : `Scheduled Agent Failed: ${context.Schedule.Name}`;

        const body = result.Success
            ? `The scheduled agent "${context.Schedule.Name}" completed successfully.\n\n` +
              `Tokens Used: ${details?.TokensUsed || 'N/A'}\n` +
              `Cost: $${details?.Cost?.toFixed(6) || 'N/A'}\n` +
              `Agent Run ID: ${details?.AgentRunID}`
            : `The scheduled agent "${context.Schedule.Name}" failed.\n\n` +
              `Error: ${result.ErrorMessage}\n` +
              `Agent Run ID: ${details?.AgentRunID || 'N/A'}`;

        return {
            Subject: subject,
            Body: body,
            Priority: result.Success ? 'Normal' : 'High',
            Metadata: {
                ScheduleID: context.Schedule.ID,
                JobType: 'Agent',
                AgentID: config.AgentID,
                AgentRunID: details?.AgentRunID
            }
        };
    }

    private async loadAgent(agentId: string, contextUser: UserInfo): Promise<AIAgentEntity> {
        const md = new Metadata();
        const agent = await md.GetEntityObject<AIAgentEntity>('AI Agents', contextUser);
        const loaded = await agent.Load(agentId);

        if (!loaded) {
            throw new Error(`Agent with ID ${agentId} not found`);
        }

        return agent;
    }
}

/**
 * Loader function to ensure this driver is registered
 * Prevents tree-shaking from removing the class
 */
export function LoadAgentScheduledJobDriver(): void {
    // No-op function, just ensures class is loaded
}
