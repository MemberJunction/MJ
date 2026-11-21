---
'@memberjunction/react-linter': patch
---

The `required-when` constraint validator accepts only a narrow condition grammar (comparisons of `siblingProp` with literals, `&&`, `||`, `!`, `typeof`, and `[<literals>].includes(siblingProp)`, at most 300 characters) and evaluates it with `SafeExpressionEvaluator`, with `siblingProp` as the only name in scope. Any other condition is treated as not met and reported as an `unsupported-condition` violation.
