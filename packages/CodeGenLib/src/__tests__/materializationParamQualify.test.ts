import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { qualifyParameterizedQuery, proveFilterColumnBinding, type ParamClassification } from '../Database/materializationAnalysis';

/**
 * Phase 2a — parameterization qualifying core (plan §9 buckets + §10 asymmetric-risk).
 * Pure decision logic over verified per-param classifications; default to NOT materializable.
 */
describe('qualifyParameterizedQuery', () => {
    const out = ['ID', 'Amount', 'ChapterID', 'Region'];
    const dialect = new SQLServerDialect();
    /**
     * The rendered SQL that goes with `out`: one table, no aliases, every output column a plain projection
     * of the identically-named source column, and both row-filter predicates present in the top-level WHERE.
     * This is the ordinary shape a RowFilterBroad query has, so every case below that supplies it is also a
     * standing non-regression check that the new binding proof does not refuse the normal path.
     */
    const sql = "SELECT ID, Amount, ChapterID, Region FROM Orders WHERE ChapterID = 7 AND Region = 'East'";

    it('no params → mode None, qualifies', () => {
        const r = qualifyParameterizedQuery({ queryName: 'Q', params: [], outputColumns: out });
        expect(r).toEqual({ qualifies: true, paramMode: 'None', rowFilterColumns: [], readFilterSpec: [] });
    });

    it('single row-filter on a present output column → RowFilterBroad + that column + read-filter spec', () => {
        const params: ParamClassification[] = [{ name: 'chapterId', role: 'RowFilter', filterColumn: 'ChapterID', filterOperator: '=', filterKind: 'scalar' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowRowFilterBroad: true, sql, dialect });
        expect(r.qualifies).toBe(true);
        expect(r.paramMode).toBe('RowFilterBroad');
        expect(r.rowFilterColumns).toEqual(['ChapterID']);
        expect(r.readFilterSpec).toEqual([{ column: 'ChapterID', operator: '=', paramName: 'chapterId', kind: 'scalar' }]);
    });

    it('multiple row-filters, all columns present → RowFilterBroad with all columns + spec entries', () => {
        const params: ParamClassification[] = [
            { name: 'chapterId', role: 'RowFilter', filterColumn: 'ChapterID', filterOperator: '>=', filterKind: 'scalar' },
            { name: 'regions', role: 'RowFilter', filterColumn: 'Region', filterOperator: 'IN', filterKind: 'list' },
        ];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowRowFilterBroad: true, sql, dialect });
        expect(r.paramMode).toBe('RowFilterBroad');
        expect(r.rowFilterColumns).toEqual(['ChapterID', 'Region']);
        expect(r.readFilterSpec).toEqual([
            { column: 'ChapterID', operator: '>=', paramName: 'chapterId', kind: 'scalar' },
            { column: 'Region', operator: 'IN', paramName: 'regions', kind: 'list' },
        ]);
    });

    it('row-filter column matched case-insensitively', () => {
        const params: ParamClassification[] = [{ name: 'c', role: 'RowFilter', filterColumn: 'chapterid', filterOperator: '=', filterKind: 'scalar' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowRowFilterBroad: true, sql, dialect });
        expect(r.qualifies).toBe(true);
        expect(r.paramMode).toBe('RowFilterBroad');
    });

    it('row-filter refuses BY DEFAULT (RowFilterBroad enablement switch off)', () => {
        const params: ParamClassification[] = [{ name: 'chapterId', role: 'RowFilter', filterColumn: 'ChapterID', filterOperator: '=', filterKind: 'scalar' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, sql, dialect }); // allowRowFilterBroad omitted → false
        expect(r.qualifies).toBe(false);
        expect(r.paramMode).toBe('None');
        expect(r.reason).toMatch(/not enabled in this build/i);
    });

    it('row-filter with an UNSAFE operator (LIKE) → refuse (stays live-only), even when enabled', () => {
        const params: ParamClassification[] = [{ name: 'q', role: 'RowFilter', filterColumn: 'Region', filterOperator: 'LIKE', filterKind: 'scalar' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowRowFilterBroad: true });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/read-time-safe operator set/i);
    });

    it('row-filter with operator/value-shape mismatch (IN but scalar kind) → refuse under uncertainty', () => {
        const params: ParamClassification[] = [{ name: 'x', role: 'RowFilter', filterColumn: 'Region', filterOperator: 'IN', filterKind: 'scalar' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowRowFilterBroad: true });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/expects a list value/i);
    });

    it('row-filter with an unresolved operator → refuse (cannot reconstruct the predicate)', () => {
        const params: ParamClassification[] = [{ name: 'x', role: 'RowFilter', filterColumn: 'ChapterID' }]; // no operator
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowRowFilterBroad: true });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/read-time-safe operator set/i);
    });

    it('row-filter on a column NOT in the output → refuse (unsound to filter a projected-away column)', () => {
        const params: ParamClassification[] = [{ name: 'x', role: 'RowFilter', filterColumn: 'NotProjected' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/not in the materialized output/i);
    });

    it('row-filter with no resolved column → refuse under uncertainty', () => {
        const params: ParamClassification[] = [{ name: 'x', role: 'RowFilter' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/no filter column/i);
    });

    it('unbounded structural (Bucket 3) → refuse', () => {
        const params: ParamClassification[] = [{ name: 'sql', role: 'Unbounded' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/unbounded|Bucket 3/i);
    });

    it('structural (Bucket 2) refuses by default (per-value cache disabled)', () => {
        const params: ParamClassification[] = [{ name: 'reportType', role: 'Structural', boundedDomain: ['a', 'b'] }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/per-value cache is disabled/i);
    });

    it('structural with bounded domain → PerValueCache when explicitly enabled', () => {
        const params: ParamClassification[] = [{ name: 'reportType', role: 'Structural', boundedDomain: ['a', 'b', 'c'] }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowPerValueCache: true });
        expect(r.qualifies).toBe(true);
        expect(r.paramMode).toBe('PerValueCache');
    });

    it('structural enabled but with no bounded domain → refuse', () => {
        const params: ParamClassification[] = [{ name: 'reportType', role: 'Structural' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowPerValueCache: true });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/no bounded domain/i);
    });

    it('mix of row-filter and structural params → refuse (not modeled in v1)', () => {
        const params: ParamClassification[] = [
            { name: 'chapterId', role: 'RowFilter', filterColumn: 'ChapterID', filterOperator: '=', filterKind: 'scalar' },
            { name: 'reportType', role: 'Structural', boundedDomain: ['a'] },
        ];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowPerValueCache: true, sql, dialect });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/mixes row-filter and structural/i);
    });

    /**
     * The filter column the verifier reports is a BARE name; the output-column list is built from
     * `QueryField.Name` — i.e. SELECT-list OUTPUT ALIASES. Matching one against the other by name alone
     * qualifies two queries whose materialized read would filter a DIFFERENT column than the live query.
     * Neither is catchable downstream: broad-render strips exactly ONE predicate in both, so
     * `removedCount === expectedRemovals` and `ambiguous` stays false.
     */
    describe('filter-column binding proof (qualifier awareness)', () => {
        it('JOIN COLLISION: predicate on o.Status, output projects c.Status → refuse', () => {
            const joinSQL = "SELECT o.ID, c.Status FROM Orders o INNER JOIN Customers c ON c.ID = o.CustomerID WHERE o.Status = 'X'";
            const params: ParamClassification[] = [{ name: 's', role: 'RowFilter', filterColumn: 'Status', filterOperator: '=', filterKind: 'scalar' }];
            const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], allowRowFilterBroad: true, sql: joinSQL, dialect });
            expect(r.qualifies).toBe(false);
            expect(r.paramMode).not.toBe('RowFilterBroad');
            expect(r.reason).toMatch(/different source column/i);
        });

        it('ALIAS REBINDING: output BillRegion is an alias over ShipRegion → refuse', () => {
            const aliasSQL = "SELECT ID, ShipRegion AS BillRegion FROM Orders WHERE BillRegion = 'East'";
            const params: ParamClassification[] = [{ name: 'r', role: 'RowFilter', filterColumn: 'BillRegion', filterOperator: '=', filterKind: 'scalar' }];
            const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: ['ID', 'BillRegion'], allowRowFilterBroad: true, sql: aliasSQL, dialect });
            expect(r.qualifies).toBe(false);
            expect(r.reason).toMatch(/ALIAS over source column "ShipRegion"/i);
        });

        it('no rendered SQL supplied → refuse (fail closed; nothing can prove the binding)', () => {
            const params: ParamClassification[] = [{ name: 'c', role: 'RowFilter', filterColumn: 'ChapterID', filterOperator: '=', filterKind: 'scalar' }];
            const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowRowFilterBroad: true });
            expect(r.qualifies).toBe(false);
            expect(r.reason).toMatch(/no rendered SQL was supplied/i);
        });

        it('NON-REGRESSION: a JOIN whose predicate and projection share the SAME qualifier still qualifies', () => {
            const joinSQL = "SELECT o.ID, o.Status FROM Orders o INNER JOIN Customers c ON c.ID = o.CustomerID WHERE o.Status = 'X'";
            const params: ParamClassification[] = [{ name: 's', role: 'RowFilter', filterColumn: 'Status', filterOperator: '=', filterKind: 'scalar' }];
            const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: ['ID', 'Status'], allowRowFilterBroad: true, sql: joinSQL, dialect });
            expect(r.qualifies).toBe(true);
            expect(r.paramMode).toBe('RowFilterBroad');
            expect(r.rowFilterColumns).toEqual(['Status']);
        });
    });
});

