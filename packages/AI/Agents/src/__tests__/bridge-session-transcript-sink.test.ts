import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CreateBridgeSessionTranscriptSink } from '../realtime/bridge-session-transcript-sink';

const user = { ID: 'user-1' } as unknown as UserInfo;

interface Row {
    ConversationID?: string;
    Role?: string;
    Message?: string;
    AgentSessionID?: string;
    UserID?: string;
    AgentID?: string;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    LatestResult?: { CompleteMessage: string };
}

function makeProvider(saveResults: boolean[] = []) {
    const rows: Row[] = [];
    const entityNames: string[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (name: string) => {
            entityNames.push(name);
            const index = rows.length;
            const row: Row = {
                NewRecord: () => {},
                Save: async () => saveResults[index] ?? true,
                LatestResult: { CompleteMessage: 'denied' },
            };
            rows.push(row);
            return row;
        }),
    } as unknown as IMetadataProvider;
    return { provider, rows, entityNames };
}

const line = (text: string, agent: boolean) => ({ RoomKey: 'CA1', AgentSessionID: 's1', AgentID: 'co-agent', IsAgentSpeech: agent, Text: text });

describe('CreateBridgeSessionTranscriptSink', () => {
    const options = { ConversationID: 'conv-1', AgentSessionID: 'sess-1', AgentID: 'target-agent' };

    it("writes a turn into the session's own conversation, stamped like the browser path", async () => {
        const { provider, rows, entityNames } = makeProvider();
        await CreateBridgeSessionTranscriptSink(options)(line('Hello', false), user, provider);
        expect(entityNames).toEqual(['MJ: Conversation Details']);
        expect(rows[0]).toMatchObject({ ConversationID: 'conv-1', Role: 'User', Message: 'Hello', AgentSessionID: 'sess-1', UserID: 'user-1' });
        expect(rows[0].AgentID).toBeUndefined();
    });

    it("attributes the agent's speech to the configured (target) agent, else the line's agent", async () => {
        const { provider, rows } = makeProvider();
        await CreateBridgeSessionTranscriptSink(options)(line('Hi there', true), user, provider);
        await CreateBridgeSessionTranscriptSink({ ConversationID: 'c', AgentSessionID: 's' })(line('Again', true), user, provider);
        expect(rows[0]).toMatchObject({ Role: 'AI', AgentID: 'target-agent' });
        expect(rows[1]).toMatchObject({ Role: 'AI', AgentID: 'co-agent' });
    });

    it('keeps turns in order even when the sink is called back to back', async () => {
        const { provider, rows } = makeProvider();
        const sink = CreateBridgeSessionTranscriptSink(options);
        await Promise.all([sink(line('one', false), user, provider), sink(line('two', true), user, provider), sink(line('three', false), user, provider)]);
        expect(rows.map((r) => r.Message)).toEqual(['one', 'two', 'three']);
    });

    it('logs a failed save and keeps writing the turns behind it', async () => {
        const { provider, rows } = makeProvider([false, true]);
        const sink = CreateBridgeSessionTranscriptSink(options);
        await sink(line('lost', false), user, provider);
        await sink(line('kept', false), user, provider);
        expect(rows).toHaveLength(2);
    });

    it('swallows a provider failure instead of rejecting', async () => {
        const provider = { GetEntityObject: async () => { throw new Error('db down'); } } as unknown as IMetadataProvider;
        await expect(CreateBridgeSessionTranscriptSink(options)(line('x', false), user, provider)).resolves.toBeUndefined();
    });

    it('does nothing without a user or provider', async () => {
        const { provider, rows } = makeProvider();
        const sink = CreateBridgeSessionTranscriptSink(options);
        await sink(line('x', false), undefined, provider);
        await sink(line('x', false), user, undefined);
        expect(rows).toHaveLength(0);
    });
});
