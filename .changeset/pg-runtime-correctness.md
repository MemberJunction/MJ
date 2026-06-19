---
"@memberjunction/codegen-lib": minor
"@memberjunction/open-app-engine": patch
"@memberjunction/postgresql-dataprovider": patch
---

PostgreSQL runtime correctness, found during fresh-DB PG end-to-end testing:

- **codegen-lib**: clean MJAPI engine load on PostgreSQL — `AutoUpdatePath` written as a
  dialect-correct boolean literal, plus a PG-only migration removing orphan related-entity-name
  virtual EntityField rows whose column the generated PG base view never emits (these crashed
  EntityActionEngine / AI Credential Bindings / Scheduling with `column "..." does not exist`).
- **open-app-engine**: app uninstall now deletes all FK-dependent metadata (Entity Field Values,
  Entity Settings) in dependency order and reports a real failure instead of swallowing errors
  into a false "success".
- **postgresql-dataprovider**: dialect-correct per-field entity-search predicate (no `N'...'`
  literal prefix, no `ESCAPE` clause) — fixes `syntax error at or near "ESCAPE"` on live search.
