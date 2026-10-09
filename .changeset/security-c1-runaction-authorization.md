---
"@memberjunction/server": patch
"@memberjunction/actions": patch
"@memberjunction/core-actions": patch
---

Security: the `RunAction` mutation now authorizes each action. Scope-limited sessions (magic-link and widget guests, resource-scoped links) are refused. An Owner may run any action; any other user needs a role that holds an authorization linked to the action through `MJ: Action Authorizations`, and an action with no such link runs for Owners only. The client can no longer switch off the action execution log (`SkipActionLog` is ignored).

`Calculate Expression` now evaluates with a number-only math parser and an allowlist of operators, functions and constants instead of `new Function`, and `Conditional` evaluates with `SafeExpressionEvaluator`. `Run Ad-hoc Query` applies the same gates as `ExecuteAdhocQuery`: it refuses scope-limited sessions and runs only on the read-only database login, through the provider's single-read-statement path; with no read-only login configured it refuses. MJServer registers the read-only provider with the action engine at startup (`ActionEngineServer.SetReadOnlyProviderFactory`).
