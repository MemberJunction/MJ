import { describe, it, expect, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine } from '../generic/baseEngine';
import { IMetadataProvider } from '../generic/interfaces';

/**
 * BaseEngine caches per-connection engine instances keyed by
 * IMetadataProvider.InstanceConnectionString. These tests pin that contract:
 * - Same connection-string → same engine instance returned (cache hit)
 * - Different connection-strings → separate engine instances
 * - SetProvider is first-wins so a later (transient) provider does not
 *   displace the persistent provider that initially bound to the connection
 *
 * Note: BaseEngine extends BaseSingleton, whose constructor returns the
 * existing instance from the global object store if one was created. Each
 * test resets that store for the test classes so `new TestEngineX()` produces
 * a genuinely fresh instance.
 */

class TestEngineA extends BaseEngine<TestEngineA> {}
class TestEngineB extends BaseEngine<TestEngineB> {}

const PROD_KEY = 'mssql://prod:1433/MJ';
const STAGING_KEY = 'mssql://staging:1433/MJ';
const SINGLETON_KEYS = ['___SINGLETON__TestEngineA', '___SINGLETON__TestEngineB'];

function makeMockProvider(connectionString: string): IMetadataProvider {
    return { InstanceConnectionString: connectionString } as unknown as IMetadataProvider;
}

function getCachedInstance(connectionKey: string, ctor: Function): unknown {
    const map = (BaseEngine as unknown as {
        _providerInstances: Map<string, Map<Function, unknown>>;
    })._providerInstances;
    return map.get(connectionKey)?.get(ctor);
}

function resetSingletonState(): void {
    const g = GetGlobalObjectStore() as Record<string, unknown> | undefined;
    if (g) {
        for (const k of SINGLETON_KEYS) delete g[k];
    }
}

describe('BaseEngine connection-fingerprint cache', () => {
    beforeEach(() => {
        BaseEngine.RemoveConnectionInstances(PROD_KEY);
        BaseEngine.RemoveConnectionInstances(STAGING_KEY);
        resetSingletonState();
    });

    it('returns the same engine instance for two providers with the same connection string', () => {
        const p1 = makeMockProvider('mssql://prod:1433/MJ');
        const p2 = makeMockProvider('mssql://prod:1433/MJ');

        const a = BaseEngine.GetProviderInstance(p1, TestEngineA);
        const b = BaseEngine.GetProviderInstance(p2, TestEngineA);

        expect(a).toBe(b);
    });

    it('stores a separate cache entry per InstanceConnectionString', () => {
        // Note: BaseSingleton enforces one instance per class globally, so the
        // entries for different connections will reference the same singleton.
        // What this test pins is the cache KEYING — that different connection
        // strings produce distinct cache slots, even though the singleton
        // pattern flattens the underlying instances.
        const prod = makeMockProvider(PROD_KEY);
        const staging = makeMockProvider(STAGING_KEY);

        BaseEngine.GetProviderInstance(prod, TestEngineA);
        BaseEngine.GetProviderInstance(staging, TestEngineA);

        expect(getCachedInstance(PROD_KEY, TestEngineA)).toBeDefined();
        expect(getCachedInstance(STAGING_KEY, TestEngineA)).toBeDefined();
    });

    it('caches separate instances per engine subclass on the same connection', () => {
        const p = makeMockProvider('mssql://prod:1433/MJ');

        const a = BaseEngine.GetProviderInstance(p, TestEngineA);
        const b = BaseEngine.GetProviderInstance(p, TestEngineB);

        expect(a).not.toBe(b);
        expect(a).toBeInstanceOf(TestEngineA);
        expect(b).toBeInstanceOf(TestEngineB);
    });

    it('does not displace _provider when a second provider with the same connection binds', () => {
        const persistent = makeMockProvider('mssql://prod:1433/MJ');
        const transient = makeMockProvider('mssql://prod:1433/MJ');

        const engine = BaseEngine.GetProviderInstance(persistent, TestEngineA);
        const persistentRef = (engine as unknown as { _provider: IMetadataProvider })._provider;
        expect(persistentRef).toBe(persistent);

        // Second lookup with a different provider object pointing at the same connection
        BaseEngine.GetProviderInstance(transient, TestEngineA);

        const refAfter = (engine as unknown as { _provider: IMetadataProvider })._provider;
        expect(refAfter).toBe(persistent); // first-wins, transient does not replace
    });

    it('RemoveConnectionInstances clears the cache for that connection only', () => {
        const prod = makeMockProvider('mssql://prod:1433/MJ');
        const staging = makeMockProvider('mssql://staging:1433/MJ');

        BaseEngine.GetProviderInstance(prod, TestEngineA);
        BaseEngine.GetProviderInstance(staging, TestEngineA);

        BaseEngine.RemoveConnectionInstances('mssql://prod:1433/MJ');

        expect(getCachedInstance('mssql://prod:1433/MJ', TestEngineA)).toBeUndefined();
        expect(getCachedInstance('mssql://staging:1433/MJ', TestEngineA)).toBeDefined();
    });
});
