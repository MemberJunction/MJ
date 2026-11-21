/**
 * The `MJ: User Views` save gates on CREATE, run on the real entity classes (no stubbed base), so
 * BaseEntity's real dirty-state rules apply: the first value written to a never-set field seeds
 * its OldValue and does not read as dirty. `GetEntityObject()` calls `NewRecord()`, which seeds
 * `WhereClause` and `CustomWhereClause`, so a later client write reads as dirty; a create that
 * skips `NewRecord()` writes them first, and they do not. Two flows are covered:
 *
 *   - the GraphQL create path (`GetEntityObject` → `NewRecord()` → `SetMany(input)` → `Save()`),
 *   - a create that skips `NewRecord()` and sets fields on the unsaved record directly.
 *
 * Both gates must refuse on create: the Owner-only gate on `CustomWhereClause`, and the clause
 * screen on a non-custom `WhereClause`. Payloads are harmless (stacked `SELECT`s).
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { PostgreSQLDialect, SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';
import { MJUserViewEntityServer } from '../custom/MJUserViewEntityServer.server.js';

const BRACKET_STACKED =
    "1 = (SELECT 1 AS [a'])) ; SELECT 1 AS [x] ; SELECT * FROM crm.vwContacts WHERE (1 = (SELECT 1 AS [b'])";
const BASE_TABLE_CLAUSE = `ID IN (SELECT ContactID FROM crm.ContactAudit)`;

/** A User Views field as the metadata describes it: updatable through the API unless a key. */
function field(name: string, type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { Name: name, Type: type, AllowUpdateAPI: true, AllowsNull: true, Length: -1, ...extra };
}

const USER_VIEWS = new EntityInfo({
    ID: '6c6a8bb6-0000-4000-8000-0000000000b1',
    Name: 'MJ: User Views',
    SchemaName: '__mj',
    BaseView: 'vwUserViews',
    Fields: [
        field('ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false }),
        field('UserID', 'uniqueidentifier'),
        field('Name', 'nvarchar', { Length: 200 }),
        field('Description', 'nvarchar'),
        field('IsShared', 'bit', { DefaultValue: '0', AllowsNull: false }),
        field('IsDefault', 'bit', { DefaultValue: '0', AllowsNull: false }),
        field('GridState', 'nvarchar'),
        field('FilterState', 'nvarchar'),
        field('CustomFilterState', 'bit', { DefaultValue: '0', AllowsNull: false }),
        field('SmartFilterEnabled', 'bit', { DefaultValue: '0', AllowsNull: false }),
        field('SmartFilterPrompt', 'nvarchar'),
        field('SmartFilterWhereClause', 'nvarchar'),
        field('WhereClause', 'nvarchar'),
        field('CustomWhereClause', 'bit', { DefaultValue: '0', AllowsNull: false }),
        field('SortState', 'nvarchar'),
    ],
});

const CONTACTS = new EntityInfo({
    ID: '6c6a8bb6-0000-4000-8000-0000000000b2',
    Name: 'Contacts',
    SchemaName: 'crm',
    BaseView: 'vwContacts',
    Fields: [field('ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false }), field('Name', 'nvarchar', { Length: 200 })],
});

function user(type: 'User' | 'Owner'): UserInfo {
    return new UserInfo(null as unknown as IMetadataProvider, { ID: `${type}-1`, Email: `${type}@example.com`, Type: type });
}

/** The provider this record saves through; it screens with the real `GenericDatabaseProvider.ScreenClientClause`. */
function screeningProvider(dialect: SQLDialect) {
    return {
        Entities: [USER_VIEWS, CONTACTS],
        Dialect: dialect,
        PlatformKey: dialect.PlatformKey,
        TransformExternalSQLClause: (clause: string) => clause,
        ScreenClientClause(...args: Parameters<GenericDatabaseProvider['ScreenClientClause']>): void {
            GenericDatabaseProvider.prototype.ScreenClientClause.apply(this as unknown as GenericDatabaseProvider, args);
        },
    };
}

function createdView(by: UserInfo, viaNewRecord: boolean, dialect: SQLDialect = new SQLServerDialect()): MJUserViewEntityServer {
    const view = new MJUserViewEntityServer(USER_VIEWS, screeningProvider(dialect) as never);
    view.ContextCurrentUser = by;
    if (viaNewRecord) view.NewRecord();
    return view;
}

function errorsOn(view: MJUserViewEntityServer, fieldName: string): string[] {
    return view.Validate().Errors.filter((e) => e.Source === fieldName).map((e) => e.Message);
}

describe('MJUserViewEntityServer — save gates on create (real entity dirty-state rules)', () => {
    for (const viaNewRecord of [true, false]) {
        const flow = viaNewRecord ? 'NewRecord() then SetMany' : 'fields set on an unsaved record';

        it(`refuses a non-Owner creating a CustomWhereClause view (${flow})`, () => {
            const view = createdView(user('User'), viaNewRecord);
            view.SetMany({ Name: 'v', WhereClause: BASE_TABLE_CLAUSE, CustomWhereClause: true });

            expect(errorsOn(view, 'CustomWhereClause').join(' ')).toMatch(/Only an administrator/);
        });

        it(`screens a non-custom WhereClause on create (${flow})`, () => {
            const view = createdView(user('User'), viaNewRecord);
            view.SetMany({ Name: 'v', WhereClause: BRACKET_STACKED });

            expect(errorsOn(view, 'WhereClause').join(' ')).toMatch(/multiple statements/);
        });

        it(`lets an Owner create a CustomWhereClause view (${flow})`, () => {
            const view = createdView(user('Owner'), viaNewRecord);
            view.SetMany({ Name: 'v', WhereClause: BASE_TABLE_CLAUSE, CustomWhereClause: true });

            expect(errorsOn(view, 'CustomWhereClause')).toEqual([]);
            expect(errorsOn(view, 'WhereClause')).toEqual([]);
        });
    }
});

describe('MJUserViewEntityServer — a UI FilterState saves on PostgreSQL', () => {
    it('accepts the bracketed WhereClause the platform compiles from a FilterState', async () => {
        const view = createdView(user('User'), true, new PostgreSQLDialect());
        view.Name = 'Acme contacts';
        view.EntityID = CONTACTS.ID;
        view.FilterState = JSON.stringify({ logic: 'and', filters: [{ field: 'Name', operator: 'contains', value: 'acme' }] });
        await view.UpdateWhereClause();

        expect(view.WhereClause).toBe(`([Name] LIKE '%acme%')`);
        expect(errorsOn(view, 'WhereClause')).toEqual([]);
    });
});
