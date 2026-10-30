/**
 * Shared helpers for the SqlDocument suites: dialects (with their writers, for the transforms),
 * parsing, and short readers for names and diagnostics.
 */
import { expect } from 'vitest';
import { GetQueryDialect } from '@memberjunction/sql-dialect';
import type { QueryDialect } from '@memberjunction/sql-dialect';
import { SqlDocument } from '../../sql/sqlDocument.js';
import type { ObjectName, QueryExpression, SelectCore } from '../../sql/sqlNodes.js';

export const SS: QueryDialect = GetQueryDialect('sqlserver');
export const PG: QueryDialect = GetQueryDialect('postgresql');

/** Both MJ platforms, for suites that run every case on each. */
export const PLATFORMS: readonly (readonly [string, QueryDialect])[] = [['SQL Server', SS], ['PostgreSQL', PG]];

/** Parses `sql`. */
export function Parse(sql: string, dialect: QueryDialect = SS): SqlDocument {
    return SqlDocument.Parse(sql, dialect);
}

/** Parses `sql` and expects it to be read completely. */
export function ParseClean(sql: string, dialect: QueryDialect = SS): SqlDocument {
    const doc = SqlDocument.Parse(sql, dialect);
    expect(doc.Diagnostics.filter(d => d.Severity !== 'Info').map(d => `${d.Code}: ${doc.Text(d.Span)}`), sql).toEqual([]);
    expect(doc.IsComplete, sql).toBe(true);
    return doc;
}

/** A dotted name's parts joined with `.`. */
export function Dotted(name: ObjectName | null): string | null {
    return name === null ? null : name.Parts.map(p => p.Value).join('.');
}

/** The diagnostic codes of a document. */
export function CodesOf(doc: SqlDocument): string[] {
    return doc.Diagnostics.map(d => d.Code);
}

/** The top-level query of the first statement, which the test expects to be a select block. */
export function TopSelect(doc: SqlDocument): SelectCore {
    const top = doc.TopLevelQuery();
    if (top === null || top.Kind !== 'Select') throw new Error(`expected a select block, got ${top?.Kind ?? 'nothing'}`);
    return top;
}

/** The top-level query of the first statement, which the test expects to exist. */
export function Top(doc: SqlDocument): QueryExpression {
    const top = doc.TopLevelQuery();
    if (top === null) throw new Error('expected a query');
    return top;
}
