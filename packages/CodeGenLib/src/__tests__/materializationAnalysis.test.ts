import { describe, it, expect } from 'vitest';
import {
    analyzeQueryForMaterialization,
    MATERIALIZATION_SURROGATE_COLUMN,
    DEFAULT_SURROGATE_SQL_TYPE,
    detectAggregationKeyColumns,
    detectAdditiveMeasures,
    type QueryFieldShape,
} from '../Database/materializationAnalysis';
import { SQLServerDialect } from '@memberjunction/sql-dialect';

/**
 * Sub-step C1: query-materialization qualifying + result-shape + surrogate-key analysis
 * (plan §4.2 / §5 / §9). Pure logic, fully unit-testable.
 */
describe('analyzeQueryForMaterialization', () => {
    const fields: QueryFieldShape[] = [
        { Name: 'customer_id', SQLFullType: 'uniqueidentifier' },
        { Name: 'order_count', SQLFullType: 'int' },
        { Name: 'total_amount', SQLFullType: 'decimal(18,2)', IsComputed: true },
    ];

    describe('qualifying rule (asymmetric-risk: default to NOT materializable)', () => {
        it('qualifies an unparameterized query that has declared output fields', () => {
            const r = analyzeQueryForMaterialization({ queryName: 'Customer Order Summary', isParameterized: false, fields });
            expect(r.qualifies).toBe(true);
            expect(r.reason).toBeUndefined();
        });

        it('does NOT qualify a parameterized query (deferred to Phase 2)', () => {
            const r = analyzeQueryForMaterialization({ queryName: 'By Chapter', isParameterized: true, fields });
            expect(r.qualifies).toBe(false);
            expect(r.reason).toMatch(/parameterized/i);
            expect(r.columns).toEqual([]);
        });

        it('does NOT qualify a query with no declared output fields', () => {
            const r = analyzeQueryForMaterialization({ queryName: 'Unanalyzed', isParameterized: false, fields: [] });
            expect(r.qualifies).toBe(false);
            expect(r.reason).toMatch(/no declared output fields/i);
        });

        it('does NOT qualify when an output column would shadow the surrogate key', () => {
            const collide: QueryFieldShape[] = [{ Name: MATERIALIZATION_SURROGATE_COLUMN, SQLFullType: 'int' }];
            const r = analyzeQueryForMaterialization({ queryName: 'Collide', isParameterized: false, fields: collide });
            expect(r.qualifies).toBe(false);
            expect(r.reason).toMatch(/shadow/i);
        });
    });

    describe('result-shape + key derivation', () => {
        it('prepends a synthetic surrogate PRIMARY KEY column (full-rebuild compatible)', () => {
            const r = analyzeQueryForMaterialization({ queryName: 'Q', isParameterized: false, fields });
            const pk = r.columns[0];
            expect(pk.Name).toBe(MATERIALIZATION_SURROGATE_COLUMN);
            expect(pk.IsPrimaryKey).toBe(true);
            expect(pk.Nullable).toBe(false);
            expect(pk.SQLType).toBe(DEFAULT_SURROGATE_SQL_TYPE);
            expect(r.surrogateColumnName).toBe(MATERIALIZATION_SURROGATE_COLUMN);
        });

        it('maps each query output column to a nullable, non-PK snapshot column preserving its type', () => {
            const r = analyzeQueryForMaterialization({ queryName: 'Q', isParameterized: false, fields });
            const data = r.columns.slice(1);
            expect(data.map((c) => c.Name)).toEqual(['customer_id', 'order_count', 'total_amount']);
            expect(data.every((c) => c.Nullable && !c.IsPrimaryKey)).toBe(true);
            expect(data.find((c) => c.Name === 'total_amount')!.SQLType).toBe('decimal(18,2)');
            // exactly one PK overall (the surrogate)
            expect(r.columns.filter((c) => c.IsPrimaryKey)).toHaveLength(1);
        });

        it('honors an engine-specific surrogate type override (e.g. PostgreSQL)', () => {
            const r = analyzeQueryForMaterialization({
                queryName: 'Q',
                isParameterized: false,
                fields,
                surrogateSQLType: 'int GENERATED ALWAYS AS IDENTITY',
            });
            expect(r.columns[0].SQLType).toBe('int GENERATED ALWAYS AS IDENTITY');
        });
    });
});

