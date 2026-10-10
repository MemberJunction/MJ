---
"@memberjunction/server": patch
"@memberjunction/actions": patch
"@memberjunction/core-actions": patch
"@memberjunction/database-designer-actions": patch
"@memberjunction/rubrics": patch
---

Security: the `RunAction` mutation now authorizes each action. Scope-limited sessions (magic-link and widget guests, resource-scoped links) are refused. An Owner may run any action. Any other user needs a role that holds an authorization linked to the action through `MJ: Action Authorizations`; an inactive or denied linked authorization grants nothing, even through its parent. An action with no such link runs only when its class authorizes its caller itself (`BaseAction.AuthorizesCaller`, declared by the Database Designer, rubric and interactive-form actions). The client can no longer switch off the action execution log (`SkipActionLog` is ignored).

`Calculate Expression` now evaluates with a number-only math parser (mathjs 15.2.0) and an allowlist of operators, functions and constants instead of `new Function`, and `Conditional` evaluates with `SafeExpressionEvaluator`. `Run Ad-hoc Query` applies the same checks as `ExecuteAdhocQuery`: it refuses scope-limited sessions, runs only on the read-only database login, and its SQL must pass `ExecuteAdhocQuery`'s table check and timeout limit. MJServer registers both with the action engine at startup (`ActionEngineServer.SetReadOnlyProviderFactory`, `SetAdhocSQLAuthorizer`); without them the action refuses.
