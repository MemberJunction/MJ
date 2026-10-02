/**
 * @fileoverview Durable, resumable read of agent-run progress, with per-message cursors (MJ #4222).
 *
 * WHY THIS EXISTS. Push is the only delivery path a conversation has, and it has no replay. The
 * server topic is an in-memory `graphql-subscriptions` PubSub and the client subject is explicitly
 * unbuffered, so an event published while the socket was half-open is simply gone. Tier 0 makes the
 * dead socket close and Tier 1 gives recovery its own triggers, but both still leave the client
 * re-reading whole rows to guess what it missed. This class closes the loop: the client keeps the
 * highest sequence it has seen per message and re-reads from exactly there.
 *
 * Runs over plain HTTP, deliberately. The recovery case is "the WebSocket is dead and may stay
 * dead", so the repair path must not need the WebSocket.
 *
 * CURSORS ARE HELD HERE, NOT IN THE COMPONENT. An Angular component is destroyed and rebuilt on
 * every conversation switch; a cursor that died with it would replay the whole run on return.
 */
import { GraphQLConversationClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { ConversationTailResult } from '@memberjunction/graphql-dataprovider';

export type { ConversationTailResult };

/**
 * Tracks a read cursor per conversation detail and tails durable run events from it.
 *
 * Usually reached via `ConversationsRuntime.Instance.Tail`.
 */
export class ConversationTail {
    /** conversationDetailId → highest `Seq` already delivered to this client. */
    private cursors = new Map<string, number>();
    private client?: GraphQLConversationClient;

    /**
     * Read everything that has landed for a message since the last call.
     *
     * The cursor advances only on a successful read, so a failed call costs a repeat rather than a
     * gap. Never throws — this is the recovery path, and a recovery path that throws takes down the
     * reconciliation that called it.
     *
     * @param conversationDetailId The message to tail.
     */
    public async Tail(conversationDetailId: string): Promise<ConversationTailResult> {
        const since = this.cursors.get(conversationDetailId) ?? 0;
        const client = this.getClient();
        if (!client) {
            return {
                Success: false,
                Message: 'No data provider available',
                Events: [],
                LatestSeq: since,
                // Unknown is treated as still running — see GraphQLConversationClient.
                IsInFlight: true
            };
        }

        const result = await client.TailConversationEvents(conversationDetailId, since);
        if (result.Success && result.LatestSeq > since) {
            this.cursors.set(conversationDetailId, result.LatestSeq);
        }
        return result;
    }

    /** Highest sequence delivered for a message so far. 0 when nothing has been read. */
    public CursorFor(conversationDetailId: string): number {
        return this.cursors.get(conversationDetailId) ?? 0;
    }

    /**
     * Drop a message's cursor. Call when a message reaches a terminal state, so the map does not
     * grow without bound across a long session.
     */
    public Forget(conversationDetailId: string): void {
        this.cursors.delete(conversationDetailId);
    }

    /** Drop every cursor. */
    public Reset(): void {
        this.cursors.clear();
    }

    /**
     * Resolved on first use rather than in the constructor: the runtime singleton can be touched
     * before the data provider is configured, and a client bound to a provider that did not exist
     * yet would be permanently useless.
     */
    private getClient(): GraphQLConversationClient | undefined {
        if (this.client) {
            return this.client;
        }
        try {
            const provider = GraphQLDataProvider.Instance;
            if (!provider) {
                return undefined;
            }
            this.client = new GraphQLConversationClient(provider);
            return this.client;
        } catch {
            return undefined;
        }
    }
}
