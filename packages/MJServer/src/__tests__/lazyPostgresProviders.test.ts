/**
 * Verifies lazy per-request PostgreSQL provider construction in `context.ts`
 * (`TryBuildLazyPostgresProviders`), including deferred instantiation and separate
 * `Read-Only` vs `Adhoc-Read-Only` provider routing, and the server settings the Read-Write
 * provider carries.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    BaseEntity,
    LocalCacheManager,
    Metadata,
    SetProvider,
    type DatabaseProviderBase,
} from '@memberjunction/core';

vi.mock('../config.js', () => ({
    configInfo: {
        baseUrl: 'http://localhost',
        graphqlPort: 4001,
        graphqlRootPath: '/',
        databaseSettings: {
            connectionTimeout: 45000,
            requestTimeout: 30000,
            metadataCacheRefreshInterval: 0,
            concurrencyCheck: 'off',
            deltaUpdates: true,
            connectionPool: { max: 50, min: 5, idleTimeoutMillis: 30000, acquireTimeoutMillis: 30000 },
        },
    },
    userEmailMap: {},
    apiKey: 'test-api-key',
    mj_core_schema: '__mj',
}));

import { TryBuildLazyPostgresProviders } from '../context.js';
import { PostgreSQLReadOnlyPool } from '../postgresqlPoolSettings.js';
import { GetReadOnlyProvider, GetReadWriteProvider } from '../util.js';
import { configInfo } from '../config.js';
import { ResolveOriginSessionId } from '../requestSessionContext.js';

describe('TryBuildLazyPostgresProviders', () => {
    let previousGlobalProvider: DatabaseProviderBase;

    beforeEach(async () => {
        previousGlobalProvider = Metadata.Provider as unknown as DatabaseProviderBase;
        await LocalCacheManager.Instance.Initialize();
    });

    afterEach(() => {
        SetProvider(previousGlobalProvider);
    });

    it('returns null when global metadata or pool is not ready', () => {
        SetProvider({ AllMetadata: { AllEntities: [] } } as unknown as DatabaseProviderBase);
        const materialized: DatabaseProviderBase[] = [];
        expect(TryBuildLazyPostgresProviders('sess-1', materialized)).toBeNull();
        expect(materialized).toHaveLength(0);
    });

    it('defers provider instantiation until accessed and separates Read-Only vs Adhoc-Read-Only', () => {
        const fakeRwPool = { kind: 'rw' } as unknown as import('pg').Pool;
        const fakeRoPool = { kind: 'ro' } as unknown as import('pg').Pool;
        const fakeAdhocPool = { kind: 'adhoc' } as unknown as import('pg').Pool;

        const prevPool = PostgreSQLReadOnlyPool.Instance.Pool;
        const prevAdhoc = PostgreSQLReadOnlyPool.Instance.AdhocPool;
        const prevRoUser = process.env.PG_READ_ONLY_USERNAME;
        const prevRoPass = process.env.PG_READ_ONLY_PASSWORD;

        try {
            SetProvider({
                DatabaseConnection: fakeRwPool,
                AllMetadata: { AllEntities: [{ ID: 'e1', Name: 'Users' }] },
                Entities: [{ ID: 'e1', Name: 'Users' }],
            } as unknown as DatabaseProviderBase);

            PostgreSQLReadOnlyPool.Instance.Pool = fakeRoPool;
            PostgreSQLReadOnlyPool.Instance.AdhocPool = fakeAdhocPool;
            process.env.PG_READ_ONLY_USERNAME = 'ro_user';
            process.env.PG_READ_ONLY_PASSWORD = 'ro_password';

            const materialized: DatabaseProviderBase[] = [];
            const providers = TryBuildLazyPostgresProviders('sess-pg-lazy', materialized);

            expect(providers).not.toBeNull();
            expect(providers!.map((p) => p.type)).toEqual(['Read-Write', 'Read-Only', 'Adhoc-Read-Only']);
            // Zero providers materialized before a resolver accesses one
            expect(materialized).toHaveLength(0);

            // Accessing application Read-Only materializes ONLY the Read-Only provider
            const roProvider = GetReadOnlyProvider(providers!, { allowFallbackToReadWrite: true });
            expect(roProvider).toBeDefined();
            expect(materialized).toHaveLength(1);
            expect(ResolveOriginSessionId({ ProviderToUse: roProvider } as unknown as BaseEntity)).toBe('sess-pg-lazy');

            // Accessing Adhoc-Read-Only materializes ONLY the Adhoc-Read-Only provider (Read-Write still unmaterialized)
            const adhocProvider = GetReadOnlyProvider(providers!, { allowFallbackToReadWrite: false, purpose: 'adhoc' });
            expect(adhocProvider).toBeDefined();
            expect(adhocProvider).not.toBe(roProvider);
            expect(materialized).toHaveLength(2);

            for (const p of materialized) {
                p.DetachInvalidationListeners();
            }
        } finally {
            PostgreSQLReadOnlyPool.Instance.Pool = prevPool;
            PostgreSQLReadOnlyPool.Instance.AdhocPool = prevAdhoc;
            if (prevRoUser === undefined) delete process.env.PG_READ_ONLY_USERNAME;
            else process.env.PG_READ_ONLY_USERNAME = prevRoUser;
            if (prevRoPass === undefined) delete process.env.PG_READ_ONLY_PASSWORD;
            else process.env.PG_READ_ONLY_PASSWORD = prevRoPass;
        }
    });

    it('the Read-Write provider carries the server loadQueryMetadata setting', () => {
        const settings = configInfo.databaseSettings as { loadQueryMetadata?: boolean };
        const previous = settings.loadQueryMetadata;
        try {
            settings.loadQueryMetadata = true;
            SetProvider({
                DatabaseConnection: { kind: 'rw' } as unknown as import('pg').Pool,
                AllMetadata: { AllEntities: [{ ID: 'e1', Name: 'Users' }] },
                Entities: [{ ID: 'e1', Name: 'Users' }],
            } as unknown as DatabaseProviderBase);

            const materialized: DatabaseProviderBase[] = [];
            const providers = TryBuildLazyPostgresProviders('sess-pg-qm', materialized);
            expect(providers).not.toBeNull();

            const rwProvider = GetReadWriteProvider(providers!);
            expect(rwProvider.LoadsQueryMetadata).toBe(true);

            for (const p of materialized) {
                p.DetachInvalidationListeners();
            }
        } finally {
            settings.loadQueryMetadata = previous;
        }
    });
});
