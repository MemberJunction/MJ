import { describe, it, expect, vi } from 'vitest';
import { ToolProvider } from '../tools/ToolProvider.js';
import { ComputerUseTool, JsonSchema, JsonSchemaProperty } from '../types/tools.js';
import { ToolCallRequest } from '../types/controller.js';

function createTool(name: string, handler?: (args: Record<string, unknown>) => Promise<unknown>): ComputerUseTool {
    const schema = new JsonSchema();
    const prop = new JsonSchemaProperty();
    prop.Type = 'string';
    prop.Description = 'A test parameter';
    schema.Properties = { input: prop };
    schema.Required = ['input'];

    return new ComputerUseTool({
        Name: name,
        Description: `Description for ${name}`,
        InputSchema: schema,
        Handler: handler ?? (async (args) => `result from ${name}: ${JSON.stringify(args)}`),
    });
}

function createRequest(toolName: string, args: Record<string, unknown> = {}): ToolCallRequest {
    const request = new ToolCallRequest();
    request.ToolName = toolName;
    request.Arguments = args;
    return request;
}

describe('ToolProvider', () => {
    describe('RegisterTools', () => {
        it('should register tools and report correct count', () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('tool_a'), createTool('tool_b')]);

            expect(provider.ToolCount).toBe(2);
            expect(provider.HasTools).toBe(true);
        });

        it('should start with no tools', () => {
            const provider = new ToolProvider();
            expect(provider.ToolCount).toBe(0);
            expect(provider.HasTools).toBe(false);
        });

        it('should throw on duplicate tool names', () => {
            const provider = new ToolProvider();
            expect(() => {
                provider.RegisterTools([createTool('dup'), createTool('dup')]);
            }).toThrow('Duplicate tool name');
        });

        it('should throw on duplicate tool names across multiple RegisterTools calls', () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('my_tool')]);

            expect(() => {
                provider.RegisterTools([createTool('my_tool')]);
            }).toThrow("Duplicate tool name: 'my_tool'");
        });

        it('should register an empty array without error', () => {
            const provider = new ToolProvider();
            provider.RegisterTools([]);
            expect(provider.ToolCount).toBe(0);
        });

        it('should accumulate tools across multiple RegisterTools calls', () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('a')]);
            provider.RegisterTools([createTool('b')]);
            expect(provider.ToolCount).toBe(2);
        });
    });

    describe('GetToolDefinitions', () => {
        it('should return empty array when no tools registered', () => {
            const provider = new ToolProvider();
            expect(provider.GetToolDefinitions()).toEqual([]);
        });

        it('should return definitions with Name, Description, and InputSchema', () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('search')]);

            const defs = provider.GetToolDefinitions();
            expect(defs).toHaveLength(1);
            expect(defs[0].Name).toBe('search');
            expect(defs[0].Description).toBe('Description for search');
            expect(defs[0].InputSchema).toBeDefined();
            expect(defs[0].InputSchema.Properties).toHaveProperty('input');
        });

        it('should return definitions for all registered tools', () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('alpha'), createTool('beta'), createTool('gamma')]);

            const defs = provider.GetToolDefinitions();
            expect(defs).toHaveLength(3);
            const names = defs.map(d => d.Name);
            expect(names).toContain('alpha');
            expect(names).toContain('beta');
            expect(names).toContain('gamma');
        });
    });

    describe('ExecuteToolCall', () => {
        it('should dispatch to the correct handler and return success', async () => {
            const handler = vi.fn(async (args: Record<string, unknown>) => ({ data: args }));
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('my_tool', handler)]);

            const request = createRequest('my_tool', { query: 'test' });
            const record = await provider.ExecuteToolCall(request);

            expect(record.Success).toBe(true);
            expect(record.ToolName).toBe('my_tool');
            expect(record.Arguments).toEqual({ query: 'test' });
            expect(record.Result).toEqual({ data: { query: 'test' } });
            expect(record.DurationMs).toBeGreaterThanOrEqual(0);
            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith({ query: 'test' });
        });

        it('should return failure for unknown tool name', async () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('known_tool')]);

            const request = createRequest('unknown_tool');
            const record = await provider.ExecuteToolCall(request);

            expect(record.Success).toBe(false);
            expect(record.Error).toContain("Unknown tool: 'unknown_tool'");
            expect(record.Error).toContain('known_tool');
        });

        it('should list available tools in error message for unknown tool', async () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('tool_a'), createTool('tool_b')]);

            const record = await provider.ExecuteToolCall(createRequest('missing'));

            expect(record.Error).toContain('tool_a');
            expect(record.Error).toContain('tool_b');
        });

        it('should catch handler errors and wrap them in the record', async () => {
            const failingHandler = async () => { throw new Error('handler crashed'); };
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('crasher', failingHandler)]);

            const record = await provider.ExecuteToolCall(createRequest('crasher'));

            expect(record.Success).toBe(false);
            expect(record.Error).toBe('handler crashed');
            expect(record.DurationMs).toBeGreaterThanOrEqual(0);
        });

        it('should catch non-Error thrown values and stringify them', async () => {
            const throwsString = async () => { throw 'string error'; };
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('string_thrower', throwsString)]);

            const record = await provider.ExecuteToolCall(createRequest('string_thrower'));

            expect(record.Success).toBe(false);
            expect(record.Error).toBe('string error');
        });

        it('should track duration even on failure', async () => {
            const provider = new ToolProvider();
            const record = await provider.ExecuteToolCall(createRequest('nonexistent'));

            expect(record.DurationMs).toBeGreaterThanOrEqual(0);
        });

        it('should handle handler returning undefined', async () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('void_tool', async () => undefined)]);

            const record = await provider.ExecuteToolCall(createRequest('void_tool'));
            expect(record.Success).toBe(true);
            expect(record.Result).toBeUndefined();
        });

        it('should handle handler returning null', async () => {
            const provider = new ToolProvider();
            provider.RegisterTools([createTool('null_tool', async () => null)]);

            const record = await provider.ExecuteToolCall(createRequest('null_tool'));
            expect(record.Success).toBe(true);
            expect(record.Result).toBeNull();
        });
    });
});
