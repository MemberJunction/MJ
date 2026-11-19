---
'@memberjunction/react-linter': patch
---

The `required-when` constraint validator evaluates its condition with `SafeExpressionEvaluator`, with `siblingProp` as the only name in scope. A condition that the evaluator does not accept is treated as not met and reported as an `unsupported-condition` violation.
