/**
 * A browser engine never shows a record's pre-save values once the save has happened.
 *
 * In the browser, an engine's rows are cached under the provider's client key, and the browser's
 * own save handling (LocalCacheManager) keeps that copy honest. These tests run a real engine
 * through a browser-mode provider whose stand-in server trusts any cached copy, so the only thing
 * standing between the user and a stale row is what the browser does on save.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { LocalCacheManager } from '../generic/localCacheManager';
import { BaseEngine } from '../generic/baseEngine';
import { EntityInfo } from '../generic/entityInfo';
import { CompositeKey } from '../generic/compositeKey';
import { IMetadataProvider } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { ClientSmartCacheTestProvider, ResetLocalCacheManager, Settle } from './mocks/ClientSmartCacheTestProvider';

const ENTITY_ID = 'E0000000-0000-0000-0000-00000000CACE';
const WIDGETS = new EntityInfo({
    ID: ENTITY_ID, Name: 'Widgets', SchemaName: 'dbo', BaseTable: 'Widget', BaseView: 'vwWidgets',
    AllowCaching: true, TrustServerCacheCompletely: true, IncludeInAPI: true,
    Fields: [
        { ID: 'w-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Widgets', Type: 'nvarchar', IsPrimaryKey: true, NeedsQuotes: true },
        { ID: 'w-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Widgets', Type: 'nvarchar' },
        { ID: 'w-upd', EntityID: ENTITY_ID, Sequence: 3, Name: '__mj_UpdatedAt', Entity: 'Widgets', Type: 'datetimeoffset' },
    ],
});

/** Debounce for the engine's refresh after an entity event, kept short so the test is fast. */
const DEBOUNCE_MS = 20;

class WidgetEngine extends BaseEngine<WidgetEngine> {
    public _widgets: Array<Record<string, unknown>> = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Load(
            [{ Type: 'entity', EntityName: 'Widgets', PropertyName: '_widgets', ResultType: 'simple', CacheLocal: true, AutoRefresh: true, DebounceTime: DEBOUNCE_MS }],
            provider!, forceRefresh, contextUser);
    }

    public get FirstName(): unknown {
        return this._widgets[0]?.Name;
    }

    /** Delivers an entity event the way MJGlobal does for a live save. */
    public Deliver(event: unknown): Promise<boolean> {
        return (this as unknown as { HandleIndividualBaseEntityEvent(e: unknown): Promise<boolean> }).HandleIndividualBaseEntityEvent(event);
    }
}

interface CacheEventHandler {
    HandleBaseEntityEvent(event: unknown): Promise<void>;
}

describe('browser engine cache after a save', () => {
    let serverRow: Record<string, unknown>;
    let provider: ClientSmartCacheTestProvider;
    const originalCoalesce = ProviderBase.CoalesceWindowMs;
    const originalDedupLinger = ProviderBase.DedupLingerMs;

    beforeEach(async () => {
        ResetLocalCacheManager();
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider());
        serverRow = { ID: 'w-1', Name: 'Before Save', __mj_UpdatedAt: '2026-06-01T00:00:00.000Z' };
        provider = new ClientSmartCacheTestProvider({ Entity: WIDGETS, ServerRows: () => [serverRow] });
        ProviderBase.CoalesceWindowMs = 0;
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = originalCoalesce;
        ProviderBase.DedupLingerMs = originalDedupLinger;
        ResetLocalCacheManager();
    });

    /** Saves the widget on the server and delivers the save event to the engine and the browser cache. */
    async function saveWidget(engine: WidgetEngine, name: string): Promise<void> {
        serverRow = { ID: 'w-1', Name: name, __mj_UpdatedAt: '2026-07-01T00:00:00.000Z' };
        const event = {
            type: 'save',
            baseEntity: {
                EntityInfo: WIDGETS,
                GetAll: () => ({ ...serverRow }),
                Get: (field: string) => serverRow[field],
                PrimaryKey: CompositeKey.FromID('w-1'),
                ProviderToUse: provider,
            },
        };
        await engine.Deliver(event);
        await (LocalCacheManager.Instance as unknown as CacheEventHandler).HandleBaseEntityEvent(event);
    }

    it('refreshes the running engine to the saved values', async () => {
        const engine = new WidgetEngine();
        await engine.Config(false, undefined, provider);
        expect(engine.FirstName).toBe('Before Save');

        await saveWidget(engine, 'After Save');
        await Settle(DEBOUNCE_MS * 5);

        expect(engine.FirstName).toBe('After Save');
    });

    it('shows the saved values after a reload through the same cache', async () => {
        const engine = new WidgetEngine();
        await engine.Config(false, undefined, provider);
        await Settle();

        await saveWidget(engine, 'After Save');
        await Settle(DEBOUNCE_MS * 5);

        const reloaded = new WidgetEngine();
        await reloaded.Config(false, undefined, provider);
        expect(reloaded.FirstName).toBe('After Save');
    });
});
