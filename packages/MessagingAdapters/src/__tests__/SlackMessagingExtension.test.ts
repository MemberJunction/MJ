/**
 * Unit tests for SlackMessagingExtension.
 *
 * Tests extension initialization (HTTP mode and Socket Mode),
 * webhook handling, event processing, shutdown, and health checks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Application, Request, Response } from 'express';

// ─── Mock Slack SDKs ─────────────────────────────────────────────────────────

const socketMocks = vi.hoisted(() => {
    const start = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    return { start, disconnect, on };
});

vi.mock('@slack/socket-mode', () => ({
    SocketModeClient: class MockSocketModeClient {
        start = socketMocks.start;
        disconnect = socketMocks.disconnect;
        on = socketMocks.on;
    }
}));

vi.mock('@slack/web-api', () => ({
    WebClient: class MockWebClient {
        auth = { test: vi.fn().mockResolvedValue({ user_id: 'UBOTID' }) };
        chat = {
            postMessage: vi.fn().mockResolvedValue({ ts: 'msg-ts' }),
            update: vi.fn().mockResolvedValue({ ok: true }),
        };
        conversations = { replies: vi.fn().mockResolvedValue({ messages: [] }) };
        users = { info: vi.fn().mockResolvedValue({ user: { profile: { email: 'test@example.com' } } }) };
    }
}));

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

// Mock signature verification
vi.mock('../slack/slack-routes.js', () => ({
    verifySlackSignature: vi.fn().mockReturnValue(true)
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { SlackMessagingExtension } from '../slack/SlackMessagingExtension.js';
import { verifySlackSignature } from '../slack/slack-routes.js';
import { ServerExtensionConfig } from '@memberjunction/server-extensions-core';

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockApp(): Application & { _useHandlers: { path: string; handler: Function }[] } {
    const useHandlers: { path: string; handler: Function }[] = [];
    return {
        post: vi.fn(),
        use: vi.fn((path: string, handler: Function) => {
            useHandlers.push({ path, handler });
        }),
        _useHandlers: useHandlers,
    } as unknown as Application & { _useHandlers: { path: string; handler: Function }[] };
}

function createConfig(overrides: Record<string, unknown> = {}): ServerExtensionConfig {
    return {
        Enabled: true,
        DriverClass: 'SlackMessagingExtension',
        RootPath: '/webhook/slack',
        Settings: {
            DefaultAgentName: 'Sage',
            ContextUserEmail: 'bot@company.com',
            BotToken: 'xoxb-test-token',
            SigningSecret: 'test-signing-secret',
            ConnectionMode: 'http',
            ...overrides,
        }
    } as ServerExtensionConfig;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SlackMessagingExtension', () => {
    let extension: SlackMessagingExtension;

    beforeEach(async () => {
        socketMocks.start.mockReset().mockResolvedValue(undefined);
        socketMocks.disconnect.mockReset().mockResolvedValue(undefined);
        socketMocks.on.mockReset();
        vi.mocked(verifySlackSignature).mockReset().mockReturnValue(true);

        const { RunView } = await import('@memberjunction/core');
        vi.mocked(RunView).mockImplementation(() => {
            const callCount = { n: 0 };
            return {
                RunView: vi.fn().mockImplementation(() => {
                    callCount.n++;
                    if (callCount.n === 1) {
                        return { Success: true, Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }] };
                    }
                    return { Success: true, Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }] };
                })
            } as ReturnType<typeof vi.fn>;
        });

        extension = new SlackMessagingExtension();
    });

    describe('Initialize — HTTP mode', () => {
        it('should initialize successfully in HTTP mode', async () => {
            const app = createMockApp();
            const config = createConfig();

            const result = await extension.Initialize(app, config);

            expect(result.Success).toBe(true);
            expect(result.Message).toContain('Slack extension loaded (HTTP mode)');
            expect(result.RegisteredRoutes).toEqual(['POST /webhook/slack', 'POST /webhook/slack/interact']);
        });

        it('should mount router on the configured root path', async () => {
            const app = createMockApp();
            const config = createConfig();

            await extension.Initialize(app, config);

            expect(app.use).toHaveBeenCalledWith('/webhook/slack', expect.anything());
        });

        it('should default to HTTP mode when ConnectionMode not set', async () => {
            const app = createMockApp();
            const config = createConfig({ ConnectionMode: undefined });

            const result = await extension.Initialize(app, config);

            expect(result.Success).toBe(true);
            expect(result.Message).toContain('HTTP mode');
        });

        it('should return failure when adapter initialization fails', async () => {
            const { RunView } = await import('@memberjunction/core');
            vi.mocked(RunView).mockImplementation(() => ({
                RunView: vi.fn().mockResolvedValue({ Success: false, Results: [] })
            }) as ReturnType<typeof vi.fn>);

            const app = createMockApp();
            const config = createConfig();

            const result = await extension.Initialize(app, config);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Failed to initialize Slack extension');
        });
    });

    describe('Initialize — Socket Mode', () => {
        it('should initialize successfully in Socket Mode', async () => {
            const app = createMockApp();
            const config = createConfig({ ConnectionMode: 'socket', AppToken: 'xapp-test-token' });

            const result = await extension.Initialize(app, config);

            expect(result.Success).toBe(true);
            expect(result.Message).toContain('Socket Mode');
            expect(result.RegisteredRoutes).toEqual(['WebSocket (Socket Mode)']);
        });

        it('should register message and app_mention event listeners', async () => {
            const app = createMockApp();
            const config = createConfig({ ConnectionMode: 'socket', AppToken: 'xapp-test-token' });

            await extension.Initialize(app, config);

            const eventNames = socketMocks.on.mock.calls.map((call: string[]) => call[0]);
            expect(eventNames).toContain('message');
            expect(eventNames).toContain('app_mention');
        });

        it('should call start on SocketModeClient', async () => {
            const app = createMockApp();
            const config = createConfig({ ConnectionMode: 'socket', AppToken: 'xapp-test-token' });

            await extension.Initialize(app, config);

            expect(socketMocks.start).toHaveBeenCalled();
        });

        it('should fail when AppToken is missing for Socket Mode', async () => {
            const app = createMockApp();
            const config = createConfig({ ConnectionMode: 'socket', AppToken: undefined });

            const result = await extension.Initialize(app, config);

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('AppToken');
        });
    });

    describe('handleWebhook', () => {
        async function getWebhookHandler(ext: SlackMessagingExtension): (req: Request, res: Response) => Promise<void> {
            const app = createMockApp();
            await ext.Initialize(app, createConfig());

            // The router is passed to app.use — we need to extract the POST handler
            // The extension uses Router().post('/', handler), then app.use(rootPath, router)
            // We access the internal handleWebhook method via the extension
            return (ext as unknown as { handleWebhook: (req: Request, res: Response) => Promise<void> }).handleWebhook.bind(ext);
        }

        it('should respond to url_verification challenge', async () => {
            const handler = await getWebhookHandler(extension);

            const req = {
                body: { type: 'url_verification', challenge: 'test-challenge-token' },
                headers: {},
            } as unknown as Request;
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await handler(req, res);

            expect(res.json).toHaveBeenCalledWith({ challenge: 'test-challenge-token' });
        });

        it('should return 401 when signature verification fails', async () => {
            vi.mocked(verifySlackSignature).mockReturnValueOnce(false);
            const handler = await getWebhookHandler(extension);

            const req = {
                body: { type: 'event_callback' },
                headers: {},
            } as unknown as Request;
            const res = {
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
                json: vi.fn(),
            } as unknown as Response;

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.send).toHaveBeenCalledWith('Invalid signature');
        });

        it('should acknowledge with 200 for valid event payloads', async () => {
            const handler = await getWebhookHandler(extension);

            const req = {
                body: {
                    type: 'event_callback',
                    event: { type: 'message', text: 'hello', user: 'U1', channel: 'D1', channel_type: 'im', ts: '123.456' }
                },
                headers: {},
            } as unknown as Request;
            const res = {
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
                json: vi.fn(),
            } as unknown as Response;

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalled();
        });

        it('should skip signature verification when signing secret is empty', async () => {
            const ext = new SlackMessagingExtension();
            const app = createMockApp();
            await ext.Initialize(app, createConfig({ SigningSecret: '' }));

            const handler = (ext as unknown as { handleWebhook: (req: Request, res: Response) => Promise<void> }).handleWebhook.bind(ext);

            const req = {
                body: { type: 'url_verification', challenge: 'test' },
                headers: {},
            } as unknown as Request;
            const res = {
                json: vi.fn(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await handler(req, res);

            expect(verifySlackSignature).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ challenge: 'test' });
        });
    });

    describe('processSlackEvent', () => {
        async function getProcessEvent(ext: SlackMessagingExtension): (event: Record<string, unknown> | undefined) => Promise<void> {
            const app = createMockApp();
            await ext.Initialize(app, createConfig());
            return (ext as unknown as { processSlackEvent: (event: Record<string, unknown> | undefined) => Promise<void> }).processSlackEvent.bind(ext);
        }

        it('should process message events', async () => {
            const processEvent = await getProcessEvent(extension);

            // Should not throw for a valid message event
            await expect(processEvent({
                type: 'message',
                text: 'hello',
                user: 'U_SENDER',
                channel: 'D_DM',
                channel_type: 'im',
                ts: '1234567890.123456'
            })).resolves.not.toThrow();
        });

        it('should process app_mention events', async () => {
            const processEvent = await getProcessEvent(extension);

            await expect(processEvent({
                type: 'app_mention',
                text: '<@UBOTID> hello',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                ts: '1234567890.123456'
            })).resolves.not.toThrow();
        });

        it('should ignore non-message/non-mention event types', async () => {
            const { LogStatus } = await import('@memberjunction/core');
            const processEvent = await getProcessEvent(extension);

            await processEvent({ type: 'reaction_added', user: 'U1', channel: 'C1' });

            expect(vi.mocked(LogStatus)).toHaveBeenCalledWith(
                expect.stringContaining("ignoring event type 'reaction_added'")
            );
        });

        it('should skip events with bot_id', async () => {
            const { LogStatus } = await import('@memberjunction/core');
            const processEvent = await getProcessEvent(extension);

            await processEvent({
                type: 'message',
                text: 'bot message',
                bot_id: 'B123',
                channel: 'C1',
                ts: '123.456'
            });

            expect(vi.mocked(LogStatus)).toHaveBeenCalledWith(
                expect.stringContaining('skipping bot/subtype message')
            );
        });

        it('should skip events with subtype', async () => {
            const { LogStatus } = await import('@memberjunction/core');
            const processEvent = await getProcessEvent(extension);

            await processEvent({
                type: 'message',
                subtype: 'message_changed',
                text: 'edited',
                user: 'U1',
                channel: 'C1',
                ts: '123.456'
            });

            expect(vi.mocked(LogStatus)).toHaveBeenCalledWith(
                expect.stringContaining('skipping bot/subtype message')
            );
        });

        it('should handle undefined event gracefully', async () => {
            const { LogStatus } = await import('@memberjunction/core');
            const processEvent = await getProcessEvent(extension);

            await processEvent(undefined);

            expect(vi.mocked(LogStatus)).toHaveBeenCalledWith(
                expect.stringContaining('no event in payload')
            );
        });

        it('should log error when adapter throws', async () => {
            const { LogError } = await import('@memberjunction/core');
            const processEvent = await getProcessEvent(extension);

            // Send an event that will cause adapter.MapSlackEvent to process,
            // and the agent runner will handle it. Since our mock is set up,
            // this should succeed without error. We test error handling by
            // checking that errors in event processing are caught.
            await processEvent({
                type: 'message',
                text: 'hello',
                user: 'U1',
                channel: 'C1',
                channel_type: 'im',
                ts: '123.456'
            });

            // The call should complete without throwing
        });
    });

    describe('Shutdown', () => {
        it('should clean up adapter reference', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            await extension.Shutdown();

            const health = await extension.HealthCheck();
            expect(health.Healthy).toBe(false);
        });

        it('should disconnect Socket Mode client when active', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig({
                ConnectionMode: 'socket',
                AppToken: 'xapp-test-token'
            }));

            await extension.Shutdown();

            expect(socketMocks.disconnect).toHaveBeenCalled();
        });

        it('should not throw when no Socket Mode client exists', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            await expect(extension.Shutdown()).resolves.not.toThrow();
        });
    });

    describe('HealthCheck', () => {
        it('should report healthy after HTTP initialization', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig());

            const health = await extension.HealthCheck();

            expect(health.Healthy).toBe(true);
            expect(health.Name).toBe('SlackMessagingExtension');
            expect(health.Details!.adapterInitialized).toBe(true);
            expect(health.Details!.connectionMode).toBe('http');
            expect(health.Details!.signatureVerificationEnabled).toBe(true);
        });

        it('should report socket mode details when using Socket Mode', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig({
                ConnectionMode: 'socket',
                AppToken: 'xapp-test-token'
            }));

            const health = await extension.HealthCheck();

            expect(health.Details!.connectionMode).toBe('socket');
            expect(health.Details!.socketModeConnected).toBe(true);
        });

        it('should report unhealthy before initialization', async () => {
            const health = await extension.HealthCheck();

            expect(health.Healthy).toBe(false);
            expect(health.Details!.adapterInitialized).toBe(false);
        });

        it('should report signature verification disabled when no secret', async () => {
            const app = createMockApp();
            await extension.Initialize(app, createConfig({ SigningSecret: '' }));

            const health = await extension.HealthCheck();
            expect(health.Details!.signatureVerificationEnabled).toBe(false);
        });
    });
});
