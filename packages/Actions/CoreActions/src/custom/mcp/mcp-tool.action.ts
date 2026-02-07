/**
 * @fileoverview Generic driver class for MCP Tool Actions
 *
 * This class handles execution of auto-generated Actions that are linked to
 * MCP Server Tools via the GeneratedActionID field. When an MCP tool is synced
 * to an Action (under System/AI/MCP/{ServerName}), this driver class is used
 * to execute it.
 *
 * The class:
 * 1. Looks up the MCPServerTool using params.Action.ID (matching GeneratedActionID)
 * 2. Finds an active connection for the tool's server
 * 3. Maps Action parameters to tool arguments
 * 4. Calls the tool via MCPClientManager
 *
 * @module @memberjunction/actions/mcp/mcp-tool
 */

import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { LogError, LogStatus, RunView } from "@memberjunction/core";
import { MCPClientManager } from "@memberjunction/ai-mcp-client";
import { MCPServerToolEntity, MCPServerConnectionEntity } from "@memberjunction/core-entities";

/**
 * Generic driver class for all auto-generated MCP Tool Actions.
 *
 * When an MCP Server Tool is synced to an Action (via syncActionsForServer),
 * the Action's DriverClass is set to 'MCPToolAction'. This class handles
 * execution of all such actions by:
 *
 * 1. Looking up the MCPServerTool entity that has GeneratedActionID = Action.ID
 * 2. Finding an active connection for the tool's server
 * 3. Mapping ActionParams to tool arguments (using param Name as key)
 * 4. Calling the MCP tool and returning the result
 *
 * @example
 * // An Action with DriverClass='MCPToolAction' will be handled by this class
 * // The tool is identified by looking up MCPServerTool.GeneratedActionID = Action.ID
 *
 * await runAction({
 *   ActionName: 'search_documentation',  // Name matches ToolName from MCP Server
 *   Params: [
 *     { Name: 'query', Value: 'MemberJunction API' },
 *     { Name: 'maxResults', Value: 10 }
 *   ]
 * });
 *
 * **Optional Parameter:**
 * - `ConnectionID` (optional): Specific connection to use. If not provided,
 *   an active connection for the server will be automatically selected.
 */
@RegisterClass(BaseAction, "MCPToolAction")
export class MCPToolAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const actionId = params.Action.ID;
            const actionName = params.Action.Name;

            LogStatus(`[MCPToolAction] Executing action '${actionName}' (ID: ${actionId})`);

            // Step 1: Look up the MCPServerTool by GeneratedActionID
            const tool = await this.lookupMCPServerTool(actionId, params);
            if (!tool) {
                return {
                    Success: false,
                    ResultCode: 'TOOL_NOT_FOUND',
                    Message: `Could not find MCP Server Tool linked to action '${actionName}' (ID: ${actionId}). ` +
                             `Ensure the tool has been synced with GeneratedActionID set.`
                };
            }

            LogStatus(`[MCPToolAction] Found tool '${tool.ToolName}' on server '${tool.MCPServer}'`);

            // Step 2: Get the connection (either from params or find an active one)
            const connectionId = await this.resolveConnectionId(tool, params);
            if (!connectionId) {
                return {
                    Success: false,
                    ResultCode: 'NO_CONNECTION',
                    Message: `No active connection available for MCP Server '${tool.MCPServer}'. ` +
                             `Please create an active connection or provide a ConnectionID parameter.`
                };
            }

            // Step 3: Build arguments from ActionParams
            const toolArguments = this.buildToolArguments(params);

            LogStatus(`[MCPToolAction] Calling tool '${tool.ToolName}' via connection '${connectionId}'`);

            // Step 4: Get the MCP Client Manager and ensure connected
            const manager = MCPClientManager.Instance;

            if (!manager.isConnected(connectionId)) {
                await manager.connect(connectionId, {
                    contextUser: params.ContextUser,
                    skipAutoSync: true
                });
            }

            // Step 5: Call the tool
            const timeout = this.getNumericParam(params, 'Timeout', 60000);
            const result = await manager.callTool(
                connectionId,
                tool.ToolName,
                {
                    arguments: toolArguments,
                    timeout
                },
                { contextUser: params.ContextUser }
            );

            // Step 6: Add output parameters
            this.addOutputParam(params, 'ToolOutput', result.content);
            this.addOutputParam(params, 'StructuredOutput', result.structuredContent);
            this.addOutputParam(params, 'DurationMs', result.durationMs);
            this.addOutputParam(params, 'IsToolError', result.isToolError);
            this.addOutputParam(params, 'ToolName', tool.ToolName);
            this.addOutputParam(params, 'ServerName', tool.MCPServer);

            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: result.isToolError ? 'TOOL_ERROR' : 'EXECUTION_FAILED',
                    Message: result.error ?? `Tool '${tool.ToolName}' execution failed`,
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
            LogError(`[MCPToolAction] Error executing action '${params.Action?.Name}': ${error}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Looks up the MCPServerTool entity that has GeneratedActionID matching the action ID.
     */
    private async lookupMCPServerTool(
        actionId: string,
        params: RunActionParams
    ): Promise<MCPServerToolEntity | null> {
        const rv = new RunView();

        const result = await rv.RunView<MCPServerToolEntity>({
            EntityName: 'MJ: MCP Server Tools',
            ExtraFilter: `GeneratedActionID='${actionId}'`,
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }

        return result.Results[0];
    }

    /**
     * Resolves the connection ID to use for the tool execution.
     * First checks for an explicit ConnectionID parameter, then finds an active connection.
     */
    private async resolveConnectionId(
        tool: MCPServerToolEntity,
        params: RunActionParams
    ): Promise<string | null> {
        // Check for explicit ConnectionID parameter
        const explicitConnectionId = this.getStringParam(params, 'ConnectionID');
        if (explicitConnectionId) {
            return explicitConnectionId;
        }

        // Find an active connection for the tool's server
        const rv = new RunView();

        const result = await rv.RunView<MCPServerConnectionEntity>({
            EntityName: 'MJ: MCP Server Connections',
            ExtraFilter: `MCPServerID='${tool.MCPServerID}' AND Status='Active'`,
            OrderBy: '__mj_CreatedAt ASC',  // Use oldest connection as default
            MaxRows: 1,
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }

        return result.Results[0].ID;
    }

    /**
     * Builds the tool arguments object from ActionParams.
     * Excludes system parameters like ConnectionID and Timeout.
     */
    private buildToolArguments(params: RunActionParams): Record<string, unknown> {
        const systemParams = new Set(['connectionid', 'timeout']);
        const args: Record<string, unknown> = {};

        for (const param of params.Params) {
            // Skip output params and system params
            if (param.Type === 'Output' || systemParams.has(param.Name.toLowerCase())) {
                continue;
            }

            // Add to arguments using original param name
            if (param.Value !== undefined && param.Value !== null) {
                args[param.Name] = param.Value;
            }
        }

        return args;
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

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }
}