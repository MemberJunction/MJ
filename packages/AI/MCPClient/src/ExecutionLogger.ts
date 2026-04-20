/**
 * @fileoverview Execution logging for MCP tool calls
 *
 * Handles logging of all MCP tool executions to the database for
 * debugging, analytics, and audit purposes.
 *
 * @module @memberjunction/ai-mcp-client/ExecutionLogger
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJMCPToolExecutionLogEntity } from '@memberjunction/core-entities';
import type { MCPLoggingConfig, MCPToolCallResult, MCPExecutionLogEntry } from './types.js';

/**
 * ExecutionLogger handles logging of MCP tool calls to the database.
 *
 * Features:
 * - Configurable logging per connection (inputs, outputs)
 * - Automatic output truncation for large responses
 * - Async logging to avoid blocking tool execution
 * - Error resilience (logging failures don't break tool calls)
 *
 * @example
 * ```typescript
 * const logger = new ExecutionLogger();
 *
 * // Start logging before tool call
 * const logEntry = await logger.startLog(connectionId, toolName, params, contextUser);
 *
 * // ... execute tool ...
 *
 * // Complete log after tool call
 * await logger.completeLog(logEntry.id, result);
 * ```
 */
export class ExecutionLogger {
    /** Entity name for MCP Tool Execution Logs */
    private static readonly LOG_ENTITY_NAME = 'MJ: MCP Tool Execution Logs';

    /** Default max output log size (100KB) */
    private static readonly DEFAULT_MAX_OUTPUT_SIZE = 102400;

    /** Pending log writes for async completion */
    private readonly pendingLogs: Map<string, MCPExecutionLogEntry> = new Map();

    /**
     * Creates a new log entry at the start of tool execution
     *
     * @param connectionId - MCP connection ID
     * @param toolId - MCP tool ID (if available)
     * @param toolName - Tool name
     * @param inputParams - Input parameters
     * @param config - Logging configuration
     * @param contextUser - User context
     * @returns Log entry ID for later completion
     */
    async startLog(
        connectionId: string,
        toolId: string | undefined,
        toolName: string,
        inputParams: Record<string, unknown>,
        config: MCPLoggingConfig,
        contextUser: UserInfo
    ): Promise<string | null> {
        // Skip if logging disabled
        if (!config.logToolCalls) {
            return null;
        }

        try {
            const md = new Metadata();
            const logEntity = await md.GetEntityObject<MJMCPToolExecutionLogEntity>(
                ExecutionLogger.LOG_ENTITY_NAME,
                contextUser
            );
            logEntity.NewRecord();
            logEntity.MCPServerConnectionID = connectionId;
            logEntity.MCPServerToolID = toolId ?? null;
            logEntity.ToolName = toolName;
            logEntity.UserID = contextUser.ID;
            logEntity.StartedAt = new Date();
            logEntity.Success = false; // Will be updated on completion
            logEntity.OutputTruncated = false;

            // Log input parameters if enabled
            if (config.logInputParameters) {
                logEntity.InputParameters = JSON.stringify(inputParams);
            }

            const saved = await logEntity.Save();
            if (!saved) {
                console.error('[MCPClient] Failed to create execution log entry:', logEntity.LatestResult?.Message);
                return null;
            }

            // Cache the entry for completion
            const entry: MCPExecutionLogEntry = {
                connectionId,
                toolId,
                toolName,
                userId: contextUser.ID,
                startedAt: new Date(),
                success: false,
                outputTruncated: false
            };
            this.pendingLogs.set(logEntity.ID, entry);

            return logEntity.ID;
        } catch (error) {
            // Log error but don't fail the tool call
            console.error('[MCPClient] Error creating execution log:', error);
            return null;
        }
    }

