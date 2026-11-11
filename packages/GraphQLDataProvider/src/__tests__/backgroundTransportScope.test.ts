import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-ws', async () => {
    const wire = await import('./support/graphQLWs');
    return { createClient: wire.FakeCreateClient };
});

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { GraphQLWsWire } from './support/graphQLWs';
import { ResetGraphQLProviderSingleton } from './support/wireTestHarness';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '../graphQLDataProvider';

class CustomBackgroundScopeProvider extends GraphQLDataProvider {
    public BackgroundScopeCallCount = 0;

    protected override ExecuteInBackgroundScope<T>(fn: () => T): T {
        this.BackgroundScopeCallCount++;
        return fn();
    }
}

describe('GraphQLDataProvider ExecuteInBackgroundScope hook and subclass singleton semantics', () => {
    beforeEach(() => {
        GraphQLWsWire.Reset();
        ResetGraphQLProviderSingleton();
    });

    afterEach(() => {
        ResetGraphQLProviderSingleton();
    });

    it('executes WebSocket setup and subscription directly by default with zero UI framework coupling', async () => {
        const provider = new GraphQLDataProvider();
        await provider.Connect(new GraphQLProviderConfigData('test-jwt', 'http://localhost:4000/', 'ws://localhost:4000/'));

        const sub = provider.Subscribe('subscription { testUpdates { id } }').subscribe({
            next: () => {},
        });
        expect(GraphQLWsWire.Clients.length).toBe(1);

        sub.unsubscribe();
        provider.DisposeWebSocketResources();
    });

    it('invokes subclass ExecuteInBackgroundScope hook during WebSocket creation, subscription, unsubscribe, and teardown', async () => {
        const provider = new CustomBackgroundScopeProvider();
        await provider.Connect(new GraphQLProviderConfigData('test-jwt', 'http://localhost:4000/', 'ws://localhost:4000/'));

        expect(GraphQLDataProvider.Instance).toBe(provider);
        expect(provider.BackgroundScopeCallCount).toBe(0);

        const sub = provider.Subscribe('subscription { testUpdates { id } }').subscribe({
            next: () => {},
        });

        // getOrCreateWSClient + cleanup interval + client.subscribe
        const afterSubscribeCount = provider.BackgroundScopeCallCount;
        expect(afterSubscribeCount).toBeGreaterThanOrEqual(2);

        sub.unsubscribe();
        expect(provider.BackgroundScopeCallCount).toBeGreaterThan(afterSubscribeCount);

        const beforeDisposeCount = provider.BackgroundScopeCallCount;
        provider.DisposeWebSocketResources();
        expect(provider.BackgroundScopeCallCount).toBeGreaterThan(beforeDisposeCount);
    });

    it('allows a UI-layer subclass constructed before Config() to upgrade an unconfigured base GraphQLDataProvider singleton', () => {
        const unconfiguredBase = new GraphQLDataProvider();
        expect(GraphQLDataProvider.Instance).toBe(unconfiguredBase);

        const subclass = new CustomBackgroundScopeProvider();
        expect(GraphQLDataProvider.Instance).toBe(subclass);
        expect(new GraphQLDataProvider()).toBe(subclass);
        expect(new CustomBackgroundScopeProvider()).toBe(subclass);
    });
});
