/**
 * query-security-probes.ts — the SQL the `query-security` bundle tries to run, per platform: the
 * statements that write (each aimed at the canary table), the calls to functions a query may not
 * make, and reads that look like either but are not, which must run.
 *
 * Probe text is written in T-SQL bracket style and converted for PostgreSQL by `ForPlatform`
 * unless a probe is platform-specific.
 */
import type { DatabasePlatform } from '@memberjunction/core';
import { ForPlatform } from './query-extraction-fixture';

/** One statement the gate must refuse. */
export interface RefusedProbe {
    Label: string;
    SQL: string;
    /** Why the read-only check refuses it, as the check words it; for a forbidden call, the function names. */
    Reason: string;
    /** The ad hoc path's own refusal when its expression validator refuses first; otherwise the path wraps {@link Reason}. */
    Adhoc?: string;
}

const C = 'mjit_security.[Canary]';

/** The ad hoc path's expression validator, which refuses a statement keyword before the read-only check runs. */
function danger(keyword: string): string {
    return `Dangerous SQL keyword detected: ${keyword}`;
}

/** The ad hoc path's refusal of SQL whose first word is not SELECT or WITH. */
const ADHOC_NOT_SELECT = 'Ad-hoc query must start with SELECT or WITH';


function common(platform: DatabasePlatform): RefusedProbe[] {
    return [
        { Label: 'INSERT', SQL: `INSERT INTO ${C} ([ID], [Note]) VALUES (9, 'x')`, Reason: 'it starts with INSERT, not SELECT or WITH', Adhoc: danger('INSERT') },
        { Label: 'UPDATE', SQL: `UPDATE ${C} SET [Note] = 'x'`, Reason: 'it starts with UPDATE, not SELECT or WITH', Adhoc: danger('UPDATE') },
        { Label: 'DELETE', SQL: `DELETE FROM ${C}`, Reason: 'it starts with DELETE, not SELECT or WITH', Adhoc: danger('DELETE') },
        { Label: 'SELECT INTO', SQL: `SELECT * INTO mjit_security.[Stolen] FROM ${C}`, Reason: 'it writes its result into a table (SELECT … INTO)' },
        { Label: 'stacked DROP', SQL: `SELECT 1 AS [A]; DROP TABLE ${C}`, Reason: 'it contains more than one statement', Adhoc: danger('DROP') },
        { Label: 'stacked after a comment', SQL: `SELECT 1 AS [A] /* ; */ ; DELETE FROM ${C} -- ;`, Reason: 'it contains more than one statement', Adhoc: danger('DELETE') },
        { Label: 'DROP TABLE', SQL: `DROP TABLE ${C}`, Reason: 'it starts with DROP, not SELECT or WITH', Adhoc: danger('DROP') },
        { Label: 'CREATE TABLE', SQL: `CREATE TABLE mjit_security.[Made] ([X] INT)`, Reason: 'it starts with CREATE, not SELECT or WITH', Adhoc: danger('CREATE') },
        { Label: 'ALTER TABLE', SQL: `ALTER TABLE ${C} ADD [Extra] INT`, Reason: 'it starts with ALTER, not SELECT or WITH', Adhoc: danger('ALTER') },
        { Label: 'TRUNCATE', SQL: `TRUNCATE TABLE ${C}`, Reason: 'it starts with TRUNCATE, not SELECT or WITH', Adhoc: danger('TRUNCATE') },
    ].map(p => ({ ...p, SQL: ForPlatform(p.SQL, platform) }));
}