describe('detectAggregationKeyColumns (Phase 3)', () => {
    const dialect = new SQLServerDialect();
    const fields: QueryFieldShape[] = [
        { Name: 'region', SQLFullType: 'nvarchar(50)' },
        { Name: 'yr', SQLFullType: 'int' },
        { Name: 'total', SQLFullType: 'decimal(18,2)' },
    ];
    it('returns the grouping columns as the key for a GROUP BY aggregation', () => {
        const key = detectAggregationKeyColumns({
            sql: 'SELECT region, yr, SUM(amt) AS total FROM sales GROUP BY region, yr',
            dialect, fields,
        });
        expect(key).toEqual([{ name: 'region', type: 'nvarchar(50)' }, { name: 'yr', type: 'int' }]);
    });
    it('returns null when there is no GROUP BY', () => {
        expect(detectAggregationKeyColumns({ sql: 'SELECT region, amt FROM sales', dialect, fields })).toBeNull();
    });
    it('returns null when there is no non-aggregate grouping column', () => {
        expect(detectAggregationKeyColumns({
            sql: 'SELECT SUM(amt) AS total FROM sales GROUP BY region',
            dialect, fields: [{ Name: 'total', SQLFullType: 'decimal(18,2)' }],
        })).toBeNull();
    });
    it('returns null when a grouping column cannot be mapped to an output field', () => {
        expect(detectAggregationKeyColumns({
            sql: 'SELECT region, yr, SUM(amt) AS total FROM sales GROUP BY region, yr',
            dialect, fields: [{ Name: 'total', SQLFullType: 'decimal(18,2)' }],
        })).toBeNull();
    });
    it('returns null when a grouping term is an EXPRESSION (e.g. YEAR(date)) — bails to full rebuild', () => {
        expect(detectAggregationKeyColumns({
            sql: 'SELECT region, YEAR(OrderDate) AS yr, SUM(amt) AS total FROM sales GROUP BY region, YEAR(OrderDate)',
            dialect, fields,
        })).toBeNull();
    });
    it('returns null when a grouped column is not projected (key would be too narrow)', () => {
        // GROUP BY region, yr but only region is projected → key can only be {region}, which collides.
        expect(detectAggregationKeyColumns({
            sql: 'SELECT region, SUM(amt) AS total FROM sales GROUP BY region, yr',
            dialect, fields: [{ Name: 'region', SQLFullType: 'nvarchar(50)' }, { Name: 'total', SQLFullType: 'decimal(18,2)' }],
        })).toBeNull();
    });

    describe('set-operation roots (UNION/EXCEPT/INTERSECT) must refuse — first-branch-only blind spot', () => {
        // node-sql-parser does NOT emit a distinct union node: a set operation is a SINGLE type:'select'
        // root carrying set_op/_next whose `groupby` and `columns` describe ONLY THE FIRST BRANCH. Reading
        // it would report {region} as the key of the WHOLE query, but the combined result legitimately has
        // ONE ROW PER (branch × region). The caller would then hash {region} into the surrogate PK and pick
        // the additive MERGE-upsert Incremental path, where the two branches collide on the same hash and
        // one silently overwrites the other — permanently wrong aggregates, no error, no fallback.
        const twoFields: QueryFieldShape[] = [
            { Name: 'Region', SQLFullType: 'nvarchar(50)' },
            { Name: 'Total', SQLFullType: 'decimal(18,2)' },
        ];

        it('refuses a UNION ALL of two identically-grouped branches (the reported repro)', () => {
            const sql =
                'SELECT Region, SUM(Amount) AS Total FROM CurrentSales GROUP BY Region ' +
                'UNION ALL ' +
                'SELECT Region, SUM(Amount) AS Total FROM ArchiveSales GROUP BY Region';
            expect(detectAggregationKeyColumns({ sql, dialect, fields: twoFields })).toBeNull();
        });

        it('refuses a plain UNION and an EXCEPT the same way', () => {
            const union =
                'SELECT Region, SUM(Amount) AS Total FROM CurrentSales GROUP BY Region ' +
                'UNION SELECT Region, SUM(Amount) AS Total FROM ArchiveSales GROUP BY Region';
            const except =
                'SELECT Region, SUM(Amount) AS Total FROM CurrentSales GROUP BY Region ' +
                'EXCEPT SELECT Region, SUM(Amount) AS Total FROM ArchiveSales GROUP BY Region';
            expect(detectAggregationKeyColumns({ sql: union, dialect, fields: twoFields })).toBeNull();
            expect(detectAggregationKeyColumns({ sql: except, dialect, fields: twoFields })).toBeNull();
        });

        it('NON-REGRESSION: the first branch on its own (no set op) still keys normally', () => {
            // Proves the guard fires on the SET OPERATION, not on the branch SQL — i.e. it has not
            // disabled aggregation keying generally.
            expect(detectAggregationKeyColumns({
                sql: 'SELECT Region, SUM(Amount) AS Total FROM CurrentSales GROUP BY Region',
                dialect, fields: twoFields,
            })).toEqual([{ name: 'Region', type: 'nvarchar(50)' }]);
        });
    });

    describe('join qualifier awareness — a grouping column must be the column that is projected', () => {
        const joinFields: QueryFieldShape[] = [
            { Name: 'region', SQLFullType: 'nvarchar(50)' },
            { Name: 'total', SQLFullType: 'decimal(18,2)' },
        ];

        it('refuses when GROUP BY groups o.region but the SELECT list projects c.region', () => {
            // Both are "region" by bare name, so a name-only match would key the materialization on the
            // CUSTOMER's region while the query groups by the ORDER's — a key that does not identify a row.
            expect(detectAggregationKeyColumns({
                sql: 'SELECT c.region, SUM(o.amt) AS total FROM orders o INNER JOIN customers c ON c.id = o.customer_id GROUP BY o.region',
                dialect, fields: joinFields,
            })).toBeNull();
        });

        it('refuses when the join query leaves either side unqualified (unprovable)', () => {
            expect(detectAggregationKeyColumns({
                sql: 'SELECT c.region, SUM(o.amt) AS total FROM orders o INNER JOIN customers c ON c.id = o.customer_id GROUP BY region',
                dialect, fields: joinFields,
            })).toBeNull();
        });

        it('NON-REGRESSION: a join whose GROUP BY and projection carry the SAME qualifier still keys', () => {
            expect(detectAggregationKeyColumns({
                sql: 'SELECT o.region, SUM(o.amt) AS total FROM orders o INNER JOIN customers c ON c.id = o.customer_id GROUP BY o.region',
                dialect, fields: joinFields,
            })).toEqual([{ name: 'region', type: 'nvarchar(50)' }]);
        });

        it('NON-REGRESSION: a single-table query needs no qualifiers at all (mixed forms still key)', () => {
            expect(detectAggregationKeyColumns({
                sql: 'SELECT s.region, SUM(s.amt) AS total FROM sales s GROUP BY region',
                dialect, fields: joinFields,
            })).toEqual([{ name: 'region', type: 'nvarchar(50)' }]);
        });
    });
});

