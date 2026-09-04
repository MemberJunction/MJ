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

vi.mock('@memberjunction/generic-database-provider', () => {
    // Models the real UserCache: BaseSingleton's constructor returns the shared instance, and
    // `Instance` is the only supported accessor (see BaseMessagingAdapter.test.ts for the full
    // note — `new UserCache()` wipes the shared cache and is why this mock must expose Instance).
    const users = [{ ID: 'fallback', Email: 'bot@company.com', Name: 'Service Account' }];
    const store: { instance?: MockUserCache } = {};
    class MockUserCache {
        _users = users;
        get Users() { return this._users; }
        static get Instance(): MockUserCache {
            if (!store.instance) store.instance = new MockUserCache();
            return store.instance;
        }
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
        mocks.authTest.mockReset().mockResolvedValue({ user_id: 'UBOTID123', bot_id: 'BBOTID456' });
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

    describe('self-identification (bot_id vs user_id)', () => {
        // Slack returns TWO identifiers for one bot, and which one appears in history depends on
        // how the message was posted. `chat:write.customize` — required for per-agent identity,
        // and used on every agent reply — makes the post come back as `subtype: 'bot_message'`
        // with a `bot_id` and NO `user`, so fetchThreadHistory records the B… id. Comparing only
        // against auth.test()'s U… id therefore never matched this adapter's own replies.
        const self = (a: SlackAdapter, id: string | null | undefined): boolean =>
            (a as unknown as { isSelf(s: string | null | undefined): boolean }).isSelf(id);

        it('recognises its own reply posted under a username override', async () => {
            const adapter = await createInitializedAdapter();
            // The identity fetchThreadHistory actually produces for this adapter's own replies.
            expect(self(adapter, 'BBOTID456')).toBe(true);
        });

        it('still recognises the plain user_id identity', async () => {
            const adapter = await createInitializedAdapter();
            expect(self(adapter, 'UBOTID123')).toBe(true);
        });

        it('does not mistake another bot or a user for itself', async () => {
            const adapter = await createInitializedAdapter();
            expect(self(adapter, 'BOTHERBOT')).toBe(false);
            expect(self(adapter, 'UHUMAN001')).toBe(false);
            expect(self(adapter, '')).toBe(false);
            expect(self(adapter, undefined)).toBe(false);
        });
    });

    describe('uploadMediaOutputs', () => {
        // Slack's image blocks require a public https URL, so base64 output (every generated
        // image, and files inlined as data: URIs) was silently dropped. These upload instead.
        const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        function uploaderHarness() {
            const uploads: Record<string, unknown>[] = [];
            const harness = Object.create(SlackAdapter.prototype) as SlackAdapter & {
                client: unknown;
                uploadMediaOutputs: (m: unknown, f: unknown[]) => Promise<void>;
            };
            (harness as { client: unknown }).client = {
                files: { uploadV2: async (args: Record<string, unknown>) => { uploads.push(args); return { ok: true }; } },
            };
            return { harness, uploads };
        }

        it('gives a .docx the correct extension, not the MIME subtype', async () => {
            const { harness, uploads } = uploaderHarness();
            await harness.uploadMediaOutputs({ ChannelID: 'C1', MessageID: 'm1' } as never, [
                { modality: 'file', mimeType: DOCX, data: Buffer.from('doc').toString('base64'), label: 'Download Document' },
            ]);
            expect(uploads).toHaveLength(1);
            expect(uploads[0].filename).toBe('Download_Document.docx');
            expect((uploads[0].file as Buffer).toString()).toBe('doc');
        });

        it('prefers an explicit fileName and keeps its existing extension', async () => {
            const { harness, uploads } = uploaderHarness();
            await harness.uploadMediaOutputs({ ChannelID: 'C1', MessageID: 'm1' } as never, [
                { modality: 'file', mimeType: DOCX, data: 'ZG9j', fileName: 'MemberJunction Overview.docx' },
            ]);
            expect(uploads[0].filename).toBe('MemberJunction_Overview.docx');
        });

        it('threads uploads under the reply and skips entries with no data', async () => {
            const { harness, uploads } = uploaderHarness();
            await harness.uploadMediaOutputs({ ChannelID: 'C1', MessageID: 'm1', ThreadID: 't7' } as never, [
                { modality: 'image', mimeType: 'image/png', data: 'aW1n', label: 'Generated image 1' },
                { modality: 'image', mimeType: 'image/png', data: '' },
                { modality: 'image', mimeType: 'image/png' },
            ]);
            expect(uploads).toHaveLength(1);
            expect(uploads[0].thread_ts).toBe('t7');
            expect(uploads[0].filename).toBe('Generated_image_1.png');
        });
    });


    describe('message text length (msg_too_long)', () => {
        // Slack rejects a message whose `text` exceeds ~4,000 characters. The limit here was set
        // to 39,000 — the figure for a message's total BLOCK payload — so truncation never
        // engaged before Slack refused the call: every streaming update for a long output failed,
        // the progress placeholder froze mid-run, and the log filled with msg_too_long.
        const SLACK_TEXT_LIMIT = 4000;

        function streamingHarness() {
            const sent: Record<string, unknown>[] = [];
            const harness = Object.create(SlackAdapter.prototype) as SlackAdapter & {
                client: unknown;
                thinkingMessageIds: Map<string, string>;
                sendOrUpdateStreamingMessage: (m: unknown, c: string, id: string | null, a?: unknown) => Promise<string>;
            };
            (harness as { client: unknown }).client = {
                chat: {
                    update: async (args: Record<string, unknown>) => { sent.push(args); return { ok: true, ts: 'ts-1' }; },
                    postMessage: async (args: Record<string, unknown>) => { sent.push(args); return { ok: true, ts: 'ts-1' }; },
                },
            };
            (harness as { thinkingMessageIds: Map<string, string> }).thinkingMessageIds = new Map();
            return { harness, sent };
        }

        it('keeps a streaming update under Slack\'s text limit', async () => {
            const { harness, sent } = streamingHarness();
            const huge = 'x'.repeat(50_000);
            await harness.sendOrUpdateStreamingMessage({ ChannelID: 'C1', MessageID: 'm1' } as never, huge, 'ts-1');
            expect(sent).toHaveLength(1);
            expect((sent[0].text as string).length).toBeLessThanOrEqual(SLACK_TEXT_LIMIT);
        });

        it('keeps a new streaming message under the limit too', async () => {
            const { harness, sent } = streamingHarness();
            await harness.sendOrUpdateStreamingMessage({ ChannelID: 'C1', MessageID: 'm1' } as never, 'y'.repeat(50_000), null);
            expect((sent[0].text as string).length).toBeLessThanOrEqual(SLACK_TEXT_LIMIT);
        });

        it('leaves short content untouched', async () => {
            const { harness, sent } = streamingHarness();
            await harness.sendOrUpdateStreamingMessage({ ChannelID: 'C1', MessageID: 'm1' } as never, 'short answer', 'ts-1');
            expect(sent[0].text).toBe('short answer ...');
        });
    });

});
