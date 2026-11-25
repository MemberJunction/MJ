import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider } from '../generic/interfaces';

/**
 * An engine is read by every user, so a save whose entity lacks columns (its saver could not
 * read them) must not be cloned into the engine's array: that would serve a narrowed row to
 * everyone until the next refresh. Such a save takes the full-refresh path instead.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];
    public ImmediateMutations = 0;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public async ProcessEntityEventForTest(event: BaseEntityEvent): Promise<void> {
        await this.ProcessEntityEvent(event);
    }

    public async HandleIndividualEventForTest(event: BaseEntityEvent): Promise<boolean> {
        return this.HandleIndividualBaseEntityEvent(event);
    }

    protected override DebounceIndividualBaseEntityEvent(): Promise<boolean> {
        this.DebouncedRefreshes++;
        return Promise.resolve(true);
    }

    public DebouncedRefreshes = 0;

    protected override async applyImmediateMutation(): Promise<void> {
        this.ImmediateMutations++;
    }

    protected override async LoadSingleConfig(): Promise<void> {
        // the refresh itself needs a provider; not under test here
    }
}

const ITEMS = new EntityInfo({
    ID: 'E-Items', Name: 'Items', SchemaName: 'dbo', BaseTable: 'Items', BaseView: 'vwItems', Permissions: [],
    Fields: [
        { ID: 'F-ID', EntityID: 'E-Items', Sequence: 1, Name: 'ID', Entity: 'Items', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { ID: 'F-Name', EntityID: 'E-Items', Sequence: 2, Name: 'Name', Entity: 'Items', Type: 'nvarchar' },
        { ID: 'F-Salary', EntityID: 'E-Items', Sequence: 3, Name: 'Salary', Entity: 'Items', Type: 'int' },
    ],
});

function saveEvent(values: Record<string, unknown>): BaseEntityEvent {
    const entity = {
        EntityInfo: ITEMS,
        GetAll: () => ({ ...values }),
        PrimaryKey: { ToString: () => String(values.ID), KeyValuePairs: [{ FieldName: 'ID', Value: values.ID }] },
        ProviderToUse: null,
    } as unknown as BaseEntity;
    return { type: 'save', saveSubType: 'update', baseEntity: entity, payload: null } as unknown as BaseEntityEvent;
}

function engineWithUnfilteredConfig(): TestEngine {
    const engine = new TestEngine();
    engine.SetConfigsForTest([new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Items', PropertyName: '_items' })]);
    return engine;
}

describe('BaseEngine: a narrowed save does not mutate the engine in place', () => {
    it('applies a full-width save immediately', async () => {
        const engine = engineWithUnfilteredConfig();
        await engine.ProcessEntityEventForTest(saveEvent({ ID: 'i1', Name: 'Ada', Salary: 250000 }));
        expect(engine.ImmediateMutations).toBe(1);
    });

    it('sends a save missing a column to the full refresh instead', async () => {
        const engine = engineWithUnfilteredConfig();
        await engine.ProcessEntityEventForTest(saveEvent({ ID: 'i1', Name: 'Ada' }));
        expect(engine.ImmediateMutations).toBe(0);
    });
});

describe('BaseEngine: the per-event handler also refuses an in-place narrowed save', () => {
    it('applies a full-width save immediately', async () => {
        const engine = engineWithUnfilteredConfig();
        await engine.HandleIndividualEventForTest(saveEvent({ ID: 'i1', Name: 'Ada', Salary: 250000 }));
        expect(engine.ImmediateMutations).toBe(1);
        expect(engine.DebouncedRefreshes).toBe(0);
    });

    it('debounces a full refresh for a save missing a column', async () => {
        const engine = engineWithUnfilteredConfig();
        await engine.HandleIndividualEventForTest(saveEvent({ ID: 'i1', Name: 'Ada' }));
        expect(engine.ImmediateMutations).toBe(0);
        expect(engine.DebouncedRefreshes).toBe(1);
    });
});
