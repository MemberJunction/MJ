/**
 * The PostgreSQL identifier-quoting rule, after replacing the keyword denylist with a
 * case-plus-call-syntax discriminator (issue #3604, item 4).
 *
 * The old rule quoted a PascalCase word UNLESS it appeared in a 288-entry `_SQL_KEYWORDS`
 * set. Because SQL keywords and MJ column names overlap, every name in the intersection was
 * emitted unquoted, folded to lower case, and failed on PostgreSQL. The intersection is
 * exactly eight names and was not guessable by inspection — see the header on `processWord`.
 *
 * The replacement keys on properties intrinsic to the two things rather than on a list:
 * generated SQL writes keywords, types and functions in ALL CAPS, while MJ identifiers are
 * mixed case. A list can fall out of date; casing cannot.
 *
 * These tests drive the REAL `quoteSQLForExecution`, so they assert what actually reaches
 * PostgreSQL.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({ configInfo: {}, currentWorkingDirectory: '/tmp' }));

import { PostgreSQLCodeGenProvider } from '../Database/providers/postgresql/PostgreSQLCodeGenProvider';

/** The eight names that are BOTH MJ columns and SQL keywords — the whole defect class. */
const COLLIDING_COLUMNS = ['Action', 'Columns', 'Language', 'Length', 'Month', 'Rank', 'Text', 'Values'];

const provider = new PostgreSQLCodeGenProvider();
const quote = (sql: string): string => provider.quoteSQLForExecution(sql);

describe('the defect class is closed — colliding columns now quote', () => {
    it.each(COLLIDING_COLUMNS)('%s is quoted in a SELECT list', (column) => {
        const out = quote(`SELECT ID, ${column}, Sequence FROM __mj.EntityField`);
        expect(out).toContain(`"${column}"`);
    });

    it.each(COLLIDING_COLUMNS)('%s is quoted in a SET clause', (column) => {
        const out = quote(`UPDATE __mj.EntityField SET ${column}=5 WHERE ID='x'`);
        expect(out).toContain(`"${column}"`);
    });

    it.each(COLLIDING_COLUMNS)('%s is quoted in a WHERE predicate', (column) => {
        expect(quote(`SELECT ID FROM t WHERE ${column} = 1`)).toContain(`"${column}"`);
    });

    it('Length — the exact statement that broke IS-A on PostgreSQL', () => {
        const out = quote(
            `SELECT ID, IsVirtual, Type, Length, Precision, Scale, AllowsNull, AllowUpdateAPI
             FROM __mj.EntityField WHERE EntityID = @EntityID AND Name = @FieldName`,
        );
        for (const c of ['ID', 'IsVirtual', 'Type', 'Length', 'Precision', 'Scale', 'AllowsNull', 'AllowUpdateAPI']) {
            expect(out).toContain(`"${c}"`);
        }
    });

    it('Values — the field-level-encrypted column on __mj.Credential', () => {
        expect(quote(`SELECT ID, Values FROM __mj.Credential`)).toContain('"Values"');
    });
});

describe('keywords, types and functions are still untouched', () => {
    it.each(['SELECT', 'FROM', 'WHERE', 'UPDATE', 'SET', 'INSERT', 'INTO', 'ORDER', 'GROUP', 'JOIN', 'AND', 'OR', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'])(
        '%s is not quoted',
        (kw) => {
            expect(quote(`${kw} `)).not.toContain(`"${kw}"`);
        },
    );

    it('INSERT ... VALUES (...) keeps VALUES unquoted', () => {
        const out = quote(`INSERT INTO __mj.EntityField (ID, Name) VALUES ('a', 'b')`);
        expect(out).toContain('VALUES');
        expect(out).not.toContain('"VALUES"');
        // ...while the column list is quoted.
        expect(out).toContain('"ID"');
        expect(out).toContain('"Name"');
    });

    it('LENGTH(...) stays a function while Length stays a column, in ONE statement', () => {
        // The crux: the same word, two meanings, distinguished without a list.
        const out = quote(`SELECT Length, LENGTH(Name) AS n FROM __mj.EntityField`);
        expect(out).toContain('"Length"');
        expect(out).toContain('LENGTH(');
        expect(out).not.toContain('"LENGTH"');
    });

    it.each(['COUNT', 'MAX', 'MIN', 'SUM', 'COALESCE', 'CAST'])('%s(...) is not quoted', (fn) => {
        expect(quote(`SELECT ${fn}(ID) FROM t`)).not.toContain(`"${fn}"`);
    });

    it('a mixed-case function call is not quoted either — call syntax wins over casing', () => {
        expect(quote(`SELECT Coalesce(A, B) FROM t`)).not.toContain('"Coalesce"');
    });

    it('type names in a cast are not quoted', () => {
        expect(quote(`SELECT CAST(ID AS TEXT) FROM t`)).not.toContain('"TEXT"');
    });
});

describe('behaviour preserved from the previous rule', () => {
    it('all-lowercase identifiers are left alone', () => {
        expect(quote(`SELECT id, name FROM users`)).not.toContain('"id"');
    });

    it('__mj_ internals are left alone', () => {
        expect(quote(`SELECT __mj_CreatedAt FROM t`)).toContain('__mj_CreatedAt');
        expect(quote(`SELECT __mj_CreatedAt FROM t`)).not.toContain('"__mj_CreatedAt"');
    });

    it('string literals are never rewritten', () => {
        expect(quote(`SELECT ID FROM t WHERE Name = 'Length'`)).toContain(`'Length'`);
    });

    it('already-quoted identifiers are not double-quoted', () => {
        const out = quote(`SELECT "Length" FROM t`);
        expect(out).toContain('"Length"');
        expect(out).not.toContain('""Length""');
    });

    it('@parameters are left alone', () => {
        expect(quote(`WHERE EntityID = @EntityID`)).toContain('@EntityID');
    });
});

describe('the rule no longer depends on the denylist', () => {
    it('quotes a column that IS in the keyword set, which is the whole point', () => {
        // Under the old rule this returned `Length` unquoted. That was the bug.
        expect(quote(`SELECT Length FROM t`)).toContain('"Length"');
    });

    it('would keep working for a column name added to MJ tomorrow', () => {
        // The old rule's exposure grew silently with the schema; the new one cannot.
        for (const hypothetical of ['Position', 'Comment', 'Order', 'Key', 'Level', 'Source']) {
            expect(quote(`SELECT ${hypothetical} FROM t`)).toContain(`"${hypothetical}"`);
        }
    });
});
