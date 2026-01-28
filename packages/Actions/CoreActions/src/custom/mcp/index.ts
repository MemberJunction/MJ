/**
 * @fileoverview MCP (Model Context Protocol) Actions for MemberJunction
 *
 * This module provides Actions for interacting with external MCP servers,
 * enabling workflow and agent integration with MCP tool capabilities.
 *
 * @module @memberjunction/actions/mcp
 */

// Action exports
export { ExecuteMCPToolAction, LoadExecuteMCPToolAction } from './execute-mcp-tool.action.js';
export { SyncMCPToolsAction, LoadSyncMCPToolsAction } from './sync-mcp-tools.action.js';
export { TestMCPConnectionAction, LoadTestMCPConnectionAction } from './test-mcp-connection.action.js';
export { ListMCPToolsAction, LoadListMCPToolsAction } from './list-mcp-tools.action.js';
export { MCPToolAction, LoadMCPToolAction } from './mcp-tool.action.js';

/**
 * Loads all MCP actions to prevent tree-shaking.
 * Call this function at application startup to ensure
 * all MCP actions are registered with the class factory.
 */
export function LoadAllMCPActions(): void {
    // Importing the loader functions ensures decorators execute
    LoadExecuteMCPToolAction();
    LoadSyncMCPToolsAction();
    LoadTestMCPConnectionAction();
    LoadListMCPToolsAction();
    LoadMCPToolAction();
}

// Re-export loader functions
import { LoadExecuteMCPToolAction } from './execute-mcp-tool.action.js';
import { LoadSyncMCPToolsAction } from './sync-mcp-tools.action.js';
import { LoadTestMCPConnectionAction } from './test-mcp-connection.action.js';
import { LoadListMCPToolsAction } from './list-mcp-tools.action.js';
import { LoadMCPToolAction } from './mcp-tool.action.js';
