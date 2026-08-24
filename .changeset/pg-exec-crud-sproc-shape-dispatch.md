---
"@memberjunction/sql-converter": patch
---

Fix converted metadata-sync migrations calling PostgreSQL CRUD sprocs in the wrong argument shape, which made a release fail to apply on PostgreSQL with `function __mj.spUpdateEntity(...) does not exist`.

MJ emits CRUD sprocs in one of two shapes. Narrow entities get typed arguments plus a `<Col>_Clear` companion per nullable column; entities whose projected parameter count reaches `POSTGRESQL_PROCEDURE_PARAM_LIMIT` (90) get a single `p_data JSONB` argument instead, because PostgreSQL caps a function at 100 arguments. `ExecBlockRule` chose between the two by counting the arguments **of the call it was converting**.

That is the wrong quantity. The shape is a property of the *function*, and a call is not a reliable witness to it:

- A T-SQL `EXEC` may omit parameters that carry defaults, so a call can be narrower than the procedure it targets.
- CodeGen decides JSON-arg from the entity's *projected* parameter count, which counts `_Clear` companions no call is obliged to pass.

Adding `Entity.Configuration` in v6.1.0-edge.3 landed `MJ: Entities` squarely in the resulting gap. CodeGen projected 90 and emitted `spUpdateEntity(p_data JSONB)` — dropping every typed-arg overload as it did so — while `__mj.spUpdateEntity` on SQL Server has 93 parameters and the single `EXEC` in that release's metadata sync passes 89. Deciding from 89 emitted a typed-arg call against a function that now accepts only JSONB. Nothing in the converted output looked wrong; `mj migrate` simply died on the sync migration, 12,000 lines from the cause.

No amount of threshold tuning fixes this. `>=` instead of `>` does not help (89 is still below 90), and the converter cannot reproduce CodeGen's projection: a metadata-sync file contains only `EXEC`s, never a `CREATE PROCEDURE`, and `ConversionContext` carries neither procedure arities nor column nullability. Any constant chosen here is a guess that drifts the next time an entity gains a column.

So the converter no longer guesses. When the call count does not settle the shape, it emits **both** calls under a `pg_proc` lookup that resolves the shape at apply time:

```sql
IF EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = '__mj' AND p.proname = 'spUpdateEntity'
     AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
) THEN
  PERFORM __mj."spUpdateEntity"(p_data := jsonb_build_object(...));
ELSE
  PERFORM __mj."spUpdateEntity"(p_ParentID := ..., ...);
END IF;
```

This is correct against either shape and stays correct as entities widen, which a threshold cannot. Only the taken branch is ever planned — PL/pgSQL plans a statement on first execution, not when the enclosing `DO` block is compiled — so the untaken branch's call does not need to resolve. Calls that exceed the limit on their own are unchanged: no typed-arg function can exist at that width, so they still emit JSON-arg unconditionally with no lookup.

The `_Clear` handling is unchanged and differs per branch by design: the JSON branch drops those flags, because in JSON-arg shape a present key already means "set this column" — the full-record semantics metadata sync expresses — while the typed branch still passes them.

Verified end to end: the full v6.1.0-edge.3 migration set (63 migrations) applies to a fresh `postgres:17` database and `mj sync push` then writes 13,849 records with zero errors. New `ExecBlockRule` tests cover the boundary, both branches, and the `_Clear` asymmetry; the 216-case historical conversion suite is unchanged.
