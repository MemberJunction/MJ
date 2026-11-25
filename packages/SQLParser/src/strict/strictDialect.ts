import type { DialectGrammar, SQLParserDialect } from '@memberjunction/sql-dialect';

/** A dialect that carries a grammar facet next to the members the parser reads. */
type DialectWithGrammar = SQLParserDialect & { readonly Grammar: Pick<DialectGrammar, 'ParserGrammar'> };

/** True when `dialect` carries a grammar facet that names its parser grammar (or `null`). */
function hasGrammarFacet(dialect: SQLParserDialect): dialect is DialectWithGrammar {
    if (!('Grammar' in dialect)) return false;
    const grammar = dialect.Grammar;
    return typeof grammar === 'object' && grammar !== null && 'ParserGrammar' in grammar;
}

/**
 * The strict parser's grammar for a dialect: its grammar facet's `ParserGrammar` when it has the
 * facet, otherwise its `ParserDialect` string as given. `null` when the facet names no grammar.
 */
export function StrictGrammarOf(dialect: SQLParserDialect): string | null {
    if (hasGrammarFacet(dialect)) {
        const grammar = dialect.Grammar.ParserGrammar;
        return typeof grammar === 'string' && grammar.length > 0 ? grammar : null;
    }
    return dialect.ParserDialect;
}

/**
 * The dialect the parser reads with for `grammar`: `dialect` itself when it already names that
 * grammar, otherwise a view of it that names `grammar` and delegates every other member.
 */
export function StrictParsingDialect(dialect: SQLParserDialect, grammar: string): SQLParserDialect {
    if (dialect.ParserDialect === grammar) return dialect;
    return {
        ParserDialect: grammar,
        QuoteIdentifier: (name: string) => dialect.QuoteIdentifier(name),
        AllowsOrderByInCTE: dialect.AllowsOrderByInCTE,
        DefaultPagingOrderBy: dialect.DefaultPagingOrderBy,
        SupportsEscapeStringLiterals: dialect.SupportsEscapeStringLiterals,
        SupportsDollarQuotedStrings: dialect.SupportsDollarQuotedStrings,
        QueryHintKeyword: dialect.QueryHintKeyword,
        CallerSQLForbiddenFunctions: dialect.CallerSQLForbiddenFunctions,
    };
}
