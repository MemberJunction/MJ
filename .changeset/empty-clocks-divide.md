---
"@memberjunction/codegen-lib": patch
---

Fix CodeGen view refresh failure when foreign key columns are dropped
Enhanced the `recompileAllBaseViews()` function to automatically detect and recover from view refresh
failures. When `sp_refreshview` fails due to dropped foreign key columns, the system now falls back
to regenerating the view definition using current schema, preventing cascading CodeGen failures and
metadata corruption.
