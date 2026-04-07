/**
 * Unit tests for SlackAdapter.
 *
 * Tests Slack-specific behavior: event mapping, @mention parsing,
 * typing indicator, streaming message reuse, and bot mention stripping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackAdapter } from '../slack/SlackAdapter.js';
import { MessagingAdapterSettings } from '../base/types.js';

// ─── Mock Slack Web API ──────────────────────────────────────────────────────

// Use vi.hoisted so the mock fns exist when vi.mock factory runs
const mocks = vi.hoisted(() => {
    const postMessage = vi.fn();
    const chatUpdate = vi.fn();
    const conversationsReplies = vi.fn();
    const usersInfo = vi.fn();
    const authTest = vi.fn();
    return { postMessage, chatUpdate, conversationsReplies, usersInfo, authTest };
});

vi.mock('@slack/web-api', () => {
    return {
        WebClient: class MockWebClient {
            auth = { test: mocks.authTest };
            chat = { postMessage: mocks.postMessage, update: mocks.chatUpdate };
            conversations = { replies: mocks.conversationsReplies };
            users = { info: mocks.usersInfo };
        }
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

// ─── Test setup ──────────────────────────────────────────────────────────────

const defaultSettings: MessagingAdapterSettings = {
    DefaultAgentName: 'Sage',
    ContextUserEmail: 'bot@company.com',
    BotToken: 'xoxb-test-token',
    MaxThreadMessages: 50,
    ShowTypingIndicator: true,
    StreamingUpdateIntervalMs: 1000,
};

async function createInitializedAdapter(): Promise<SlackAdapter> {
    const { RunView } = await import('@memberjunction/core');
    const callCount = { n: 0 };
    vi.mocked(RunView).mockImplementation(() => ({
        RunView: vi.fn().mockImplementation(() => {
            callCount.n++;
            if (callCount.n === 1) {
                // loadDefaultAgent
                return { Success: true, Results: [{ ID: 'agent-guid-123', Name: 'Default Agent' }] };
            }
            // loadAvailableAgents
            return {
                Success: true,
                Results: [
                    { ID: 'sage-id', Name: 'Sage' },
                    { ID: 'research-id', Name: 'Research Agent' },
                    { ID: 'research-bot-id', Name: 'ResearchBot' },
                    { ID: 'skip-id', Name: 'Skip' },
                    { ID: 'codesmith-id', Name: 'Codesmith Agent' },
                    { ID: 'agent-guid-123', Name: 'Default Agent' }
                ]
            };
        })
    }) as ReturnType<typeof vi.fn>);

    const adapter = new SlackAdapter(defaultSettings);
    await adapter.Initialize();
    return adapter;
}

describe('SlackAdapter', () => {
    beforeEach(() => {
        mocks.authTest.mockReset().mockResolvedValue({ user_id: 'UBOTID123' });
        mocks.postMessage.mockReset().mockResolvedValue({ ts: 'posted-ts-1' });
        mocks.chatUpdate.mockReset().mockResolvedValue({ ok: true });
        mocks.conversationsReplies.mockReset().mockResolvedValue({ messages: [] });
        mocks.usersInfo.mockReset().mockResolvedValue({ user: { profile: { email: 'test@example.com' } } });
    });

    describe('MapSlackEvent', () => {
        let adapter: SlackAdapter;

        beforeEach(async () => {
            adapter = await createInitializedAdapter();
        });

        it('should map a DM event correctly', () => {
            const event = {
                ts: '1234567890.123456',
                text: 'Hello bot',
                user: 'U_SENDER',
                channel: 'D_DM_CHANNEL',
                channel_type: 'im',
                type: 'message'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MessageID).toBe('1234567890.123456');
            expect(msg.Text).toBe('Hello bot');
            expect(msg.SenderID).toBe('U_SENDER');
            expect(msg.ChannelID).toBe('D_DM_CHANNEL');
            expect(msg.IsDirectMessage).toBe(true);
            expect(msg.IsBotMention).toBe(false);
            expect(msg.ThreadID).toBeNull();
        });

        it('should map an app_mention event correctly', () => {
            const event = {
                ts: '1234567890.654321',
                text: '<@UBOTID123> what is the status?',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                channel_type: 'channel',
                type: 'app_mention',
                thread_ts: '1234567890.000001'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.IsBotMention).toBe(true);
            expect(msg.IsDirectMessage).toBe(false);
            expect(msg.ThreadID).toBe('1234567890.000001');
        });

        it('should parse single-word agent @mentions from message text', () => {
            const event = {
                ts: '1234567890.111111',
                text: '<@UBOTID123> ask @Sage about the project',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                type: 'app_mention'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MentionedAgentNames).toContain('Sage');
        });

        it('should parse multi-word agent @mentions', () => {
            const event = {
                ts: '1234567890.222222',
                text: '<@UBOTID123> ask @Research Agent about quantum computing',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                type: 'app_mention'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MentionedAgentNames).toContain('Research Agent');
        });

        it('should parse multiple agent @mentions', () => {
            const event = {
                ts: '1234567890.222223',
                text: '<@UBOTID123> ask @Sage and @ResearchBot for help',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                type: 'app_mention'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MentionedAgentNames).toContain('Sage');
            expect(msg.MentionedAgentNames).toContain('ResearchBot');
        });

        it('should return empty MentionedAgentNames when no agents mentioned', () => {
            const event = {
                ts: '1234567890.333333',
                text: '<@UBOTID123> hello!',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                type: 'app_mention'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MentionedAgentNames).toEqual([]);
        });

        it('should match agent by first-word prefix (e.g., @Codesmith → Codesmith Agent)', () => {
            const event = {
                ts: '1234567890.555555',
                text: '<@UBOTID123> @Codesmith render a circle',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                type: 'app_mention'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MentionedAgentNames).toContain('Codesmith Agent');
        });

        it('should match agent by first-word prefix case-insensitively', () => {
            const event = {
                ts: '1234567890.555556',
                text: '<@UBOTID123> @codesmith do something cool',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                type: 'app_mention'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MentionedAgentNames).toContain('Codesmith Agent');
        });

        it('should not treat Slack user mentions <@U...> as agent mentions', () => {
            const event = {
                ts: '1234567890.444444',
                text: '<@UBOTID123> tell <@U_OTHER_USER> about it',
                user: 'U_SENDER',
                channel: 'C_CHANNEL',
                type: 'app_mention'
            };

            const msg = adapter.MapSlackEvent(event);
            expect(msg.MentionedAgentNames).not.toContain('U_OTHER_USER');
        });
    });

    describe('typing indicator', () => {
        it('should post a Thinking message as typing indicator', async () => {
            const adapter = await createInitializedAdapter();
            const msg = adapter.MapSlackEvent({
                ts: '1234567890.100000',
                text: 'hello',
                user: 'U_SENDER',
                channel: 'D_DM',
                channel_type: 'im',
                type: 'message'
            });

            await adapter.HandleMessage(msg);

            const thinkingCall = mocks.postMessage.mock.calls.find(
                (call: Record<string, unknown>[]) => (call[0] as Record<string, unknown>).text === '_Thinking..._'
            );
            expect(thinkingCall).toBeDefined();
        });

        it('should reuse Thinking message for final response when no streaming occurred', async () => {
            const adapter = await createInitializedAdapter();
            // Override so the thinking message has a known ts
            mocks.postMessage.mockResolvedValueOnce({ ts: 'thinking-ts' });

            const msg = adapter.MapSlackEvent({
                ts: '1234567890.200000',
                text: 'hello',
                user: 'U_SENDER',
                channel: 'D_DM',
                channel_type: 'im',
                type: 'message'
            });

            await adapter.HandleMessage(msg);

            // The thinking message should have been updated in-place
            const updateCall = mocks.chatUpdate.mock.calls.find(
                (call: Record<string, unknown>[]) => (call[0] as Record<string, unknown>).ts === 'thinking-ts'
            );
            expect(updateCall).toBeDefined();
        });
    });

    describe('user email lookup', () => {
        it('should call users.info to look up email', async () => {
            const adapter = await createInitializedAdapter();

            const msg = adapter.MapSlackEvent({
                ts: '1234567890.300000',
                text: 'hello',
                user: 'U_ALICE',
                channel: 'D_DM',
                channel_type: 'im',
                type: 'message'
            });

            await adapter.HandleMessage(msg);

            expect(mocks.usersInfo).toHaveBeenCalledWith({ user: 'U_ALICE' });
        });
    });
});
