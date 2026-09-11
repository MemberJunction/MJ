---
"@memberjunction/core": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/materialization": patch
"@memberjunction/codegen-lib": patch
---

Review follow-ups to #4358 and #4366.

- `EntityPermissionInfo.IsDeny` — one predicate for "this is a Deny row" (case- and whitespace-insensitive; blank Type is Allow), used by `GetUserPermisions` and now by both RLS readers: `UserExemptFromRowLevelSecurity` and `GetUserRowLevelSecurityInfo` skip Deny rows, so a set `Can*` flag on a Deny row is never read as a grant. Unreachable in practice (a user carrying a Deny row fails the permission gate first), but the methods now implement the invariant their docs state. Tests cover the Deny axis with typed builders.
- The materialization leak gate's comments no longer claim parity with the runtime RLS reader; they say the gate is deliberately wider.
- Input dialog: `box-sizing: border-box` parity with the rating dialog. The dialog container documents its contract — component bodies pad themselves.
