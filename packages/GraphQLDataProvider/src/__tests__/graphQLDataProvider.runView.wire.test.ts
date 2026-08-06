/**
 * RunView-over-the-wire behavioral tests for the REAL GraphQLDataProvider.
 *
 * Only the graphql-request boundary is faked (see ./support/graphQLWire.ts); the
 * provider, ProviderBase orchestration, EntityInfo metadata, and FieldMapper are all
 * production code. Each test asserts the exact (document, variables) pair the provider
 * puts on the wire and/or how the wire response round-trips back into RunView results.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { CompositeKey, ProviderBase } from '@memberjunction/core';
import { ViewColumnInfo } from '@memberjunction/core-entities';
import { GraphQLWire } from './support/graphQLWire';
import {
    BuildCustomerEntityInfo,
    BuildLoadedUserView,
    CreateWireTestProvider,
    CUSTOMER_ENTITY_ID,
    ResetGraphQLProviderSingleton,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

/** Narrow the last request's `input` variable to a record after a runtime shape check. */
function lastInputRecord(): Record<string, unknown> {
    const input = GraphQLWire.LastInput;
    expect(input).toBeTypeOf('object');
    return input as Record<string, unknown>;
}

/** Standard successful single-view response envelope keyed by the query name. */
function singleViewResponse(queryName: string, rows: Record<string, unknown>[]): Record<string, unknown> {
    return {
        [queryName]: {
            Results: rows,
            UserViewRunID: '',
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: 7,
            Success: true,
            ErrorMessage: '',
        },
    };
}

