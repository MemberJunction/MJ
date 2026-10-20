/**
 * When a direct parse fails, the parser renames the bracket identifiers node-sql-parser cannot
 * read and parses again; `IdentifierAliases` maps each new name back to its bracket text. Code
 * that reads the tree through that map must only ever map a name the renaming put there. These
 * tests pin that a new name never equals a name the SQL wrote itself, and never runs into the
 * text next to it. Inputs are harmless.
 */
import { describe, it, expect } from 'vitest';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../sql-parser.js';

const ss = new SQLServerDialect();

/** The parts of a parsed SELECT these tests read. */
interface FromItemNode {
    table?: string | null;
    as?: string | null;
}
interface SelectNode {
    with?: Array<{ name?: { value?: string } }> | null;
    from?: FromItemNode[] | null;
}

function rootSelect(parser: SQLParser): SelectNode {
    const ast = parser.AST;
    return (Array.isArray(ast) ? ast[0] : ast) as unknown as SelectNode;
}

/** A name from the tree, read back through the parser's map of renamed identifiers. */
function readBack(parser: SQLParser, name: string | null | undefined): string | null {
    if (name == null) return null;
    return parser.IdentifierAliases?.get(name) ?? name;
}

/** Its bracket-named CTE makes the direct parse fail, so the parser renames brackets. */
const DECLARES_RESERVED_FORM = `WITH [a b] AS (SELECT 1 AS x), _mjid_1 AS (SELECT 1 AS y) SELECT * FROM [Order Lines]`;

describe('SQLParser fallback renaming — a renamed name is never one the SQL wrote', () => {
    it('gives renamed identifiers names that occur nowhere in the SQL, in any case or quoting', () => {
        const statements = [
            DECLARES_RESERVED_FORM,
            `WITH [a b] AS (SELECT 1 AS x), "_mjid_1" AS (SELECT 1 AS y) SELECT * FROM [Order Lines]`,
            `WITH [a b] AS (SELECT 1 AS x), _MJID_1 AS (SELECT 1 AS y), _mjid1_0 AS (SELECT 2 AS z) SELECT * FROM [Order Lines]`,
        ];
        for (const sql of statements) {
            const parser = new SQLParser(sql, ss);
            expect(parser.IsValid).toBe(true);
            const renamed = [...(parser.IdentifierAliases ?? new Map<string, string>()).keys()];
            expect(renamed.length).toBeGreaterThan(0);
            for (const name of renamed) {
                expect(sql.toLowerCase()).not.toContain(name.toLowerCase());
            }
        }
    });

    it('reads each CTE name and the FROM item back as the SQL wrote them', () => {
        const parser = new SQLParser(DECLARES_RESERVED_FORM, ss);
        const root = rootSelect(parser);

        expect(root.with?.map((cte) => readBack(parser, cte.name?.value))).toEqual(['[a b]', '_mjid_1']);
        expect(readBack(parser, root.from?.[0]?.table)).toBe('[Order Lines]');
    });

    it('restores the names the SQL wrote on ToSQL', () => {
        const out = new SQLParser(DECLARES_RESERVED_FORM, ss).ToSQL();

        expect(out).toMatch(/\[?_mjid_1\]? AS \(SELECT 1 AS \[y\]\)/);
        expect(out).toMatch(/FROM \[Order Lines\]$/);
    });
});

describe('SQLParser fallback renaming — a renamed name stays its own token', () => {
    it('keeps a renamed identifier apart from a name or bracket written next to it', () => {
        const cases: Array<[string, string, string]> = [
            [`WITH [c] AS (SELECT 1 AS v) SELECT v FROM [c]x`, '[c]', 'x'],
            [`WITH [c] AS (SELECT 1 AS v) SELECT v FROM [c][d]`, '[c]', '[d]'],
            [`WITH [c] AS (SELECT 1 AS v) SELECT v FROM t[c]`, 't', '[c]'],
        ];
        for (const [sql, table, alias] of cases) {
            const parser = new SQLParser(sql, ss);
            expect(parser.IsValid).toBe(true);
            const item = rootSelect(parser).from?.[0];
            expect(readBack(parser, item?.table)).toBe(table);
            expect(readBack(parser, item?.as)).toBe(alias);
        }
    });

    it('does not read a renamed identifier and the digits after it as another renamed identifier', () => {
        // Eleven bracket names, so a merged name would be the eleventh one's.
        const columns = Array.from({ length: 10 }, (_, i) => `[k${i + 1}]`).join(', ');
        const parser = new SQLParser(`WITH [k] AS (SELECT 1 AS v) SELECT ${columns} FROM [k1]0`, ss);

        const fromTables = parser.IsValid ? (rootSelect(parser).from ?? []).map((item) => readBack(parser, item.table)) : [];
        expect(fromTables).not.toContain('[k10]');
    });
});

describe('SQLParser fallback renaming — the prefix is the first one the SQL does not contain', () => {
    /** The rule: the first of `_mjid_`, `_mjid1_`, `_mjid2_`, … that the SQL does not contain, ignoring case. */
    function expectedPrefix(sql: string): string {
        const text = sql.toLowerCase();
        let prefix = '_mjid_';
        for (let k = 1; text.includes(prefix); k++) prefix = `_mjid${k}_`;
        return prefix;
    }

    /** A statement that takes the fallback, with `text` in a string literal, and the prefix the parser took. */
    function prefixTaken(text: string): { sql: string; prefix: string } {
        const sql = `WITH [c] AS (SELECT 1 AS v) SELECT v FROM [c] WHERE v <> '${text}'`;
        const parser = new SQLParser(sql, ss);
        const [name] = [...(parser.IdentifierAliases ?? new Map<string, string>()).keys()];
        return { sql, prefix: (name ?? '').replace(/\d+$/, '') };
    }

    it('skips each prefix the SQL contains, in any case, also when two prefixes share an underscore', () => {
        expect(prefixTaken('_mjid_ _MJID1_ x_mjid_mjid2_').prefix).toBe('_mjid3_');
    });

    it('takes the first free prefix, so a gap or a leading zero does not move it further', () => {
        expect(prefixTaken('_mjid_ _mjid2_').prefix).toBe('_mjid1_');
        expect(prefixTaken('_mjid_ _mjid01_ _mjid12_').prefix).toBe('_mjid1_');
    });

    it('follows the rule on generated text', () => {
        const chunks = ['_mjid', '_MJID', '_Mjid', '_', '0', '1', '2', '3', 'x', ' '];
        let seed = 7;
        const next = (): number => {
            seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
            return seed >>> 16;
        };
        for (let n = 0; n < 1500; n++) {
            const length = next() % 14;
            const text = Array.from({ length }, () => chunks[next() % chunks.length]).join('');
            const { sql, prefix } = prefixTaken(text);
            expect(prefix, text).toBe(expectedPrefix(sql));
        }
    });
});

describe('SQLParser.IsIdentifierAliasName', () => {
    it('matches every name the fallback renaming can give, ignoring case', () => {
        for (const name of ['_mjid_0', '_mjid_12', '_MJID_3', '_mjid1_0', '_Mjid27_4']) {
            expect(SQLParser.IsIdentifierAliasName(name)).toBe(true);
        }
    });

    it('does not match other names', () => {
        for (const name of ['', '_mjid_', '_mjid_a', 'mjid_1', 'x_mjid_1', '_mjid_1x', '[_mjid_1]', 'Order Lines']) {
            expect(SQLParser.IsIdentifierAliasName(name)).toBe(false);
        }
    });
});
