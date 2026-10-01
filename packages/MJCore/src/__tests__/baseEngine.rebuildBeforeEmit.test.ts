/**
 * Every path that REPLACES a config's rows must rebuild derived state before it notifies anyone
 * (plan §22, found in the second review).
 *
 * The invariant is stated in `OnExternalCacheChange`: a subscriber must never observe the property
 * before the state derived from it is rebuilt, because a reload swaps in new entity instances and
 * anything a subclass derived from the previous ones — grouped child collections, memoized lookups
 * — still points at objects the engine has discarded. Row counts and identity hashes all look
 * correct while that is true, which is what makes it hard to see.
 *
 * The first fix covered only the sweep. These cover the two paths it missed: the fallback reload
 * inside `OnExternalCacheChange`, and `RefreshItem` — which is also what the expiration timer
 * calls, so a config with an expiry was replacing its rows and rebuilding nothing at all.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import type { CacheChangedEvent } from '../generic/localCacheManager';
import type { EntityInfo } from '../generic/entityInfo';

const ENTITY = 'MJ: AI Models';
const ROWS = [{ ID: '1', __mj_UpdatedAt: '2026-09-01T00:00:00.000Z' }];

/** Records the order of rebuilds and emissions; every reload returns rows. */
class OrderEngine extends BaseEngine<OrderEngine> {
    public readonly Order: string[] = [];

    public constructor() {
        super();
        const config: BaseEnginePropertyConfig = { Type: 'entity', EntityName: ENTITY, PropertyName: '_models' };
        const self = this as unknown as {
            _metadataConfigs: BaseEnginePropertyConfig[];
            _dataMap: Map<string, unknown>;
            _loaded: boolean;
            _contextUser: unknown;
        };
        self._metadataConfigs = [config];
        self._dataMap = new Map([['_models', { entityName: ENTITY, data: [...ROWS], loadedSuccessfully: true }]]);
        self._loaded = true;
        self._contextUser = { Email: 'test@example.com' };
    }

    public get Config0(): BaseEnginePropertyConfig {
        return (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs[0];
    }

    public override get Loaded(): boolean { return true; }

    protected override get ProviderToUse() {
        return { EntityByName: () => ({ Name: ENTITY, PrimaryKeys: [{ Name: 'ID' }], Fields: [] } as unknown as EntityInfo) } as never;
    }

    protected override get RunViewProviderToUse() {
        return {
            EntityByName: () => ({ Name: ENTITY, PrimaryKeys: [{ Name: 'ID' }], Fields: [] } as unknown as EntityInfo),
            RunView: async () => ({ Success: true, Results: ROWS, RowCount: 1, TotalRowCount: 1, ErrorMessage: '', ExecutionTime: 0, UserViewRunID: '' }),
        } as never;
    }

    protected override HandleSingleViewResult(): void {
        this.Order.push('rows-replaced');
    }

    protected override async RebuildDerivedState(): Promise<void> {
        this.Order.push('rebuild');
    }

    protected override emitPropertyChange(propertyName: string): void {
        this.Order.push(`emit:${propertyName}`);
    }

    /** Drives the fallback branch of OnExternalCacheChange: an event with no usable payload. */
    public async DeliverUnusablePayload(): Promise<void> {
        const event = { CacheKey: 'x', Category: 'RunViewCache', Action: 'removed', Timestamp: Date.now() } as CacheChangedEvent;
        await (this as unknown as {
            OnExternalCacheChange(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void>;
        }).OnExternalCacheChange(this.Config0, event);
    }
}

describe('a reload rebuilds derived state before it emits', () => {
    let engine: OrderEngine;

    beforeEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        engine = new OrderEngine();
    });

    it('OnExternalCacheChange falls back to a database reload, rebuilds, THEN emits', async () => {
        await engine.DeliverUnusablePayload();

        expect(engine.Order).toEqual(['rows-replaced', 'rebuild', 'emit:_models']);
    });

    it('RefreshItem rebuilds before emitting, instead of replacing rows and rebuilding nothing', async () => {
        await engine.RefreshItem('_models');

        expect(engine.Order).toEqual(['rows-replaced', 'rebuild', 'emit:_models']);
    });

    it('RefreshItem does nothing for a property the engine does not hold', async () => {
        await engine.RefreshItem('_nope');

        expect(engine.Order).toEqual([]);
    });
});
