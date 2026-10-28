/**
 * @module incumbent-heuristic
 *
 * The unit's incumbent heuristic (today's rule of thumb, `IncumbentHeuristic.scoreExpression`) as a per-row score
 * over assembled columns, so the trainer can score it on the same holdout rows as a named comparator and scoring can
 * compute the same column. The expression is evaluated by a small grammar, never as SQL or `eval`: a bare `<column>`
 * (the column's value is the score), or comparisons `<column> <op> <number>` (`>=`, `>`, `<=`, `<`, `==`, `!=`) joined
 * by `and`/`or`, where `and` binds tighter and the result is 1 or 0.
 */
import { JsonParse, type ParseResult } from './json-value';

/** One comparison of a rule: `<Column> <Op> <Value>`. */
export interface IncumbentComparison {
  readonly Column: string;
  readonly Op: '>=' | '>' | '<=' | '<' | '==' | '!=';
  readonly Value: number;
}

/** A parsed incumbent-heuristic expression: a bare column, or an OR of AND-groups of comparisons. */
export type IncumbentExpression =
  | { readonly Kind: 'column'; readonly Column: string }
  | { readonly Kind: 'rule'; readonly Any: readonly (readonly IncumbentComparison[])[] };

const TOKEN = /\s*(>=|<=|==|!=|>|<|[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?)/y;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const OPS: readonly IncumbentComparison['Op'][] = ['>=', '>', '<=', '<', '==', '!='];

/**
 * The incumbent-heuristic grammar: parse, list the referenced columns, evaluate. Static members on one owner class so
 * callers write `IncumbentExpressions.ParseIncumbentExpression(text)`.
 */
export class IncumbentExpressions {
  /** Parse a scoreExpression; anything outside the grammar is a failure naming the expression. */
  public static ParseIncumbentExpression(text: string): ParseResult<IncumbentExpression> {
    const fail = JsonParse.ParseFail<IncumbentExpression>(
      `IncumbentHeuristic scoreExpression "${text}" must be <column>, or <column> <op> <number> comparisons joined by and/or`,
    );
    const tokens = IncumbentExpressions.tokenize(text);
    if (tokens === null || tokens.length === 0) return fail;
    const only = tokens[0];
    if (tokens.length === 1 && only !== undefined && IncumbentExpressions.isColumn(only)) {
      return JsonParse.ParseOk({ Kind: 'column', Column: only });
    }
    const any = IncumbentExpressions.parseRule(tokens);
    return any === null ? fail : JsonParse.ParseOk({ Kind: 'rule', Any: any });
  }

  /** Every column the expression reads, each once, in first-reference order. */
  public static IncumbentExpressionColumns(e: IncumbentExpression): readonly string[] {
    return e.Kind === 'column' ? [e.Column] : [...new Set(e.Any.flatMap((g) => g.map((c) => c.Column)))];
  }

  /**
   * The row's heuristic score; null when any referenced value is missing or NaN (the trainer imputes in-fold, never
   * 0), since a NaN would otherwise fail every comparison and score as a confident 0.
   */
  public static EvaluateIncumbentExpression(
    e: IncumbentExpression,
    value: (column: string) => number | null,
  ): number | null {
    if (e.Kind === 'column') return IncumbentExpressions.present(value(e.Column));
    let score = 0;
    for (const group of e.Any) {
      let all = true;
      for (const c of group) {
        const v = IncumbentExpressions.present(value(c.Column));
        if (v === null) return null;
        if (!IncumbentExpressions.holds(v, c.Op, c.Value)) all = false;
      }
      if (all) score = 1;
    }
    return score;
  }

  /** The value, or null when it is missing or NaN. */
  private static present(v: number | null): number | null {
    return v === null || Number.isNaN(v) ? null : v;
  }

  /** Comparison tokens `<column> <op> <number>` joined by `and`/`or` → OR of AND-groups; null when malformed. */
  private static parseRule(tokens: readonly string[]): IncumbentComparison[][] | null {
    const any: IncumbentComparison[][] = [];
    let group: IncumbentComparison[] = [];
    let k = 0;
    for (;;) {
      const comparison = IncumbentExpressions.comparisonAt(tokens, k);
      if (comparison === null) return null;
      group.push(comparison);
      k += 3;
      if (k === tokens.length) break;
      const joiner = tokens[k];
      if (joiner === 'or') {
        any.push(group);
        group = [];
      } else if (joiner !== 'and') {
        return null;
      }
      k += 1;
    }
    any.push(group);
    return any;
  }

  /** The comparison starting at token `k`, or null when the three tokens are not `<column> <op> <number>`. */
  private static comparisonAt(tokens: readonly string[], k: number): IncumbentComparison | null {
    const column = tokens[k];
    const op = tokens[k + 1];
    const num = tokens[k + 2];
    if (column === undefined || !IncumbentExpressions.isColumn(column)) return null;
    if (op === undefined || !IncumbentExpressions.isOp(op)) return null;
    if (num === undefined || !NUMBER.test(num)) return null;
    return { Column: column, Op: op, Value: Number(num) };
  }

  /** An identifier that is not one of the joiner keywords. */
  private static isColumn(t: string): boolean {
    return IDENT.test(t) && t !== 'and' && t !== 'or';
  }

  private static isOp(t: string): t is IncumbentComparison['Op'] {
    return OPS.some((o) => o === t);
  }

  /** The grammar's tokens, or null when the text holds anything that is not one. */
  private static tokenize(text: string): string[] | null {
    const out: string[] = [];
    let i = 0;
    while (text.slice(i).trim().length > 0) {
      TOKEN.lastIndex = i;
      const m = TOKEN.exec(text);
      if (m === null || m[1] === undefined) return null;
      out.push(m[1]);
      i = TOKEN.lastIndex;
    }
    return out;
  }

  private static holds(v: number, op: IncumbentComparison['Op'], x: number): boolean {
    switch (op) {
      case '>=': return v >= x;
      case '>': return v > x;
      case '<=': return v <= x;
      case '<': return v < x;
      case '==': return v === x;
      case '!=': return v !== x;
    }
  }
}
