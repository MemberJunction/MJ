/**
 * Catalog-free name resolution: CTE visibility per level, FROM-source names per select block,
 * qualifier binding and correlated subqueries, on SQL Server and PostgreSQL.
 */
import { describe, it, expect } from 'vitest';
import type { SqlDocument } from '../../sql/sqlDocument.js';
import { PG, PLATFORMS, ParseClean, SS } from './helpers.js';

/** Each table reference as `name -> Table | CTE@<cte span start>`. */
function bindings(doc: SqlDocument): string[] {
    return doc.TableReferences().Value.filter(t => t.Kind !== 'Function').map(t => `${t.Name.Parts.map(p => p.Value).join('.')}->${t.Kind === 'CTE' ? `CTE@${t.CTE?.Span.Start}` : 'Table'}`);
}

/** Each column reference as `path -> bound source name (outer?)`. */
function columns(doc: SqlDocument): string[] {
    return doc.ColumnReferences().Value.map(c => `${c.Path.map(p => p.Value).join('.')}->${c.Binding === null ? '?' : `${c.Binding.Source.Name}${c.Binding.Outer ? '(outer)' : ''}`}`);
}

describe.each(PLATFORMS)('CTE visibility (%s)', (_name, dialect) => {
    it('binds a FROM name to a CTE, and a schema-qualified one to the table', () => {
        const doc = ParseClean('WITH Orders AS (SELECT ID FROM s.Orders) SELECT o.ID FROM Orders o JOIN s.Orders x ON x.ID = o.ID', dialect);
        expect(bindings(doc)).toEqual(['s.Orders->Table', 'Orders->CTE@5', 's.Orders->Table']);
    });

    it('lets a later CTE see an earlier one, but not the reverse', () => {
        const doc = ParseClean('WITH a AS (SELECT x FROM b), b AS (SELECT x FROM a) SELECT x FROM b', dialect);
        expect(bindings(doc)).toEqual(['b->Table', 'a->CTE@5', 'b->CTE@29']);
    });

    it('lets a CTE name in a subquery of the main query bind to the CTE', () => {
        const doc = ParseClean('WITH c AS (SELECT 1 AS k) SELECT * FROM t WHERE t.k IN (SELECT k FROM c)', dialect);
        expect(bindings(doc)).toEqual(['t->Table', 'c->CTE@5']);
    });
});

describe('CTE visibility by dialect', () => {
    it('lets a SQL Server CTE refer to itself (recursion needs no keyword)', () => {
        const doc = ParseClean('WITH r AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM r WHERE n < 3) SELECT n FROM r', SS);
        expect(bindings(doc)).toEqual(['r->CTE@5', 'r->CTE@5']);
    });

    it('needs RECURSIVE for a PostgreSQL CTE to see itself', () => {
        expect(bindings(ParseClean('WITH r AS (SELECT n FROM r) SELECT n FROM r', PG))).toEqual(['r->Table', 'r->CTE@5']);
        expect(bindings(ParseClean('WITH RECURSIVE r AS (SELECT n FROM r) SELECT n FROM r', PG))).toEqual(['r->CTE@15', 'r->CTE@15']);
    });

    it('shadows an outer CTE with a nested one of the same name (PostgreSQL)', () => {
        const doc = ParseClean('WITH c AS (SELECT 1 AS a) SELECT * FROM (WITH c AS (SELECT 2 AS a) SELECT a FROM c) d, c', PG);
        expect(bindings(doc)).toEqual(['c->CTE@46', 'c->CTE@5']);
    });

    it('compares names by the dialect\'s case rules', () => {
        expect(bindings(ParseClean('WITH Recent AS (SELECT 1 AS a) SELECT a FROM RECENT', SS))).toEqual(['RECENT->CTE@5']);
        expect(bindings(ParseClean('WITH Recent AS (SELECT 1 AS a) SELECT a FROM RECENT', PG))).toEqual(['RECENT->CTE@5']);
        expect(bindings(ParseClean('WITH "Recent" AS (SELECT 1 AS a) SELECT a FROM recent', PG))).toEqual(['recent->Table']);
    });
});

describe.each(PLATFORMS)('qualifiers and sources (%s)', (_name, dialect) => {
    it('binds qualifiers to aliases and to unaliased table names', () => {
        const doc = ParseClean('SELECT a.x, t2.y, s.t3.z FROM t1 a JOIN t2 ON t2.k = a.k JOIN s.t3 ON s.t3.k = a.k', dialect);
        expect(columns(doc)).toEqual(['a.x->a', 't2.y->t2', 's.t3.z->t3', 't2.k->t2', 'a.k->a', 's.t3.k->t3', 'a.k->a']);
    });

    it('does not bind a table name that an alias hides', () => {
        expect(columns(ParseClean('SELECT t1.x FROM t1 a', dialect))).toEqual(['t1.x->?']);
    });

    it('binds an unqualified column only when the block has one source', () => {
        expect(columns(ParseClean('SELECT x FROM t', dialect))).toEqual(['x->t']);
        expect(columns(ParseClean('SELECT x FROM t, u', dialect))).toEqual(['x->?']);
    });

    it('lets a correlated subquery see the outer sources', () => {
        const doc = ParseClean('SELECT o.id, (SELECT COUNT(*) FROM i WHERE i.oid = o.id) AS n FROM o', dialect);
        expect(columns(doc)).toEqual(['o.id->o', 'i.oid->i', 'o.id->o(outer)']);
    });

    it('keeps a derived table from seeing its sibling sources', () => {
        expect(columns(ParseClean('SELECT 1 FROM a, (SELECT a.x FROM b) d', dialect))).toEqual(['a.x->?']);
    });

    it('lets a derived table name and its columns resolve in the outer block', () => {
        expect(columns(ParseClean('SELECT d.total FROM (SELECT SUM(v) AS total FROM t) d', dialect))).toEqual(['d.total->d', 'v->t']);
    });

    it('knows the sources of each select block', () => {
        const doc = ParseClean('SELECT 1 FROM a x JOIN b ON b.k = x.k, (SELECT 1 AS c) d', dialect);
        const scope = doc.Scope().Scopes.find(s => s.Parent === null);
        expect(scope?.Sources.map(s => [s.Name, s.Kind])).toEqual([['x', 'Table'], ['b', 'Table'], ['d', 'Derived']]);
    });
});

describe('lateral sources', () => {
    it('lets a CROSS APPLY body see the sources to its left (SQL Server)', () => {
        expect(columns(ParseClean('SELECT 1 FROM c CROSS APPLY (SELECT TOP 1 o.d FROM o WHERE o.cid = c.id) x', SS))).toEqual(['o.d->o', 'o.cid->o', 'c.id->c(outer)']);
    });

    it('lets a LATERAL body see the sources to its left (PostgreSQL)', () => {
        expect(columns(ParseClean('SELECT 1 FROM c, LATERAL (SELECT o.d FROM o WHERE o.cid = c.id) x', PG))).toEqual(['o.d->o', 'o.cid->o', 'c.id->c(outer)']);
    });

    it('binds a set operation\'s ORDER BY in its first branch', () => {
        const doc = ParseClean('SELECT a.n FROM a UNION SELECT b.n FROM b ORDER BY a.n', SS);
        expect(columns(doc)).toEqual(['a.n->a', 'b.n->b', 'a.n->a']);
    });
});
