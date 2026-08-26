/**
 * The two decisions batching gets wrong if it is written casually: parameter namespaces, and
 * mapping results back to items.
 *
 * Both are verified against the real driver in a live check (a batch whose middle item matches
 * no rows returns FIVE result sets for THREE items — the driver emits none at all for that item,
 * which is precisely what positional zipping cannot survive). These tests pin the pure logic.
 */
import { describe, it, expect } from 'vitest';
import { BuildBatch, SplitRecordsets, SENTINEL_COLUMN } from '../SQLServerBatchedSubmit.js';

describe('BuildBatch', () => {
    it('precedes every item with its own sentinel', () => {
        const { SQL } = BuildBatch([{ Instruction: 'EXEC spA' }, { Instruction: 'EXEC spB' }]);
        expect(SQL).toContain(`SELECT 0 AS [${SENTINEL_COLUMN}];`);
        expect(SQL).toContain(`SELECT 1 AS [${SENTINEL_COLUMN}];`);
        expect(SQL.indexOf('EXEC spA')).toBeLessThan(SQL.indexOf(`SELECT 1 AS [${SENTINEL_COLUMN}]`));
    });

    it('renumbers parameters ACROSS items so two items cannot take each other values', () => {
        // Both items rendered their own `?`s. One request carries ONE parameter namespace, so
        // leaving each at @p0 would silently bind the second item's value to the first.
        const { SQL, Params } = BuildBatch([
            { Instruction: 'EXEC spA @x=?, @y=?', Vars: ['a1', 'a2'] },
            { Instruction: 'EXEC spB @x=?', Vars: ['b1'] },
        ]);
        expect(SQL).toContain('EXEC spA @x=@p0, @y=@p1');
        expect(SQL).toContain('EXEC spB @x=@p2');
        expect(Params).toEqual(['a1', 'a2', 'b1']);
    });

    it('leaves a self-contained instruction untouched', () => {
        const { SQL, Params } = BuildBatch([{ Instruction: "DECLARE @a NVARCHAR(10); SET @a = N'x'; EXEC spA @p=@a;" }]);
        expect(SQL).toContain("SET @a = N'x'");
        expect(Params).toEqual([]);
    });

    it('terminates an instruction that did not terminate itself', () => {
        const { SQL } = BuildBatch([{ Instruction: 'EXEC spA' }, { Instruction: 'EXEC spB;' }]);
        expect(SQL).toContain('EXEC spA;');
        expect(SQL).not.toContain('EXEC spB;;');
    });
});

describe('SplitRecordsets', () => {
    const sentinel = (i: number) => [{ [SENTINEL_COLUMN]: i }];

    it('assigns each result set to the item its sentinel opened', () => {
        const out = SplitRecordsets([sentinel(0), [{ ID: 'a' }], sentinel(1), [{ ID: 'b' }]], 2);
        expect(out[0]).toEqual([{ ID: 'a' }]);
        expect(out[1]).toEqual([{ ID: 'b' }]);
    });

    it('reports undefined for an item that returned NO result set at all', () => {
        // The live case: an UPDATE matching nothing emits no set, so the driver returns fewer
        // sets than items. Zipping positionally would hand item 1 the rows that belong to item 2.
        const out = SplitRecordsets([sentinel(0), [{ ID: 'a' }], sentinel(1), sentinel(2), [{ ID: 'c' }]], 3);
        expect(out[0]).toEqual([{ ID: 'a' }]);
        expect(out[1]).toBeUndefined();
        expect(out[2]).toEqual([{ ID: 'c' }]);
    });

    it('keeps the FIRST set when one item emits several', () => {
        const out = SplitRecordsets([sentinel(0), [{ ID: 'first' }], [{ ID: 'second' }]], 1);
        expect(out[0]).toEqual([{ ID: 'first' }]);
    });

    it('survives an empty driver response', () => {
        expect(SplitRecordsets([], 2)).toEqual([undefined, undefined]);
    });

    it('ignores a sentinel index outside the batch rather than writing out of bounds', () => {
        const out = SplitRecordsets([sentinel(99), [{ ID: 'stray' }], sentinel(0), [{ ID: 'a' }]], 1);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual([{ ID: 'a' }]);
    });
});
