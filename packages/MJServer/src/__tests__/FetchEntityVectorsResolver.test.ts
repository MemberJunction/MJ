import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserInfo, type DatabaseProviderBase, type EntityInfo, type RunViewParams } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { VectorDBBase } from '@memberjunction/ai-vectordb';

type ViewResult = { Success: boolean; Results: unknown[]; ErrorMessage?: string };
type RunViewHandler = (params: RunViewParams, contextUser: UserInfo | undefined) => ViewResult;

// Vitest's transform emits no decorator metadata, so type-graphql can't infer field types —
// stub the decorators; these tests exercise the resolver method, not the schema.
vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'GraphQLISODateTime',
        'GraphQLTimestamp', 'registerEnumType', 'createMethodDecorator', 'createParamDecorator',
        'buildSchema', 'buildSchemaSync', 'PubSub',
    ];
    return Object.fromEntries(exportNames.map((name) => [name, decoratorFactory]));
});

const runViewCalls: Array<{ params: RunViewParams; contextUser: UserInfo | undefined }> = [];
/** Each RunViews call, as the list of entity names it batched. */
const runViewsBatches: string[][] = [];
let runViewHandler: RunViewHandler = () => ({ Success: true, Results: [] });

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        async RunView(params: RunViewParams, contextUser?: UserInfo): Promise<ViewResult> {
            runViewCalls.push({ params, contextUser });
            return runViewHandler(params, contextUser);
        }
        async RunViews(params: RunViewParams[], contextUser?: UserInfo): Promise<ViewResult[]> {
            runViewsBatches.push(params.map((p) => p.EntityName ?? ''));
            return Promise.all(params.map((p) => this.RunView(p, contextUser)));
        }
    }
    return { ...actual, RunView: MockRunView, LogStatus: () => undefined, LogError: () => undefined };
});

// GetAIAPIKey resolves through the ClassFactory too; keep it off the CreateInstance spy below.
vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return { ...actual, GetAIAPIKey: () => 'test-key' };
});

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/aiengine')>();
    return { ...actual, AIEngine: { Instance: { GetProviderIndexName: () => 'provider-index-name' } } };
});

import { FetchEntityVectorsResolver } from '../resolvers/FetchEntityVectorsResolver.js';
import type { AppContext } from '../types.js';

/* ───── fixtures ───── */

const DOC_ID = 'DOC-1';
const contextUser = new UserInfo();

const membersEntity = {
    Name: 'Members',
    PrimaryKeys: [{ Name: 'ID' }],
    Fields: [
        { Name: 'ID', IsNameField: false },
        { Name: 'FirstName', IsNameField: true },
        { Name: 'LastName', IsNameField: true },
        { Name: 'Email', IsNameField: false },
    ],
    NameField: undefined,
} as unknown as EntityInfo;

const orderLinesEntity = {
    Name: 'Order Lines',
    PrimaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNo' }],
    Fields: [
        { Name: 'OrderID', IsNameField: false },
        { Name: 'LineNo', IsNameField: false },
        { Name: 'Description', IsNameField: false },
    ],
    NameField: { Name: 'Description' },
} as unknown as EntityInfo;

function fakeVectorDB(queryKeyIsEntityDocumentID: boolean) {
    const queryIndex = vi.fn().mockResolvedValue({
        success: true,
        data: { matches: [{ id: 'pc-1', values: [0.5, 0.5], metadata: { Entity: 'Members', RecordID: 'a' } }] },
    });
    const db = { QueryKeyIsEntityDocumentID: queryKeyIsEntityDocumentID, QueryIndex: queryIndex } as unknown as VectorDBBase;
    return { db, queryIndex };
}

function appContext(entityInfo: EntityInfo): AppContext {
    const provider = { EntityByName: (name: string) => (name === entityInfo.Name ? entityInfo : undefined) } as unknown as DatabaseProviderBase;
    return {
        userPayload: { email: 'test@example.com', sessionId: 's', userRecord: contextUser },
        providers: [{ type: 'Read-Only', provider }],
    } as unknown as AppContext;
}