const SQLSERVER_WRITES: RefusedProbe[] = [
    { Label: 'MERGE', SQL: `MERGE ${C} AS t USING (SELECT 1 AS [ID]) AS s ON t.[ID] = s.[ID] WHEN MATCHED THEN DELETE;`, Reason: 'it starts with MERGE, not SELECT or WITH', Adhoc: danger('DELETE') },
    { Label: 'write after a CTE', SQL: `WITH x AS (SELECT 1 AS [ID]) DELETE FROM ${C} WHERE [ID] IN (SELECT [ID] FROM x)`, Reason: 'the statement after its WITH clause starts with DELETE, not SELECT', Adhoc: danger('DELETE') },
    { Label: 'EXEC', SQL: `EXEC('DELETE FROM mjit_security.Canary')`, Reason: 'it starts with EXEC, not SELECT or WITH', Adhoc: danger('EXEC') },
    { Label: 'EXECUTE sp_executesql', SQL: `EXECUTE sp_executesql N'DELETE FROM mjit_security.Canary'`, Reason: 'it starts with EXECUTE, not SELECT or WITH', Adhoc: danger('EXECUTE') },
    { Label: 'SET prefix', SQL: `SET NOCOUNT ON SELECT [ID] FROM ${C}`, Reason: 'it starts with SET, not SELECT or WITH', Adhoc: ADHOC_NOT_SELECT },
    { Label: 'DECLARE prefix', SQL: `DECLARE @n INT = 1; SELECT @n AS [A]`, Reason: 'it contains more than one statement', Adhoc: 'Semicolons are not allowed in SQL expressions' },
    { Label: 'DECLARE prefix, no separator', SQL: `DECLARE @n INT = 1 SELECT @n AS [A]`, Reason: 'it starts with DECLARE, not SELECT or WITH', Adhoc: ADHOC_NOT_SELECT },
    // T-SQL needs no separator between statements: a write written straight after a read is a second statement.
    { Label: 'unseparated DELETE after a SELECT', SQL: `SELECT 1 AS [A] DELETE FROM ${C}`, Reason: 'it contains more than one statement', Adhoc: danger('DELETE') },
    { Label: 'unseparated UPDATE after a SELECT', SQL: `SELECT [ID] FROM ${C} UPDATE ${C} SET [Note] = 'x'`, Reason: 'it contains more than one statement', Adhoc: danger('UPDATE') },
    { Label: 'unseparated DROP after a CTE query', SQL: `WITH x AS (SELECT 1 AS [ID]) SELECT [ID] FROM x DROP TABLE ${C}`, Reason: 'it contains more than one statement', Adhoc: danger('DROP') },
    { Label: 'unseparated EXEC after a SELECT', SQL: `SELECT 1 AS [A] EXEC('DELETE FROM mjit_security.Canary')`, Reason: 'it contains more than one statement', Adhoc: danger('EXEC') },
    { Label: 'unseparated INSERT after a SELECT', SQL: `SELECT 1 AS [A] INSERT ${C} ([ID], [Note]) VALUES (9, 'x')`, Reason: 'it contains more than one statement', Adhoc: danger('INSERT') },
];

const POSTGRES_C = '"mjit_security"."Canary"';

const POSTGRES_WRITES: RefusedProbe[] = [
    { Label: 'MERGE', SQL: `MERGE INTO ${POSTGRES_C} t USING (SELECT 1 AS "ID") s ON t."ID" = s."ID" WHEN MATCHED THEN DELETE`, Reason: 'it starts with MERGE, not SELECT or WITH', Adhoc: danger('DELETE') },
    { Label: 'DELETE … RETURNING in a CTE', SQL: `WITH x AS (DELETE FROM ${POSTGRES_C} RETURNING "ID") SELECT * FROM x`, Reason: 'its CTE x is a DELETE statement, not a read', Adhoc: danger('DELETE') },
    { Label: 'UPDATE … RETURNING in a nested CTE', SQL: `WITH a AS (SELECT 1 AS "ID"), b AS (UPDATE ${POSTGRES_C} SET "Note" = 'x' RETURNING "ID") SELECT * FROM a`, Reason: 'its CTE b is a UPDATE statement, not a read', Adhoc: danger('UPDATE') },
    { Label: 'DO block', SQL: `DO $$ BEGIN DELETE FROM ${POSTGRES_C}; END $$`, Reason: 'it starts with DO, not SELECT or WITH', Adhoc: ADHOC_NOT_SELECT },
    { Label: 'COPY', SQL: `COPY ${POSTGRES_C} FROM PROGRAM 'true'`, Reason: 'it starts with COPY, not SELECT or WITH', Adhoc: ADHOC_NOT_SELECT },
    { Label: 'SET prefix', SQL: `SET search_path TO mjit_security`, Reason: 'it starts with SET, not SELECT or WITH', Adhoc: ADHOC_NOT_SELECT },
    { Label: 'SET LOCAL then a read', SQL: `SET LOCAL statement_timeout = 0; SELECT 1 AS "A"`, Reason: 'it contains more than one statement', Adhoc: 'Semicolons are not allowed in SQL expressions' },
    { Label: 'PREPARE / EXECUTE', SQL: `PREPARE p AS DELETE FROM ${POSTGRES_C}; EXECUTE p`, Reason: 'it contains more than one statement', Adhoc: danger('DELETE') },
];

