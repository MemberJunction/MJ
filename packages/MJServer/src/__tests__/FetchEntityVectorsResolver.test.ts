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
let runViewHandler: RunViewHandler = () => ({ Success: true, Results: [] });

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        async RunView(params: RunViewParams, contextUser?: UserInfo): Promise<ViewResult> {
            runViewCalls.push({ params, contextUser });
            return runViewHandler(params, contextUser);
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

function callsFor(entityName: string) {
    return runViewCalls.filter((c) => c.params.EntityName === entityName);
}

/* ───── tests ───── */

describe('FetchEntityVectorsResolver', () => {
    let createInstanceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        runViewCalls.length = 0;
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
                'MJ: Entity Record Documents': () => ({ Success: true, Results: storedRows }),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, undefined, appContext(membersEntity));

            expect(result.ErrorMessage).toBeUndefined();
            expect(result.Success).toBe(true);
            expect(queryIndex).not.toHaveBeenCalled();
            expect(result.TotalCount).toBe(3);
            expect(result.Results.map((r) => r.ID)).toEqual(['ERD-1', 'ERD-2', 'ERD-3']);
            expect(result.Results.map((r) => r.Values)).toEqual([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]);

            const [erdCall] = callsFor('MJ: Entity Record Documents');
            expect(erdCall.contextUser).toBe(contextUser);
            expect(erdCall.params.ExtraFilter).toBe(`EntityDocumentID='${DOC_ID}' AND VectorJSON IS NOT NULL`);
            expect(erdCall.params.Fields).toEqual(['ID', 'RecordID', 'VectorJSON']);
            expect(erdCall.params.ResultType).toBe('simple');
            expect(erdCall.params.IgnoreMaxRows).toBe(true);
        });

        it('labels each item with Entity, RecordID and the record name fields (RecordID matched case-insensitively)', async () => {
            useVectorDB(true);
            routeViews('Members', {
                'MJ: Entity Record Documents': () => ({ Success: true, Results: storedRows }),
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
                'MJ: Entity Record Documents': () => ({ Success: true, Results: storedRows }),
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
                'MJ: Entity Record Documents': () => ({ Success: true, Results: storedRows }),
                Members: () => ({ Success: true, Results: memberRows }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, 2, undefined, appContext(membersEntity));

            expect(result.Results.map((r) => r.ID)).toEqual(['ERD-1', 'ERD-2']);
            expect(result.TotalCount).toBe(2);
        });

        it('matches composite-key records by the compact RecordID segment and falls back to NameField for labels', async () => {
            useVectorDB(true);
            routeViews('Order Lines', {
                'MJ: Entity Record Documents': () => ({
                    Success: true,
                    Results: [{ ID: 'ERD-9', RecordID: 'OrderID|o-1||LineNo|2', VectorJSON: '[1,0]' }],
                }),
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
                'MJ: Entity Record Documents': () => ({ Success: true, Results: storedRows }),
                Members: () => ({ Success: false, Results: [], ErrorMessage: 'bad filter' }),
            });

            const result = await new FetchEntityVectorsResolver().FetchEntityVectors(DOC_ID, undefined, 'nonsense', appContext(membersEntity));

            expect(result.Success).toBe(false);
            expect(result.Results).toEqual([]);
            expect(result.ErrorMessage).toBe('Failed to load "Members" records: bad filter');
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