    /**
     * Completes a log entry after tool execution
     *
     * @param logId - Log entry ID from startLog
     * @param result - Tool call result
     * @param config - Logging configuration
     * @param contextUser - User context
     */
    async completeLog(
        logId: string | null,
        result: MCPToolCallResult,
        config: MCPLoggingConfig,
        contextUser: UserInfo
    ): Promise<void> {
        if (!logId || !config.logToolCalls) {
            return;
        }

        try {
            const md = new Metadata();
            const logEntity = await md.GetEntityObject<MJMCPToolExecutionLogEntity>(
                ExecutionLogger.LOG_ENTITY_NAME,
                contextUser
            );

            const loaded = await logEntity.Load(logId);
            if (!loaded) {
                console.error('[MCPClient] Failed to load execution log for completion:', logId);
                return;
            }

            logEntity.EndedAt = new Date();
            logEntity.DurationMs = result.durationMs;
            logEntity.Success = result.success && !result.isToolError;

            // Set error message if failed
            if (!result.success || result.isToolError) {
                logEntity.ErrorMessage = result.error ?? 'Tool execution failed';
            }

            // Log output content if enabled
            if (config.logOutputContent) {
                const outputData = {
                    content: result.content,
                    structuredContent: result.structuredContent,
                    isToolError: result.isToolError
                };

                const outputJson = JSON.stringify(outputData);
                const maxSize = config.maxOutputLogSize ?? ExecutionLogger.DEFAULT_MAX_OUTPUT_SIZE;

                if (outputJson.length > maxSize) {
                    logEntity.OutputContent = outputJson.substring(0, maxSize);
                    logEntity.OutputTruncated = true;
                } else {
                    logEntity.OutputContent = outputJson;
                    logEntity.OutputTruncated = false;
                }
            }

            const saved = await logEntity.Save();
            if (!saved) {
                console.error('[MCPClient] Failed to complete execution log:', logEntity.LatestResult?.Message);
            }

            // Remove from pending
            this.pendingLogs.delete(logId);
        } catch (error) {
            console.error('[MCPClient] Error completing execution log:', error);
        }
    }

    /**
     * Marks a log entry as failed due to an error
     *
     * @param logId - Log entry ID
     * @param error - Error that occurred
     * @param durationMs - Duration before failure
     * @param contextUser - User context
     */
    async failLog(
        logId: string | null,
        error: Error | string,
        durationMs: number,
        contextUser: UserInfo
    ): Promise<void> {
        if (!logId) {
            return;
        }

        try {
            const md = new Metadata();
            const logEntity = await md.GetEntityObject<MJMCPToolExecutionLogEntity>(
                ExecutionLogger.LOG_ENTITY_NAME,
                contextUser
            );

            const loaded = await logEntity.Load(logId);
            if (!loaded) {
                return;
            }

            logEntity.EndedAt = new Date();
            logEntity.DurationMs = durationMs;
            logEntity.Success = false;
            logEntity.ErrorMessage = error instanceof Error ? error.message : String(error);
            logEntity.OutputTruncated = false;

            await logEntity.Save();
            this.pendingLogs.delete(logId);
        } catch (logError) {
            console.error('[MCPClient] Error failing execution log:', logError);
        }
    }

    /**
     * Gets recent execution logs for a connection
     *
     * @param connectionId - MCP connection ID
     * @param limit - Maximum number of logs to return
     * @param contextUser - User context
     * @returns Recent log entries
     */
    async getRecentLogs(
        connectionId: string,
        limit: number,
        contextUser: UserInfo
    ): Promise<MCPExecutionLogSummary[]> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MCPExecutionLogSummary>({
                EntityName: ExecutionLogger.LOG_ENTITY_NAME,
                ExtraFilter: `MCPServerConnectionID = '${connectionId}'`,
                OrderBy: 'StartedAt DESC',
                MaxRows: limit,
                ResultType: 'simple',
                Fields: ['ID', 'ToolName', 'StartedAt', 'EndedAt', 'DurationMs', 'Success', 'ErrorMessage']
            }, contextUser);

            if (!result.Success) {
                console.error('[MCPClient] Failed to get recent logs:', result.ErrorMessage);
                return [];
            }

