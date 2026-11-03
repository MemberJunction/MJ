---
"@memberjunction/server": patch
"@memberjunction/sql-parser": patch
"@memberjunction/ng-dashboard-viewer": patch
---

Follow-up hardening and unit tests for TestQuerySQL and dashboard WebURL panels:

- **SQLParser niladic user functions (`@memberjunction/sql-parser`)**: Support standard SQL niladic user functions (`CURRENT_USER`, `SESSION_USER`, `SYSTEM_USER`) without parentheses in both `TransactSQL` and `PostgresQL` dialects and round-trip via `ToSQL()` without `()`, fixing `TestQuerySQL` read-only authorization (`RRC5`) on queries selecting `CURRENT_USER`.
- **TestQuerySQLResolver (`@memberjunction/server`)**: Pass `OriginalSQL: input.SQL` to `RenderPipeline.Run`, use `context.userPayload?.userRecord`, and add unit tests covering read-only authorization and niladic user functions.
- **WebURLPartComponent (`@memberjunction/ng-dashboard-viewer`)**: Reset `ErrorMessage` on reload, clear `loadCheckTimeout` in `cleanup()`, add `rel="noopener noreferrer"` on external panel links, and add unit test coverage.
