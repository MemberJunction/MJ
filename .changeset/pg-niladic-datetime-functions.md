---
"@memberjunction/sql-dialect": patch
---

Fix PostgreSQL auto-quoting of `CURRENT_DATE` and the other niladic datetime/identity functions.

`AutoQuotePostgreSQLIdentifiers` rewrote a bare `CURRENT_DATE` into `"CURRENT_DATE"`, which PostgreSQL then rejects with `column "CURRENT_DATE" does not exist`. These functions are spelled without parentheses, so the word-before-`(` rule never classified them as functions, and they were absent from `PostgreSQLQuotingKeywords` — `CURRENT_TIMESTAMP`, `CURRENT_USER` and `SESSION_USER` were already listed, but their siblings were not.

Added to the keyword set: `CURRENT_DATE`, `CURRENT_TIME`, `LOCALTIME`, `LOCALTIMESTAMP`, `CURRENT_CATALOG`, `CURRENT_ROLE`, `CURRENT_SCHEMA`.

This only exempts the ALL-CAPS spelling, so a mixed-case column such as `Current_Date` still quotes normally — the baseline column guard verifies no shipped column collides.

The reverse guard in `postgresqlAutoQuote.baseline.test.ts` was itself missing these words from its reserved-word oracle, which is why the gap went undetected; it has been extended so the same class of omission fails the build. `USER` is deliberately left out of both: it is reserved in PostgreSQL, but it is a believable ALL-CAPS identifier in customer schemas this repo's baseline cannot see, and nothing in MJ emits a bare `USER`.

Surfaced in production by a generated query against a PostgreSQL client that used `CURRENT_DATE` in a date predicate.

## Same defect class, found by audit rather than by the next outage

Running realistic PostgreSQL through the tokenizer showed `CURRENT_DATE` was one instance of a broad gap: **45 of 53 common constructs** came back corrupted. Every one hinges on a word that is not followed by `(`, which is the only position rule 3 can rescue. Also added:

- **Ordered-set aggregates and window frames** — `WITHIN`, `ORDINALITY`, `GROUPING`, `SETS`, `ROLLUP`, `CUBE`, `GROUPS`, `EXCLUDE`, `TIES`. `WITHIN` is the sharpest: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` is how every median is written, and it became `… "WITHIN" GROUP …`.
- **The rest of PostgreSQL's reserved words** — `LEADING`, `TRAILING`, `PLACING`, `SYMMETRIC`, `ASYMMETRIC`, `NOTNULL`, `NATURAL`, `SIMILAR`, `VERBOSE`, `ANALYZE`, `ANALYSE`, `FREEZE`, `OVERLAPS`, `AUTHORIZATION`, `BINARY`, `COLLATION`. Being reserved is what makes these unconditionally safe: PostgreSQL will not resolve a same-named column bare either, so nothing can be shadowed.
- **Type names in cast position** — `CHARACTER`, `VARYING`, `BOOL`, `INT2`/`INT4`/`INT8`, `FLOAT4`/`FLOAT8`, `BPCHAR`, `TIMETZ`, `TSVECTOR`, `TSQUERY`, `SMALLSERIAL`, `VARBIT`, `JSONPATH`. `DOUBLE PRECISION` worked only because both halves happened to be listed; `CHARACTER VARYING` did not.
- **Utility statement verbs** — `REFRESH`, `TRUNCATE`, `EXPLAIN`, `VACUUM`, `REINDEX`, `UNLOGGED`, `PREPARE`, `DEALLOCATE`, plus `ESCAPE`, `UNKNOWN`, `NOWAIT`, `LOCKED`, `CASCADED`, `RESTART`, `STORED`, `OWNED`, `INCLUDING`, `EXCLUDING`, `INHERITS`, `INCREMENT`, `MINVALUE`, `MAXVALUE`, `CYCLE`.

`ORDINALITY` is worth calling out: `postgresqlDialect.ts` (`ForeignKeyGraphSQL`) and `crossDialect.test.ts` both carry comments saying they *deliberately avoid* `unnest(...) WITH ORDINALITY` because this tokenizer quoted it. That workaround can now be retired.

Seventeen non-reserved words are deliberately excluded on the same reasoning as `USER` — `LEVEL`, `MODE`, `OPTION`, `SHARE`, `START`, `CACHE`, `ROLE`, `PASSWORD`, `LOGIN`, `DOMAIN`, `CLUSTER`, `POLICY`, `SEQUENCE`, `LOCAL`, `SKIP`, `EXCLUSIVE`, `SOURCE`. All are legal bare column names in PostgreSQL and believable in a customer schema, and MJ emits none of them through `ExecuteSQL`. A test asserts they stay quoted so the exclusion is deliberate rather than incidental.

The reserved-word oracle in the baseline test is now transcribed in full rather than sampled, since sampling is precisely what let `CURRENT_DATE` through.