/** Every write probe for `platform`. */
export function WriteProbes(platform: DatabasePlatform): RefusedProbe[] {
    return [...common(platform), ...(platform === 'postgresql' ? POSTGRES_WRITES : SQLSERVER_WRITES)];
}

/** One call to a forbidden function, and the name the refusal gives it. */
interface ForbiddenCall {
    Label: string;
    SQL: string;
    Name: string;
    /** The ad hoc path's own refusal, when its expression validator refuses first. */
    Adhoc?: string;
}

/** The ad hoc path's refusal of a `sys.` object. */
const SYSTEM_CATALOG = 'Access to database system catalogs / metadata objects is not allowed';

const SQLSERVER_FORBIDDEN: ForbiddenCall[] = [
    { Label: 'OPENROWSET', SQL: `SELECT * FROM OPENROWSET(BULK 'C:\\nothing.txt', SINGLE_CLOB) AS r`, Name: 'openrowset', Adhoc: danger('BULK') },
    { Label: 'OPENQUERY', SQL: `SELECT * FROM OPENQUERY(NoSuchServer, 'SELECT 1')`, Name: 'openquery', Adhoc: danger('OPENQUERY') },
    { Label: 'OPENDATASOURCE', SQL: `SELECT * FROM OPENDATASOURCE('MSOLEDBSQL', 'Data Source=nowhere').db.dbo.t`, Name: 'opendatasource', Adhoc: danger('OPENDATASOURCE') },
    { Label: 'OPENXML', SQL: `SELECT * FROM OPENXML(1, '/r') WITH ([A] INT)`, Name: 'openxml' },
    { Label: 'fn_get_audit_file', SQL: `SELECT * FROM sys.fn_get_audit_file('C:\\nothing\\*', DEFAULT, DEFAULT)`, Name: 'fn_get_audit_file', Adhoc: SYSTEM_CATALOG },
    { Label: 'fn_xe_file_target_read_file', SQL: `SELECT * FROM sys.fn_xe_file_target_read_file('C:\\nothing*.xel', NULL, NULL, NULL)`, Name: 'fn_xe_file_target_read_file', Adhoc: SYSTEM_CATALOG },
    { Label: 'fn_trace_gettable', SQL: `SELECT * FROM fn_trace_gettable('C:\\nothing.trc', DEFAULT)`, Name: 'fn_trace_gettable' },
    { Label: 'mixed case', SQL: `SELECT * FROM OpenRowSet(BULK 'C:\\nothing.txt', SINGLE_CLOB) AS r`, Name: 'openrowset', Adhoc: danger('BULK') },
    { Label: 'comment before the parenthesis', SQL: `SELECT * FROM OPENROWSET /*x*/ (BULK 'C:\\nothing.txt', SINGLE_CLOB) AS r`, Name: 'openrowset', Adhoc: danger('BULK') },
    { Label: 'line break before the parenthesis', SQL: `SELECT * FROM OPENROWSET\n(BULK 'C:\\nothing.txt', SINGLE_CLOB) AS r`, Name: 'openrowset', Adhoc: danger('BULK') },
    { Label: 'bracketed name', SQL: `SELECT * FROM [OPENROWSET](BULK 'C:\\nothing.txt', SINGLE_CLOB) AS r`, Name: 'openrowset', Adhoc: danger('BULK') },
    { Label: 'double-quoted name', SQL: `SELECT * FROM "OpenQuery"(NoSuchServer, 'SELECT 1')`, Name: 'openquery' },
    { Label: 'inside a CTE', SQL: `WITH f AS (SELECT * FROM OPENQUERY(NoSuchServer, 'SELECT 1')) SELECT * FROM f`, Name: 'openquery', Adhoc: danger('OPENQUERY') },
];

