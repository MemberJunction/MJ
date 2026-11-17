import type { AggregateFunctionType } from './aggregate-setup-dialog.component';

/** A `FUNC(column)` aggregate expression split into its parts; `Column` is '' for `COUNT(*)`. */
export interface SimpleAggregateExpression {
  Func: AggregateFunctionType;
  Column: string;
}

const FUNCTION_PREFIX = /^(SUM|AVG|COUNT|MIN|MAX|COUNT_DISTINCT)\s*\(/i;
const COLUMN_CHARS = /^[\w\s]+$/;

/**
 * Parses `FUNC(column)`, `FUNC([column])` or `COUNT(*)`, returning null for anything else.
 *
 * Accepts what `/^(SUM|…)\s*\(\s*(\*|\[?([\w\s]+)\]?)\s*\)$/i` accepted, but checks the argument by
 * index: that regex's whitespace runs overlap `[\w\s]+`, which is quadratic on a long argument.
 */
export function ParseSimpleAggregateExpression(expression: string): SimpleAggregateExpression | null {
  const trimmed = expression.trim();
  const prefix = FUNCTION_PREFIX.exec(trimmed);
  if (!prefix || !trimmed.endsWith(')')) return null;
  const column = parseAggregateArgument(trimmed.substring(prefix[0].length, trimmed.length - 1));
  if (column === null) return null;
  return { Func: prefix[1].toUpperCase() as AggregateFunctionType, Column: column };
}

/** The column named by an aggregate's argument ('' for `*`), or null when the argument is not one. */
function parseAggregateArgument(argument: string): string | null {
  if (argument.trim() === '*') return '';
  const first = argument.length - argument.trimStart().length;
  const last = argument.trimEnd().length - 1;
  const bracketed = argument[first] === '[';
  const closed = last >= 0 && argument[last] === ']';
  const start = bracketed ? first + 1 : 0;
  const end = closed ? last : argument.length;
  const name = argument.substring(start, Math.max(start, end));
  return COLUMN_CHARS.test(name) ? name.trim() : null;
}
