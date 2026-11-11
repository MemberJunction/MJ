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
import { CreateWireTestProvider, ResetGraphQLProviderSingleton } from './support/wireTestHarness';
import { GraphQLDataProvider, RunOutsideAngularZone } from '../graphQLDataProvider';

interface ZoneLikeMock {
    run: <T>(fn: () => T) => T;
}

interface GlobalWithZoneMock {
    Zone?: {
        root?: ZoneLikeMock;
    };
}

describe('RunOutsideAngularZone and WebSocket transport zone isolation', () => {
    const globalObj = globalThis as GlobalWithZoneMock;
    const originalZone = globalObj.Zone;

    beforeEach(() => {
        GraphQLWsWire.Reset();
        delete globalObj.Zone;
    });

    afterEach(() => {
        if (originalZone !== undefined) {
            globalObj.Zone = originalZone;
        } else {
            delete globalObj.Zone;
        }
        ResetGraphQLProviderSingleton();
    });

    it('executes directly when Zone.root is not present on globalThis', () => {
        let executed = false;
        const result = RunOutsideAngularZone(() => {
            executed = true;
            return 'direct-result';
        });

        expect(executed).toBe(true);
        expect(result).toBe('direct-result');
    });

    it('delegates execution to Zone.root.run when Zone.root is present on globalThis', () => {
        let runCount = 0;
        const mockRun = vi.fn(<T>(fn: () => T): T => {
            runCount++;
            return fn();
        });

        globalObj.Zone = {
            root: {
                run: mockRun,
            },
        };

        const result = RunOutsideAngularZone(() => 12345);

        expect(result).toBe(12345);
        expect(runCount).toBe(1);
        expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it('GraphQLDataProvider.RunOutsideAngularZone static method delegates to RunOutsideAngularZone', () => {
        const mockRun = vi.fn(<T>(fn: () => T): T => fn());
        globalObj.Zone = {
            root: {
                run: mockRun,
            },
        };

        const result = GraphQLDataProvider.RunOutsideAngularZone(() => 'static-test');

        expect(result).toBe('static-test');
        expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it('invokes Zone.root.run during WebSocket client creation and subscription', () => {
        const runCalls: string[] = [];
        const mockRun = vi.fn(<T>(fn: () => T): T => {
            runCalls.push('zone-root-run');
            return fn();
        });

        globalObj.Zone = {
            root: {
                run: mockRun,
            },
        };

        const provider = CreateWireTestProvider();
        const subscription = provider.Subscribe('subscription { testUpdates { id } }').subscribe({
            next: () => {},
        });

        // Zone.root.run should have been invoked when getOrCreateWSClient created the WebSocket
        // and when client.subscribe was called
        expect(mockRun).toHaveBeenCalled();
        expect(runCalls.length).toBeGreaterThan(0);

        subscription.unsubscribe();
    });

    it('invokes Zone.root.run during DisposeWebSocketResources', () => {
        const mockRun = vi.fn(<T>(fn: () => T): T => fn());
        globalObj.Zone = {
            root: {
                run: mockRun,
            },
        };

        const provider = CreateWireTestProvider();
        provider.DisposeWebSocketResources();

        expect(mockRun).toHaveBeenCalled();
    });
});
