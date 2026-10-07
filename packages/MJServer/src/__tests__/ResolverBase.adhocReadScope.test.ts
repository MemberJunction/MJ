// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * The ad-hoc SQL screen (`assertFullQueryUsesReadableEntityViews`) admits a table reference
 * only when it resolves to an entity base view the caller can read UNSCOPED. These tests pin
 * the three ways that resolution was looser than it looked (PR #4782 review):
 *
 * - a schema-qualified reference fell back to a bare-name match in another schema;
 * - an unqualified name present in two schemas resolved to whichever loaded last;
 * - entity CanRead was treated as unscoped read authority, though raw SQL applies neither the
 *   row-level filter nor the denied-field projection RunView does.
 */

type EntityShape = {
    Name: string;
    SchemaName: string;
    BaseView: string;
    canRead?: boolean;
    rowFilter?: string;
    deniedFields?: string[];
};

function fakeProvider(entities: EntityShape[]): IMetadataProvider {
    return {
        Entities: entities.map((e) => ({
            Name: e.Name,
            SchemaName: e.SchemaName,
            BaseView: e.BaseView,
            GetUserPermisions: () => ({ CanRead: e.canRead ?? true }),
            GetEffectiveRowFilterWhereClause: () => e.rowFilter ?? '',
            GetDeniedReadFields: () => new Set(e.deniedFields ?? []),
        })),
    } as unknown as IMetadataProvider;
}

const USER = { ID: 'U1', Email: 'u@example.com' } as unknown as UserInfo;

class Probe extends ResolverBase {
    public Screen(sql: string, provider: IMetadataProvider, user: UserInfo | undefined = USER) {
        return this.assertFullQueryUsesReadableEntityViews(sql, provider, user, 'ad-hoc SQL');
    }
}

const PUBLIC_FOO: EntityShape = { Name: 'Public Foo', SchemaName: 'public', BaseView: 'vwFoo' };

describe('assertFullQueryUsesReadableEntityViews', () => {
    it('admits an unscoped readable base view', () => {
        expect(() => new Probe().Screen('SELECT ID FROM [public].[vwFoo]', fakeProvider([PUBLIC_FOO]))).not.toThrow();
    });

    it('does not resolve a schema-qualified reference through another schema', () => {
        expect(() => new Probe().Screen('SELECT ID FROM secret.vwFoo', fakeProvider([PUBLIC_FOO]))).toThrow(
            /entity base view, not 'secret.vwFoo'/,
        );
    });

    it('refuses an unqualified view name that exists in more than one schema', () => {
        const provider = fakeProvider([PUBLIC_FOO, { Name: 'Other Foo', SchemaName: 'other', BaseView: 'vwFoo' }]);
        expect(() => new Probe().Screen('SELECT ID FROM vwFoo', provider)).toThrow(/more than one schema/);
        expect(() => new Probe().Screen('SELECT ID FROM other.vwFoo', provider)).not.toThrow();
    });

    it('refuses an entity the caller cannot read', () => {
        expect(() => new Probe().Screen('SELECT ID FROM public.vwFoo', fakeProvider([{ ...PUBLIC_FOO, canRead: false }]))).toThrow(
            /read permission/,
        );
    });

    it('refuses an entity that is row-level-security filtered for the caller', () => {
        const provider = fakeProvider([{ ...PUBLIC_FOO, rowFilter: "(UserID = 'U1')" }]);
        expect(() => new Probe().Screen('SELECT ID, UserID FROM public.vwFoo', provider)).toThrow(/row-level-security/);
    });

    it('refuses an entity with a field the caller is denied', () => {
        const provider = fakeProvider([{ ...PUBLIC_FOO, deniedFields: ['secret'] }]);
        expect(() => new Probe().Screen('SELECT ID FROM public.vwFoo', provider)).toThrow(/not permitted to read/);
    });

    it('applies the scope check to every reference, including joins and subqueries', () => {
        const provider = fakeProvider([PUBLIC_FOO, { Name: 'Bar', SchemaName: 'public', BaseView: 'vwBar', rowFilter: '(1=0)' }]);
        expect(() =>
            new Probe().Screen('SELECT f.ID FROM public.vwFoo f WHERE f.ID IN (SELECT FooID FROM public.vwBar)', provider),
        ).toThrow(/'Bar' is row-level-security filtered/);
    });

    it('exempts CTE names the statement defines', () => {
        expect(() =>
            new Probe().Screen('WITH x AS (SELECT ID FROM public.vwFoo) SELECT ID FROM x', fakeProvider([PUBLIC_FOO])),
        ).not.toThrow();
    });
});
