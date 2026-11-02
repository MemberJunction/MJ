---
"@memberjunction/global": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/integration-engine": patch
---

`SafeExpressionEvaluator` now allowlists identifiers instead of denying a fixed list, and field-rule / integration formulas go through the same screen before they compile (#5569, CodeQL #183, #184, #185).

- **Identifiers.** A free name must be an evaluation-context key, an arrow-function parameter in scope, `undefined`/`NaN`/`Infinity`, or an approved global (`APPROVED_EXPRESSION_GLOBALS`) used as a call. `fetch`, `setTimeout` and every other host global are refused, as are approved globals used as values or callbacks (`Math.PI`, `items.map(Number)`, `Object.assign`).
- **Callbacks.** `.some()`, `.every()`, `.find()`, `.filter()`, `.map()` and `.reduce()` take only an inline arrow function. Arrow functions are not allowed anywhere else. `JSON.parse`/`JSON.stringify` take only a literal or array literal as the reviver/replacer.
- **Context keys** must match `/^[A-Za-z_$][\w$]*$/`; any other key fails the evaluation. Function-valued properties of class instances are dropped from the cloned context.
- **New API.** `SafeExpressionEvaluator.ScreenExpression(expression, allowedIdentifiers)` screens without compiling. `ValidateSyntax` takes optional `contextKeys`.
- **Formulas.** `FieldTransformEngine` screens `formula` and `custom` expressions with `value` and `fields` as the only names. A rejected expression throws `Expression rejected: ...` and is handled by the step's `OnError` policy like a compile error.
- **Methods.** Added pure string/array/number methods to the safe-method list: `split`, `slice`, `substring`, `join`, `concat`, `charAt`, `at`, `padStart`, `padEnd`, `toFixed`, `toPrecision`.
- Unbalanced-parenthesis errors are reported only when the expression fails to parse, so a parenthesis inside a string literal no longer rejects it.
- Tests in `ai-core-plus` and `integration-engine` updated for the new rules (approved namespace methods are no longer readable as values; a malformed custom expression is now refused by the screen before `Function` is reached).
