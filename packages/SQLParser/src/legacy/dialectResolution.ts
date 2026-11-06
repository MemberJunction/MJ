import { GetQueryDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { ParserDialect, SQLParserDialect } from '@memberjunction/sql-dialect';

/**
 * Any dialect input the deprecated `SQLParser` statics accept: a dialect with lexical and grammar
 * facets, the older `SQLParserDialect` interface, or a node-sql-parser grammar string
 * (`'TransactSQL'`, `'PostgresQL'`, …) from a loosely typed caller.
 */
export type LegacyDialectInput = ParserDialect | SQLParserDialect | string | null | undefined;

/** The built-in dialect keys a grammar string can name. */
const GRAMMAR_DIALECT_KEYS: readonly string[] = ['sqlserver', 'postgresql', 'mysql', 'snowflake', 'databricks'];

/** The dialect a missing or unrecognized input means: SQL Server, as the legacy statics always assumed. */
const DEFAULT_DIALECT: ParserDialect = new SQLServerDialect();

/** The default schema the legacy table-reference shape fills when a dialect names none. */
const LEGACY_DEFAULT_SCHEMA = 'dbo';

let grammarDialects: ReadonlyMap<string, ParserDialect> | null = null;

/** The built-in dialects keyed by their node-sql-parser grammar, lower case. Built once. */
function dialectsByGrammar(): ReadonlyMap<string, ParserDialect> {
    if (grammarDialects === null) {
        const map = new Map<string, ParserDialect>();
        for (const key of GRAMMAR_DIALECT_KEYS) {
            const dialect = GetQueryDialect(key);
            const grammar = dialect.Grammar.ParserGrammar;
            if (grammar !== null && !map.has(grammar.toLowerCase())) map.set(grammar.toLowerCase(), dialect);
        }
        grammarDialects = map;
    }
    return grammarDialects;
}

/** Whether a dialect object carries the key, lexical and grammar facets. */
function hasFacets(dialect: ParserDialect | SQLParserDialect): dialect is ParserDialect {
    return 'Lexical' in dialect && 'Grammar' in dialect && 'Key' in dialect;
}

/** The built-in dialect read by a node-sql-parser grammar string; SQL Server when the string is unknown. */
function dialectForGrammar(grammar: string): ParserDialect {
    return dialectsByGrammar().get(grammar.toLowerCase()) ?? DEFAULT_DIALECT;
}

/**
 * The faceted dialect behind any input the legacy statics accept. A faceted dialect is returned
 * as itself; an older `SQLParserDialect` object and a grammar string resolve by their
 * node-sql-parser grammar, so `'PostgresQL'`, `new PostgreSQLDialect()` and a plain object copied
 * from it all read SQL the same way. A missing input, or a grammar no built-in dialect uses,
 * means SQL Server.
 */
export function ResolveParserDialect(dialect: LegacyDialectInput): ParserDialect {
    if (dialect === null || dialect === undefined) return DEFAULT_DIALECT;
    if (typeof dialect === 'string') return dialectForGrammar(dialect);
    if (hasFacets(dialect)) return dialect;
    return typeof dialect.ParserDialect === 'string' ? dialectForGrammar(dialect.ParserDialect) : DEFAULT_DIALECT;
}

/**
 * The schema the legacy `SQLTableReference.SchemaName` reports for an unqualified name: the
 * dialect's default schema (`dbo` on SQL Server, `public` on PostgreSQL), or `dbo` for a dialect
 * that names none.
 */
export function LegacyDefaultSchema(dialect: ParserDialect): string {
    return dialect.Grammar.DefaultSchema ?? LEGACY_DEFAULT_SCHEMA;
}
