/**
 * PostgreSQL cannot concatenate statements the way SQL Server can — its extended protocol carries
 * one statement per message — so same-shape items are combined into ONE `UNION ALL` instead.
 * Verified end-to-end against real PostgreSQL (function invoked once per branch, rows tagged to
 * the right item, parameters intact after renumbering); these pin the pure logic.
 */
import { describe, it, expect } from 'vitest';
import { ShapeOf, GroupByShape, BuildGroupSQL, SplitGroupRows, BATCH_INDEX_COLUMN } from '../PostgreSQLBatchedSubmit.js';

const item = (Instruction: string, Params: unknown[] = []) => ({ Instruction, Params });

describe('ShapeOf', () => {
    it('erases placeholder NUMBERS so only the shape remains', () => {
        expect(ShapeOf('SELECT * FROM sp(a => $1, b => $2)')).toBe(ShapeOf('SELECT * FROM sp(a => $7, b => $8)'));
    });

    it('does not leave a stray digit behind on a two-digit placeholder', () => {
        // A naive /\$\d/ would turn `$10` into `?0` and make it differ from `$1` → `?`.
        expect(ShapeOf('sp($10)')).toBe(ShapeOf('sp($1)'));
    });

    it('treats a DIFFERENT argument list as a different shape', () => {
        // GenerateSaveSQL emits only the fields it is saving, so two updates to one entity really
        // can differ — grouping them would produce a UNION ALL with mismatched column lists.
        expect(ShapeOf('sp(a => $1)')).not.toBe(ShapeOf('sp(a => $1, b => $2)'));
    });
});

describe('GroupByShape', () => {
    it('groups consecutive same-shape items and preserves order', () => {
        const groups = GroupByShape([item('sp($1)'), item('sp($2)'), item('other($3)'), item('sp($4)')]);
        expect(groups).toEqual([[0, 1], [2], [3]]);
    });

    it('never reorders writes to make a bigger group', () => {
        // Items 0 and 2 share a shape but item 1 sits between them. Reordering could change what
        // lands first, which the caller may care about — two groups is the correct answer.
        const groups = GroupByShape([item('a($1)'), item('b($2)'), item('a($3)')]);
        expect(groups).toEqual([[0], [1], [2]]);
    });
});

describe('BuildGroupSQL', () => {
    it('leaves a group of ONE exactly as it was — no wrapper, no index column', () => {
        const items = [item('SELECT * FROM sp($1)', ['x'])];
        const g = BuildGroupSQL(items, [0]);
        expect(g.SQL).toBe('SELECT * FROM sp($1)');
        expect(g.Params).toEqual(['x']);
    });

    it('renumbers placeholders into ONE continuous sequence across branches', () => {
        // One statement carries one parameter list; a branch keeping its original numbering would
        // read another branch's values.
        const items = [item('SELECT * FROM sp($1, $2)', ['a1', 'a2']), item('SELECT * FROM sp($1, $2)', ['b1', 'b2'])];
        const g = BuildGroupSQL(items, [0, 1]);
        expect(g.SQL).toContain('sp($1, $2)');
        expect(g.SQL).toContain('sp($3, $4)');
        expect(g.Params).toEqual(['a1', 'a2', 'b1', 'b2']);
        expect(g.SQL).toContain(`SELECT 0 AS ${BATCH_INDEX_COLUMN}`);
        expect(g.SQL).toContain(`SELECT 1 AS ${BATCH_INDEX_COLUMN}`);
        expect(g.SQL.trimEnd().endsWith('ORDER BY 1')).toBe(true);
    });

    it('collapses a placeholder used twice into ONE parameter', () => {
        const items = [item('SELECT * FROM sp($1, $1)', ['once']), item('SELECT * FROM sp($1, $1)', ['twice'])];
        const g = BuildGroupSQL(items, [0, 1]);
        expect(g.Params).toEqual(['once', 'twice']);
        expect(g.SQL).toContain('sp($1, $1)');
        expect(g.SQL).toContain('sp($2, $2)');
    });

    it('tags each branch with its ORIGINAL item index, not its position in the group', () => {
        const items = [item('x($1)', ['0']), item('y($1)', ['1']), item('x($1)', ['2'])];
        const g = BuildGroupSQL(items, [0, 2]);
        expect(g.SQL).toContain(`SELECT 0 AS ${BATCH_INDEX_COLUMN}`);
        expect(g.SQL).toContain(`SELECT 2 AS ${BATCH_INDEX_COLUMN}`);
    });
});

describe('SplitGroupRows', () => {
    it('routes rows by index and strips the index column', () => {
        const rows = [
            { [BATCH_INDEX_COLUMN]: 0, ID: 'a' },
            { [BATCH_INDEX_COLUMN]: 1, ID: 'b' },
        ];
        const out = SplitGroupRows(rows, [0, 1]);
        expect(out.get(0)).toEqual([{ ID: 'a' }]);
        expect(out.get(1)).toEqual([{ ID: 'b' }]);
    });

    it('passes a single-item group straight through, index column and all untouched', () => {
        const rows = [{ ID: 'solo' }];
        expect(SplitGroupRows(rows, [5]).get(5)).toEqual([{ ID: 'solo' }]);
    });

    it('reports nothing for a branch that produced no rows', () => {
        const out = SplitGroupRows([{ [BATCH_INDEX_COLUMN]: 0, ID: 'a' }], [0, 1]);
        expect(out.get(0)).toEqual([{ ID: 'a' }]);
        expect(out.get(1)).toBeUndefined();
    });
});
