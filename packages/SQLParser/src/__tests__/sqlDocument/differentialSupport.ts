/**
 * The node-sql-parser side of the differential harness: parse an entry with the legacy
 * `SQLParser.ParseSQL` path (SQL Server, PostgreSQL) or node-sql-parser's own grammar for the
 * other dialects, and read tables, CTE names and output aliases out of its AST.
 *
 * The AST is third-party JSON, so it is walked as `unknown` with type guards.
 */
import NodeSqlParser from 'node-sql-parser';
import { GetQueryDialect, PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { SQLParser } from '../../sql-parser.js';
import { SqlDocument } from '../../sql/sqlDocument.js';
import type { CorpusEntry } from '../corpus/index.js';

/** What each side reports for one entry. */
export interface DifferentialFacts {
    /** Tables read, lower case, parts joined with `.`; CTE references excluded. */
    readonly Tables: readonly string[];
    /** CTE names declared anywhere, lower case. */
    readonly CTEs: readonly string[];
    /** The first statement's output aliases, in order; `null` for an item without one. */
    readonly Aliases: readonly (string | null)[];
}

const LEGACY_DIALECTS = { sqlserver: new SQLServerDialect(), postgresql: new PostgreSQLDialect() } as const;

type JsonObject = { readonly [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walk(value: unknown, visit: (node: JsonObject) => void): void {
    const pending: unknown[] = [value];
    while (pending.length > 0) {
        const current = pending.pop();
        if (Array.isArray(current)) {
            pending.push(...current);
        } else if (isObject(current)) {
            visit(current);
            pending.push(...Object.values(current));
        }
    }
}

function text(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (isObject(value) && typeof value.value === 'string') return value.value;
    return null;
}

/** The text both sides read for an entry, and node-sql-parser's AST of it; `null` when it does not parse. */
export interface LegacyParse {
    /** The SQL compared: the entry's own text, or Astify's placeholder-substituted text for a templated entry. */
    readonly SQL: string;
    readonly Ast: unknown;
    /** Whether the entry has template tags (compared through `SQLParser.Astify`). */
    readonly Templated: boolean;
}

/**
 * node-sql-parser's reading of an entry: `SQLParser.Astify` for a templated SQL Server or
 * PostgreSQL entry (its placeholder text is what both sides then read), `SQLParser.ParseSQL`
 * for an untemplated one, and node-sql-parser's grammar for the other dialects.
 */
export function LegacyParseOf(entry: CorpusEntry, templated: boolean): LegacyParse | null {
    if (!templated) {
        const ast = LegacyAst(entry);
        return ast === null ? null : { SQL: entry.SQL, Ast: ast, Templated: false };
    }
    if (entry.Dialect !== 'sqlserver' && entry.Dialect !== 'postgresql') return null;
    try {
        const result = SQLParser.Astify(entry.SQL, LEGACY_DIALECTS[entry.Dialect]);
        return result.ast === null ? null : { SQL: result.cleanSQL, Ast: result.ast, Templated: true };
    } catch {
        return null;
    }
}

/** The AST node-sql-parser gives the entry, or `null` when it does not parse it. */
export function LegacyAst(entry: CorpusEntry): unknown {
    try {
        if (entry.Dialect === 'sqlserver' || entry.Dialect === 'postgresql') return SQLParser.ParseSQL(entry.SQL, LEGACY_DIALECTS[entry.Dialect]);
        const grammar = GetQueryDialect(entry.Dialect).Grammar.ParserGrammar;
        if (grammar === null) return null;
        return new NodeSqlParser.Parser().astify(entry.SQL, { database: grammar });
    } catch {
        return null;
    }
}

/** Tables, CTE names and aliases as node-sql-parser's AST has them. */
export function LegacyFacts(ast: unknown): DifferentialFacts {
    const ctes = new Set<string>();
    walk(ast, node => {
        if (!Array.isArray(node.with)) return;
        for (const cte of node.with) {
            const name = isObject(cte) ? text(cte.name) : null;
            if (name !== null) ctes.add(name.toLowerCase());
        }
    });
    const tables = new Set<string>();
    walk(ast, node => {
        if (!Array.isArray(node.from)) return;
        for (const source of node.from) {
            if (!isObject(source) || typeof source.table !== 'string') continue;
            const parts = [source.db, source.schema, source.table].filter((p): p is string => typeof p === 'string' && p !== '');
            const key = parts.join('.').toLowerCase();
            if (parts.length === 1 && ctes.has(key)) continue;
            tables.add(key);
        }
    });
    const first = Array.isArray(ast) ? ast[0] : ast;
    const columns = isObject(first) && Array.isArray(first.columns) ? first.columns : [];
    const aliases = columns.map(c => (isObject(c) ? text(c.as) : null));
    return { Tables: [...tables].sort(), CTEs: [...ctes].sort(), Aliases: aliases };
}

/** The same facts from {@link SqlDocument}, read from `sql` in the entry's dialect. */
export function DocumentFacts(entry: CorpusEntry, sql: string = entry.SQL): DifferentialFacts {
    const doc = SqlDocument.Parse(sql, GetQueryDialect(entry.Dialect));
    const tables = new Set(doc.TableReferences().Value.filter(t => t.Kind === 'Table').map(t => t.Name.Parts.map(p => p.Value).join('.').toLowerCase()));
    const ctes = new Set(doc.CTEs().Value.map(c => c.Name.Value.toLowerCase()));
    const aliases = doc.OutputItems().Value.Items.map(i => i.Alias?.Value ?? null);
    return { Tables: [...tables].sort(), CTEs: [...ctes].sort(), Aliases: aliases };
}
