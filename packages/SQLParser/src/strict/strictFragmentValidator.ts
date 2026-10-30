import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { SQLParser, type SQLStatementKind } from '../sql-parser.js';
import { RenderAggregateExpression } from './aggregateRenderer.js';
import { CLAUSE_WRAPPER_TABLE, CollectReads, WrapperFromItem, type ReadableParse } from './statementReads.js';
import { StrictGrammarOf, StrictParsingDialect } from './strictDialect.js';
import type {
    StrictAggregateResult,
    StrictFilterOptions,
    StrictParseOptions,
    StrictRefusal,
    StrictStatementReads,
    StrictValidationResult,
} from './strictTypes.js';
import {
    IsSingleTypedStatement,
    TopLevelHasWriteStatement,
    TopLevelStatementKind,
    TreeContainsWriteNode,
    WhereColumnReferences,
} from './treeFacts.js';

/** The sentence each refusal reports. */
const REFUSAL_REASONS: Readonly<Record<StrictRefusal, string>> = {
    NoGrammar: 'the dialect has no grammar to check the SQL with',
    Unparseable: 'the SQL could not be parsed',
    WriteStatement: 'the SQL contains a write, DDL or permission statement',
    NotPlainSelect: 'the SQL is not a single plain SELECT',
    NestedWrite: 'the SQL contains a write or DDL statement nested in a CTE or subquery',
};

/** A parse the validator reads its facts from. A `SQLParser` is one. */
interface ParsedTree extends ReadableParse {
    readonly StatementKind: SQLStatementKind;
    readonly HasWriteStatement: boolean;
}

/** What one strict parse read: the tree when the text parsed, or the reason it did not. */
type StrictParse = { SQL: string } & ({ Tree: ParsedTree; Refusal: null } | { Tree: null; Refusal: 'NoGrammar' | 'Unparseable' });

/**
 * SECURITY — the strict, fail-closed reader for SQL that untrusted callers supply: a WHERE or
 * ORDER BY fragment, an aggregate expression, or a whole read statement. Text the dialect's grammar
 * cannot read is refused, never guessed at, so use it only where refusing unparseable input is
 * correct, and never to rewrite SQL MJ owns.
 *
 * The grammar is the dialect's grammar facet (`Grammar.ParserGrammar`: TransactSQL, PostgresQL,
 * MySQL, Snowflake, Hive), or the `ParserDialect` of a dialect without the facet. A dialect whose
 * facet names no grammar is refused (`'NoGrammar'`).
 *
 * Every result carries the facts a screen decides on (statement kind, top-level and nested
 * writes, the relations read, the column references) as plain MJ types, so a caller never reads
 * a parse tree.
 */
export class StrictFragmentValidator {
    /**
     * Reads a WHERE fragment as the predicate of `SELECT 1 FROM __mj_clause_screen WHERE …`. With
     * {@link StrictParseOptions.CollectReads}, the reads leave out that wrapper's own FROM item.
     */
    public static ValidateFilter(filter: string, dialect: SQLParserDialect, options?: StrictFilterOptions): StrictValidationResult {
        const body = options?.Placement === 'AsWritten' ? filter : `(${filter})`;
        return StrictFragmentValidator.validateWrapped(`SELECT 1 FROM ${CLAUSE_WRAPPER_TABLE} WHERE ${body}`, dialect, options);
    }

    /**
     * Reads an ORDER BY list as the ORDER BY of `SELECT 1 FROM __mj_clause_screen ORDER BY …`.
     * With {@link StrictParseOptions.CollectReads}, the reads leave out that wrapper's own FROM item.
     */
    public static ValidateOrderBy(orderBy: string, dialect: SQLParserDialect, options?: StrictParseOptions): StrictValidationResult {
        return StrictFragmentValidator.validateWrapped(`SELECT 1 FROM ${CLAUSE_WRAPPER_TABLE} ORDER BY ${orderBy}`, dialect, options);
    }

    /** Reads a whole statement, which is valid when it is one plain read-only SELECT. */
    public static ValidateReadOnlyStatement(sql: string, dialect: SQLParserDialect, options?: StrictParseOptions): StrictValidationResult {
        return StrictFragmentValidator.resultOf(StrictFragmentValidator.parse(sql, dialect, options), options, false);
    }

    /**
     * Whether `expression` may be placed as one item of an aggregate SELECT list —
     * `SELECT <expression> AS [Agg_0] FROM <entity view> WHERE …` — for an entity whose columns are
     * `columns`, and the SQL to run for it: exactly one aggregate call (COUNT, SUM, AVG, MIN, MAX,
     * STDEV, VAR, STRING_AGG, …) over the given columns, constants, operators, CASE, CAST and a
     * fixed set of pure scalar functions. The caller's text is never run:
     * {@link StrictAggregateResult.SQL} is rebuilt from the checked parse tree with the dialect's
     * quoting, so the database runs exactly the expression that was checked.
     */
    public static ValidateAggregateExpression(expression: string, dialect: SQLParserDialect, columns: Iterable<string>): StrictAggregateResult {
        return RenderAggregateExpression(expression, dialect, columns);
    }

