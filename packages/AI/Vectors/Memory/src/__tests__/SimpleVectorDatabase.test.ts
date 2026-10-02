import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';

/**
 * `SimpleVectorDatabase` — the in-process `VectorDBBase` driver that reads one MJ entity's rows,
 * parses each row's JSON vector column and ranks them with `SimpleVectorService`.
 *
 * `@memberjunction/core` is the real module apart from the four things that would touch a database
 * or the console: `RunView`, `Metadata`, `LogError` and `LogStatus`. So `EntityInfo`, `UserInfo` and
 * — most importantly — `CompositeKey` are the real classes, and the record ids asserted below are
 * exactly what the driver hands a real `VectorSearchProvider`. `@memberjunction/global` is real too,
 * so the `@RegisterClass` registration is exercised through the real class factory.
 *
 * `RunView` is backed by a tiny in-memory "database" (`db`) that answers the two queries the driver
 * issues: the `MJ: Vector Indexes` config lookup (matched by the `Name='...'` filter, quote-doubling
 * undone, so escaping is tested end to end) and the source-entity row read.
 */

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

/** A RunView result as the fake database returns it. `Results` is optional so a provider that
 *  returns no array at all — which the driver defends against — can be modelled without a cast. */
type FakeRunViewResult = Omit<RunViewResult<Record<string, unknown>>, 'Results'> & {
    Results?: Array<Record<string, unknown>>;
};

const mocks = vi.hoisted(() => ({
    RunView: vi.fn<(params: RunViewParams, contextUser?: UserInfo) => Promise<FakeRunViewResult>>(),
    EntityByName: vi.fn<(name: string) => EntityInfo | undefined>(),
    LogError: vi.fn<(message: string) => void>(),
    LogStatus: vi.fn<(message: string) => void>(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        public RunView(params: RunViewParams, contextUser?: UserInfo): Promise<FakeRunViewResult> {
            return mocks.RunView(params, contextUser);
        }
    }
    class FakeMetadata {
        public EntityByName(name: string): EntityInfo | undefined {
            return mocks.EntityByName(name);
        }
    }
    return {
        ...actual,
        RunView: FakeRunView,
        Metadata: FakeMetadata,
        LogError: mocks.LogError,
        LogStatus: mocks.LogStatus,
    };
});

import { EntityInfo, UserInfo } from '@memberjunction/core';
import type { BaseResponse, QueryOptions } from '@memberjunction/ai-vectordb';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { Float32VectorToBase64, MJGlobal } from '@memberjunction/global';
import { LoadSimpleVectorDatabase, SimpleVectorDatabase } from '../models/SimpleVectorDatabase';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const INDEX_ENTITY = 'MJ: Vector Indexes';

/** An entity keyed by a column called `ID` — the shape of every MJ core entity. */
const NOTES = new EntityInfo({
    ID: 'entity-notes',
    Name: 'Agent Notes',
    Status: 'Active',
    Fields: [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
        { Name: 'Title', Type: 'nvarchar', IsNameField: true, Sequence: 2 },
        { Name: 'Body', Type: 'nvarchar', Sequence: 3 },
        { Name: 'EmbeddingVector', Type: 'nvarchar', Sequence: 4 },
    ],
});

/** An entity whose primary key is NOT called `ID` — mapped from an external schema. */
const INDIVIDUALS = new EntityInfo({
    ID: 'entity-individuals',
    Name: 'Individuals',
    Status: 'Active',
    Fields: [
        { Name: 'individual_id', Type: 'int', IsPrimaryKey: true, Sequence: 1 },
        { Name: 'full_name', Type: 'nvarchar', IsNameField: true, Sequence: 2 },
        { Name: 'vec', Type: 'nvarchar', Sequence: 3 },
    ],
});

/** An entity with a two-column primary key. */
const ORDER_LINES = new EntityInfo({
    ID: 'entity-order-lines',
    Name: 'Order Lines',
    Status: 'Active',
    Fields: [
        { Name: 'OrderID', Type: 'int', IsPrimaryKey: true, Sequence: 1 },
        { Name: 'LineNo', Type: 'int', IsPrimaryKey: true, Sequence: 2 },
        { Name: 'Description', Type: 'nvarchar', Sequence: 3 },
        { Name: 'Embedding', Type: 'nvarchar', Sequence: 4 },
    ],
});

const ENTITIES = new Map<string, EntityInfo>([
    [NOTES.Name, NOTES],
    [INDIVIDUALS.Name, INDIVIDUALS],
    [ORDER_LINES.Name, ORDER_LINES],
]);

const USER = new UserInfo(undefined, { ID: 'user-1', Email: 'person@example.com' });

/** The ProviderConfig JSON a `MJ: Vector Indexes` row carries for this driver. */
interface ProviderConfigFixture {
    entityName?: string;
    vectorField?: string;
    binaryVectorField?: string;
    filter?: string;
    titleField?: string;
    snippetField?: string;
}

/** One `MJ: Vector Indexes` row in the fake database. */
interface IndexRow {
    ID: string;
    Name: string;
    ProviderConfig: string | null;
}

/** The fake database `RunView` reads from. Reset before every test. */
const db = {
    Indexes: [] as IndexRow[],
    Rows: new Map<string, Array<Record<string, unknown>>>(),
    /** When set, the `MJ: Vector Indexes` query fails with this message. */
    IndexQueryError: null as string | null,
    /** When set, the source-entity row query fails with this message. */
    RowQueryError: null as string | null,
    /** When true, the source-entity row query succeeds but carries no `Results` array. */
    RowQueryOmitsResults: false,
};

/** One match in a successful `QueryIndex` response. */
interface QueryMatch {
    id: string;
    score: number;
    metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function succeeded(rows: Array<Record<string, unknown>> | undefined): FakeRunViewResult {
    const count = rows?.length ?? 0;
    return { Success: true, Results: rows, RowCount: count, TotalRowCount: count, ExecutionTime: 0, ErrorMessage: '' };
}

function failed(message: string): FakeRunViewResult {
    return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: message };
}

/** Reads the index name back out of the driver's `Name='...'` filter, undoing quote doubling. */
function indexNameFromFilter(filter: RunViewParams['ExtraFilter']): string | null {
    if (typeof filter !== 'string') return null;
    const match = /^Name='((?:[^']|'')*)'$/.exec(filter);
    return match ? match[1].replace(/''/g, "'") : null;
}

