// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { DatabaseProviderBase, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
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
                SchemaName: '__mj',
                BaseView: 'vwUsers',
                BaseTable: 'User',
                Fields: [
                    { Name: 'Email', NeedsQuotes: true },
                    { Name: 'Name', NeedsQuotes: true },
                    { Name: 'Sequence', NeedsQuotes: false },
                    { Name: 'IsActive', NeedsQuotes: false },
                ],
            },
            {
                Name: 'MJ: User Views',
                SchemaName: '__mj',
                BaseView: 'vwUserViews',
                Fields: [{ Name: 'Name', NeedsQuotes: true }],
            },
            {
                Name: 'MJ_BizApps_Tasks: Task Assignments',
                SchemaName: '__mj_BizAppsTasks',
                BaseView: 'vwTaskAssignments',
                BaseTable: 'TaskAssignment',
                Fields: [{ Name: 'TaskID', NeedsQuotes: true }],
            },
            { Name: 'MJ_BizApps_Tasks: Tasks', SchemaName: '__mj_BizAppsTasks', BaseView: 'vwTasks', BaseTable: 'Task', Fields: [] },
            { Name: 'Committees: Meetings', SchemaName: '__mj_BizAppsCommittees', BaseView: 'vwMeetings', BaseTable: 'Meeting', Fields: [] },
            { Name: 'Committees: Motions', SchemaName: '__mj_BizAppsCommittees', BaseView: 'vwMotions', BaseTable: 'Motion', Fields: [] },
            { Name: 'Committees: Memberships', SchemaName: '__mj_BizAppsCommittees', BaseView: 'vwMemberships', BaseTable: 'Membership', Fields: [] },
            { Name: 'Committees: Terms', SchemaName: '__mj_BizAppsCommittees', BaseView: 'vwTerms', BaseTable: 'Term', Fields: [] },
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

    public ScreenClause(clause: string | undefined | null, label: string, provider: DatabaseProviderBase) {
        return this.assertClientClauseUsesEntityBaseViews(clause, label, provider as unknown as IMetadataProvider);
    }

    public RunDynamic(input: RunDynamicViewInput, provider: DatabaseProviderBase) {
        return this.RunDynamicViewGeneric(input, provider, fakePayload(), undefined as unknown as PubSubEngine);
    }

    /** The whole boundary screen, as the RunView* entry points call it. */
    public ScreenAll(
        clauses: { extraFilter?: string | null; orderBy?: string | null; userSearchString?: string | null; overrideExcludeFilter?: string | null },
        provider: DatabaseProviderBase,
    ) {
        return this.screenClientViewClauses(clauses, provider as unknown as IMetadataProvider);
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

describe('ResolverBase — GraphQL-boundary ExtraFilter AST screen', () => {
    // Keyword SELECT/EXISTS ban (#4253) broke first-party IN (SELECT … FROM base view).
    // The replacement parses the fragment and allows only entity BaseViews.

    const provider = () => fakeProvider({ params: null });

    it('rejects an EXISTS subquery against a base table', () => {
        expect(() =>
            new Probe().ScreenClause(`EXISTS (SELECT 1 FROM __mj.[User] WHERE Type='Owner')`, 'ExtraFilter', provider())
        ).toThrow(/entity base view/);
    });

    it('rejects a scalar SELECT subquery against a non-view', () => {
        expect(() =>
            new Probe().ScreenClause('(SELECT COUNT(*) FROM __mj.APIKey)', 'OrderBy', provider())
        ).toThrow(/entity base view/);
    });

    it('allows IN (SELECT …) against an entity BaseView', () => {
        expect(() =>
            new Probe().ScreenClause(
                `ID IN (SELECT TaskID FROM [__mj_BizAppsTasks].[vwTaskAssignments] WHERE AssigneeRecordID = 'x')`,
                'ExtraFilter',
                provider(),
            )
        ).not.toThrow();
    });

    it('allows the restored Committees ExtraFilter shapes (Command Center, workspace, tracker)', () => {
        const p = new Probe();
        const md = provider();
        const clauses = [
            `TaskID IN (SELECT ID FROM [__mj_BizAppsTasks].[vwTasks] WHERE Status IN ('Open', 'InProgress'))`,
            `ID IN (SELECT TaskID FROM [__mj_BizAppsTasks].[vwTaskAssignments] WHERE AssigneeRecordID = 'x')`,
            `MeetingID IN (SELECT ID FROM [__mj_BizAppsCommittees].[vwMeetings] WHERE CommitteeID='x')`,
            `MotionID IN (SELECT ID FROM [__mj_BizAppsCommittees].[vwMotions] WHERE MeetingID = 'x')`,
            `ID IN (SELECT m.PersonID FROM [__mj_BizAppsCommittees].[vwMemberships] m JOIN [__mj_BizAppsCommittees].[vwTerms] t ON m.TermID = t.ID WHERE t.CommitteeID = 'x' AND m.Status = 'Active')`,
        ];
        for (const c of clauses) {
            expect(() => p.ScreenClause(c, 'ExtraFilter', md)).not.toThrow();
        }
    });

    it('allows an ordinary comparison filter', () => {
        expect(() =>
            new Probe().ScreenClause(`Email = 'a@b.com' AND IsActive = 1`, 'ExtraFilter', provider())
        ).not.toThrow();
    });

    it('does not false-positive on SELECT/EXISTS inside string literals', () => {
        expect(() =>
            new Probe().ScreenClause(`Name LIKE '%select%' OR Name = 'exists'`, 'ExtraFilter', provider())
        ).not.toThrow();
    });

    it('allows empty/undefined clauses', () => {
        expect(() => new Probe().ScreenClause('', 'ExtraFilter', provider())).not.toThrow();
        expect(() => new Probe().ScreenClause(undefined, 'OrderBy', provider())).not.toThrow();
    });

    it('RunDynamicViewGeneric never reaches RunView when ExtraFilter hits a base table', async () => {
        const captured: Captured = { params: null };
        const input = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `EXISTS (SELECT 1 FROM __mj.[User] WHERE Type='Owner')`,
        } as RunDynamicViewInput;

        await expect(new Probe().RunDynamic(input, fakeProvider(captured))).rejects.toThrow(
            /entity base view/
        );
        expect(captured.params).toBeNull();
    });

    it('RunDynamicViewGeneric passes a BaseView subquery through to RunView', async () => {
        const captured: Captured = { params: null };
        const input = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `ID IN (SELECT ID FROM [__mj].[vwUsers] WHERE Email = 'a@b.com')`,
        } as RunDynamicViewInput;

        await new Probe().RunDynamic(input, fakeProvider(captured));

        expect(captured.params?.ExtraFilter).toBe(`ID IN (SELECT ID FROM [__mj].[vwUsers] WHERE Email = 'a@b.com')`);
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

describe('ResolverBase.screenClientViewClauses — UserSearchString is free text, not a clause (#4392)', () => {
    // The base-view AST screen wraps its argument as `SELECT 1 FROM x WHERE (<clause>)` and fails
    // closed when that does not parse. Applied to UserSearchString it rejected everything that
    // wasn't coincidentally valid SQL — which is most of what people type into a search box.
    // UserSearchString never reaches SQL as a fragment: createViewUserSearchSQL builds the
    // predicate and lands the text as an escaped literal, so the screen has nothing to screen.

    const provider = () => fakeProvider({ params: null });

    const searchTerms = [
        'Marcus Chen',            // a space — parses as nothing
        "O'Leary",                // unterminated literal
        "Marcus O'Leary Chen",    // both
        'Smith, John',            // punctuation
        '50% off',                // LIKE metacharacter
        'a_b [c]',                // more LIKE metacharacters
        'select',                 // a keyword as a term
        'drop table users',       // keywords with spaces
        'Union Pacific',          // a real company name
        "x' OR '1'='1",           // an injection attempt — escaped as a literal downstream
        '  spaced  out  ',
        'café ☕',
    ];

    it.each(searchTerms)('lets %j through the boundary screen', (term) => {
        expect(() => new Probe().ScreenAll({ userSearchString: term }, provider())).not.toThrow();
    });

    it('still screens the three real clause fragments alongside it', () => {
        const p = new Probe();
        const md = provider();

        expect(() =>
            p.ScreenAll({ userSearchString: 'Marcus Chen', extraFilter: `EXISTS (SELECT 1 FROM __mj.[User])` }, md)
        ).toThrow(/entity base view/);

        expect(() =>
            p.ScreenAll({ userSearchString: 'Marcus Chen', orderBy: '(SELECT COUNT(*) FROM __mj.APIKey)' }, md)
        ).toThrow(/entity base view/);

        expect(() =>
            p.ScreenAll({ userSearchString: 'Marcus Chen', overrideExcludeFilter: `EXISTS (SELECT 1 FROM __mj.[User])` }, md)
        ).toThrow(/entity base view/);
    });

    it('RunDynamicViewGeneric carries a multi-word search term through to RunView', async () => {
        const captured: Captured = { params: null };
        const input = { EntityName: ENTITY_NAME, UserSearchString: "Marcus O'Leary" } as RunDynamicViewInput;

        await new Probe().RunDynamic(input, fakeProvider(captured));

        expect(captured.params?.UserSearchString).toBe("Marcus O'Leary");
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
