/**
 * A widget guest's agent runs as the elevated system user, but the conversation belongs to the guest, and only its
 * owner (or a grantee) may write its messages (MJConversationDetailEntityExtended, MJ#4791). So AgentRunner writes
 * conversation rows as `ConversationWriter` when the caller names one, and everything else as the run's user.
 *
 * No DB, no network — the provider is a fake that records who each entity object was requested for.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView() {
                return { Success: true, Results: [] };
            }
        },
        RunQuery: class {
            async RunQuery() {
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

import { AgentRunner } from '../AgentRunner';

const RUN_USER = { ID: 'system-user', Email: 'system@example.com' } as unknown as UserInfo;
const GUEST = { ID: 'anonymous-user', Email: 'anonymous@magic-link.local' } as unknown as UserInfo;

interface FakeRow {
    ID: string;
    ConversationID?: string;
    UserID?: string;
    LatestResult: null;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    Load: () => Promise<boolean>;
    EnsureSaveComplete: () => Promise<void>;
    [key: string]: unknown;
}

/** A provider that hands out fake rows and records (entity name, user id) for each request. */
function recordingProvider(): { provider: IMetadataProvider; requests: Array<{ entity: string; userId: string | undefined }>; rows: FakeRow[] } {
    const requests: Array<{ entity: string; userId: string | undefined }> = [];
    const rows: FakeRow[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (entity: string, user?: UserInfo) => {
            requests.push({ entity, userId: user?.ID });
            const row: FakeRow = {
                ID: `row-${rows.length + 1}`,
                ConversationID: 'conv-1',
                LatestResult: null,
                NewRecord: () => undefined,
                Save: async () => true,
                Load: async () => true,
                EnsureSaveComplete: async () => undefined,
                MarkServerAuthoredReply: () => undefined,
            };
            rows.push(row);
            return row;
        }),
    } as unknown as IMetadataProvider;
    return { provider, requests, rows };
}

interface RunAgentStub {
    RunAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;
}

function stubRun(runner: AgentRunner): void {
    vi.spyOn(runner as unknown as RunAgentStub, 'RunAgent').mockImplementation(async (params: ExecuteAgentParams) => {
        await params.onProgress?.({ step: 'prompt_execution', percentage: 50, message: 'thinking' } as never);
        return { success: true, agentRun: { Message: 'Hello' } } as unknown as ExecuteAgentResult;
    });
}

const PARAMS = { agent: { ID: 'agent-1', Name: 'Widget Agent' }, conversationMessages: [], contextUser: RUN_USER } as unknown as ExecuteAgentParams;
const conversationRequests = (requests: Array<{ entity: string; userId: string | undefined }>) =>
    requests.filter((r) => r.entity === 'MJ: Conversation Details' || r.entity === 'MJ: Conversations');

describe('AgentRunner.RunAgentInConversation — ConversationWriter', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('updates a pre-created reply row (the widget path) as the conversation writer, not the elevated run user', async () => {
        const { provider, requests } = recordingProvider();
        const runner = new AgentRunner(provider);
        stubRun(runner);

        await runner.RunAgentInConversation(PARAMS, { conversationId: 'conv-1', conversationDetailId: 'reply-1', ConversationWriter: GUEST });

        const writes = conversationRequests(requests);
        expect(writes.length).toBeGreaterThan(0);
        expect(writes.every((r) => r.userId === GUEST.ID)).toBe(true);
    });

    it('creates the conversation, the user message and the reply as the conversation writer, and stamps the message with its id', async () => {
        const { provider, requests, rows } = recordingProvider();
        const runner = new AgentRunner(provider);
        stubRun(runner);

        await runner.RunAgentInConversation(PARAMS, { userMessage: 'hi', ConversationWriter: GUEST });

        expect(conversationRequests(requests).every((r) => r.userId === GUEST.ID)).toBe(true);
        expect(rows.some((r) => r.UserID === GUEST.ID && r.Role === 'User')).toBe(true);
        expect(rows.some((r) => r.Role === 'AI')).toBe(true); // the reply row was created (CreateAgentReplyDetail), as the writer
        expect(requests.filter((r) => r.entity === 'MJ: Conversation Details')).toHaveLength(2);
    });

    it('defaults to the run user when no writer is named (every other caller is unchanged)', async () => {
        const { provider, requests } = recordingProvider();
        const runner = new AgentRunner(provider);
        stubRun(runner);

        await runner.RunAgentInConversation(PARAMS, { conversationId: 'conv-1', conversationDetailId: 'reply-1' });

        expect(conversationRequests(requests).every((r) => r.userId === RUN_USER.ID)).toBe(true);
    });
});
