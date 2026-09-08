---
"@memberjunction/codegen-lib": patch
---

Fix two PostgreSQL-only defects that made IS-A (Table-Per-Type) inheritance silently do nothing on PostgreSQL. Both were caught-and-logged, so CodeGen ran to completion with a zero exit code while every declared IS-A relationship was skipped — the end state was an entity that registered and queried normally but had `Entity.ParentID` NULL, no mirrored parent fields, no parent JOIN in its base view, and a `Save()` that never wrote the parent row.

1. **`processISARelationshipConfig` could not look up entities at all.** The lookup used `(@SchemaName IS NULL OR SchemaName = @SchemaName)`; the parameter's only unambiguous use is `IS NULL`, so PostgreSQL had no type to infer and failed to prepare the statement — `could not determine data type of parameter $2`. Every `ISARelationships` entry in `additionalSchemaInfo` was therefore skipped with a logged error. The predicate is now composed conditionally (emitted, with its parameter, only when a schema is declared), which is portable to both dialects without a cast.

2. **`manageSingleEntityParentFields` threw before mirroring any field.** Its `EntityField` read and update referenced mixed-case columns unquoted — `SELECT ID, IsVirtual, Type, Length, …` — which PostgreSQL folds to lower case: `column "length" does not exist`. All identifiers now go through `qi()`.

SQL Server was unaffected by both (it infers the parameter type from the other side of the `OR`, and resolves identifiers case-insensitively), which is why this survived: the only shipping consumer of IS-A authors T-SQL first and had exercised it exclusively on SQL Server.

Adds `isa-postgres-portability.test.ts`, which composes the SQL through real `PostgreSQLDialect` and `SQLServerDialect` instances and asserts the contracts directly: no parameter is ever emitted whose only use is `@p IS NULL`, every placeholder in the composed SQL is bound, the Name-then-BaseTable match order is preserved, each dialect's row limit is honoured, and every mixed-case `EntityField` identifier survives quoting with its case intact.