const POSTGRES_FORBIDDEN: ForbiddenCall[] = [
    ['query_to_xml', `SELECT query_to_xml('SELECT 1', true, true, '') AS "X"`],
    ['query_to_xml_and_xmlschema', `SELECT query_to_xml_and_xmlschema('SELECT 1', true, true, '') AS "X"`],
    ['table_to_xml', `SELECT table_to_xml('mjit_security."Canary"', true, true, '') AS "X"`],
    ['schema_to_xml', `SELECT schema_to_xml('mjit_security', true, true, '') AS "X"`],
    ['database_to_xml', `SELECT database_to_xml(true, true, '') AS "X"`],
    ['cursor_to_xml', `SELECT cursor_to_xml('c', 1, true, true, '') AS "X"`],
    ['ts_stat', `SELECT * FROM ts_stat('SELECT to_tsvector(''a'')')`],
    ['ts_rewrite', `SELECT ts_rewrite('a'::tsquery, 'SELECT ''a''::tsquery, ''b''::tsquery') AS "X"`],
    ['dblink', `SELECT * FROM dblink('dbname=x', 'SELECT 1') AS t("A" INT)`],
    ['dblink_exec', `SELECT dblink_exec('dbname=x', 'DELETE FROM t') AS "X"`],
    ['pg_read_file', `SELECT pg_read_file('/etc/passwd') AS "X"`],
    ['pg_read_binary_file', `SELECT pg_read_binary_file('/etc/passwd') AS "X"`],
    ['pg_ls_dir', `SELECT * FROM pg_ls_dir('.')`],
    ['pg_ls_logdir', `SELECT * FROM pg_ls_logdir()`],
    ['pg_stat_file', `SELECT * FROM pg_stat_file('postgresql.conf')`],
    ['pg_file_write', `SELECT pg_file_write('x', 'y', false) AS "X"`],
    ['lo_import', `SELECT lo_import('/etc/passwd') AS "X"`],
    ['lo_export', `SELECT lo_export(1, '/tmp/x') AS "X"`],
    ['pg_terminate_backend', `SELECT pg_terminate_backend(1) AS "X"`],
    ['pg_cancel_backend', `SELECT pg_cancel_backend(1) AS "X"`],
    ['pg_reload_conf', `SELECT pg_reload_conf() AS "X"`],
    ['pg_rotate_logfile', `SELECT pg_rotate_logfile() AS "X"`],
    ['pg_promote', `SELECT pg_promote() AS "X"`],
    ['pg_switch_wal', `SELECT pg_switch_wal() AS "X"`],
    ['pg_create_restore_point', `SELECT pg_create_restore_point('x') AS "X"`],
    ['pg_log_backend_memory_contexts', `SELECT pg_log_backend_memory_contexts(1) AS "X"`],
    ['pg_sleep', `SELECT pg_sleep(5) AS "X"`],
    ['pg_sleep_for', `SELECT pg_sleep_for('5 seconds') AS "X"`],
].map(([name, sql]) => ({ Label: name, SQL: sql, Name: name }));

