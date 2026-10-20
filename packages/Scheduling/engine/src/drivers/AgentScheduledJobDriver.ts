/**
 * @fileoverview Driver for executing scheduled AI Agent jobs
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass, IsValidUUID } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ValidationResult, UserInfo, Metadata, ValidationErrorInfo, ValidationErrorType, IMetadataProvider } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
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
 *   CompanyID?: string,
 *   OverrideModelID?: string
 * }
 *
 * All four optional ID fields (`ConfigurationID`, `CompanyID`, `ConversationID`,
 * `OverrideModelID`) are validated as UUIDs by `ValidateConfiguration` and
 * forwarded to `AgentRunner.RunAgent` (`configurationId`, `companyId`,
 * `conversationId`, and `override: { modelId }`).
 *
 * Execution result details (stored in ScheduledJobRun.Details):
 * {
 *   AgentRunID: string,
 *   TokensUsed: number,
 *   Cost: number,
 *   ConversationID?: string
 * }
 */
interface GlobalUserCacheLookup {
    Users: UserInfo[];
    FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined>;
}

@RegisterClass(BaseScheduledJob, 'AgentScheduledJobDriver')
export class AgentScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        // Parse agent-specific configuration
        const config = this.parseConfiguration<AgentJobConfiguration>(context.Schedule);

        // Resolve the schedule owner's UserInfo when OwnerUserID is specified
        const executionUser = await this.resolveScheduleOwnerUser(context.Schedule, context.ContextUser);

        // Load the agent entity
        const agent = await this.loadAgent(config.AgentID, executionUser);

        // A workflow SUBMITS and detaches — it returns a handle as soon as its steps are scheduled,
        // not a result. A scheduled job that ran one would record success the moment the graph was
        // written, before any of the work happened: the job history would show a clean run every
        // time regardless of whether the workflow later succeeded, failed or stalled. That is worse
        // than not running it, because it looks like it worked.
        //
        // Refused here rather than at submission because this is where the caller's expectation
        // lives: the job expects a completed unit of work, and nothing downstream of this point can
        // supply one until an await path exists.
        if ((agent.Type ?? '').trim().toLowerCase() === 'flow') {
            const message =
                `'${agent.Name}' is a workflow and cannot be run on a schedule yet. A workflow returns ` +
                `as soon as its steps are scheduled, so this job would report success before any of the ` +
                `work had happened. Schedule the steps individually, or start the workflow by hand.`;
            this.log(message);
            return { Success: false, ErrorMessage: message, Details: { AgentID: config.AgentID } };
        }

        // Verbose-only: the engine's always-on "▶️ Starting / ✅ Completed" pair already frames this
        // run. This per-agent detail is redundant noise on routine (often no-op) scheduled runs.
        this.log(`Executing agent: ${agent.Name}`, true);

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
            contextUser: executionUser,
            ...(config.ConfigurationID !== undefined ? { configurationId: config.ConfigurationID } : {}),
            ...(config.CompanyID !== undefined ? { companyId: config.CompanyID } : {}),
            ...(config.ConversationID !== undefined ? { conversationId: config.ConversationID } : {}),
            ...(config.OverrideModelID !== undefined ? { override: { modelId: config.OverrideModelID } } : {}),
            // Heartbeat the lease on every agent step (prompt / action / sub-agent /
            // decision) so a healthy long-running agent keeps its concurrency slot
            // (GH #2749). Fire-and-forget is safe — context.heartbeat never throws
            // and self-throttles to an effective beat at most every ~5 min.
            onProgress: () => { void context.heartbeat?.(); }
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

            // Validate optional UUID fields
            const optionalUuidFields: Array<keyof Pick<
                AgentJobConfiguration,
                'ConfigurationID' | 'CompanyID' | 'ConversationID' | 'OverrideModelID'
            >> = ['ConfigurationID', 'CompanyID', 'ConversationID', 'OverrideModelID'];

            for (const field of optionalUuidFields) {
                const value = config[field];
                if (value !== undefined && (typeof value !== 'string' || !IsValidUUID(value))) {
                    result.Errors.push(new ValidationErrorInfo(
                        `Configuration.${field}`,
                        `${field} must be a valid UUID when provided (received "${String(value)}")`,
                        value,
                        ValidationErrorType.Failure
                    ));
                }
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

    private async loadAgent(agentId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<MJAIAgentEntityExtended> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const agent = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', contextUser);
        const loaded = await agent.Load(agentId);

        if (!loaded) {
            throw new Error(`Agent with ID ${agentId} not found`);
        }

        return agent;
    }

    /**
     * Resolves the schedule owner's UserInfo when `schedule.OwnerUserID` is specified,
     * ensuring scheduled agent runs execute under the schedule owner's security context
     * rather than the background scheduler daemon user.
     */
    protected async resolveScheduleOwnerUser(
        schedule: { ID?: string; Name?: string; OwnerUserID?: string | null },
        fallbackContextUser: UserInfo
    ): Promise<UserInfo> {
        const ownerUserID = schedule.OwnerUserID?.trim();
        if (!ownerUserID) {
            return fallbackContextUser;
        }
        if (fallbackContextUser?.ID && fallbackContextUser.ID.trim().toLowerCase() === ownerUserID.toLowerCase()) {
            return fallbackContextUser;
        }
        const userCache = (globalThis as { ___SINGLETON__UserCache?: GlobalUserCacheLookup }).___SINGLETON__UserCache;
        if (userCache && typeof userCache.FindUser === 'function') {
            const ownerUser = await userCache.FindUser({ ID: ownerUserID });
            if (ownerUser) {
                if (ownerUser.IsActive === false) {
                    throw new Error(
                        `Cannot execute scheduled agent job "${schedule.Name ?? schedule.ID}": owner user ${ownerUserID} is inactive.`
                    );
                }
                return ownerUser;
            }
            if (Array.isArray(userCache.Users) && userCache.Users.length > 0) {
                throw new Error(
                    `Cannot execute scheduled agent job "${schedule.Name ?? schedule.ID}": owner user ${ownerUserID} not found in UserCache.`
                );
            }
        }
        return fallbackContextUser;
    }
}