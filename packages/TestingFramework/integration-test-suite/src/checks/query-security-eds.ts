/**
 * query-security-eds.ts — QS8 of the 'query-security' bundle: the read-only screen every SQL
 * external-data-source driver applies to a native query before it runs it
 * (`AssertReadOnlyNativeQuery`), for each source dialect.
 *
 * The screen runs inside the driver, after a connection to the remote server is chosen, so no
 * in-process path reaches it without a remote server: the check calls the screen function itself.
 * The cases are lexer cases, read with each dialect's own rules: a write keyword inside a string,
 * a comment or a quoted identifier is allowed; a real write is refused; a statement separator
 * after a comment is refused; and text one dialect reads as a comment and another as SQL is judged
 * by the source's dialect.
 */
import { AssertReadOnlyNativeQuery } from '@memberjunction/external-data-sources';
import type { SqlDialectKey } from '@memberjunction/external-data-sources';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { FailOnFindings, SECURITY_BUNDLE } from './query-security-fixture';

const WRITE = 'External native query rejected: write/DDL statements are not permitted — External Data Sources are read-only.';
const STACKED = 'External native query rejected: multiple statements are not allowed against a read-only external data source.';
const UNPARSED = 'External native query rejected: SQL could not be parsed/validated as read-only — refusing under uncertainty (External Data Sources are read-only).';
const INTO = 'External native query rejected: SELECT ... INTO creates a table — External Data Sources are read-only.';
const EXECUTABLE_COMMENT = 'External native query rejected: a comment whose content the database runs or interprets is not allowed — refusing under uncertainty (External Data Sources are read-only).';
const BACKSLASH = 'External native query rejected: a string literal containing a backslash ends in a place that depends on server settings — refusing under uncertainty (External Data Sources are read-only).';
const NOT_A_READ = 'External native query rejected: only a single SELECT or WITH statement is allowed for this source — refusing under uncertainty (External Data Sources are read-only).';
const ORACLE_INTO = 'External native query rejected: "INTO" is not allowed in a read — refusing under uncertainty (External Data Sources are read-only).';

/** One screen case: the text, and `null` when it must be allowed or the exact refusal. */
type ScreenCase = [label: string, sql: string, refusal: string | null];

const SEPARATOR_AFTER_COMMENT = 'SELECT 1 AS a -- note\n; DROP TABLE t';

