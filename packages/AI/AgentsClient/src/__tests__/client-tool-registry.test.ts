import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClientToolRegistry } from '../generic/ClientToolRegistry';

describe('ClientToolRegistry', () => {
    let registry: ClientToolRegistry;

    beforeEach(() => {
        registry = new ClientToolRegistry();
    });

    describe('Register', () => {
        it('should register a tool', () => {
            registry.Register({
                Name: 'navigate',
                Description: 'Navigate to a URL',
                ParameterSchema: { type: 'object', properties: { url: { type: 'string' } } },
                Handler: async () => ({ Success: true })
            });

            const tool = registry.GetTool('navigate');
            expect(tool).toBeDefined();
            expect(tool?.Name).toBe('navigate');
        });

        it('should throw when registering duplicate tool name', () => {
            const handler1 = vi.fn(async () => ({ Success: true, Data: 'handler1' }));
            const handler2 = vi.fn(async () => ({ Success: true, Data: 'handler2' }));

            registry.Register({
                Name: 'tool',
                Description: 'v1',
                ParameterSchema: {},
                Handler: handler1
            });

            expect(() => registry.Register({
                Name: 'tool',
                Description: 'v2',
                ParameterSchema: {},
                Handler: handler2
            })).toThrow('already registered');
        });
    });

    describe('Unregister', () => {
        it('should remove a registered tool', () => {
            registry.Register({
                Name: 'temp-tool',
                Description: 'Temporary',
                ParameterSchema: {},
                Handler: async () => ({ Success: true })
            });

            registry.Unregister('temp-tool');
            expect(registry.GetTool('temp-tool')).toBeUndefined();
        });

        it('should not throw for non-existent tool', () => {
            expect(() => registry.Unregister('nonexistent')).not.toThrow();
        });
    });

    describe('GetAllTools', () => {
        it('should return all registered tools', () => {
            registry.Register({
                Name: 'tool1',
                Description: 'First',
                ParameterSchema: {},
                Handler: async () => ({ Success: true })
            });

            registry.Register({
                Name: 'tool2',
                Description: 'Second',
                ParameterSchema: {},
                Handler: async () => ({ Success: true })
            });

            const tools = registry.GetAllTools();
            expect(tools).toHaveLength(2);
        });

        it('should return empty array when no tools registered', () => {
            expect(registry.GetAllTools()).toHaveLength(0);
        });
    });

    describe('Execute', () => {
        it('should execute a registered tool handler', async () => {
            const handler = vi.fn(async (params: Record<string, unknown>) => ({
                Success: true,
                Data: `Navigated to ${params['url']}`
            }));

            registry.Register({
                Name: 'navigate',
                Description: 'Navigate',
                ParameterSchema: {},
                Handler: handler
            });

            const result = await registry.Execute('navigate', { url: '/home' });
            expect(result.Success).toBe(true);
            expect(handler).toHaveBeenCalledWith({ url: '/home' });
        });

        it('should return error for non-existent tool', async () => {
            const result = await registry.Execute('nonexistent', {});
            expect(result.Success).toBe(false);
        });

        it('should handle handler errors gracefully', async () => {
            registry.Register({
                Name: 'failing-tool',
                Description: 'Fails',
                ParameterSchema: {},
                Handler: async () => { throw new Error('Tool crashed'); }
            });

            const result = await registry.Execute('failing-tool', {});
            expect(result.Success).toBe(false);
        });
    });
});
