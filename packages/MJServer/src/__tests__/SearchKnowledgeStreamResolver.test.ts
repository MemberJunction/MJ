import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for SearchKnowledgeStreamResolver's wire mapping: a `provider` event is progress only.
 *
 * A provider's hits arrive before the engine's permission pass — rows the caller's row filters would drop,
 * external-index hits not yet verified against the entity they name, content whose origin the caller may not
 * read. The engine no longer puts them on its `provider` events, and the resolver does not forward them either,
 * whatever the event holds: the client gets ProviderName, DurationMs and ResultCount, and results only in
 * `fused`/`final`.
 */

const { streamEvents } = vi.hoisted(() => ({ streamEvents: { current: [] as unknown[] } }));

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            streamSearch: async function* () {
                for (const ev of streamEvents.current) yield ev;
            },
            LogForbiddenSearch: vi.fn(),
        },
    },
    GetSearchScopePermissionResolver: () => ({ ResolveEffectivePermission: vi.fn() }),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

// Mock type-graphql to avoid the reflect-metadata dependency (the SearchKnowledgeResolver tests do the same).
vi.mock('type-graphql', () => {
    const noop = () => () => undefined;
    const passthrough = () => (target: unknown) => target;
    return {
        Resolver: passthrough, Mutation: noop, Query: noop, Subscription: noop, Arg: noop, Args: noop, Ctx: noop,
        ObjectType: passthrough, InputType: passthrough, ArgsType: passthrough, Field: noop,
        Float: Number, Int: Number, ID: String, Authorized: noop, PubSub: noop, Root: noop,
    };
});

import type { PubSubEngine } from 'type-graphql';
import type { UserInfo } from '@memberjunction/core';
import { SearchKnowledgeStreamResolver, SearchStreamNotification } from '../resolvers/SearchKnowledgeStreamResolver.js';
import type { UserPayload } from '../types.js';

class TestStreamResolver extends SearchKnowledgeStreamResolver {
    protected override GetUserFromPayload(_userPayload: UserPayload): UserInfo | undefined {
        return { ID: 'test-user-id', Email: 'test@test.com', Name: 'Test User' } as UserInfo;
    }
}

const hit = (recordID: string) => ({
    ID: `r-${recordID}`, EntityName: 'Customers', RecordID: recordID, SourceType: 'fulltext', ResultType: 'entity-record',
    Title: `title of ${recordID}`, Snippet: `snippet of ${recordID}`, Score: 0.5, ScoreBreakdown: {}, Tags: [],
    MatchedAt: new Date(), RawMetadata: `{"secret":"${recordID}"}`, ProviderId: 'prov-azure',
});

/** Run a stream to completion and return what the resolver published, in order. */
async function publishedFor(events: unknown[]): Promise<SearchStreamNotification[]> {
    streamEvents.current = events;
    const published: SearchStreamNotification[] = [];
    const pubSub = { publish: vi.fn(async (_topic: string, payload: SearchStreamNotification) => { published.push(payload); }) };
    const start = await new TestStreamResolver().StreamScopedSearch(
        'budget', 20, undefined, undefined, undefined, undefined,
        pubSub as unknown as PubSubEngine, { userPayload: {} } as never,
    );
    expect(start.Success).toBe(true);
    await vi.waitFor(() => expect(published.some(p => p.Phase === 'final' || p.Phase === 'error')).toBe(true),
        { timeout: 500, interval: 5 });
    return published;
}

describe('SearchKnowledgeStreamResolver — provider events are progress only', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('publishes the count and no result, even when a provider event carries hits', async () => {
        // An engine that (wrongly) put hits on a provider event: the resolver still must not forward them.
        const published = await publishedFor([
            { phase: 'provider', providerName: 'FullText', results: [hit('row-filtered')], resultCount: 1, durationMs: 7 },
            { phase: 'fused', results: [] },
            { phase: 'final', results: [], sourceCounts: { Vector: 0, FullText: 1, Entity: 0, Storage: 0 }, elapsedMs: 9 },
        ]);

        const progress = published.find(p => p.Phase === 'provider');
        expect(progress).toMatchObject({ Phase: 'provider', ProviderName: 'FullText', DurationMs: 7, ResultCount: 1, Results: [] });
        expect(JSON.stringify(progress)).not.toContain('row-filtered');
    });

    it('carries results on final, mapped as the synchronous resolver maps them', async () => {
        const published = await publishedFor([
            { phase: 'provider', providerName: 'FullText', results: [], resultCount: 1, durationMs: 7 },
            { phase: 'fused', results: [hit('readable')] },
            { phase: 'final', results: [hit('readable')], sourceCounts: { Vector: 0, FullText: 1, Entity: 0, Storage: 0 }, elapsedMs: 9 },
        ]);

        const final = published.find(p => p.Phase === 'final');
        expect(final?.Results?.map(r => r.RecordID)).toEqual(['readable']);
        expect(final?.ResultCount).toBeUndefined();
    });
});