/** Route RunView by entity: the doc → index → database lookups, then the case-specific views. */
function routeViews(entityName: string, views: Record<string, (params: RunViewParams) => ViewResult>): void {
    runViewHandler = (params) => {
        switch (params.EntityName) {
            case 'MJ: Entity Documents':
                return { Success: true, Results: [{ ID: DOC_ID, Name: 'Doc', Entity: entityName, VectorIndexID: 'VI-1' }] };
            case 'MJ: Vector Indexes':
                return { Success: true, Results: [{ ID: 'VI-1', Name: 'Index', VectorDatabaseID: 'VDB-1', Dimensions: 2 }] };
            case 'MJ: Vector Databases':
                return { Success: true, Results: [{ ID: 'VDB-1', ClassKey: 'TestVectorDB' }] };
            default: {
                const view = views[params.EntityName ?? ''];
                return view ? view(params) : { Success: false, Results: [], ErrorMessage: `unexpected view ${params.EntityName}` };
            }
        }
    };
}

const storedRows = [
    { ID: 'ERD-1', RecordID: 'AAA', VectorJSON: '[0.1,0.2]' },
    { ID: 'ERD-2', RecordID: 'bbb', VectorJSON: '[0.3,0.4]' },
    { ID: 'ERD-3', RecordID: 'ccc', VectorJSON: '[0.5,0.6]' },
];
const memberRows = [
    { ID: 'aaa', FirstName: 'Ada', LastName: 'Lovelace' },
    { ID: 'bbb', FirstName: 'Grace', LastName: 'Hopper' },
    { ID: 'ccc', FirstName: 'Alan', LastName: null },
];

/**
 * A fake `MJ: Entity Record Documents` view over `rows`: returns only the requested `Fields`, and
 * only the rows named by an `ID IN ('a','b')` filter when one is given.
 */
function erdView(rows: Array<Record<string, string>>) {
    return (params: RunViewParams): ViewResult => {
        const idList = /^ID IN \((.*)\)$/.exec(params.ExtraFilter ?? '');
        const ids = idList ? new Set(idList[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''))) : undefined;
        const picked = ids ? rows.filter((r) => ids.has(r.ID)) : rows;
        const fields = params.Fields ?? Object.keys(rows[0] ?? {});
        return { Success: true, Results: picked.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]]))) };
    };
}

/** The VectorJSON fetches: Entity Record Documents views filtered by ID. */
function vectorFetches() {
    return callsFor('MJ: Entity Record Documents').filter((c) => c.params.ExtraFilter?.startsWith('ID IN ('));
}

function callsFor(entityName: string) {
    return runViewCalls.filter((c) => c.params.EntityName === entityName);
}

/* ───── tests ───── */

