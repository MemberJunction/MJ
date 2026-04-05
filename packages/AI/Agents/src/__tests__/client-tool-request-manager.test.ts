import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @memberjunction/global before importing the manager
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        BaseSingleton: class MockBaseSingleton<T> {
            private static _instance: unknown;
            protected constructor() {}
            static getInstance<U>(): U {
                if (!MockBaseSingleton._instance) {
                    MockBaseSingleton._instance = new (this as unknown as new () => U)();
                }
                return MockBaseSingleton._instance as U;
            }
        },
    };
});

vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

import { ClientToolRequestManager } from '../ClientToolRequestManager';

describe('ClientToolRequestManager', () => {
    let manager: ClientToolRequestManager;
    let mockPublish: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        // Get the singleton (fresh due to mock)
        manager = ClientToolRequestManager.Instance;
        mockPublish = vi.fn();
        manager.SetPublishFunction(mockPublish);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('RequestClientTool', () => {
        it('should publish a tool request via PubSub', async () => {
            // Start the request but don't await — simulate immediate client response
            const promise = manager.RequestClientTool(
                'req-1', 'NavigateToRecord', { EntityName: 'Members', RecordID: '123' },
                'session-abc', 'run-xyz', 5000, 'Navigate to member'
            );

            // Verify the publish was called
            expect(mockPublish).toHaveBeenCalledTimes(1);
            const [topic, payload] = mockPublish.mock.calls[0];
            expect(topic).toBe('CLIENT_TOOL_REQUEST');
            expect(payload.RequestID).toBe('req-1');
            expect(payload.ToolName).toBe('NavigateToRecord');
            expect(payload.SessionID).toBe('session-abc');
            expect(payload.AgentRunID).toBe('run-xyz');
            expect(payload.TimeoutMs).toBe(5000);
            expect(JSON.parse(payload.Params)).toEqual({ EntityName: 'Members', RecordID: '123' });

            // Simulate client response
            manager.ReceiveResponse({
                RequestID: 'req-1',
                Success: true,
                Result: { navigated: true }
            });

            const result = await promise;
            expect(result.Success).toBe(true);
            expect(result.Result).toEqual({ navigated: true });
        });

        it('should time out if client does not respond', async () => {
            vi.useFakeTimers();

            const promise = manager.RequestClientTool(
                'req-timeout', 'SlowTool', {},
                'session-1', 'run-1', 100
            );

            // Advance past the timeout
            vi.advanceTimersByTime(150);

            const result = await promise;
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('timed out');
            expect(result.ErrorMessage).toContain('SlowTool');

            vi.useRealTimers();
        });

        it('should return error when PubSub is not configured', async () => {
            manager.SetPublishFunction(null as unknown as (topic: string, payload: Record<string, unknown>) => void);
            // Override to simulate no publish function
            const freshManager = new (ClientToolRequestManager as unknown as new () => ClientToolRequestManager)();

            const result = await freshManager.RequestClientTool(
                'req-no-pubsub', 'SomeTool', {},
                'session-1', 'run-1', 5000
            );

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('PubSub not configured');
        });
    });

    describe('ReceiveResponse', () => {
        it('should resolve the pending promise when response matches', async () => {
            const promise = manager.RequestClientTool(
                'req-match', 'Tool', {},
                'session-1', 'run-1', 5000
            );

            const found = manager.ReceiveResponse({
                RequestID: 'req-match',
                Success: true,
                Result: 'done'
            });

            expect(found).toBe(true);
            const result = await promise;
            expect(result.Success).toBe(true);
            expect(result.Result).toBe('done');
        });

        it('should return false for unknown request IDs', () => {
            const found = manager.ReceiveResponse({
                RequestID: 'unknown-id',
                Success: true
            });
            expect(found).toBe(false);
        });

        it('should handle error responses', async () => {
            const promise = manager.RequestClientTool(
                'req-err', 'FailTool', {},
                'session-1', 'run-1', 5000
            );

            manager.ReceiveResponse({
                RequestID: 'req-err',
                Success: false,
                ErrorMessage: 'Tool not found on client'
            });

            const result = await promise;
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('Tool not found on client');
        });
    });

    describe('PendingRequestCount', () => {
        it('should track pending requests and decrement on response', async () => {
            expect(manager.PendingRequestCount).toBe(0);

            const promise = manager.RequestClientTool(
                'req-count', 'CountTool', {},
                'session-1', 'run-1', 5000
            );

            expect(manager.PendingRequestCount).toBe(1);

            manager.ReceiveResponse({ RequestID: 'req-count', Success: true });
            await promise;

            expect(manager.PendingRequestCount).toBe(0);
        });

        it('should decrement pending count on timeout', async () => {
            vi.useFakeTimers();

            manager.RequestClientTool(
                'req-count-timeout', 'TimeoutTool', {},
                'session-1', 'run-1', 50
            );

            expect(manager.PendingRequestCount).toBe(1);

            vi.advanceTimersByTime(60);

            // Allow microtask queue to flush
            await vi.runAllTimersAsync();
            expect(manager.PendingRequestCount).toBe(0);

            vi.useRealTimers();
        });
    });

    describe('Session Tools', () => {
        it('should store and retrieve session tools', () => {
            const tools = [
                { Name: 'ToolA', Description: 'Test A', InputSchema: {} },
                { Name: 'ToolB', Description: 'Test B', InputSchema: {} }
            ];

            manager.SetSessionTools('session-1', tools);
            const retrieved = manager.GetSessionTools('session-1');
            expect(retrieved).toHaveLength(2);
            expect(retrieved[0].Name).toBe('ToolA');
        });

        it('should return empty array for unknown sessions', () => {
            const tools = manager.GetSessionTools('unknown-session');
            expect(tools).toEqual([]);
        });

        it('should clear session tools', () => {
            manager.SetSessionTools('session-clear', [{ Name: 'X', Description: 'X', InputSchema: {} }]);
            expect(manager.GetSessionTools('session-clear')).toHaveLength(1);

            manager.ClearSession('session-clear');
            expect(manager.GetSessionTools('session-clear')).toEqual([]);
        });
    });
});
