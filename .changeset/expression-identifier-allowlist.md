---
"@memberjunction/global": patch
"@memberjunction/integration-engine": patch
---

Security fix in `SafeExpressionEvaluator` and field-rule / integration formula expressions (backport of #5583). Adds `SafeExpressionEvaluator.ScreenExpression(expression, allowedIdentifiers)`, `APPROVED_EXPRESSION_GLOBALS`, and an optional `contextKeys` argument to `validateSyntax`.
