/**
 * Tests for `SearchParams.Audience`: a shared conversation's results are the intersection of what
 * every reader may see. The engine validates the audience, runs its permission safety net for the
 * caller and then once per reader, streams only progress (never results) before the permission pass,
 * and keys the result cache on the readers.
 *
 * One engine subclass, two permission modes: the real `filterByPermissions` over mocked metadata and
 * RunView (`Readable === null`), or a per-user stub of it (`Readable` set) for the end-to-end legs.
 * Providers are injected the way `SearchEngine.streamSearch.test.ts` does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntityByName, mockRunViewFn } = vi.hoisted(() => ({
    mockEntityByName: vi.fn(),
    mockRunViewFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        EntityByName(name: string) { return mockEntityByName(name); }
        Entities = [];
        // Static Provider so the enricher's `Metadata.Provider` fallback resolves when tests bypass Config().
        static Provider = { EntityByName: (_name: string) => null, Entities: [] };
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

import { SearchEngine } from '../generic/SearchEngine';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import { EntitySearchProvider } from '../generic/EntitySearchProvider';
import type { SearchAudience, SearchParams, SearchResultItem, SearchSource, SearchStreamEvent } from '../generic/search.types';
import type { UserInfo, EntityInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';

/** Returns fresh copies of a fixed result list and counts its calls — a cache hit runs no provider. */
class FixedProvider extends BaseSearchProvider {
    public override readonly SourceType: SearchSource;
    public Calls = 0;
    private readonly items: SearchResultItem[];

    constructor(sourceType: SearchSource, items: SearchResultItem[]) {
        super();
        this.SourceType = sourceType;
        this.items = items;
    }

    public override async Search(): Promise<SearchResultItem[]> {
        this.Calls++;
        return this.items.map(item => ({ ...item }));
    }
}

/**
 * The real entity lane, returning a fixed list instead of querying: its hits are rows read through RunView, so the
 * engine trusts them without a verification read when no row filter applies.
 */
class FixedEntityLaneProvider extends EntitySearchProvider {
    private readonly items: SearchResultItem[];

    constructor(items: SearchResultItem[]) {
        super();
        this.items = items;
    }

    public override async Search(): Promise<SearchResultItem[]> {
        return this.items.map(item => ({ ...item }));
    }
}

interface ProviderEntry {
    Provider: BaseSearchProvider;
    ID: string;
    DisplayName: string;
    Icon: string;
    Priority: number;
    SupportsPreview: boolean;
    MaxResultsOverride: number | null;
    Record: unknown;
}

/** The two private fields the harness sets to bypass Config(), narrowed structurally rather than through `any`. */
interface SearchEngineTestState {
    _providerEntries: ProviderEntry[];
    _configured: boolean;
}

class TestSearchEngine extends SearchEngine {
    /** Per-user readable RecordIDs for a stubbed safety net; `null` runs the real `filterByPermissions`. */
    public Readable: Record<string, string[]> | null = null;
    /** Make the stub return copies, as an override that clones its results would. */
    public CloneSurvivors = false;
    /** The user of every `filterByPermissions` call, in call order. */
    public PermissionChecks: string[] = [];