describe('GraphQLDataProvider RunView wire behavior', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
        provider.RegisterTestEntity(BuildCustomerEntityInfo());
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        ResetGraphQLProviderSingleton();
    });

    describe('InternalRunView — dynamic views', () => {
        it('builds a RunDynamicViewInput query against the schema-prefixed GraphQL type', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({ EntityName: 'Customers', Fields: ['Name'] });

            expect(GraphQLWire.Requests).toHaveLength(1);
            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('query RunViewQuery ($input: RunDynamicViewInput!)');
            expect(doc).toContain('RunCRMCustomerDynamicView(input: $input)');
            // The full result envelope is always requested
            for (const envelopeField of ['UserViewRunID', 'RowCount', 'TotalRowCount', 'ExecutionTime', 'Success', 'ErrorMessage']) {
                expect(doc).toContain(envelopeField);
            }
        });

        it('passes ExtraFilter/OrderBy/Fields/MaxRows/StartRow/ResultType through to the input variables', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({
                EntityName: 'Customers',
                ExtraFilter: 'IsActive = 1',
                OrderBy: 'Name ASC',
                Fields: ['Name', '__mj_CreatedAt'],
                MaxRows: 25,
                StartRow: 50,
                ResultType: 'entity_object',
            });

            expect(GraphQLWire.LastRequest.variables).toEqual({
                input: {
                    EntityName: 'Customers',
                    ExtraFilter: 'IsActive = 1',
                    OrderBy: 'Name ASC',
                    UserSearchString: '',
                    // Fields pass through UNMAPPED — the server maps __mj_ prefixes itself
                    Fields: ['Name', '__mj_CreatedAt'],
                    IgnoreMaxRows: false,
                    MaxRows: 25,
                    StartRow: 50,
                    ForceAuditLog: false,
                    ResultType: 'entity_object',
                },
            });
        });

        it('applies defaults and omits optional keys when params are minimal', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({ EntityName: 'Customers' });

            const input = lastInputRecord();
            expect(input['ExtraFilter']).toBe('');
            expect(input['OrderBy']).toBe('');
            expect(input['UserSearchString']).toBe('');
            expect(input['IgnoreMaxRows']).toBe(false);
            expect(input['ForceAuditLog']).toBe(false);
            expect(input['ResultType']).toBe('simple');
            // MaxRows/StartRow only ride the wire when the caller provided them
            expect(Object.prototype.hasOwnProperty.call(input, 'MaxRows')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(input, 'StartRow')).toBe(false);
            // Saved-view-only params never appear on a dynamic view input
            expect(Object.prototype.hasOwnProperty.call(input, 'ExcludeUserViewRunID')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(input, 'SaveViewResults')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(input, 'OverrideExcludeFilter')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(input, 'ExcludeDataFromAllPriorViewRuns')).toBe(false);
            // And the conditional extras are absent by default
            expect(Object.prototype.hasOwnProperty.call(input, 'BypassCache')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(input, 'AuditLogDescription')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(input, 'Aggregates')).toBe(false);
        });

        it('always includes the primary key in the selection set and maps __mj_ field names for transport', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({
                EntityName: 'Customers',
                Fields: ['Name', '__mj_CreatedAt'], // note: ID intentionally NOT requested
            });

            const doc = GraphQLWire.LastRequest.document;
            // PK is auto-added to the selection even though the caller did not ask for it
            expect(doc).toMatch(/Results\s*\{\s*ID\b/);
            // __mj_ prefix is reserved in GraphQL — mapped to _mj__ in the selection set
            expect(doc).toContain('_mj__CreatedAt');
            expect(doc).not.toContain('__mj_CreatedAt');
        });

        it('selects every non-binary field (mapped CodeNames) when no Fields are requested', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({ EntityName: 'Customers' });

            const doc = GraphQLWire.LastRequest.document;
            for (const expected of ['ID', 'Name', 'First_Name', 'Tier', 'IsActive', 'Age', 'SignedUpAt', '_mj__CreatedAt', '_mj__UpdatedAt']) {
                expect(doc).toContain(expected);
            }
            // varbinary column is excluded from dynamic-view selections
            expect(doc).not.toContain('Photo');
        });

        it('forwards BypassCache only when the caller explicitly set it', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers', BypassCache: true });
            expect(lastInputRecord()['BypassCache']).toBe(true);

            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers', BypassCache: false });
            expect(lastInputRecord()['BypassCache']).toBe(false);

            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers' });
            expect(Object.prototype.hasOwnProperty.call(lastInputRecord(), 'BypassCache')).toBe(false);
        });

        it('includes AuditLogDescription only when non-empty', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers', AuditLogDescription: 'compliance read' });
            expect(lastInputRecord()['AuditLogDescription']).toBe('compliance read');

            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers', AuditLogDescription: '' });
            expect(Object.prototype.hasOwnProperty.call(lastInputRecord(), 'AuditLogDescription')).toBe(false);
        });

        it('maps Aggregates into the input and requests AggregateResults in the document', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({
                EntityName: 'Customers',
                Aggregates: [{ expression: 'COUNT(*)', alias: 'total' }, { expression: 'AVG(Age)', alias: 'avgAge' }],
            });

            expect(lastInputRecord()['Aggregates']).toEqual([
                { expression: 'COUNT(*)', alias: 'total' },
                { expression: 'AVG(Age)', alias: 'avgAge' },
            ]);
            expect(GraphQLWire.LastRequest.document).toContain('AggregateResults');
            expect(GraphQLWire.LastRequest.document).toContain('AggregateExecutionTime');

            // Without aggregates, the aggregate response block is not requested
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers' });
            expect(GraphQLWire.LastRequest.document).not.toContain('AggregateResults');
        });

        it('reverse-maps _mj__ fields and mirrors CodeName values back onto space-containing field names in results', async () => {
            GraphQLWire.EnqueueResponse(
                singleViewResponse('RunCRMCustomerDynamicView', [
                    { ID: 'r1', Name: 'Acme', First_Name: 'Jo', _mj__CreatedAt: '2026-01-01T00:00:00Z' },
                ])
            );

            const result = await provider.CallInternalRunView<Record<string, unknown>>({ EntityName: 'Customers' });

            expect(result.Success).toBe(true);
            const row = result.Results[0];
            // FieldMapper round-trip: _mj__CreatedAt (wire) → __mj_CreatedAt (client)
            expect(row['__mj_CreatedAt']).toBe('2026-01-01T00:00:00Z');
            expect(Object.prototype.hasOwnProperty.call(row, '_mj__CreatedAt')).toBe(false);
            // CodeName → Name mirroring: 'First_Name' (wire) also exposed as 'First Name'
            expect(row['First Name']).toBe('Jo');
            // The CodeName copy is intentionally retained
            expect(row['First_Name']).toBe('Jo');
        });

        it('returns the server result envelope verbatim (RowCount/TotalRowCount/ExecutionTime)', async () => {
            GraphQLWire.EnqueueResponse({
                RunCRMCustomerDynamicView: {
                    Results: [{ ID: 'r1', Name: 'Acme' }],
                    UserViewRunID: 'RUN-9',
                    RowCount: 1,
                    TotalRowCount: 42,
                    ExecutionTime: 13,
                    Success: true,
                    ErrorMessage: '',
                },
            });

            const result = await provider.CallInternalRunView<Record<string, unknown>>({ EntityName: 'Customers' });

            expect(result.RowCount).toBe(1);
            expect(result.TotalRowCount).toBe(42);
            expect(result.ExecutionTime).toBe(13);
            expect(result.UserViewRunID).toBe('RUN-9');
        });

        it('throws when the entity is not found in metadata', async () => {
            await expect(
                provider.CallInternalRunView({ EntityName: 'Nonexistent Entity' })
            ).rejects.toThrow('Entity Nonexistent Entity not found in metadata');
            expect(GraphQLWire.Requests).toHaveLength(0);
        });

        it('returns null when the response lacks the query-name key', async () => {
            GraphQLWire.EnqueueResponse({ SomethingElse: {} });
            const result = await provider.CallInternalRunView({ EntityName: 'Customers' });
            expect(result).toBeNull();
        });
    });

    describe('InternalRunView — saved views (ViewEntity targeting)', () => {
        it('routes ViewID params to Run<Type>ViewByID with RunViewByIDInput including saved-view defaults', async () => {
            const view = BuildLoadedUserView(provider, { ID: 'VIEW-0001' });
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByID', []));

            await provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001', Fields: ['Name'] });

            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('query RunViewQuery ($input: RunViewByIDInput!)');
            expect(doc).toContain('RunCRMCustomerViewByID(input: $input)');
            expect(GraphQLWire.LastRequest.variables).toEqual({
                input: {
                    ViewID: 'VIEW-0001',
                    ExtraFilter: '',
                    OrderBy: '',
                    UserSearchString: '',
                    Fields: ['Name'],
                    IgnoreMaxRows: false,
                    ForceAuditLog: false,
                    ResultType: 'simple',
                    // Saved-view-only params ride along with defaults
                    ExcludeUserViewRunID: '',
                    ExcludeDataFromAllPriorViewRuns: false,
                    OverrideExcludeFilter: '',
                    SaveViewResults: false,
                },
            });
        });

        it('routes ViewName params to Run<Type>ViewByName and passes saved-view extras through', async () => {
            const view = BuildLoadedUserView(provider, { Name: 'Active Customers' });
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByName', []));

            await provider.CallInternalRunView({
                ViewEntity: view,
                ViewName: 'Active Customers',
                Fields: ['Name'],
                ExcludeUserViewRunID: 'RUN-7',
                ExcludeDataFromAllPriorViewRuns: true,
                OverrideExcludeFilter: 'Age > 18',
                SaveViewResults: true,
            });

            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('query RunViewQuery ($input: RunViewByNameInput!)');
            expect(doc).toContain('RunCRMCustomerViewByName(input: $input)');
            const input = lastInputRecord();
            expect(input['ViewName']).toBe('Active Customers');
            expect(input['ExcludeUserViewRunID']).toBe('RUN-7');
            expect(input['ExcludeDataFromAllPriorViewRuns']).toBe(true);
            expect(input['OverrideExcludeFilter']).toBe('Age > 18');
            expect(input['SaveViewResults']).toBe(true);
            expect(Object.prototype.hasOwnProperty.call(input, 'EntityName')).toBe(false);
        });

        it('builds the selection set from visible view columns when no Fields are requested', async () => {
            const customerInfo = BuildCustomerEntityInfo();
            provider.RegisterTestEntity(customerInfo);
            const view = BuildLoadedUserView(provider);
            const fieldByName = (name: string) => customerInfo.Fields.find((f) => f.Name === name);
            view.SetTestColumns([
                new ViewColumnInfo({ ID: 'C1', Name: 'Name', hidden: false, EntityField: fieldByName('Name') }),
                new ViewColumnInfo({ ID: 'C2', Name: 'First Name', hidden: false, EntityField: fieldByName('First Name') }),
                new ViewColumnInfo({ ID: 'C3', Name: 'Age', hidden: true, EntityField: fieldByName('Age') }),
                // Column whose EntityField no longer exists on the entity — skipped, not fatal
                new ViewColumnInfo({ ID: 'C4', Name: 'Ghost', hidden: false }),
            ]);
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByID', []));

            await provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001' });

            const doc = GraphQLWire.LastRequest.document;
            // PK always first, then visible columns by CodeName
            expect(doc).toMatch(/Results\s*\{\s*ID\b/);
            expect(doc).toContain('Name');
            expect(doc).toContain('First_Name');
            // Hidden column excluded; ghost column skipped
            expect(doc).not.toContain('Age');
            expect(doc).not.toContain('Ghost');
        });
    });

    describe('InternalRunViews — batched views', () => {
        it('sends a single RunViews query with one RunViewGenericInput per view', async () => {
            GraphQLWire.EnqueueResponse({ RunViews: [] });

            await provider.CallInternalRunViews([
                { EntityName: 'Customers', ExtraFilter: 'IsActive = 1', Fields: ['Name'], MaxRows: 10 },
                { EntityName: 'Customers', OrderBy: 'Name DESC' },
            ]);

            expect(GraphQLWire.Requests).toHaveLength(1);
            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('query RunViewsQuery ($input: [RunViewGenericInput!]!)');
            expect(doc).toContain('RunViews(input: $input)');
            // Batched results come back as generic rows: PrimaryKey + EntityID + serialized Data
            expect(doc).toContain('PrimaryKey');
            expect(doc).toContain('EntityID');
            expect(doc).toContain('Data');

            const input = GraphQLWire.LastInput;
            expect(Array.isArray(input)).toBe(true);
            expect(input).toEqual([
                {
                    EntityName: 'Customers',
                    ExtraFilter: 'IsActive = 1',
                    OrderBy: '',
                    UserSearchString: '',
                    Fields: ['Name'],
                    IgnoreMaxRows: false,
                    MaxRows: 10,
                    ForceAuditLog: false,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'Customers',
                    ExtraFilter: '',
                    OrderBy: 'Name DESC',
                    UserSearchString: '',
                    IgnoreMaxRows: false,
                    ForceAuditLog: false,
                    ResultType: 'simple',
                },
            ]);
        });

        it('serializes AfterKey keyset cursors as KeyValuePairs', async () => {
            GraphQLWire.EnqueueResponse({ RunViews: [] });

            await provider.CallInternalRunViews([
                { EntityName: 'Customers', AfterKey: CompositeKey.FromID('r-99'), MaxRows: 500 },
            ]);

            expect(GraphQLWire.LastInput).toEqual([
                expect.objectContaining({
                    EntityName: 'Customers',
                    MaxRows: 500,
                    AfterKey: { KeyValuePairs: [expect.objectContaining({ FieldName: 'ID', Value: 'r-99' })] },
                }),
            ]);
        });

        it('deserializes each row\'s Data JSON and reverse-maps __mj_ fields per result', async () => {
            GraphQLWire.EnqueueResponse({
                RunViews: [
                    {
                        Results: [
                            {
                                PrimaryKey: [{ FieldName: 'ID', Value: 'r1' }],
                                EntityID: CUSTOMER_ENTITY_ID,
                                Data: JSON.stringify({ ID: 'r1', Name: 'Acme', _mj__CreatedAt: '2026-02-02T00:00:00Z' }),
                            },
                        ],
                        UserViewRunID: '',
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 4,
                        Success: true,
                        ErrorMessage: '',
                    },
                    {
                        Results: [],
                        UserViewRunID: '',
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 2,
                        Success: true,
                        ErrorMessage: '',
                    },
                ],
            });

            const results = await provider.CallInternalRunViews<Record<string, unknown>>([
                { EntityName: 'Customers' },
                { EntityName: 'Customers', ExtraFilter: 'Age > 30' },
            ]);

            expect(results).toHaveLength(2);
            expect(results[0].Results).toEqual([
                { ID: 'r1', Name: 'Acme', __mj_CreatedAt: '2026-02-02T00:00:00Z' },
            ]);
            expect(results[1].Results).toEqual([]);
            expect(results[1].Success).toBe(true);
        });
    });

    describe('public RunView through the REAL ProviderBase orchestration (client mode)', () => {
        const originalCoalesce = ProviderBase.CoalesceWindowMs;
        const originalLinger = ProviderBase.DedupLingerMs;

        beforeEach(() => {
            // Make execution deterministic: no coalesce timers, no linger reuse
            ProviderBase.CoalesceWindowMs = 0;
            ProviderBase.DedupLingerMs = 0;
        });

        afterEach(() => {
            ProviderBase.CoalesceWindowMs = originalCoalesce;
            ProviderBase.DedupLingerMs = originalLinger;
        });

        it('delegates single RunView calls to the batched RunViews wire query and returns deserialized rows', async () => {
            GraphQLWire.EnqueueResponse({
                RunViews: [
                    {
                        Results: [
                            {
                                PrimaryKey: [{ FieldName: 'ID', Value: 'r1' }],
                                EntityID: CUSTOMER_ENTITY_ID,
                                Data: JSON.stringify({ ID: 'r1', Name: 'Acme', _mj__UpdatedAt: '2026-03-03T00:00:00Z' }),
                            },
                        ],
                        UserViewRunID: '',
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 5,
                        Success: true,
                        ErrorMessage: '',
                    },
                ],
            });

            const result = await provider.RunView<Record<string, unknown>>({
                EntityName: 'Customers',
                ExtraFilter: 'Age > 21',
                ResultType: 'simple',
            });

            // Client mode routed through the batch pipeline — the wire saw RunViews, not a single-view query
            expect(GraphQLWire.Requests).toHaveLength(1);
            expect(GraphQLWire.LastRequest.document).toContain('RunViews(input: $input)');
            expect(GraphQLWire.LastInput).toEqual([
                expect.objectContaining({ EntityName: 'Customers', ExtraFilter: 'Age > 21', ResultType: 'simple' }),
            ]);

            expect(result.Success).toBe(true);
            expect(result.Results).toEqual([{ ID: 'r1', Name: 'Acme', __mj_UpdatedAt: '2026-03-03T00:00:00Z' }]);
        });

        it('returns per-index results for a public RunViews batch', async () => {
            GraphQLWire.EnqueueResponse({
                RunViews: [
                    {
                        Results: [
                            {
                                PrimaryKey: [{ FieldName: 'ID', Value: 'a' }],
                                EntityID: CUSTOMER_ENTITY_ID,
                                Data: JSON.stringify({ ID: 'a', Name: 'First' }),
                            },
                        ],
                        UserViewRunID: '', RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, Success: true, ErrorMessage: '',
                    },
                    {
                        Results: [
                            {
                                PrimaryKey: [{ FieldName: 'ID', Value: 'b' }],
                                EntityID: CUSTOMER_ENTITY_ID,
                                Data: JSON.stringify({ ID: 'b', Name: 'Second' }),
                            },
                        ],
                        UserViewRunID: '', RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, Success: true, ErrorMessage: '',
                    },
                ],
            });

            const [first, second] = await provider.RunViews<Record<string, unknown>>([
                { EntityName: 'Customers', ExtraFilter: "Tier = 'Gold'" },
                { EntityName: 'Customers', ExtraFilter: "Tier = 'Silver'" },
            ]);

            expect(first.Results).toEqual([{ ID: 'a', Name: 'First' }]);
            expect(second.Results).toEqual([{ ID: 'b', Name: 'Second' }]);
        });
    });

    describe('RunViewsWithCacheCheck', () => {
        it('builds the smart-cache input with normalized params, Aggregates, and cacheStatus', async () => {
            GraphQLWire.EnqueueResponse({
                RunViewsWithCacheCheck: { success: true, errorMessage: null, results: [] },
            });

            await provider.RunViewsWithCacheCheck([
                {
                    params: {
                        EntityName: 'Customers',
                        ExtraFilter: 'IsActive = 1',
                        Aggregates: [{ expression: 'COUNT(*)', alias: 'total' }],
                    },
                    cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00Z', rowCount: 12 },
                },
                { params: { EntityName: 'Customers' } },
            ]);

            expect(GraphQLWire.LastRequest.document).toContain('RunViewsWithCacheCheck(input: $input)');
            expect(GraphQLWire.LastInput).toEqual([
                {
                    params: {
                        EntityName: 'Customers',
                        ExtraFilter: 'IsActive = 1',
                        OrderBy: '',
                        Fields: undefined,
                        UserSearchString: '',
                        IgnoreMaxRows: false,
                        MaxRows: undefined,
                        StartRow: undefined,
                        AfterKey: null,
                        ForceAuditLog: false,
                        AuditLogDescription: '',
                        ResultType: 'simple',
                        // B40 regression guard: the aggregate request must ride the smart-cache input
                        Aggregates: [{ expression: 'COUNT(*)', alias: 'total' }],
                    },
                    cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00Z', rowCount: 12 },
                },
                {
                    params: {
                        EntityName: 'Customers',
                        ExtraFilter: '',
                        OrderBy: '',
                        Fields: undefined,
                        UserSearchString: '',
                        IgnoreMaxRows: false,
                        MaxRows: undefined,
                        StartRow: undefined,
                        AfterKey: null,
                        ForceAuditLog: false,
                        AuditLogDescription: '',
                        ResultType: 'simple',
                        Aggregates: null,
                    },
                    cacheStatus: null,
                },
            ]);
        });

        it('deserializes stale results and JSON-parses aggregate values', async () => {
            GraphQLWire.EnqueueResponse({
                RunViewsWithCacheCheck: {
                    success: true,
                    errorMessage: null,
                    results: [
                        { viewIndex: 0, status: 'current', maxUpdatedAt: '2026-01-01T00:00:00Z', rowCount: 12 },
                        {
                            viewIndex: 1,
                            status: 'stale',
                            maxUpdatedAt: '2026-04-01T00:00:00Z',
                            rowCount: 1,
                            Results: [
                                {
                                    PrimaryKey: [{ FieldName: 'ID', Value: 'r1' }],
                                    EntityID: CUSTOMER_ENTITY_ID,
                                    Data: JSON.stringify({ ID: 'r1', Name: 'Acme', _mj__CreatedAt: '2026-04-01T00:00:00Z' }),
                                },
                            ],
                            aggregateResults: [
                                { expression: 'COUNT(*)', alias: 'total', value: '42' },
                                { expression: 'MAX(Name)', alias: 'maxName', value: '"Zeta"' },
                            ],
                        },
                    ],
                },
            });

            const response = await provider.RunViewsWithCacheCheck<Record<string, unknown>>([
                { params: { EntityName: 'Customers' }, cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00Z', rowCount: 12 } },
                { params: { EntityName: 'Customers' } },
            ]);

            expect(response.success).toBe(true);
            expect(response.results[0].status).toBe('current');
            expect(response.results[0].results).toBeUndefined();

            expect(response.results[1].status).toBe('stale');
            expect(response.results[1].results).toEqual([
                { ID: 'r1', Name: 'Acme', __mj_CreatedAt: '2026-04-01T00:00:00Z' },
            ]);
            // Server JSON-stringifies aggregate values to preserve types — the client parses them back
            expect(response.results[1].aggregateResults).toEqual([
                { expression: 'COUNT(*)', alias: 'total', value: 42, error: undefined },
                { expression: 'MAX(Name)', alias: 'maxName', value: 'Zeta', error: undefined },
            ]);
        });

        it('deserializes differential updatedRows and carries deletedRecordIDs', async () => {
            GraphQLWire.EnqueueResponse({
                RunViewsWithCacheCheck: {
                    success: true,
                    errorMessage: null,
                    results: [
                        {
                            viewIndex: 0,
                            status: 'differential',
                            maxUpdatedAt: '2026-05-05T00:00:00Z',
                            rowCount: 10,
                            differentialData: {
                                updatedRows: [
                                    {
                                        PrimaryKey: [{ FieldName: 'ID', Value: 'r2' }],
                                        EntityID: CUSTOMER_ENTITY_ID,
                                        Data: JSON.stringify({ ID: 'r2', Name: 'Updated', _mj__UpdatedAt: '2026-05-05T00:00:00Z' }),
                                    },
                                ],
                                deletedRecordIDs: ['r7', 'r8'],
                            },
                        },
                    ],
                },
            });

            const response = await provider.RunViewsWithCacheCheck<Record<string, unknown>>([
                { params: { EntityName: 'Customers' }, cacheStatus: { maxUpdatedAt: '2026-01-01T00:00:00Z', rowCount: 12 } },
            ]);

            expect(response.results[0].status).toBe('differential');
            expect(response.results[0].differentialData).toEqual({
                updatedRows: [{ ID: 'r2', Name: 'Updated', __mj_UpdatedAt: '2026-05-05T00:00:00Z' }],
                deletedRecordIDs: ['r7', 'r8'],
            });
        });

        it('returns a failed response (never throws) when the wire errors', async () => {
            GraphQLWire.EnqueueError(new Error('socket hang up'));

            const response = await provider.RunViewsWithCacheCheck([
                { params: { EntityName: 'Customers' } },
            ]);

            expect(response.success).toBe(false);
            expect(response.results).toEqual([]);
            expect(response.errorMessage).toBe('socket hang up');
        });
    });
});
