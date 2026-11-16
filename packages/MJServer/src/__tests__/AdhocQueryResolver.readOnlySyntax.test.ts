/**
 * `AuthorizeRenderedSQL` — the check ad-hoc SQL and test SQL (`TestQuerySQL`) pass before they run:
 * the render pipeline, then the full-statement screen. Valid read-only SQL the strict parser once
 * refused must pass it, every branch of a set operation must still be screened, and writes in any
 * form must still be refused.
 */
import 'reflect-metadata';

import { describe, it, expect, vi } from 'vitest';
import type { DatabaseProviderBase, EntityInfo, UserInfo } from '@memberjunction/core';

// See AdhocQueryResolver.dialect.test.ts: esbuild cannot emit the decorator metadata the real
// RunQueryResultType needs, and the resolver only uses it as a return-type marker.
vi.mock('../resolvers/QueryResolver.js', () => ({
    RunQueryResultType: class RunQueryResultType {},
}));
vi.mock('../config.js', () => ({ configInfo: { databaseSettings: { requestTimeout: 120_000 } } }));

import { AdhocQueryResolver } from '../resolvers/AdhocQueryResolver.js';

/** An entity whose read is granted and unscoped unless `rowFilter` is set. */
function entity(name: string, schema: string, baseView: string, rowFilter = ''): EntityInfo {
    return {
        Name: name,
        SchemaName: schema,
        BaseView: baseView,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => rowFilter,
        GetDeniedReadFields: () => new Set<string>(),
    } as unknown as EntityInfo;
}

const PROVIDER = {
    PlatformKey: 'sqlserver',
    Entities: [
        entity('Members', 'AssociationDemo', 'vwMembers'),
        entity('Chapters', 'AssociationDemo', 'vwChapters'),
        entity('Chapter Memberships', 'AssociationDemo', 'vwChapterMemberships'),
        entity('Orders', 'AssociationDemo', 'vwOrders', "(OwnerID = 'u1')"),
    ],
} as unknown as DatabaseProviderBase;
const USER = { ID: 'u1', Name: 'Tester' } as unknown as UserInfo;

const authorize = (sql: string): string | null => new AdhocQueryResolver().AuthorizeRenderedSQL(sql, PROVIDER, USER);

describe('AdhocQueryResolver.AuthorizeRenderedSQL — valid read-only syntax', () => {
    it.each([
        ['UNION ALL', 'SELECT m.ID FROM AssociationDemo.vwMembers m UNION ALL SELECT cm.MemberID FROM AssociationDemo.vwChapterMemberships cm'],
        ['INTERSECT', 'SELECT m.ID FROM AssociationDemo.vwMembers m INTERSECT SELECT cm.MemberID FROM AssociationDemo.vwChapterMemberships cm'],
        ['EXCEPT', 'SELECT m.ID FROM AssociationDemo.vwMembers m EXCEPT SELECT cm.MemberID FROM AssociationDemo.vwChapterMemberships cm'],
        [
            'SELECT DISTINCT branches with NOT EXISTS',
            `SELECT DISTINCT cm.MemberID, c.Name FROM AssociationDemo.vwChapterMemberships cm JOIN AssociationDemo.vwChapters c ON c.ID = cm.ChapterID
             UNION ALL
             SELECT DISTINCT m.ID, 'None' FROM AssociationDemo.vwMembers m
             WHERE NOT EXISTS (SELECT 1 FROM AssociationDemo.vwChapterMemberships cm WHERE cm.MemberID = m.ID)`,
        ],
        [
            'a CTE using STRING_AGG … WITHIN GROUP',
            `WITH MemberChapters AS (
                 SELECT cm.MemberID, STRING_AGG(c.Name, ', ') WITHIN GROUP (ORDER BY c.Name) AS ChapterNames
                 FROM AssociationDemo.vwChapterMemberships cm JOIN AssociationDemo.vwChapters c ON c.ID = cm.ChapterID
                 GROUP BY cm.MemberID)
             SELECT * FROM MemberChapters`,
        ],
    ])('authorizes %s', (_case, sql) => {
        expect(authorize(sql)).toBeNull();
    });
});

describe('AdhocQueryResolver.AuthorizeRenderedSQL — what stays refused', () => {
    it('screens every branch of a set operation', () => {
        expect(authorize('SELECT ID FROM AssociationDemo.vwMembers UNION SELECT name FROM sys.objects')).toMatch(/entity base view/);
        expect(authorize('SELECT ID FROM AssociationDemo.vwMembers EXCEPT SELECT ID FROM AssociationDemo.vwOrders')).toMatch(/row-level-security filtered/);
    });

    it.each([
        ['SELECT … INTO in a later branch', 'SELECT ID FROM AssociationDemo.vwMembers UNION SELECT ID INTO #t FROM AssociationDemo.vwMembers'],
        ['a stacked write after a set operation', 'SELECT ID FROM AssociationDemo.vwMembers INTERSECT SELECT 1; DELETE FROM AssociationDemo.Member'],
    ])('refuses %s', (_case, sql) => {
        expect(authorize(sql)).not.toBeNull();
    });
});