const CASES: Readonly<Record<SqlDialectKey, readonly ScreenCase[]>> = {
    sqlserver: [
        ['write keyword in a string', "SELECT 'DELETE FROM t' AS a", null],
        ['write keyword in a comment', 'SELECT 1 AS a /* DROP TABLE t */', null],
        ['write keyword as a bracketed name', 'SELECT [DELETE] FROM t', null],
        ['a real DELETE', 'DELETE FROM t', WRITE],
        ['a separator after a comment', SEPARATOR_AFTER_COMMENT, STACKED],
        ['an unseparated second statement', 'SELECT 1 AS a DELETE FROM t', UNPARSED],
        ['SELECT … INTO', 'SELECT * INTO x FROM t', INTO],
        ['a write after a CTE', 'WITH x AS (SELECT 1 AS a) DELETE FROM t', UNPARSED],
        ['EXEC', "EXEC('DELETE FROM t')", UNPARSED],
    ],
    postgresql: [
        ['write keyword in a dollar-quoted string', 'SELECT $$ DELETE FROM t; $$ AS a', null],
        ['separator in a tagged dollar-quoted string', 'SELECT $q$ ; DROP TABLE t $q$ AS a', null],
        ['write keyword as a quoted name', 'SELECT "DELETE" FROM t', null],
        ['-- with no space is still a comment', 'SELECT 1 AS a --1; DROP TABLE t', null],
        ['a real DELETE', 'DELETE FROM t', WRITE],
        ['a separator after a comment', SEPARATOR_AFTER_COMMENT, STACKED],
        ['DELETE … RETURNING in a CTE', 'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x', UNPARSED],
        ['// is not a comment here', 'SELECT 1 AS a // ; DROP TABLE t', STACKED],
    ],
    mysql: [
        ['write keyword as a backtick name', 'SELECT `delete` FROM t', null],
        ['separator and write keyword in a string with a doubled quote', "SELECT 'it''s; DELETE' AS a", null],
        ['a # comment hides the separator', 'SELECT 1 AS a # ; DROP TABLE t', null],
        ['--1 is not a comment in MySQL', 'SELECT 1 AS a --1; DROP TABLE t', STACKED],
        ['a backslash escape in a string', "SELECT 'it\\'s; DELETE' AS a", BACKSLASH],
        ['an executable comment', 'SELECT 1 AS a /*! ; DROP TABLE t */', EXECUTABLE_COMMENT],
        ['a real DELETE', 'DELETE FROM t', WRITE],
        ['a separator after a comment', SEPARATOR_AFTER_COMMENT, STACKED],
        ['INTO OUTFILE', "SELECT * FROM t INTO OUTFILE '/tmp/x'", INTO],
    ],
    oracle: [
        ['write keyword and separator in a q-quoted string', "SELECT q'[ ; DELETE FROM t ]' AS a FROM dual", null],
        ['a quote inside a q-quoted string', "SELECT q'{it's}' AS a FROM dual", null],
        ['write keyword as a quoted name', 'SELECT "DELETE" FROM t', null],
        ['write keyword in a comment', 'SELECT 1 AS a FROM dual /* DELETE */', null],
        ['a real DELETE (no grammar: fails closed)', 'DELETE FROM t', NOT_A_READ],
        ['SELECT … INTO (no grammar: fails closed)', 'SELECT a INTO b FROM t', ORACLE_INTO],
        ['a separator after a comment', 'SELECT 1 AS a FROM dual -- note\n; DROP TABLE t', STACKED],
        ['a PL/SQL block', 'BEGIN DELETE FROM t; END;', STACKED],
    ],
    snowflake: [
        ['separator and write keyword in a $$ string', 'SELECT $$ ; DELETE FROM t $$ AS a', null],
        ['a // comment hides the separator', 'SELECT 1 AS a // ; DROP TABLE t', null],
        ['write keyword as a quoted name', 'SELECT "DELETE" FROM t', null],
        ['a real DELETE', 'DELETE FROM t', UNPARSED],
        ['a separator after a comment', SEPARATOR_AFTER_COMMENT, STACKED],
    ],
    databricks: [
        ['write keyword as a backtick name', 'SELECT `DELETE` FROM t', null],
        ['separator and write keyword in a string', "SELECT 'x; DELETE FROM t' AS a", null],
        ['separator in a block comment', 'SELECT 1 AS a /* ; DROP TABLE t */', null],
        ['a three-part name', 'SELECT * FROM cat.sch.tbl', null],
        ['a real DELETE', 'DELETE FROM t', WRITE],
        ['a separator after a comment', SEPARATOR_AFTER_COMMENT, STACKED],
    ],
    ansi: [
        ['the ansi key screens as PostgreSQL', 'SELECT $$ ; DELETE FROM t $$ AS a', null],
        ['a real DELETE', 'DELETE FROM t', WRITE],
    ],
};

/** The screen's verdict: `null` when allowed, otherwise its message. */
function screen(sql: string, dialect: SqlDialectKey): string | null {
    try {
        AssertReadOnlyNativeQuery(sql, dialect);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

async function checkQs8EdsScreen(_ctx: IntegrationCheckContext): Promise<void> {
    const findings: string[] = [];
    let exercised = 0;
    for (const [dialect, cases] of Object.entries(CASES) as Array<[SqlDialectKey, readonly ScreenCase[]]>) {
        for (const [label, sql, expected] of cases) {
            exercised++;
            const verdict = screen(sql, dialect);
            if (verdict !== expected) findings.push(`${dialect} ${label}: ${verdict === null ? 'allowed' : `refused with '${verdict}'`}, expected ${expected === null ? 'it allowed' : `'${expected}'`}`);
        }
    }
    FailOnFindings('QS8', findings, exercised);
}

export const EdsScreenChecks: NamedCheck[] = [
    { Id: `${SECURITY_BUNDLE}.QS8`, Name: 'QS8: the external-data-source read-only screen reads each dialect\'s strings, comments and quoted names; real writes and hidden separators are refused', Fn: checkQs8EdsScreen },
];
