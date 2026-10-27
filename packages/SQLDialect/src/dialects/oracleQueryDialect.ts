import type { DialectKey } from '../facets/dialectKey.js';
import type { DialectLexicalRules, ParameterPlaceholderForm } from '../facets/dialectLexicalRules.js';
import type { DialectGrammar } from '../facets/dialectGrammar.js';
import type { DateAddUnit, DialectWriter } from '../facets/dialectWriter.js';
import { ANSI_GRAMMAR, ANSI_LEXICAL, ANSI_WRITE_STATEMENT_KEYWORDS, AnsiQueryDialect, AnsiWriter } from './ansi.js';

/** Base URL: https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/ */
export const ORACLE_LEXICAL: DialectLexicalRules = Object.freeze({
    ...ANSI_LEXICAL,
    // "neither quoted nor nonquoted identifiers can contain double quotation marks", so a doubled
    // quote is not an escape; nonquoted identifiers are interpreted as upper case.
    // https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Database-Object-Names-and-Qualifiers.html
    IdentifierQuotes: Object.freeze([Object.freeze({ Open: '"', Close: '"', DoubledCloseEscape: false })]),
    UnquotedIdentifierCase: 'upper',
    // '…' with '' for a quote, N'…' national literals, no backslash escape; q'…' / nq'…'
    // alternative quoting, where [ { < ( close with their partner and any other character closes
    // with itself. https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Literals.html
    AlternativeQuotingPrefixes: Object.freeze(['Q', 'NQ']),
    // `--` and `/* */` comments; a multiline comment cannot contain another.
    // https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Comments.html
    // https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/comment.html
    BlockComments: Object.freeze({ Nested: false, ExecutableOpeners: Object.freeze([]) }),
    // `:name` placeholders, and `:1` positional ones.
    // https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Placeholder-Expressions.html
    // https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/native-dynamic-sql.html
    ParameterPlaceholders: Object.freeze<ParameterPlaceholderForm[]>(['colon-name', 'colon-number']),
});

/**
 * Oracle grammar facts. `OFFSET … ROWS FETCH FIRST|NEXT … ROWS ONLY` and no LIMIT
 * (https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/SELECT.html); recursive
 * subquery factoring with plain WITH; MINUS, with EXCEPT as a synonym from 21c
 * (https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/The-UNION-ALL-INTERSECT-MINUS-Operators.html);
 * CROSS/OUTER APPLY and LATERAL from 12.1. node-sql-parser has no Oracle grammar.
 */
export const ORACLE_GRAMMAR: DialectGrammar = Object.freeze({
    ...ANSI_GRAMMAR,
    ParserGrammar: null,
    RecursiveKeyword: null,
    SetOperatorKeywords: Object.freeze(['UNION', 'INTERSECT', 'MINUS', 'EXCEPT']),
    CorrelatedJoin: 'both',
    WriteStatementKeywords: Object.freeze([
        ...ANSI_WRITE_STATEMENT_KEYWORDS,
        'RENAME', 'COMMENT', 'PURGE', 'FLASHBACK', 'LOCK', 'AUDIT', 'NOAUDIT', 'ANALYZE', 'BEGIN', 'DECLARE', 'EXEC', 'EXECUTE',
    ]),
    DefaultPagingOrderBy: 'NULL',
});

/**
 * Writes Oracle SQL: `"…"` identifiers, `FETCH FIRST`, `NVL`, `NUMTODSINTERVAL`. Oracle LIKE has
 * no default escape character, so a pattern from {@link EscapeLikePattern} (backslash escapes)
 * must be followed by `ESCAPE '\'`.
 */
export class OracleWriter extends AnsiWriter {
    /** Oracle has no boolean SQL type before 23ai; 1 and 0 work in every release. */
    BooleanLiteral(value: boolean): string {
        return value ? '1' : '0';
    }

    /** https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/CAST.html */
    CastToText(expr: string): string {
        return this.Cast(expr, 'VARCHAR2(4000)');
    }

    /** https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/NVL.html */
    IsNull(expr: string, fallback: string): string {
        return `NVL(${expr}, ${fallback})`;
    }

    /** https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/NUMTODSINTERVAL.html */
    DateAddExpression(unit: DateAddUnit, amount: number, baseExpr: string): string {
        return `${baseExpr} + NUMTODSINTERVAL(${amount}, '${unit}')`;
    }

    /** https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/SYS_EXTRACT_UTC.html */
    CurrentTimestampUTC(): string {
        return 'SYS_EXTRACT_UTC(SYSTIMESTAMP)';
    }
}

/** Oracle, read as an External Data Source. Query-only: no DDL facet. */
export class OracleQueryDialect extends AnsiQueryDialect {
    private readonly writer: DialectWriter = Object.freeze(new OracleWriter());

    get Key(): DialectKey {
        return 'oracle';
    }

    get DisplayName(): string {
        return 'Oracle Database';
    }

    get Lexical(): DialectLexicalRules {
        return ORACLE_LEXICAL;
    }

    get Grammar(): DialectGrammar {
        return ORACLE_GRAMMAR;
    }

    get Writer(): DialectWriter {
        return this.writer;
    }
}