describe('FetchEntityVectorsResolver', () => {
    let createInstanceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        runViewCalls.length = 0;
        runViewsBatches.length = 0;
    });

    afterEach(() => {
        createInstanceSpy?.mockRestore();
    });

    function useVectorDB(queryKeyIsEntityDocumentID: boolean) {
        const fake = fakeVectorDB(queryKeyIsEntityDocumentID);
        createInstanceSpy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue(fake.db);
        return fake;
    }

    describe('local vector store (QueryKeyIsEntityDocumentID)', () => {
        it('reads VectorJSON for the document with the context user instead of calling QueryIndex', async () => {
            const { queryIndex } = useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(result.ErrorMessage).toBeUndefined();
            expect(result.Success).toBe(true);
            expect(queryIndex).not.toHaveBeenCalled();
            expect(result.TotalCount).toBe(3);
            expect(result.Results.map((r) => r.ID)).toEqual(['ERD-1', 'ERD-2', 'ERD-3']);
            expect(result.Results.map((r) => r.Values)).toEqual([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]);

            const [listCall, vectorCall] = callsFor('MJ: Entity Record Documents');
            expect(listCall.contextUser).toBe(contextUser);
            expect(listCall.params.ExtraFilter).toBe(`EntityDocumentID='${DOC_ID}' AND VectorJSON IS NOT NULL`);
            expect(listCall.params.Fields).toEqual(['ID', 'RecordID']);
            expect(listCall.params.ResultType).toBe('simple');
            expect(listCall.params.IgnoreMaxRows).toBe(true);
            expect(vectorCall.contextUser).toBe(contextUser);
            expect(vectorCall.params.ExtraFilter).toBe("ID IN ('ERD-1','ERD-2','ERD-3')");
            expect(vectorCall.params.Fields).toEqual(['ID', 'VectorJSON']);
            expect(vectorCall.params.ResultType).toBe('simple');
            expect(vectorCall.params.IgnoreMaxRows).toBe(true);
        });

        it('bypasses the server RunView cache for both Entity Record Documents views, so Fields is honoured', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            const erdCalls = callsFor('MJ: Entity Record Documents');
            expect(erdCalls).toHaveLength(2);
            expect(erdCalls.map((c) => c.params.BypassCache)).toEqual([true, true]);
            expect(callsFor('Members')[0].params.BypassCache).toBeUndefined();
        });

        it('labels each item with Entity, RecordID and the record name fields (RecordID matched case-insensitively)', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(result.Results.map((r) => JSON.parse(r.Metadata))).toEqual([
                { Entity: 'Members', RecordID: 'AAA', FirstName: 'Ada', LastName: 'Lovelace' },
                { Entity: 'Members', RecordID: 'bbb', FirstName: 'Grace', LastName: 'Hopper' },
                { Entity: 'Members', RecordID: 'ccc', FirstName: 'Alan' },
            ]);
            const [membersCall] = callsFor('Members');
            expect(membersCall.contextUser).toBe(contextUser);
            expect(membersCall.params.Fields).toEqual(['ID', 'FirstName', 'LastName']);
            expect(membersCall.params.ResultType).toBe('simple');
            expect(membersCall.params.ExtraFilter).toBeUndefined();
        });

        it('honours the filter: passes it to the entity view and drops vectors whose record did not pass', async () => {
            useVectorDB(true);
            const filter = "LastName = 'Hopper'";
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: (params) => ({
                    Success: true,
                    Results: params.ExtraFilter === filter ? memberRows.filter((r) => r.LastName === 'Hopper') : memberRows,
                }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, filter, appContext(membersEntity));

            expect(result.Success).toBe(true);
            expect(callsFor('Members')[0].params.ExtraFilter).toBe(filter);
            expect(result.TotalCount).toBe(1);
            expect(result.Results[0].ID).toBe('ERD-2');
            expect(JSON.parse(result.Results[0].Metadata)).toEqual({ Entity: 'Members', RecordID: 'bbb', FirstName: 'Grace', LastName: 'Hopper' });
        });

        it('stops at maxRecords', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, 2, undefined, appContext(membersEntity));

            expect(result.Results.map((r) => r.ID)).toEqual(['ERD-1', 'ERD-2']);
            expect(result.TotalCount).toBe(2);
            expect(vectorFetches().map((c) => c.params.ExtraFilter)).toEqual(["ID IN ('ERD-1','ERD-2')"]);
        });

        it('fetches VectorJSON only for vectors whose record passed the filter', async () => {
            useVectorDB(true);
            const filter = "LastName = 'Hopper'";
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: true, Results: memberRows.filter((r) => r.LastName === 'Hopper') }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, filter, appContext(membersEntity));

            expect(result.Results.map((r) => r.Values)).toEqual([[0.3, 0.4]]);
            expect(vectorFetches().map((c) => c.params.ExtraFilter)).toEqual(["ID IN ('ERD-2')"]);
        });

        it('runs no VectorJSON fetch when no stored vector belongs to a readable record', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: true, Results: [] }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(result.Success).toBe(true);
            expect(result.Results).toEqual([]);
            expect(vectorFetches()).toHaveLength(0);
        });

        it('splits a large VectorJSON fetch into ID lists of at most 1000, sent in one RunViews batch', async () => {
            useVectorDB(true);
            const ids = Array.from({ length: 1500 }, (_, i) => `id-${i}`);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(ids.map((id, i) => ({ ID: `ERD-${i}`, RecordID: id, VectorJSON: `[${i}]` }))),
                Members: () => ({ Success: true, Results: ids.map((id) => ({ ID: id, FirstName: id, LastName: null })) }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, 1500, undefined, appContext(membersEntity));

            expect(result.TotalCount).toBe(1500);
            expect(result.Results[1499]).toMatchObject({ ID: 'ERD-1499', Values: [1499] });
            const fetchSizes = vectorFetches().map((c) => (c.params.ExtraFilter ?? '').split(',').length);
            expect(fetchSizes).toEqual([1000, 500]);
            expect(runViewsBatches[1]).toEqual(['MJ: Entity Record Documents', 'MJ: Entity Record Documents']);
        });

        it('returns an error result when the VectorJSON fetch fails', async () => {
            useVectorDB(true);
            const listing = erdView(storedRows);
            routeViews('Members', {
                'MJ: Entity Record Documents': (params) =>
                    params.ExtraFilter?.startsWith('ID IN (') ? { Success: false, Results: [], ErrorMessage: 'deadlock' } : listing(params),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(result.Success).toBe(false);
            expect(result.Results).toEqual([]);
            expect(result.ErrorMessage).toBe('Failed to load vector values: deadlock');
        });

        it('matches composite-key records by the compact RecordID segment and falls back to NameField for labels', async () => {
            useVectorDB(true);
            routeViews('Order Lines', {
                'MJ: Entity Record Documents': erdView([{ ID: 'ERD-9', RecordID: 'OrderID|o-1||LineNo|2', VectorJSON: '[1,0]' }]),
                'Order Lines': () => ({ Success: true, Results: [{ OrderID: 'o-1', LineNo: 2, Description: 'Brie wheel' }] }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(orderLinesEntity));

            expect(result.Success).toBe(true);
            expect(result.Results).toHaveLength(1);
            expect(JSON.parse(result.Results[0].Metadata)).toEqual({
                Entity: 'Order Lines',
                RecordID: 'OrderID|o-1||LineNo|2',
                Description: 'Brie wheel',
            });
            expect(callsFor('Order Lines')[0].params.Fields).toEqual(['OrderID', 'LineNo', 'Description']);
        });

        it('returns an error result when the entity records cannot be loaded (e.g. an invalid filter)', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: false, Results: [], ErrorMessage: 'bad filter' }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, 'nonsense', appContext(membersEntity));

            expect(result.Success).toBe(false);
            expect(result.Results).toEqual([]);
            expect(result.ErrorMessage).toBe('Failed to load "Members" records: bad filter');
        });

        it('returns an error result when the stored vectors cannot be loaded', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': () => ({ Success: false, Results: [], ErrorMessage: 'timeout' }),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(result.Success).toBe(false);
            expect(result.Results).toEqual([]);
            expect(result.TotalCount).toBe(0);
            expect(result.ErrorMessage).toBe('Failed to load stored vectors: timeout');
        });

        it('returns an error result, and runs neither view, when the document names an entity missing from metadata', async () => {
            const { queryIndex } = useVectorDB(true);
            routeViews('Retired Entity', {
                'MJ: Entity Record Documents': erdView(storedRows),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(result.Success).toBe(false);
            expect(result.Results).toEqual([]);
            expect(result.ErrorMessage).toBe('Entity "Retired Entity" not found in metadata');
            expect(queryIndex).not.toHaveBeenCalled();
            expect(callsFor('MJ: Entity Record Documents')).toHaveLength(0);
            expect(runViewsBatches).toHaveLength(0);
        });

        it('lists the entity records and the stored vectors in one RunViews batch, then fetches the vector values', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': erdView(storedRows),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(runViewsBatches).toEqual([['Members', 'MJ: Entity Record Documents'], ['MJ: Entity Record Documents']]);
        });
    });

    describe('index-keyed providers (Pinecone path, unchanged)', () => {
        it('queries the provider index by name and never reads Entity Record Documents', async () => {
            const { queryIndex } = useVectorDB(false);
            routeViews('Members', {});

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, 50, undefined, appContext(membersEntity));

            expect(result.Success).toBe(true);
            expect(queryIndex).toHaveBeenCalledTimes(1);
            const query = queryIndex.mock.calls[0][0];
            expect(query.id).toBe('provider-index-name');
            expect(query.topK).toBe(50);
            expect(query.includeValues).toBe(true);
            expect(query.filter).toEqual({ Entity: { $eq: 'Members' } });
            expect(query.vector).toHaveLength(2);
            expect(result.Results).toEqual([{ ID: 'pc-1', Values: [0.5, 0.5], Metadata: JSON.stringify({ Entity: 'Members', RecordID: 'a' }) }]);
            expect(callsFor('MJ: Entity Record Documents')).toHaveLength(0);
            expect(callsFor('Members')).toHaveLength(0);
        });
    });
});
