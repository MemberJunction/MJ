/**
 * IS-A load hints: knowing a record's subtype on load.
 *
 * A loaded disjoint parent finds its child with a discovery query across every child table, then
 * loads the child: two round trips on top of the record's own load. An entity can opt in to asking
 * its subtype rule first: an EntitySubtypeResolver whose class overrides ResolveLoadHint, or a
 * SubtypeSelector that sets UseForLoadedRecords and is walked through BaseEngine caches. The child's
 * load, which happens anyway, checks the answer, and the discovery query runs only on a miss.
 *
 * The invariant these tests hold, for well-formed data: a hint may change the number of round
 * trips, but not which child is linked, and not whether the load succeeds. Three benign exceptions,
 * each pinned below:
 * - a failure reading the hinted child's row falls back to the discovery query, so a transient
 *   failure now recovers (a lasting one reads the row twice, then fails as before);
 * - when the data breaks the disjoint rule with two child rows, the discovery query links either
 *   one, where a hint links the one the rule names;
 * - a provider without FindISAChildEntity links nothing without a hint, and the hinted child with one.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { MJGlobal, NormalizeUUID } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import { CompositeKey } from '../generic/compositeKey';
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
/** In this order: the engine cache index tests move rows around by position. */
const ALL_TYPE_IDS = [MEETING_TYPE_ID, PUBLICATION_TYPE_ID, PLAIN_TYPE_ID, BOGUS_TYPE_ID, COURSE_TYPE_ID];

const PRODUCT_ID = 'b0000000-0000-0000-0000-000000000001';
const OTHER_PRODUCT_ID = 'b0000000-0000-0000-0000-000000000002';
const PARTY_ID = 'c0000000-0000-0000-0000-000000000001';

/** A selector that opts in to load hints. */
const SELECTOR = JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity', UseForLoadedRecords: true });
/** The same selector without the opt-in: asked when a record is created, never when one is loaded. */
const CREATE_ONLY_SELECTOR = JSON.stringify({ Path: 'ProductTypeID.ProductExtensionEntity' });

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
function useSelector(selector: string = SELECTOR): void {
    entityInfo('Products').SubtypeSelector = selector;
}

/** A Product Type row loaded as an entity object, as a loaded BaseEngine holds it. */
async function loadedProductType(id: string): Promise<BaseEntity> {
    const type = await provider.GetEntityObject<BaseEntity>('Product Types', adminUser);
    await type.LoadFromData(store.ViewRow(entityInfo('Product Types'), id));
    return type;
}

/** Loads every Product Type into a fake engine, as a loaded BaseEngine would hold them. */
async function cacheProductTypes(): Promise<FakeProductTypeEngine> {
    const types: BaseEntity[] = [];
    for (const id of ALL_TYPE_IDS) {
        types.push(await loadedProductType(id));
    }
    const engine = new FakeProductTypeEngine(types);
    typeEngine = engine;
    BaseEngineRegistry.Instance.RegisterEngine(engine);
    return engine;
}

interface ResolverCalls {
    Constructed: number;
    Resolve: number;
    ResolveLoadHint: number;
}

/** Registers a resolver for Products that gives load hints by overriding ResolveLoadHint. */
function registerLoadHintResolver(answer: (record: BaseEntity) => string | null | Promise<string | null>): ResolverCalls {
    const calls: ResolverCalls = { Constructed: 0, Resolve: 0, ResolveLoadHint: 0 };
    class ProductsLoadHintResolver extends EntitySubtypeResolver {
        constructor() {
            super();
            calls.Constructed++;
        }
        public Resolve(): string | null {
            calls.Resolve++;
            return null;
        }
        public override ResolveLoadHint(record: BaseEntity): string | null | Promise<string | null> {
            calls.ResolveLoadHint++;
            return answer(record);
        }
    }
    MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, ProductsLoadHintResolver, 'Products');
    return calls;
}

async function loadProduct(user: UserInfo = adminUser, id = PRODUCT_ID): Promise<BaseEntity> {
    return provider.LoadRecord('Products', id, user);
}

