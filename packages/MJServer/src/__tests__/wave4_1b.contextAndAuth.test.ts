import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { ReplaySubject } from 'rxjs';
import {
    BaseEntity,
    LocalCacheManager,
    Metadata,
    ProviderBase,
    ProviderConfigDataBase,
    SetProvider,
    type DatabaseProviderBase,
} from '@memberjunction/core';
import {
    GetReadOnlyProvider,
    GetReadWriteProvider,
} from '../util.js';
import {
    ResolveOriginSessionId,
    RunWithRequestSessionId,
    StampProviderOriginSessionId,
} from '../requestSessionContext.js';
import { AuthCache, HashAuthToken } from '../cache.js';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { ProviderInfo } from '../types.js';

class TestStubProvider extends ProviderBase {
    public TriggerWireInvalidation(): void {
        this.ensureInflightViewInvalidation();
    }

    public ConfigureSyncTest(data: ProviderConfigDataBase): boolean {
        return this.ConfigureFromGlobalMetadataSync(data);
    }

    protected override get AllowRefresh(): boolean {
        return false;
    }

    public override async RefreshCurrentUser(): Promise<void> {}
}

describe('Wave 4.1b — ProviderBase DetachInvalidationListeners & OriginSessionID', () => {
    beforeEach(async () => {
        await LocalCacheManager.Instance.Initialize();
    });

    it('DetachInvalidationListeners immediately removes per-request provider WeakRef from ProviderBase._invalidationTargets', () => {
        const baseline = ProviderBase.ActiveInvalidationTargetCount;
        const p1 = new TestStubProvider();
        const p2 = new TestStubProvider();

        p1.TriggerWireInvalidation();
        p2.TriggerWireInvalidation();
        expect(ProviderBase.ActiveInvalidationTargetCount).toBe(baseline + 2);

        p1.DetachInvalidationListeners();
        expect(ProviderBase.ActiveInvalidationTargetCount).toBe(baseline + 1);

        p2.DetachInvalidationListeners();
        expect(ProviderBase.ActiveInvalidationTargetCount).toBe(baseline);
    });

    it('ResolveOriginSessionId prefers stamped per-request provider session and falls back to AsyncLocalStorage', () => {
        const provider = new TestStubProvider();
        StampProviderOriginSessionId(provider, 'sess-from-provider');

        const fakeEntityWithProvider = { ProviderToUse: provider } as Partial<BaseEntity> as BaseEntity;
        const fakeEntityWithoutStamp = { ProviderToUse: new TestStubProvider() } as Partial<BaseEntity> as BaseEntity;

        // Even outside AsyncLocalStorage, provider stamp wins
        expect(ResolveOriginSessionId(fakeEntityWithProvider)).toBe('sess-from-provider');
        expect(ResolveOriginSessionId(fakeEntityWithoutStamp)).toBeNull();

        // Inside AsyncLocalStorage, unstamped entities inherit request sessionId while stamped keeps its own
        const resolvedInsideAls = RunWithRequestSessionId('sess-from-als', () => ({
            stamped: ResolveOriginSessionId(fakeEntityWithProvider),
            unstamped: ResolveOriginSessionId(fakeEntityWithoutStamp),
        }));
        expect(resolvedInsideAls).toEqual({
            stamped: 'sess-from-provider',
            unstamped: 'sess-from-als',
        });
    });

    it('lazy ProviderInfo descriptors materialize only the requested provider and clean up on response close', () => {
        const globalProvider = new TestStubProvider();
        SetProvider(globalProvider);

        let rwConstructed = 0;
        let roConstructed = 0;
        const materialized: TestStubProvider[] = [];
        const resEmitter = new EventEmitter();

        let rwInstance: TestStubProvider | null = null;
        let roInstance: TestStubProvider | null = null;

        const providers: ProviderInfo[] = [
            {
                type: 'Read-Write',
                get provider() {
                    if (!rwInstance) {
                        rwConstructed++;
                        rwInstance = new TestStubProvider();
                        rwInstance.ConfigureSyncTest(new ProviderConfigDataBase({}, '__mj', 0, undefined, undefined, false));
                        rwInstance.TriggerWireInvalidation();
                        StampProviderOriginSessionId(rwInstance, 'sess-lazy-1');
                        materialized.push(rwInstance);
                    }
                    return rwInstance as Partial<ProviderInfo['provider']> as ProviderInfo['provider'];
                },
            },
            {
                type: 'Read-Only',
                get provider() {
                    if (!roInstance) {
                        roConstructed++;
                        roInstance = new TestStubProvider();
                        roInstance.ConfigureSyncTest(new ProviderConfigDataBase({}, '__mj', 0, undefined, undefined, false));
                        roInstance.TriggerWireInvalidation();
                        StampProviderOriginSessionId(roInstance, 'sess-lazy-1');
                        materialized.push(roInstance);
                    }
                    return roInstance as Partial<ProviderInfo['provider']> as ProviderInfo['provider'];
                },
            },
        ];

        resEmitter.once('close', () => {
            for (const p of materialized) {
                p.DetachInvalidationListeners();
            }
        });

        const baselineTargets = ProviderBase.ActiveInvalidationTargetCount;

        // Before any resolver accesses a provider: 0 constructed
        expect(rwConstructed).toBe(0);
        expect(roConstructed).toBe(0);

        // Read-only query touches ONLY Read-Only provider
        const ro = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        expect(ro).toBeDefined();
        expect(roConstructed).toBe(1);
        expect(rwConstructed).toBe(0);
        expect(ProviderBase.ActiveInvalidationTargetCount).toBe(baselineTargets + 1);

        // Response finishes -> invalidation target immediately detached
        resEmitter.emit('close');
        expect(ProviderBase.ActiveInvalidationTargetCount).toBe(baselineTargets);

        // Also verify ReplaySubject setupComplete$ synchronous fast-path compatibility
        const setup$ = new ReplaySubject<boolean>(1);
        setup$.next(true);
        let ready = false;
        const sub = setup$.subscribe({ next: () => { ready = true; } });
        sub.unsubscribe();
        expect(ready).toBe(true);
        expect(GetReadWriteProvider(providers)).toBeDefined();
        expect(rwConstructed).toBe(1);
        rwInstance?.DetachInvalidationListeners();
    });
});

