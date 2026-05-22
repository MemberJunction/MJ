import { describe, it, expect } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider } from '../generic/interfaces';

class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // no-op for tests — we set arrays directly
    }

    public EmitForTest(propertyName: string): void {
        this.emitPropertyChange(propertyName);
    }

    public async ApplyImmediateMutationForTest(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void> {
        await this.applyImmediateMutation(config, event);
    }

    // The real cloneEntityForCache needs a working provider to call GetEntityObject.
    // The mock entities used in this test aren't backed by metadata, so override to pass-through.
    protected async cloneEntityForCache(source: BaseEntity): Promise<BaseEntity | null> {
        return source;
    }
}

function makeMockEntity(id: string): BaseEntity {
    return {
        EntityInfo: { PrimaryKeys: [{ Name: 'ID' }] },
        PrimaryKey: { ToString: () => id, Equals: () => false, KeyValuePairs: [{ FieldName: 'ID', Value: id }] },
        ID: id,
    } as unknown as BaseEntity;
}

describe('BaseEngine.ObserveProperty', () => {
    it('emits the current array value on subscribe', async () => {
        const engine = new TestEngine();
        const sentinel = { id: 'a' } as unknown as BaseEntity;
        engine._items = [sentinel];

        const first = await firstValueFrom(engine.ObserveProperty<BaseEntity>('_items').pipe(take(1)));

        expect(first).toEqual([sentinel]);
    });

    it('does not create a BehaviorSubject when emitPropertyChange fires without observers', () => {
        const engine = new TestEngine();
        const subjects = (engine as unknown as { _propertySubjects: Map<string, unknown> })._propertySubjects;

        engine.EmitForTest('_items');

        expect(subjects.size).toBe(0);
    });

    it('returns the same Observable source across repeated ObserveProperty calls', () => {
        const engine = new TestEngine();
        const subjects = (engine as unknown as { _propertySubjects: Map<string, unknown> })._propertySubjects;

        engine.ObserveProperty<BaseEntity>('_items');
        engine.ObserveProperty<BaseEntity>('_items');
        engine.ObserveProperty<BaseEntity>('_items');

        expect(subjects.size).toBe(1);
    });

    it('re-emits to subscribers when emitPropertyChange fires', () => {
        const engine = new TestEngine();
        const received: BaseEntity[][] = [];
        const sub = engine.ObserveProperty<BaseEntity>('_items').subscribe(arr => received.push(arr));

        const added = { id: 'a' } as unknown as BaseEntity;
        engine._items.push(added);
        engine.EmitForTest('_items');

        sub.unsubscribe();
        expect(received).toHaveLength(2); // initial [] + push
        expect(received[1]).toEqual([added]);
    });

    it('applyImmediateMutation(create) propagates to ObserveProperty subscribers', async () => {
        const engine = new TestEngine();
        const received: BaseEntity[][] = [];
        const sub = engine.ObserveProperty<BaseEntity>('_items').subscribe(arr => received.push(arr));

        const entity = makeMockEntity('new-1');
        const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
        const event = { type: 'save', saveSubType: 'create', baseEntity: entity } as BaseEntityEvent;

        await engine.ApplyImmediateMutationForTest(config, event);

        sub.unsubscribe();
        expect(received).toHaveLength(2); // initial [] + create
        expect(received[1]).toHaveLength(1);
        expect(received[1][0]).toBe(entity);
    });
});
