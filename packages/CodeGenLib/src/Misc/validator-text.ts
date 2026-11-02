import ts from 'typescript';

/**
 * Turns a generated validator's text into source that can be written into a class.
 *
 * A model sometimes returns the whole function double-escaped, as one line with literal `\n`,
 * `\t` and `\"` sequences; those are turned into real characters. Text that has real line breaks
 * inside it (a break at either end does not count) is real source and is returned unchanged,
 * because there those sequences are escapes inside string and regular-expression literals, and
 * turning them into characters breaks the code.
 */
export function NormalizeGeneratedValidatorText(functionText: string): string {
  if (functionText.trim().includes('\n')) return functionText;
  return functionText.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
}

/** The equality operators a UUID comparison is rewritten from, mapped to whether the result is negated. */
const UUID_EQUALITY_OPERATORS: ReadonlyMap<ts.SyntaxKind, boolean> = new Map([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, false],
  [ts.SyntaxKind.EqualsEqualsToken, false],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, true],
  [ts.SyntaxKind.ExclamationEqualsToken, true],
]);

/** Name of the case-insensitive UUID comparison helper from `@memberjunction/global`. */
export const UUIDS_EQUAL_FUNCTION_NAME = 'UUIDsEqual';

/**
 * Rewrites `===` / `!==` / `==` / `!=` comparisons between UUID fields in a generated validator into
 * `UUIDsEqual(a, b)` / `!UUIDsEqual(a, b)` (#3984). A UUID can arrive in either casing depending on
 * how the row was loaded, so `===` lets a self-reference that differs only in case pass the
 * validator and fail on the database CHECK instead.
 *
 * A comparison is rewritten when one operand is `this.<field>` for a field in `uuidFieldNames` and
 * the other is another such field or a string literal. Anything else (a `null` guard, a non-UUID
 * field, a call) is left as written. Text that does not parse is returned unchanged.
 *
 * @param functionText - The validator method's source (a class member, signature included).
 * @param uuidFieldNames - Property names of the entity's UUID fields as the generated class exposes them.
 * @returns The rewritten source, or the input unchanged when nothing matched.
 */
export function RewriteUUIDComparisons(functionText: string, uuidFieldNames: ReadonlySet<string>): string {
  if (uuidFieldNames.size === 0 || !/[=!]=/.test(functionText)) return functionText;
  const prefix = 'class __Validator {\n';
  const wrapped = `${prefix}${functionText}\n}`;
  const sourceFile = ts.createSourceFile('validator.ts', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) return functionText;

  const isUUIDField = (node: ts.Expression): boolean =>
    ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword && uuidFieldNames.has(node.name.text);
  const isStringLiteral = (node: ts.Expression): boolean => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

  const edits: { Start: number; End: number; Text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const negate = UUID_EQUALITY_OPERATORS.get(node.operatorToken.kind);
      const left = node.left;
      const right = node.right;
      const matches = (isUUIDField(left) && (isUUIDField(right) || isStringLiteral(right))) || (isStringLiteral(left) && isUUIDField(right));
      if (negate !== undefined && matches) {
        const call = `${UUIDS_EQUAL_FUNCTION_NAME}(${left.getText(sourceFile)}, ${right.getText(sourceFile)})`;
        edits.push({ Start: node.getStart(sourceFile), End: node.getEnd(), Text: negate ? `!${call}` : call });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (edits.length === 0) return functionText;

  let result = wrapped;
  for (const edit of edits.sort((a, b) => b.Start - a.Start)) {
    result = result.slice(0, edit.Start) + edit.Text + result.slice(edit.End);
  }
  return result.slice(prefix.length, result.length - 2);
}
