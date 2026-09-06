// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { DatabaseProviderBase, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { UserPayload } from '../types.js';
import type { RunDynamicViewInput, RunViewByNameInput } from '../generic/RunViewResolver.js';
import type { PubSubEngine } from 'type-graphql';

/**
 * Both of `ResolverBase`'s own filter builders interpolated client-supplied values into the
 * `ExtraFilter` text they hand to `RunView`:
 *
 * - `findBy` — reachable through `UserByEmail`, `FileByName`, `UserViewsByName`, and the
 *   other by-value single-record resolvers.
 * - `RunViewByNameGeneric` — the inline `Name='<ViewName>'` lookup.
 *
 * `ExtraFilter` does pass through `SQLExpressionValidator`, which rejects stacked statements,
 * `UNION`, comments and `WAITFOR` — so the residual exposure was a same-clause boolean
 * tautology rather than arbitrary SQL. These tests pin the escaping that closes it, and the
 * fail-closed rule on the unquoted (numeric/boolean) slot, where a string value would BE
 * SQL with no quote to break out of.
 */

const ENTITY_NAME = 'MJ: Users';

/** Captures what the resolver asked `RunView` for. */
type Captured = { params: RunViewParams | null };

/**
 * Minimal provider: the entity/field metadata `findBy` reads, plus a `RunView` that records
 * its params. `Sequence` stands in for a numeric field (`NeedsQuotes` is false only for
 * Number and Boolean TS types).
 */
function fakeProvider(captured: Captured, rows: Record<string, unknown>[] = []): DatabaseProviderBase {
    return {
        Entities: [
            {
                ID: 'E1',
                Name: ENTITY_NAME,
                BaseView: 'vwUsers',
                Fields: [
                    { Name: 'Email', NeedsQuotes: true },
                    { Name: 'Name', NeedsQuotes: true },
                    { Name: 'Sequence', NeedsQuotes: false },
                    { Name: 'IsActive', NeedsQuotes: false },
                ],
            },
            {
                Name: 'MJ: User Views',
                Fields: [{ Name: 'Name', NeedsQuotes: true }],
            },
        ],
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            captured.params = params;
            return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ErrorMessage: '' } as RunViewResult;
        },
    } as unknown as DatabaseProviderBase;
}

const fakeUser = () => ({ Email: 'tester@example.com' } as UserInfo);
const fakePayload = () => ({ email: 'tester@example.com', userRecord: fakeUser() } as UserPayload);

/** Reaches the protected `findBy` and the client-subquery screen. */
class Probe extends ResolverBase {
    public FindBy(provider: DatabaseProviderBase, entity: string, params: Record<string, unknown>) {
        return this.findBy(provider, entity, params, fakeUser());
    }

    public AssertNoClientSubquery(clause: string | undefined | null, label: string) {
        return this.assertNoClientSubquery(clause, label);
    }

    public RunDynamic(input: RunDynamicViewInput, provider: DatabaseProviderBase) {
        return this.RunDynamicViewGeneric(input, provider, fakePayload(), undefined as unknown as PubSubEngine);
    }
}

describe('ResolverBase.findBy — ExtraFilter escaping', () => {
    it('doubles a single quote in a quoted value', async () => {
        const captured: Captured = { params: null };
        await new Probe().FindBy(fakeProvider(captured), ENTITY_NAME, { Email: "o'brien@example.com" });

        expect(captured.params?.ExtraFilter).toBe("Email = 'o''brien@example.com'");
    });

    it('renders a tautology attempt inert instead of terminating the literal', async () => {
        const captured: Captured = { params: null };
        // The payload closes the literal and appends its own predicate. Escaped, every quote
        // it carries stays *inside* the literal, so the clause matches a (non-existent)
        // address rather than every row.
        await new Probe().FindBy(fakeProvider(captured), ENTITY_NAME, { Email: "x' OR '1'='1" });

        expect(captured.params?.ExtraFilter).toBe("Email = 'x'' OR ''1''=''1'");
        // Nothing outside the literal: exactly two unescaped quotes, the delimiters.
        expect(captured.params?.ExtraFilter?.replace(/''/g, '')).toBe("Email = 'x OR 1=1'");
    });

    it('joins multiple params with AND, escaping each', async () => {
        const captured: Captured = { params: null };
        await new Probe().FindBy(fakeProvider(captured), ENTITY_NAME, { Email: "a'b", Name: "c'd" });

        expect(captured.params?.ExtraFilter).toBe("Email = 'a''b' AND Name = 'c''d'");
    });

    it('leaves a genuinely numeric value unquoted', async () => {
        const captured: Captured = { params: null };
        await new Probe().FindBy(fakeProvider(captured), ENTITY_NAME, { Sequence: 42 });

        expect(captured.params?.ExtraFilter).toBe('Sequence = 42');
    });

    it('rejects a string aimed at an unquoted (numeric) field rather than emitting it as SQL', async () => {
        const captured: Captured = { params: null };
        // There is no quote to escape in an unquoted slot — the value lands in the clause as
        // SQL. The only safe handling is to refuse it.
        await expect(
            new Probe().FindBy(fakeProvider(captured), ENTITY_NAME, { Sequence: '1 OR 1=1' })
        ).rejects.toThrow(/Sequence/);

        expect(captured.params).toBeNull(); // never reached RunView
    });

    it('rejects a non-finite number in an unquoted field', async () => {
        const captured: Captured = { params: null };
        await expect(
            new Probe().FindBy(fakeProvider(captured), ENTITY_NAME, { Sequence: Number.NaN })
        ).rejects.toThrow(/Sequence/);
    });

    it('still rejects an unknown field name', async () => {
        // Pre-existing behavior, pinned so the escaping rework cannot quietly drop it.
        await expect(
            new Probe().FindBy(fakeProvider({ params: null }), ENTITY_NAME, { NotAField: 'x' })
        ).rejects.toThrow(/NotAField/);
    });
});

