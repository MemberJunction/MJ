/**
 * Unit tests for TeamsMessagingExtension.
 *
 * Tests extension initialization, shutdown, health check, route registration,
 * and webhook handling via CloudAdapter.process().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Application } from 'express';

// ─── Mock botbuilder ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
    const cloudAdapterProcess = vi.fn();
    return { cloudAdapterProcess };
});

vi.mock('botbuilder', () => {
    return {
        CloudAdapter: class MockCloudAdapter {
            process = mocks.cloudAdapterProcess;
            onTurnError: ((context: unknown, error: Error) => Promise<void>) | null = null;
        },
        ConfigurationBotFrameworkAuthentication: class MockAuth {
            constructor(_config: Record<string, unknown>) {}
        },
        TurnContext: { getConversationReference: vi.fn().mockReturnValue({}) },
        ActivityTypes: { Typing: 'typing', Message: 'message' },
    };
});

// Mock external MJ dependencies
vi.mock('@memberjunction/core', async (importOriginal) => {
    const orig = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...orig, RunView: vi.fn(), LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/sqlserver-dataprovider', () => {
    const users = [{ ID: 'fallback', Email: 'bot@company.com', Name: 'Service Account' }];
    class MockUserCache {
        get Users() { return users; }
    }
    return { UserCache: MockUserCache };
});

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: vi.fn().mockImplementation(() => ({
        RunAgent: vi.fn().mockResolvedValue({ success: true, payload: 'ok', agentRun: { Steps: [] } })
    }))
}));

vi.mock('@slack/web-api', () => ({
    WebClient: vi.fn()
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { TeamsMessagingExtension } from '../teams/TeamsMessagingExtension.js';
import { ServerExtensionConfig } from '@memberjunction/server-extensions-core';

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockApp(): Application {
    const registeredRoutes: { method: string; path: string; handler: Function }[] = [];
    return {
        post: vi.fn((path: string, ...handlers: Function[]) => {
            registeredRoutes.push({ method: 'POST', path, handler: handlers[handlers.length - 1] });
        }),
        use: vi.fn(),
        _registeredRoutes: registeredRoutes,
    } as unknown as Application;
}

function createConfig(overrides: Partial<ServerExtensionConfig['Settings']> = {}): ServerExtensionConfig {
    return {
        Enabled: true,
        DriverClass: 'TeamsMessagingExtension',
        RootPath: '/webhook/teams',
        Settings: {
            DefaultAgentName: 'Sage',
            ContextUserEmail: 'bot@company.com',
            BotToken: '',
            MicrosoftAppId: 'ms-app-id',
            MicrosoftAppPassword: 'ms-app-password',
            ...overrides,
        }
    } as ServerExtensionConfig;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TeamsMessagingExtension', () => {
    let extension: TeamsMessagingExtension;

    beforeEach(async () => {
        mocks.cloudAdapterProcess.mockReset();

        const { RunView } = await import('@memberjunction/core');
        vi.mocked(RunView).mockImplementation(() => ({
            RunView: vi.fn().mockResolvedValue({
                Success: true,
                Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }]
            })
        }) as ReturnType<typeof vi.fn>);

        extension = new TeamsMessagingExtension();
    });

    describe('Initialize', () => {
        it('should initialize successfully with valid config', async () => {
            const app = createMockApp();
            const config = createConfig();

            const result = await extension.Initialize(app, config);

            expect(result.Success).toBe(true);
            expect(result.Message).toContain('Teams messaging extension loaded');
            expect(result.RegisteredRoutes).toEqual(['POST /webhook/teams']);
        });

        it('should register a POST route on the configured path', async () => {
            const app = createMockApp();
            const config = createConfig();

            await extension.Initialize(app, config);

            expect(app.post).toHaveBeenCalledWith(
                '/webhook/teams',
                expect.any(Function), // express.json()
                expect.any(Function)  // route handler
            );
        });

        it('should return failure when adapter initialization throws', async () => {
            const { RunView } = await import('@memberjunction/core');
            vi.mocked(RunView).mockImplementation(() => ({
                RunView: vi.fn().mockResolvedValue({ Success: false, Results: [] })
            }) as ReturnType<typeof vi.fn>);

            const app = createMockApp();
            const config = createConfig();

            const result = await extension.Initialize(app, config);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Failed to initialize Teams extension');
        });

        it('should use env variables when settings not provided', async () => {
            const origId = process.env.MICROSOFT_APP_ID;
            const origPw = process.env.MICROSOFT_APP_PASSWORD;
            process.env.MICROSOFT_APP_ID = 'env-id';
            process.env.MICROSOFT_APP_PASSWORD = 'env-pw';

            const app = createMockApp();
            const config = createConfig({ MicrosoftAppId: undefined, MicrosoftAppPassword: undefined });

            const result = await extension.Initialize(app, config);
            expect(result.Success).toBe(true);

            process.env.MICROSOFT_APP_ID = origId;
            process.env.MICROSOFT_APP_PASSWORD = origPw;
        });
    });

    describe('Shutdown', () => {
        it('should clean up adapter and cloud adapter references', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            await extension.Shutdown();

            const health = await extension.HealthCheck();
            expect(health.Healthy).toBe(false);
            expect(health.Details!.adapterInitialized).toBe(false);
            expect(health.Details!.cloudAdapterInitialized).toBe(false);
        });

        it('should not throw when called before initialization', async () => {
            await expect(extension.Shutdown()).resolves.not.toThrow();
        });
    });

    describe('HealthCheck', () => {
        it('should report healthy after successful initialization', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            const health = await extension.HealthCheck();

            expect(health.Healthy).toBe(true);
            expect(health.Name).toBe('TeamsMessagingExtension');
            expect(health.Details!.adapterInitialized).toBe(true);
            expect(health.Details!.cloudAdapterInitialized).toBe(true);
        });

        it('should report unhealthy before initialization', async () => {
            const health = await extension.HealthCheck();

            expect(health.Healthy).toBe(false);
            expect(health.Details!.adapterInitialized).toBe(false);
            expect(health.Details!.cloudAdapterInitialized).toBe(false);
        });

        it('should report unhealthy after shutdown', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig());
            await extension.Shutdown();

            const health = await extension.HealthCheck();
            expect(health.Healthy).toBe(false);
        });
    });

    describe('webhook handler', () => {
        it('should delegate to CloudAdapter.process for incoming requests', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            // Get the registered route handler
            const postCall = vi.mocked(app.post).mock.calls[0];
            const handler = postCall[postCall.length - 1] as Function;

            const mockReq = { body: {} };
            const mockRes = {
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
                headersSent: false,
            };

            await handler(mockReq, mockRes);

            expect(mocks.cloudAdapterProcess).toHaveBeenCalled();
        });

        it('should return 500 when CloudAdapter.process throws', async () => {
            mocks.cloudAdapterProcess.mockRejectedValueOnce(new Error('Bot Framework error'));

            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            const postCall = vi.mocked(app.post).mock.calls[0];
            const handler = postCall[postCall.length - 1] as Function;

            const mockReq = { body: {} };
            const mockRes = {
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
                headersSent: false,
            };

            await handler(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith('Internal Server Error');
        });

        it('should not send response if headers already sent', async () => {
            mocks.cloudAdapterProcess.mockRejectedValueOnce(new Error('error'));

            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            const postCall = vi.mocked(app.post).mock.calls[0];
            const handler = postCall[postCall.length - 1] as Function;

            const mockReq = { body: {} };
            const mockRes = {
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
                headersSent: true,
            };

            await handler(mockReq, mockRes);

            expect(mockRes.status).not.toHaveBeenCalled();
        });
    });
});
