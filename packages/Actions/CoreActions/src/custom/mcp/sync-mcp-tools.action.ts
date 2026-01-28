/**
 * @fileoverview Action to synchronize tools from an MCP server to the database
 *
 * This action discovers tools from an MCP server and updates the local
 * tool definitions in the database for discoverability and management.
 *
 * @module @memberjunction/actions/mcp/sync-mcp-tools
 */

import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { LogError } from "@memberjunction/core";
import { MCPClientManager } from "@memberjunction/ai-mcp-client";

/**
 * Action to synchronize MCP server tools to the database.
 *
 * This action connects to an MCP server, lists all available tools,
 * and updates the local database cache. New tools are added, existing
 * tools are updated, and tools no longer available are marked deprecated.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Sync MCP Tools',
 *   Params: [
 *     { Name: 'ConnectionID', Value: 'connection-uuid' }
 *   ]
 * });
 * ```
 *
 * **Parameters:**
 * - `ConnectionID` (required): UUID of the MCP Server Connection to sync
 *
 * **Result:**
 * - Success: Sync summary in Message
 * - Output params include: `Added`, `Updated`, `Deprecated`, `Total`
 */
@RegisterClass(BaseAction, "Sync MCP Tools")
export class SyncMCPToolsAction extends BaseAction {

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
                    skipAutoSync: true // We'll sync manually
                });
            }

            // Sync tools
            const result = await manager.syncTools(connectionId, {
                contextUser: params.ContextUser
            });

            // Add output parameters
            this.addOutputParam(params, 'Added', result.added);
            this.addOutputParam(params, 'Updated', result.updated);
            this.addOutputParam(params, 'Deprecated', result.deprecated);
            this.addOutputParam(params, 'Total', result.total);

            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: 'SYNC_FAILED',
                    Message: result.error ?? 'Tool synchronization failed',
                    Params: params.Params
                };
            }

            const message = `Tool sync completed: ${result.added} added, ${result.updated} updated, ${result.deprecated} deprecated. Total: ${result.total} tools.`;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message,
                Params: params.Params
            };

        } catch (error) {
            LogError(`[SyncMCPToolsAction] Error: ${error}`);
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

/**
 * Loader function to prevent tree-shaking
 */
export function LoadSyncMCPToolsAction(): void {
    // Intentionally empty - ensures decorator executes
}
