/**
 * Tests for `SearchEngine.VerifyOriginRecords`, the second permission gate for content derived from
 * another MJ record.
 *
 * A content item or chunk that passes entity-level ownership + row filters is still shown only when the
 * user may read the record it was extracted from: chunk → item (→ root item) → Entity Record Document →
 * origin record, verified under the origin entity's own permissions. Content with no Entity Record
 * Document, and every non-content entity, is untouched.
 *
 * Fixtures follow the real views: `vwContentItems.RootParentID` is the row's OWN id for a root item (no
 * `ParentID`, never null), every lookup row carries every column it asked for (null where the value is null),
 * and an IS-A subtype's view projects only base columns, so the walk reads items through the base entity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntityByName, mockEntityByID, mockRunViewFn, mockRunViewsFn } = vi.hoisted(() => ({
    mockEntityByName: vi.fn(),
    mockEntityByID: vi.fn(),
    mockRunViewFn: vi.fn(),
    mockRunViewsFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        EntityByName(name: string) { return mockEntityByName(name); }
        EntityByID(id: string) { return mockEntityByID(id); }
    }
    class MockRunView {
        RunView = mockRunViewFn;
        RunViews = mockRunViewsFn;
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
import type { SearchResultItem } from '../generic/search.types';
import type { UserInfo, EntityInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';

class TestSearchEngine extends SearchEngine {
    public async TestFilterByPermissions(
        results: SearchResultItem[],
        contextUser: UserInfo,
        stats?: { OriginGateRemoved: number }
    ): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser, stats);
    }
    protected override get ProviderToUse(): IMetadataProvider {
        return {
            EntityByName: (name: string) => mockEntityByName(name),
            EntityByID: (id: string) => mockEntityByID(id),
            Entities: [],
        } as unknown as IMetadataProvider;
    }
}

const user = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Test User', Email: 't@example.com' } as UserInfo;

const CHUNKS = 'MJ: Content Item Chunks';
const ITEMS = 'MJ: Content Items';
const ERDS = 'MJ: Entity Record Documents';
const FILES = 'MJ: Files';
const NOTES = 'Acme: Notes';
const ORDER_LINES = 'Acme: Order Lines';

/** Lower-case so NormalizeUUID is a no-op and the ids compare as written. */
const chunkA = 'c0000000-0000-0000-0000-00000000000a';
const chunkB = 'c0000000-0000-0000-0000-00000000000b';
const chunkC = 'c0000000-0000-0000-0000-00000000000c';
const itemA = 'a0000000-0000-0000-0000-00000000000a';
const itemB = 'a0000000-0000-0000-0000-00000000000b';
const itemC = 'a0000000-0000-0000-0000-00000000000c';
const itemRoot = 'a0000000-0000-0000-0000-0000000000ee';
const erdA = 'e0000000-0000-0000-0000-00000000000a';
const erdB = 'e0000000-0000-0000-0000-00000000000b';
const fileA = 'f0000000-0000-0000-0000-00000000000a';
const fileB = 'f0000000-0000-0000-0000-00000000000b';
const noteA = 'b0000000-0000-0000-0000-00000000000a';

function makeResult(recordId: string, entityName: string, sourceType = 'vector'): SearchResultItem {
    return {
        ID: `r-${recordId}`,
        EntityName: entityName,
        RecordID: recordId,
        SourceType: sourceType,
        Title: `record ${recordId}`,
        Snippet: '',
        Score: 0.9,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ResultType: 'content-item',
    };
}

interface MockEntityOptions {
    Name: string;
    ID?: string;
    ParentID?: string | null;
    CanRead?: boolean;
    RlsClause?: string;
    /** Primary key column name(s); defaults to a single `ID`. */
    PrimaryKeyNames?: string[];
}

function makeEntity(opts: MockEntityOptions): EntityInfo {
    const keys = (opts.PrimaryKeyNames ?? ['ID']).map(Name => ({ Name }));
    return {
        Name: opts.Name,
        ID: opts.ID ?? `id-${opts.Name}`,
        ParentID: opts.ParentID ?? null,
        FirstPrimaryKey: keys[0],
        PrimaryKeys: keys,
        GetUserPermisions: () => ({ CanRead: opts.CanRead ?? true }),
        GetEffectiveRowFilterWhereClause: () => opts.RlsClause ?? '',
    } as unknown as EntityInfo;
}

