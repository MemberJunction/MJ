/**
 * Tests for `SearchEngine.VerifyOriginRecords`, the second permission gate for content derived from
 * another MJ record.
 *
 * A content item or chunk that passes entity-level ownership + row filters is still shown only when the
 * user may read the record it was extracted from: chunk → item (→ root item) → Entity Record Document →
 * origin record, verified under the origin entity's own permissions. Content with no Entity Record
 * Document, and every non-content entity, is untouched.
 *
 * Fixtures follow the real views: `vwContentItems.RootParentID` is the row's OWN id for a root item (never
 * null), and an IS-A subtype's view projects only base columns, so the walk reads items through the base
 * entity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntityByName, mockEntityByID, mockRunViewFn } = vi.hoisted(() => ({
    mockEntityByName: vi.fn(),
    mockEntityByID: vi.fn(),
    mockRunViewFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        EntityByName(name: string) { return mockEntityByName(name); }
        EntityByID(id: string) { return mockEntityByID(id); }
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
import type { SearchResultItem } from '../generic/search.types';
import type { UserInfo, EntityInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';

class TestSearchEngine extends SearchEngine {
    public async TestFilterByPermissions(results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser);
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
}

function makeEntity(opts: MockEntityOptions): EntityInfo {
    return {
        Name: opts.Name,
        ID: opts.ID ?? `id-${opts.Name}`,
        ParentID: opts.ParentID ?? null,
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        GetUserPermisions: () => ({ CanRead: opts.CanRead ?? true }),
        GetEffectiveRowFilterWhereClause: () => opts.RlsClause ?? '',
    } as unknown as EntityInfo;
}

type Row = Record<string, string | null>;

/**
 * A tiny database: one RunView handler per entity, keyed on the ids in the `IN (...)` filter. A handler
 * returns matching rows, or `null` to make that entity's RunView fail.
 */
interface FakeDb {
    [entityName: string]: (ids: string[], fields: string[]) => Row[] | null;
}

function idsInFilter(filter: string | undefined): string[] {
    return Array.from((filter ?? '').matchAll(/'([^']+)'/g), m => m[1]);
}

function serve(db: FakeDb): void {
    mockRunViewFn.mockImplementation(async (params: RunViewParams) => {
        const handler = db[params.EntityName];
        if (!handler) return { Success: false, ErrorMessage: `no handler for ${params.EntityName}`, Results: [] };
        const rows = handler(idsInFilter(params.ExtraFilter), params.Fields ?? []);
        if (rows === null) return { Success: false, ErrorMessage: `${params.EntityName} unavailable`, Results: [] };
        return { Success: true, Results: rows };
    });
}

/** Rows of `table` whose ID is among `ids` (case-insensitive, as the database compares). */
function rowsById(table: Row[]): (ids: string[]) => Row[] {
    return ids => {
        const wanted = new Set(ids.map(id => id.toLowerCase()));
        return table.filter(r => wanted.has((r['ID'] ?? '').toLowerCase()));
    };
}

/** A root item as the view returns it: `RootParentID` is its own id. */
function rootItem(id: string, erd: string | null): Row {
    return { ID: id, RootParentID: id, EntityRecordDocumentID: erd };
}

/** A split child: no document of its own, `RootParentID` names the root. */
function childItem(id: string, root: string): Row {
    return { ID: id, RootParentID: root, EntityRecordDocumentID: null };
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
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
        entities[CHUNKS] = makeEntity({ Name: CHUNKS });
        entities[ITEMS] = makeEntity({ Name: ITEMS });
        entities[ERDS] = makeEntity({ Name: ERDS });
        entities[FILES] = makeEntity({ Name: FILES, RlsClause: 'ID IN (SELECT ...)' });
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

    it('verifies the origin with the origin entity\'s own row filter, through one RunView per origin entity', async () => {
        serve(chainDb([fileA, fileB]));
        await engine.TestFilterByPermissions([makeResult(chunkA, CHUNKS), makeResult(chunkB, CHUNKS)], user);
        const fileCalls = runViewCallsFor(FILES);
        expect(fileCalls).toHaveLength(1);
        expect(fileCalls[0].ExtraFilter).toContain(`ID IN ('${fileA}','${fileB}')`);
        expect(fileCalls[0].ExtraFilter).toContain('ID IN (SELECT ...)');
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
});
