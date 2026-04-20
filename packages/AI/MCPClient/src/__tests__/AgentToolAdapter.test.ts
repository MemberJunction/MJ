/**
 * @fileoverview Unit tests for AgentToolAdapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentToolAdapter, createAgentToolAdapter } from '../AgentToolAdapter.js';
import { MCPClientManager } from '../MCPClientManager.js';
import type { UserInfo } from '@memberjunction/core';
import type { MCPListToolsResult, MCPToolCallResult } from '../types.js';

// Mock the MCPClientManager
vi.mock('../MCPClientManager.js', () => {
    const mockManager = {
        getActiveConnections: vi.fn(),
        listTools: vi.fn(),
        callTool: vi.fn()
    };
    return {
        MCPClientManager: {
            get Instance() {
                return mockManager;
            }
        }
    };
});

describe('AgentToolAdapter', () => {
    let adapter: AgentToolAdapter;
    let mockManager: {
        getActiveConnections: ReturnType<typeof vi.fn>;
        listTools: ReturnType<typeof vi.fn>;
        callTool: ReturnType<typeof vi.fn>;
    };
    const mockUser: UserInfo = {
        ID: 'user-123',
        Name: 'Test User',
        Email: 'test@example.com'
    } as UserInfo;

    beforeEach(() => {
        mockManager = MCPClientManager.Instance as unknown as typeof mockManager;
        vi.clearAllMocks();
        adapter = new AgentToolAdapter(mockUser);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create an adapter instance', () => {
            expect(adapter).toBeInstanceOf(AgentToolAdapter);
        });
    });

    describe('createAgentToolAdapter', () => {
        it('should create an adapter using factory function', () => {
            const factoryAdapter = createAgentToolAdapter(mockUser);
            expect(factoryAdapter).toBeInstanceOf(AgentToolAdapter);
        });
    });

    describe('discoverTools', () => {
        beforeEach(() => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1', 'conn-2']);
            mockManager.listTools.mockImplementation((connectionId: string) => {
                const toolsResult: MCPListToolsResult = {
                    success: true,
                    tools: [
                        {
                            name: `tool_${connectionId}`,
                            description: `Test tool for ${connectionId}`,
                            inputSchema: { type: 'object', properties: {} },
                            annotations: {
                                title: `Tool ${connectionId}`,
                                readOnlyHint: connectionId === 'conn-1',
                                destructiveHint: connectionId === 'conn-2'
                            }
                        }
                    ]
                };
                return Promise.resolve(toolsResult);
            });
        });

        it('should discover tools from all active connections', async () => {
            const tools = await adapter.discoverTools();

            expect(mockManager.getActiveConnections).toHaveBeenCalled();
            expect(mockManager.listTools).toHaveBeenCalledTimes(2);
            expect(tools).toHaveLength(2);
        });

        it('should filter by connection IDs', async () => {
            const tools = await adapter.discoverTools({ connectionIds: ['conn-1'] });

            expect(tools).toHaveLength(1);
            expect(tools[0].connectionId).toBe('conn-1');
        });

        it('should filter by name pattern', async () => {
            const tools = await adapter.discoverTools({ namePattern: 'conn-1' });

            expect(tools).toHaveLength(1);
            expect(tools[0].name).toContain('conn-1');
        });

        it('should filter read-only tools', async () => {
            const tools = await adapter.discoverTools({ readOnlyOnly: true });

            expect(tools).toHaveLength(1);
            expect(tools[0].annotations?.readOnly).toBe(true);
        });

        it('should exclude destructive tools', async () => {
            const tools = await adapter.discoverTools({ excludeDestructive: true });

            expect(tools).toHaveLength(1);
            expect(tools[0].annotations?.destructive).not.toBe(true);
        });

        it('should limit results', async () => {
            const tools = await adapter.discoverTools({ limit: 1 });

            expect(tools).toHaveLength(1);
        });

        it('should sort tools alphabetically by name', async () => {
            const tools = await adapter.discoverTools();

            const names = tools.map(t => t.name);
            const sortedNames = [...names].sort();
            expect(names).toEqual(sortedNames);
        });
    });

    describe('getToolsForOpenAI', () => {
        beforeEach(() => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1']);
            mockManager.listTools.mockResolvedValue({
                success: true,
                tools: [{
                    name: 'test_tool',
                    description: 'A test tool',
                    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
                }]
            });
        });

        it('should return tools in OpenAI format', async () => {
            const tools = await adapter.getToolsForOpenAI();

            expect(tools).toHaveLength(1);
            expect(tools[0]).toMatchObject({
                type: 'function',
                function: {
                    name: expect.stringContaining('test_tool'),
                    description: expect.any(String),
                    parameters: expect.any(Object)
                }
            });
        });
    });

    describe('getToolsForAnthropic', () => {
        beforeEach(() => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1']);
            mockManager.listTools.mockResolvedValue({
                success: true,
                tools: [{
                    name: 'test_tool',
                    description: 'A test tool',
                    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
                }]
            });
        });

        it('should return tools in Anthropic format', async () => {
            const tools = await adapter.getToolsForAnthropic();

            expect(tools).toHaveLength(1);
            expect(tools[0]).toMatchObject({
                name: expect.stringContaining('test_tool'),
                description: expect.any(String),
                input_schema: expect.any(Object)
            });
        });
    });

    describe('executeTool', () => {
        beforeEach(() => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1']);
            mockManager.listTools.mockResolvedValue({
                success: true,
                tools: [{
                    name: 'test_tool',
                    description: 'A test tool',
                    inputSchema: { type: 'object', properties: {} }
                }]
            });
        });

        it('should execute a tool successfully', async () => {
            const mockResult: MCPToolCallResult = {
                success: true,
                content: [{ type: 'text', text: 'Success!' }],
                isToolError: false,
                durationMs: 100
            };
            mockManager.callTool.mockResolvedValue(mockResult);

            const result = await adapter.executeTool('conn-1__test_tool', { query: 'test' });

            expect(result.success).toBe(true);
            expect(result.toolName).toBe('test_tool');
            expect(result.connectionId).toBe('conn-1');
            expect(result.content).toEqual([{ type: 'text', text: 'Success!' }]);
        });

        it('should handle tool execution errors', async () => {
            const mockResult: MCPToolCallResult = {
                success: false,
                content: [{ type: 'text', text: 'Error occurred' }],
                isToolError: true,
                durationMs: 50,
                error: 'Something went wrong'
            };
            mockManager.callTool.mockResolvedValue(mockResult);

            const result = await adapter.executeTool('conn-1__test_tool', {});

            expect(result.success).toBe(false);
            expect(result.isError).toBe(true);
            expect(result.error).toBeDefined();
        });

        it('should return error for non-existent tool', async () => {
            const result = await adapter.executeTool('nonexistent_tool', {});

            expect(result.success).toBe(false);
            expect(result.error).toContain('Tool not found');
        });

        it('should handle exceptions during execution', async () => {
            mockManager.callTool.mockRejectedValue(new Error('Network error'));

            const result = await adapter.executeTool('conn-1__test_tool', {});

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
        });
    });

    describe('getTool', () => {
        beforeEach(() => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1']);
            mockManager.listTools.mockResolvedValue({
                success: true,
                tools: [{
                    name: 'test_tool',
                    description: 'A test tool',
                    inputSchema: { type: 'object', properties: {} }
                }]
            });
        });

        it('should get tool by full ID', async () => {
            const tool = await adapter.getTool('conn-1__test_tool');

            expect(tool).toBeDefined();
            expect(tool?.name).toBe('test_tool');
        });

        it('should get tool by name', async () => {
            const tool = await adapter.getTool('test_tool');

            expect(tool).toBeDefined();
            expect(tool?.name).toBe('test_tool');
        });

        it('should return undefined for non-existent tool', async () => {
            const tool = await adapter.getTool('nonexistent');

            expect(tool).toBeUndefined();
        });
    });

    describe('hasToolAvailable', () => {
        beforeEach(() => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1']);
            mockManager.listTools.mockResolvedValue({
                success: true,
                tools: [{
                    name: 'test_tool',
                    description: 'A test tool',
                    inputSchema: { type: 'object', properties: {} }
                }]
            });
        });

        it('should return true for existing tool', async () => {
            const hasIt = await adapter.hasToolAvailable('test_tool');
            expect(hasIt).toBe(true);
        });

        it('should return false for non-existent tool', async () => {
            const hasIt = await adapter.hasToolAvailable('nonexistent');
            expect(hasIt).toBe(false);
        });
    });

    describe('refreshCache', () => {
        it('should force refresh the tool cache', async () => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1']);
            mockManager.listTools.mockResolvedValue({
                success: true,
                tools: [{
                    name: 'test_tool',
                    description: 'A test tool',
                    inputSchema: { type: 'object', properties: {} }
                }]
            });

            // First call to populate cache
            await adapter.discoverTools();
            expect(mockManager.listTools).toHaveBeenCalledTimes(1);

            // Second call should use cache (within 1 minute)
            await adapter.discoverTools();
            expect(mockManager.listTools).toHaveBeenCalledTimes(1);

            // Force refresh
            await adapter.refreshCache();
            expect(mockManager.listTools).toHaveBeenCalledTimes(2);
        });
    });

    describe('tool ID parsing', () => {
        beforeEach(() => {
            mockManager.getActiveConnections.mockReturnValue(['conn-1']);
            mockManager.listTools.mockResolvedValue({
                success: true,
                tools: [{
                    name: 'tool_with__double_underscore',
                    description: 'Tool with double underscore in name',
                    inputSchema: { type: 'object', properties: {} }
                }]
            });
            mockManager.callTool.mockResolvedValue({
                success: true,
                content: [],
                isToolError: false,
                durationMs: 10
            });
        });

        it('should handle tool names with double underscores', async () => {
            const result = await adapter.executeTool('conn-1__tool_with__double_underscore', {});

            expect(result.success).toBe(true);
            expect(result.toolName).toBe('tool_with__double_underscore');
        });
    });
});
