/**
 * @fileoverview Driver for executing scheduled AI Agent jobs
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ValidationResult, UserInfo, Metadata, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
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

        // Build conversation messages - if initial message provided, add it as user message
        const conversationMessages = config.InitialMessage
            ? [{ role: 'user' as const, content: config.InitialMessage }]
            : [];

        const result = await runner.RunAgent({
            agent: agent,
            conversationMessages: conversationMessages,
            payload: config.StartingPayload,
            contextUser: context.ContextUser
        });

        // Link agent run back to scheduled job run
        if (result.agentRun.ID && context.Run.ID) {
            result.agentRun.ScheduledJobRunID = context.Run.ID;
            await result.agentRun.Save();
        }

        // Build result with agent-specific details
        return {
            Success: result.success,
            ErrorMessage: result.agentRun.ErrorMessage || undefined,
            Details: {
                AgentRunID: result.agentRun.ID,
                TokensUsed: result.agentRun.TotalTokensUsed,
                Cost: result.agentRun.TotalCost,
                ConversationID: result.agentRun.ConversationID,
                Status: result.agentRun.Status
            }
        };
    }

    public ValidateConfiguration(schedule: any): ValidationResult {
        const result = new ValidationResult();

        try {
            const config = this.parseConfiguration<AgentJobConfiguration>(schedule);

            // Validate required fields
            if (!config.AgentID) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.AgentID',
                    'AgentID is required',
                    config.AgentID,
                    ValidationErrorType.Failure
                ));
            }

            // Validate StartingPayload is valid JSON if provided
            if (config.StartingPayload) {
                try {
                    JSON.stringify(config.StartingPayload);
                } catch {
                    result.Errors.push(new ValidationErrorInfo(
                        'Configuration.StartingPayload',
                        'StartingPayload must be valid JSON',
                        config.StartingPayload,
                        ValidationErrorType.Failure
                    ));
                }
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid configuration';
            result.Errors.push(new ValidationErrorInfo(
                'Configuration',
                errorMessage,
                schedule.Configuration,
                ValidationErrorType.Failure
            ));
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

    private async loadAgent(agentId: string, contextUser: UserInfo): Promise<AIAgentEntityExtended> {
        const md = new Metadata();
        const agent = await md.GetEntityObject<AIAgentEntityExtended>('MJ: AI Agents', contextUser);
        const loaded = await agent.Load(agentId);

        if (!loaded) {
            throw new Error(`Agent with ID ${agentId} not found`);
        }

        return agent;
    }
}