const POSTGRES_FORBIDDEN_OBFUSCATED: ForbiddenCall[] = [
    { Label: 'upper case', SQL: `SELECT PG_READ_FILE('/etc/passwd') AS "X"`, Name: 'pg_read_file' },
    { Label: 'comment before the parenthesis', SQL: `SELECT pg_read_file /*x*/ ('/etc/passwd') AS "X"`, Name: 'pg_read_file' },
    { Label: 'double-quoted name', SQL: `SELECT "pg_read_file"('/etc/passwd') AS "X"`, Name: 'pg_read_file' },
    { Label: 'schema-qualified', SQL: `SELECT pg_catalog.pg_read_file('/etc/passwd') AS "X"`, Name: 'pg_read_file', Adhoc: SYSTEM_CATALOG },
    { Label: 'schema-qualified, quoted', SQL: `SELECT pg_catalog."pg_sleep"(5) AS "X"`, Name: 'pg_sleep', Adhoc: SYSTEM_CATALOG },
    { Label: 'inside a CTE', SQL: `WITH f AS (SELECT pg_ls_dir('.') AS "D") SELECT * FROM f`, Name: 'pg_ls_dir' },
];

/** The forbidden-call message's tail, after the function names. */
const FORBIDDEN_TAIL = '. These functions run SQL given as a string, or read files or other databases, so what they read cannot be checked.';

/** Every forbidden-call probe for `platform`, as refused probes whose reason is the render pipeline's message. */
export function ForbiddenProbes(platform: DatabasePlatform): RefusedProbe[] {
    const calls = platform === 'postgresql' ? [...POSTGRES_FORBIDDEN, ...POSTGRES_FORBIDDEN_OBFUSCATED] : SQLSERVER_FORBIDDEN;
    return calls.map(c => ({ Label: `${c.Label} (${c.Name})`, SQL: c.SQL, Reason: `RenderPipeline: a query may not call ${c.Name}${FORBIDDEN_TAIL}`, Adhoc: c.Adhoc }));
}

/** A read that names a forbidden function or a statement keyword only where the database does not run it. */
export interface LookAlikeRead {
    Label: string;
    SQL: string;
    /**
     * The ad hoc path's expression validator refuses some reads by keyword (a join hint spelled
     * `MERGE`): its exact refusal there. The read must still run on every other path.
     */
    AdhocRefusal?: string;
}

/** Reads that must run: they only look like a write or a forbidden call. */
export function LookAlikeReads(platform: DatabasePlatform): LookAlikeRead[] {
    if (platform === 'postgresql') {
        return [
            { Label: 'forbidden name in a string', SQL: `SELECT 'pg_read_file(''/etc/passwd'')' AS "A"` },
            { Label: 'forbidden name in a comment', SQL: `SELECT 1 AS "A" /* pg_sleep(5) */` },
            { Label: 'write keyword in a string', SQL: `SELECT 'x; DELETE FROM t' AS "A"` },
            { Label: 'write keyword as a quoted column alias', SQL: `SELECT "ID" AS "DELETE" FROM "mjit_security"."Canary"` },
        ];
    }
    return [
        { Label: 'forbidden name in a string', SQL: `SELECT 'OPENROWSET(BULK x)' AS [A]` },
        { Label: 'forbidden name in a comment', SQL: `SELECT 1 AS [A] /* OPENQUERY(x, 'y') */` },
        { Label: 'write keyword in a string', SQL: `SELECT 'x; DELETE FROM t' AS [A]` },
        { Label: 'write keyword as a bracketed column alias', SQL: `SELECT [ID] AS [DELETE] FROM mjit_security.[Canary]` },
        { Label: 'MERGE join hint', SQL: `SELECT a.[ID] FROM mjit_security.[Canary] a INNER MERGE JOIN mjit_security.[Canary] b ON b.[ID] = a.[ID]`, AdhocRefusal: danger('MERGE') },
        { Label: 'MERGE join query hint', SQL: `SELECT a.[ID] FROM mjit_security.[Canary] a JOIN mjit_security.[Canary] b ON b.[ID] = a.[ID] OPTION (MERGE JOIN)`, AdhocRefusal: danger('MERGE') },
    ];
}
