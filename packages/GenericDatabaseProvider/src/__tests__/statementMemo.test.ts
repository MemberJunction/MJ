/** StatementMemo: a bounded, optionally time-limited memo of facts about SQL statements. */
import { describe, it, expect } from 'vitest';
import { StatementMemo } from '../statementMemo';

describe('StatementMemo', () => {
    it('keys a statement by dialect and text, never by either alone', () => {
        expect(StatementMemo.KeyOf('SELECT 1', 'sqlserver')).not.toBe(StatementMemo.KeyOf('SELECT 1', 'postgresql'));
        expect(StatementMemo.KeyOf('SELECT 1', 'sqlserver')).toBe(StatementMemo.KeyOf('SELECT 1', 'sqlserver'));
        expect(StatementMemo.KeyOf('ab', 'c')).not.toBe(StatementMemo.KeyOf('b', 'ca'));
        expect(StatementMemo.KeyOf('x'.repeat(100_000), 'sqlserver')).toHaveLength(64);
    });

    it('drops the entry stored longest ago when full', () => {
        const memo = new StatementMemo<number>(2);
        memo.Set('a', 1);
        memo.Set('b', 2);
        memo.Set('c', 3);
        expect([memo.Get('a'), memo.Get('b'), memo.Get('c'), memo.Size]).toEqual([undefined, 2, 3, 2]);
    });

    it('expires an entry after its lifetime', () => {
        const memo = new StatementMemo<number>(10, 1000);
        memo.Set('a', 1, 0);
        expect(memo.Get('a', 999)).toBe(1);
        expect(memo.Get('a', 1001)).toBeUndefined();
        expect(memo.Size).toBe(0);
    });

    it('computes a value once', () => {
        const memo = new StatementMemo<number>(10);
        let calls = 0;
        const compute = () => ++calls;
        expect([memo.GetOrCompute('k', compute), memo.GetOrCompute('k', compute), calls]).toEqual([1, 1, 1]);
        memo.Delete('k');
        expect(memo.GetOrCompute('k', compute)).toBe(2);
    });
});
