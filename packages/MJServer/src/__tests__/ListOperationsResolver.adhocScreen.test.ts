// type-graphql decorators need the Reflect.metadata polyfill before the resolver module loads.
import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';

/**
 * `PreviewListDelta` and `ComposeLists` accept `ListSourceInput{Kind:'adhoc'}`, whose `ExtraFilter`
 * is client text that `ListOperations` hands to `RunView`. These tests drive the real resolver and
 * the real `ListOperations` over a provider double, and pin that the filter passes the same
 * base-view AST screen as `RunDynamicView` before any query runs. Payloads are harmless (stacked
 * `SELECT`s); the point is only whether they reach `RunView`.
 */

import type { DatabaseProviderBase, EntityInfo, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { SetDeltaTokenSecret } from '@memberjunction/lists';
import { ComposeListsInput, ComputeDeltaInput, ListOperationsResolver, ListSourceInput } from '../resolvers/ListOperationsResolver.js';
import type { AppContext } from '../types.js';

const BRACKET_STACKED =
    "1 = (SELECT 1 AS [a'])) ; SELECT 1 AS [x] ; SELECT * FROM crm.vwContacts WHERE (1 = (SELECT 1 AS [b'])";

const USER = { ID: 'user-1', Email: 'reader@example.com', Name: 'Reader' } as UserInfo;

/**
 * Provider double: entity metadata for the screen and ListOperations, a RunView that records its
 * params, and one snapshot-mode list whose stored `SourceFilterSnapshot` carries `snapshotWhere`.
 */
function fakeProvider(snapshotWhere = `Status = 'Active'`) {
    const calls: RunViewParams[] = [];
    const contacts = {
        ID: '6c6a8bb6-0000-4000-8000-000000000001',
        Name: 'Contacts',
        SchemaName: 'crm',
        BaseView: 'vwContacts',
        PrimaryKeys: [{ Name: 'ID' }],
        GetUserPermisions: () => ({ CanRead: true }),
    } as unknown as EntityInfo;
    const snapshotList = {
        ID: 'list-1',
        EntityID: contacts.ID,
        SourceViewID: 'view-1',
        UseSnapshot: true,
        SourceFilterSnapshot: JSON.stringify({ v: 1, whereClause: snapshotWhere }),
        Load: async () => true,
    };
    const provider = {
        Entities: [contacts],
        EntityByName: (name: string) => (name.trim().toLowerCase() === 'contacts' ? contacts : undefined),
        EntityByID: (id: string) => (id === contacts.ID ? contacts : undefined),
        GetEntityObject: async () => snapshotList,
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            calls.push(params);
            return { Success: true, Results: [{ ID: 'r1' }], RowCount: 1, TotalRowCount: 1, ErrorMessage: '' } as RunViewResult;
        },
    };
    return { provider: provider as unknown as DatabaseProviderBase, calls };
}

function context(provider: DatabaseProviderBase): AppContext {
    return {
        providers: [{ type: 'Read-Write', provider }],
        userPayload: { email: USER.Email, userRecord: USER },
    } as unknown as AppContext;
}

function adhoc(extraFilter: string): ListSourceInput {
    return Object.assign(new ListSourceInput(), { Kind: 'adhoc', EntityName: 'Contacts', ExtraFilter: extraFilter });
}

function previewInput(source: ListSourceInput): ComputeDeltaInput {
    return Object.assign(new ComputeDeltaInput(), { Target: 'new', Source: source, Mode: 'Additive' });
}

describe('ListOperationsResolver — ad-hoc source filters pass the clause screen', () => {
    beforeAll(() => {
        SetDeltaTokenSecret('unit-test-secret');
    });

    it('PreviewListDelta refuses a stacked statement hidden behind a bracket identifier, before RunView', async () => {
        const { provider, calls } = fakeProvider();

        await expect(
            new ListOperationsResolver().PreviewListDelta(previewInput(adhoc(BRACKET_STACKED)), context(provider)),
        ).rejects.toThrow(/Invalid ExtraFilter: multiple statements/);
        expect(calls).toHaveLength(0);
    });

    it('PreviewListDelta refuses a subquery against a base table', async () => {
        const { provider, calls } = fakeProvider();

        await expect(
            new ListOperationsResolver().PreviewListDelta(
                previewInput(adhoc(`EXISTS (SELECT 1 FROM __mj.[User] WHERE [Type] = 'Owner')`)),
                context(provider),
            ),
        ).rejects.toThrow(/entity base view/);
        expect(calls).toHaveLength(0);
    });

    it('ComposeLists never runs the refused filter', async () => {
        const { provider, calls } = fakeProvider();
        const input = Object.assign(new ComposeListsInput(), { Op: 'union', Inputs: [adhoc(BRACKET_STACKED), adhoc(BRACKET_STACKED)] });

        await expect(new ListOperationsResolver().ComposeLists(input, context(provider))).rejects.toThrow(/multiple statements/);
        expect(calls.map((c) => c.ExtraFilter)).not.toContain(BRACKET_STACKED);
    });

    it('RefreshListFromSource screens a filter rebuilt from a stored snapshot', async () => {
        const { provider, calls } = fakeProvider(BRACKET_STACKED);

        const result = await new ListOperationsResolver().RefreshListFromSource('list-1', 'Additive', false, context(provider));

        expect(calls.map((c) => c.ExtraFilter)).not.toContain(BRACKET_STACKED);
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/multiple statements/);
    });

    it('still runs an ordinary ad-hoc filter', async () => {
        const { provider, calls } = fakeProvider();
        const filter = `Status = 'Active' AND ID IN (SELECT ID FROM crm.vwContacts WHERE Name LIKE 'O''B%')`;

        const delta = await new ListOperationsResolver().PreviewListDelta(previewInput(adhoc(filter)), context(provider));

        expect(calls).toHaveLength(1);
        expect(calls[0].ExtraFilter).toBe(filter);
        expect(delta.ToAdd).toEqual(['r1']);
    });
});
