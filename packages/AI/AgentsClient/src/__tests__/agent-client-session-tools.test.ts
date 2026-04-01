import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentClientSession } from '../generic/AgentClientSession';
import { ClientToolRegistry } from '../generic/ClientToolRegistry';
import { TransportAdapter } from '../generic/TransportAdapter';
import { ClientToolMetadata, ClientToolDecoratorContext } from '../generic/AgentClientTypes';

/** Minimal mock transport */
function createMockTransport(): TransportAdapter {
    return {
        IsConnected: true,
        Connect: vi.fn().mockResolvedValue(undefined),
        Disconnect: vi.fn().mockResolvedValue(undefined),
        Send: vi.fn().mockResolvedValue(undefined),
        OnMessage: vi.fn(),
        OnError: vi.fn(),
        OnDisconnect: vi.fn(),
    };
}

describe('AgentClientSession — Tool Decoration & Management', () => {
    let session: AgentClientSession;
    let registry: ClientToolRegistry;
    let transport: TransportAdapter;
    let sendDefsFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        transport = createMockTransport();
        registry = new ClientToolRegistry();
        session = new AgentClientSession(transport, registry);
        sendDefsFn = vi.fn().mockResolvedValue(undefined);
        session.SetToolDefinitionsSender(sendDefsFn);
        // Simulate session ID assignment
        (session as unknown as { _sessionId: string })._sessionId = 'test-session';
    });

    describe('RegisterToolDecorator + DecorateAndSendTools', () => {
        it('should decorate a tool with runtime context and send to server', async () => {
            const baseTool: ClientToolMetadata = {
                Name: 'ShowEntityForm',
                Description: 'Open an entity form',
                InputSchema: {
                    type: 'object',
                    properties: {
                        EntityName: { type: 'string' },
                        RecordID: { type: 'string' }
                    },
                    required: ['EntityName', 'RecordID']
                },
                Category: 'display'
            };

            // Register a decorator
            session.RegisterToolDecorator('ShowEntityForm', (tool, ctx) => ({
                ...tool,
                Description: `Open an entity form. Available: ${ctx.AvailableEntities.join(', ')}`,
                InputSchema: {
                    ...tool.InputSchema,
                    properties: {
                        EntityName: {
                            type: 'string',
                            enum: ctx.AvailableEntities,
                            description: 'Entity to display'
                        },
                        RecordID: { type: 'string' }
                    }
                }
            }));

            // Set context
            session.SetDecoratorContext({
                AvailableEntities: ['Members', 'Organizations'],
                CurrentAppName: 'Knowledge Hub',
                CustomContext: {}
            });

            // Decorate and send
            await session.DecorateAndSendTools([baseTool]);

            // Verify the sendDefsFn was called with enriched tools
            expect(sendDefsFn).toHaveBeenCalledTimes(1);
            const [sessionID, tools] = sendDefsFn.mock.calls[0];
            expect(sessionID).toBe('test-session');
            expect(tools).toHaveLength(1);
            expect(tools[0].Description).toContain('Members');
            expect(tools[0].Description).toContain('Organizations');
            expect((tools[0].InputSchema as Record<string, unknown>).properties).toHaveProperty('EntityName');
        });

        it('should pass through undecorated tools unchanged', async () => {
            const baseTool: ClientToolMetadata = {
                Name: 'NavigateToRecord',
                Description: 'Open a record',
                InputSchema: { type: 'object' }
            };

            // No decorator registered for this tool
            await session.DecorateAndSendTools([baseTool]);

            expect(sendDefsFn).toHaveBeenCalledTimes(1);
            const tools = sendDefsFn.mock.calls[0][1];
            expect(tools[0].Description).toBe('Open a record');
        });
    });

    describe('AddClientTool / RemoveClientTool', () => {
        it('should register a tool handler and notify server', async () => {
            const handler = vi.fn().mockResolvedValue({ Success: true, Data: 'ok' });

            await session.AddClientTool({
                Name: 'CustomTool',
                Description: 'A custom tool',
                InputSchema: { type: 'object' },
                Handler: handler
            });

            // Verify tool is registered locally
            const tool = registry.GetTool('CustomTool');
            expect(tool).toBeDefined();
            expect(tool!.Name).toBe('CustomTool');

            // Verify server was notified
            expect(sendDefsFn).toHaveBeenCalledTimes(1);
            const tools = sendDefsFn.mock.calls[0][1] as ClientToolMetadata[];
            expect(tools.some(t => t.Name === 'CustomTool')).toBe(true);
        });

        it('should remove a tool and notify server', async () => {
            // First add
            registry.Register({
                Name: 'ToRemove',
                Description: 'Will be removed',
                ParameterSchema: {},
                Handler: vi.fn().mockResolvedValue({ Success: true })
            });

            await session.RemoveClientTool('ToRemove');

            // Verify tool is gone locally
            expect(registry.GetTool('ToRemove')).toBeUndefined();

            // Verify server was notified
            expect(sendDefsFn).toHaveBeenCalledTimes(1);
            const tools = sendDefsFn.mock.calls[0][1] as ClientToolMetadata[];
            expect(tools.find(t => t.Name === 'ToRemove')).toBeUndefined();
        });

        it('should allow re-registration of an existing tool', async () => {
            const handler1 = vi.fn().mockResolvedValue({ Success: true, Data: 'v1' });
            const handler2 = vi.fn().mockResolvedValue({ Success: true, Data: 'v2' });

            // First registration
            registry.Register({
                Name: 'Upgradeable',
                Description: 'v1',
                ParameterSchema: {},
                Handler: handler1
            });

            // Re-register with new handler via AddClientTool (should not throw)
            await session.AddClientTool({
                Name: 'Upgradeable',
                Description: 'v2',
                InputSchema: {},
                Handler: handler2
            });

            const tool = registry.GetTool('Upgradeable');
            expect(tool!.Description).toBe('v2');
        });
    });
});
