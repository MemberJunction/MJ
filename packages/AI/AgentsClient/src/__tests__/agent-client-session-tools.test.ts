import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject, Observable } from 'rxjs';
import { AgentClientSession } from '../generic/AgentClientSession';
import { ClientToolRegistry } from '../generic/ClientToolRegistry';
import {
    ClientToolMetadata,
    ClientToolRequestEvent,
    ClientToolResultEvent,
    SessionError,
} from '../generic/AgentClientTypes';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a fake GraphQLDataProvider with the methods AgentClientSession needs.
 * Exposes the underlying Subject so tests can push tool-request payloads.
 */
function createMockProvider() {
    const toolRequestSubject = new Subject<Record<string, unknown>>();
    return {
        ClientToolRequests: vi.fn((_sessionId: string): Observable<Record<string, unknown>> => {
            return toolRequestSubject.asObservable();
        }),
        ExecuteGQL: vi.fn().mockResolvedValue({ data: true }),
        /** Push tool requests into the subscription from test code */
        _toolRequestSubject: toolRequestSubject,
    };
}

/** The mock for GraphQLAIClient.RunAIAgentFromConversationDetail */
const mockRunAIAgentFromConversationDetail = vi.fn().mockResolvedValue({
    success: true,
    errorMessage: undefined,
    executionTimeMs: 42,
});

/**
 * Mock GraphQLAIClient constructor so RunAgent / RunAgentFromConversationDetail
 * don't hit a real GraphQL endpoint. Must use a real function (not arrow) so it
 * is new-able.
 */
vi.mock('@memberjunction/graphql-dataprovider', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/graphql-dataprovider');
    return {
        ...actual,
        GraphQLAIClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
            this.RunAIAgentFromConversationDetail = mockRunAIAgentFromConversationDetail;
        }),
    };
});

/** Suppress LogStatus / LogError console noise */
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

// ---------------------------------------------------------------------------
// Tests — Tool Decoration & Management (no provider needed)
// ---------------------------------------------------------------------------

