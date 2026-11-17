import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NgZone } from '@angular/core';
import { GetGlobalObjectStore, MJGlobal } from '@memberjunction/global';
import {
    GraphQLDataProvider,
    GraphQLProviderConfigData,
} from '@memberjunction/graphql-dataprovider';

const { mockSetupGraphQLClient, mockConnectGraphQLClient } = vi.hoisted(() => ({
    mockSetupGraphQLClient: vi.fn(
        async (_config: GraphQLProviderConfigData, providerInstance?: GraphQLDataProvider): Promise<GraphQLDataProvider> => {
            return providerInstance ?? ({} as GraphQLDataProvider);
        }
    ),
    mockConnectGraphQLClient: vi.fn(
        async (_config: GraphQLProviderConfigData, providerInstance?: GraphQLDataProvider): Promise<GraphQLDataProvider> => {
            return providerInstance ?? ({} as GraphQLDataProvider);
        }
    ),
}));

vi.mock('@angular/core', async () => {
    const actual = await vi.importActual<typeof import('@angular/core')>('@angular/core');
    class MockNgZone {
        public RunOutsideAngularCalls = 0;
        public runOutsideAngular<T>(fn: () => T): T {
            this.RunOutsideAngularCalls++;
            return fn();
        }
    }
    return {
        ...actual,
        NgZone: MockNgZone,
    };
});

vi.mock('@memberjunction/graphql-dataprovider', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/graphql-dataprovider')>(
        '@memberjunction/graphql-dataprovider'
    );
    return {
        ...actual,
        SetupGraphQLClient: mockSetupGraphQLClient,
        ConnectGraphQLClient: mockConnectGraphQLClient,
    };
});

import {
    AngularGraphQLDataProvider,
    ConnectAngularGraphQLClient,
    ResolveAngularGraphQLProvider,
    RootZoneHolder,
    SetupAngularGraphQLClient,
} from '../lib/angular-graphql-data-provider';

class TestableAngularGraphQLDataProvider extends AngularGraphQLDataProvider {
    public TestExecuteInBackgroundScope<T>(fn: () => T): T {
        return this.ExecuteInBackgroundScope(fn);
    }
}

const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';

function resetProviderSingleton(): void {
    const store = GetGlobalObjectStore();
    if (store && store[GRAPHQL_PROVIDER_SINGLETON_KEY]) {
        delete store[GRAPHQL_PROVIDER_SINGLETON_KEY];
    }
}

