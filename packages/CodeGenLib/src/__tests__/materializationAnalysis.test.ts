import { describe, it, expect } from 'vitest';
import {
    analyzeQueryForMaterialization,
    MATERIALIZATION_SURROGATE_COLUMN,
    DEFAULT_SURROGATE_SQL_TYPE,
    type QueryFieldShape,
} from '../Database/materializationAnalysis';

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
