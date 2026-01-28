/**
 * @fileoverview Type tests for MCP Client types
 *
 * These tests verify that types are properly exported and can be used correctly.
 */

import { describe, it, expect } from 'vitest';
import type {
    MCPTransportType,
    MCPAuthType,
    MCPServerStatus,
    MCPConnectionStatus,
    MCPToolStatus,
    MCPServerConfig,
    MCPConnectionConfig,
    MCPToolDefinition,
    MCPCallToolOptions,
    MCPToolCallResult,
    MCPListToolsResult,
    MCPSyncToolsResult,
    MCPTestConnectionResult,
    MCPClientOptions,
    MCPConnectOptions,
    MCPClientEventType
} from '../types.js';

describe('Type exports', () => {
    describe('Transport types', () => {
        it('should allow valid transport types', () => {
            const types: MCPTransportType[] = ['StreamableHTTP', 'SSE', 'Stdio', 'WebSocket'];
            expect(types).toHaveLength(4);
        });
    });

    describe('Auth types', () => {
        it('should allow valid auth types', () => {
            const types: MCPAuthType[] = ['None', 'Bearer', 'APIKey', 'OAuth2', 'Basic', 'Custom'];
            expect(types).toHaveLength(6);
        });
    });

    describe('Status types', () => {
        it('should allow valid server status types', () => {
            const types: MCPServerStatus[] = ['Active', 'Inactive', 'Deprecated'];
            expect(types).toHaveLength(3);
        });

        it('should allow valid connection status types', () => {
            const types: MCPConnectionStatus[] = ['Active', 'Inactive', 'Error'];
            expect(types).toHaveLength(3);
        });

        it('should allow valid tool status types', () => {
            const types: MCPToolStatus[] = ['Active', 'Inactive', 'Deprecated'];
            expect(types).toHaveLength(3);
        });
    });

    describe('MCPServerConfig', () => {
        it('should accept valid server config', () => {
            const config: MCPServerConfig = {
                ID: 'test-id',
                Name: 'Test Server',
                TransportType: 'StreamableHTTP',
                DefaultAuthType: 'APIKey',
                Status: 'Active',
                ServerURL: 'https://example.com/mcp'
            };

            expect(config.ID).toBe('test-id');
            expect(config.TransportType).toBe('StreamableHTTP');
        });

        it('should accept stdio config', () => {
            const config: MCPServerConfig = {
                ID: 'test-id',
                Name: 'Test Server',
                TransportType: 'Stdio',
                DefaultAuthType: 'None',
                Status: 'Active',
                Command: '/usr/bin/mcp-server',
                CommandArgs: JSON.stringify(['--port', '3000'])
            };

            expect(config.Command).toBe('/usr/bin/mcp-server');
        });
    });

    describe('MCPConnectionConfig', () => {
        it('should accept valid connection config', () => {
            const config: MCPConnectionConfig = {
                ID: 'conn-id',
                MCPServerID: 'server-id',
                Name: 'Test Connection',
                CompanyID: 'company-id',
                Status: 'Active',
                AutoSyncTools: true,
                AutoGenerateActions: false,
                LogToolCalls: true,
                LogInputParameters: true,
                LogOutputContent: true,
                MaxOutputLogSize: 102400
            };

            expect(config.LogToolCalls).toBe(true);
        });
    });

    describe('MCPToolDefinition', () => {
        it('should accept valid tool definition', () => {
            const tool: MCPToolDefinition = {
                ID: 'tool-id',
                MCPServerID: 'server-id',
                ToolName: 'test_tool',
                ToolTitle: 'Test Tool',
                ToolDescription: 'A test tool',
                InputSchema: JSON.stringify({ type: 'object', properties: {} }),
                Status: 'Active'
            };

            expect(tool.ToolName).toBe('test_tool');
        });
    });

    describe('MCPCallToolOptions', () => {
        it('should accept valid call options', () => {
            const options: MCPCallToolOptions = {
                arguments: {
                    param1: 'value1',
                    param2: 123,
                    param3: { nested: true }
                },
                timeout: 30000
            };

            expect(options.arguments.param1).toBe('value1');
        });
    });

    describe('Result types', () => {
        it('should accept valid tool call result', () => {
            const result: MCPToolCallResult = {
                success: true,
                content: [{ type: 'text', text: 'Hello, world!' }],
                durationMs: 150,
                isToolError: false
            };

            expect(result.success).toBe(true);
            expect(result.content[0].text).toBe('Hello, world!');
        });

        it('should accept valid list tools result', () => {
            const result: MCPListToolsResult = {
                success: true,
                tools: [
                    {
                        name: 'test_tool',
                        description: 'A test tool',
                        inputSchema: { type: 'object' }
                    }
                ]
            };

            expect(result.tools).toHaveLength(1);
        });

        it('should accept valid sync tools result', () => {
            const result: MCPSyncToolsResult = {
                success: true,
                added: 5,
                updated: 2,
                deprecated: 1,
                total: 6
            };

            expect(result.added).toBe(5);
        });

        it('should accept valid test connection result', () => {
            const result: MCPTestConnectionResult = {
                success: true,
                serverName: 'Test Server',
                serverVersion: '1.0.0',
                latencyMs: 50
            };

            expect(result.serverName).toBe('Test Server');
        });
    });

    describe('Client options', () => {
        it('should accept valid client options', () => {
            const options: MCPClientOptions = {
                contextUser: {
                    ID: 'user-id',
                    Name: 'Test User',
                    Email: 'test@example.com'
                } as MCPClientOptions['contextUser']
            };

            expect(options.contextUser.ID).toBe('user-id');
        });

        it('should accept valid connect options', () => {
            const options: MCPConnectOptions = {
                contextUser: {
                    ID: 'user-id',
                    Name: 'Test User',
                    Email: 'test@example.com'
                } as MCPConnectOptions['contextUser'],
                forceReconnect: true,
                skipAutoSync: false
            };

            expect(options.forceReconnect).toBe(true);
        });
    });

    describe('Event types', () => {
        it('should allow valid event types', () => {
            const types: MCPClientEventType[] = [
                'connected',
                'disconnected',
                'toolCalled',
                'toolCallCompleted',
                'toolsSynced',
                'connectionError',
                'rateLimitExceeded'
            ];

            expect(types).toHaveLength(7);
        });
    });
});
