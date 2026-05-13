---
"@memberjunction/core-actions": minor
---

Thread per-call multi-tenant `SearchContext` through the `__Scoped_Search` action. Two new optional inputs — `PrimaryScopeRecordID` (string UUID) and `SecondaryScopes` (JSON object of dimension-name → value) — get assembled into a `SearchContext` and passed to `SearchEngine.Search()`. The engine renders them into the scope's Nunjucks `MetadataFilter` / `ExtraFilter` / `UserSearchString` / `FolderPath` at search time, so a single `MJ: Search Scope` definition can serve many tenants without per-tenant scope clones. `SecondaryScopes` values are validated against `string | number | boolean | string[]` — incompatible entries are dropped with a log rather than failing the call. Guide and class-level JSDoc updated.
