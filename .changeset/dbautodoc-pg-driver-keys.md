---
"@memberjunction/db-auto-doc": patch
---

The PostgreSQL driver reads foreign keys correctly and its value-overlap check runs.

- **Composite foreign keys are paired by position (#4531).** Foreign keys were read by joining `information_schema.key_column_usage` to `constraint_column_usage` on the constraint name, and neither view says which source column pairs with which referenced column. A 3-column composite key came back as 9 pairs, and every pair reached `additionalSchemaInfo.json`. The driver now reads `pg_constraint` and pairs `conkey[i]` with `confkey[i]`, as MJ's own `vwForeignKeys` does.
- **Cross-schema foreign keys are kept.** The same query joined `constraint_column_usage` on the source table's schema, but that view's `table_schema` is the referenced table's schema, so every foreign key into another schema was dropped.
- **The value-overlap check runs.** `testValueOverlap` put `ORDER BY RANDOM()` on a `SELECT DISTINCT`, which PostgreSQL rejects. The error came back as 0% overlap, and the FK detector's 75% overlap gate rejected every statistically found foreign key, so on PostgreSQL every foreign key came from the LLM unchecked. The sample is now a plain `DISTINCT … LIMIT`, as on SQL Server (randomising would sort every distinct value per FK candidate), both sides are compared as text so a key stored as text can be checked against a `uuid` column, and a failed check is logged instead of being silently reported as 0%.
