/**
 * @fileoverview Base class for all scheduled job implementations
 * @module @memberjunction/scheduling-engine
 */

import { LogError, LogStatusEx, IsVerboseLoggingEnabled, ValidationResult, UserInfo, Metadata, IMetadataProvider } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity, MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { ScheduledJobResult, ScheduledJobConfiguration, NotificationContent } from '@memberjunction/scheduling-base-types';

/**
 * Context passed to job execution
 */
export interface ScheduledJobExecutionContext {
    Schedule: MJScheduledJobEntity;
    Run: MJScheduledJobRunEntity;
    ContextUser: UserInfo;

    /**
     * Heartbeat the running job's lease (GH #2749). Calling this signals that
     * the plugin is still making forward progress, pushing the lock's
     * `ExpectedCompletionAt` further into the future so the scheduling engine's
     * sweep does not reclaim this job's concurrency slot.
     *
     * Contract:
     * - **OPT-IN.** A plugin that never calls `heartbeat` falls back to today's
     *   fixed acquire-time lease behavior — nothing breaks.
     * - **SELF-THROTTLING.** Safe to call on every loop iteration / progress
     *   tick; an effective DB write happens at most once per ~5 minutes
     *   regardless of call frequency. Cheap no-op the rest of the time.
     * - **NEVER THROWS.** Swallows and logs its own errors. A best-effort lease
     *   renewal must never fault the actual job, so callers can fire-and-forget
     *   it (`void context.heartbeat?.()`).
     * - **NO-OP in Concurrent mode.** When the job runs under
     *   `ConcurrencyMode='Concurrent'` there is no lock to extend, so this does
     *   nothing.
     *
     * The engine ALWAYS supplies this when it runs a job, so inside `Execute`
     * plugins may call `context.heartbeat!()` directly. The `?` only covers
     * `ScheduledJobExecutionContext` literals built by hand (e.g. unit tests).
     *
     * IMPORTANT: renewal MUST be driven by the plugin's own forward progress —
     * the engine deliberately does NOT auto-heartbeat at `await` boundaries,
     * because an auto-beat would keep renewing the lease while a plugin is
     * wedged in `await something()`, masking exactly the hang we want to detect.
     */
    heartbeat?: () => Promise<void>;
}

/**
 * Abstract base class for scheduled job implementations
 *
 * Each ScheduledJobType in the database has a corresponding DriverClass that extends this base.
 * The plugin is responsible for:
 * - Parsing job-specific configuration from the Configuration JSON field
 * - Executing the job with appropriate domain logic
 * - Formatting notifications in a job-appropriate way
 * - Validating job-specific configuration
 *
 * @abstract
 * @example
 * ```typescript
 * @RegisterClass(BaseScheduledJob, 'ScheduledJobAgent')
 * export class ScheduledJobAgent extends BaseScheduledJob {
 *     async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
 *         const config = this.parseConfiguration<AgentJobConfiguration>(context.Schedule);
 *         const agentRun = await this.runAgent(config, context.ContextUser);
 *         return {
 *             Success: agentRun.Success ?? false,
 *             ErrorMessage: agentRun.ErrorMessage,
 *             Details: {
 *                 AgentRunID: agentRun.ID,
 *                 TokensUsed: agentRun.TotalTokensUsed,
 *                 Cost: agentRun.TotalCost
 *             }
 *         };
 *     }
 * }
 * ```
 */
export abstract class BaseScheduledJob {
    /**
     * Execute the scheduled job
     *
     * This is the main entry point for job execution. The plugin should:
     * 1. Parse the Configuration JSON from context.Schedule
     * 2. Perform the job-specific work
     * 3. Return a ScheduledJobResult with Success, ErrorMessage, and Details
     *
     * The Details object will be serialized to JSON and stored in ScheduledJobRun.Details
     *
     * @param context - Execution context including schedule, run record, and user
     * @returns Promise resolving to execution result
     */
    abstract Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult>;

    /**
     * Validate job-specific configuration
     *
     * Called when creating or updating a scheduled job to ensure the Configuration JSON
     * is valid for this job type.
     *
     * @param schedule - The schedule being validated
     * @returns Validation result with any errors or warnings
     */
    abstract ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult;

    /**
     * Format notification content for job completion
     *
     * Called by the engine when notifications are enabled and should be sent.
     * The plugin can customize the notification based on the job type and execution result.
     *
     * @param context - Execution context
     * @param result - The execution result
     * @returns Notification content
     */
    abstract FormatNotification(
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult
    ): NotificationContent;

    /**
     * Parse and validate the Configuration JSON field
     *
     * Helper method for plugins to parse their configuration with type safety.
     * Throws if configuration is invalid.
     *
     * @template T - The configuration type
     * @param schedule - The schedule containing the configuration
     * @returns Parsed configuration
     * @throws Error if configuration is missing or invalid
     * @protected
     */
    protected parseConfiguration<T extends ScheduledJobConfiguration>(
        schedule: MJScheduledJobEntity
    ): T {
        if (!schedule.Configuration) {
            throw new Error(`Configuration is required for job type`);
        }

        try {
            return JSON.parse(schedule.Configuration) as T;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Invalid Configuration JSON: ${errorMessage}`);
        }
    }

    /**
     * Get the job type entity for this plugin
     *
     * @param schedule - The schedule
     * @param contextUser - User context
     * @returns Promise resolving to the job type entity
     * @protected
     */
    protected async getJobType(
        schedule: MJScheduledJobEntity,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<MJScheduledJobTypeEntity> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const jobType = await md.GetEntityObject<MJScheduledJobTypeEntity>('MJ: Scheduled Job Types', contextUser);
        await jobType.Load(schedule.JobTypeID);
        return jobType;
    }

    /**
     * Log execution progress
     *
     * @param message - Log message
     * @param verboseOnly - Whether to only log in verbose mode
     * @protected
     */
    protected log(message: string, verboseOnly: boolean = false): void {
        LogStatusEx({
            message: `[${this.constructor.name}] ${message}`,
            verboseOnly,
            isVerboseEnabled: () => IsVerboseLoggingEnabled()
        });
    }

    /**
     * Log execution error
     *
     * @param message - Error message
     * @param error - Optional error object
     * @protected
     */
    protected logError(message: string, error?: any): void {
        LogError(`[${this.constructor.name}] ${message}`, undefined, error);
    }
}
