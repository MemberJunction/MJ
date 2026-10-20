---
"@memberjunction/sql-converter": patch
"@memberjunction/cli": patch
"@memberjunction/codegen-lib": patch
---

PostgreSQL migration conversion fixes found while converting the v6.2.0-edge.2 migrations.

- sql-converter: BIT literals in `INSERT INTO t (...) SELECT ...` (CodeGen's EntityPermission grants) and in `COALESCE(<boolean column>, 0|1) = 0|1` (CodeGen's search-flag hygiene) are rewritten to TRUE/FALSE.
- cli: `migrate convert --bake-codegen` and `migrate rebake` disable SQLOutput while baking, so CodeGen's no-artifact guard no longer silently refuses the capture's metadata SQL; forward baking now applies the captured CodeGen to the working database (the generator never executed it), so later migrations bake against the objects earlier ones created.
- codegen-lib: a layered entity's base-view GRANTs are guarded once, not twice (the nested `DO $if_view_exists$` did not parse on PostgreSQL); the PostgreSQL view-regeneration fallback now restores dependents of dependents and their functions after DROP ... CASCADE.
