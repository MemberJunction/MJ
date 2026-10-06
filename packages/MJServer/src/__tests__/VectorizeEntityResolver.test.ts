import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseProviderBase, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import sql from 'mssql';
import { VectorizeEntityResolver } from '../resolvers/VectorizeEntityResolver.js';
import type { AppContext, ProviderInfo } from '../types.js';

const mockSyncerConstructedWith: (IMetadataProvider | undefined)[] = [];

vi.mock('@memberjunction/ai-vector-sync', () => {
    return {
        EntityVectorSyncer: class {
            constructor(provider?: IMetadataProvider) {
                mockSyncerConstructedWith.push(provider);
            }
            Config() {
                return Promise.resolve(undefined);
            }
            VectorizeEntity() {
                return Promise.resolve({ success: true, status: 'Completed' });
            }
        },
    };
});

vi.mock('../generic/PubSubManager.js', () => ({
    PubSubManager: {
        Instance: {
            Publish: vi.fn(),
        },
    },
}));

function createAppContext(providers?: ProviderInfo[]): AppContext {
    return {
        dataSource: Object.create(sql.ConnectionPool.prototype) as sql.ConnectionPool,
        dataSources: [],
        providers: providers ?? [],
        userPayload: {
            email: 'test@example.com',
            sessionId: 'test-session',
            userRecord: new UserInfo(),
        },
    };
}

describe('VectorizeEntityResolver — provider propagation', () => {
    beforeEach(() => {
        mockSyncerConstructedWith.length = 0;
    });

    it('passes request-scoped Read-Write provider from AppContext to EntityVectorSyncer', async () => {
        const mockProvider = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
        const providerInfo: ProviderInfo = {
            provider: mockProvider,
            type: 'Read-Write',
        };

        const resolver = new VectorizeEntityResolver();
        const result = await resolver.VectorizeEntity(
            'doc-1',
            'entity-1',
            10,
            createAppContext([providerInfo])
        );

        expect(result.Success).toBe(true);
        expect(result.Status).toBe('Started');
        expect(mockSyncerConstructedWith.length).toBe(1);
        expect(mockSyncerConstructedWith[0]).toBe(mockProvider);
    });

    it('falls back to Read-Only provider when no Read-Write provider exists', async () => {
        const readOnlyProvider = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
        const providerInfo: ProviderInfo = {
            provider: readOnlyProvider,
            type: 'Read-Only',
        };

        const resolver = new VectorizeEntityResolver();
        const result = await resolver.VectorizeEntity(
            'doc-2',
            'entity-2',
            10,
            createAppContext([providerInfo])
        );

        expect(result.Success).toBe(true);
        expect(mockSyncerConstructedWith.length).toBe(1);
        expect(mockSyncerConstructedWith[0]).toBe(readOnlyProvider);
    });

    it('passes undefined provider to EntityVectorSyncer when no providers in AppContext', async () => {
        const resolver = new VectorizeEntityResolver();
        const result = await resolver.VectorizeEntity(
            'doc-3',
            'entity-3',
            10,
            createAppContext([])
        );

        expect(result.Success).toBe(true);
        expect(mockSyncerConstructedWith.length).toBe(1);
        expect(mockSyncerConstructedWith[0]).toBeUndefined();
    });
});
