/**
 * Binary-field wire behavior for the REAL GraphQLDataProvider.
 *
 * Binary DB fields (varbinary / bytea) are base64 strings in JS and on the wire. RunView leaves
 * them out unless the caller sets `IncludeBinaryFields: true`; a single-record Load always
 * hydrates them. Only graphql-request is faked (see ./support/graphQLWire.ts) — the Customers
 * fixture's `Photo` column is a varbinary field, so every assertion is on the exact document /
 * variables the provider puts on the wire.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { CompositeKey, UserInfo } from '@memberjunction/core';
import { ViewColumnInfo } from '@memberjunction/core-entities';
import { GraphQLWire } from './support/graphQLWire';
import {
    BuildCustomerEntityInfo,
    BuildLoadedUserView,
    BuildTestUser,
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    TestCustomerEntity,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';
import type { RunViewSystemUserInput } from '../graphQLSystemUserClient';

const PHOTO_BASE64 = 'AQIDBA==';

/** Narrow the last request's `input` variable to a record after a runtime shape check. */
function lastInputRecord(): Record<string, unknown> {
    const input = GraphQLWire.LastInput;
    expect(input).toBeTypeOf('object');
    return input as Record<string, unknown>;
}

function hasKey(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

/** The selection set inside `Results { ... }` of the last request's document. */
function lastResultsSelection(): string {
    const match = /Results\s*\{([^}]*)\}/.exec(GraphQLWire.LastRequest.document);
    expect(match, 'Results selection set').not.toBeNull();
    return match![1];
}

function singleViewResponse(queryName: string, rows: Record<string, unknown>[]): Record<string, unknown> {
    return {
        [queryName]: {
            Results: rows,
            UserViewRunID: '',
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: 1,
            Success: true,
            ErrorMessage: '',
        },
    };
}

