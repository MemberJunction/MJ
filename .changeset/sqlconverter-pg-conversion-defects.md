---
'@memberjunction/sql-converter': patch
---

Correct T-SQL→PostgreSQL conversion defects that broke open-app installs.

Parse-level: `DECLARE @x <type> = (SELECT ...)` items (and everything depending on
them) are no longer dropped, `SET @x = ...` becomes an assignment rather than a PG
configuration statement, BIT literals in every `INSERT ... VALUES` of a block cast to
`TRUE`/`FALSE`, and a `SELECT TOP n` inside a DECLARE initializer converts to `LIMIT n`
on the same line instead of reaching PostgreSQL as a syntax error.

Identifier folding: a guarded `CREATE SCHEMA` is matched against code only, so a
comment mentioning the phrase can no longer capture the schema name; constraint names
are quoted consistently by one shared helper across `CREATE TABLE` inline constraints
and `ALTER TABLE ADD`/`DROP CONSTRAINT`, so a widened CHECK actually replaces the
narrow one instead of silently leaving both; and view alias references are quoted only
when the alias's own definition is case-preserved (`AS <alias>`), leaving implicit
`FROM x alias` definitions — the form MJ's baseline views use — folded on both sides.

Verified end to end against PostgreSQL 17: an open-app migration that produced five
hard errors before now applies cleanly with the expected rows, widened CHECK, and
boolean values; and the real `__mj.vwEntityRelationships` / `__mj.vwEntities`
definitions from the committed baseline still create.