describe('proveFilterColumnBinding', () => {
    const dialect = new SQLServerDialect();
    const prove = (sql: string, filterColumn: string) => proveFilterColumnBinding({ sql, dialect, filterColumn });

    it('proves the ordinary single-table, unqualified, un-aliased case', () => {
        expect(prove("SELECT ID, Region FROM Orders WHERE Region = 'East'", 'Region')).toEqual({ provable: true });
    });

    it('proves a single-table query even when the reference forms differ (qualifier carries no information)', () => {
        expect(prove("SELECT o.ID, o.Region FROM Orders o WHERE Region = 'East'", 'Region').provable).toBe(true);
        expect(prove("SELECT ID, Region FROM Orders o WHERE o.Region = 'East'", 'Region').provable).toBe(true);
    });

    it('refuses a join collision and names both sides in the reason', () => {
        const r = prove("SELECT o.ID, c.Status FROM Orders o INNER JOIN Customers c ON c.ID = o.CustomerID WHERE o.Status = 'X'", 'Status');
        expect(r.provable).toBe(false);
        expect(r.reason).toMatch(/filters "o\.Status".*projects "c\.Status"/i);
    });

    it('refuses a join where either side is unqualified (the name cannot be attributed)', () => {
        expect(prove("SELECT Status, o.ID FROM Orders o INNER JOIN Customers c ON c.ID = o.CustomerID WHERE o.Status = 'X'", 'Status').provable).toBe(false);
        expect(prove("SELECT o.Status, o.ID FROM Orders o INNER JOIN Customers c ON c.ID = o.CustomerID WHERE Status = 'X'", 'Status').provable).toBe(false);
    });

    it('refuses an alias that rebinds a differently-named source column', () => {
        const r = prove("SELECT ID, ShipRegion AS BillRegion FROM Orders WHERE BillRegion = 'East'", 'BillRegion');
        expect(r.provable).toBe(false);
        expect(r.reason).toMatch(/ALIAS over source column "ShipRegion"/);
    });

    it('refuses a computed output column of the same name', () => {
        const r = prove("SELECT ID, UPPER(Region) AS Region FROM Orders WHERE Region = 'East'", 'Region');
        expect(r.provable).toBe(false);
        expect(r.reason).toMatch(/computed expression/i);
    });

    it('refuses a wildcard projection (output-to-source mapping unknown)', () => {
        expect(prove("SELECT * FROM Orders WHERE Region = 'East'", 'Region').reason).toMatch(/wildcard/i);
    });

    it('refuses a set-operation root (only the first branch is visible)', () => {
        const unionSQL = "SELECT ID, Region FROM Orders WHERE Region = 'East' UNION ALL SELECT ID, Region FROM Archive";
        expect(prove(unionSQL, 'Region').reason).toMatch(/UNION|single plain SELECT/i);
    });

    it('refuses when the WHERE clause does not actually reference the column', () => {
        expect(prove("SELECT ID, Region FROM Orders WHERE ID = 3", 'Region').reason).toMatch(/no reference to a column named/i);
    });

    it('refuses unparseable SQL and empty SQL', () => {
        expect(prove('this is not sql at all', 'Region').provable).toBe(false);
        expect(prove('', 'Region').provable).toBe(false);
    });
});
