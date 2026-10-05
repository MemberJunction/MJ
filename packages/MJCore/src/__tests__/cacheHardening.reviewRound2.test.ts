/**
 * The last five review items (#18, #19, #21, #22). Each is a behaviour no existing
 * test exercised: they need a second writer, an expired slot, an alternative timestamp column, a
 * slow load, or a steady stream of notices.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { ProviderBase } from '../generic/providerBase';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import type { ILocalStorageProvider, ProviderConfigDataBase as ConfigType } from '../generic/interfaces';
import { ProviderConfigDataBase } from '../generic/interfaces';
import type { CacheChangedEvent } from '../generic/localCacheManager';

function reset(): void {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
}

const ENTITY = 'MJ: AI Models';
const FP_A = `${ENTITY}|||-1|0||`;
const FP_B = `${ENTITY}|IsActive=1|||0||`;

describe('#19 — both cache-write funnels compute the same stamp', () => {
    /** The provider-side helper, reachable through a subclass. */
    class StampProvider extends TestMetadataProvider {
        public Extract(rows: unknown[]): string {
            return (this as unknown as { extractMaxUpdatedAt(r: unknown[]): string }).extractMaxUpdatedAt(rows);
        }
    }

    const cases: Array<{ name: string; rows: unknown[] }> = [
        { name: 'standard __mj_UpdatedAt rows', rows: [{ ID: '1', __mj_UpdatedAt: '2026-09-01T00:00:00.000Z' }, { ID: '2', __mj_UpdatedAt: '2026-09-03T00:00:00.000Z' }] },
        { name: 'legacy UpdatedAt column only', rows: [{ ID: '1', UpdatedAt: '2026-09-04T00:00:00.000Z' }] },
        { name: 'a null stamp among real ones', rows: [{ ID: '1', __mj_UpdatedAt: null }, { ID: '2', __mj_UpdatedAt: '2026-09-02T00:00:00.000Z' }] },
        { name: 'no timestamp column at all', rows: [{ ID: '1' }] },
        { name: 'no rows', rows: [] },
    ];

    for (const { name, rows } of cases) {
        it(`agrees for ${name}`, () => {
            const provider = new StampProvider();
            const viaProvider = provider.Extract(rows);
            const viaCache = LocalCacheManager.MaxUpdatedAtOfRows(rows) ?? '';
            expect(viaCache).toBe(viaProvider);
        });
    }

    it('reads the legacy UpdatedAt column, which the slot path used to ignore', () => {
        expect(LocalCacheManager.MaxUpdatedAtOfRows([{ ID: '1', UpdatedAt: '2026-09-04T00:00:00.000Z' }]))
            .toBe('2026-09-04T00:00:00.000Z');
    });
});

describe('#18 — an expired slot is invalidated once, then forgotten', () => {
    /**
     * The local index must NOT be pruned against the shared group.
     *
     * A slot the group no longer lists is one that expired while peers may still hold its rows in
     * memory, and the next save's invalidation is what tells them to reload. Pruning would drop the
     * fingerprint and with it that notice.
     *
     * The notice must also not repeat on every later save, and does not: invalidating removes the
     * fingerprint from the index. Both halves are covered below.
     */
    let manager: LocalCacheManager;
    let storage: MockCacheStorageProvider & { Group: string[] };

    beforeEach(async () => {
        reset();
        manager = LocalCacheManager.Instance;
        const base = new MockCacheStorageProvider() as MockCacheStorageProvider & { Group: string[] };
        base.Group = [];
        (base as unknown as { SharedAcrossProcesses: boolean }).SharedAcrossProcesses = true;
        (base as unknown as { GetIndexGroupKeys: unknown }).GetIndexGroupKeys = async () => base.Group;
        storage = base;
        await manager.Initialize(storage);
    });

    it('keeps a fingerprint the shared group has dropped, so the next save can notify peers', async () => {
        await manager.SetRunViewResult(FP_A, { EntityName: ENTITY } as never, [{ ID: '1' }], '');
        storage.Group = []; // the slot expired in shared storage

        const resolved = await (manager as unknown as { resolveFingerprintsForEntity(e: string): Promise<Set<string> | undefined> })
            .resolveFingerprintsForEntity(ENTITY);

        expect([...(resolved ?? [])]).toEqual([FP_A]);
    });

    it('adds fingerprints a peer wrote', async () => {
        await manager.SetRunViewResult(FP_A, { EntityName: ENTITY } as never, [{ ID: '1' }], '');
        storage.Group = [FP_A, FP_B]; // a peer wrote FP_B

        const resolved = await (manager as unknown as { resolveFingerprintsForEntity(e: string): Promise<Set<string> | undefined> })
            .resolveFingerprintsForEntity(ENTITY);

        expect([...(resolved ?? [])].sort()).toEqual([FP_B, FP_A].sort());
    });

    it('forgets a fingerprint once it has been invalidated, so the notice is not repeated', async () => {
        await manager.SetRunViewResult(FP_A, { EntityName: ENTITY } as never, [{ ID: '1' }], '');
        expect(manager.GetFingerprintsForEntity(ENTITY)?.has(FP_A)).toBe(true);

        await manager.InvalidateRunViewResult(FP_A);

        expect(manager.GetFingerprintsForEntity(ENTITY)?.has(FP_A) ?? false).toBe(false);
    });
});

