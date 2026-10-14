/**
 * Server-side writes must drop the client's RunView dedup-linger entries.
 *
 * The linger cache (ProviderBase.DedupLingerMs, 5s) replays an identical RunView answered in the
 * last 5s, and only a BaseEntity save/delete event raised in THIS process invalidated it. A Remote
 * Operation, an Action, an agent run — any mutation that wrote server-side — left the client serving
 * pre-operation rows for up to 5s (found by the BizApps Voting wire tests). The GraphQL transport
 * now invalidates after every mutation; queries leave the cache alone.
 *
 * A mutation whose writes are known up front scopes the drop: entity Save()/Delete() and transaction
 * groups pass their entities (ExecuteGQLOptions.AffectedEntityNames), so routine saves no longer
 * discard every other entity's lingered and in-flight RunViews.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { EntityDeleteOptions, EntitySaveOptions, TransactionItem, TransactionResult, UserInfo } from '@memberjunction/core';
import { GraphQLProviderConfigData } from '../graphQLDataProvider';
import { FirstGraphQLOperationKind, IsGraphQLMutation } from '../graphQLOperationKind';
import { GraphQLTransactionGroup } from '../graphQLTransactionGroup';
import { FakeGraphQLResponseError, GraphQLWire } from './support/graphQLWire';
import {
    BuildCustomerEntityInfo,
    BuildTestUser,
    BuildUserViewEntityInfo,
    CreateWireTestProvider,
    CUSTOMER_ENTITY_ID,
    ResetGraphQLProviderSingleton,
    TestCustomerEntity,
    USER_VIEW_ENTITY_ID,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

describe('IsGraphQLMutation', () => {
    it.each([
        ['mutation Save($input: X!) { Save(input: $input) { ID } }', true],
        ['  \n mutation { Ping }', true],
        ['# leading comment\nmutation ExecuteRemoteOperation($k: String!) { X }', true],
        ['fragment F on T { a }\nmutation M { m { ...F } }', true],
        ['mutation@dir { m }', true],
        ['query RunViewQuery ($input: RunDynamicViewInput!) { R(input: $input) { Success } }', false],
        ['{ Ping { Pong } }', false],
        ['# mutation in a comment\nquery Q { a }', false],
        ['subscription S { s }', false],
        ['query mutationHistory { mutationHistory { ID } }', false],
        ['', false],
        // Only TOP-LEVEL tokens decide: selections, arguments and strings are skipped.
        ['fragment F on Report { query }\nmutation M { m { ...F } }', true],
        ['fragment Details on Report {\n  query { id }\n}\nmutation UpdateReport($id: ID!) {\n  updateReport(id: $id) { ...Details }\n}', true],
        ['query Q { search(text: "mutation M { x }") { id } }', false],
        ['query Q { search(text: """\nmutation M { x }\n""") { id } }', false],
        ['query Q { search(text: "escaped \\" mutation { x }") { id } }', false],
        ['fragment F on T @dir(arg: { query: 1, nested: [{ a: "}" }] }) { a }\nmutation M { m }', true],
        ['fragment F on T { query { id } }\nquery Q { q { ...F } }', false],
        ['fragment F on T { mutation }\n{ q { ...F } }', false],
        ['mutation M($v: In = { query: 1 }) { m(v: $v) }', true],
    ])('%j -> %s', (doc, expected) => {
        expect(IsGraphQLMutation(doc)).toBe(expected);
    });

    it('treats null/undefined as not a mutation', () => {
        expect(IsGraphQLMutation(null)).toBe(false);
        expect(IsGraphQLMutation(undefined)).toBe(false);
    });
});

describe('FirstGraphQLOperationKind', () => {
    it.each([
        ['subscription S { s }', 'subscription'],
        ['{ a }', 'query'],
        ['fragment F on T { a }', null],
        ['# only a comment', null],
        ['fragment F on T { a }\nsubscription S { s { ...F } }', 'subscription'],
    ])('%j -> %s', (doc, expected) => {
        expect(FirstGraphQLOperationKind(doc)).toBe(expected);
    });
});

describe('GraphQLDataProvider drops RunView dedup-linger entries after mutations', () => {
    let provider: WireTestGraphQLProvider;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
    });

    afterEach(() => {
        ResetGraphQLProviderSingleton();
    });

    it('a mutation invalidates', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ RunAction: { Success: true } });
        await provider.ExecuteGQL('mutation RunAction($input: RunActionInput!) { RunAction(input: $input) { Success } }', { input: {} });
        expect(spy).toHaveBeenCalledTimes(1);
        // No known entities: every entry is dropped.
        expect(spy.mock.calls[0][0]).toBeUndefined();
    });

    it('a mutation with AffectedEntityNames invalidates only those entities', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ M: { ok: true } });
        await provider.ExecuteGQL('mutation M { M { ok } }', {}, true, { AffectedEntityNames: ['Customers'] });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(['Customers']);
    });

    it('AffectedEntityNames is ignored for a query', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ Ping: { Pong: true } });
        await provider.ExecuteGQL('query Ping { Ping { Pong } }', {}, true, { AffectedEntityNames: ['Customers'] });
        expect(spy).not.toHaveBeenCalled();
    });

    it('the token-refresh retry keeps the scope', async () => {
        const config = new GraphQLProviderConfigData('stale-jwt', 'http://localhost:4000/graphql', '', async () => 'fresh-jwt');
        provider = CreateWireTestProvider(config);
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueError(new FakeGraphQLResponseError('jwt expired', 'JWT_EXPIRED'));
        GraphQLWire.EnqueueResponse({ M: { ok: true } });

        await provider.ExecuteGQL('mutation M { M { ok } }', {}, true, { AffectedEntityNames: ['Customers'] });

        expect(GraphQLWire.Requests).toHaveLength(2);
        expect(spy.mock.calls.length).toBeGreaterThan(0);
        for (const call of spy.mock.calls) {
            expect(call[0]).toEqual(['Customers']);
        }
    });

    it('a failed mutation still invalidates (it may have written part-way)', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueError(new FakeGraphQLResponseError('nope', 'INTERNAL'));
        await expect(provider.ExecuteGQL('mutation M { m }', {})).rejects.toBeDefined();
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('a query does not invalidate', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ Ping: { Pong: true } });
        await provider.ExecuteGQL('query Ping { Ping { Pong } }', {});
        expect(spy).not.toHaveBeenCalled();
    });

    it('a Remote Operation routed over the wire invalidates', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({
            ExecuteRemoteOperation: { success: true, resultCode: 'OK', outputJSON: '{"closed":true}', handle: null, errorMessage: null },
        });
        const result = await provider.RouteOperation<{ BallotID: string }, { closed: boolean }>('Ballots.Close', { BallotID: 'b-1' });
        expect(result.Success).toBe(true);
        expect(result.Output).toEqual({ closed: true });
        expect(GraphQLWire.LastRequest.document).toContain('mutation ExecuteRemoteOperation');
        expect(spy).toHaveBeenCalled();
    });
});

describe('entity Save/Delete and transaction groups scope the invalidation to their entities', () => {
    let provider: WireTestGraphQLProvider;
    let user: UserInfo;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
        provider.RegisterTestEntity(BuildCustomerEntityInfo());
        provider.RegisterTestEntity(BuildUserViewEntityInfo());
        user = BuildTestUser(provider);
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        ResetGraphQLProviderSingleton();
    });

    function newCustomer(): TestCustomerEntity {
        const entity = new TestCustomerEntity(BuildCustomerEntityInfo(), provider);
        entity.NewRecord();
        entity.Set('Name', 'Acme');
        return entity;
    }

    function loadedCustomer(): TestCustomerEntity {
        const entity = new TestCustomerEntity(BuildCustomerEntityInfo(), provider);
        entity.LoadFromData({ ID: 'CUST-0001', Name: 'Old Name', Tier: 'Gold', IsActive: true });
        return entity;
    }

    /** A RunViews wire response with one row of the given entity. */
    function runViewsResponse(entityId: string, row: Record<string, unknown>): Record<string, unknown> {
        return {
            RunViews: [{
                Results: [{ PrimaryKey: [{ FieldName: 'ID', Value: String(row['ID']) }], EntityID: entityId, Data: JSON.stringify(row) }],
                UserViewRunID: '', RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, Success: true, ErrorMessage: '',
            }],
        };
    }

    it('Save passes its own entity', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ CreateCRMCustomer: { ID: 'NEW-1', Name: 'Acme' } });
        await provider.Save(newCustomer(), user, new EntitySaveOptions());
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(['Customers']);
    });

    it('Delete passes its own entity', async () => {
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({ DeleteCRMCustomer: { ID: 'CUST-0001' } });
        await provider.Delete(loadedCustomer(), new EntityDeleteOptions(), user);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(['Customers']);
    });

    it('a transaction group passes the distinct entities of its items', async () => {
        class SubmittableTransactionGroup extends GraphQLTransactionGroup {
            public Submitted(): Promise<TransactionResult[]> {
                return this.HandleSubmit();
            }
            public get Pending(): TransactionItem[] {
                return this.PendingTransactions;
            }
        }
        const group = new SubmittableTransactionGroup(provider);
        for (const entity of [newCustomer(), newCustomer()]) {
            entity.TransactionGroup = group;
            await provider.Save(entity, user, new EntitySaveOptions());
        }
        expect(group.Pending).toHaveLength(2);
        const spy = vi.spyOn(provider, 'InvalidateRunViewDedupCache');
        GraphQLWire.EnqueueResponse({
            ExecuteTransactionGroup: { Success: true, ErrorMessages: [], ResultsJSON: ['{"ID":"N1"}', '{"ID":"N2"}'] },
        });

        await group.Submitted();

        expect(GraphQLWire.LastRequest.document).toContain('ExecuteTransactionGroup');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(['Customers']);
    });

    it("a Save keeps another entity's lingered RunView but drops its own entity's", async () => {
        GraphQLWire.EnqueueResponse(runViewsResponse(USER_VIEW_ENTITY_ID, { ID: 'v1', Name: 'View One' }));
        const views1 = await provider.RunView<Record<string, unknown>>({ EntityName: 'Test User Views', ExtraFilter: "Name='a'", ResultType: 'simple' });
        GraphQLWire.EnqueueResponse(runViewsResponse(CUSTOMER_ENTITY_ID, { ID: 'c1', Name: 'Before' }));
        const customers1 = await provider.RunView<Record<string, unknown>>({ EntityName: 'Customers', ExtraFilter: "Tier='Gold'", ResultType: 'simple' });
        expect(views1.Results).toEqual([{ ID: 'v1', Name: 'View One' }]);
        expect(customers1.Results).toEqual([{ ID: 'c1', Name: 'Before' }]);
        const requestsBeforeSave = GraphQLWire.Requests.length;

        GraphQLWire.EnqueueResponse({ CreateCRMCustomer: { ID: 'NEW-1', Name: 'Acme' } });
        await provider.Save(newCustomer(), user, new EntitySaveOptions());
        expect(GraphQLWire.Requests.length).toBe(requestsBeforeSave + 1);

        // The unrelated entity's identical RunView is still answered from the linger window...
        const views2 = await provider.RunView<Record<string, unknown>>({ EntityName: 'Test User Views', ExtraFilter: "Name='a'", ResultType: 'simple' });
        expect(views2.Results).toEqual([{ ID: 'v1', Name: 'View One' }]);
        expect(GraphQLWire.Requests.length).toBe(requestsBeforeSave + 1);

        // ...while the saved entity's goes back to the server.
        GraphQLWire.EnqueueResponse(runViewsResponse(CUSTOMER_ENTITY_ID, { ID: 'c1', Name: 'After' }));
        const customers2 = await provider.RunView<Record<string, unknown>>({ EntityName: 'Customers', ExtraFilter: "Tier='Gold'", ResultType: 'simple' });
        expect(customers2.Results).toEqual([{ ID: 'c1', Name: 'After' }]);
        expect(GraphQLWire.Requests.length).toBe(requestsBeforeSave + 2);
    });

    it('an unscoped mutation still drops every lingered RunView', async () => {
        GraphQLWire.EnqueueResponse(runViewsResponse(USER_VIEW_ENTITY_ID, { ID: 'v1', Name: 'View One' }));
        await provider.RunView<Record<string, unknown>>({ EntityName: 'Test User Views', ExtraFilter: "Name='b'", ResultType: 'simple' });

        GraphQLWire.EnqueueResponse({ RunAction: { Success: true } });
        await provider.ExecuteGQL('mutation RunAction { RunAction { Success } }', {});

        GraphQLWire.EnqueueResponse(runViewsResponse(USER_VIEW_ENTITY_ID, { ID: 'v1', Name: 'View One (fresh)' }));
        const again = await provider.RunView<Record<string, unknown>>({ EntityName: 'Test User Views', ExtraFilter: "Name='b'", ResultType: 'simple' });
        expect(again.Results).toEqual([{ ID: 'v1', Name: 'View One (fresh)' }]);
    });
});
