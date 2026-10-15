import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig, EngineDataChangeEvent } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider } from '../generic/interfaces';

/**
 * Covers the "already applied" skip paths in BaseEngine.ProcessEntityEvent.
 *
 * When engine code maintains a config's backing array manually (saves the cached
 * instance in place, pushes after create, splices after delete), ProcessEntityEvent
 * skips the redundant refresh — but it MUST still notify DataChange$ / ObserveProperty
 * subscribers. A silent skip strands downstream observers (e.g. Explorer's
 * ApplicationManager.applications$, and through it the Home dashboard and app
 * switcher) on stale state.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];
    public LoadSingleConfigCalls = 0;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // no-op for tests — configs are injected via SetConfigsForTest
    }

    public SetConfigsForTest(configs: BaseEnginePropertyConfig[]): void {
        (this as unknown as { _metadataConfigs: BaseEnginePropertyConfig[] })._metadataConfigs = configs;
    }

    public async ProcessEntityEventForTest(event: BaseEntityEvent): Promise<void> {
        await this.ProcessEntityEvent(event);
    }

    public NotifyAlreadyAppliedMutationForTest(config: BaseEnginePropertyConfig, changeType: 'add' | 'update' | 'delete', entity: BaseEntity): void {
        this.notifyAlreadyAppliedMutation(config, changeType, entity);
    }

    // Stub out the real refresh (needs a provider); count invocations so tests can
    // assert whether the refresh path vs. the skip-notify path was taken. Records a
    // successful load in the data map so the transient-failure retry never engages here
    // (retry behavior is covered in baseEngine.batchedEvents.test.ts).
    protected override async LoadSingleConfig(config: BaseEnginePropertyConfig): Promise<void> {
        this.LoadSingleConfigCalls++;
        (this as unknown as { _dataMap: Map<string, { entityName?: string; data: unknown[]; loadedSuccessfully: boolean }> })
            ._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: this._items, loadedSuccessfully: true });
    }
}

function makeMockEntity(id: string): BaseEntity {
    return {
        EntityInfo: { Name: 'Items', PrimaryKeys: [{ Name: 'ID' }] },
        PrimaryKey: {
            ToString: () => id,
            // Matches CompositeKey semantics closely enough for the by-key membership check:
            // true when the other key carries the same single ID value.
            Equals: (other: { KeyValuePairs?: { FieldName: string; Value: unknown }[] }) =>
                other?.KeyValuePairs?.some(kv => kv.FieldName === 'ID' && kv.Value === id) ?? false,
            KeyValuePairs: [{ FieldName: 'ID', Value: id }],
        },
        ID: id,
    } as unknown as BaseEntity;
}

function makeFilteredConfig(): BaseEnginePropertyConfig {
    // Filter forces the debounced full-refresh path (canUseImmediateMutation = false),
    // mirroring real configs like UserInfoEngine's 'MJ: User Applications'.
    return new BaseEnginePropertyConfig({
        Type: 'entity',
        EntityName: 'Items',
        PropertyName: '_items',
        Filter: `UserID='u1'`,
    });
}

function setupEngine(): { engine: TestEngine; dataChanges: EngineDataChangeEvent[]; propertyEmits: BaseEntity[][] } {
    const engine = new TestEngine();
    engine.SetConfigsForTest([makeFilteredConfig()]);

    const dataChanges: EngineDataChangeEvent[] = [];
    engine.DataChange$.subscribe(e => dataChanges.push(e));

    const propertyEmits: BaseEntity[][] = [];
    engine.ObserveProperty<BaseEntity>('_items').subscribe(arr => propertyEmits.push(arr));

    return { engine, dataChanges, propertyEmits };
}

describe('BaseEngine.ProcessEntityEvent skip-path notifications', () => {
    it('notifies (update) when the saved entity is already in the array — in-place save of a cached instance', async () => {
        const { engine, dataChanges, propertyEmits } = setupEngine();
        const entity = makeMockEntity('a');
        engine._items = [entity];

        await engine.ProcessEntityEventForTest({ type: 'save', saveSubType: 'update', baseEntity: entity } as BaseEntityEvent);

        expect(engine.LoadSingleConfigCalls).toBe(0); // refresh skipped
        expect(dataChanges).toHaveLength(1); // ...but observers still notified
        expect(dataChanges[0].changeType).toBe('update');
        expect(dataChanges[0].config.EntityName).toBe('Items');
        expect(dataChanges[0].data).toBe(engine._items);
        expect(dataChanges[0].affectedEntity).toBe(entity);
        expect(propertyEmits).toHaveLength(2); // initial + skip-notify
        expect(propertyEmits[1]).toBe(engine._items);
    });

    it('notifies (add) when the created entity was already pushed manually', async () => {
        const { engine, dataChanges, propertyEmits } = setupEngine();
        const entity = makeMockEntity('new-1');
        engine._items = [entity]; // engine code pushed after Save, before the debounced event fires

        await engine.ProcessEntityEventForTest({ type: 'save', saveSubType: 'create', baseEntity: entity } as BaseEntityEvent);

        expect(engine.LoadSingleConfigCalls).toBe(0);
        expect(dataChanges).toHaveLength(1);
        expect(dataChanges[0].changeType).toBe('add');
        expect(dataChanges[0].affectedEntity).toBe(entity);
        expect(propertyEmits).toHaveLength(2);
    });

    it('stays SILENT for deletes of rows absent from the array — "already spliced" is indistinguishable from "never matched the Filter", so no phantom delete events', async () => {
        const { engine, dataChanges, propertyEmits } = setupEngine();
        const entity = makeMockEntity('gone');
        engine._items = []; // row absent: either manually spliced, or never in this filtered dataset

        await engine.ProcessEntityEventForTest({
            type: 'delete',
            baseEntity: entity,
            payload: { OldValues: { ID: 'gone' } },
        } as BaseEntityEvent);

        expect(engine.LoadSingleConfigCalls).toBe(0);
        expect(dataChanges).toHaveLength(0); // the splicing code owns the notification (notifyAlreadyAppliedMutation)
        expect(propertyEmits).toHaveLength(1); // initial only
    });

    it('runs the refresh for deletes via a NON-cached instance, matching the row by the pre-delete OldValues key (Delete() re-keys the live entity via NewRecord())', async () => {
        const { engine, dataChanges } = setupEngine();
        const cachedRow = makeMockEntity('a');
        engine._items = [cachedRow];
        // The deleting instance is a different object whose PK was regenerated by
        // NewRecord() after the delete event was raised — only OldValues identifies the row.
        const deletingInstance = makeMockEntity('regenerated-uuid');

        await engine.ProcessEntityEventForTest({
            type: 'delete',
            baseEntity: deletingInstance,
            payload: { OldValues: { ID: 'a' } },
        } as BaseEntityEvent);

        expect(engine.LoadSingleConfigCalls).toBe(1); // row still present → refresh, not skip
        expect(dataChanges).toHaveLength(0); // notification comes from the (stubbed) refresh
    });

    it('notifyAlreadyAppliedMutation lets manual-splice engine code emit the delete notification itself', () => {
        const { engine, dataChanges, propertyEmits } = setupEngine();
        const removed = makeMockEntity('gone');
        engine._items = []; // engine code already spliced

        engine.NotifyAlreadyAppliedMutationForTest(makeFilteredConfig(), 'delete', removed);

        expect(dataChanges).toHaveLength(1);
        expect(dataChanges[0].changeType).toBe('delete');
        expect(dataChanges[0].affectedEntity).toBe(removed);
        expect(propertyEmits).toHaveLength(2);
    });

    it('still runs the full refresh (no skip-notify) when the saved entity is NOT in the array', async () => {
        const { engine, dataChanges } = setupEngine();
        const cached = makeMockEntity('a');
        const freshInstance = makeMockEntity('a'); // different object reference, same record
        engine._items = [cached];

        await engine.ProcessEntityEventForTest({ type: 'save', saveSubType: 'update', baseEntity: freshInstance } as BaseEntityEvent);

        expect(engine.LoadSingleConfigCalls).toBe(1); // refresh path taken
        expect(dataChanges).toHaveLength(0); // notification comes from the (stubbed) refresh, not skip-notify
    });

    it('does nothing for events on entities with no matching config', async () => {
        const { engine, dataChanges } = setupEngine();
        const other = {
            EntityInfo: { Name: 'Other Entity', PrimaryKeys: [{ Name: 'ID' }] },
            PrimaryKey: { ToString: () => 'x', Equals: () => false, KeyValuePairs: [{ FieldName: 'ID', Value: 'x' }] },
        } as unknown as BaseEntity;

        await engine.ProcessEntityEventForTest({ type: 'save', saveSubType: 'update', baseEntity: other } as BaseEntityEvent);

        expect(engine.LoadSingleConfigCalls).toBe(0);
        expect(dataChanges).toHaveLength(0);
    });
});