type Row = Record<string, string | number | null>;

/**
 * A tiny database: one RunView handler per entity, keyed on the ids in the `IN (...)` filter. A handler
 * returns matching rows, `null` to make that entity's RunView fail, or throws to make it throw.
 */
interface FakeDb {
    [entityName: string]: (ids: string[], fields: string[], filter: string) => Row[] | null;
}

function idsInFilter(filter: string | undefined): string[] {
    return Array.from((filter ?? '').matchAll(/'([^']+)'/g), m => m[1]);
}

function serve(db: FakeDb): void {
    mockRunViewFn.mockImplementation(async (params: RunViewParams) => {
        const handler = db[params.EntityName];
        if (!handler) return { Success: false, ErrorMessage: `no handler for ${params.EntityName}`, Results: [] };
        const rows = handler(idsInFilter(params.ExtraFilter), params.Fields ?? [], params.ExtraFilter ?? '');
        if (rows === null) return { Success: false, ErrorMessage: `${params.EntityName} unavailable`, Results: [] };
        return { Success: true, Results: rows };
    });
}

/** Rows of `table` whose ID is among `ids` (case-insensitive, as the database compares). */
function rowsById(table: Row[]): (ids: string[]) => Row[] {
    return ids => {
        const wanted = new Set(ids.map(id => id.toLowerCase()));
        return table.filter(r => wanted.has(String(r['ID'] ?? '').toLowerCase()));
    };
}

/** A root item as the view returns it: no `ParentID`, and `RootParentID` is its own id. */
function rootItem(id: string, erd: string | null): Row {
    return { ID: id, ParentID: null, RootParentID: id, EntityRecordDocumentID: erd };
}

/** A split child: `ParentID` set, `RootParentID` names the root; no document of its own unless given. */
function childItem(id: string, root: string, erd: string | null = null): Row {
    return { ID: id, ParentID: root, RootParentID: root, EntityRecordDocumentID: erd };
}

/** The chunk → item lookup (the gate-1 ownership check on the chunk entity projects only the key). */
function chunkLookups(entityName = CHUNKS): RunViewParams[] {
    return runViewCallsFor(entityName).filter(p => (p.Fields ?? []).includes('ContentItemID'));
}

function runViewCallsFor(entityName: string): RunViewParams[] {
    return mockRunViewFn.mock.calls
        .map(c => c[0] as RunViewParams)
        .filter(p => p.EntityName === entityName);
}

