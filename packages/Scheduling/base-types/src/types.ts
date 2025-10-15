/**
 * @fileoverview Core type definitions for the Scheduled Jobs system
 * @module @memberjunction/scheduling-base-types
 */

/**
 * Result returned by a scheduled job execution
 */
export interface ScheduledJobResult {
    /**
     * Whether the job completed successfully
     */
    Success: boolean;

    /**
     * Error message if the job failed
     */
    ErrorMessage?: string;

    /**
     * Job-type specific execution details
     * For Agents: { AgentRunID: string, TokensUsed: number, Cost: number }
     * For Actions: { ResultCode: string, IsSuccess: boolean, OutputParams: any }
     */
    Details?: Record<string, any>;
}

/**
 * Configuration for job-specific execution
 * Each job type defines its own configuration schema
 */
export interface ScheduledJobConfiguration {
    [key: string]: any;
}

/**
 * Configuration for Agent scheduled jobs
 */
export interface AgentJobConfiguration extends ScheduledJobConfiguration {
    AgentID: string;
    ConversationID?: string;
    StartingPayload?: any;
    InitialMessage?: string;
    ConfigurationID?: string;
    OverrideModelID?: string;
}

/**
 * Configuration for Action scheduled jobs
 */
export interface ActionJobConfiguration extends ScheduledJobConfiguration {
    ActionID: string;
    Params?: Array<{
        ActionParamID: string;
        ValueType: 'Static' | 'SQL Statement';
        Value: string;
    }>;
}

/**
 * Notification content structure
 */
export interface NotificationContent {
    Subject: string;
    Body: string;
    Priority: 'Low' | 'Normal' | 'High';
    Metadata?: Record<string, any>;
}

/**
 * Job execution status values
 */
export type ScheduledJobRunStatus = 'Running' | 'Completed' | 'Failed' | 'Cancelled' | 'Timeout';

/**
 * Schedule status values
 */
export type ScheduledJobStatus = 'Pending' | 'Active' | 'Paused' | 'Disabled' | 'Expired';

/**
 * Notification delivery channels
 */
export type NotificationChannel = 'Email' | 'InApp';
