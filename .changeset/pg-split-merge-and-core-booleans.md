---
"@memberjunction/sql-converter": minor
"@memberjunction/sql-dialect": minor
---

Fix three PostgreSQL conversion defects that each surfaced only when a converted migration was **applied**, not when it was converted — the converter reported "0 gaps" for all three.

**1. `MERGE` and `MATCHED` were read as identifiers.** Every other word in a `MERGE` statement was already in the quoting keyword sets — `USING`, `ON`, `WHEN`, `THEN`, `NOT`, `INSERT`, `UPDATE`, `SET`, `VALUES`, `AS` — so a converted `MERGE` came out as `"MERGE" __mj."X" AS tgt … WHEN "MATCHED" THEN UPDATE` and PostgreSQL rejected it with `syntax error at or near ""MERGE""`. Structurally the rest of the statement already transpiled to valid PG 15+ `MERGE`; these two tokens were the only thing wrong.

**2. `INTO` is optional in T-SQL's `MERGE` and required in PostgreSQL's.** `MERGE [dbo].[T] AS tgt` transpiled token-for-token into something PostgreSQL rejects at the *target name* rather than at `MERGE` — `syntax error at or near "__mj"`, pointing one token past the actual problem. The bare form is now rewritten to `MERGE INTO`. The rewrite is anchored to statement position so the word `MERGE` in a migration's own prose ("re-runnable: MERGE on fixed UUIDs") is not rewritten into "MERGE INTO on fixed UUIDs".

**3. BIT literals in entity-registration INSERTs on the `--split` path.** CodeGen registers a new entity by INSERTing into `Entity` / `EntityField` / `EntityPermission` — long-lived core-metadata tables that no migration re-creates, so the AST dialect never sees a `CREATE TABLE` for them, has no column types to infer, and emits a BIT literal as the integer it looks like. Applying the result failed with `column "IncludeInAPI" is of type boolean but expression is of type integer`. The rule-based (legacy) path already seeds this catalog through `createConversionContext`; the split path assembles its output from the transpiler directly and bypassed it, so **every** migration registering a new entity produced a file that failed on its first apply.

`assemblePgSQL` now applies the core-metadata boolean catalog. Ordering is load-bearing and was wrong in the first cut: the INSERT matcher keys on a `schema.Table` reference whose schema is word characters, so while the table is still `${flyway:defaultSchema}."Entity"` it matches nothing and the coercion silently no-ops. It runs **after** schema substitution, and a regression test pins that by asserting on a macro-carrying input. Rewriting is by ordinal position against known-boolean columns, so a non-boolean integer in the same tuple (`UserViewMaxRows`) and a table outside the catalog are both left alone.

Related but distinct from the `--bake-codegen` registry fix ("Seed the BIT/BOOLEAN registry from the live catalog"), which repaired the same class of failure on the bake path; this one repairs the split-assembly path, which bake cannot reach when a migration has a transpile gap.
