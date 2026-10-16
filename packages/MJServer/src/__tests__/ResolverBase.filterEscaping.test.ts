// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { DatabaseProviderBase, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { UserPayload } from '../types.js';
import type { RunDynamicViewInput } from '../generic/RunViewResolver.js';
import type { PubSubEngine } from 'type-graphql';

/**
 * The GraphQL-boundary screen for client-supplied view clauses (ExtraFilter, OrderBy,
 * OverrideExcludeFilter): a subquery may only read an entity base view, and only one the
 * acting user can read. UserSearchString is free text and is not screened as a clause.
 *
 * lts/5 port of #4782: the findBy / RunViewByNameGeneric escaping tests and the RunViews
 * structured-error test on next cover fixes that are not on this line, so they are not here.
 */

const ENTITY_NAME = 'MJ: Users';

/** Captures what the resolver asked `RunView` for. */
type Captured = { params: RunViewParams | null };

/**
 * Minimal provider: the entity/field metadata `findBy` reads, plus a `RunView` that records
 * its params. `Sequence` stands in for a numeric field (`NeedsQuotes` is false only for
 * Number and Boolean TS types).
 */
function fakeProvider(captured: Captured, rows: Record<string, unknown>[] = [], unreadableEntities: string[] = []): DatabaseProviderBase {
    const withPerms = (e: Record<string, unknown>) => ({
        ...e,
        // Real EntityInfo aggregates per-user permissions; the boundary screen consults CanRead,
        // the row filter and the denied fields for every subquery target, so the mock answers
        // them (an unscoped read).
        GetUserPermisions: () => ({ CanRead: !unreadableEntities.includes(e.Name as string) }),
        GetUserRowLevelSecurityWhereClause: () => '',
    });
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
        ].map(withPerms),
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            captured.params = params;
            return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ErrorMessage: '' } as RunViewResult;
        },
    } as unknown as DatabaseProviderBase;
}

const fakeUser = () => ({ Email: 'tester@example.com' } as UserInfo);
const fakePayload = () => ({ email: 'tester@example.com', userRecord: fakeUser() } as UserPayload);

/** Reaches the protected client-subquery screen. */
class Probe extends ResolverBase {
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

    it('RunDynamicViewGeneric rejects a subquery into an entity the caller cannot read', async () => {
        const captured: Captured = { params: null };
        const input = {
            EntityName: ENTITY_NAME,
            ExtraFilter: `ID IN (SELECT TaskID FROM [__mj_BizAppsTasks].[vwTaskAssignments])`,
        } as RunDynamicViewInput;

        await expect(
            new Probe().RunDynamic(input, fakeProvider(captured, [], ['MJ_BizApps_Tasks: Task Assignments']))
        ).rejects.toThrow(/read permission/);
        expect(captured.params).toBeNull();
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