/** The round trips so far, as `Kind:Entity`. */
function trips(): string[] {
    return provider.RoundTrips.map(r => `${r.Kind}:${r.EntityName}`);
}

function spyOnErrors(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

/** Every console.error line so far, joined, for asserting on what LogError reported. */
function loggedErrors(spy: ReturnType<typeof vi.spyOn>): string {
    return spy.mock.calls.map(args => String(args[0])).join('\n');
}

/**
 * A type cache warmed by an async `Config()`, the way a BaseEngine is, for a resolver that reads
 * it. Reads the fixture's store.
 */
class ProductTypeCache {
    public Loaded = false;
    private readonly extensions = new Map<string, string | null>();

    public async Config(): Promise<void> {
        if (this.Loaded) return;
        for (const id of ALL_TYPE_IDS) {
            const extension = store.ViewRow(entityInfo('Product Types'), id)?.['ProductExtensionEntity'];
            this.extensions.set(NormalizeUUID(id), typeof extension === 'string' ? extension : null);
        }
        this.Loaded = true;
    }

    public ExtensionOf(typeID: unknown): string | null {
        return this.extensions.get(NormalizeUUID(String(typeID))) ?? null;
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('IS-A load hints (BaseEntity.InitializeChildEntity)', () => {
    describe('without a rule that opts in, loads run as today', () => {
        it('probes for the subtype, then loads it: three round trips', async () => {
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(trips()).toEqual(['Load:Products', 'FindISAChildEntity:Products', 'Load:Meetings']);
        });

        it('still probes an entity with a single child: the create-time single-child default is not a load rule', async () => {
            insertProduct(COURSE_TYPE_ID);
            store.Insert('Courses', { ID: PRODUCT_ID, CreditHours: 3 });

            const course = await provider.LoadRecord('Courses', PRODUCT_ID);

            expect(course.ISAChild).toBeNull();
            expect(trips()).toEqual(['Load:Courses', 'FindISAChildEntity:Courses']);
        });

        it('a SubtypeSelector without UseForLoadedRecords is not asked on load, even with its hop cached', async () => {
            useSelector(CREATE_ONLY_SELECTOR);
            await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(trips()).toEqual(['Load:Products', 'FindISAChildEntity:Products', 'Load:Meetings']);
        });
    });

    describe('a right hint', () => {
        it('from a SubtypeSelector that sets UseForLoadedRecords, read through a BaseEngine cache: two round trips, no probe', async () => {
            useSelector();
            await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(trips()).toEqual(['Load:Products', 'Load:Meetings']);
            const meeting = product.ISAChild;
            expect(meeting?.EntityInfo.Name).toBe('Meetings');
            expect(product.LeafEntity).toBe(meeting);
            expect(meeting?.ISAParent).toBe(product);
            expect(meeting?.Get('Venue')).toBe('Hall A');
            expect(meeting?.Get('Name')).toBe(`Product ${PRODUCT_ID}`);
        });

        it('from a resolver that overrides ResolveLoadHint, answering synchronously; Resolve is not asked on load', async () => {
            const resolver = registerLoadHintResolver(record => record.Get('ProductTypeID') === MEETING_TYPE_ID ? 'Meetings' : null);
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(resolver.ResolveLoadHint).toBe(1);
            expect(resolver.Resolve).toBe(0);
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(trips()).toEqual(['Load:Products', 'Load:Meetings']);
        });

        it('from a resolver that overrides ResolveLoadHint, answering asynchronously, in any letter case', async () => {
            registerLoadHintResolver(async () => ' meetings ');
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
            expect(trips()).toEqual(['Load:Products', 'Load:Courses', 'FindISAChildEntity:Courses', 'Load:Webinars']);
        });
    });

    describe('a wrong hint', () => {
        it('when the row is in another subtype: the probe links the real subtype, and the disagreement is logged once per pair of subtypes', async () => {
            const errors = spyOnErrors();
            registerLoadHintResolver(() => 'Meetings');
            insertProduct(PUBLICATION_TYPE_ID);
            store.Insert('Publications', { ID: PRODUCT_ID, ISBN: '978-0' });

            const product = await loadProduct();
            await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Publications');
            expect(product.ISAChild?.Get('ISBN')).toBe('978-0');
            expect(trips().slice(0, 4)).toEqual([
                'Load:Products',
                'Load:Meetings',
                'FindISAChildEntity:Products',
                'Load:Publications',
            ]);
            const reports = loggedErrors(errors).match(/names 'Meetings', but its subtype row is in 'Publications'\. The rule and the data disagree/g);
            expect(reports).toHaveLength(1);
            // The hinted load that came back empty is an answer, not an error.
            expect(loggedErrors(errors)).not.toMatch(/Error in BaseEntity\.Load\(Meetings/);
        });

        it('when the record has no subtype row: the load succeeds with no child, and nothing is logged as an error', async () => {
            const errors = spyOnErrors();
            registerLoadHintResolver(() => 'Meetings');
            insertProduct(MEETING_TYPE_ID);

            const product = await loadProduct();

            expect(product.IsSaved).toBe(true);
            expect(product.ISAChild).toBeNull();
            expect(product.LeafEntity).toBe(product);
            expect(trips()).toEqual(['Load:Products', 'Load:Meetings', 'FindISAChildEntity:Products']);
            expect(errors).not.toHaveBeenCalled();
        });

        it('when the record has no subtype row: one verbose line per entity and hinted child, with verbose logging on', async () => {
            spyOnErrors();
            const lines = vi.spyOn(console, 'log').mockImplementation(() => undefined);
            const previousVerbose = process.env.MJ_VERBOSE;
            process.env.MJ_VERBOSE = 'true';
            try {
                registerLoadHintResolver(() => 'Meetings');
                insertProduct(MEETING_TYPE_ID);
                insertProduct(MEETING_TYPE_ID, OTHER_PRODUCT_ID);

                await loadProduct();
                await loadProduct(adminUser, OTHER_PRODUCT_ID);
            }
            finally {
                if (previousVerbose === undefined) {
                    delete process.env.MJ_VERBOSE;
                }
                else {
                    process.env.MJ_VERBOSE = previousVerbose;
                }
            }

            const notes = lines.mock.calls.map(args => String(args[0])).filter(line => line.includes('has no subtype row'));
            expect(notes).toHaveLength(1);
            expect(notes[0]).toMatch(/a 'Products' record whose subtype rule names 'Meetings' has no subtype row/);
        });

        it('when the hinted row exists but its load comes back empty: no second load, and the same outcome and log as without a hint', async () => {
            const errors = spyOnErrors();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();
            store.HideFromLoads('Meetings', PRODUCT_ID);

            const withoutHint = await loadProduct();
            expect(withoutHint.ISAChild).toBeNull();
            const errorsWithoutHint = loggedErrors(errors);

            const resolver = registerLoadHintResolver(() => 'Meetings');
            provider.ResetRoundTrips();
            errors.mockClear();
            const withHint = await loadProduct();

            expect(resolver.ResolveLoadHint).toBe(1);
            expect(withHint.ISAChild).toBeNull();
            expect(provider.Count('Load', 'Meetings')).toBe(1);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(errorsWithoutHint).toMatch(/Error in BaseEntity\.Load\(Meetings/);
            expect(loggedErrors(errors)).toBe(errorsWithoutHint);
        });

        it('that names an entity which is not a declared IsA child: ignored, and logged once', async () => {
            const errors = spyOnErrors();
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
            const resolver = registerLoadHintResolver(() => null);
            insertProduct(PLAIN_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();

            expect(resolver.ResolveLoadHint).toBe(1);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
        });

        it('from a selector whose type names no extension entity', async () => {
            useSelector();
            await cacheProductTypes();
            insertProduct(PLAIN_TYPE_ID);

            const product = await loadProduct();

            expect(product.ISAChild).toBeNull();
            expect(trips()).toEqual(['Load:Products', 'FindISAChildEntity:Products']);
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

    describe('a registered resolver', () => {
        it('that throws from ResolveLoadHint: records load as today, and the failure is logged once per entity', async () => {
            const errors = spyOnErrors();
            registerLoadHintResolver(() => {
                throw new Error('type cache not configured');
            });
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();
            await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(2);
            const reports = loggedErrors(errors).match(/ResolveLoadHint for 'Products' failed on record ID=.*type cache not configured/g);
            expect(reports).toHaveLength(1);
        });

        it('that rejects from ResolveLoadHint: records load as today, and the failure is logged once per entity', async () => {
            const errors = spyOnErrors();
            registerLoadHintResolver(() => Promise.reject(new Error('lookup timed out')));
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();
            await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(2);
            expect(loggedErrors(errors).match(/lookup timed out/g)).toHaveLength(1);
        });

        it('that does not override ResolveLoadHint is never constructed on load, and the selector is not consulted in its place', async () => {
            let constructed = 0;
            let resolveCalls = 0;
            class CreateTimeOnlyResolver extends EntitySubtypeResolver {
                constructor() {
                    super();
                    constructed++;
                }
                public Resolve(): string {
                    resolveCalls++;
                    return 'Meetings';
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, CreateTimeOnlyResolver, 'Products');
            useSelector();
            await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();
            await loadProduct();

            expect(constructed).toBe(0);
            expect(resolveCalls).toBe(0);
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(trips().slice(0, 3)).toEqual(['Load:Products', 'FindISAChildEntity:Products', 'Load:Meetings']);
        });

        it('that overrides ResolveLoadHint is constructed once per entity, not once per record', async () => {
            const resolver = registerLoadHintResolver(() => 'Meetings');
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();
            insertProduct(MEETING_TYPE_ID, OTHER_PRODUCT_ID);
            insertMeeting(OTHER_PRODUCT_ID);

            await loadProduct();
            await loadProduct(adminUser, OTHER_PRODUCT_ID);
            await loadProduct();

            expect(resolver.Constructed).toBe(1);
            expect(resolver.ResolveLoadHint).toBe(3);
            expect(provider.Count('FindISAChildEntity')).toBe(0);
        });

        it('whose constructor throws: records load as today, and the failure is logged once per entity', async () => {
            const errors = spyOnErrors();
            let attempts = 0;
            class ServerOnlyResolver extends EntitySubtypeResolver {
                constructor() {
                    super();
                    attempts++;
                    throw new Error('needs server context');
                }
                public Resolve(): string | null {
                    return null;
                }
                public override ResolveLoadHint(): string | null {
                    return 'Meetings';
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, ServerOnlyResolver, 'Products');
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const product = await loadProduct();
            await loadProduct();

            expect(attempts).toBe(1);
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(2);
            const reports = loggedErrors(errors).match(/constructing the EntitySubtypeResolver registered for 'Products' failed \(needs server context\)/g);
            expect(reports).toHaveLength(1);
        });

        it('answers creation and loading separately: Resolve awaits a cold cache, ResolveLoadHint gives no hint until it is warm', async () => {
            const typeCache = new ProductTypeCache();
            class CachedTypesResolver extends EntitySubtypeResolver {
                public async Resolve(record: BaseEntity): Promise<string | null> {
                    await typeCache.Config();
                    return typeCache.ExtensionOf(record.Get('ProductTypeID'));
                }
                public override ResolveLoadHint(record: BaseEntity): string | null {
                    return typeCache.Loaded ? typeCache.ExtensionOf(record.Get('ProductTypeID')) : null;
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, CachedTypesResolver, 'Products');
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            // Loaded while the cache is cold: no hint, so the discovery query decides.
            const cold = await loadProduct();
            expect(cold.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(trips()).toEqual(['Load:Products', 'FindISAChildEntity:Products', 'Load:Meetings']);

            // Created: Resolve warms the cache, so the new record gets its subtype.
            const created = await provider.GetEntityObject<BaseEntity>('Products', adminUser);
            created.Set('ProductTypeID', MEETING_TYPE_ID);
            const child = await created.EnsureISAChild();
            expect(child?.EntityInfo.Name).toBe('Meetings');

            // Loaded once the cache is warm: the hint skips the probe.
            provider.ResetRoundTrips();
            const warm = await loadProduct();
            expect(warm.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(trips()).toEqual(['Load:Products', 'Load:Meetings']);
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
            expect(trips()).toEqual(['Load:Products', 'FindISAChildEntity:Products', 'Load:Meetings']);
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
            const errors = spyOnErrors();
            useSelector(JSON.stringify({ Path: 'NoSuchColumnID.ProductExtensionEntity', UseForLoadedRecords: true }));
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const first = await loadProduct();
            await loadProduct();

            expect(first.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('FindISAChildEntity')).toBe(2);
            expect(loggedErrors(errors).match(/field 'NoSuchColumnID' was not found/g)).toHaveLength(1);
        });
    });

    describe('the index over the engine\'s cached rows', () => {
        /** Declares the selector, caches the types, and warms the index with one hinted load. */
        async function warmIndex(): Promise<BaseEntity[]> {
            useSelector();
            const engine = await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();
            await loadProduct();
            expect(trips()).toEqual(['Load:Products', 'Load:Meetings']);
            provider.ResetRoundTrips();
            return engine.ProductTypes;
        }

        function insertPublication(typeID: string): void {
            insertProduct(typeID, OTHER_PRODUCT_ID);
            store.Insert('Publications', { ID: OTHER_PRODUCT_ID, ISBN: '978-1' });
        }

        it('finds a row the engine pushes onto its cached array in place', async () => {
            const cachedTypes = await warmIndex();
            const seminarTypeID = 'a0000000-0000-0000-0000-0000000000aa';
            store.Insert('Product Types', { ID: seminarTypeID, Name: 'Seminar', ProductExtensionEntity: 'Publications' });
            cachedTypes.push(await loadedProductType(seminarTypeID));
            insertPublication(seminarTypeID);

            const other = await loadProduct(adminUser, OTHER_PRODUCT_ID);

            expect(other.ISAChild?.EntityInfo.Name).toBe('Publications');
            expect(trips()).toEqual(['Load:Products', 'Load:Publications']);
        });

        it('stops finding a row the engine splices out of its cached array in place', async () => {
            const cachedTypes = await warmIndex();
            cachedTypes.splice(ALL_TYPE_IDS.indexOf(PUBLICATION_TYPE_ID), 1);
            insertPublication(PUBLICATION_TYPE_ID);

            const other = await loadProduct(adminUser, OTHER_PRODUCT_ID);

            expect(other.ISAChild?.EntityInfo.Name).toBe('Publications');
            expect(trips()).toEqual(['Load:Products', 'FindISAChildEntity:Products', 'Load:Publications']);
        });

        it('finds a row added after another was removed, with the array back at its old length', async () => {
            const cachedTypes = await warmIndex();
            cachedTypes.splice(ALL_TYPE_IDS.indexOf(PLAIN_TYPE_ID), 1);
            const seminarTypeID = 'a0000000-0000-0000-0000-0000000000aa';
            store.Insert('Product Types', { ID: seminarTypeID, Name: 'Seminar', ProductExtensionEntity: 'Publications' });
            cachedTypes.push(await loadedProductType(seminarTypeID));
            expect(cachedTypes).toHaveLength(ALL_TYPE_IDS.length);
            insertPublication(seminarTypeID);

            const other = await loadProduct(adminUser, OTHER_PRODUCT_ID);

            expect(other.ISAChild?.EntityInfo.Name).toBe('Publications');
            expect(trips()).toEqual(['Load:Products', 'Load:Publications']);
        });

        it('re-checks each hit, so rows that swap places are still found by their own keys', async () => {
            const errors = spyOnErrors();
            const cachedTypes = await warmIndex();
            // Same length, same last row: only the positions of the first two rows change.
            [cachedTypes[0], cachedTypes[1]] = [cachedTypes[1], cachedTypes[0]];
            insertPublication(PUBLICATION_TYPE_ID);

            const other = await loadProduct(adminUser, OTHER_PRODUCT_ID);
            const product = await loadProduct();

            expect(other.ISAChild?.EntityInfo.Name).toBe('Publications');
            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(trips()).toEqual(['Load:Products', 'Load:Publications', 'Load:Products', 'Load:Meetings']);
            expect(errors).not.toHaveBeenCalled();
        });
    });

    describe('promotion (AttachToParent)', () => {
        it('does not ask the parent\'s rule, since the child row being added does not exist yet: round trips and logs as today', async () => {
            const errors = spyOnErrors();
            useSelector();
            await cacheProductTypes();
            insertProduct(MEETING_TYPE_ID);
            const meeting = await provider.GetEntityObject<BaseEntity>('Meetings', adminUser);
            provider.ResetRoundTrips();

            expect(await meeting.AttachToParent(CompositeKey.FromID(PRODUCT_ID))).toBe(true);

            expect(trips()).toEqual(['Load:Products', 'FindISAChildEntity:Products']);
            expect(meeting.Get('ID')).toBe(PRODUCT_ID);
            expect(errors).not.toHaveBeenCalled();
        });
    });

    describe('reading the hinted row fails', () => {
        it('a transient failure falls back to the discovery query, which reads the row again', async () => {
            const errors = spyOnErrors();
            registerLoadHintResolver(() => 'Meetings');
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();
            provider.FailLoads('Meetings', 1, new Error('socket hang up'));

            const product = await loadProduct();

            expect(product.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(product.ISAChild?.Get('Venue')).toBe('Hall A');
            expect(trips()).toEqual(['Load:Products', 'Load:Meetings', 'FindISAChildEntity:Products', 'Load:Meetings']);
            expect(loggedErrors(errors)).toMatch(/reading the 'Meetings' row for 'Products' record ID=.* failed \(socket hang up\); finding the subtype with the discovery query instead/);
        });

        it('a lasting failure reads the row twice, then fails the load as it does without a hint', async () => {
            spyOnErrors();
            registerLoadHintResolver(() => 'Meetings');
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();
            provider.FailLoads('Meetings', 2, new Error('socket hang up'));

            await expect(loadProduct()).rejects.toThrow('socket hang up');
            expect(trips()).toEqual(['Load:Products', 'Load:Meetings', 'FindISAChildEntity:Products', 'Load:Meetings']);
        });

        it('keeps the parent\'s unsaved values, as the discovery-only path does', async () => {
            spyOnErrors();
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            /**
             * Loads the product holding a value its row doesn't: an unsaved edit at the moment its
             * subtype is found. The child's load re-reads the parent from the child's row, and the
             * edit must survive it.
             */
            async function loadWithUnsavedName(): Promise<BaseEntity> {
                const product = await provider.GetEntityObject<BaseEntity>('Products', adminUser);
                product.Set('Name', 'Before');
                await product.LoadFromData({ ...store.ViewRow(entityInfo('Products'), PRODUCT_ID), Name: 'Renamed, unsaved' });
                return product;
            }

            const withoutHint = await loadWithUnsavedName();
            registerLoadHintResolver(() => 'Meetings');
            provider.FailLoads('Meetings', 1, new Error('socket hang up'));
            const withHint = await loadWithUnsavedName();

            expect(withoutHint.Get('Name')).toBe('Renamed, unsaved');
            expect(withHint.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(provider.Count('Load', 'Meetings')).toBe(3);
            expect(withHint.Get('Name')).toBe('Renamed, unsaved');
            expect(withHint.GetFieldByName('Name').Dirty).toBe(withoutHint.GetFieldByName('Name').Dirty);
        });

        it('a failure after the row was read propagates at once, without retrying the child', async () => {
            spyOnErrors();
            useSelector();
            await cacheProductTypes();
            insertProduct(COURSE_TYPE_ID);
            store.Insert('Courses', { ID: PRODUCT_ID, CreditHours: 3 });
            provider.FailDiscovery('Courses', new Error('probe timed out'));

            await expect(loadProduct()).rejects.toThrow('probe timed out');
            expect(trips()).toEqual(['Load:Products', 'Load:Courses', 'FindISAChildEntity:Courses']);
        });
    });

    describe('the invariant\'s benign exceptions', () => {
        it('with two child rows (the disjoint rule broken), a hint links the child the rule names; discovery links the first its query returns', async () => {
            insertProduct(PUBLICATION_TYPE_ID);
            insertMeeting();
            store.Insert('Publications', { ID: PRODUCT_ID, ISBN: '978-0' });

            const withoutHint = await loadProduct();
            registerLoadHintResolver(() => 'Publications');
            const withHint = await loadProduct();

            // The fixture's discovery query returns children in declaration order: Meetings first.
            expect(withoutHint.ISAChild?.EntityInfo.Name).toBe('Meetings');
            expect(withHint.ISAChild?.EntityInfo.Name).toBe('Publications');
        });

        it('a provider without FindISAChildEntity links nothing without a hint, and the hinted child with one', async () => {
            Object.defineProperty(provider, 'FindISAChildEntity', { value: undefined });
            insertProduct(MEETING_TYPE_ID);
            insertMeeting();

            const withoutHint = await loadProduct();
            registerLoadHintResolver(() => 'Meetings');
            const withHint = await loadProduct();

            expect(withoutHint.ISAChild).toBeNull();
            expect(withHint.ISAChild?.EntityInfo.Name).toBe('Meetings');
        });
    });

    describe('overlapping parents load as today', () => {
        it('never ask the rule, and list every subtype with one probe', async () => {
            let calls = 0;
            class PartiesLoadHintResolver extends EntitySubtypeResolver {
                public Resolve(): string {
                    return 'Customers';
                }
                public override ResolveLoadHint(): string {
                    calls++;
                    return 'Customers';
                }
            }
            MJGlobal.Instance.ClassFactory.Register(EntitySubtypeResolver, PartiesLoadHintResolver, 'Parties');
            store.Insert('Parties', { ID: PARTY_ID, Name: 'Acme' });
            store.Insert('Customers', { ID: PARTY_ID, CreditLimit: 1000 });
            store.Insert('Vendors', { ID: PARTY_ID, PaymentTerms: 'Net 30' });

            const party = await provider.LoadRecord('Parties', PARTY_ID);

            expect(calls).toBe(0);
            expect(party.ISAChildren).toEqual([{ entityName: 'Customers' }, { entityName: 'Vendors' }]);
            expect(trips()).toEqual(['Load:Parties', 'FindISAChildEntities:Parties']);
        });
    });

    describe('a user who can\'t read the child', () => {
        it('never loads the hinted child, and a record without one loads as today', async () => {
            const errors = spyOnErrors();
            const resolver = registerLoadHintResolver(() => 'Meetings');
            insertProduct(MEETING_TYPE_ID);

            const product = await loadProduct(limitedUser);

            expect(resolver.ResolveLoadHint).toBe(1);
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

            const resolver = registerLoadHintResolver(() => 'Meetings');
            provider.ResetRoundTrips();
            await expect(loadProduct(limitedUser)).rejects.toThrow(/Does NOT have permission to Read Meetings/);
            expect(resolver.ResolveLoadHint).toBe(1);
            expect(provider.Count('FindISAChildEntity')).toBe(1);
            expect(provider.Count('Load', 'Meetings')).toBe(0);
        });
    });

    describe('the create path is unchanged', () => {
        it('ResolveSubtypeEntityName reads a cached hop without a query, whether or not the selector opts in to load hints', async () => {
            useSelector(CREATE_ONLY_SELECTOR);
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

        it('ResolveSubtypeEntityName asks Resolve, not ResolveLoadHint', async () => {
            const resolver = registerLoadHintResolver(() => 'Meetings');
            const product = await provider.GetEntityObject<BaseEntity>('Products', adminUser);

            expect(await product.ResolveSubtypeEntityName()).toBeNull();
            expect(resolver.Resolve).toBe(1);
            expect(resolver.ResolveLoadHint).toBe(0);
        });
    });
});
