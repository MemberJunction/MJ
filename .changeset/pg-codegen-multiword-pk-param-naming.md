---
"@memberjunction/codegen-lib": patch
"@memberjunction/postgresql-dataprovider": patch
---

Fix PostgreSQL CRUD save/update/delete/cascade failing on entities whose primary key has a multi-word (camelCase/PascalCase) name.

The PG CodeGen provider declared CRUD function parameters with the canonical flat builder (`ParameterRef` → `p_<lower>`, e.g. `p_recordkey`) but *referenced* the primary key in several body clauses via `toSnakeCase` (`p_record_key`). Because `toLowerCase()` and `toSnakeCase()` produce the *same* string for single-word/`ID` keys, this was invisible on every `ID`-keyed entity — but a table keyed on a multi-word soft-PK (e.g. a connector's `recordKey`) generated a function that declared `p_recordkey` and referenced `p_record_key`, so every save/update/delete failed on PostgreSQL with `column "p_record_key" does not exist`.

All parameter names now route through the single `ParameterRef` builder in both `PostgreSQLCodeGenProvider` (create/update/delete/cascade bodies) and `PostgreSQLDataProvider` (the save-call binding). This is a no-op for `ID`/single-word keys and fixes multi-word keys. Regenerate CRUD functions (`mj codegen`) after upgrading to apply the fix — no data migration required.