describe('#12 — a lock problem and a bug are not the same failure', () => {
    let manager: LocalCacheManager;

    beforeEach(async () => {
        reset();
        manager = LocalCacheManager.Instance;
    });

    /** Installs a store whose WithKeyLock fails the way `error` says. */
    async function withLockFailure(error: Error): Promise<MockCacheStorageProvider> {
        const storage = new MockCacheStorageProvider();
        (storage as unknown as { WithKeyLock: unknown }).WithKeyLock = async () => { throw error; };
        await manager.Initialize(storage);
        await manager.SetRunViewResult(FP_A, { EntityName: ENTITY } as never, [{ ID: '1' }], '');
        return storage;
    }

    it('reports lock contention as a warning and leaves the slot to be invalidated', async () => {
        const timeout = new Error('timed out waiting for another process');
        timeout.name = 'KeyLockTimeoutError';
        await withLockFailure(timeout);

        const maintained = await manager.ApplyRowChanges(FP_A,
            [{ Key: { KeyValuePairs: [{ FieldName: 'ID', Value: '2' }] } as never, Row: { ID: '2' } }], new Date().toISOString());

        expect(maintained).toBe(false); // the caller invalidates
    });

    it('reports a fault inside the work as an error, not as contention', async () => {
        const bug = new TypeError('cannot read properties of undefined');
        await withLockFailure(bug);
        const logError = vi.spyOn(await import('../generic/logging'), 'LogError').mockImplementation(() => undefined);

        const maintained = await manager.ApplyRowChanges(FP_A,
            [{ Key: { KeyValuePairs: [{ FieldName: 'ID', Value: '2' }] } as never, Row: { ID: '2' } }], new Date().toISOString());

        expect(maintained).toBe(false);
        expect(logError).toHaveBeenCalled(); // a bug is logged as an error, never filed as contention
        logError.mockRestore();
    });
});

describe('#21 — the warm-up lease is renewed while engines load', () => {
    beforeEach(() => reset());

    it('extends a lease this process holds', async () => {
        const manager = LocalCacheManager.Instance;
        const storage = new MockCacheStorageProvider();
        const renewals: Array<{ name: string; ttl: number }> = [];
        (storage as unknown as { TryAcquireLease: unknown }).TryAcquireLease = async () => true;
        (storage as unknown as { RenewLease: unknown }).RenewLease = async (name: string, ttl: number) => {
            renewals.push({ name, ttl });
            return true;
        };
        await manager.Initialize(storage);

        expect(await manager.RenewSharedLease('startup-warmup', 30000)).toBe(true);
        expect(renewals).toEqual([{ name: 'startup-warmup', ttl: 30000 }]);
    });

    it('falls back to re-claiming on a store with no renewal, and reports a lost lease', async () => {
        const manager = LocalCacheManager.Instance;
        const storage = new MockCacheStorageProvider();
        (storage as unknown as { TryAcquireLease: unknown }).TryAcquireLease = async () => false; // someone else holds it
        await manager.Initialize(storage);

        expect(await manager.RenewSharedLease('startup-warmup', 30000)).toBe(false);
    });
});

