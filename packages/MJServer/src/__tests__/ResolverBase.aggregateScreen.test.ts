// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { AggregateExpression, DatabaseProviderBase, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunViewResolver, type RunDynamicViewInput } from '../generic/RunViewResolver.js';
import type { AppContext, UserPayload } from '../types.js';

/**
 * `Aggregates[].expression` is spliced into `SELECT <expression> AS [Agg_0] FROM <view> WHERE …`.
 * The GraphQL-boundary screen must treat it like the other client SQL fragments (ExtraFilter,
 * OrderBy, OverrideExcludeFilter): one statement, no writes, and subqueries only against entity
 * base views the caller can read.
 *
 * The payloads below are harmless (`SELECT 1`). They use a quote inside a `[bracket]` identifier,
 * which a quote-only literal stripper reads as the start of a string, hiding the `;` after it.
 */

const ENTITY_NAME = 'MJ: Users';

/** A second statement hidden behind a quote inside a bracket identifier. */
const STACKED_AGGREGATE = "COUNT(*) AS [a'] ; SELECT 1 AS [b'], COUNT(*)";

/** A subquery against a base table rather than an entity base view. */
const BASE_TABLE_AGGREGATE = 'COUNT(*) + (SELECT COUNT(*) FROM __mj.[User])';

type Captured = { params: RunViewParams | null };

/** Entity metadata the screen reads, plus a `RunView` that records what reached it. */
function fakeProvider(captured: Captured): DatabaseProviderBase {
    return {
        Entities: [
            {
                ID: 'E1',
                Name: ENTITY_NAME,
                SchemaName: '__mj',
                BaseView: 'vwUsers',
                BaseTable: 'User',
                Fields: [
                    { Name: 'ID', NeedsQuotes: true },
                    { Name: 'Name', NeedsQuotes: true },
                    { Name: 'Sequence', NeedsQuotes: false },
                ],
                PrimaryKeys: [{ Name: 'ID' }],
                GetUserPermisions: () => ({ CanRead: true }),
            },
        ],
        EntityByName: (name: string) => (name === ENTITY_NAME ? { ID: 'E1', Name: ENTITY_NAME, PrimaryKeys: [{ Name: 'ID' }] } : undefined),
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            captured.params = params;
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '' } as RunViewResult;
        },
        RunViews: async (params: RunViewParams[]): Promise<RunViewResult[]> => {
            captured.params = params[0] ?? null;
            return params.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '' } as RunViewResult));
        },
    } as unknown as DatabaseProviderBase;
}

const fakeUser = () => ({ Email: 'tester@example.com' } as UserInfo);
const fakePayload = () => ({ email: 'tester@example.com', userRecord: fakeUser() } as UserPayload);

/** Reaches the boundary screen and the dynamic-view entry point. */
class Probe extends ResolverBase {
    public ScreenAll(
        clauses: { extraFilter?: string | null; aggregates?: AggregateExpression[] | null },
        provider: DatabaseProviderBase,
    ) {
        return this.screenClientViewClauses(clauses, provider as unknown as IMetadataProvider);
    }

    public RunDynamic(input: RunDynamicViewInput, provider: DatabaseProviderBase) {
        return this.RunDynamicViewGeneric(input, provider, fakePayload(), undefined as unknown as PubSubEngine);
    }
}

