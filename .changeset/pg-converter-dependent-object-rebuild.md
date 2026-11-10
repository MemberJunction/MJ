---
"@memberjunction/sql-converter": patch
---

The converter's view rebuild and column type changes now capture and restore dependent views, the functions that return them, and their grants; ALTER COLUMN keeps the type change on PostgreSQL, and the rebuild finds a table written with or without brackets.