    public InjectProviders(...providers: BaseSearchProvider[]): void {
        const state = this as unknown as SearchEngineTestState;
        state._providerEntries = providers.map((provider, i) => ({
            Provider: provider, ID: `prov-${i}`, DisplayName: provider.SourceType, Icon: 'fa-solid fa-circle',
            Priority: i, SupportsPreview: false, MaxResultsOverride: null, Record: {},
        }));
        state._configured = true;
    }
    public async TestFilterForAudience(results: SearchResultItem[], params: SearchParams, contextUser: UserInfo): Promise<SearchResultItem[]> {
        return this.FilterForAudience(results, params, contextUser);
    }
    public TestCacheKey(params: SearchParams, contextUser: UserInfo): string {
        return this.buildCacheKey(params.Query, params, contextUser);
    }
    protected override async filterByPermissions(results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> {
        this.PermissionChecks.push(contextUser.ID);
        if (!this.Readable) return super.filterByPermissions(results, contextUser);
        const allowed = this.Readable[contextUser.ID] ?? [];
        const kept = results.filter(r => allowed.includes(r.RecordID));
        return this.CloneSurvivors ? kept.map(r => ({ ...r })) : kept;
    }
    protected override get ProviderToUse(): IMetadataProvider {
        return { EntityByName: (name: string) => mockEntityByName(name), Entities: [] } as unknown as IMetadataProvider;
    }
}

/** A hydrated user: carries a role, as `UserCache` would. */
function user(id: string): UserInfo {
    return { ID: id, Name: `user ${id}`, Email: `${id}@example.com`, UserRoles: [{ RoleID: 'role-1' }] } as unknown as UserInfo;
}

/** A hydrated user who holds no role (`UserRoles: []`) — legitimate, and reads nothing. */
function rolelessUser(id: string): UserInfo {
    return { ID: id, Name: `user ${id}`, UserRoles: [] } as unknown as UserInfo;
}

/** A bare `{ ID }` DTO — never hydrated, so the engine refuses it. */
function unhydratedUser(id: string): UserInfo {
    return { ID: id, Name: `user ${id}` } as unknown as UserInfo;
}

const asker = user('00000000-0000-0000-0000-00000000000a');
const bea = user('00000000-0000-0000-0000-00000000000b');
const cal = user('00000000-0000-0000-0000-00000000000c');

interface ResultShape {
    resultType?: SearchResultItem['ResultType'];
    entityName?: string;
    sourceType?: SearchSource;
}

function makeResult(recordId: string, shape: ResultShape = {}): SearchResultItem {
    const resultType = shape.resultType ?? 'entity-record';
    return {
        ID: `r-${recordId}`,
        EntityName: shape.entityName ?? 'Documents',
        RecordID: recordId,
        SourceType: shape.sourceType ?? (resultType === 'storage-file' ? 'storage' : 'vector'),
        Title: recordId,
        Snippet: '',
        Score: 0.5,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ResultType: resultType,
    };
}

function withAudience(readers: UserInfo[], query = 'budget'): SearchParams {
    return { Query: query, Audience: { Readers: readers } };
}

const hasRoles = (u: UserInfo): boolean => (u.UserRoles?.length ?? 0) > 0;

/** An entity whose entity-level read follows `canRead` and whose row filter is `rowFilter` ('' = none). */
function entity(name: string, canRead: (u: UserInfo) => boolean, rowFilter: string): EntityInfo {
    return {
        Name: name,
        ID: name,
        ParentID: null,
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        GetUserPermisions: (u: UserInfo) => ({ CanRead: canRead(u) }),
        GetEffectiveRowFilterWhereClause: () => rowFilter,
    } as unknown as EntityInfo;
}

interface RunViewAnswer {
    Success: boolean;
    ErrorMessage?: string;
    Results: { ID: string }[];
}

type RunViewImpl = (params: RunViewParams, contextUser: UserInfo) => Promise<RunViewAnswer>;

/** The row-filter RunView: returns the requested IDs the user may read; a user in `failing` gets a failed RunView. */
function documentsRunView(readable: Record<string, string[]>, failing: string[] = []): RunViewImpl {
    return async (params, contextUser) => {
        if (failing.includes(contextUser.ID)) return { Success: false, ErrorMessage: 'db down', Results: [] };
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
        const requested = Array.from(filter.matchAll(/'([^']+)'/g), m => m[1]);
        const allowed = readable[contextUser.ID] ?? [];
        return { Success: true, Results: requested.filter(id => allowed.includes(id)).map(id => ({ ID: id })) };
    };
}

/**
 * `Documents` has a row filter, so every user's check is a RunView; `readable` says which rows each user
 * gets back. Entity-level read follows the real rule's shape: a user with no roles has no permission.
 */
function serveDocuments(readable: Record<string, string[]>, failing: string[] = []): void {
    mockEntityByName.mockReturnValue(entity('Documents', hasRoles, 'OwnerID = @Me'));
    mockRunViewFn.mockImplementation(documentsRunView(readable, failing));
}

function usersChecked(): string[] {
    return mockRunViewFn.mock.calls.map(c => (c[1] as UserInfo).ID);
}

function recordIDs(results: SearchResultItem[]): string[] {
    return results.map(r => r.RecordID);
}

describe('SearchParams.Audience — results every reader may see', () => {
    let engine: TestSearchEngine;
    const docs = [makeResult('d1'), makeResult('d2'), makeResult('d3')];

    beforeEach(() => {
        vi.clearAllMocks();
        mockEntityByName.mockReset();
        mockRunViewFn.mockReset();
        engine = new TestSearchEngine();
    });

    describe('FilterForAudience (real permission pass, mocked metadata)', () => {
        it('keeps only the results every reader may read', async () => {
            serveDocuments({ [bea.ID]: ['d1', 'd2'], [cal.ID]: ['d2', 'd3'] });
            const out = await engine.TestFilterForAudience(docs, withAudience([bea, cal]), asker);
            expect(recordIDs(out)).toEqual(['d2']);
        });

        it('checks each reader with the reader as the RunView user, in the order given', async () => {
            serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'], [cal.ID]: ['d1', 'd2', 'd3'] });
            await engine.TestFilterForAudience(docs, withAudience([bea, cal]), asker);
            expect(usersChecked()).toEqual([bea.ID, cal.ID]);
        });

        it('never widens: a reader who can read more than the caller adds nothing', async () => {
            serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3', 'd4'] });
            const out = await engine.TestFilterForAudience([makeResult('d1')], withAudience([bea]), asker);
            expect(recordIDs(out)).toEqual(['d1']);
        });

        it('skips a reader with the caller\'s own ID and checks a duplicated reader once', async () => {
            serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'] });
            const beaAgain = user(bea.ID.toUpperCase());
            await engine.TestFilterForAudience(docs, withAudience([asker, bea, beaAgain]), asker);
            expect(usersChecked()).toEqual([bea.ID]);
        });

        it('starts every reader\'s check before any of them resolves (readers are checked concurrently)', async () => {
            const answer = documentsRunView({ [bea.ID]: ['d1', 'd3'], [cal.ID]: ['d1', 'd2'] });
            mockEntityByName.mockReturnValue(entity('Documents', hasRoles, 'OwnerID = @Me'));
            const gates: Array<() => void> = [];
            mockRunViewFn.mockImplementation((params: RunViewParams, u: UserInfo) =>
                new Promise<RunViewAnswer>(resolve => gates.push(() => resolve(answer(params, u)))));

            const pending = engine.TestFilterForAudience(docs, withAudience([bea, cal]), asker);
            // Sequential checks would leave the second RunView unstarted until the first resolved.
            await vi.waitFor(() => expect(gates).toHaveLength(2), { timeout: 500, interval: 5 });
            gates.forEach(open => open());
            expect(recordIDs(await pending)).toEqual(['d1']);
        });

        it('returns nothing when any reader can read nothing', async () => {
            serveDocuments({ [bea.ID]: [], [cal.ID]: ['d1', 'd2', 'd3'] });
            const out = await engine.TestFilterForAudience(docs, withAudience([bea, cal]), asker);
            expect(out).toEqual([]);
            expect(usersChecked().sort()).toEqual([bea.ID, cal.ID].sort());
        });

        it('refuses storage-file results under an audience — their permissions were evaluated for the caller only', async () => {
            serveDocuments({ [bea.ID]: ['d1'] });
            const storageHit = makeResult('finance-q3.pdf', { resultType: 'storage-file' });
            const out = await engine.TestFilterForAudience([makeResult('d1'), storageHit], withAudience([bea]), asker);
            expect(recordIDs(out)).toEqual(['d1']);
        });

        it('keeps storage-file results when there is no audience (unchanged behaviour)', async () => {
            serveDocuments({});
            const storageHit = makeResult('finance-q3.pdf', { resultType: 'storage-file' });
            const out = await engine.TestFilterForAudience([storageHit], { Query: 'budget' }, asker);
            expect(out).toEqual([storageHit]);
        });

        it('a reader with no roles (UserRoles: []) reads nothing, so the room gets nothing', async () => {
            serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'] });
            const out = await engine.TestFilterForAudience(docs, withAudience([rolelessUser(bea.ID)]), asker);
            expect(out).toEqual([]);
            expect(mockRunViewFn).not.toHaveBeenCalled(); // dropped at the entity-level gate, before any RunView
        });

        it('fails closed when a reader\'s RunView fails', async () => {
            serveDocuments({ [bea.ID]: ['d1', 'd2', 'd3'] }, [bea.ID]);
            const out = await engine.TestFilterForAudience(docs, withAudience([bea]), asker);
            expect(out).toEqual([]);
        });

        it('leaves results untouched with no audience, and runs no RunView', async () => {
            serveDocuments({});
            const out = await engine.TestFilterForAudience(docs, { Query: 'budget' }, asker);
            expect(out).toBe(docs);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('preserves the input (RRF) order of the survivors', async () => {
            serveDocuments({ [bea.ID]: ['d3', 'd1'] });
            const out = await engine.TestFilterForAudience(docs, withAudience([bea]), asker);
            expect(recordIDs(out)).toEqual(['d1', 'd3']);
        });
    });

    describe('a malformed audience fails the search instead of being skipped', () => {
        const cases: Array<[string, unknown, RegExp]> = [
            ['a reader with no ID (ignoring it would restrict nothing)', { Readers: [{ Name: 'ghost', UserRoles: [] }, bea] }, /Readers\[0\] has no ID/],
            ['a reader with UserRoles undefined (never hydrated)', { Readers: [unhydratedUser(bea.ID)] }, /Readers\[0\] \(.+\) has no UserRoles array/],
            ['a null reader', { Readers: [bea, null] }, /Readers\[1\] is null, not a UserInfo/],
            ['an audience with no Readers ({})', {}, /Readers must be an array of hydrated UserInfo objects, got undefined/],
            ['Readers: undefined', { Readers: undefined }, /Readers must be an array of hydrated UserInfo objects, got undefined/],
        ];

        it.each(cases)('%s', async (_label, audience, message) => {
            const provider = new FixedProvider('vector', docs);
            engine.InjectProviders(provider);
            engine.Readable = { [asker.ID]: ['d1', 'd2', 'd3'], [bea.ID]: ['d1', 'd2', 'd3'] };

            const res = await engine.Search({ Query: 'budget', Audience: audience as SearchAudience }, asker);
            expect(res.Success).toBe(false);
            expect(res.Results).toEqual([]);
            expect(res.ErrorMessage).toMatch(/^SearchEngine: invalid Audience — /);
            expect(res.ErrorMessage).toMatch(message);
            expect(provider.Calls).toBe(0); // refused before any provider ran
        });

        it('accepts a reader with UserRoles: [] — the search succeeds and the room gets nothing', async () => {
            serveDocuments({ [asker.ID]: ['d1', 'd2', 'd3'], [bea.ID]: ['d1', 'd2', 'd3'] });
            engine.InjectProviders(new FixedProvider('vector', docs));

            const res = await engine.Search(withAudience([rolelessUser(bea.ID)]), asker);
            expect(res.Success).toBe(true);
            expect(res.Results).toEqual([]);
        });
    });

    describe('end to end through Search()', () => {
        it('returns the caller\'s results minus what a reader cannot read', async () => {
            engine.InjectProviders(new FixedProvider('vector', docs));
            engine.Readable = { [asker.ID]: ['d1', 'd2', 'd3'], [bea.ID]: ['d1', 'd3'] };

            const res = await engine.Search(withAudience([bea]), asker);
            expect(res.Success).toBe(true);
            expect(recordIDs(res.Results).sort()).toEqual(['d1', 'd3']);
            expect(engine.PermissionChecks).toEqual([asker.ID, bea.ID]); // the caller's pass, then the reader's
        });

        it('never serves a room from the caller\'s cache entry, nor the caller from the room\'s', async () => {
            const provider = new FixedProvider('vector', docs);
            engine.InjectProviders(provider);
            engine.Readable = { [asker.ID]: ['d1', 'd2', 'd3'], [bea.ID]: ['d1', 'd3'] };
            const alone: SearchParams = { Query: 'budget' };

            expect(recordIDs((await engine.Search(alone, asker)).Results).sort()).toEqual(['d1', 'd2', 'd3']);
            expect(recordIDs((await engine.Search(withAudience([bea]), asker)).Results).sort()).toEqual(['d1', 'd3']);
            expect(provider.Calls).toBe(2); // the room missed the caller's entry
            expect(recordIDs((await engine.Search(alone, asker)).Results).sort()).toEqual(['d1', 'd2', 'd3']);
            expect(recordIDs((await engine.Search(withAudience([bea]), asker)).Results).sort()).toEqual(['d1', 'd3']);
            expect(provider.Calls).toBe(2); // both served from their own entries
        });

        it('matches survivors by record, so an override of filterByPermissions that returns copies still works', async () => {
            engine.InjectProviders(new FixedProvider('vector', docs));
            engine.Readable = { [asker.ID]: ['d1', 'd2', 'd3'], [bea.ID]: ['d2'] };
            engine.CloneSurvivors = true;

            const res = await engine.Search(withAudience([bea]), asker);
            expect(recordIDs(res.Results)).toEqual(['d2']);
        });

        it('still checks a reader on an entity-lane result with no row filter: entity read gates it, with no RunView', async () => {
            mockEntityByName.mockReturnValue(entity('Documents', u => u.ID !== bea.ID, ''));
            const entityLane = [makeResult('d1', { sourceType: 'entity' }), makeResult('d2', { sourceType: 'entity' })];
            engine.InjectProviders(new FixedEntityLaneProvider(entityLane));

            const blocked = await engine.Search(withAudience([bea]), asker);
            expect(blocked.Results).toEqual([]);
            const allowed = await engine.Search(withAudience([cal]), asker);
            expect(recordIDs(allowed.Results).sort()).toEqual(['d1', 'd2']);
            expect(mockRunViewFn).not.toHaveBeenCalled(); // the entity lane, no row filter: the gate is entity read
        });

        it('mixed entities: a reader who cannot read one entity loses only that entity\'s results', async () => {
            const entities: Record<string, EntityInfo> = {
                Documents: entity('Documents', hasRoles, ''),
                Invoices: entity('Invoices', u => u.ID !== bea.ID, ''),
            };
            mockEntityByName.mockImplementation((name: string) => entities[name]);
            const mixed = [
                makeResult('d1', { sourceType: 'entity' }),
                makeResult('i1', { sourceType: 'entity', entityName: 'Invoices' }),
                makeResult('d2', { sourceType: 'entity' }),
            ];
            engine.InjectProviders(new FixedEntityLaneProvider(mixed));

            const res = await engine.Search(withAudience([bea]), asker);
            expect(res.Results.map(r => `${r.EntityName}/${r.RecordID}`).sort()).toEqual(['Documents/d1', 'Documents/d2']);
        });
    });

    describe('streamSearch', () => {
        async function collect(params: SearchParams): Promise<SearchStreamEvent[]> {
            const events: SearchStreamEvent[] = [];
            for await (const ev of engine.streamSearch(params, asker)) events.push(ev);
            return events;
        }

        it('streams progress without results under an audience; final carries the audience-filtered set', async () => {
            engine.InjectProviders(new FixedProvider('vector', docs));
            engine.Readable = { [asker.ID]: ['d1', 'd2', 'd3'], [bea.ID]: ['d1', 'd3'] };

            const events = await collect(withAudience([bea]));
            const partials = events.filter(ev => ev.phase === 'provider');
            expect(partials).toHaveLength(1);
            for (const ev of partials) {
                expect(ev).toMatchObject({ providerName: 'Vector', results: [], resultCount: 3 });
                expect(typeof ev.durationMs).toBe('number');
            }
            const final = events.find(ev => ev.phase === 'final');
            expect(final && recordIDs(final.results).sort()).toEqual(['d1', 'd3']);
        });

        it('streams progress without results when there is no audience too — partials precede the permission pass', async () => {
            engine.InjectProviders(new FixedProvider('vector', docs));
            engine.Readable = { [asker.ID]: ['d1', 'd3'] };

            const events = await collect({ Query: 'budget' });
            const partial = events.find(ev => ev.phase === 'provider');
            expect(partial).toMatchObject({ phase: 'provider', results: [], resultCount: 3 });
            const final = events.find(ev => ev.phase === 'final');
            expect(final && recordIDs(final.results).sort()).toEqual(['d1', 'd3']); // d2 never reached the stream
        });
    });

    describe('cache key', () => {
        const base: SearchParams = { Query: 'budget' };

        it('differs between a search run alone and the same search for an audience', () => {
            const alone = engine.TestCacheKey(base, asker);
            const shared = engine.TestCacheKey({ ...base, Audience: { Readers: [bea] } }, asker);
            expect(shared).not.toEqual(alone);
        });

        it('is the same for the same readers in any order or casing, and ignores the caller among the readers', () => {
            const a = engine.TestCacheKey({ ...base, Audience: { Readers: [bea, cal] } }, asker);
            const b = engine.TestCacheKey({ ...base, Audience: { Readers: [cal, user(bea.ID.toUpperCase()), asker] } }, asker);
            expect(a).toEqual(b);
        });

        it('treats an audience that adds no reader like no audience: empty, or only the caller', () => {
            const alone = engine.TestCacheKey(base, asker);
            expect(engine.TestCacheKey({ ...base, Audience: { Readers: [] } }, asker)).toEqual(alone);
            expect(engine.TestCacheKey({ ...base, Audience: { Readers: [asker] } }, asker)).toEqual(alone);
        });
    });
});
