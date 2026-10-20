---
"@memberjunction/sql-dialect": patch
"@memberjunction/ng-explorer-core": patch
---

Fix two ways interactive components fail to open entity records.

- **sql-dialect** — PostgreSQL `tsvector` and `tsquery` are now string types. They were missing
  from the list, so CodeGen typed the `__mj_fts_vector` column that full-text search adds as a
  GraphQL `Int`. Once the trigger fills it, the value is text, and every load of that entity's
  records fails with `Int cannot represent non-integer value`. Re-run CodeGen to regenerate the
  affected entities.
- **ng-explorer-core** — the standalone artifact tab (`ArtifactResource`) now handles the viewer
  panel's `openEntityRecord` and `navigationRequest` events, as the conversation view already does.
  Before, a component's `OpenEntityRecord` call in a shared artifact tab did nothing, with no
  console output.