function answerIndexQuery(params: RunViewParams): FakeRunViewResult {
    if (db.IndexQueryError) return failed(db.IndexQueryError);
    const name = indexNameFromFilter(params.ExtraFilter);
    const hits = db.Indexes.filter(i => i.Name === name).map(i => ({ ID: i.ID, ProviderConfig: i.ProviderConfig }));
    return succeeded(hits);
}

function answerRowQuery(params: RunViewParams): FakeRunViewResult {
    if (db.RowQueryError) return failed(db.RowQueryError);
    if (db.RowQueryOmitsResults) return succeeded(undefined);
    return succeeded(db.Rows.get(params.EntityName ?? '') ?? []);
}

function fakeRunView(params: RunViewParams): Promise<FakeRunViewResult> {
    return Promise.resolve(params.EntityName === INDEX_ENTITY ? answerIndexQuery(params) : answerRowQuery(params));
}

/** Registers a `MJ: Vector Indexes` row. A string `config` is stored verbatim (for malformed JSON). */
function defineIndex(name: string, config: ProviderConfigFixture | string | null): void {
    const providerConfig = config === null || typeof config === 'string' ? config : JSON.stringify(config);
    db.Indexes.push({ ID: `idx-${db.Indexes.length + 1}`, Name: name, ProviderConfig: providerConfig });
}

function setRows(entityName: string, rows: Array<Record<string, unknown>>): void {
    db.Rows.set(entityName, rows);
}

/** A note row with its vector JSON-serialized, as the column stores it. */
function note(id: string, vector: number[], extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { ID: id, Title: `Note ${id}`, Body: `Body of ${id}`, EmbeddingVector: JSON.stringify(vector), ...extra };
}

const NOTES_CONFIG: ProviderConfigFixture = { entityName: NOTES.Name, vectorField: 'EmbeddingVector' };

function query(indexName: string, vector: number[], topK = 10, user: UserInfo = USER): Promise<BaseResponse> {
    return new SimpleVectorDatabase().QueryIndex({ id: indexName, vector, topK }, user);
}

function matchesOf(response: BaseResponse): QueryMatch[] {
    const data: { matches: QueryMatch[] } = response.data;
    return data.matches;
}

function rowQueries(): RunViewParams[] {
    return mocks.RunView.mock.calls.map(c => c[0]).filter(p => p.EntityName !== INDEX_ENTITY);
}

function indexQueries(): RunViewParams[] {
    return mocks.RunView.mock.calls.map(c => c[0]).filter(p => p.EntityName === INDEX_ENTITY);
}

function loggedErrors(): string[] {
    return mocks.LogError.mock.calls.map(c => c[0]);
}

// ─────────────────────────────────────────────
// Specs
// ─────────────────────────────────────────────

