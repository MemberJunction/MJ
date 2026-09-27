/**
 * IS-A load hints: knowing a record's subtype on load.
 *
 * A loaded disjoint parent finds its child with a discovery query across every child table, then
 * loads the child: two round trips on top of the record's own load. Now the entity's subtype rule
 * is asked first (an EntitySubtypeResolver that sets UseForLoadedRecords, or a SubtypeSelector
 * walked through BaseEngine caches), and the child's load, which happens anyway, checks the answer.
 * The discovery query runs only on a miss.
 *
 * The invariant every test holds: a hint may change the number of round trips, but never which
 * child is linked, and never whether the load succeeds.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import { EntityInfo } from '../generic/entityInfo';
import { EntitySubtypeResolver } from '../generic/entitySubtypeResolver';
import type { IEntityDataProvider } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import {
    ADMIN_ROLE_ID,
    BuildLoadHintEntities,
    FakeProductTypeEngine,
    InMemoryISAStore,
    LIMITED_ROLE_ID,
    LoadHintTestProvider,
    MakeLoadHintUser,
} from './mocks/ISALoadHintFixture';

// ─── Fixture data ──────────────────────────────────────────────────────────

const MEETING_TYPE_ID = 'a0000000-0000-0000-0000-000000000001';
const PUBLICATION_TYPE_ID = 'a0000000-0000-0000-0000-000000000002';
/** A type that names no extension entity: its products have no subtype. */
const PLAIN_TYPE_ID = 'a0000000-0000-0000-0000-000000000003';
/** A type that names an entity which is not a declared child of Products. */
const BOGUS_TYPE_ID = 'a0000000-0000-0000-0000-000000000004';
const COURSE_TYPE_ID = 'a0000000-0000-0000-0000-000000000005';
const ALL_TYPE_IDS = [MEETING_TYPE_ID, PUBLICATION_TYPE_ID, PLAIN_TYPE_ID, BOGUS_TYPE_ID, COURSE_TYPE_ID];

const PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';
const PARTY_ID = 'c0000000-0000-0000-0000-000000000001';

const SELECTOR = JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity' });

let adminUser: UserInfo;
let limitedUser: UserInfo;
let entities: EntityInfo[];
let store: InMemoryISAStore;
let provider: LoadHintTestProvider;
let typeEngine: FakeProductTypeEngine | null = null;

beforeAll(() => {
    adminUser = MakeLoadHintUser(ADMIN_ROLE_ID);
    limitedUser = MakeLoadHintUser(LIMITED_ROLE_ID);
});

beforeEach(() => {
    // Fresh metadata per test: EntityInfo memoizes its parsed SubtypeSelector.
    entities = BuildLoadHintEntities();
    store = new InMemoryISAStore();
    provider = new LoadHintTestProvider(entities, store, adminUser);
    Metadata.Provider = provider as unknown as ProviderBase;
    BaseEntity.Provider = provider.AsEntityDataProvider;

    store.Insert('Product Types', { ID: MEETING_TYPE_ID, Name: 'Meeting', ProductExtensionEntity: 'Meetings' });
    store.Insert('Product Types', { ID: PUBLICATION_TYPE_ID, Name: 'Publication', ProductExtensionEntity: 'Publications' });
    store.Insert('Product Types', { ID: PLAIN_TYPE_ID, Name: 'Plain', ProductExtensionEntity: null });
    store.Insert('Product Types', { ID: BOGUS_TYPE_ID, Name: 'Bogus', ProductExtensionEntity: 'Vendors' });
    store.Insert('Product Types', { ID: COURSE_TYPE_ID, Name: 'Course', ProductExtensionEntity: 'Courses' });
});

