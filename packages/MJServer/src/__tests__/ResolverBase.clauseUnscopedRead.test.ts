// ResolverBase pulls in type-graphql decorators, which need the Reflect.metadata polyfill first.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { DatabaseProviderBase, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { RunDynamicViewInput } from '../generic/RunViewResolver.js';
import type { UserPayload } from '../types.js';

/**
 * `RunDynamicView` is the GraphQL entry point for a client RunView over one entity. A subquery in
 * its ExtraFilter reads an entity's base view directly, so RunView applies neither that entity's
 * row-level security nor its denied-field projection to the subquery. These tests pin that the
 * boundary screen refuses such a subquery when the caller's read of that entity is narrowed (the
 * rule the ad-hoc SQL screen applies) and still passes it when the read is not. Inputs are harmless.
 */

/** How the caller's read of an entity is narrowed: a row filter, denied fields, or neither. */
interface ReadScope {
    RowFilter?: string;
    DeniedFields?: string[];
}

/** What the resolver handed to RunView; null when the request never got there. */
type Captured = { params: RunViewParams | null };

const USER = { ID: 'U1', Email: 'reader@example.com' } as UserInfo;
const OWN_ROWS = "(OwnerID = 'U1')";
const ORDERS_SUBQUERY = `ID IN (SELECT AccountID FROM [crm].[vwOrders] WHERE [Total] > 100)`;

/** Provider double: two entities the caller can read, each under `scopes[Name]`, and a RunView that records its params. */
function fakeProvider(captured: Captured, scopes: Record<string, ReadScope> = {}): DatabaseProviderBase {
    const entity = (id: string, name: string, baseView: string) => ({
        ID: id,
        Name: name,
        SchemaName: 'crm',
        BaseView: baseView,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => scopes[name]?.RowFilter ?? '',
        GetDeniedReadFields: () => new Set(scopes[name]?.DeniedFields ?? []),
    });
    return {
        Entities: [entity('E1', 'Accounts', 'vwAccounts'), entity('E2', 'Orders', 'vwOrders')],
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            captured.params = params;
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '' } as unknown as RunViewResult;
        },
    } as unknown as DatabaseProviderBase;
}

/** Runs `RunDynamicViewGeneric` over Accounts as USER. */
class Probe extends ResolverBase {
    public RunDynamic(input: Partial<RunDynamicViewInput>, provider: DatabaseProviderBase) {
        const payload = { email: USER.Email, userRecord: USER } as UserPayload;
        const view = { EntityName: 'Accounts', ...input } as RunDynamicViewInput;
        return this.RunDynamicViewGeneric(view, provider, payload, undefined as unknown as PubSubEngine);
    }
}

describe('RunDynamicViewGeneric — a client subquery reads an entity only when the caller may read it unscoped', () => {
    it('refuses a subquery over an entity that is row-level-security filtered for the caller, before RunView', async () => {
        const captured: Captured = { params: null };

        await expect(
            new Probe().RunDynamic({ ExtraFilter: ORDERS_SUBQUERY }, fakeProvider(captured, { Orders: { RowFilter: OWN_ROWS } })),
        ).rejects.toThrow(/'Orders' is row-level-security filtered for you/);
        expect(captured.params).toBeNull();
    });

    it('refuses a subquery over an entity with a field the caller may not read, before RunView', async () => {
        const captured: Captured = { params: null };

        await expect(
            new Probe().RunDynamic({ ExtraFilter: ORDERS_SUBQUERY }, fakeProvider(captured, { Orders: { DeniedFields: ['total'] } })),
        ).rejects.toThrow(/'Orders' has fields you are not permitted to read/);
        expect(captured.params).toBeNull();
    });

    it('passes the same subquery through when the caller reads that entity unscoped', async () => {
        const captured: Captured = { params: null };

        await new Probe().RunDynamic({ ExtraFilter: ORDERS_SUBQUERY }, fakeProvider(captured));

        expect(captured.params?.ExtraFilter).toBe(ORDERS_SUBQUERY);
    });

    it("refuses a subquery over the queried entity's own base view when the caller's read of it is row-filtered", async () => {
        const captured: Captured = { params: null };
        const ownView = `ID IN (SELECT ID FROM [crm].[vwAccounts] WHERE [Name] LIKE 'A%')`;

        await expect(
            new Probe().RunDynamic({ ExtraFilter: ownView }, fakeProvider(captured, { Accounts: { RowFilter: OWN_ROWS } })),
        ).rejects.toThrow(/'Accounts' is row-level-security filtered for you/);
        expect(captured.params).toBeNull();
    });

    it('refuses a CASE-WHEN subquery over a row-filtered entity, before RunView', async () => {
        const captured: Captured = { params: null };
        const caseWhen = `CASE WHEN (SELECT COUNT(*) FROM [crm].[vwOrders] WHERE [Total] > 100) > 0 THEN 1 ELSE 0 END = 1`;

        await expect(
            new Probe().RunDynamic({ ExtraFilter: caseWhen }, fakeProvider(captured, { Orders: { RowFilter: OWN_ROWS } })),
        ).rejects.toThrow(/'Orders' is row-level-security filtered for you/);
        expect(captured.params).toBeNull();
    });

    it("refuses a subquery over a row-filtered entity in a window's ORDER BY, before RunView", async () => {
        const captured: Captured = { params: null };
        const window = `ID IN (SELECT ID FROM (SELECT ID, ROW_NUMBER() OVER (ORDER BY (SELECT COUNT(*) FROM [crm].[vwOrders])) AS rn FROM [crm].[vwAccounts]) x)`;

        await expect(
            new Probe().RunDynamic({ ExtraFilter: window }, fakeProvider(captured, { Orders: { RowFilter: OWN_ROWS } })),
        ).rejects.toThrow(/'Orders' is row-level-security filtered for you/);
        expect(captured.params).toBeNull();
    });

    it('still passes an ordinary filter and sort on an entity the caller reads under a row filter', async () => {
        const captured: Captured = { params: null };

        await new Probe().RunDynamic(
            { ExtraFilter: `[Name] = 'Acme'`, OrderBy: '[Name] DESC' },
            fakeProvider(captured, { Accounts: { RowFilter: OWN_ROWS } }),
        );

        expect(captured.params?.ExtraFilter).toBe(`[Name] = 'Acme'`);
    });
});