describe('AngularGraphQLDataProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetProviderSingleton();
    });

    afterEach(() => {
        resetProviderSingleton();
    });

    it('delegates ExecuteInBackgroundScope to ngZone.runOutsideAngular(fn) when provided via constructor', () => {
        const zone = new NgZone({ enableLongStackTrace: false });
        const provider = new TestableAngularGraphQLDataProvider(zone);

        let actionExecuted = false;
        const result = provider.TestExecuteInBackgroundScope(() => {
            actionExecuted = true;
            return 'constructed-zone-result';
        });

        expect(actionExecuted).toBe(true);
        expect(result).toBe('constructed-zone-result');
        const mockZone = zone as NgZone & { RunOutsideAngularCalls: number };
        expect(mockZone.RunOutsideAngularCalls).toBe(1);
        expect(provider.NgZone).toBe(zone);
    });

    it('delegates ExecuteInBackgroundScope to ngZone.runOutsideAngular(fn) when provided via SetNgZone()', () => {
        const provider = new TestableAngularGraphQLDataProvider();
        expect(provider.NgZone).toBeNull();

        const zone = new NgZone({ enableLongStackTrace: false });
        provider.SetNgZone(zone);
        expect(provider.NgZone).toBe(zone);

        let executionCount = 0;
        const result = provider.TestExecuteInBackgroundScope(() => {
            executionCount++;
            return 42;
        });

        expect(executionCount).toBe(1);
        expect(result).toBe(42);
        const mockZone = zone as NgZone & { RunOutsideAngularCalls: number };
        expect(mockZone.RunOutsideAngularCalls).toBe(1);
    });

    it('preserves existing NgZone when SetNgZone() is called with null or undefined', () => {
        const zone = new NgZone({ enableLongStackTrace: false });
        const provider = new TestableAngularGraphQLDataProvider(zone);
        expect(provider.NgZone).toBe(zone);

        provider.SetNgZone(null);
        expect(provider.NgZone).toBe(zone);

        provider.SetNgZone(undefined);
        expect(provider.NgZone).toBe(zone);
    });

    it('falls back to Zone.root.run when NgZone is not set and Zone.root is present on globalThis', () => {
        const provider = new TestableAngularGraphQLDataProvider();
        expect(provider.NgZone).toBeNull();

        let rootRunCalls = 0;
        const globalScope = globalThis as RootZoneHolder;
        const previousZone = globalScope.Zone;

        try {
            globalScope.Zone = {
                root: {
                    run: <R>(cb: () => R): R => {
                        rootRunCalls++;
                        return cb();
                    },
                },
            };

            const result = provider.TestExecuteInBackgroundScope(() => 'fallback-root-zone');
            expect(result).toBe('fallback-root-zone');
            expect(rootRunCalls).toBe(1);
        } finally {
            if (previousZone !== undefined) {
                globalScope.Zone = previousZone;
            } else {
                delete globalScope.Zone;
            }
        }
    });

    it('executes fn directly when neither NgZone nor Zone.root is available', () => {
        const provider = new TestableAngularGraphQLDataProvider();
        const globalScope = globalThis as RootZoneHolder;
        const previousZone = globalScope.Zone;

        try {
            delete globalScope.Zone;
            let directExecuted = false;
            const result = provider.TestExecuteInBackgroundScope(() => {
                directExecuted = true;
                return 'direct-execution';
            });

            expect(directExecuted).toBe(true);
            expect(result).toBe('direct-execution');
        } finally {
            if (previousZone !== undefined) {
                globalScope.Zone = previousZone;
            } else {
                delete globalScope.Zone;
            }
        }
    });

    it('is discoverable via MJGlobal.Instance.ClassFactory.CreateInstance(GraphQLDataProvider)', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<GraphQLDataProvider>(GraphQLDataProvider);
        expect(instance).toBeInstanceOf(AngularGraphQLDataProvider);
    });

    it('ResolveAngularGraphQLProvider upgrades unconfigured base singleton and updates NgZone on subsequent calls', () => {
        // Step 1: Create an unconfigured base GraphQLDataProvider in global store
        const baseProvider = new GraphQLDataProvider();
        expect(GraphQLDataProvider.Instance).toBe(baseProvider);
        expect(GraphQLDataProvider.Instance instanceof AngularGraphQLDataProvider).toBe(false);

        // Step 2: Resolve with zone upgrades store to AngularGraphQLDataProvider
        const zoneA = new NgZone({ enableLongStackTrace: false });
        const resolved = ResolveAngularGraphQLProvider(zoneA);
        expect(resolved).toBeInstanceOf(AngularGraphQLDataProvider);
        expect(GraphQLDataProvider.Instance).toBe(resolved);
        expect(resolved.NgZone).toBe(zoneA);

        // Step 3: Call again on existing AngularGraphQLDataProvider updates NgZone
        const zoneB = new NgZone({ enableLongStackTrace: false });
        const resolvedAgain = ResolveAngularGraphQLProvider(zoneB);
        expect(resolvedAgain).toBe(resolved);
        expect(resolvedAgain.NgZone).toBe(zoneB);
    });

    it('SetupAngularGraphQLClient passes resolved AngularGraphQLDataProvider to SetupGraphQLClient', async () => {
        const zone = new NgZone({ enableLongStackTrace: false });
        const config = new GraphQLProviderConfigData(
            'test-token',
            'http://localhost:4000/graphql',
            'ws://localhost:4000/graphql',
            async () => 'test-token'
        );

        const provider = await SetupAngularGraphQLClient(config, zone);

        expect(provider).toBeInstanceOf(AngularGraphQLDataProvider);
        expect(provider.NgZone).toBe(zone);
        expect(mockSetupGraphQLClient).toHaveBeenCalledTimes(1);
        expect(mockSetupGraphQLClient).toHaveBeenCalledWith(config, provider);
    });

    it('ConnectAngularGraphQLClient passes resolved AngularGraphQLDataProvider to ConnectGraphQLClient', async () => {
        const zone = new NgZone({ enableLongStackTrace: false });
        const config = new GraphQLProviderConfigData(
            'test-token',
            'http://localhost:4000/graphql',
            'ws://localhost:4000/graphql',
            async () => 'test-token'
        );

        const provider = await ConnectAngularGraphQLClient(config, zone);

        expect(provider).toBeInstanceOf(AngularGraphQLDataProvider);
        expect(provider.NgZone).toBe(zone);
        expect(mockConnectGraphQLClient).toHaveBeenCalledTimes(1);
        expect(mockConnectGraphQLClient).toHaveBeenCalledWith(config, provider);
    });
});