            return result.Results ?? [];
        } catch (error) {
            console.error('[MCPClient] Error getting recent logs:', error);
            return [];
        }
    }

    /**
     * Gets execution statistics for a connection
     *
     * @param connectionId - MCP connection ID
     * @param sinceDays - Number of days to look back
     * @param contextUser - User context
     * @returns Execution statistics
     */
    async getStats(
        connectionId: string,
        sinceDays: number,
        contextUser: UserInfo
    ): Promise<MCPExecutionStats> {
        const stats: MCPExecutionStats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            averageDurationMs: 0,
            toolBreakdown: {}
        };

        try {
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - sinceDays);
            const sinceDateStr = sinceDate.toISOString();

            const rv = new RunView();
            const result = await rv.RunView<MCPExecutionLogForStats>({
                EntityName: ExecutionLogger.LOG_ENTITY_NAME,
                ExtraFilter: `MCPServerConnectionID = '${connectionId}' AND StartedAt >= '${sinceDateStr}'`,
                ResultType: 'simple',
                Fields: ['ToolName', 'Success', 'DurationMs']
            }, contextUser);

            if (!result.Success || !result.Results) {
                return stats;
            }

            const logs = result.Results;
            stats.totalCalls = logs.length;

            let totalDuration = 0;

            for (const log of logs) {
                if (log.Success) {
                    stats.successfulCalls++;
                } else {
                    stats.failedCalls++;
                }

                if (log.DurationMs) {
                    totalDuration += log.DurationMs;
                }

                // Tool breakdown
                if (!stats.toolBreakdown[log.ToolName]) {
                    stats.toolBreakdown[log.ToolName] = {
                        calls: 0,
                        successes: 0,
                        failures: 0,
                        avgDurationMs: 0,
                        totalDurationMs: 0
                    };
                }

                const toolStats = stats.toolBreakdown[log.ToolName];
                toolStats.calls++;
                if (log.Success) {
                    toolStats.successes++;
                } else {
                    toolStats.failures++;
                }
                if (log.DurationMs) {
                    toolStats.totalDurationMs += log.DurationMs;
                }
            }

            // Calculate averages
            if (stats.totalCalls > 0) {
                stats.averageDurationMs = Math.round(totalDuration / stats.totalCalls);
            }

            for (const toolName in stats.toolBreakdown) {
                const toolStats = stats.toolBreakdown[toolName];
                if (toolStats.calls > 0) {
                    toolStats.avgDurationMs = Math.round(toolStats.totalDurationMs / toolStats.calls);
                }
            }

            return stats;
        } catch (error) {
            console.error('[MCPClient] Error getting execution stats:', error);
            return stats;
        }
    }

    /**
     * Cleans up old log entries
     *
     * @param connectionId - MCP connection ID (optional, cleans all if not specified)
     * @param olderThanDays - Delete logs older than this many days
     * @param contextUser - User context
     * @returns Number of deleted entries
     */
    async cleanup(
        connectionId: string | undefined,
        olderThanDays: number,
        contextUser: UserInfo
    ): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            const cutoffDateStr = cutoffDate.toISOString();

            let filter = `StartedAt < '${cutoffDateStr}'`;
            if (connectionId) {
                filter += ` AND MCPServerConnectionID = '${connectionId}'`;
            }

            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: ExecutionLogger.LOG_ENTITY_NAME,
                ExtraFilter: filter,
                ResultType: 'simple',
                Fields: ['ID']
            }, contextUser);

            if (!result.Success || !result.Results) {
                return 0;
            }

            const md = new Metadata();
            let deleted = 0;

            for (const log of result.Results) {
                try {
                    const logEntity = await md.GetEntityObject<MJMCPToolExecutionLogEntity>(
                        ExecutionLogger.LOG_ENTITY_NAME,
                        contextUser
                    );
                    const loaded = await logEntity.Load(log.ID);
                    if (loaded) {
                        const deleteResult = await logEntity.Delete();
                        if (deleteResult) {
                            deleted++;
                        }
                    }
                } catch {
                    // Continue with other deletions
                }
            }

            return deleted;
        } catch (error) {
            console.error('[MCPClient] Error cleaning up logs:', error);
            return 0;
        }
    }
}

/**
 * Summary of an execution log entry (for listing)
 */
export interface MCPExecutionLogSummary {
    ID: string;
    ToolName: string;
    StartedAt: Date;
    EndedAt: Date | null;
    DurationMs: number | null;
    Success: boolean;
    ErrorMessage: string | null;
}

/**
 * Execution log fields needed for stats calculation
 */
interface MCPExecutionLogForStats {
    ToolName: string;
    Success: boolean;
    DurationMs: number | null;
}

/**
 * Execution statistics for a connection
 */
export interface MCPExecutionStats {
    /** Total number of calls */
    totalCalls: number;
    /** Number of successful calls */
    successfulCalls: number;
    /** Number of failed calls */
    failedCalls: number;
    /** Average duration in milliseconds */
    averageDurationMs: number;
    /** Breakdown by tool */
    toolBreakdown: Record<string, MCPToolStats>;
}

/**
 * Statistics for a specific tool
 */
export interface MCPToolStats {
    /** Number of calls */
    calls: number;
    /** Number of successes */
    successes: number;
    /** Number of failures */
    failures: number;
    /** Average duration in milliseconds */
    avgDurationMs: number;
    /** Total duration for average calculation */
    totalDurationMs: number;
}
