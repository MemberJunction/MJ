/**
 * IS-A parents keep their view-only virtual fields (joined display names) when a child links (#4403).
 *
 * A generated child view joins its ancestors' base tables, so it carries their stored columns but
 * not their view-only virtual fields. Loading a parent that has a child reads the parent's own view
 * row, then the child's row, which hydrates the whole chain again. The second hydration must not
 * reset the parent's joined names to null.
 *
 *   Products        ProductTypeID → Product Types; ProductType is the joined type name
 *     └── Events    IS-A Products; Organizer is a joined name on Events' own view
 *           └── Conferences   IS-A Events
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import type { IEntityDataProvider } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import {
    ADMIN_ROLE_ID,
    EntitySpec,
    InMemoryISAStore,
    LoadHintTestProvider,
    MakeLoadHintEntity,
    MakeLoadHintUser,
} from './mocks/ISALoadHintFixture';

const PRODUCT_TYPES_ID = 'vf-entity-product-types';
const PRODUCTS_ID = 'vf-entity-products';
const EVENTS_ID = 'vf-entity-events';
const CONFERENCES_ID = 'vf-entity-conferences';

const ID_FIELD = { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true };

const SPECS: EntitySpec[] = [
    {
        ID: PRODUCT_TYPES_ID, Name: 'Product Types', BaseTable: 'ProductType',
        Fields: [ID_FIELD, { Name: 'Name', Type: 'nvarchar', Length: 100 }],
    },
    {
        ID: PRODUCTS_ID, Name: 'Products', BaseTable: 'Product',
        Fields: [
            ID_FIELD,
            { Name: 'Name', Type: 'nvarchar', Length: 255 },
            { Name: 'ProductTypeID', Type: 'uniqueidentifier', References: { ID: PRODUCT_TYPES_ID, Name: 'Product Types' } },
            { Name: 'ProductType', Type: 'nvarchar', Length: 100, IsVirtual: true },
        ],
    },
    {
        ID: EVENTS_ID, Name: 'Events', BaseTable: 'Event', ParentID: PRODUCTS_ID,
        Fields: [
            ID_FIELD,
            { Name: 'Venue', Type: 'nvarchar', Length: 255 },
            { Name: 'Organizer', Type: 'nvarchar', Length: 255, IsVirtual: true },
        ],
    },
    {
        ID: CONFERENCES_ID, Name: 'Conferences', BaseTable: 'Conference', ParentID: EVENTS_ID,
        Fields: [ID_FIELD, { Name: 'TrackCount', Type: 'int' }],
    },
];

const TYPE_ID = 'd0000000-0000-0000-0000-000000000001';
const PRODUCT_ID = 'e0000000-0000-0000-0000-000000000001';

let adminUser: UserInfo;
let store: InMemoryISAStore;
let provider: LoadHintTestProvider;

beforeAll(() => {
    adminUser = MakeLoadHintUser(ADMIN_ROLE_ID);
});

beforeEach(() => {
    const entities = SPECS.map(spec => new EntityInfo(MakeLoadHintEntity(spec)));
    store = new InMemoryISAStore();
    provider = new LoadHintTestProvider(entities, store, adminUser);
    Metadata.Provider = provider as unknown as ProviderBase;
    BaseEntity.Provider = provider.AsEntityDataProvider;

    store.Insert('Product Types', { ID: TYPE_ID, Name: 'Event' });
    store.Insert('Products', { ID: PRODUCT_ID, Name: 'Annual Meeting', ProductTypeID: TYPE_ID });
    store.InsertViewColumns('Products', PRODUCT_ID, { ProductType: 'Event' });
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
    BaseEntity.Provider = null as unknown as IEntityDataProvider;
});

function insertEvent(): void {
    store.Insert('Events', { ID: PRODUCT_ID, Venue: 'Hall A' });
    store.InsertViewColumns('Events', PRODUCT_ID, { Organizer: 'Events Team' });
}

describe('IS-A parent virtual fields when a child links (#4403)', () => {
    it('keeps a joined name the child row does not carry, loaded and clean', async () => {
        insertEvent();

        const product = await provider.LoadRecord('Products', PRODUCT_ID);

        expect(product.ISAChild?.EntityInfo.Name).toBe('Events');
        expect(product.Get('ProductType')).toBe('Event');
        const field = product.GetFieldByName('ProductType');
        expect(field?.NotLoaded).toBe(false);
        expect(field?.Dirty).toBe(false);
        expect(product.Dirty).toBe(false);
    });

    it('still takes the values the child row does carry', async () => {
        insertEvent();

        const product = await provider.LoadRecord('Products', PRODUCT_ID);

        expect(product.Get('Name')).toBe('Annual Meeting');
        expect(product.Get('ProductTypeID')).toBe(TYPE_ID);
        expect(product.ISAChild?.Get('Venue')).toBe('Hall A');
    });

    it('a record without a child loads its joined name as before', async () => {
        const product = await provider.LoadRecord('Products', PRODUCT_ID);

        expect(product.ISAChild).toBeNull();
        expect(product.Get('ProductType')).toBe('Event');
    });

    it('keeps joined names at every level of a three-level chain', async () => {
        insertEvent();
        store.Insert('Conferences', { ID: PRODUCT_ID, TrackCount: 4 });

        const product = await provider.LoadRecord('Products', PRODUCT_ID);
        const event = product.ISAChild;

        expect(event?.EntityInfo.Name).toBe('Events');
        expect(event?.ISAChild?.EntityInfo.Name).toBe('Conferences');
        expect(product.Get('ProductType')).toBe('Event');
        expect(event?.Get('Organizer')).toBe('Events Team');
        expect(event?.ISAChild?.Get('TrackCount')).toBe(4);
        expect(product.Dirty).toBe(false);
    });

    it('keeps the joined name when EnsureISAChild links a saved record to its child', async () => {
        const product = await provider.LoadRecord('Products', PRODUCT_ID);
        insertEvent();

        const event = await product.EnsureISAChild('Events');

        expect(event?.Get('Venue')).toBe('Hall A');
        expect(product.Get('ProductType')).toBe('Event');
        expect(product.GetFieldByName('ProductType')?.NotLoaded).toBe(false);
    });

    it('re-applies an unsaved edit on top of the restored values', async () => {
        const product = await provider.LoadRecord('Products', PRODUCT_ID);
        product.Set('Name', 'Renamed');
        insertEvent();

        const event = await product.EnsureISAChild('Events');

        expect(event?.Get('Venue')).toBe('Hall A');
        expect(product.Get('Name')).toBe('Renamed');
        expect(product.GetFieldByName('Name')?.Dirty).toBe(true);
        expect(product.Get('ProductType')).toBe('Event');
        expect(product.GetFieldByName('ProductType')?.Dirty).toBe(false);
    });
});
