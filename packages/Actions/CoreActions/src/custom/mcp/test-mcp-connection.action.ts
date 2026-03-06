/**
 * @fileoverview Action to test an MCP server connection
 *
 * This action verifies connectivity to an MCP server and retrieves
 * server information including name, version, and capabilities.
 *
 * @module @memberjunction/actions/mcp/test-mcp-connection
 */

import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { LogError } from "@memberjunction/core";
import { MCPClientManager } from "@memberjunction/ai-mcp-client";

/**
 * Action to test an MCP server connection.
 *
 * This action attempts to connect to an MCP server and validates
 * the connection is working. It returns server information and latency.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Test MCP Connection',
 *   Params: [
 *     { Name: 'ConnectionID', Value: 'connection-uuid' }
 *   ]
 * });
 * ```
 *
 * **Parameters:**
 * - `ConnectionID` (required): UUID of the MCP Server Connection to test
 *
 * **Result:**
 * - Success: Connection details in Message
 * - Output params include: `ServerName`, `ServerVersion`, `LatencyMs`, `Capabilities`
 */
@RegisterClass(BaseAction, "Test MCP Connection")
export class TestMCPConnectionAction extends BaseAction {

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

            // Test connection
            const result = await manager.testConnection(connectionId, {
                contextUser: params.ContextUser
            });

            // Add output parameters
            this.addOutputParam(params, 'ServerName', result.serverName);
            this.addOutputParam(params, 'ServerVersion', result.serverVersion);
            this.addOutputParam(params, 'LatencyMs', result.latencyMs);
            this.addOutputParam(params, 'Capabilities', result.capabilities);

            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: 'CONNECTION_FAILED',
                    Message: result.error ?? 'Connection test failed',
                    Params: params.Params
                };
            }

            const serverInfo = result.serverName
                ? `${result.serverName}${result.serverVersion ? ` v${result.serverVersion}` : ''}`
                : 'Unknown server';

            const message = `Connection successful to ${serverInfo}. Latency: ${result.latencyMs}ms`;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message,
                Params: params.Params
            };

        } catch (error) {
            LogError(`[TestMCPConnectionAction] Error: ${error}`);
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