describe('GraphQLDataProvider binary-field wire behavior', () => {
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
        it('forwards IncludeBinaryFields only when the caller set it (true / false / unset)', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers', IncludeBinaryFields: true });
            expect(lastInputRecord()['IncludeBinaryFields']).toBe(true);

            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers', IncludeBinaryFields: false });
            expect(lastInputRecord()['IncludeBinaryFields']).toBe(false);

            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));
            await provider.CallInternalRunView({ EntityName: 'Customers' });
            expect(hasKey(lastInputRecord(), 'IncludeBinaryFields')).toBe(false);
        });

        it('selects the binary field when IncludeBinaryFields is true and no Fields are given', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({ EntityName: 'Customers', IncludeBinaryFields: true });

            const selection = lastResultsSelection();
            expect(selection).toContain('Photo');
            // the non-binary fields are still all there
            for (const expected of ['ID', 'Name', 'First_Name', '_mj__CreatedAt']) {
                expect(selection).toContain(expected);
            }
        });

        it('leaves the binary field out when IncludeBinaryFields is false', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({ EntityName: 'Customers', IncludeBinaryFields: false });

            expect(lastResultsSelection()).not.toContain('Photo');
        });

        it('selects a binary field named explicitly in Fields regardless of the flag', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', []));

            await provider.CallInternalRunView({ EntityName: 'Customers', Fields: ['Name', 'Photo'] });

            expect(lastResultsSelection()).toContain('Photo');
        });

        it('returns a binary value as the base64 string the server sent', async () => {
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerDynamicView', [{ ID: 'c1', Name: 'Ada', Photo: PHOTO_BASE64 }]));

            const result = await provider.CallInternalRunView<Record<string, unknown>>({ EntityName: 'Customers', IncludeBinaryFields: true });

            expect(result.Results[0]['Photo']).toBe(PHOTO_BASE64);
        });
    });

    describe('InternalRunView — saved views', () => {
        function viewWithPhotoColumn() {
            const customerInfo = BuildCustomerEntityInfo();
            provider.RegisterTestEntity(customerInfo);
            const view = BuildLoadedUserView(provider);
            const fieldByName = (name: string) => customerInfo.Fields.find((f) => f.Name === name);
            view.SetTestColumns([
                new ViewColumnInfo({ ID: 'C1', Name: 'Name', hidden: false, EntityField: fieldByName('Name') }),
                new ViewColumnInfo({ ID: 'C2', Name: 'Photo', hidden: false, EntityField: fieldByName('Photo') }),
            ]);
            return view;
        }

        it('skips a visible binary view column unless IncludeBinaryFields is set', async () => {
            const view = viewWithPhotoColumn();
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByID', []));

            await provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001' });

            const selection = lastResultsSelection();
            expect(selection).toContain('Name');
            expect(selection).not.toContain('Photo');
            expect(hasKey(lastInputRecord(), 'IncludeBinaryFields')).toBe(false);
        });

        it('selects the visible binary view column when IncludeBinaryFields is true, and forwards the flag', async () => {
            const view = viewWithPhotoColumn();
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByID', []));

            await provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001', IncludeBinaryFields: true });

            expect(lastResultsSelection()).toContain('Photo');
            expect(lastInputRecord()['IncludeBinaryFields']).toBe(true);
        });

        it('still skips a HIDDEN binary view column even when IncludeBinaryFields is true', async () => {
            const customerInfo = BuildCustomerEntityInfo();
            provider.RegisterTestEntity(customerInfo);
            const view = BuildLoadedUserView(provider);
            view.SetTestColumns([
                new ViewColumnInfo({ ID: 'C1', Name: 'Name', hidden: false, EntityField: customerInfo.Fields.find((f) => f.Name === 'Name') }),
                new ViewColumnInfo({ ID: 'C2', Name: 'Photo', hidden: true, EntityField: customerInfo.Fields.find((f) => f.Name === 'Photo') }),
            ]);
            GraphQLWire.EnqueueResponse(singleViewResponse('RunCRMCustomerViewByID', []));

            await provider.CallInternalRunView({ ViewEntity: view, ViewID: 'VIEW-0001', IncludeBinaryFields: true });

            expect(lastResultsSelection()).not.toContain('Photo');
        });
    });

    describe('InternalRunViews — batched views', () => {
        it('forwards IncludeBinaryFields per view, omitting it where unset', async () => {
            GraphQLWire.EnqueueResponse({ RunViews: [] });

            await provider.CallInternalRunViews([
                { EntityName: 'Customers', IncludeBinaryFields: true },
                { EntityName: 'Customers', IncludeBinaryFields: false },
                { EntityName: 'Customers' },
            ]);

            const input = GraphQLWire.LastInput as Record<string, unknown>[];
            expect(input).toHaveLength(3);
            expect(input[0]['IncludeBinaryFields']).toBe(true);
            expect(input[1]['IncludeBinaryFields']).toBe(false);
            expect(hasKey(input[2], 'IncludeBinaryFields')).toBe(false);
        });

        it('deserializes a base64 binary value out of the Data JSON unchanged', async () => {
            GraphQLWire.EnqueueResponse({
                RunViews: [
                    {
                        Results: [{ PrimaryKey: [{ FieldName: 'ID', Value: 'c1' }], EntityID: 'x', Data: JSON.stringify({ ID: 'c1', Photo: PHOTO_BASE64 }) }],
                        UserViewRunID: '',
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        Success: true,
                        ErrorMessage: '',
                    },
                ],
            });

            const [result] = await provider.CallInternalRunViews<Record<string, unknown>>([{ EntityName: 'Customers', IncludeBinaryFields: true }]);

            expect(result.Results[0]['Photo']).toBe(PHOTO_BASE64);
        });
    });

    describe('RunViewsWithCacheCheck', () => {
        it('forwards IncludeBinaryFields in each params entry', async () => {
            GraphQLWire.EnqueueResponse({ RunViewsWithCacheCheck: { success: true, errorMessage: null, results: [] } });

            await provider.RunViewsWithCacheCheck([
                { params: { EntityName: 'Customers', IncludeBinaryFields: true } },
                { params: { EntityName: 'Customers' } },
            ]);

            const input = GraphQLWire.LastInput as { params: Record<string, unknown> }[];
            expect(input[0].params['IncludeBinaryFields']).toBe(true);
            expect(input[1].params['IncludeBinaryFields']).toBeUndefined();
        });
    });

    describe('Load (single record)', () => {
        let user: UserInfo;

        beforeEach(() => {
            user = BuildTestUser(provider);
        });

        it('selects binary fields and hands back the base64 value', async () => {
            GraphQLWire.EnqueueResponse({
                CRMCustomer: {
                    ID: 'CUST-0001', Name: 'Ada', First_Name: null, Tier: 'Gold', IsActive: true, Age: 42,
                    SignedUpAt: null, Photo: PHOTO_BASE64, _mj__CreatedAt: '2026-01-01T00:00:00Z', _mj__UpdatedAt: '2026-01-01T00:00:00Z',
                },
            });
            const entity = new TestCustomerEntity(BuildCustomerEntityInfo(), provider);

            const data = (await provider.Load(entity, CompositeKey.FromID('CUST-0001'), null, user)) as Record<string, unknown> | null;

            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('query SingleCRMCustomer');
            expect(doc).toContain('Photo');
            expect(data).not.toBeNull();
            expect(data!['Photo']).toBe(PHOTO_BASE64);
        });
    });
});

describe('RunViewSystemUserInput', () => {
    it('accepts IncludeBinaryFields (compile-time shape check)', () => {
        const input: RunViewSystemUserInput = { EntityName: 'Customers', IncludeBinaryFields: true };
        expect(input.IncludeBinaryFields).toBe(true);
    });
});
