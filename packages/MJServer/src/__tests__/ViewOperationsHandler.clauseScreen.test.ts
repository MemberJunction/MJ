/**
 * The REST view routes (`POST /views/:entityName`, `POST /views/batch`, `GET /entities/:entityName`)
 * hand client `ExtraFilter` / `OrderBy` / `OverrideExcludeFilter` text to `RunView` through
 * `ViewOperationsHandler`. These tests pin that the text passes the same base-view AST screen as
 * the GraphQL RunView resolvers before any view runs. Payloads are harmless (stacked `SELECT`s);
 * the point is only whether they reach `RunView`.
 *
 * `@memberjunction/core`'s `Metadata` and `RunView` are replaced at the module boundary, as in
 * ViewOperationsHandler.test.ts; the screen itself runs unmodified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRunViewFn, mockRunViewsFn, mockEntityList } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockRunViewsFn: vi.fn(),
    mockEntityList: [] as Array<{
        Name: string;
        SchemaName: string;
        BaseView: string;
        GetUserPermisions: (u: unknown) => { CanRead: boolean };
    }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockMetadata {
        public get Entities() {
            return mockEntityList;
        }
    }
    class MockRunView {
        public RunView(params: unknown, contextUser?: unknown): Promise<unknown> {
            return mockRunViewFn(params, contextUser);
        }
        public RunViews(params: unknown[], contextUser?: unknown): Promise<unknown> {
            return mockRunViewsFn(params, contextUser);
        }
    }
    return { ...actual, Metadata: MockMetadata, RunView: MockRunView, LogError: vi.fn() };
});

import type { PlatformSQL, RunViewParams, UserInfo } from '@memberjunction/core';
import { ViewOperationsHandler } from '../rest/ViewOperationsHandler.js';

const BRACKET_STACKED =
    "1 = (SELECT 1 AS [a'])) ; SELECT 1 AS [x] ; SELECT * FROM sales.vwCustomers WHERE (1 = (SELECT 1 AS [b'])";

const USER = { ID: 'user-1', Name: 'Reader' } as unknown as UserInfo;
const OK_RESULT = { Success: true, Results: [{ ID: '1' }] };

beforeEach(() => {
    vi.clearAllMocks();
    mockEntityList.length = 0;
    mockEntityList.push(
        { Name: 'Customers', SchemaName: 'sales', BaseView: 'vwCustomers', GetUserPermisions: () => ({ CanRead: true }) },
        { Name: 'Ledger', SchemaName: 'sales', BaseView: 'vwLedger', GetUserPermisions: () => ({ CanRead: false }) },
    );
    mockRunViewFn.mockResolvedValue(OK_RESULT);
    mockRunViewsFn.mockResolvedValue([OK_RESULT]);
});

describe('ViewOperationsHandler — REST clause screen', () => {
    it('RunView refuses a stacked statement hidden behind a bracket identifier, before RunView', async () => {
        const outcome = await ViewOperationsHandler.RunView({ EntityName: 'Customers', ExtraFilter: BRACKET_STACKED }, USER);

        expect(mockRunViewFn).not.toHaveBeenCalled();
        expect(outcome.success).toBe(false);
        expect(outcome.error).toMatch(/Invalid ExtraFilter: multiple statements/);
    });

    it('RunView screens OrderBy and OverrideExcludeFilter too', async () => {
        const cases: RunViewParams[] = [
            { EntityName: 'Customers', OrderBy: "[a'] ; SELECT 1 AS [x] ; SELECT 1 AS [b']" },
            { EntityName: 'Customers', OverrideExcludeFilter: BRACKET_STACKED },
        ];
        for (const params of cases) {
            const outcome = await ViewOperationsHandler.RunView(params, USER);
            expect(outcome.success).toBe(false);
        }
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('RunView refuses a subquery against a base table or an entity the caller cannot read', async () => {
        for (const filter of [
            `EXISTS (SELECT 1 FROM __mj.[User] WHERE [Type] = 'Owner')`,
            `ID IN (SELECT CustomerID FROM sales.vwLedger)`,
        ]) {
            const outcome = await ViewOperationsHandler.RunView({ EntityName: 'Customers', ExtraFilter: filter }, USER);
            expect(outcome.success).toBe(false);
        }
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('RunView screens every variant of a platform-specific filter', async () => {
        const filter: PlatformSQL = { default: `Name = 'x'`, sqlserver: BRACKET_STACKED };

        const outcome = await ViewOperationsHandler.RunView({ EntityName: 'Customers', ExtraFilter: filter }, USER);

        expect(mockRunViewFn).not.toHaveBeenCalled();
        expect(outcome.success).toBe(false);
    });

    it('RunViews refuses the whole batch when one entry carries a payload', async () => {
        const outcome = await ViewOperationsHandler.RunViews(
            [{ EntityName: 'Customers' }, { EntityName: 'Customers', ExtraFilter: BRACKET_STACKED }],
            USER,
        );

        expect(mockRunViewsFn).not.toHaveBeenCalled();
        expect(outcome.success).toBe(false);
    });

    it('ListEntities refuses a payload in the query-string filter', async () => {
        await expect(
            ViewOperationsHandler.ListEntities({ EntityName: 'Customers', ExtraFilter: BRACKET_STACKED }, USER),
        ).rejects.toThrow(/multiple statements/);
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('passes a filter that only reads entity base views through to RunView', async () => {
        const filter = `Name = 'O''Brien' AND ID IN (SELECT ID FROM sales.vwCustomers WHERE Region = 'West')`;

        const outcome = await ViewOperationsHandler.RunView({ EntityName: 'Customers', ExtraFilter: filter, OrderBy: '[Name] DESC' }, USER);

        expect(outcome.success).toBe(true);
        expect((mockRunViewFn.mock.calls[0][0] as RunViewParams).ExtraFilter).toBe(filter);
    });
});