describe('#22 — a debounced metadata check cannot be starved', () => {
    class NoticeProvider extends TestMetadataProvider {
        public Checks = 0;
        public InTransaction = false;

        public override get LocalStorageProvider(): ILocalStorageProvider {
            return this.Store;
        }
        public Store = new MockCacheStorageProvider();

        protected override get MetadataMemberRefreshMustWait(): boolean {
            return this.InTransaction;
        }

        public override async RefreshIfNeeded(): Promise<boolean> {
            this.Checks++;
            return true;
        }
    }

    const notice = (): CacheChangedEvent => ({
        CacheKey: '___MJCore_Metadata_Timestamps', Category: CacheCategory.Default, Action: 'set',
        Timestamp: Date.now(), SourceServerId: 'peer',
    });

    beforeEach(() => {
        reset();
        vi.useFakeTimers();
    });

    it('runs the check once the deferral budget is spent, however steadily notices arrive', async () => {
        const provider = new NoticeProvider();
        const debounce = ProviderBase.MetadataDatasetRefreshDebounceMs;

        // A notice every half-debounce forever: the timer is reset each time.
        for (let elapsed = 0; elapsed < ProviderBase.PeerMetadataNoticeMaxDeferralMs + debounce * 4; elapsed += debounce / 2) {
            provider.HandlePeerMetadataNotice(notice());
            await vi.advanceTimersByTimeAsync(debounce / 2);
        }

        // Once the budget is spent the handler stops re-arming and returns, leaving the LAST armed
        // timer to fire — and that one was scheduled for `debounce + Math.random() * JitterMs`.
        // `Math.random` is not under fake timers' control, so the wait has to cover the whole jitter
        // range or the assertion is a coin toss: the loop alone left 2000ms for a delay that can be
        // 2500ms, which failed roughly one run in eight. Do not trim this to a measured-typical value.
        await vi.advanceTimersByTimeAsync(debounce + ProviderBase.PeerMetadataNoticeJitterMs);

        expect(provider.Checks).toBeGreaterThan(0);
    });

    it('does not carry retries from one deferred check into the next', async () => {
        // The retry counter bounds how long ONE check may be re-armed while a transaction is open.
        // It is reset when a RE-ARMED check finally runs — but not when a check runs on the direct
        // path, which is how it runs whenever a fresh notice arrives after the transaction closed.
        // The count then persists: the next transaction starts part-way to the cap and gives up
        // after fewer windows than the bound promises, dropping a metadata check the re-arm exists
        // to preserve. It takes a deferral followed by a *new* notice to see, which is why a
        // single-burst test does not.
        const provider = new NoticeProvider();
        const retries = () => (provider as unknown as { _peerMetadataNoticeRetries: number })._peerMetadataNoticeRetries;

        // A notice arrives while a transaction is open: the check re-arms and the counter climbs.
        provider.InTransaction = true;
        provider.HandlePeerMetadataNotice(notice());
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + ProviderBase.PeerMetadataNoticeJitterMs + 50);
        expect(retries()).toBeGreaterThan(0);

        // The transaction closes, and a NEW notice arrives — so the check runs on the direct path,
        // never touching the counter.
        provider.InTransaction = false;
        provider.HandlePeerMetadataNotice(notice());
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + ProviderBase.PeerMetadataNoticeJitterMs + 50);

        expect(provider.Checks).toBeGreaterThan(0);
        expect(retries()).toBe(0); // the next deferral gets the full budget
    });

    it('measures the deferral budget to when the check RUNS, not to when the timer fires', async () => {
        // `_peerMetadataNoticeFirstAt` is the wall-clock bound on how long one check may be put off.
        // Clearing it as the timer fires — before discovering the provider is mid-transaction —
        // ended the budget at the moment deferral actually began, leaving the retry COUNT as the
        // only real bound. The two budgets measure different things and both should hold.
        const provider = new NoticeProvider();
        const firstAt = () => (provider as unknown as { _peerMetadataNoticeFirstAt: number | null })._peerMetadataNoticeFirstAt;
        let deferring: number | null = null;
        try {
            provider.InTransaction = true;
            provider.HandlePeerMetadataNotice(notice());
            await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + ProviderBase.PeerMetadataNoticeJitterMs + 50);
            deferring = firstAt();
        } finally {
            // Always let the provider finish, so no self-re-arming retry chain is left pending in
            // the shared fake-timer queue for the rest of this file.
            provider.InTransaction = false;
            await vi.advanceTimersByTimeAsync(provider.MetadataMemberRefreshDelayMs * 2);
        }

        expect(deferring).not.toBeNull();  // still deferring, so the budget was still running
        expect(provider.Checks).toBe(1);
        expect(firstAt()).toBeNull();      // ran, so the next burst starts from a fresh budget
    });

    it('re-arms instead of dropping the check when the provider is inside a transaction', async () => {
        const provider = new NoticeProvider();
        provider.InTransaction = true;
        provider.HandlePeerMetadataNotice(notice());

        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + ProviderBase.PeerMetadataNoticeJitterMs + 50);
        expect(provider.Checks).toBe(0); // not run, and not lost either

        provider.InTransaction = false;
        await vi.advanceTimersByTimeAsync(2000);
        expect(provider.Checks).toBe(1);
    });
});
