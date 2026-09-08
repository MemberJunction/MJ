---
"@memberjunction/server": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core": patch
"@memberjunction/ng-react": patch
---

Harden several SQL text-building paths that substituted values into query strings without parameterization or escaping.

**`@memberjunction/server`** — `ReportResolver.CreateReportFromConversationDetailID` built its `WHERE` clause via direct string interpolation of the `ConversationDetailID` argument. It now binds the value through `mssql`'s parameterized `request.input(...)` as a `UniqueIdentifier`, consistent with the parameterization pattern already used elsewhere in the package, and gets GUID-format validation as a side effect.

**`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.CheckRecordRLS` built its primary-key `WHERE` clause without escaping embedded quotes in the key value, unlike the sibling `Load()` path a few lines above, which already escapes. The RLS-check path now mirrors `Load()`'s escaping so a primary key value containing a quote can't alter the query's structure.

**`@memberjunction/core`** — `RowLevelSecurityFilterInfo.MarkupFilterText` did two things that could weaken a row-level security filter: it let `undefined` user-property values through as the literal string `"undefined"`, and it never escaped quotes in substituted values. Both are fixed — `undefined` now falls through to the existing unresolved-token handling (same as `null` and object-typed values already did), and substituted values now have embedded single quotes doubled.

Behavior note for deployments with existing role-based RLS filters: equality-style filters (`Col = '{{UserX}}'`) are unaffected. Filters written in negation form (`<>`, `NOT IN`, `NOT LIKE`) against a user property that can be `undefined` previously matched more rows than intended (a permissive gap) and will now correctly match fewer — reviewed as: users may see fewer rows than before the upgrade, which is the deliberate direction of this fix, not a new restriction to work around.

**`@memberjunction/ng-react`** — `RuntimeUtilities.provider` was initialized directly from the global `Metadata.Provider` at class-field scope. The value was always overwritten before use by `buildUtilities()`'s existing `provider ?? Metadata.Provider` fallback, so this is a no-behavior-change cleanup that stops the class body from touching the global provider directly.
