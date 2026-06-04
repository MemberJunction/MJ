import { describe, it, expect } from 'vitest';
import { parsePredicate, evaluatePredicate } from '../predicate';

function match(el: unknown, src: string): boolean {
    return evaluatePredicate(parsePredicate(src), el as never);
}

describe('predicate', () => {
    const row = { Status: 'Open', Balance: 150, Name: 'Acme Corp', Tags: ['a', 'b'], DueDate: '2020-01-01' };

    it('numeric comparisons (numeric-aware)', () => {
        expect(match(row, 'Balance > 100')).toBe(true);
        expect(match(row, 'Balance <= 150')).toBe(true);
        expect(match(row, 'Balance < 100')).toBe(false);
    });
    it('string equality, quoted and unquoted', () => {
        expect(match(row, "Status == 'Open'")).toBe(true);
        expect(match(row, 'Status == Open')).toBe(true); // lenient unquoted
        expect(match(row, "Status != 'Closed'")).toBe(true);
    });
    it('and / or / not with precedence', () => {
        expect(match(row, "Balance > 100 and Status == 'Open'")).toBe(true);
        expect(match(row, "Balance > 1000 or Status == 'Open'")).toBe(true);
        expect(match(row, "not Status == 'Closed'")).toBe(true);
        expect(match(row, "(Balance < 0 or Status == 'Open') and Balance > 100")).toBe(true);
    });
    it('contains on strings and arrays', () => {
        expect(match(row, "Name contains 'Acme'")).toBe(true);
        expect(match(row, "Tags contains 'a'")).toBe(true);
        expect(match(row, "Tags contains 'z'")).toBe(false);
    });
    it('startsWith / endsWith / matches', () => {
        expect(match(row, "Name startsWith 'Acme'")).toBe(true);
        expect(match(row, "Name endsWith 'Corp'")).toBe(true);
        expect(match(row, "Name matches '^Acme.*Corp$'")).toBe(true);
    });
    it('in [list]', () => {
        expect(match(row, "Status in ['Open','Pending']")).toBe(true);
        expect(match(row, 'Balance in [100, 150, 200]')).toBe(true);
        expect(match(row, "Status in ['Closed']")).toBe(false);
    });
    it('date vs today (ISO lexicographic)', () => {
        expect(match(row, 'DueDate < today')).toBe(true);
    });
    it('throws on malformed predicate', () => {
        expect(() => parsePredicate('Balance >')).toThrow();
        expect(() => parsePredicate('Balance 5')).toThrow(/operator/);
    });

    describe('matches ReDoS guard', () => {
        it('rejects catastrophic-backtracking patterns (nested quantifiers)', () => {
            // `(a+)+$` is the classic exponential pattern — must be refused, not compiled.
            expect(() => match(row, "Name matches '(a+)+$'")).toThrow(/unsafe|catastrophic/i);
            expect(() => match(row, "Name matches '(a*)*'")).toThrow(/unsafe|catastrophic/i);
        });
        it('rejects over-long patterns', () => {
            const huge = 'a'.repeat(201);
            expect(() => match(row, `Name matches '${huge}'`)).toThrow(/too long/i);
        });
        it('still allows safe patterns', () => {
            expect(match(row, "Name matches '^Acme'")).toBe(true);
            expect(match(row, "Name matches 'Corp$'")).toBe(true);
            expect(match(row, "Name matches 'X{2,4}'")).toBe(false);
        });
    });
});