    /**
     * Every FROM item an already-parsed statement reads, and the number of SELECTs in its tree,
     * walking the whole tree with CTE scope. `skip` is a FROM item node of `parser`'s own tree to
     * leave out.
     */
    public static CollectStatementReads(parser: SQLParser, skip?: object): StrictStatementReads {
        return CollectReads(parser, skip);
    }

    /**
     * True when a parse tree (such as `SQLParser.AST`) holds a write, DDL or DCL statement at any
     * depth. Any other value holds none.
     */
    public static ContainsWriteNode(tree: unknown): boolean {
        return TreeContainsWriteNode(tree);
    }

    /** Validates a fragment already placed in its parse wrapper, whose own FROM item the reads leave out. */
    private static validateWrapped(wrapped: string, dialect: SQLParserDialect, options: StrictParseOptions | undefined): StrictValidationResult {
        return StrictFragmentValidator.resultOf(StrictFragmentValidator.parse(wrapped, dialect, options), options, true);
    }

    /**
     * Parses `sql` with the dialect's grammar: through a `SQLParser`, with its fallbacks, or, when
     * fallbacks are not allowed, with the single direct reading `SQLParser.ParseSQL` makes.
     */
    private static parse(sql: string, dialect: SQLParserDialect, options: StrictParseOptions | undefined): StrictParse {
        const grammar = StrictGrammarOf(dialect);
        if (grammar === null) return { SQL: sql, Tree: null, Refusal: 'NoGrammar' };
        const parsing = StrictParsingDialect(dialect, grammar);
        const tree = options?.AllowFallbackParse === false ? StrictFragmentValidator.directTree(sql, parsing) : new SQLParser(sql, parsing);
        return tree && tree.AST !== null ? { SQL: sql, Tree: tree, Refusal: null } : { SQL: sql, Tree: null, Refusal: 'Unparseable' };
    }

    /** The direct reading of `sql`, with no fallback; null when it does not parse. */
    private static directTree(sql: string, dialect: SQLParserDialect): ParsedTree | null {
        const ast = SQLParser.ParseSQL(sql, dialect);
        if (ast === null) return null;
        return {
            AST: ast,
            IdentifierAliases: null,
            Dialect: dialect,
            SQL: sql,
            StatementKind: TopLevelStatementKind(ast),
            HasWriteStatement: TopLevelHasWriteStatement(ast),
        };
    }

    /** The result for one parse; `skipWrapper` leaves the fragment wrapper's FROM item out of the reads. */
    private static resultOf(parse: StrictParse, options: StrictParseOptions | undefined, skipWrapper: boolean): StrictValidationResult {
        if (parse.Tree === null) return StrictFragmentValidator.unparsed(parse.SQL, parse.Refusal);
        const tree = parse.Tree;
        const facts = {
            StatementKind: tree.StatementKind,
            HasWriteStatement: tree.HasWriteStatement,
            ContainsNestedWrite: TreeContainsWriteNode(tree.AST),
            IsSingleTypedStatement: IsSingleTypedStatement(tree.AST),
        };
        const refusal = StrictFragmentValidator.refusalOf(facts.HasWriteStatement, facts.StatementKind === 'select', facts.ContainsNestedWrite);
        const collectReads = refusal === null && options?.CollectReads === true;
        return {
            IsValid: refusal === null,
            Refusal: refusal,
            Reason: refusal === null ? null : REFUSAL_REASONS[refusal],
            ParsedSQL: parse.SQL,
            Parsed: true,
            ...facts,
            Reads: collectReads ? CollectReads(tree, skipWrapper ? WrapperFromItem(tree.AST) : undefined) : null,
            ColumnReferences: options?.CollectColumnReferences === true ? WhereColumnReferences(tree.AST) : null,
        };
    }

    /** The first refusal a parsed text earns, in the order {@link StrictRefusal} lists them. */
    private static refusalOf(hasWrite: boolean, isPlainSelect: boolean, nestedWrite: boolean): StrictRefusal | null {
        if (hasWrite) return 'WriteStatement';
        if (!isPlainSelect) return 'NotPlainSelect';
        if (nestedWrite) return 'NestedWrite';
        return null;
    }

    /** The result for text that did not parse. */
    private static unparsed(sql: string, refusal: 'NoGrammar' | 'Unparseable'): StrictValidationResult {
        return {
            IsValid: false,
            Refusal: refusal,
            Reason: REFUSAL_REASONS[refusal],
            ParsedSQL: sql,
            Parsed: false,
            StatementKind: 'other',
            HasWriteStatement: false,
            ContainsNestedWrite: false,
            IsSingleTypedStatement: false,
            Reads: null,
            ColumnReferences: null,
        };
    }
}
