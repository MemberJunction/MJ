/**
 * Linear-time helpers for normalizing SQL text before it is embedded in a larger statement or
 * appended to a CodeGen migration log.
 *
 * Why not regex: SQL here is often caller- or configuration-supplied (a `TransitiveView` body, a
 * generated routine), and the obvious patterns — `/[\s;]+$/` to trim, `/(^|\n)\s*GO\s*$/` to detect a
 * trailing batch separator — backtrack quadratically on a long whitespace run that is not at the end
 * of the string (CodeQL js/polynomial-redos). A 200,000-character run took ~32s. These scans are
 * O(n) for any input.
 */

/** True for the characters `\s` matches in the regexes these helpers replace. */
function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/** Strips trailing whitespace and `;` statement terminators. */
export function TrimTrailingStatementTerminators(sql: string): string {
  let end = sql.length;
  while (end > 0 && (sql[end - 1] === ';' || isWhitespace(sql[end - 1]))) {
    end--;
  }
  return sql.slice(0, end);
}

/** @deprecated Use {@link TrimTrailingStatementTerminators}. */
export function trimTrailingStatementTerminators(sql: string): string {
  return TrimTrailingStatementTerminators(sql);
}

/**
 * True when the last non-blank line of `text` is exactly `separator` (case-insensitive, surrounding
 * whitespace ignored) — e.g. a unit that already closes its own T-SQL batch with `GO`.
 */
export function EndsWithBatchSeparatorLine(text: string, separator: string): boolean {
  if (!separator) {
    return false;
  }
  let end = text.length;
  while (end > 0 && isWhitespace(text[end - 1])) {
    end--;
  }
  const lineStart = text.lastIndexOf('\n', end - 1) + 1;
  return text.slice(lineStart, end).trim().toUpperCase() === separator.trim().toUpperCase();
}

/** @deprecated Use {@link EndsWithBatchSeparatorLine}. */
export function endsWithBatchSeparatorLine(text: string, separator: string): boolean {
  return EndsWithBatchSeparatorLine(text, separator);
}
