/**
 * Tests for the client half of the durable tail (MJ #4222).
 *
 * This client is the recovery path, so its failure behaviour matters more than its happy path.
 * Two properties are load-bearing and neither is visible from the call site:
 *
 * 1. **A failed read holds the caller's cursor.** Resetting to 0 would replay the whole run on the
 *    next successful call — hundreds of events for a long agent run.
 * 2. **A failed read reports the run as still in flight.** The caller uses `IsInFlight === false`
 *    to decide a message is finished; answering "finished" from a read that never happened would
 *    stop a live message with no answer on it.
 */
import { describe, it, expect, vi } from 'vitest';
import { GraphQLConversationClient } from '../graphQLConversationClient';
import type { GraphQLDataProvider } from '../graphQLDataProvider';

const DETAIL_ID = 'A1111111-1111-1111-1111-111111111111';

function clientWith(execute: (query: string, variables: Record<string, unknown>) => Promise<unknown>) {
    const provider = { ExecuteGQL: vi.fn(execute) } as unknown as GraphQLDataProvider;
    return { client: new GraphQLConversationClient(provider), provider };
}

describe('GraphQLConversationClient.TailConversationEvents', () => {
    it('returns the server payload and normalizes a missing event list', async () => {
        const { client } = clientWith(async () => ({
            TailConversationEvents: {
                Success: true,
                Message: 'ok',
                Events: null,
                LatestSeq: 7,
                IsInFlight: true,
                RunID: 'RUN-1',
            },
        }));

        const result = await client.TailConversationEvents(DETAIL_ID, 3);

        expect(result.Success).toBe(true);
        expect(result.Events).toEqual([]);
        expect(result.LatestSeq).toBe(7);
        expect(result.RunID).toBe('RUN-1');
    });

    it('passes the cursor through to the server', async () => {
        const { client, provider } = clientWith(async () => ({
            TailConversationEvents: { Success: true, Message: '', Events: [], LatestSeq: 12, IsInFlight: false },
        }));

        await client.TailConversationEvents(DETAIL_ID, 12);

        const variables = vi.mocked(provider.ExecuteGQL).mock.calls[0][1] as Record<string, unknown>;
        expect(variables).toEqual({ conversationDetailID: DETAIL_ID, sinceSeq: 12 });
    });

    it('floors and clamps a nonsense cursor rather than sending it', async () => {
        const { client, provider } = clientWith(async () => ({
            TailConversationEvents: { Success: true, Message: '', Events: [], LatestSeq: 0, IsInFlight: false },
        }));

        await client.TailConversationEvents(DETAIL_ID, -4.7);

        const variables = vi.mocked(provider.ExecuteGQL).mock.calls[0][1] as Record<string, unknown>;
        expect(variables.sinceSeq).toBe(0);
    });

    it('holds the caller cursor when the transport throws', async () => {
        const { client } = clientWith(async () => {
            throw new Error('socket is dead');
        });

        const result = await client.TailConversationEvents(DETAIL_ID, 41);

        expect(result.Success).toBe(false);
        expect(result.LatestSeq).toBe(41);
        expect(result.Events).toEqual([]);
        expect(result.Message).toContain('socket is dead');
    });

    it('reports a failed read as still in flight, never as finished', async () => {
        const { client } = clientWith(async () => {
            throw new Error('network down');
        });

        const result = await client.TailConversationEvents(DETAIL_ID, 2);

        expect(result.IsInFlight).toBe(true);
    });

    it('treats a response with no tail field as a failure, not as an empty run', async () => {
        const { client } = clientWith(async () => ({ SomethingElse: {} }));

        const result = await client.TailConversationEvents(DETAIL_ID, 5);

        expect(result.Success).toBe(false);
        expect(result.IsInFlight).toBe(true);
        expect(result.LatestSeq).toBe(5);
    });

    it('falls back to the caller cursor when the server omits LatestSeq', async () => {
        const { client } = clientWith(async () => ({
            TailConversationEvents: { Success: true, Message: '', Events: [], IsInFlight: true },
        }));

        const result = await client.TailConversationEvents(DETAIL_ID, 9);

        expect(result.LatestSeq).toBe(9);
    });

    it('never throws out of the recovery path', async () => {
        const { client } = clientWith(async () => {
            throw 'a bare string, not an Error';
        });

        await expect(client.TailConversationEvents(DETAIL_ID)).resolves.toMatchObject({ Success: false });
    });
});