describe('SimpleVectorDatabase', () => {
    beforeEach(() => {
        mocks.RunView.mockReset();
        mocks.EntityByName.mockReset();
        mocks.LogError.mockReset();
        mocks.LogStatus.mockReset();
        mocks.RunView.mockImplementation(fakeRunView);
        mocks.EntityByName.mockImplementation(name => ENTITIES.get(name));

        db.Indexes = [];
        db.Rows = new Map();
        db.IndexQueryError = null;
        db.RowQueryError = null;
        db.RowQueryOmitsResults = false;

        // The driver keeps a module-scoped index cache; DeleteAllRecords is its public reset.
        new SimpleVectorDatabase().DeleteAllRecords('every-index');
    });

    describe('construction and registration', () => {
        /** Exposes the protected key so the constructor's substitution is observable. */
        class ApiKeyProbe extends SimpleVectorDatabase {
            public get Key(): string {
                return this.ApiKey;
            }
        }

        it('keeps a non-empty api key exactly as given', () => {
            expect(new ApiKeyProbe('in-memory').Key).toBe('in-memory');
        });

        it.each([
            ['undefined', undefined],
            ['an empty string', ''],
            ['whitespace only', '   '],
        ])('substitutes a placeholder key instead of throwing when the key is %s', (_label, key) => {
            expect(() => new ApiKeyProbe(key)).not.toThrow();
            expect(new ApiKeyProbe(key).Key).toBe('in-memory-no-auth');
        });

        it('is a VectorDBBase', () => {
            expect(new SimpleVectorDatabase()).toBeInstanceOf(VectorDBBase);
        });

        it('is registered with the class factory under "SimpleVectorDatabase" and constructs with an empty key', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, 'SimpleVectorDatabase', '');
            expect(instance).toBeInstanceOf(SimpleVectorDatabase);
        });

        it('exposes a side-effect-free tree-shaking anchor', () => {
            expect(LoadSimpleVectorDatabase()).toBeUndefined();
        });
    });

    describe('QueryIndex — argument validation', () => {
        it('refuses a query with no index name, logging the vector length, and never touches the database', async () => {
            const params: QueryOptions = { vector: [1, 0, 0], topK: 5 };
            const result = await new SimpleVectorDatabase().QueryIndex(params, USER);

            expect(result).toEqual({ success: false, message: 'Missing indexName or vector', data: null });
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.QueryIndex: missing indexName="" or vector (length 3)',
            ]);
            expect(mocks.RunView).not.toHaveBeenCalled();
        });

        it('refuses an empty-string index name', async () => {
            const result = await query('', [1, 0, 0]);
            expect(result.success).toBe(false);
            expect(result.message).toBe('Missing indexName or vector');
            expect(mocks.RunView).not.toHaveBeenCalled();
        });

        it('refuses a query with no vector, logging "n/a" for the length', async () => {
            const params: QueryOptions = { id: 'notes-index', topK: 5 };
            const result = await new SimpleVectorDatabase().QueryIndex(params, USER);

            expect(result).toEqual({ success: false, message: 'Missing indexName or vector', data: null });
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.QueryIndex: missing indexName="notes-index" or vector (length n/a)',
            ]);
            expect(mocks.RunView).not.toHaveBeenCalled();
        });

        it('refuses an empty query vector with a failure response instead of throwing', async () => {
            const result = await query('notes-index', []);
            expect(result).toEqual({ success: false, message: 'Missing indexName or vector', data: null });
            expect(mocks.RunView).not.toHaveBeenCalled();
        });
    });

    describe('QueryIndex — loading the index configuration', () => {
        it('looks the index up by name in MJ: Vector Indexes, as the calling user, reading only what it needs', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, []);

            await query('notes-index', [1, 0, 0]);

            expect(mocks.RunView).toHaveBeenCalledWith({
                EntityName: INDEX_ENTITY,
                ExtraFilter: "Name='notes-index'",
                Fields: ['ID', 'ProviderConfig'],
                ResultType: 'simple',
                MaxRows: 1,
            }, USER);
        });

        it('doubles single quotes in the index name so the lookup filter stays a single literal', async () => {
            defineIndex("O'Brien's notes", NOTES_CONFIG);
            setRows(NOTES.Name, [note('n1', [1, 0, 0])]);

            const result = await query("O'Brien's notes", [1, 0, 0]);

            expect(indexQueries()[0].ExtraFilter).toBe("Name='O''Brien''s notes'");
            expect(result.success).toBe(true);
            expect(matchesOf(result)).toHaveLength(1);
        });

        it('strips null bytes from the index name in the lookup filter', async () => {
            await query('notes\u0000-index', [1, 0, 0]);
            expect(indexQueries()[0].ExtraFilter).toBe("Name='notes-index'");
        });

        it('reports the index as not configured when the config lookup fails, logging the RunView error', async () => {
            db.IndexQueryError = 'connection reset';

            const result = await query('notes-index', [1, 0, 0]);

            expect(result).toEqual({ success: false, message: 'Index "notes-index" not configured', data: null });
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.loadIndexConfig: RunView failed for "notes-index": connection reset',
            ]);
            expect(rowQueries()).toHaveLength(0);
        });

        it('reports the index as not configured when no MJ: Vector Indexes row has that name', async () => {
            defineIndex('some-other-index', NOTES_CONFIG);

            const result = await query('notes-index', [1, 0, 0]);

            expect(result).toEqual({ success: false, message: 'Index "notes-index" not configured', data: null });
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.loadIndexConfig: no MJVectorIndex row with Name="notes-index"',
            ]);
            expect(rowQueries()).toHaveLength(0);
        });

        it('treats a lookup that returns no Results array as "no row"', async () => {
            mocks.RunView.mockImplementation(params =>
                Promise.resolve(params.EntityName === INDEX_ENTITY ? succeeded(undefined) : succeeded([])));

            const result = await query('notes-index', [1, 0, 0]);

            expect(result.success).toBe(false);
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.loadIndexConfig: no MJVectorIndex row with Name="notes-index"',
            ]);
        });

        it.each([
            ['null', null],
            ['an empty string', ''],
        ])('reports the index as not configured when its ProviderConfig is %s', async (_label, config) => {
            defineIndex('notes-index', config);

            const result = await query('notes-index', [1, 0, 0]);

            expect(result.message).toBe('Index "notes-index" not configured');
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.loadIndexConfig: index "notes-index" exists but ProviderConfig is empty',
            ]);
            expect(rowQueries()).toHaveLength(0);
        });

        it('reports the index as not configured when its ProviderConfig is not valid JSON, logging the parse error', async () => {
            defineIndex('notes-index', '{ entityName: oops');

            const result = await query('notes-index', [1, 0, 0]);

            expect(result.success).toBe(false);
            expect(result.message).toBe('Index "notes-index" not configured');
            const errors = loggedErrors();
            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatch(/^SimpleVectorDatabase\.loadIndexConfig: index "notes-index" ProviderConfig JSON parse failed: \S/);
            expect(rowQueries()).toHaveLength(0);
        });

        it('stringifies a non-Error value thrown while parsing the ProviderConfig', async () => {
            defineIndex('notes-index', JSON.stringify(NOTES_CONFIG));
            vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
                throw 'parser exploded';
            });

            const result = await query('notes-index', [1, 0, 0]);

            expect(result.success).toBe(false);
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.loadIndexConfig: index "notes-index" ProviderConfig JSON parse failed: parser exploded',
            ]);
        });

        it.each([
            ['entityName', { vectorField: 'EmbeddingVector' }],
            ['vectorField', { entityName: NOTES.Name }],
            ['both fields', { titleField: 'Title' }],
        ])('reports the index as not configured when the ProviderConfig is missing %s', async (_label, config) => {
            defineIndex('notes-index', config);

            const result = await query('notes-index', [1, 0, 0]);

            expect(result.message).toBe('Index "notes-index" not configured');
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.loadIndexConfig: index "notes-index" ProviderConfig missing entityName/vectorField',
            ]);
            expect(rowQueries()).toHaveLength(0);
        });
    });

    describe('QueryIndex — reading the source entity', () => {
        it('reads every matching row of the configured entity as the calling user, bypassing the RunView cache', async () => {
            defineIndex('notes-index', { ...NOTES_CONFIG, filter: "Status='Active'" });
            setRows(NOTES.Name, [note('n1', [1, 0, 0])]);

            await query('notes-index', [1, 0, 0]);

            expect(mocks.EntityByName).toHaveBeenCalledWith(NOTES.Name);
            expect(mocks.RunView).toHaveBeenCalledWith({
                EntityName: NOTES.Name,
                ExtraFilter: "Status='Active'",
                ResultType: 'simple',
                BypassCache: true,
            }, USER);
        });

        it('passes no ExtraFilter when the ProviderConfig declares none', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, []);

            await query('notes-index', [1, 0, 0]);

            expect(rowQueries()).toHaveLength(1);
            expect(rowQueries()[0].ExtraFilter).toBeUndefined();
        });

        it('reports the index as not configured, without reading rows, when the configured entity is unknown to metadata', async () => {
            defineIndex('ghost-index', { entityName: 'No Such Entity', vectorField: 'Vec' });

            const result = await query('ghost-index', [1, 0, 0]);

            expect(result).toEqual({ success: false, message: 'Index "ghost-index" not configured', data: null });
            expect(mocks.EntityByName).toHaveBeenCalledWith('No Such Entity');
            expect(rowQueries()).toHaveLength(0);
        });

        it('reports the index as not configured when the row read fails, logging the entity and the RunView error', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            db.RowQueryError = 'permission denied';

            const result = await query('notes-index', [1, 0, 0]);

            expect(result).toEqual({ success: false, message: 'Index "notes-index" not configured', data: null });
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase.loadIndex: RunView on "Agent Notes" failed: permission denied',
            ]);
        });

        it('treats a row read that returns no Results array as an empty corpus', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            db.RowQueryOmitsResults = true;

            const result = await query('notes-index', [1, 0, 0]);

            expect(result).toEqual({ success: true, message: 'Returned 0 match(es)', data: { matches: [] } });
        });

        it('returns success with no matches for an entity with no rows', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, []);

            const result = await query('notes-index', [1, 0, 0]);

            expect(result).toEqual({ success: true, message: 'Returned 0 match(es)', data: { matches: [] } });
        });
    });

    describe('QueryIndex — ranking', () => {
        beforeEach(() => {
            defineIndex('notes-index', NOTES_CONFIG);
        });

        it('returns matches ranked by cosine similarity, highest first, scored on the service\'s 0..1 scale', async () => {
            setRows(NOTES.Name, [
                note('far', [0, 1, 0]),
                note('exact', [1, 0, 0]),
                note('near', [1, 1, 0]),
            ]);

            const result = await query('notes-index', [1, 0, 0]);
            const matches = matchesOf(result);

            expect(result.success).toBe(true);
            expect(result.message).toBe('Returned 3 match(es)');
            expect(matches.map(m => m.id)).toEqual(['ID|exact', 'ID|near', 'ID|far']);
            // SimpleVectorService reports cosine as (cos + 1) / 2: identical = 1, orthogonal = 0.5.
            expect(matches[0].score).toBeCloseTo(1, 10);
            expect(matches[1].score).toBeCloseTo((1 + Math.SQRT1_2) / 2, 10);
            expect(matches[2].score).toBeCloseTo(0.5, 10);
        });

        it('returns at most topK matches', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0]), note('b', [1, 1, 0]), note('c', [0, 1, 0])]);

            const matches = matchesOf(await query('notes-index', [1, 0, 0], 2));

            expect(matches.map(m => m.id)).toEqual(['ID|a', 'ID|b']);
        });

        it('defaults topK to 10 when the caller omits it', async () => {
            setRows(NOTES.Name, Array.from({ length: 12 }, (_v, i) => note(`n${i}`, [1, i + 1, 0])));
            const params: QueryOptions = { id: 'notes-index', vector: [1, 0, 0], topK: 99 };
            // Model a caller (a JS consumer or a deserialized payload) that never sent topK.
            Reflect.deleteProperty(params, 'topK');

            const result = await new SimpleVectorDatabase().QueryIndex(params, USER);

            expect(matchesOf(result)).toHaveLength(10);
            expect(mocks.LogStatus).toHaveBeenCalledWith(expect.stringContaining('querying topK=10'));
        });

        it('applies no effective similarity floor: even a row pointing the opposite way is returned, scored 0', async () => {
            // The driver passes threshold 0, and the 0..1 cosine scale never goes below it.
            setRows(NOTES.Name, [note('opposite', [-1, 0]), note('same', [1, 0]), note('orthogonal', [0, 1])]);

            const matches = matchesOf(await query('notes-index', [1, 0]));

            expect(matches.map(m => m.id)).toEqual(['ID|same', 'ID|orthogonal', 'ID|opposite']);
            expect(matches.map(m => m.score)).toEqual([1, 0.5, 0]);
        });

        it('logs which index it searched, how many vectors it holds and the topK it used', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0]), note('b', [0, 1, 0])]);

            await query('notes-index', [1, 0, 0], 7);

            expect(mocks.LogStatus).toHaveBeenCalledWith(
                'SimpleVectorDatabase.QueryIndex: index="notes-index" loaded 2 vectors, querying topK=7');
        });

        it('returns success with no matches (and logs) when the query vector has the wrong dimension count', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0])]);

            const result = await query('notes-index', [1, 0]);

            expect(result).toEqual({ success: true, message: 'Returned 0 match(es)', data: { matches: [] } });
            expect(loggedErrors().some(m => m.includes('Vectors must have same dimensions'))).toBe(true);
        });
    });

    describe('QueryIndex — which rows become vectors', () => {
        it('skips rows whose vector size differs from the rest, logging the count once, instead of failing the query', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, [
                note('a', [1, 0, 0]),
                note('odd-1', [1, 0]),
                note('b', [0, 1, 0]),
                note('odd-2', [1, 0, 0, 0]),
            ]);

            const result = await query('notes-index', [1, 0, 0]);

            expect(result.success).toBe(true);
            expect(matchesOf(result).map(m => m.id)).toEqual(['ID|a', 'ID|b']);
            expect(loggedErrors()).toEqual([
                'SimpleVectorDatabase: skipped 2 "Agent Notes" row(s) whose EmbeddingVector has a different dimension count than the rest (3) — re-embed them with one model',
            ]);
        });

        it('skips a row whose vector is an empty array', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, [note('empty', []), note('a', [1, 0, 0])]);

            const result = await query('notes-index', [1, 0, 0]);

            expect(matchesOf(result).map(m => m.id)).toEqual(['ID|a']);
            expect(loggedErrors()).toEqual([]);
        });

        beforeEach(() => {
            defineIndex('notes-index', NOTES_CONFIG);
        });

        it('accepts a vector column that is already a parsed number array', async () => {
            setRows(NOTES.Name, [{ ID: 'parsed', EmbeddingVector: [1, 0, 0] }]);

            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(matches.map(m => m.id)).toEqual(['ID|parsed']);
        });

        it('silently skips rows with no primary key value', async () => {
            setRows(NOTES.Name, [
                { ID: null, EmbeddingVector: '[1,0,0]' },
                { ID: '', EmbeddingVector: '[1,0,0]' },
                { EmbeddingVector: '[1,0,0]' },
                note('kept', [1, 0, 0]),
            ]);

            const result = await query('notes-index', [1, 0, 0]);

            expect(matchesOf(result).map(m => m.id)).toEqual(['ID|kept']);
            expect(mocks.LogError).not.toHaveBeenCalled();
        });

        it('silently skips rows whose vector column is empty or missing (not yet embedded)', async () => {
            setRows(NOTES.Name, [
                { ID: 'null-vec', EmbeddingVector: null },
                { ID: 'empty-vec', EmbeddingVector: '' },
                { ID: 'no-vec' },
                note('kept', [1, 0, 0]),
            ]);

            const result = await query('notes-index', [1, 0, 0]);

            expect(mocks.LogStatus).toHaveBeenCalledWith(expect.stringContaining('loaded 1 vectors'));
            expect(matchesOf(result).map(m => m.id)).toEqual(['ID|kept']);
            expect(mocks.LogError).not.toHaveBeenCalled();
        });

        it.each([
            ['unparseable JSON', '[1, 0,'],
            ['a JSON object', '{"x":1}'],
            ['a JSON number', '42'],
            ['an array of strings', '["1","0","0"]'],
            ['an array containing null', '[1,null,0]'],
            ['a non-array, non-string value', { x: 1 }],
        ])('silently skips a row whose vector column holds %s', async (_label, vector) => {
            setRows(NOTES.Name, [{ ID: 'bad', EmbeddingVector: vector }, note('good', [1, 0, 0])]);

            const result = await query('notes-index', [1, 0, 0]);

            expect(result.success).toBe(true);
            expect(matchesOf(result).map(m => m.id)).toEqual(['ID|good']);
            expect(mocks.LogStatus).toHaveBeenCalledWith(expect.stringContaining('loaded 1 vectors'));
            expect(mocks.LogError).not.toHaveBeenCalled();
        });

        it('keys vectors by the entity\'s real primary key column, whatever it is called', async () => {
            defineIndex('people-index', { entityName: INDIVIDUALS.Name, vectorField: 'vec', titleField: 'full_name' });
            setRows(INDIVIDUALS.Name, [
                { individual_id: 42, full_name: 'Ada', vec: '[1,0]' },
                { individual_id: 7, full_name: 'Grace', vec: '[0,1]' },
                // An `ID` column that is not the key must not be used as one.
                { ID: 'decoy', full_name: 'No key', vec: '[1,0]' },
            ]);

            const matches = matchesOf(await query('people-index', [1, 0]));

            expect(matches.map(m => m.id)).toEqual(['individual_id|42', 'individual_id|7']);
            expect(matches[0].metadata).toEqual({ Entity: INDIVIDUALS.Name, RecordID: 'individual_id|42', Title: 'Ada' });
        });

        it('keys a row whose primary key is the number 0 (a falsy but present key)', async () => {
            defineIndex('people-index', { entityName: INDIVIDUALS.Name, vectorField: 'vec' });
            setRows(INDIVIDUALS.Name, [{ individual_id: 0, vec: '[1,0]' }]);

            const matches = matchesOf(await query('people-index', [1, 0]));

            expect(matches.map(m => m.id)).toEqual(['individual_id|0']);
        });

        it('keys vectors of a composite-key entity by every key column, in the prefixed segment form', async () => {
            defineIndex('lines-index', { entityName: ORDER_LINES.Name, vectorField: 'Embedding' });
            setRows(ORDER_LINES.Name, [
                { OrderID: 11055, LineNo: 3, Description: 'Widget', Embedding: '[1,0]' },
                { OrderID: 11055, LineNo: 4, Description: 'Gadget', Embedding: '[0,1]' },
            ]);

            const matches = matchesOf(await query('lines-index', [1, 0]));

            expect(matches.map(m => m.id)).toEqual(['OrderID|11055||LineNo|3', 'OrderID|11055||LineNo|4']);
            expect(matches[0].metadata['RecordID']).toBe('OrderID|11055||LineNo|3');
        });
    });

    describe('QueryIndex — match metadata', () => {
        it('reports the entity and the prefixed record id, plus title, snippet and __mj_UpdatedAt when present', async () => {
            const updatedAt = new Date('2026-09-01T12:00:00Z');
            defineIndex('notes-index', { ...NOTES_CONFIG, titleField: 'Title', snippetField: 'Body' });
            setRows(NOTES.Name, [note('n1', [1, 0, 0], { __mj_UpdatedAt: updatedAt })]);

            const [match] = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(match.metadata).toEqual({
                Entity: NOTES.Name,
                RecordID: 'ID|n1',
                Title: 'Note n1',
                Snippet: 'Body of n1',
                __mj_UpdatedAt: updatedAt,
            });
            // The timestamp is passed through as-is, not stringified.
            expect(match.metadata['__mj_UpdatedAt']).toBe(updatedAt);
        });

        it('stringifies non-string title and snippet values', async () => {
            defineIndex('notes-index', { ...NOTES_CONFIG, titleField: 'Title', snippetField: 'Body' });
            setRows(NOTES.Name, [note('n1', [1, 0, 0], { Title: 12345, Body: false })]);

            const [match] = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(match.metadata['Title']).toBe('12345');
            expect(match.metadata['Snippet']).toBe('false');
        });

        it('omits Title and Snippet when the configured fields are null or absent on the row', async () => {
            defineIndex('notes-index', { ...NOTES_CONFIG, titleField: 'Title', snippetField: 'Summary' });
            setRows(NOTES.Name, [note('n1', [1, 0, 0], { Title: null })]);

            const [match] = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(match.metadata).toEqual({ Entity: NOTES.Name, RecordID: 'ID|n1' });
        });

        it('omits Title and Snippet when the ProviderConfig names no title or snippet field, even if the row has them', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, [note('n1', [1, 0, 0])]);

            const [match] = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(match.metadata).toEqual({ Entity: NOTES.Name, RecordID: 'ID|n1' });
        });

        it('does not leak the raw row (vector column included) into match metadata', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, [note('n1', [1, 0, 0])]);

            const [match] = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(match.metadata).not.toHaveProperty('EmbeddingVector');
            expect(match.metadata).not.toHaveProperty('Body');
        });
    });

    describe('QueryIndex — the in-process index cache', () => {
        beforeEach(() => {
            defineIndex('notes-index', NOTES_CONFIG);
        });

        it('re-reads the rows on every query, as the calling user', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0])]);

            await query('notes-index', [1, 0, 0]);
            await query('notes-index', [1, 0, 0]);

            expect(indexQueries()).toHaveLength(2);
            expect(rowQueries()).toHaveLength(2);
        });

        it('keeps serving the cached vectors when an edit changes neither the keys nor __mj_UpdatedAt (documented)', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0]), note('b', [0, 1, 0])]);
            await query('notes-index', [1, 0, 0]);

            // Swap the two vectors in place: same rows, same count.
            setRows(NOTES.Name, [note('a', [0, 1, 0]), note('b', [1, 0, 0])]);
            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(matches[0].id).toBe('ID|a');
            expect(matches[0].score).toBeCloseTo(1, 10);
        });

        it('rebuilds the index when the row count changes', async () => {
            setRows(NOTES.Name, [note('a', [0, 1, 0])]);
            await query('notes-index', [1, 0, 0]);

            setRows(NOTES.Name, [note('a', [0, 1, 0]), note('b', [1, 0, 0])]);
            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(matches.map(m => m.id)).toEqual(['ID|b', 'ID|a']);
            expect(mocks.LogStatus).toHaveBeenLastCalledWith(expect.stringContaining('loaded 2 vectors'));
        });

        it('rebuilds when a previously un-embedded row gains a vector', async () => {
            setRows(NOTES.Name, [note('a', [0, 1, 0]), { ID: 'b', EmbeddingVector: null }]);
            await query('notes-index', [1, 0, 0]);

            setRows(NOTES.Name, [note('a', [0, 1, 0]), note('b', [1, 0, 0])]);
            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(matches.map(m => m.id)).toEqual(['ID|b', 'ID|a']);
        });

        it('rebuilds when a row is edited through BaseEntity (its __mj_UpdatedAt changes)', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0], { __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z') }), note('b', [0, 1, 0])]);
            await query('notes-index', [1, 0, 0]);

            setRows(NOTES.Name, [note('a', [0, 1, 0], { __mj_UpdatedAt: new Date('2026-01-02T00:00:00Z') }), note('b', [0, 1, 0])]);
            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(matches[0].score).toBeCloseTo(0.5, 10);
        });

        it('rebuilds when one row is deleted and another inserted, leaving the count unchanged', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0])]);
            await query('notes-index', [1, 0, 0]);

            setRows(NOTES.Name, [note('c', [1, 0, 0])]);
            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(matches.map(m => m.id)).toEqual(['ID|c']);
        });

        it('never serves one user\'s rows to another user who sees a different set of the same size', async () => {
            const otherUser = new UserInfo(undefined, { ID: 'user-2', Email: 'other@example.com' });
            mocks.RunView.mockImplementation((params: RunViewParams, contextUser?: UserInfo) => {
                if (params.EntityName === INDEX_ENTITY) return fakeRunView(params);
                // Row-level security: each user reads only their own note.
                const own = contextUser?.ID === 'user-2' ? note('bob-note', [1, 0, 0]) : note('alice-secret', [1, 0, 0]);
                return Promise.resolve(succeeded([own]));
            });

            const alice = matchesOf(await query('notes-index', [1, 0, 0], 10, USER));
            const bob = matchesOf(await query('notes-index', [1, 0, 0], 10, otherUser));

            expect(alice.map(m => m.id)).toEqual(['ID|alice-secret']);
            expect(bob.map(m => m.id)).toEqual(['ID|bob-note']);
        });

        it('rebuilds when the index configuration changes', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0])]);
            await query('notes-index', [1, 0, 0]);

            db.Indexes[0].ProviderConfig = JSON.stringify({ ...NOTES_CONFIG, titleField: 'Title' });
            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(matches[0].metadata['Title']).toBe('Note a');
        });

        it('drops every cached index on DeleteAllRecords, so the next query sees in-place edits', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0]), note('b', [0, 1, 0])]);
            await query('notes-index', [1, 0, 0]);
            setRows(NOTES.Name, [note('a', [0, 1, 0]), note('b', [1, 0, 0])]);

            const cleared = new SimpleVectorDatabase().DeleteAllRecords('notes-index');
            const matches = matchesOf(await query('notes-index', [1, 0, 0]));

            expect(cleared).toEqual({ success: true, message: 'cache cleared', data: null });
            expect(matches[0].id).toBe('ID|b');
        });

        it('caches each index independently, by index name', async () => {
            defineIndex('people-index', { entityName: INDIVIDUALS.Name, vectorField: 'vec' });
            setRows(NOTES.Name, [note('a', [1, 0])]);
            setRows(INDIVIDUALS.Name, [{ individual_id: 1, vec: '[1,0]' }]);

            const notes = matchesOf(await query('notes-index', [1, 0]));
            const people = matchesOf(await query('people-index', [1, 0]));
            const notesAgain = matchesOf(await query('notes-index', [1, 0]));

            expect(notes.map(m => m.id)).toEqual(['ID|a']);
            expect(people.map(m => m.id)).toEqual(['individual_id|1']);
            expect(notesAgain.map(m => m.id)).toEqual(['ID|a']);
        });

        it('shares the cache across driver instances in the same process', async () => {
            setRows(NOTES.Name, [note('a', [1, 0, 0]), note('b', [0, 1, 0])]);
            await new SimpleVectorDatabase().QueryIndex({ id: 'notes-index', vector: [1, 0, 0], topK: 5 }, USER);

            setRows(NOTES.Name, [note('a', [0, 1, 0]), note('b', [1, 0, 0])]);
            const matches = matchesOf(await new SimpleVectorDatabase().QueryIndex({ id: 'notes-index', vector: [1, 0, 0], topK: 5 }, USER));

            expect(matches[0].id).toBe('ID|a');
        });
    });

    describe('read-only surface', () => {
        const driver = (): SimpleVectorDatabase => new SimpleVectorDatabase();
        const record = { id: 'r1', values: [1, 0, 0] };

        it('lists no indexes', () => {
            expect(driver().ListIndexes()).toEqual({ indexes: [] });
        });

        it('lists no vector ids', async () => {
            const result = await driver().ListVectorIDs({ IndexName: 'notes-index' });
            expect(result.IDs).toEqual([]);
            expect(result.NextPaginationToken).toBeUndefined();
        });

        it.each<[string, () => BaseResponse]>([
            ['GetIndex', () => driver().GetIndex({ id: 'notes-index' })],
            ['CreateIndex', () => driver().CreateIndex({ id: 'notes-index', dimension: 3, metric: 'cosine' })],
            ['DeleteIndex', () => driver().DeleteIndex({ id: 'notes-index' })],
            ['EditIndex', () => driver().EditIndex({ id: 'notes-index' })],
            ['CreateRecord', () => driver().CreateRecord(record)],
            ['CreateRecords', () => driver().CreateRecords([record])],
            ['GetRecord', () => driver().GetRecord({ id: 'r1' })],
            ['GetRecords', () => driver().GetRecords({ id: 'r1' })],
            ['UpdateRecord', () => driver().UpdateRecord({ id: 'r1', values: [0, 1, 0] })],
            ['UpdateRecords', () => driver().UpdateRecords({ id: 'r1' })],
            ['DeleteRecord', () => driver().DeleteRecord(record)],
            ['DeleteRecords', () => driver().DeleteRecords([record])],
        ])('refuses %s with a failure that points at an ingesting driver', (name, call) => {
            const result = call();

            expect(result.success).toBe(false);
            expect(result.data).toBeNull();
            expect(result.message).toBe(
                `SimpleVectorDatabase does not support ${name} — embeddings are read directly from the entity row's vector column. Use Pinecone/pgvector/Qdrant for ingestion.`);
            expect(mocks.RunView).not.toHaveBeenCalled();
        });
    });

    describe('QueryIndex — binary vector companion column', () => {
        const BINARY_CONFIG: ProviderConfigFixture = { ...NOTES_CONFIG, binaryVectorField: 'EmbeddingVectorBinary' };

        /** A note row carrying its vector only in the binary column (base64 of float32 bytes). */
        function binaryNote(id: string, vector: number[], json: string | null = null): Record<string, unknown> {
            return { ID: id, Title: `Note ${id}`, EmbeddingVector: json, EmbeddingVectorBinary: Float32VectorToBase64(vector) };
        }

        it('asks RunView for binary fields only when the ProviderConfig names a binary companion', async () => {
            defineIndex('json-index', NOTES_CONFIG);
            defineIndex('binary-index', BINARY_CONFIG);
            setRows(NOTES.Name, [note('a', [1, 0, 0])]);

            await query('json-index', [1, 0, 0]);
            await query('binary-index', [1, 0, 0]);

            const [jsonRead, binaryRead] = rowQueries();
            expect(jsonRead.IncludeBinaryFields).toBeUndefined();
            expect(binaryRead.IncludeBinaryFields).toBe(true);
        });

        it('ranks rows whose vector exists only in the binary column', async () => {
            defineIndex('binary-index', BINARY_CONFIG);
            setRows(NOTES.Name, [binaryNote('a', [1, 0, 0]), binaryNote('b', [0, 1, 0])]);

            const matches = matchesOf(await query('binary-index', [1, 0, 0], 2));

            expect(matches.map(m => m.id)).toEqual(['ID|a', 'ID|b']);
            expect(matches[0].score).toBeCloseTo(1, 6);
        });

        it('prefers the binary column over a disagreeing JSON column', async () => {
            defineIndex('binary-index', BINARY_CONFIG);
            // JSON says "points along y", binary says "points along x": the binary value must win.
            setRows(NOTES.Name, [binaryNote('a', [1, 0, 0], JSON.stringify([0, 1, 0]))]);

            const matches = matchesOf(await query('binary-index', [1, 0, 0]));

            expect(matches[0].score).toBeCloseTo(1, 6);
        });

        it('falls back to the JSON column when the binary value is empty, invalid base64, or a partial float', async () => {
            defineIndex('binary-index', BINARY_CONFIG);
            setRows(NOTES.Name, [
                note('empty', [1, 0, 0], { EmbeddingVectorBinary: '' }),
                note('garbage', [1, 0, 0], { EmbeddingVectorBinary: '!!not base64!!' }),
                note('partial', [1, 0, 0], { EmbeddingVectorBinary: 'AAAAAP8=' }), // 5 bytes — not whole float32s
                note('missing', [1, 0, 0]),
            ]);

            const matches = matchesOf(await query('binary-index', [1, 0, 0]));

            expect(matches.map(m => m.id).sort()).toEqual(['ID|empty', 'ID|garbage', 'ID|missing', 'ID|partial']);
        });

        it('falls back to JSON when the binary vector holds a non-finite value', async () => {
            defineIndex('binary-index', BINARY_CONFIG);
            setRows(NOTES.Name, [note('nan', [0, 1, 0], { EmbeddingVectorBinary: Float32VectorToBase64([NaN, 0, 0]) })]);

            const matches = matchesOf(await query('binary-index', [0, 1, 0]));

            expect(matches[0].score).toBeCloseTo(1, 6);
        });

        it('skips a row with neither a usable binary nor JSON vector', async () => {
            defineIndex('binary-index', BINARY_CONFIG);
            setRows(NOTES.Name, [binaryNote('ok', [1, 0, 0]), { ID: 'none', EmbeddingVector: null, EmbeddingVectorBinary: null }]);

            const matches = matchesOf(await query('binary-index', [1, 0, 0]));

            expect(matches.map(m => m.id)).toEqual(['ID|ok']);
        });

        it('rebuilds the cached index when a row gains a binary vector without its other fingerprint parts changing', async () => {
            defineIndex('binary-index', BINARY_CONFIG);
            const stamp = '2026-01-01T00:00:00.000Z';
            setRows(NOTES.Name, [{ ID: 'a', EmbeddingVector: JSON.stringify([0, 1, 0]), __mj_UpdatedAt: stamp }]);
            expect(matchesOf(await query('binary-index', [1, 0, 0]))[0].score).toBeCloseTo(0.5, 6);

            setRows(NOTES.Name, [{ ID: 'a', EmbeddingVector: JSON.stringify([0, 1, 0]), EmbeddingVectorBinary: Float32VectorToBase64([1, 0, 0]), __mj_UpdatedAt: stamp }]);

            expect(matchesOf(await query('binary-index', [1, 0, 0]))[0].score).toBeCloseTo(1, 6);
        });

        it('treats an empty binaryVectorField in the ProviderConfig as not configured', async () => {
            defineIndex('blank-index', { ...NOTES_CONFIG, binaryVectorField: '' });
            setRows(NOTES.Name, [note('a', [1, 0, 0])]);

            await query('blank-index', [1, 0, 0]);

            expect(rowQueries()[0].IncludeBinaryFields).toBeUndefined();
        });
    });

    describe('inherited query entry points', () => {
        it('routes MetadataFilteredQuery through QueryIndex with the index name intact', async () => {
            defineIndex('notes-index', NOTES_CONFIG);
            setRows(NOTES.Name, [note('a', [1, 0, 0])]);

            const result = await new SimpleVectorDatabase().MetadataFilteredQuery(
                { id: 'notes-index', vector: [1, 0, 0], topK: 5, metadataFilter: {} }, USER);

            expect(result.success).toBe(true);
            expect(matchesOf(result).map(m => m.id)).toEqual(['ID|a']);
        });
    });
});
