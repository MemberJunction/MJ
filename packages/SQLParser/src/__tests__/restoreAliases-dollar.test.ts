/**
 * Alias restoration — `$` in the restored identifier (issue #3171).
 *
 * `restoreAliases` swaps generated aliases back to the original bracketed
 * identifiers. Two of its three branches use `split`/`join`, which is `$`-safe;
 * the third used `.replace(regex, string)`, so `$$`, `$&`, `` $` `` and `$'` in
 * the ORIGINAL identifier were expanded instead of inserted.
 *
 * The aliasing path fires precisely when an identifier contains a non-word
 * character — and `$` is one — so the very input that triggers aliasing is the
 * input that then corrupts the restore. Reached from the public `ToSQL()`.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '../sql-parser';

const restore = (sql: string, alias: string, original: string): string =>
    (SQLParser as unknown as {
        restoreAliases(s: string, m: Map<string, string>): string;
    }).restoreAliases(sql, new Map([[alias, original]]));

describe('SQLParser.restoreAliases — $ in the original identifier (#3171)', () => {
    for (const original of ['[Cost$$Total]', '[a$&b]', '[a$`b]', "[a$'b]", '[a$1b]', '[a$b]']) {
        it(`restores ${original} verbatim`, () => {
            expect(restore('SELECT alias1 FROM T', 'alias1', original))
                .toBe(`SELECT ${original} FROM T`);
        });
    }

    it('restores every occurrence, not just the first', () => {
        expect(restore('SELECT alias1 FROM T WHERE alias1 > 0', 'alias1', '[a$&b]'))
            .toBe('SELECT [a$&b] FROM T WHERE [a$&b] > 0');
    });

    it('still restores a plain identifier', () => {
        expect(restore('SELECT alias1 FROM T', 'alias1', '[Total]')).toBe('SELECT [Total] FROM T');
    });
});
