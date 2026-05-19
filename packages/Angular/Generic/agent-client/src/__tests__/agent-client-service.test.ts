import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for AgentClientService — verifies pass-through delegation to AgentClientSession.
 */

vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
    OnDestroy: class {},
}));

// Track the mock session created by the constructor
let createdSession: Record<string, unknown>;

vi.mock('@memberjunction/ai-agent-client', () => {
    // Factory runs at module load — must define mock inside
    function MockAgentClientSession() {
        const session: Record<string, unknown> = {
            ToolRequested$: { subscribe: () => {} },
            ToolExecuted$: { subscribe: () => {} },
            AgentProgress$: { subscribe: () => {} },
            SessionActive$: { subscribe: () => {} },
            Error$: { subscribe: () => {} },
            SessionId: null,
            IsActive: false,
            RegisterTool: vi.fn(),
            UnregisterTool: vi.fn(),
            GetRegisteredTools: vi.fn().mockReturnValue([]),
            RegisterToolDecorator: vi.fn(),
            SetDecoratorContext: vi.fn(),
            DecorateAndSendTools: vi.fn().mockResolvedValue(undefined),
            StartSession: vi.fn(),
            StopSession: vi.fn(),
            RunAgent: vi.fn().mockResolvedValue({ Success: true }),
            RunAgentFromConversationDetail: vi.fn().mockResolvedValue({ Success: true }),
            Dispose: vi.fn(),
        };
        createdSession = session;
        return session;
    }
    return {
        AgentClientSession: MockAgentClientSession,
    };
});

import { AgentClientService } from '../lib/agent-client.service';

describe('AgentClientService', () => {
    let service: AgentClientService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new AgentClientService();
    });

    describe('Observable pass-throughs', () => {
        it('should expose ToolRequested$ from the session', () => {
            expect(service.ToolRequested$).toBe(createdSession.ToolRequested$);
        });

        it('should expose ToolExecuted$ from the session', () => {
            expect(service.ToolExecuted$).toBe(createdSession.ToolExecuted$);
        });

        it('should expose AgentProgress$ from the session', () => {
            expect(service.AgentProgress$).toBe(createdSession.AgentProgress$);
        });

        it('should expose SessionActive$ from the session', () => {
            expect(service.SessionActive$).toBe(createdSession.SessionActive$);
        });

        it('should expose Error$ from the session', () => {
            expect(service.Error$).toBe(createdSession.Error$);
        });
    });

    describe('Session state', () => {
        it('should return SessionId from the session', () => {
            createdSession.SessionId = 'test-session-123';
            expect(service.SessionId).toBe('test-session-123');
        });

        it('should return null SessionId when no session is active', () => {
            createdSession.SessionId = null;
            expect(service.SessionId).toBeNull();
        });

        it('should return IsActive from the session', () => {
            createdSession.IsActive = true;
            expect(service.IsActive).toBe(true);
        });

        it('should return false when session is not active', () => {
            createdSession.IsActive = false;
            expect(service.IsActive).toBe(false);
        });
    });

    describe('Tool registration', () => {
        it('should delegate RegisterTool to the session', () => {
            const tool = { Name: 'TestTool', Handler: vi.fn() };
            service.RegisterTool(tool as never);
            expect(createdSession.RegisterTool).toHaveBeenCalledWith(tool);
        });

        it('should delegate UnregisterTool to the session', () => {
            service.UnregisterTool('TestTool');
            expect(createdSession.UnregisterTool).toHaveBeenCalledWith('TestTool');
        });

        it('should delegate GetRegisteredTools to the session', () => {
            const tools = [{ Name: 'Tool1' }, { Name: 'Tool2' }];
            (createdSession.GetRegisteredTools as ReturnType<typeof vi.fn>).mockReturnValue(tools);
            expect(service.GetRegisteredTools()).toBe(tools);
        });
    });

    describe('Tool decoration', () => {
        it('should delegate RegisterToolDecorator to the session', () => {
            const decorator = vi.fn();
            service.RegisterToolDecorator('MyTool', decorator as never);
            expect(createdSession.RegisterToolDecorator).toHaveBeenCalledWith('MyTool', decorator);
        });

        it('should delegate SetDecoratorContext to the session', () => {
            const context = { activeConversationId: 'conv-123' };
            service.SetDecoratorContext(context as never);
            expect(createdSession.SetDecoratorContext).toHaveBeenCalledWith(context);
        });

        it('should delegate DecorateAndSendTools to the session', async () => {
            const baseTools = [{ Name: 'BaseTool' }];
            await service.DecorateAndSendTools(baseTools as never);
            expect(createdSession.DecorateAndSendTools).toHaveBeenCalledWith(baseTools);
        });
    });

    describe('Session lifecycle', () => {
        it('should delegate StartSession to the session', () => {
            service.StartSession('session-abc');
            expect(createdSession.StartSession).toHaveBeenCalledWith('session-abc');
        });

        it('should delegate StopSession to the session', () => {
            service.StopSession();
            expect(createdSession.StopSession).toHaveBeenCalled();
        });
    });

    describe('Agent execution', () => {
        it('should delegate RunAgent to the session', async () => {
            const params = { AgentId: 'agent-1', Message: 'Hello' };
            const result = await service.RunAgent(params as never);
            expect(createdSession.RunAgent).toHaveBeenCalledWith(params);
            expect(result).toEqual({ Success: true });
        });

        it('should delegate RunAgentFromConversationDetail to the session', async () => {
            const params = { ConversationDetailId: 'detail-1' };
            const result = await service.RunAgentFromConversationDetail(params as never);
            expect(createdSession.RunAgentFromConversationDetail).toHaveBeenCalledWith(params);
            expect(result).toEqual({ Success: true });
        });
    });

    describe('Angular lifecycle', () => {
        it('should call Dispose on the session when destroyed', () => {
            service.ngOnDestroy();
            expect(createdSession.Dispose).toHaveBeenCalled();
        });
    });
});
