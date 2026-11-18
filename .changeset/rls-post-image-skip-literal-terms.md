---
"@memberjunction/generic-database-provider": patch
---

`TryExtractSimpleFilterColumns` now matches its documented `column <op> literal` shape: a term whose right side is not a string, a number or NULL is no longer treated as simple, so the Update post-image row-level security check runs its query for it.
