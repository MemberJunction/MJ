/**
 * @fileoverview Action to execute a tool on an MCP server
 *
 * This action provides a workflow/agent interface for invoking tools
 * on external MCP servers via MCPClientManager.
 *
 * @module @memberjunction/actions/mcp/execute-mcp-tool
 */

import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { LogError } from "@memberjunction/core";
import { MCPClientManager } from "@memberjunction/ai-mcp-client";

/**
 * Action to execute a tool on an MCP server.
 *
 * This action connects to an MCP server (if not already connected),
 * calls the specified tool with provided arguments, and returns the result.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Execute MCP Tool',
 *   Params: [
 *     { Name: 'ConnectionID', Value: 'connection-uuid' },
 *     { Name: 'ToolName', Value: 'search_documents' },
 *     { Name: 'Arguments', Value: { query: 'MJ documentation', maxResults: 10 } }
 *   ]
 * });
 * ```
 *
 * **Parameters:**
 * - `ConnectionID` (required): UUID of the MCP Server Connection to use
 * - `ToolName` (required): Name of the tool to execute
 * - `Arguments` (optional): Object with tool input parameters
 * - `Timeout` (optional): Request timeout in milliseconds (default: 60000)
 *
 * **Result:**
 * - Success: Tool output in Message as JSON
 * - Output params include: `ToolOutput`, `DurationMs`, `IsToolError`
 */
@RegisterClass(BaseAction, "Execute MCP Tool")
export class ExecuteMCPToolAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const connectionId = this.getStringParam(params, 'ConnectionID');
            const toolName = this.getStringParam(params, 'ToolName');
            const arguments_ = this.getObjectParam(params, 'Arguments') ?? {};
            const timeout = this.getNumericParam(params, 'Timeout', 60000);

            // Validate required parameters
            if (!connectionId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'ConnectionID' is required"
                };
            }

            if (!toolName) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'ToolName' is required"
                };
            }

            // Get the MCP Client Manager
            const manager = MCPClientManager.Instance;

            // Ensure we're connected (will connect if not already)
            if (!manager.isConnected(connectionId)) {
                await manager.connect(connectionId, {
                    contextUser: params.ContextUser,
                    skipAutoSync: true // Don't auto-sync when just calling tools
                });
            }

            // Call the tool
            const result = await manager.callTool(
                connectionId,
                toolName,
                {
                    arguments: arguments_ as Record<string, unknown>,
                    timeout
                },
                { contextUser: params.ContextUser }
            );

            // Add output parameters
            this.addOutputParam(params, 'ToolOutput', result.content);
            this.addOutputParam(params, 'StructuredOutput', result.structuredContent);
            this.addOutputParam(params, 'DurationMs', result.durationMs);
            this.addOutputParam(params, 'IsToolError', result.isToolError);

            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: result.isToolError ? 'TOOL_ERROR' : 'EXECUTION_FAILED',
                    Message: result.error ?? 'Tool execution failed',
                    Params: params.Params
                };
            }

            // Format output message
            const output = result.structuredContent ?? result.content;
            const message = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message,
                Params: params.Params
            };

        } catch (error) {
            LogError(`[ExecuteMCPToolAction] Error: ${error}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: error instanceof Error ? error.message : String(error)
            };
        }
    }

    // Helper methods for parameter extraction

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return undefined;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    private getObjectParam(params: RunActionParams, name: string): Record<string, unknown> | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return undefined;
        }

        // Handle both JSON string and object input
        if (typeof param.Value === 'string') {
            try {
                return JSON.parse(param.Value);
            } catch {
                return undefined;
            }
        }

        if (typeof param.Value === 'object') {
            return param.Value as Record<string, unknown>;
        }

        return undefined;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }
}

/**
 * Loader function to prevent tree-shaking
 */
export function LoadExecuteMCPToolAction(): void {
    // Intentionally empty - ensures decorator executes
}
