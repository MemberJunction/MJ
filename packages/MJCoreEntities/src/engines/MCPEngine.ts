/**
 * @fileoverview MCP Engine for caching MCP server, connection, and tool data
 *
 * Provides centralized caching for MCP (Model Context Protocol) entities.
 * Execution logs are NOT cached here - they should be loaded on-demand via RunView.
 *
 * @module @memberjunction/core-entities/MCPEngine
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import {
    MJMCPServerEntity,
    MJMCPServerConnectionEntity,
    MJMCPServerToolEntity
} from "../generated/entity_subclasses";

/**
 * MCPEngine provides centralized caching for MCP-related entities.
 *
 * Cached entities:
 * - MCP Servers: Server definitions with transport, auth, and rate limit config
 * - MCP Server Connections: Connection instances for each server
 * - MCP Server Tools: Tools discovered from MCP servers
 *
 * NOT cached (load on-demand):
 * - MCP Tool Execution Logs: Historical data that should be queried as needed
 *
 * @example
 * ```typescript
 * // Initialize the engine
 * await MCPEngine.Instance.Config(false, contextUser);
 *
 * // Access cached data
 * const servers = MCPEngine.Instance.Servers;
 * const connections = MCPEngine.Instance.Connections;
 * const tools = MCPEngine.Instance.Tools;
 *
 * // Get tools for a specific server
 * const serverTools = MCPEngine.Instance.GetToolsByServer(serverId);
 *
 * // Force refresh
 * await MCPEngine.Instance.Config(true, contextUser);
 * ```
 */
export class MCPEngine extends BaseEngine<MCPEngine> {
    /**
     * Configures and loads the MCP engine data.
     *
     * @param forceRefresh - If true, forces a refresh of cached data
     * @param contextUser - User context for data loading (required for server-side)
     * @param provider - Optional metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: MCP Servers',
                PropertyName: '_Servers',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: MCP Server Connections',
                PropertyName: '_Connections',
                CacheLocal: true
            },
            {
                Type: 'entity',
                EntityName: 'MJ: MCP Server Tools',
                PropertyName: '_Tools',
                CacheLocal: true
            }
        ];

        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /**
     * Gets the singleton instance of MCPEngine
     */
    public static get Instance(): MCPEngine {
        return super.getInstance<MCPEngine>();
    }

    // ========================================
    // Private Storage
    // ========================================

    private _Servers: MJMCPServerEntity[] = [];
    private _Connections: MJMCPServerConnectionEntity[] = [];
    private _Tools: MJMCPServerToolEntity[] = [];

    // ========================================
    // Public Getters
    // ========================================

    /**
     * Gets all cached MCP servers
     */
    public get Servers(): MJMCPServerEntity[] {
        return this._Servers;
    }

    /**
     * Gets all cached MCP server connections
     */
    public get Connections(): MJMCPServerConnectionEntity[] {
        return this._Connections;
    }

    /**
     * Gets all cached MCP server tools
     */
    public get Tools(): MJMCPServerToolEntity[] {
        return this._Tools;
    }

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * Gets a server by ID
     *
     * @param serverId - The server ID
     * @returns The server entity or undefined if not found
     */
    public GetServerById(serverId: string): MJMCPServerEntity | undefined {
        return this._Servers.find(s => UUIDsEqual(s.ID, serverId));
    }

    /**
     * Gets a connection by ID
     *
     * @param connectionId - The connection ID
     * @returns The connection entity or undefined if not found
     */
    public GetConnectionById(connectionId: string): MJMCPServerConnectionEntity | undefined {
        return this._Connections.find(c => UUIDsEqual(c.ID, connectionId));
    }

    /**
     * Gets a tool by ID
     *
     * @param toolId - The tool ID
     * @returns The tool entity or undefined if not found
     */
    public GetToolById(toolId: string): MJMCPServerToolEntity | undefined {
        return this._Tools.find(t => UUIDsEqual(t.ID, toolId));
    }

    /**
     * Gets all connections for a specific server
     *
     * @param serverId - The server ID
     * @returns Array of connections for the server
     */
    public GetConnectionsByServer(serverId: string): MJMCPServerConnectionEntity[] {
        return this._Connections.filter(c => UUIDsEqual(c.MCPServerID, serverId));
    }

    /**
     * Gets all tools for a specific server
     *
     * @param serverId - The server ID
     * @returns Array of tools for the server
     */
    public GetToolsByServer(serverId: string): MJMCPServerToolEntity[] {
        return this._Tools.filter(t => UUIDsEqual(t.MCPServerID, serverId));
    }

    /**
     * Gets active servers only
     *
     * @returns Array of servers with Status = 'Active'
     */
    public get ActiveServers(): MJMCPServerEntity[] {
        return this._Servers.filter(s => s.Status === 'Active');
    }

    /**
     * Gets active connections only
     *
     * @returns Array of connections with Status = 'Active'
     */
    public get ActiveConnections(): MJMCPServerConnectionEntity[] {
        return this._Connections.filter(c => c.Status === 'Active');
    }

    /**
     * Gets active tools only
     *
     * @returns Array of tools with Status = 'Active'
     */
    public get ActiveTools(): MJMCPServerToolEntity[] {
        return this._Tools.filter(t => t.Status === 'Active');
    }

    /**
     * Gets active connections for a specific server
     *
     * @param serverId - The server ID
     * @returns Array of active connections for the server
     */
    public GetActiveConnectionsByServer(serverId: string): MJMCPServerConnectionEntity[] {
        return this._Connections.filter(c => UUIDsEqual(c.MCPServerID, serverId) && c.Status === 'Active');
    }

    /**
     * Gets active tools for a specific server
     *
     * @param serverId - The server ID
     * @returns Array of active tools for the server
     */
    public GetActiveToolsByServer(serverId: string): MJMCPServerToolEntity[] {
        return this._Tools.filter(t => UUIDsEqual(t.MCPServerID, serverId) && t.Status === 'Active');
    }

    /**
     * Gets the server name for a given server ID
     *
     * @param serverId - The server ID
     * @returns The server name or 'Unknown' if not found
     */
    public GetServerName(serverId: string): string {
        const server = this.GetServerById(serverId);
        return server?.Name ?? 'Unknown';
    }

    /**
     * Gets the connection name for a given connection ID
     *
     * @param connectionId - The connection ID
     * @returns The connection name or 'Unknown' if not found
     */
    public GetConnectionName(connectionId: string): string {
        const connection = this.GetConnectionById(connectionId);
        return connection?.Name ?? 'Unknown';
    }
}
