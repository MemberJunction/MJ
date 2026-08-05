import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEntityByID = vi.fn();

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class BaseEngine<T> {
        protected static getInstance<T>(_key?: string): T {
            return {} as T;
        }
        protected async Load(): Promise<void> {}
    },
    BaseEnginePropertyConfig: class BaseEnginePropertyConfig {},
    BaseEntity: class BaseEntity {},
    EntityInfo: class EntityInfo {},
    IMetadataProvider: class IMetadataProvider {},
    UserInfo: class UserInfo {},
    Metadata: class Metadata {
        public EntityByID(id: string): unknown {
            return mockEntityByID(id);
        }
    },
    RunView: class RunView {}
}));

vi.mock('@memberjunction/core-entities', () => ({}));

import { EntityActionEngineBase } from '../EntityActionEngine-Base';
import { MJEntityActionEntityExtended } from '../MJEntityActionEntityExtended';
import { BaseEntity, EntityInfo } from '@memberjunction/core';

const DEAL_TYPES_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const SCOPE_RECORD_ID = 'CCCCCCCC-0000-0000-0000-000000000003';
const DEALS_ENTITY_ID = 'EEEEEEEE-0000-0000-0000-000000000005';

interface BindingSpec {
    Action: string;
    Sequence?: number | null;
    Entity?: string;
    EntityID?: string;
    Status?: string;
    ScopeEntityID?: string | null;
    ScopeRecordID?: string | null;
}

function bindingRow(spec: BindingSpec): MJEntityActionEntityExtended {
    return {
        Entity: spec.Entity ?? 'Deals',
        EntityID: spec.EntityID ?? DEALS_ENTITY_ID,
        Status: spec.Status ?? 'Active',
        ScopeEntityID: spec.ScopeEntityID ?? null,
        ScopeRecordID: spec.ScopeRecordID ?? null,
        ...spec
    } as unknown as MJEntityActionEntityExtended;
}

/**
 * A live engine instance with its cache pre-seeded. The engine's cached arrays are private and
 * normally filled by `Config()`; seeding them directly is what lets these tests exercise the pure
 * ordering/filtering logic without a database.
 */
function engineWith(bindings: MJEntityActionEntityExtended[]): EntityActionEngineBase {
    const engine = new EntityActionEngineBase();
    (engine as unknown as { _EntityActions: MJEntityActionEntityExtended[] })._EntityActions = bindings;
    return engine;
}

function dealRecord(dealTypeID: string | null): BaseEntity {
    return {
        EntityInfo: { Fields: [{ Name: 'DealTypeID', RelatedEntityID: DEAL_TYPES_ID }] } as unknown as EntityInfo,
        Get: (name: string) => (name === 'DealTypeID' ? dealTypeID : undefined)
    } as unknown as BaseEntity;
}

