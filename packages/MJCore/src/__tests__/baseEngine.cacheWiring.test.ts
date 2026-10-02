import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { LocalCacheManager, CacheChangedEvent } from '../generic/localCacheManager';
import { LogWarning, SetProductionStatus } from '../generic/logging';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, RunViewResult } from '../generic/interfaces';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

/**
 *  - N10: degradations are logged at a level production keeps.
 *  - F3:  a peer's cache payload never fills a config the current user cannot read.
 *  - F4:  an engine that loaded before LocalCacheManager was initialized still registers its
 *         cross-server callbacks once initialization happens.
 */

class WiringEngine extends BaseEngine<WiringEngine> {
    public _items: unknown[] = [];
    public reloads = 0;

    public async Config(): Promise<void> {
        // configs are injected directly
    }

    public Bind(provider: IMetadataProvider): void {
        (this as unknown as { _provider: IMetadataProvider })._provider = provider;
    }

    public Register(configs: BaseEnginePropertyConfig[]): void {
        this.RegisterCacheChangeCallbacks(configs);
    }

    public Hold(config: BaseEnginePropertyConfig, rows: unknown[]): void {
        this.HandleSingleViewResult(config, { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' } as RunViewResult);
    }

    public Fire(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        return this.OnExternalCacheChange(config, event);
    }

    public Fingerprint(config: BaseEnginePropertyConfig): string {
        return LocalCacheManager.Instance.GenerateRunViewFingerprint(this.BuildRunViewParamsForConfig(config));
    }

    protected override async LoadSingleConfig(_config: BaseEnginePropertyConfig, _contextUser: UserInfo): Promise<void> {
        this.reloads++;
    }
}

const CONFIG = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Widgets', PropertyName: '_items', ResultType: 'simple' });

function setEvent(rows: unknown[]): CacheChangedEvent {
    return { Action: 'set', CacheKey: 'k', Category: 'RunViewCache', Timestamp: 0, SourceServerId: 'peer', Data: JSON.stringify({ results: rows }) };
}

function resetSingletons(): void {
    const store = GetGlobalObjectStore() as Record<string, unknown>;
    delete store['___SINGLETON__WiringEngine'];
    delete store['___SINGLETON__LocalCacheManager'];
}

describe('LogWarning (N10)', () => {
    afterEach(() => {
        SetProductionStatus(false);
        vi.restoreAllMocks();
    });

    it('is emitted when production status is set, where LogStatus output is dropped', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        SetProductionStatus(true);

        LogWarning('slot could not be applied', 'Cache');

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(String(errorSpy.mock.calls[0][0])).toBe('[WARNING] [Cache] slot could not be applied');
        expect(logSpy).not.toHaveBeenCalled();
    });
});

describe('OnExternalCacheChange permission guard (F3)', () => {
    let engine: WiringEngine;

    beforeEach(() => {
        resetSingletons();
        engine = new WiringEngine();
        engine.Bind({ EntityByName: () => undefined } as unknown as IMetadataProvider);
    });

    it('ignores payloads while the engine is permission-constrained', async () => {
        (engine as unknown as { _isPermissionConstrained: boolean })._isPermissionConstrained = true;
        await engine.Fire(CONFIG, setEvent([{ ID: 'leak' }]));
        expect(engine._items).toEqual([]);
        expect(engine.reloads).toBe(0);
    });

    it('ignores payloads and removals for a config loaded empty after a read denial', async () => {
        engine.Hold(CONFIG, []);
        const map = (engine as unknown as { _dataMap: Map<string, { readDenied?: boolean }> })._dataMap;
        map.get('_items')!.readDenied = true;

        await engine.Fire(CONFIG, setEvent([{ ID: 'leak' }]));
        await engine.Fire(CONFIG, { ...setEvent([]), Action: 'removed', Data: undefined });

        expect(engine._items).toEqual([]);
        expect(engine.reloads).toBe(0);
    });

    it('still applies payloads for a readable config', async () => {
        await engine.Fire(CONFIG, setEvent([{ ID: 'ok' }]));
        expect(engine._items).toEqual([{ ID: 'ok' }]);
    });
});

describe('deferred cache-callback registration (F4)', () => {
    beforeEach(() => {
        resetSingletons();
    });

    it('registers callbacks when the cache manager initializes after the engine loaded', async () => {
        const engine = new WiringEngine();
        engine.Bind({ EntityByName: () => undefined } as unknown as IMetadataProvider);
        expect(LocalCacheManager.Instance.IsInitialized).toBe(false);

        engine.Register([CONFIG]);
        expect(LocalCacheManager.Instance.ChangeCallbackCount).toBe(0);

        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider());
        expect(LocalCacheManager.Instance.ChangeCallbackCount).toBe(1);

        // And the registered callback reaches the engine.
        LocalCacheManager.Instance.DispatchCacheChange({ ...setEvent([{ ID: 'from-peer' }]), CacheKey: engine.Fingerprint(CONFIG) });
        await vi.waitFor(() => expect(engine._items).toEqual([{ ID: 'from-peer' }]));
    });

    it('registers only the latest config list when called several times before initialization', async () => {
        const engine = new WiringEngine();
        engine.Bind({ EntityByName: () => undefined } as unknown as IMetadataProvider);
        const other = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Gadgets', PropertyName: '_items' });

        engine.Register([CONFIG]);
        engine.Register([CONFIG, other]);
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider());

        expect(LocalCacheManager.Instance.ChangeCallbackCount).toBe(2);
    });

    it('WhenInitialized runs immediately once initialized, and a failing listener does not stop the others', async () => {
        const order: string[] = [];
        LocalCacheManager.Instance.WhenInitialized(() => { throw new Error('bad listener'); });
        LocalCacheManager.Instance.WhenInitialized(() => order.push('queued'));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider());
        LocalCacheManager.Instance.WhenInitialized(() => order.push('immediate'));

        expect(order).toEqual(['queued', 'immediate']);
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
