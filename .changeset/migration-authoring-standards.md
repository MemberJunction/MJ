---
"@memberjunction/standards": patch
---

Add two migration standards. `migration-existence-guards` flags `IF OBJECT_ID` / `IF COL_LENGTH` / `IF NOT EXISTS` (catalog) guards and `DROP … IF EXISTS` in the hand-written part of a migration. `readable-status-values` flags run-together and snake_case values in CHECK lists. Both read only migrations at or after a repo's `FromVersion` cutoff and skip CodeGen's appended output. Both are opt-in, like every standard.