describe('EntityActionEngineBase — Sequence ordering', () => {
    it('returns bindings in ascending Sequence order', () => {
        const engine = engineWith([
            bindingRow({ Action: 'Notify', Sequence: 30 }),
            bindingRow({ Action: 'Normalize', Sequence: 10 }),
            bindingRow({ Action: 'Validate', Sequence: 20 })
        ]);
        expect(engine.GetActionsByEntityName('Deals').map(e => e.Action)).toEqual(['Normalize', 'Validate', 'Notify']);
    });

    it('breaks Sequence ties by Action name so the order is total and stable', () => {
        const engine = engineWith([
            bindingRow({ Action: 'Zulu', Sequence: 5 }),
            bindingRow({ Action: 'Alpha', Sequence: 5 }),
            bindingRow({ Action: 'Mike', Sequence: 5 })
        ]);
        expect(engine.GetActionsByEntityName('Deals').map(e => e.Action)).toEqual(['Alpha', 'Mike', 'Zulu']);
    });

    it('treats a null Sequence as 0, so unsequenced bindings run before deliberately-later ones', () => {
        const engine = engineWith([
            bindingRow({ Action: 'Later', Sequence: 100 }),
            bindingRow({ Action: 'Unsequenced', Sequence: null }),
            bindingRow({ Action: 'Explicit Zero', Sequence: 0 })
        ]);
        expect(engine.GetActionsByEntityName('Deals').map(e => e.Action)).toEqual([
            'Explicit Zero',
            'Unsequenced',
            'Later'
        ]);
    });

    it('supports negative Sequence for a binding that must run first', () => {
        const engine = engineWith([
            bindingRow({ Action: 'Default', Sequence: 0 }),
            bindingRow({ Action: 'Preflight', Sequence: -10 })
        ]);
        expect(engine.GetActionsByEntityName('Deals').map(e => e.Action)).toEqual(['Preflight', 'Default']);
    });

    it('does not mutate the cached array — ordering must not reorder the engine cache', () => {
        const cached = [bindingRow({ Action: 'B', Sequence: 2 }), bindingRow({ Action: 'A', Sequence: 1 })];
        const engine = engineWith(cached);
        engine.GetActionsByEntityName('Deals');
        expect(cached.map(e => e.Action)).toEqual(['B', 'A']);
    });

    it('orders GetActionsByEntityID the same way', () => {
        const engine = engineWith([
            bindingRow({ Action: 'Second', Sequence: 2 }),
            bindingRow({ Action: 'First', Sequence: 1 })
        ]);
        expect(engine.GetActionsByEntityID(DEALS_ENTITY_ID).map(e => e.Action)).toEqual(['First', 'Second']);
    });

    it('still honours the entity-name and status filters', () => {
        const engine = engineWith([
            bindingRow({ Action: 'OtherEntity', Sequence: 1, Entity: 'Contacts' }),
            bindingRow({ Action: 'Disabled', Sequence: 2, Status: 'Disabled' }),
            bindingRow({ Action: 'Active', Sequence: 3 })
        ]);
        expect(engine.GetActionsByEntityName('Deals', 'Active').map(e => e.Action)).toEqual(['Active']);
        // Entity name matching is case/whitespace-insensitive, as before.
        expect(engine.GetActionsByEntityName('  deals  ').map(e => e.Action)).toEqual([
            'Disabled',
            'Active'
        ]);
    });
});

describe('EntityActionEngineBase — FilterByScope', () => {
    beforeEach(() => {
        mockEntityByID.mockReset();
        mockEntityByID.mockImplementation((id: string) => (id === DEAL_TYPES_ID ? { Name: 'Deal Types' } : undefined));
    });

    it('keeps unscoped bindings and drops scoped ones the record falls outside of', async () => {
        const engine = engineWith([]);
        const bindings = [
            bindingRow({ Action: 'Applies To All', Sequence: 1 }),
            bindingRow({ Action: 'Scoped Match', Sequence: 2, ScopeEntityID: DEAL_TYPES_ID, ScopeRecordID: SCOPE_RECORD_ID }),
            bindingRow({ Action: 'Scoped Other', Sequence: 3, ScopeEntityID: DEAL_TYPES_ID, ScopeRecordID: 'a-different-type' })
        ];

        const kept = await engine.FilterByScope(bindings, dealRecord(SCOPE_RECORD_ID));
        expect(kept.map(e => e.Action)).toEqual(['Applies To All', 'Scoped Match']);
    });

    it('preserves the incoming Sequence ordering', async () => {
        const engine = engineWith([]);
        const bindings = engine.GetActionsByEntityName.call(
            engineWith([
                bindingRow({ Action: 'Third', Sequence: 3 }),
                bindingRow({ Action: 'First', Sequence: 1 }),
                bindingRow({ Action: 'Second', Sequence: 2 })
            ]),
            'Deals'
        );

        const kept = await engine.FilterByScope(bindings, dealRecord(SCOPE_RECORD_ID));
        expect(kept.map(e => e.Action)).toEqual(['First', 'Second', 'Third']);
    });

    it('drops every scoped binding when there is no subject record to evaluate', async () => {
        const engine = engineWith([]);
        const bindings = [
            bindingRow({ Action: 'Unscoped' }),
            bindingRow({ Action: 'Scoped', ScopeEntityID: DEAL_TYPES_ID, ScopeRecordID: SCOPE_RECORD_ID })
        ];
        const kept = await engine.FilterByScope(bindings, undefined);
        expect(kept.map(e => e.Action)).toEqual(['Unscoped']);
    });

    it('returns an empty array for an empty candidate set', async () => {
        await expect(engineWith([]).FilterByScope([], dealRecord(SCOPE_RECORD_ID))).resolves.toEqual([]);
    });
});