afterEach(() => {
    const cf = MJGlobal.Instance.ClassFactory as unknown as {
        _registrations: Array<{ BaseClass: unknown }>;
        _registrationCache: Map<string, unknown>;
    };
    cf._registrations = cf._registrations.filter(r => r.BaseClass !== EntitySubtypeResolver);
    cf._registrationCache.clear();
    if (typeEngine) {
        BaseEngineRegistry.Instance.UnregisterEngine(typeEngine);
        typeEngine = null;
    }
    BaseEntity.ClearSubtypeLookupCache();
    (BaseEntity as unknown as { _loggedSubtypeLoadHintProblems: Set<string> })._loggedSubtypeLoadHintProblems.clear();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
    BaseEntity.Provider = null as unknown as IEntityDataProvider;
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function entityInfo(name: string): EntityInfo {
    const info = provider.EntityByName(name);
    if (!info) throw new Error(`no ${name} in the fixture`);
    return info;
}

function insertProduct(typeID: string | null, id = PRODUCT_ID): void {
    store.Insert('Products', { ID: id, Name: `Product ${id}`, ProductTypeID: typeID });
}

function insertMeeting(id = PRODUCT_ID): void {
    store.Insert('Meetings', { ID: id, Venue: 'Hall A' });
}

/** Declares the Products selector. Its hop is served only while the type engine is loaded. */
function useSelector(): void {
    entityInfo('Products').SubtypeSelector = SELECTOR;
}

/** Loads every Product Type into a fake engine, as a loaded BaseEngine would hold them. */
async function cacheProductTypes(): Promise<void> {
    const types: BaseEntity[] = [];
    for (const id of ALL_TYPE_IDS) {
        const row = store.ViewRow(entityInfo('Product Types'), id);
        const type = await provider.GetEntityObject<BaseEntity>('Product Types', adminUser);
        await type.LoadFromData(row);
        types.push(type);
    }
    typeEngine = new FakeProductTypeEngine(types);
    BaseEngineRegistry.Instance.RegisterEngine(typeEngine);
}

/** Registers a resolver for Products that opts in to load hints and answers `answer`. */
function registerLoadResolver(answer: (record: BaseEntity) => string | null | Promise<string | null>): { Calls: number } {
    const calls = { Calls: 0 };
    class ProductsLoadResolver extends EntitySubtypeResolver {
        public override get UseForLoadedRecords(): boolean {
            return true;
        }
        public Resolve(record: BaseEntity): string | null | Promise<string | null> {
            calls.Calls++;
            return answer(record);
        }
    }
    MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, ProductsLoadResolver, 'Products');
    return calls;
}

async function loadProduct(user: UserInfo = adminUser): Promise<BaseEntity> {
    return provider.LoadRecord('Products', PRODUCT_ID, user);
}

/** Every console.error line so far, joined, for asserting on what LogError reported. */
function loggedErrors(spy: ReturnType<typeof vi.spyOn>): string {
    return spy.mock.calls.map(args => String(args[0])).join('\n');
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('IS-A load hints (BaseEntity.InitializeChildEntity)', () => {
    describe('without a rule, loads run as today', () => {
        it('probes for the subtype, then loads it: three round trips', async () => {
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual([
                'Load:Products',
                'FindISAChildEntity:Products',
                'Load:Meetings',
            ]);
        });

        it('still probes an entity with a single child: the create-time single-child default is not a load rule', async () => {
            insertProduct(COURSE_TYPE_ID);
            store.Insert('Courses', { ID: PRODUCT_ID, CreditHours: 3 });

            const course = await provider.LoadRecord('Courses', PRODUCT_ID);

            expect(course.ISAChild).toBeNull();
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual(['Load:Courses', 'FindISAChildEntity:Courses']);
        });
    });

    describe('a right hint', () => {
        it('from a SubtypeSelector read through a BaseEngine cache: two round trips, no probe', async () => {
            useSelector();
            await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual(['Load:Products', 'Load:Meetings']);
            const meeting = product.ISAChild;
            expect(meeting?.EntityInfo.Name).toBe('Meetings');
            expect(product.LeafEntity).toBe(meeting);
            expect(meeting?.ISAParent).toBe(product);
            expect(meeting?.Get('Venue')).toBe('Hall A');
            expect(meeting?.Get('Name')).toBe(`Product ${PRODUCT_ID}`);
        });

        it('from a resolver that opts in, answering synchronously', async () => {
            const resolver = registerLoadResolver(record => record.Get('ProductTypeID') === MEETING_TYPE_ID ? 'Meetings' : null);
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(resolver.Calls).toBe(1);
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(0);
            expect(provider.RoundTrips).toHaveLength(2);
        });

        it('from a resolver that opts in, answering asynchronously, in any letter case', async () => {
            registerLoadResolver(async () => ' meetings ');
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(0);
        });

        it('composes with deeper chains: the hinted child still discovers its own child', async () => {
            useSelector();
            await cacheProductTypes();
            insertProduct(COURSE_TYPE_ID);
            store.Insert('Courses', { ID: PRODUCT_ID, CreditHours: 3 });
            store.Insert('Webinars', { ID: PRODUCT_ID, PlatformURL: 'https://example.com/live' });

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Courses');
            expect(product.LeafEntity.EntityInfo.Name).toBe('Webinars');
            expect(product.LeafEntity.Get('PlatformURL')).toBe('https://example.com/live');
            // Courses has no rule of its own, so its child is found as today.
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual([
                'Load:Products',
                'Load:Courses',
                'FindISAChildEntity:Courses',
                'Load:Webinars',
            ]);
        });
    });

    describe('a wrong hint', () => {
        it('when the row is in another subtype: the miss runs the probe and links the real subtype', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            registerLoadResolver(() => 'Meetings');
            insertProduct(PUBLICATION_TYPE_ID);
            store.Insert('Publications', { ID: PRODUCT_ID, ISBN: '978-0' });

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Publications');
            expect(product.ISAChild?.Get('ISBN')).toBe('978-0');
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual([
                'Load:Products',
                'Load:Meetings',
                'FindISAChildEntity:Products',
                'Load:Publications',
            ]);
            expect(loggedErrors(errors)).toMatch(/names 'Meetings', but no 'Meetings' row loaded; its subtype row is in 'Publications'/);
        });

        it('when the record has no subtype row: the load still succeeds, with no child', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            registerLoadResolver(() => 'Meetings');
            insertProduct(MEETING_TYPE_ID);

            const product = await loadProduct();

            expect(product.IsSaved).toBe(true);
            expect(product.ISAChild).toBeNull();
            expect(product.LeafEntity).toBe(product);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(loggedErrors(errors)).toMatch(/names 'Meetings', but no 'Meetings' row loaded; it has no subtype row/);
        });

        it('when the hinted row exists but its load comes back empty: no second load, and the same outcome as without a hint', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();
            store.HideFromLoads('Meetings', PRODUCT_ID);

            const withoutHint = await loadProduct();
            expect(withoutHint.ISAChild).toBeNull();

            const resolver = registerLoadResolver(() => 'Meetings');
            provider.ResetRoundTrips();
            const withHint = await loadProduct();

            expect(resolver.Calls).toBe(1);
            expect(withHint.ISAChild).toBeNull();
            expect(provider.Count('Load', 'Meetings')).toBe(1);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
        });

        it('that names an entity which is not a declared IsA child: ignored, and logged once', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            useSelector();
            await cacheProductTypes();
            insertProduct(BOGUS_TYPE_ID);
            insertMeeting();

            const first = await loadProduct();
            const second = await loadProduct();

            expect(first.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(second.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('Load', 'Vendors')).toBe(0);
            expect(provider.Count('FindISAChildEntity')).toBe(2);
            const reports = loggedErrors(errors).match(/named 'Vendors', which is not a declared IsA child entity of 'Products'/g);
            expect(reports).toHaveLength(1);
        });
    });

    describe('a null hint ("no subtype") loads as today', () => {
        it('from a resolver: the probe still runs, and finds a subtype row an older record kept', async () => {
            const resolver = registerLoadResolver(() => null);
            insertProduct(PLAIN_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(resolver.Calls).toBe(1);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
        });

        it('from a selector whose type names no extension entity', async () => {
            useSelector();
            await cacheProductTypes();
            insertProduct(PLAIN_TYPE_ID);

            const product = await loadProduct();

            expect(product.ISAChild).toBeNull();
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual(['Load:Products', 'FindISAChildEntity:Products']);
        });

        it('from a selector whose foreign key is empty', async () => {
            useSelector();
            await cacheProductTypes();
            insertProduct(null);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(1);
        });
    });

    describe('a failing resolver', () => {
        it('that throws: the load succeeds as today, and the failure is logged', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            registerLoadResolver(() => {
                throw new Error('type cache not configured');
            });
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(loggedErrors(errors)).toMatch(/EntitySubtypeResolver for 'Products' failed on record ID=.*type cache not configured/);
        });

        it('that rejects: the load succeeds as today, and the failure is logged', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            registerLoadResolver(() => Promise.reject(new Error('lookup timed out')));
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(loggedErrors(errors)).toMatch(/lookup timed out/);
        });

        it('that has not opted in is never asked on load, and the selector is not consulted in its place', async () => {
            let calls = 0;
            class CreateTimeOnlyResolver extends EntitySubtypeResolver {
                public Resolve(): string {
                    calls++;
                    return 'Meetings';
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, CreateTimeOnlyResolver, 'Products');
            useSelector();
            await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(calls).toBe(0);
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual([
                'Load:Products',
                'FindISAChildEntity:Products',
                'Load:Meetings',
            ]);
        });
    });

    describe('a selector hop missing from the cache', () => {
        it('gives no hint and costs no query: the record loads as today', async () => {
            useSelector();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('Load', 'Product Types')).toBe(0);
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual([
                'Load:Products',
                'FindISAChildEntity:Products',
                'Load:Meetings',
            ]);
        });

        it('when a loaded engine caches the entity but not this row', async () => {
            useSelector();
            await cacheProductTypes();
            const unknownTypeID = 'a0000000-0000-0000-0000-0000000000ff';
            store.Insert('Product Types', { ID: unknownTypeID, Name: 'New', ProductExtensionEntity: 'Meetings' });
            insertProduct(unknownTypeID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('Load', 'Product Types')).toBe(0);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
        });

        it('matches the cached row whatever the key\'s letter case', async () => {
            useSelector();
            await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID.toUpperCase());
            insertMeeting();

            await loadProduct();

            expect(provider.Count('FindISAChildEntity')).toBe(0);
        });

        it('a selector path that does not fit the metadata gives no hint, and is logged once', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            entityInfo('Products').SubtypeSelector = JSON.stringify({ Path: 'NoSuchColumnID.ProductExtensionEntity' });
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const first = await loadProduct();
            await loadProduct();

            expect(first.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(2);
            expect(loggedErrors(errors).match(/field 'NoSuchColumnID' was not found/g)).toHaveLength(1);
        });
    });

    describe('overlapping parents load as today', () => {
        it('never ask the rule, and list every subtype with one probe', async () => {
            let calls = 0;
            class PartiesLoadResolver extends EntitySubtypeResolver {
                public override get UseForLoadedRecords(): boolean {
                    return true;
                }
                public Resolve(): string {
                    calls++;
                    return 'Customers';
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, PartiesLoadResolver, 'Parties');
            store.Insert('Parties', { ID: PARTY_ID, Name: 'Acme' });
            store.Insert('Customers', { ID: PARTY_ID, CreditLimit: 1000 });
            store.Insert('Vendors', { ID: PARTY_ID, PaymentTerms: 'Net 30' });

            const party = await provider.LoadRecord('Parties', PARTY_ID);

            expect(calls).toBe(0);
            expect(party.ISAChildren).toEqual([{ entityName: 'Customers' }, { entityName: 'Vendors' }]);
            expect(provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`)).toEqual([
                'Load:Parties',
                'FindISAChildEntities:Parties',
            ]);
        });
    });

    describe('a user who can\'t read the child', () => {
        it('never loads the hinted child, and a record without one loads as today', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const resolver = registerLoadResolver(() => 'Meetings');
            insertProduct(MEETING_TYPE_ID);

            const product = await loadProduct(limitedUser);

            expect(resolver.Calls).toBe(1);
            expect(product.IsSaved).toBe(true);
            expect(product.ISAChild).toBeNull();
            expect(provider.Count('Load', 'Meetings')).toBe(0);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            // Skipped up front on the permission check, not attempted and caught.
            expect(loggedErrors(errors)).not.toMatch(/IS-A load hint/);
        });

        it('gets the same refusal with a hint as without one, from the discovery path', async () => {
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            await expect(loadProduct(limitedUser)).rejects.toThrow(/Does NOT have permission to Read Meetings/);

            const resolver = registerLoadResolver(() => 'Meetings');
            provider.ResetRoundTrips();
            await expect(loadProduct(limitedUser)).rejects.toThrow(/Does NOT have permission to Read Meetings/);
            expect(resolver.Calls).toBe(1);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(provider.Count('Load', 'Meetings')).toBe(0);
        });
    });

    describe('the create path is unchanged', () => {
        it('ResolveSubtypeEntityName reads a cached hop without a query', async () => {
            useSelector();
            await cacheProductTypes();
            const product = await provider.GetEntityObject<BaseEntity>('Products', adminUser);
            product.Set('ProductTypeID', PUBLICATION_TYPE_ID);

            expect(await product.ResolveSubtypeEntityName()).toBe('Publications');
            expect(provider.Count('Load')).toBe(0);
        });

        it('ResolveSubtypeEntityName still queries a hop that is not cached', async () => {
            useSelector();
            const product = await provider.GetEntityObject<BaseEntity>('Products', adminUser);
            product.Set('ProductTypeID', PUBLICATION_TYPE_ID);

            expect(await product.ResolveSubtypeEntityName()).toBe('Publications');
            expect(provider.Count('Load', 'Product Types')).toBe(1);
        });
    });
});