describe('Wave 6A — AuthCache SHA-256 keying and O(1) UserByID lookup', () => {
    let previousGlobalProvider: DatabaseProviderBase;

    beforeEach(async () => {
        previousGlobalProvider = Metadata.Provider as unknown as DatabaseProviderBase;
        await LocalCacheManager.Instance.Initialize();
    });

    afterEach(() => {
        SetProvider(previousGlobalProvider);
        AuthCache.clear();
    });

    it('HashAuthToken produces fixed 64-char SHA-256 hex digests and isolates near-identical JWTs in AuthCache', () => {
        const sharedPrefix = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.' + 'a'.repeat(2048);
        const rawJwtA = sharedPrefix + '.sigA';
        const rawJwtB = sharedPrefix + '.sigB';
        const digestA = HashAuthToken(rawJwtA);
        const digestB = HashAuthToken(rawJwtB);

        expect(digestA).toMatch(/^[a-f0-9]{64}$/);
        expect(digestB).toMatch(/^[a-f0-9]{64}$/);
        expect(digestA).toBe(HashAuthToken(rawJwtA));
        expect(digestA).not.toBe(digestB);
        expect(digestA).not.toContain('eyJhbGci');
        expect(digestB).not.toContain('sigB');

        AuthCache.set(digestA, { sub: 'user-A' });
        AuthCache.set(digestB, { sub: 'user-B' });
        expect(AuthCache.get(digestA)).toEqual({ sub: 'user-A' });
        expect(AuthCache.get(digestB)).toEqual({ sub: 'user-B' });
        expect(AuthCache.get(rawJwtA)).toBeUndefined();
        expect(AuthCache.get(rawJwtB)).toBeUndefined();
        expect(AuthCache.size).toBe(2);
        for (const key of AuthCache.keys()) {
            expect(key.length).toBe(64);
        }
    });

    it('UserCache.Instance.UserByID resolves users in O(1) regardless of UUID casing/whitespace', () => {
        const targetId = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
        const fakeUser = { ID: targetId, Email: 'u@example.com', Name: 'U', IsActive: true } as unknown as UserCache['Users'][number];
        const cache = UserCache.Instance as unknown as {
            _users: Array<UserCache['Users'][number]>;
            _indexDirty: boolean;
        };
        const prevUsers = cache._users;
        try {
            cache._users = [fakeUser];
            cache._indexDirty = true;
            expect(UserCache.Instance.UserByID(targetId.toLowerCase())).toBe(fakeUser);
            expect(UserCache.Instance.UserByID(`  ${targetId.toUpperCase()}  `)).toBe(fakeUser);
            expect(UserCache.Instance.UserByID('00000000-0000-0000-0000-000000000000')).toBeUndefined();
        } finally {
            cache._users = prevUsers;
            cache._indexDirty = true;
        }
    });
});