describe('ResolverBase — GraphQL-boundary subquery screen (assertNoClientSubquery)', () => {
    // ValidateUserProvidedSQLClause deliberately permits SELECT (server-internal engines pass
    // richer filters straight into RunView), so a client could previously turn ExtraFilter into
    // a blind boolean oracle over tables it cannot read. These tests pin the stricter screen
    // applied only to clauses arriving through the GraphQL resolvers.

    it('rejects an EXISTS subquery probing a foreign table', () => {
        expect(() =>
            new Probe().AssertNoClientSubquery(`EXISTS (SELECT 1 FROM __mj.[User] WHERE Type='Owner')`, 'ExtraFilter')
        ).toThrow(/subqueries are not permitted/);
    });

    it('rejects a scalar SELECT subquery in ORDER BY', () => {
        expect(() =>
            new Probe().AssertNoClientSubquery('(SELECT COUNT(*) FROM __mj.APIKey)', 'OrderBy')
        ).toThrow(/subqueries are not permitted/);
    });

    it('rejects EXISTS regardless of case', () => {
        expect(() =>
            new Probe().AssertNoClientSubquery(`eXiStS (SeLeCt 1 FROM __mj.[User])`, 'ExtraFilter')
        ).toThrow(/subqueries are not permitted/);
    });

    it('allows an ordinary comparison filter', () => {
        expect(() =>
            new Probe().AssertNoClientSubquery(`Email = 'a@b.com' AND IsActive = 1`, 'ExtraFilter')
        ).not.toThrow();
    });

    it('does not false-positive on SELECT/EXISTS inside string literals', () => {
        // Literals are stripped before the keyword test, so a value that merely CONTAINS the
        // words is fine.
        expect(() =>
            new Probe().AssertNoClientSubquery(`Name LIKE '%select%' OR Name = 'exists'`, 'ExtraFilter')
        ).not.toThrow();
    });

    it('allows empty/undefined clauses', () => {
        expect(() => new Probe().AssertNoClientSubquery('', 'ExtraFilter')).not.toThrow();
        expect(() => new Probe().AssertNoClientSubquery(undefined, 'OrderBy')).not.toThrow();
    });

    it('RunDynamicViewGeneric never reaches RunView when ExtraFilter carries a subquery', async () => {
        const captured: Captured = { params: null };
        const input = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `EXISTS (SELECT 1 FROM __mj.[User] WHERE Type='Owner')`,
        } as RunDynamicViewInput;

        // The screen throws inside RunViewGenericInternal. RunDynamicViewGeneric returns that
        // promise without awaiting it, so its try/catch does not swallow the rejection — the
        // caller sees the error directly.
        await expect(new Probe().RunDynamic(input, fakeProvider(captured))).rejects.toThrow(
            /subqueries are not permitted/
        );
        expect(captured.params).toBeNull(); // never reached RunView
    });

    it('RunDynamicViewGeneric passes a benign ExtraFilter through to RunView', async () => {
        const captured: Captured = { params: null };
        const input = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `Email = 'a@b.com'`,
        } as RunDynamicViewInput;

        await new Probe().RunDynamic(input, fakeProvider(captured));

        expect(captured.params?.ExtraFilter).toBe(`Email = 'a@b.com'`);
    });
});

describe('ResolverBase.RunViewByNameGeneric — view-name escaping', () => {
    it('escapes the client-supplied view name', async () => {
        const captured: Captured = { params: null };
        const input = { ViewName: "My View' OR '1'='1" } as RunViewByNameInput;

        // Empty Results short-circuits the method (returns null) once the lookup filter is built.
        const result = await new Probe().RunViewByNameGeneric(
            input,
            fakeProvider(captured),
            fakePayload(),
            undefined as unknown as PubSubEngine // unused: the empty-result path returns before it is passed on
        );

        expect(result).toBeNull();
        expect(captured.params?.EntityName).toBe('MJ: User Views');
        expect(captured.params?.ExtraFilter).toBe("Name='My View'' OR ''1''=''1'");
    });
});
