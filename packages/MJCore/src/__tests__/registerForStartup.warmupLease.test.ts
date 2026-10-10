/**
 * Servers that share a cache take turns warming their startup engines (plan: cold-start herd).
 *
 * Servers starting at the same moment used to miss the empty shared cache together, each query
 * the database for every engine, and each publish the results to the others (at R=3: 327 database
 * calls and 132 MB of messages, against 127 calls when the same servers started 300 ms apart).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { StartupManager, STARTUP_WARMUP_LEASE, IStartupSink, RegisterForStartupOptions } from '../generic/RegisterForStartup';
import { LocalCacheManager } from '../generic/localCacheManager';
import { IMetadataProvider } from '../index';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

/** A store whose lease another server may hold. */
class LeasingStore extends MockCacheStorageProvider {
    public HeldByPeer = false;
    public Fail = false;
    public HeldByUs = false;
    public Events: string[] = [];

    public async TryAcquireLease(name: string, _ttlMs: number): Promise<boolean> {
        if (this.Fail) {
            throw new Error('redis down');
        }
        if (this.HeldByPeer || this.HeldByUs) {
            return false;
        }
        this.HeldByUs = true;
        this.Events.push(`claim:${name}`);
        return true;
    }

    public async ReleaseLease(name: string): Promise<void> {
        this.HeldByUs = false;
        this.Events.push(`release:${name}`);
    }
}

function reset(className: string): void {
    delete GetGlobalObjectStore()[`___SINGLETON__${className}`];
}

function registerEngine(store: LeasingStore, name: string, options: RegisterForStartupOptions = {}, fail = false): void {
    const instance: IStartupSink = {
        HandleStartup: vi.fn(async () => {
            store.Events.push(`load:${name}:${store.HeldByUs ? 'holding' : 'not-holding'}`);
            if (fail) {
                throw new Error(`${name} failed`);
            }
        }),
    };
    StartupManager.Instance.Register({
        constructor: { name } as unknown as new (...args: unknown[]) => IStartupSink,
        getInstance: () => instance,
        options,
    });
}

describe('StartupManager warm-up turn on a shared cache', () => {
    let store: LeasingStore;
    let provider: IMetadataProvider;

    beforeEach(() => {
        reset('StartupManager');
        reset('LocalCacheManager');
        store = new LeasingStore();
        provider = { LocalStorageProvider: store } as unknown as IMetadataProvider;
    });

    it('loads the engines while holding the turn, then releases it', async () => {
        registerEngine(store, 'EngineA');
        registerEngine(store, 'EngineB', { priority: 2 });
        const result = await StartupManager.Instance.Startup(false, undefined, provider);
        expect(result.success).toBe(true);
        expect(store.Events[0]).toBe(`claim:${STARTUP_WARMUP_LEASE}`);
        expect([...store.Events.slice(1, 3)].sort()).toEqual(['load:EngineA:holding', 'load:EngineB:holding']);
        expect(store.Events[3]).toBe(`release:${STARTUP_WARMUP_LEASE}`);
    });

    it('waits while another server warms the cache, then loads', async () => {
        registerEngine(store, 'EngineA');
        store.HeldByPeer = true;
        setTimeout(() => { store.HeldByPeer = false; }, 250);
        const started = Date.now();
        await StartupManager.Instance.Startup(false, undefined, provider, { warmupLeaseMs: 5000 });
        expect(Date.now() - started).toBeGreaterThanOrEqual(200);
        expect(store.Events[0]).toBe(`claim:${STARTUP_WARMUP_LEASE}`);
        expect(store.Events).toContain('load:EngineA:holding');
    });

    it('stops waiting after warmupLeaseMs and loads anyway', async () => {
        registerEngine(store, 'EngineA');
        store.HeldByPeer = true;
        const started = Date.now();
        await StartupManager.Instance.Startup(false, undefined, provider, { warmupLeaseMs: 300 });
        expect(Date.now() - started).toBeLessThan(2000);
        expect(store.Events).toEqual(['load:EngineA:not-holding']);
    });

    it('does not wait when the store cannot be asked, or when coordination is off', async () => {
        registerEngine(store, 'EngineA');
        store.Fail = true;
        const started = Date.now();
        await StartupManager.Instance.Startup(false, undefined, provider, { warmupLeaseMs: 5000 });
        expect(Date.now() - started).toBeLessThan(1000);
        expect(store.Events).toEqual(['load:EngineA:not-holding']);

        store.Fail = false;
        store.Events.length = 0;
        await StartupManager.Instance.Startup(true, undefined, provider, { warmupLeaseMs: 0 });
        expect(store.Events).toEqual(['load:EngineA:not-holding']);
    });

    it('releases the turn when an engine fails fatally', async () => {
        registerEngine(store, 'Broken', { severity: 'fatal' }, true);
        const result = await StartupManager.Instance.Startup(false, undefined, provider);
        expect(result.success).toBe(false);
        expect(store.Events.at(-1)).toBe(`release:${STARTUP_WARMUP_LEASE}`);
        expect(store.HeldByUs).toBe(false);
    });

    it('takes no turn in task mode', async () => {
        registerEngine(store, 'EngineA');
        await StartupManager.Instance.Startup(false, undefined, provider, { mode: 'task' });
        expect(store.Events).toEqual([]);
    });
});

describe('LocalCacheManager.WaitForSharedLease', () => {
    beforeEach(() => reset('LocalCacheManager'));

    it('is granted at once on a store that does not coordinate', async () => {
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider());
        expect(await LocalCacheManager.Instance.WaitForSharedLease('x', 1000, 1000)).toEqual({ Acquired: true, WaitedMs: expect.any(Number) });
        await LocalCacheManager.Instance.ReleaseSharedLease('x'); // no-op, must not throw
    });
});
