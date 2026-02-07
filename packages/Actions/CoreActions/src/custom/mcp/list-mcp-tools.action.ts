/**
 * @fileoverview Action to list available tools from an MCP server
 *
 * This action retrieves the list of tools available from an MCP server
 * connection, useful for discovery and documentation purposes.
 *
 * @module @memberjunction/actions/mcp/list-mcp-tools
 */

import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { LogError } from "@memberjunction/core";
import { MCPClientManager } from "@memberjunction/ai-mcp-client";

/**
 * Action to list available tools from an MCP server.
 *
 * This action connects to an MCP server and retrieves the list of
 * available tools with their names, descriptions, and input schemas.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'List MCP Tools',
 *   Params: [
 *     { Name: 'ConnectionID', Value: 'connection-uuid' }
 *   ]
 * });
 * ```
 *
 * **Parameters:**
 * - `ConnectionID` (required): UUID of the MCP Server Connection to query
 *
 * **Result:**
 * - Success: Tool list in Message as JSON
 * - Output params include: `Tools`, `ToolCount`
 */
@RegisterClass(BaseAction, "List MCP Tools")
export class ListMCPToolsAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const connectionId = this.getStringParam(params, 'ConnectionID');

            // Validate required parameters
            if (!connectionId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: "Parameter 'ConnectionID' is required"
                };
            }

            // Get the MCP Client Manager
            const manager = MCPClientManager.Instance;

            // Ensure we're connected
            if (!manager.isConnected(connectionId)) {
                await manager.connect(connectionId, {
                    contextUser: params.ContextUser,
                    skipAutoSync: true
                });
            }

            // List tools
            const result = await manager.listTools(connectionId, {
                contextUser: params.ContextUser
            });

            // Add output parameters
            this.addOutputParam(params, 'Tools', result.tools);
            this.addOutputParam(params, 'ToolCount', result.tools.length);

            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: 'LIST_FAILED',
                    Message: result.error ?? 'Failed to list tools',
                    Params: params.Params
                };
            }

            // Format output message with tool summary
            const toolSummary = result.tools.map(t => ({
                name: t.name,
                description: t.description ?? '(No description)'
            }));

            const message = JSON.stringify({
                count: result.tools.length,
                tools: toolSummary
            }, null, 2);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message,
                Params: params.Params
            };

        } catch (error) {
            LogError(`[ListMCPToolsAction] Error: ${error}`);
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

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }
}