describe('detectAdditiveMeasures (Phase 4)', () => {
    it('true for SUM/COUNT-only aggregations', () => {
        expect(detectAdditiveMeasures('SELECT region, SUM(amt) AS total, COUNT(*) AS n FROM sales GROUP BY region')).toBe(true);
    });
    it('false when a non-additive aggregate is present', () => {
        expect(detectAdditiveMeasures('SELECT region, SUM(amt) AS total, AVG(amt) AS a FROM sales GROUP BY region')).toBe(false);
        expect(detectAdditiveMeasures('SELECT region, MAX(amt) AS m FROM sales GROUP BY region')).toBe(false);
        expect(detectAdditiveMeasures('SELECT region, MIN(amt) AS m FROM sales GROUP BY region')).toBe(false);
    });
    it('false for COUNT(DISTINCT ...) (not delta-combinable)', () => {
        expect(detectAdditiveMeasures('SELECT region, COUNT(DISTINCT customer) AS c FROM sales GROUP BY region')).toBe(false);
    });
    it('false for SUM(DISTINCT ...) (M4: distinct-sum is NOT additive — deltas can double-count/lose values)', () => {
        // A plain SUM is additive (partial sums combine by addition), but SUM(DISTINCT x) depends on the set of
        // distinct values across the WHOLE group — an incremental delta batch can neither add nor subtract safely,
        // so it must fall back to a full/dirty-group recompute. Regression guard for the M4 finding.
        expect(detectAdditiveMeasures('SELECT region, SUM(DISTINCT amount) AS t FROM sales GROUP BY region')).toBe(false);
        // Case/spacing variants the regex must still catch.
        expect(detectAdditiveMeasures('SELECT region, sum(  distinct amount ) AS t FROM sales GROUP BY region')).toBe(false);
    });
    it('false when there is no additive aggregate at all', () => {
        expect(detectAdditiveMeasures('SELECT region FROM sales GROUP BY region')).toBe(false);
        expect(detectAdditiveMeasures('')).toBe(false);
    });
});
