import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { ReplaySubject } from 'rxjs';
import {
    BaseEntity,
    LocalCacheManager,
    ProviderBase,
    ProviderConfigDataBase,
    SetProvider,
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