describe('ResolverBase.screenClientViewClauses — aggregate expressions', () => {
    it('rejects an aggregate that hides a second statement behind a quote inside a bracket identifier', () => {
        expect(() =>
            new Probe().ScreenAll({ aggregates: [{ expression: STACKED_AGGREGATE }] }, fakeProvider({ params: null })),
        ).toThrow(/Invalid Aggregate: multiple statements/);
    });

    it('rejects an aggregate whose subquery reads a base table', () => {
        expect(() =>
            new Probe().ScreenAll({ aggregates: [{ expression: BASE_TABLE_AGGREGATE }] }, fakeProvider({ params: null })),
        ).toThrow(/Invalid Aggregate: subquery must use an entity base view/);
    });

    it('screens every aggregate in the list, not only the first', () => {
        expect(() =>
            new Probe().ScreenAll(
                { aggregates: [{ expression: 'COUNT(*)' }, { expression: STACKED_AGGREGATE }] },
                fakeProvider({ params: null }),
            ),
        ).toThrow(/Invalid Aggregate: multiple statements/);
    });

    it('leaves an aggregate the parser cannot read to the provider, which refuses it per aggregate', () => {
        expect(() =>
            new Probe().ScreenAll({ aggregates: [{ expression: 'COUNT_BIG(*)' }] }, fakeProvider({ params: null })),
        ).not.toThrow();
    });

    it('lets ordinary aggregate expressions through', () => {
        const ordinary = [
            'COUNT(*)',
            'SUM(Sequence)',
            'AVG(Sequence * 2)',
            'COUNT(DISTINCT Name)',
            "COUNT(CASE WHEN Name = 'x' THEN 1 END)",
            'MIN([Name])',
        ];
        expect(() =>
            new Probe().ScreenAll({ aggregates: ordinary.map((expression) => ({ expression })) }, fakeProvider({ params: null })),
        ).not.toThrow();
    });
});

describe('ResolverBase RunView entry points — aggregate expressions', () => {
    it('RunDynamicViewGeneric never reaches RunView with a stacked aggregate', async () => {
        const captured: Captured = { params: null };
        const input = { EntityName: ENTITY_NAME, Aggregates: [{ expression: STACKED_AGGREGATE }] } as RunDynamicViewInput;

        await expect(new Probe().RunDynamic(input, fakeProvider(captured))).rejects.toThrow(/Invalid Aggregate: multiple statements/);
        expect(captured.params).toBeNull();
    });

    it('RunDynamicViewGeneric passes ordinary aggregates through to RunView', async () => {
        const captured: Captured = { params: null };
        const aggregates = [{ expression: 'COUNT(*)', alias: 'Total' }, { expression: 'SUM(Sequence)' }];
        const input = { EntityName: ENTITY_NAME, Aggregates: aggregates } as RunDynamicViewInput;

        await new Probe().RunDynamic(input, fakeProvider(captured));

        expect(captured.params?.Aggregates).toEqual(aggregates);
    });

    it('RunViews returns a failure result, and never reaches the provider, for a stacked aggregate', async () => {
        const captured: Captured = { params: null };
        const provider = fakeProvider(captured);
        const input = [{ EntityName: ENTITY_NAME, Aggregates: [{ expression: STACKED_AGGREGATE }] }] as Parameters<RunViewResolver['RunViews']>[0];

        const results = await new RunViewResolver().RunViews(
            input,
            { providers: [{ type: 'Read-Only', provider }] as unknown as AppContext['providers'], userPayload: fakePayload() } as AppContext,
            undefined as unknown as PubSubEngine,
        );

        expect(results).toHaveLength(1);
        expect(results[0].Success).toBe(false);
        expect(results[0].ErrorMessage).toMatch(/Invalid Aggregate: multiple statements/);
        expect(captured.params).toBeNull();
    });

    it('RunViews does not fail the batch because one aggregate cannot be parsed', async () => {
        const captured: Captured = { params: null };
        const provider = fakeProvider(captured);
        const input = [
            { EntityName: ENTITY_NAME, Aggregates: [{ expression: 'COUNT_BIG(*)' }] },
            { EntityName: ENTITY_NAME },
        ] as Parameters<RunViewResolver['RunViews']>[0];

        const results = await new RunViewResolver().RunViews(
            input,
            { providers: [{ type: 'Read-Only', provider }] as unknown as AppContext['providers'], userPayload: fakePayload() } as AppContext,
            undefined as unknown as PubSubEngine,
        );

        expect(results.map((r) => r.Success)).toEqual([true, true]);
        expect(captured.params?.Aggregates).toEqual([{ expression: 'COUNT_BIG(*)' }]);
    });
});
