import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { StrictFragmentValidator } from './strict/strictFragmentValidator.js';

/** Result of {@link CheckAggregateExpression}. */
export interface AggregateExpressionCheck {
    /** Whether the expression may be placed as one item of an aggregate SELECT list. */
    IsAllowed: boolean;
    /** Why the expression was refused; `null` when it is allowed. */
    Reason: string | null;
    /**
     * The SQL to run in place of the caller's text: the expression rebuilt from its checked parse
     * tree, with the dialect's quoting. `null` when the expression is refused.
     */
    SQL: string | null;
}

/**
 * Whether `expression` may be placed as one item of an aggregate SELECT list —
 * `SELECT <expression> AS [Agg_0] FROM <entity view> WHERE …` — for an entity whose columns are
 * `columns`, and the SQL to run for it.
 *
 * Allowed: exactly one call to an aggregate function (COUNT, SUM, AVG, MIN, MAX, STDEV, VAR,
 * STRING_AGG, …) with nothing before or after it. Inside the call: the given columns, `*` for
 * COUNT, DISTINCT, constants, arithmetic, comparison and logical operators, CASE, CAST, and a
 * fixed set of pure scalar functions. Everything else is refused: statement separators, comments,
 * backslashes inside quoted strings or identifiers, subqueries, other tables, qualified names,
 * variables, aliases, window clauses, and any shape the parser produces that this check does not
 * read.
 *
 * The caller's text is never run. {@link AggregateExpressionCheck.SQL} is rebuilt from the
 * checked parse tree: columns come from `columns` and are quoted for the dialect; function names,
 * type names, operators and keywords come from fixed lists; string and number constants are
 * re-quoted or re-checked. So the database runs exactly the expression that was checked, even
 * where the parser and the database would read the caller's text differently.
 *
 * The check is {@link StrictFragmentValidator.ValidateAggregateExpression}; this keeps its
 * original result shape.
 *
 * @param expression The caller-supplied aggregate expression
 * @param dialect The dialect the expression runs under
 * @param columns The entity's column names (its base view's columns). A reference matches a column
 * by `IdentifierMatches` from `@memberjunction/sql-dialect`, the field-level security gate's rule.
 * @deprecated Use `StrictFragmentValidator.ValidateAggregateExpression`.
 */
export function CheckAggregateExpression(expression: string, dialect: SQLParserDialect, columns: Iterable<string>): AggregateExpressionCheck {
    const result = StrictFragmentValidator.ValidateAggregateExpression(expression, dialect, columns);
    return { IsAllowed: result.IsValid, Reason: result.Reason, SQL: result.SQL };
}