describe('SearchEngine.VerifyOriginRecords (origin-record gate)', () => {
    let engine: TestSearchEngine;
    const entities: Record<string, EntityInfo> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewsFn.mockImplementation(async (params: RunViewParams[], u: UserInfo) => Promise.all(params.map(p => mockRunViewFn(p, u))));
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
        entities[CHUNKS] = makeEntity({ Name: CHUNKS });
        entities[ITEMS] = makeEntity({ Name: ITEMS });
        entities[ERDS] = makeEntity({ Name: ERDS });
        entities[FILES] = makeEntity({ Name: FILES, RlsClause: 'ID IN (SELECT ...)' });
        delete entities[NOTES];
        delete entities[ORDER_LINES];
        delete entities['Acme: Chunk Labels'];
        delete entities['Acme: Space Files'];
        mockEntityByName.mockImplementation((name: string) => {
            const e = entities[name];
            if (!e) throw new Error(`unknown entity ${name}`);
            return e;
        });
        mockEntityByID.mockImplementation((id: string) => Object.values(entities).find(e => e.ID === id));
    });

    /** Two chunks of two files. The Files handler decides which origins are readable. */
    function chainDb(readableFiles: string[]): FakeDb {
        return {
            [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkB, ContentItemID: itemB }]),
            [ITEMS]: rowsById([rootItem(itemA, erdA), rootItem(itemB, erdB)]),
            [ERDS]: rowsById([
                { ID: erdA, Entity: FILES, RecordID: fileA },
                { ID: erdB, Entity: FILES, RecordID: fileB },
            ]),
            [FILES]: ids => ids.filter(id => readableFiles.includes(id)).map(id => ({ ID: id })),
        };
    }

    it('keeps a chunk whose origin record the user may read', async () => {
        serve(chainDb([fileA]));
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
    });

    it('drops a chunk whose origin record is not readable under the origin entity\'s row filter', async () => {
        serve(chainDb([fileA]));
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
    });

    it('verifies the origin with the origin entity\'s own row filter, in one RunViews batch with one view per origin entity', async () => {
        serve(chainDb([fileA, fileB]));
        await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
        const fileCalls = runViewCallsFor(FILES);
        expect(fileCalls).toHaveLength(1);
        expect(fileCalls[0].ExtraFilter).toContain(`ID IN ('${fileA}','${fileB}')`);
        expect(fileCalls[0].ExtraFilter).toContain('ID IN (SELECT ...)');
        expect(mockRunViewsFn).toHaveBeenCalledTimes(1);
    });

    it('caps every lookup at the number of ids it asks for, so UserViewMaxRows cannot truncate it', async () => {
        serve(chainDb([fileA, fileB]));
        await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
        for (const entityName of [CHUNKS, ITEMS, ERDS, FILES]) {
            for (const call of runViewCallsFor(entityName)) expect(call.MaxRows).toBe(2);
        }
    });

    it('passes content with no Entity Record Document through unchanged, reading items only once (a root is its own RootParentID)', async () => {
        serve({
            [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
            [ITEMS]: rowsById([rootItem(itemA, null)]),
        });
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
        expect(runViewCallsFor(ITEMS)).toHaveLength(1);
        expect(runViewCallsFor(ERDS)).toHaveLength(0);
    });

    it('follows a split child to its root item\'s Entity Record Document', async () => {
        serve({
            [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
            [ITEMS]: rowsById([childItem(itemA, itemRoot), rootItem(itemRoot, erdA)]),
            [ERDS]: rowsById([{ ID: erdA, Entity: FILES, RecordID: fileA }]),
            [FILES]: ids => ids.filter(id => id === fileA).map(id => ({ ID: id })),
        });
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
        expect(runViewCallsFor(ITEMS)).toHaveLength(2); // the child, then its root
    });

    it('drops a split child whose root is not readable', async () => {
        serve({
            [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
            [ITEMS]: ids => rowsById([childItem(itemA, itemRoot)])(ids), // the root row never comes back
        });
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out).toEqual([]);
    });

    it('checks an item-level content hit the same way', async () => {
        serve({
            [ITEMS]: rowsById([rootItem(itemA, erdA)]),
            [ERDS]: rowsById([{ ID: erdA, Entity: FILES, RecordID: fileA }]),
            [FILES]: () => [],
        });
        const out = await engine.TestFilterByPermissions([makeResult(itemA, ITEMS)], user);
        expect(out).toEqual([]);
    });

    it('applies to an IS-A subtype of the chunk entity, walking ParentID', async () => {
        entities['Acme: Chunk Labels'] = makeEntity({ Name: 'Acme: Chunk Labels', ParentID: entities[CHUNKS].ID });
        serve({
            ...chainDb([fileA]),
            'Acme: Chunk Labels': rowsById([{ ID: chunkA, ContentItemID: itemA }]),
        });
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, 'Acme: Chunk Labels')], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
        expect(runViewCallsFor(CHUNKS)).toHaveLength(0); // the subtype's own view carries the base chunk columns
    });

    it('reads an IS-A ITEM subtype through the base entity, so a split child\'s root link is not lost', async () => {
        // A subtype view projects only base columns; `RootParentID` is view-computed and would be absent.
        // Reading the base entity gets the root link back, and the child is judged by its root's origin.
        entities['Acme: Space Files'] = makeEntity({ Name: 'Acme: Space Files', ParentID: entities[ITEMS].ID });
        serve({
            'Acme: Space Files': rowsById([{ ID: itemA }]), // the ownership gate's existence check
            [ITEMS]: rowsById([childItem(itemA, itemRoot), rootItem(itemRoot, erdA)]),
            [ERDS]: rowsById([{ ID: erdA, Entity: FILES, RecordID: fileA }]),
            [FILES]: () => [], // the root's file is not readable
        });
        const out = await engine.TestFilterByPermissions([makeResult(itemA, 'Acme: Space Files')], user);
        expect(out).toEqual([]);
        const subtypeCalls = runViewCallsFor('Acme: Space Files');
        expect(subtypeCalls.every(c => !(c.Fields ?? []).includes('RootParentID'))).toBe(true);
        expect(runViewCallsFor(ITEMS)).toHaveLength(2);
    });

    it('fails closed for the whole group when the chunk lookup fails (every row depends on it)', async () => {
        const db = chainDb([fileA, fileB]);
        let ownershipChecked = false;
        db[CHUNKS] = (ids, fields) => {
            if (!fields.includes('ContentItemID')) { ownershipChecked = true; return ids.map(id => ({ ID: id })); } // gate 1
            return null; // the chunk → item hop fails
        };
        serve(db);
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
        expect(ownershipChecked).toBe(true);
        expect(out).toEqual([]);
    });

    it('scopes an Entity Record Document lookup failure to the rows that have a document; crawled content still passes', async () => {
        serve({
            [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkC, ContentItemID: itemC }]),
            [ITEMS]: rowsById([rootItem(itemA, erdA), rootItem(itemC, null)]),
            [ERDS]: () => null, // the user cannot read Entity Record Documents
        });
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkC, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkC]);
    });

    it('drops a hit whose item row the user cannot read, even though the chunk row passed', async () => {
        serve({
            [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
            [ITEMS]: () => [],
        });
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out).toEqual([]);
    });

    it('drops a hit whose document names no entity or record', async () => {
        serve({
            [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
            [ITEMS]: rowsById([rootItem(itemA, erdA)]),
            [ERDS]: rowsById([{ ID: erdA, Entity: null, RecordID: fileA }]),
        });
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out).toEqual([]);
    });

    it('drops a hit whose origin names an entity the user cannot read at all', async () => {
        entities[FILES] = makeEntity({ Name: FILES, CanRead: false });
        serve(chainDb([fileA]));
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out).toEqual([]);
        expect(runViewCallsFor(FILES)).toHaveLength(0);
    });

    it('matches ids the database returns in a different case', async () => {
        const db = chainDb([fileA]);
        db[CHUNKS] = rowsById([{ ID: chunkA.toUpperCase(), ContentItemID: itemA.toUpperCase() }]);
        db[ITEMS] = rowsById([rootItem(itemA.toUpperCase(), erdA.toUpperCase())]);
        db[ERDS] = rowsById([{ ID: erdA.toUpperCase(), Entity: FILES, RecordID: fileA.toUpperCase() }]);
        db[FILES] = ids => ids.map(id => ({ ID: id.toUpperCase() }));
        serve(db);
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
    });

    it('reads a prefixed `ID|value` document RecordID as the key value it carries', async () => {
        const db = chainDb([fileA]);
        db[ERDS] = rowsById([{ ID: erdA, Entity: FILES, RecordID: `ID|${fileA}` }]);
        serve(db);
        const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
        expect(runViewCallsFor(FILES)[0].ExtraFilter).toContain(`ID IN ('${fileA}')`);
    });

    it('does not touch results of a non-content entity: no extra RunViews', async () => {
        entities['Customers'] = makeEntity({ Name: 'Customers' });
        serve({ Customers: rowsById([{ ID: 'aaa' }]) });
        const out = await engine.TestFilterByPermissions([makeResult('aaa', 'Customers')], user);
        expect(out.map(r => r.RecordID)).toEqual(['aaa']);
        expect(mockRunViewFn).toHaveBeenCalledTimes(1); // the existing ownership check only
    });

    it('keeps the RRF order of the survivors', async () => {
        serve(chainDb([fileA, fileB]));
        const out = await engine.TestFilterByPermissions([makeResult(chunkB, CHUNKS), makeResult(chunkA, CHUNKS)], user);
        expect(out.map(r => r.RecordID)).toEqual([chunkB, chunkA]);
    });

    describe('field-level security and incomplete rows (fail closed, never "no origin")', () => {
        it('drops the group when the item lookup comes back without EntityRecordDocumentID, and reads no further', async () => {
            // Field-level security narrows a `Fields` projection silently. Reading the absent column as null
            // would pass every hit as "no origin"; the lookup must count as failed instead.
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkC, ContentItemID: itemC }]),
                [ITEMS]: rowsById([
                    { ID: itemA, ParentID: null, RootParentID: itemA },
                    { ID: itemC, ParentID: null, RootParentID: itemC },
                ]),
                [ERDS]: rowsById([{ ID: erdA, Entity: FILES, RecordID: fileA }]),
                [FILES]: ids => ids.map(id => ({ ID: id })),
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkC, CHUNKS)], user);
            expect(out).toEqual([]);
            expect(runViewCallsFor(ERDS)).toHaveLength(0);
            expect(runViewCallsFor(FILES)).toHaveLength(0);
            expect(mockRunViewsFn).not.toHaveBeenCalled();

            const itemHit = await engine.TestFilterByPermissions([makeResult(itemA, ITEMS)], user);
            expect(itemHit).toEqual([]);
        });

        it('drops only the document-bearing hits when the document lookup comes back without RecordID', async () => {
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkC, ContentItemID: itemC }]),
                [ITEMS]: rowsById([rootItem(itemA, erdA), rootItem(itemC, null)]),
                [ERDS]: rowsById([{ ID: erdA, Entity: FILES }]),
                [FILES]: ids => ids.map(id => ({ ID: id })),
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkC, CHUNKS)], user);
            expect(out.map(r => r.RecordID)).toEqual([chunkC]);
            expect(runViewCallsFor(FILES)).toHaveLength(0);
        });

        it('drops a child whose RootParentID the view could not resolve (null), instead of passing it as "no origin"', async () => {
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
                [ITEMS]: rowsById([{ ID: itemA, ParentID: itemRoot, RootParentID: null, EntityRecordDocumentID: null }]),
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
            expect(out).toEqual([]);
            expect(runViewCallsFor(ITEMS)).toHaveLength(1); // nothing to walk to
        });

        it('drops a child whose RootParentID names itself', async () => {
            serve({
                [ITEMS]: rowsById([{ ID: itemA, ParentID: itemRoot, RootParentID: itemA, EntityRecordDocumentID: null }]),
            });
            const out = await engine.TestFilterByPermissions([makeResult(itemA, ITEMS)], user);
            expect(out).toEqual([]);
        });
    });

    describe('failure scoping', () => {
        it('drops the whole group, crawled content included, when the item lookup fails', async () => {
            const db = chainDb([fileA]);
            db[CHUNKS] = rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkC, ContentItemID: itemC }]);
            db[ITEMS] = (ids, fields) => fields.includes('RootParentID') ? null : rowsById([rootItem(itemA, erdA), rootItem(itemC, null)])(ids);
            serve(db);
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkC, CHUNKS)], user);
            expect(out).toEqual([]);
            expect(runViewCallsFor(ERDS)).toHaveLength(0);
        });

        it('drops only the split children when the root lookup fails; a root-level item in the group still passes', async () => {
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkC, ContentItemID: itemC }]),
                [ITEMS]: ids => ids.includes(itemRoot) ? null : rowsById([childItem(itemA, itemRoot), rootItem(itemC, null)])(ids),
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkC, CHUNKS)], user);
            expect(out.map(r => r.RecordID)).toEqual([chunkC]);
            expect(runViewCallsFor(ITEMS)).toHaveLength(2);
        });

        it('drops only the rows of an origin entity whose view fails in the batch', async () => {
            entities[NOTES] = makeEntity({ Name: NOTES });
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkB, ContentItemID: itemB }]),
                [ITEMS]: rowsById([rootItem(itemA, erdA), rootItem(itemB, erdB)]),
                [ERDS]: rowsById([
                    { ID: erdA, Entity: FILES, RecordID: fileA },
                    { ID: erdB, Entity: NOTES, RecordID: noteA },
                ]),
                [FILES]: () => null,
                [NOTES]: ids => ids.map(id => ({ ID: id })),
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
            expect(out.map(r => r.RecordID)).toEqual([chunkB]);
            expect(mockRunViewsFn).toHaveBeenCalledTimes(1);
            expect((mockRunViewsFn.mock.calls[0][0] as RunViewParams[]).map(p => p.EntityName).sort()).toEqual([NOTES, FILES].sort());
        });

        it('drops a hit whose origin names an entity unknown to metadata, without querying it', async () => {
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkB, ContentItemID: itemB }]),
                [ITEMS]: rowsById([rootItem(itemA, erdA), rootItem(itemB, erdB)]),
                [ERDS]: rowsById([
                    { ID: erdA, Entity: 'Acme: Retired Entity', RecordID: fileA },
                    { ID: erdB, Entity: FILES, RecordID: fileB },
                ]),
                [FILES]: ids => ids.map(id => ({ ID: id })),
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
            expect(out.map(r => r.RecordID)).toEqual([chunkB]);
            expect(runViewCallsFor('Acme: Retired Entity')).toHaveLength(0);
        });

        it('drops the whole group when a lookup throws instead of reporting failure', async () => {
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkC, ContentItemID: itemC }]),
                [ITEMS]: rowsById([rootItem(itemA, erdA), rootItem(itemC, null)]),
                [ERDS]: () => { throw new Error('connection reset'); },
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkC, CHUNKS)], user);
            expect(out).toEqual([]);
        });
    });

    describe('record ids', () => {
        it('reads a prefixed `ID|value` content RecordID as its value, at every hop and in the origin map', async () => {
            serve(chainDb([fileA]));
            const out = await engine.TestFilterByPermissions([makeResult(`ID|${chunkA}`, CHUNKS)], user);
            expect(out.map(r => r.RecordID)).toEqual([`ID|${chunkA}`]);
            const lookup = chunkLookups()[0];
            expect(lookup.ExtraFilter).toBe(`ID IN ('${chunkA}')`);
        });

        it('escapes a quote in a RecordID at every hop', async () => {
            const quotedChunk = "c'1";
            const quotedFile = "f'x";
            serve({
                [CHUNKS]: () => [{ ID: quotedChunk, ContentItemID: itemA }],
                [ITEMS]: rowsById([rootItem(itemA, erdA)]),
                [ERDS]: rowsById([{ ID: erdA, Entity: FILES, RecordID: quotedFile }]),
                [FILES]: () => [{ ID: quotedFile }],
            });
            const out = await engine.TestFilterByPermissions([makeResult(quotedChunk, CHUNKS, 'entity')], user);
            expect(out.map(r => r.RecordID)).toEqual([quotedChunk]);
            expect(chunkLookups()[0].ExtraFilter).toBe("ID IN ('c''1')");
            expect(runViewCallsFor(FILES)[0].ExtraFilter).toContain("ID IN ('f''x')");
        });

        it('treats duplicate RecordIDs in a group alike, looking each up once', async () => {
            serve(chainDb([fileA]));
            const dupes = [makeResult(chunkA, CHUNKS, 'vector'), makeResult(chunkA, CHUNKS, 'fulltext')];
            expect(await engine.TestFilterByPermissions(dupes, user)).toHaveLength(2);
            expect(chunkLookups()[0].ExtraFilter).toBe(`ID IN ('${chunkA}')`);

            mockRunViewFn.mockClear();
            serve(chainDb([]));
            expect(await engine.TestFilterByPermissions(dupes, user)).toEqual([]);
            expect(runViewCallsFor(FILES)).toHaveLength(1); // reached the origin check, and it said no
        });

        it('verifies a composite-key origin by its own key, and drops a segment naming a field that is not a primary key', async () => {
            entities[ORDER_LINES] = makeEntity({ Name: ORDER_LINES, PrimaryKeyNames: ['OrderID', 'LineNo'] });
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }, { ID: chunkB, ContentItemID: itemB }]),
                [ITEMS]: rowsById([rootItem(itemA, erdA), rootItem(itemB, erdB)]),
                [ERDS]: rowsById([
                    { ID: erdA, Entity: ORDER_LINES, RecordID: 'OrderID|o1||LineNo|3' },
                    { ID: erdB, Entity: ORDER_LINES, RecordID: "OrderID|o1||LineNo = 3 OR 1|1" },
                ]),
                [ORDER_LINES]: () => [{ OrderID: 'o1', LineNo: 3 }],
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
            expect(out.map(r => r.RecordID)).toEqual([chunkA]);
            const calls = runViewCallsFor(ORDER_LINES);
            expect(calls).toHaveLength(1);
            expect(calls[0].ExtraFilter).toBe("(OrderID='o1' AND LineNo='3')");
        });

        it('issues no origin read when every composite segment names a bogus field', async () => {
            entities[ORDER_LINES] = makeEntity({ Name: ORDER_LINES, PrimaryKeyNames: ['OrderID', 'LineNo'] });
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
                [ITEMS]: rowsById([rootItem(itemA, erdA)]),
                [ERDS]: rowsById([{ ID: erdA, Entity: ORDER_LINES, RecordID: 'OrderID|o1||Bogus|1' }]),
                [ORDER_LINES]: () => [{ OrderID: 'o1', LineNo: 1 }],
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
            expect(out).toEqual([]);
            expect(runViewCallsFor(ORDER_LINES)).toHaveLength(0);
        });
    });

    describe('item-level hits, split children, and the row-filter branch', () => {
        it('keeps an item-level hit with no document, reading no documents', async () => {
            serve({ [ITEMS]: rowsById([rootItem(itemA, null)]) });
            const out = await engine.TestFilterByPermissions([makeResult(itemA, ITEMS)], user);
            expect(out.map(r => r.RecordID)).toEqual([itemA]);
            expect(runViewCallsFor(ERDS)).toHaveLength(0);
        });

        it('judges a split child that has its own document by that document, never reading its root', async () => {
            serve({
                [CHUNKS]: rowsById([{ ID: chunkA, ContentItemID: itemA }]),
                [ITEMS]: rowsById([childItem(itemA, itemRoot, erdA), rootItem(itemRoot, erdB)]),
                [ERDS]: rowsById([
                    { ID: erdA, Entity: FILES, RecordID: fileA },
                    { ID: erdB, Entity: FILES, RecordID: fileB },
                ]),
                [FILES]: ids => ids.filter(id => id === fileA).map(id => ({ ID: id })),
            });
            const out = await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS)], user);
            expect(out.map(r => r.RecordID)).toEqual([chunkA]);
            expect(runViewCallsFor(ITEMS)).toHaveLength(1);
            expect(runViewCallsFor(ERDS)[0].ExtraFilter).toBe(`ID IN ('${erdA}')`);
        });

        it('applies the origin gate after the row-filter branch of gate 1 too', async () => {
            entities[CHUNKS] = makeEntity({ Name: CHUNKS, RlsClause: "OwnerID = 'u1'" });
            serve(chainDb([fileA]));
            const out = await engine.TestFilterByPermissions(
                [makeResult(chunkA, CHUNKS, 'entity'), makeResult(chunkB, CHUNKS, 'entity')], user
            );
            expect(out.map(r => r.RecordID)).toEqual([chunkA]);
            const gate1 = runViewCallsFor(CHUNKS).find(p => !(p.Fields ?? []).includes('ContentItemID'));
            expect(gate1?.ExtraFilter).toBe(`(ID IN ('${chunkA}','${chunkB}')) AND (OwnerID = 'u1')`);
        });
    });

    it('counts origin-gate removals separately from the late safety net', async () => {
        entities['Customers'] = makeEntity({ Name: 'Customers' });
        serve({ ...chainDb([fileA]), Customers: () => [] });
        const stats = { OriginGateRemoved: 0 };
        const out = await engine.TestFilterByPermissions(
            [makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS), makeResult('not-a-customer', 'Customers')], user, stats
        );
        expect(out.map(r => r.RecordID)).toEqual([chunkA]);
        expect(stats.OriginGateRemoved).toBe(1); // chunkB; the Customers row was gate 1's, not the origin gate's
    });
});
