---
"@memberjunction/codegen-lib": minor
---

CodeGen now emits a composite index over an entity's **soft** primary key, closing a gap where nothing in the stack ever indexed one.

A soft PK exists only in metadata — `IsPrimaryKey` and `IsSoftPrimaryKey` both set, with no `PRIMARY KEY` constraint and no unique index on the table. Integration tables are built that way deliberately, because their keys are *inferred* and a constraint would reject valid rows whenever an inference is wrong.

The cost of that choice landed on MJ's own write path. A create calls `InnerLoad` on the key to check for an existing row; a genuinely new record matches nothing; and a not-found lookup cannot short-circuit, so it scans the entire heap before concluding the row is absent. Every create scans the whole table, the table grows, and the scan grows with it — so a sync decays as it runs. Measured live at 345 → 574 → 864 ms per record across consecutive batches of one connector, with nothing saturated (DB CPU 57%, log write 13%, sessions 0, app CPU 5.7%, memory flat).

Three mechanisms each declined to cover it: the integration DDL generator emits no index on the key columns; `generateForeignKeyIndexes` skips primary keys on the reasoning that "a primary key is already covered by its own index" (true for a real PK, false by definition for a soft one); and the missing-index probe reads `sys.foreign_keys`, which these tables have none of.

- One **non-unique composite** index in ordinal order, since the lookup is an equality match on the whole key and uniqueness is exactly what the soft-PK design refuses to assert.
- Idempotent (`IF NOT EXISTS` / `sys.indexes` check), so it **backfills existing tables** on the next codegen pass rather than only covering newly created ones.
- A key column the dialect cannot index (an unbounded string — `Length: -1`) produces an explanatory comment in the generated file naming the offending column, never a silently absent index.
- New `auto_index_soft_primary_keys` setting, defaulting to `true`. Deliberately separate from `auto_index_foreign_keys`: an opinion about indexing foreign keys for joins and filters is not an opinion about the engine's own per-record existence check.

No effect on entities with a real primary key, which is nearly all of them.