describe('AgentClientSession — Tool Decoration & Management', () => {
    let session: AgentClientSession;
    let registry: ClientToolRegistry;

    beforeEach(() => {
        registry = new ClientToolRegistry();
        session = new AgentClientSession(registry);

        // Simulate session ID assignment (normally set by StartSession)
        (session as unknown as { _sessionId: string })._sessionId = 'test-session';

        // Mock the private sendToolDefinitionsToServer method since we don't have
        // a real GraphQL provider in unit tests
        vi.spyOn(
            session as unknown as { sendToolDefinitionsToServer: (id: string, tools: ClientToolMetadata[]) => Promise<void> },
            'sendToolDefinitionsToServer'
        ).mockResolvedValue(undefined);
    });

    afterEach(() => {
        session.Dispose();
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

            session.SetDecoratorContext({
                AvailableEntities: ['Members', 'Organizations'],
                CurrentAppName: 'Knowledge Hub',
                CustomContext: {}
            });

            await session.DecorateAndSendTools([baseTool]);

            const spy = vi.mocked(
                (session as unknown as { sendToolDefinitionsToServer: (id: string, tools: ClientToolMetadata[]) => Promise<void> })
                    .sendToolDefinitionsToServer
            );
            expect(spy).toHaveBeenCalledTimes(1);
            const [sessionID, tools] = spy.mock.calls[0];
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

            await session.DecorateAndSendTools([baseTool]);

            const spy = vi.mocked(
                (session as unknown as { sendToolDefinitionsToServer: (id: string, tools: ClientToolMetadata[]) => Promise<void> })
                    .sendToolDefinitionsToServer
            );
            expect(spy).toHaveBeenCalledTimes(1);
            const tools = spy.mock.calls[0][1];
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

            const tool = registry.GetTool('CustomTool');
            expect(tool).toBeDefined();
            expect(tool!.Name).toBe('CustomTool');

            const spy = vi.mocked(
                (session as unknown as { sendToolDefinitionsToServer: (id: string, tools: ClientToolMetadata[]) => Promise<void> })
                    .sendToolDefinitionsToServer
            );
            expect(spy).toHaveBeenCalledTimes(1);
            const tools = spy.mock.calls[0][1] as ClientToolMetadata[];
            expect(tools.some(t => t.Name === 'CustomTool')).toBe(true);
        });

        it('should remove a tool and notify server', async () => {
            registry.Register({
                Name: 'ToRemove',
                Description: 'Will be removed',
                ParameterSchema: {},
                Handler: vi.fn().mockResolvedValue({ Success: true })
            });

            await session.RemoveClientTool('ToRemove');

            expect(registry.GetTool('ToRemove')).toBeUndefined();

            const spy = vi.mocked(
                (session as unknown as { sendToolDefinitionsToServer: (id: string, tools: ClientToolMetadata[]) => Promise<void> })
                    .sendToolDefinitionsToServer
            );
            expect(spy).toHaveBeenCalledTimes(1);
            const tools = spy.mock.calls[0][1] as ClientToolMetadata[];
            expect(tools.find(t => t.Name === 'ToRemove')).toBeUndefined();
        });

        it('should allow re-registration of an existing tool', async () => {
            const handler1 = vi.fn().mockResolvedValue({ Success: true, Data: 'v1' });
            const handler2 = vi.fn().mockResolvedValue({ Success: true, Data: 'v2' });

            registry.Register({
                Name: 'Upgradeable',
                Description: 'v1',
                ParameterSchema: {},
                Handler: handler1
            });

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

    describe('RegisterTool / UnregisterTool / GetRegisteredTools', () => {
        it('should register a tool via the public API', () => {
            session.RegisterTool({
                Name: 'TestTool',
                Description: 'A test tool',
                ParameterSchema: { type: 'object' },
                Handler: vi.fn().mockResolvedValue({ Success: true })
            });

            const tools = session.GetRegisteredTools();
            expect(tools).toHaveLength(1);
            expect(tools[0].Name).toBe('TestTool');
        });

        it('should allow re-registration without throwing', () => {
            const handler1 = vi.fn().mockResolvedValue({ Success: true });
            const handler2 = vi.fn().mockResolvedValue({ Success: true });

            session.RegisterTool({
                Name: 'DupTool',
                Description: 'v1',
                ParameterSchema: {},
                Handler: handler1
            });

            session.RegisterTool({
                Name: 'DupTool',
                Description: 'v2',
                ParameterSchema: {},
                Handler: handler2
            });

            const tool = registry.GetTool('DupTool');
            expect(tool!.Description).toBe('v2');
        });

        it('should unregister a tool', () => {
            session.RegisterTool({
                Name: 'Removable',
                Description: 'Will be removed',
                ParameterSchema: {},
                Handler: vi.fn().mockResolvedValue({ Success: true })
            });

            session.UnregisterTool('Removable');
            expect(registry.GetTool('Removable')).toBeUndefined();
        });

        it('should return all registered tools via GetRegisteredTools', () => {
            session.RegisterTool({
                Name: 'ToolA',
                Description: 'First',
                ParameterSchema: {},
                Handler: vi.fn().mockResolvedValue({ Success: true })
            });
            session.RegisterTool({
                Name: 'ToolB',
                Description: 'Second',
                ParameterSchema: {},
                Handler: vi.fn().mockResolvedValue({ Success: true })
            });

            const tools = session.GetRegisteredTools();
            expect(tools).toHaveLength(2);
            const names = tools.map(t => t.Name);
            expect(names).toContain('ToolA');
            expect(names).toContain('ToolB');
        });

        it('should return empty array when nothing is registered', () => {
            expect(session.GetRegisteredTools()).toHaveLength(0);
        });
    });
});

// ===========================================================================
// Session lifecycle tests — spy on private getProvider() to inject mock
// ===========================================================================

describe('AgentClientSession — Session Lifecycle', () => {
    let session: AgentClientSession;
    let registry: ClientToolRegistry;
    let mockProvider: ReturnType<typeof createMockProvider>;

    beforeEach(() => {
        registry = new ClientToolRegistry();
        session = new AgentClientSession(registry);
        mockProvider = createMockProvider();
        mockRunAIAgentFromConversationDetail.mockClear();

        // Spy on the private getProvider() to return our mock
        vi.spyOn(
            session as unknown as { getProvider: () => unknown },
            'getProvider'
        ).mockReturnValue(mockProvider);
    });

    afterEach(() => {
        session.Dispose();
    });

    describe('StartSession', () => {
        it('should subscribe to ClientToolRequests via provider', () => {
            session.StartSession('sess-001');

            expect(mockProvider.ClientToolRequests).toHaveBeenCalledWith('sess-001');
            expect(session.SessionId).toBe('sess-001');
            expect(session.IsActive).toBe(true);
        });

        it('should emit SessionActive$ true on start', () => {
            const values: boolean[] = [];
            session.SessionActive$.subscribe(v => values.push(v));

            session.StartSession('sess-002');

            // StartSession calls StopSession first (emits false) then emits true
            expect(values).toContain(true);
        });

        it('should emit error if provider is not available', () => {
            // Override getProvider to return null
            vi.spyOn(
                session as unknown as { getProvider: () => unknown },
                'getProvider'
            ).mockReturnValue(null);

            const errors: SessionError[] = [];
            session.Error$.subscribe(e => errors.push(e));

            session.StartSession('sess-bad');

            expect(errors).toHaveLength(1);
            expect(errors[0].Message).toContain('provider not available');
        });

        it('should stop previous session when starting a new one', () => {
            session.StartSession('sess-first');
            expect(session.IsActive).toBe(true);

            session.StartSession('sess-second');
            expect(session.SessionId).toBe('sess-second');
            expect(session.IsActive).toBe(true);
        });
    });

    describe('StopSession', () => {
        it('should unsubscribe and deactivate', () => {
            session.StartSession('sess-stop');
            expect(session.IsActive).toBe(true);

            session.StopSession();
            expect(session.IsActive).toBe(false);
            expect(session.SessionId).toBeNull();
        });

        it('should emit SessionActive$ false on stop', () => {
            session.StartSession('sess-stop2');

            const values: boolean[] = [];
            session.SessionActive$.subscribe(v => values.push(v));

            session.StopSession();
            expect(values).toContain(false);
        });

        it('should be safe to call when no session is active', () => {
            expect(() => session.StopSession()).not.toThrow();
        });
    });

    describe('handleToolRequest (via subscription)', () => {
        it('should dispatch ToolRequested$ and ToolExecuted$ for incoming requests', async () => {
            const handler = vi.fn().mockResolvedValue({ Success: true, Data: 'navigated' });
            session.RegisterTool({
                Name: 'NavigateToRecord',
                Description: 'Navigate',
                ParameterSchema: {},
                Handler: handler,
            });

            const requested: ClientToolRequestEvent[] = [];
            const executed: ClientToolResultEvent[] = [];
            session.ToolRequested$.subscribe(e => requested.push(e));
            session.ToolExecuted$.subscribe(e => executed.push(e));

            session.StartSession('sess-tool');

            // Simulate server sending a tool request
            mockProvider._toolRequestSubject.next({
                ClientToolRequest: {
                    RequestID: 'req-001',
                    ToolName: 'NavigateToRecord',
                    Params: JSON.stringify({ EntityName: 'Users', RecordID: '123' }),
                    TimeoutMs: 5000,
                    AgentRunID: 'run-abc',
                }
            });

            // Wait for async handler execution
            await vi.waitFor(() => expect(executed).toHaveLength(1));

            expect(requested).toHaveLength(1);
            expect(requested[0].Request.ToolName).toBe('NavigateToRecord');
            expect(requested[0].Request.RequestID).toBe('req-001');
            expect(requested[0].AgentRunID).toBe('run-abc');

            expect(executed[0].Result.Success).toBe(true);
            expect(executed[0].Result.Data).toBe('navigated');

            // Handler was called with parsed params
            expect(handler).toHaveBeenCalledWith({
                EntityName: 'Users',
                RecordID: '123',
            });

            // Response sent to server
            expect(mockProvider.ExecuteGQL).toHaveBeenCalledTimes(1);
        });

        it('should handle tool request with object params (not stringified)', async () => {
            const handler = vi.fn().mockResolvedValue({ Success: true, Data: 'ok' });
            session.RegisterTool({
                Name: 'MyTool',
                Description: 'test',
                ParameterSchema: {},
                Handler: handler,
            });

            session.StartSession('sess-obj-params');

            mockProvider._toolRequestSubject.next({
                ClientToolRequest: {
                    RequestID: 'req-002',
                    ToolName: 'MyTool',
                    Params: { key: 'value' },
                    TimeoutMs: 5000,
                    AgentRunID: 'run-xyz',
                }
            });

            await vi.waitFor(() => expect(handler).toHaveBeenCalled());
            expect(handler).toHaveBeenCalledWith({ key: 'value' });
        });

        it('should emit error on subscription error', () => {
            const errors: SessionError[] = [];
            session.Error$.subscribe(e => errors.push(e));

            session.StartSession('sess-err');

            mockProvider._toolRequestSubject.error(new Error('connection lost'));

            expect(errors).toHaveLength(1);
            expect(errors[0].Message).toContain('connection lost');
        });
    });

    describe('RunAgent', () => {
        it('should call GraphQLAIClient.RunAIAgentFromConversationDetail', async () => {
            const result = await session.RunAgent({
                AgentId: 'agent-123',
                Messages: [{ role: 'user', content: 'Hello' }],
            });

            expect(result.Success).toBe(true);
            expect(mockRunAIAgentFromConversationDetail).toHaveBeenCalledTimes(1);

            const callArgs = mockRunAIAgentFromConversationDetail.mock.calls[0][0];
            expect(callArgs.agentId).toBe('agent-123');
        });

        it('should return error when provider is unavailable', async () => {
            vi.spyOn(
                session as unknown as { getProvider: () => unknown },
                'getProvider'
            ).mockReturnValue(null);

            const result = await session.RunAgent({
                AgentId: 'agent-123',
                Messages: [{ role: 'user', content: 'Hello' }],
            });

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('provider not available');
        });

        it('should handle exceptions from GraphQLAIClient gracefully', async () => {
            mockRunAIAgentFromConversationDetail.mockRejectedValueOnce(
                new Error('network failure')
            );

            const result = await session.RunAgent({
                AgentId: 'agent-err',
                Messages: [{ role: 'user', content: 'boom' }],
            });

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('network failure');
        });

        it('should forward progress events to AgentProgress$ and OnProgress callback', async () => {
            const progressEvents: Array<{ StatusMessage: string }> = [];
            session.AgentProgress$.subscribe(p => progressEvents.push(p));

            const onProgress = vi.fn();

            mockRunAIAgentFromConversationDetail.mockImplementationOnce(
                async (params: Record<string, unknown>) => {
                    const cb = params['onProgress'] as (p: Record<string, unknown>) => void;
                    if (cb) {
                        cb({ message: 'Step 1', percentage: 50 });
                    }
                    return { success: true };
                }
            );

            await session.RunAgent({
                AgentId: 'agent-progress',
                Messages: [{ role: 'user', content: 'go' }],
                OnProgress: onProgress,
            });

            expect(progressEvents).toHaveLength(1);
            expect(progressEvents[0].StatusMessage).toBe('Step 1');
            expect(onProgress).toHaveBeenCalledTimes(1);
        });
    });

    describe('RunAgentFromConversationDetail', () => {
        it('should call GraphQLAIClient with correct params', async () => {
            const result = await session.RunAgentFromConversationDetail({
                ConversationDetailId: 'detail-abc',
                AgentId: 'agent-456',
                MaxHistoryMessages: 10,
            });

            expect(result.Success).toBe(true);
            expect(mockRunAIAgentFromConversationDetail).toHaveBeenCalledTimes(1);

            const callArgs = mockRunAIAgentFromConversationDetail.mock.calls[0][0];
            expect(callArgs.conversationDetailId).toBe('detail-abc');
            expect(callArgs.agentId).toBe('agent-456');
            expect(callArgs.maxHistoryMessages).toBe(10);
        });

        it('should return error when provider is unavailable', async () => {
            vi.spyOn(
                session as unknown as { getProvider: () => unknown },
                'getProvider'
            ).mockReturnValue(null);

            const result = await session.RunAgentFromConversationDetail({
                ConversationDetailId: 'detail-xyz',
                AgentId: 'agent-nope',
            });

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('provider not available');
        });

        it('should handle exceptions gracefully', async () => {
            mockRunAIAgentFromConversationDetail.mockRejectedValueOnce(
                new Error('timeout')
            );

            const result = await session.RunAgentFromConversationDetail({
                ConversationDetailId: 'detail-err',
                AgentId: 'agent-err',
            });

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('timeout');
        });

        it('should forward progress events', async () => {
            const progressEvents: Array<{ StatusMessage: string }> = [];
            session.AgentProgress$.subscribe(p => progressEvents.push(p));

            const onProgress = vi.fn();

            mockRunAIAgentFromConversationDetail.mockImplementationOnce(
                async (params: Record<string, unknown>) => {
                    const cb = params['onProgress'] as (p: Record<string, unknown>) => void;
                    if (cb) {
                        cb({ message: 'Loading history', percentage: 25, currentStep: 'load', metadata: {} });
                    }
                    return { success: true };
                }
            );

            await session.RunAgentFromConversationDetail({
                ConversationDetailId: 'detail-prog',
                AgentId: 'agent-prog',
                OnProgress: onProgress,
            });

            expect(progressEvents).toHaveLength(1);
            expect(progressEvents[0].StatusMessage).toBe('Loading history');
            expect(onProgress).toHaveBeenCalledTimes(1);
            expect(onProgress.mock.calls[0][0]).toHaveProperty('Message', 'Loading history');
        });
    });

    describe('Dispose', () => {
        it('should complete all subjects on dispose', () => {
            const completions = {
                toolRequested: false,
                toolExecuted: false,
                error: false,
                sessionActive: false,
                agentProgress: false,
            };

            session.ToolRequested$.subscribe({ complete: () => { completions.toolRequested = true; } });
            session.ToolExecuted$.subscribe({ complete: () => { completions.toolExecuted = true; } });
            session.Error$.subscribe({ complete: () => { completions.error = true; } });
            session.SessionActive$.subscribe({ complete: () => { completions.sessionActive = true; } });
            session.AgentProgress$.subscribe({ complete: () => { completions.agentProgress = true; } });

            session.Dispose();

            expect(completions.toolRequested).toBe(true);
            expect(completions.toolExecuted).toBe(true);
            expect(completions.error).toBe(true);
            expect(completions.sessionActive).toBe(true);
            expect(completions.agentProgress).toBe(true);
        });

        it('should deactivate the session', () => {
            session.StartSession('sess-dispose');
            expect(session.IsActive).toBe(true);

            session.Dispose();
            expect(session.IsActive).toBe(false);
            expect(session.SessionId).toBeNull();
        });
    });
});
