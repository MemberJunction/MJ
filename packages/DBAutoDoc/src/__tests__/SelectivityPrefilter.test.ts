import { describe, it, expect } from 'vitest';
import { __test__ } from '../discovery/SemanticPhase.js';
import { DatabaseDocumentation } from '../types/state.js';
import { OrganicKeyDetectionConfig } from '../types/config.js';

const { prefilter, MIN_DISTINCT_FOR_KEY, MIN_UNIQUENESS_RATIO } = __test__;

interface ColSpec {
    name: string;
    dataType?: string;
    distinctCount?: number;
    totalRows?: number;
    /** Omit to simulate a column with no statistics gathered. */
    withStats?: boolean;
}

/**
 * Build the minimal state shape the prefilter reads. Cast through a declared partial
 * rather than constructing a whole DatabaseDocumentation: the prefilter touches only
 * schemas[].tables[].columns[], and a faithful partial is a more honest fixture than a
 * hundred irrelevant fields.
 */
function stateWith(tables: Array<{ schema: string; table: string; columns: ColSpec[] }>): DatabaseDocumentation {
    const bySchema = new Map<string, Array<{ name: string; columns: unknown[] }>>();
    for (const t of tables) {
        const cols = t.columns.map((c) => {
            const distinct = c.distinctCount ?? 0;
            const total = c.totalRows ?? 1;
            return {
                name: c.name,
                dataType: c.dataType ?? 'nvarchar',
                description: '',
                isPrimaryKey: false,
                isForeignKey: false,
                statistics: (c.withStats ?? true)
                    ? {
                          distinctCount: distinct,
                          uniquenessRatio: total > 0 ? distinct / total : 0,
                          totalRows: total,
                          sampleValues: [],
                      }
                    : undefined,
            };
        });
        const list = bySchema.get(t.schema) ?? [];
        list.push({ name: t.table, columns: cols });
        bySchema.set(t.schema, list);
    }
    return {
        schemas: Array.from(bySchema.entries()).map(([name, tbls]) => ({ name, tables: tbls })),
    } as unknown as DatabaseDocumentation;
}

const cfg: OrganicKeyDetectionConfig = { enabled: true };

function keptColumns(state: DatabaseDocumentation): string[] {
    return prefilter(state, cfg).map((c) => c.column);
}

describe('selectivity prefilter — the conjunction bug (MJC-74)', () => {
    it('drops a boolean on a small table: distinct fails, ratio passes', () => {
        // plus.small_flag.is_active — 2 distinct over 100 rows, ratio 0.02.
        //
        // Old gate: `distinct < 10 && ratio < 0.001`
        //           2 < 10       -> true
        //           0.02 < 0.001 -> FALSE
        //           conjunction  -> false -> column KEPT.
        //
        // Clearing EITHER floor was enough to be treated as identity-bearing, which is
        // why the gate never removed the categorical columns it was written to remove.
        // Note this fails on the OPERATOR alone — raising the thresholds does not fix it,
        // because a higher ratio floor makes the old AND *even easier* to escape.
        const state = stateWith([
            { schema: 'plus', table: 'small_flag', columns: [{ name: 'is_active', distinctCount: 2, totalRows: 100 }] },
        ]);
        expect(keptColumns(state)).toEqual([]);
    });

    it('drops a low-cardinality type id: ratio fails, distinct passes at the old floor', () => {
        // plus.payment.payment_method_id — 33 distinct over 24,000 rows, ratio 0.001375.
        //
        // Old gate: 33 < 10 -> false, so the conjunction short-circuits and the column is
        // KEPT regardless of its ratio. It then became an organic key whose related-record
        // view value-joins a non-unique category column.
        const state = stateWith([
            {
                schema: 'plus',
                table: 'payment',
                columns: [{ name: 'payment_method_id', distinctCount: 33, totalRows: 24000 }],
            },
        ]);
        expect(keptColumns(state)).toEqual([]);
    });

    it('keeps a genuinely identity-bearing column that clears both floors', () => {
        // 41,115 distinct over 41,115 rows: ratio 1.0. A real key must survive — a gate
        // that drops everything is not an improvement over a gate that drops nothing.
        const state = stateWith([
            {
                schema: 'acgi',
                table: 'customer',
                columns: [{ name: 'cust_id', distinctCount: 41115, totalRows: 41115 }],
            },
        ]);
        expect(keptColumns(state)).toEqual(['cust_id']);
    });

    it('requires BOTH floors, not either', () => {
        const state = stateWith([
            {
                schema: 's',
                table: 't',
                columns: [
                    // distinct ok (60 >= 50), ratio too low (0.006) -> dropped
                    { name: 'high_distinct_low_ratio', distinctCount: 60, totalRows: 10000 },
                    // ratio ok (0.5), distinct too low (5 < 50) -> dropped
                    { name: 'high_ratio_low_distinct', distinctCount: 5, totalRows: 10 },
                    // both ok -> kept
                    { name: 'real_key', distinctCount: 900, totalRows: 1000 },
                ],
            },
        ]);
        expect(keptColumns(state)).toEqual(['real_key']);
    });

    it('the raised thresholds are the documented ones', () => {
        expect(MIN_DISTINCT_FOR_KEY).toBe(50);
        expect(MIN_UNIQUENESS_RATIO).toBe(0.02);
    });

    it('a column exactly on both floors is kept, not dropped', () => {
        const state = stateWith([
            { schema: 's', table: 't', columns: [{ name: 'edge', distinctCount: 50, totalRows: 2500 }] },
        ]);
        // 50 distinct, ratio exactly 0.02 — the comparison is `<`, so the boundary is inclusive.
        expect(keptColumns(state)).toEqual(['edge']);
    });

    it('fails open for a column with no statistics rather than dropping it blind', () => {
        // The gate is skipped entirely when statistics are absent. That is deliberate and
        // unchanged: dropping a column because nobody measured it would lose real keys,
        // and the gate is a cost filter, not a correctness one — the join probe is what
        // establishes correctness.
        const state = stateWith([
            { schema: 's', table: 't', columns: [{ name: 'unmeasured', withStats: false }] },
        ]);
        expect(keptColumns(state)).toEqual(['unmeasured']);
    });

    it('still drops binary types and audit columns regardless of selectivity', () => {
        const state = stateWith([
            {
                schema: 's',
                table: 't',
                columns: [
                    { name: 'photo', dataType: 'varbinary', distinctCount: 9000, totalRows: 9000 },
                    { name: 'CreatedAt', distinctCount: 9000, totalRows: 9000 },
                    { name: '__mj_UpdatedAt', distinctCount: 9000, totalRows: 9000 },
                    { name: 'keeper', distinctCount: 9000, totalRows: 9000 },
                ],
            },
        ]);
        expect(keptColumns(state)).toEqual(['keeper']);
    });
});
