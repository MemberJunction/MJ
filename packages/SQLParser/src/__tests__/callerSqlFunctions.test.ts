/**
 * FindForbiddenFunctionCalls finds the calls a dialect forbids in caller-supplied SQL: functions
 * that run SQL from a string, read files or other databases, or act on the server.
 */
import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { FindForbiddenFunctionCalls } from '../callerSqlFunctions';

const pg = new PostgreSQLDialect();
const tsql = new SQLServerDialect();

describe('FindForbiddenFunctionCalls on PostgreSQL', () => {
    it('finds a call that runs SQL from a string', () => {
        expect(FindForbiddenFunctionCalls(`SELECT query_to_xml('SELECT salary FROM secret', true, false, '')`, pg)).toEqual(['query_to_xml']);
    });

    it('finds quoted, schema-qualified, spaced and differently-cased calls, and each name once', () => {
        const sql = `SELECT pg_catalog.Query_To_Xml_And_XmlSchema ('x', true, false, ''), "pg_read_file"('/etc/hostname'), DBLINK('c', 'q'), lo_get(1), lo_get(2)`;
        expect(FindForbiddenFunctionCalls(sql, pg)).toEqual(['query_to_xml_and_xmlschema', 'pg_read_file', 'dblink', 'lo_get']);
    });

    it('finds the file, directory and server-administration families', () => {
        const sql = 'SELECT pg_ls_dir($$.$$), pg_stat_file($$x$$), pg_read_binary_file($$x$$), pg_terminate_backend(1), table_to_xml(1, true, false, $$$$)';
        expect(FindForbiddenFunctionCalls(sql, pg)).toEqual(['pg_ls_dir', 'pg_stat_file', 'pg_read_binary_file', 'pg_terminate_backend', 'table_to_xml']);
    });

    it('ignores the names in strings, comments and column references', () => {
        const sql = `-- query_to_xml(\nSELECT 'pg_read_file(x)' AS a, $$dblink($$ AS b, t.lo_size, lower(name) FROM t /* lo_import( */`;
        expect(FindForbiddenFunctionCalls(sql, pg)).toEqual([]);
    });

    it('allows ordinary functions', () => {
        expect(FindForbiddenFunctionCalls(`SELECT count(*), string_agg(n::text, ','), xpath('/a', x) FROM t`, pg)).toEqual([]);
    });
});

describe('FindForbiddenFunctionCalls on SQL Server', () => {
    it('finds the rowset functions that reach other servers, databases or files', () => {
        const sql = `SELECT * FROM OPENROWSET(BULK 'c:\\x', SINGLE_CLOB) a JOIN OPENQUERY(srv, 'SELECT 1') b ON 1 = 1 JOIN [OpenDataSource]('x', 'y').db.dbo.t c ON 1 = 1`;
        expect(FindForbiddenFunctionCalls(sql, tsql)).toEqual(['openrowset', 'openquery', 'opendatasource']);
    });

    it('finds the trace and audit file readers, schema-qualified', () => {
        expect(FindForbiddenFunctionCalls(`SELECT * FROM sys.fn_get_audit_file('x', DEFAULT, DEFAULT)`, tsql)).toEqual(['fn_get_audit_file']);
    });

    it('does not apply the PostgreSQL list', () => {
        expect(FindForbiddenFunctionCalls(`SELECT query_to_xml('x')`, tsql)).toEqual([]);
    });
});
