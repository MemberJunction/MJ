---
"@memberjunction/generic-database-provider": patch
---

Applying a `MaxRows` cap no longer rewrites the caller's SQL on PostgreSQL.

`QueryPagingEngine.applyMaxRowsViaAST` injected the row cap by calling `SetOuterCap` and then re-emitting the entire statement with `SQLParser.ToSQL()`. That is an AST round-trip, and `node-sql-parser` normalizes as it generates — keywords come back upper-cased and identifiers re-quoted. Appending one clause should not rewrite the statement around it.

On SQL Server the normalization is invisible. On PostgreSQL it is a correctness bug, because the provider's identifier auto-quoter runs afterwards over the now-upper-cased statement and quotes any keyword missing from its allowlist:

```
caller wrote:   ORDER BY x ASC nulls last
ToSQL emitted:  ORDER BY x ASC NULLS LAST
auto-quoted to: ORDER BY x ASC "NULLS" "LAST"
PostgreSQL:     syntax error at or near ""NULLS""
```

The round-trip also rewrote `cp."recordKey"` to `"cp"."recordKey"` and `::integer` to `::INTEGER`.

Found in production alongside the auto-quoter keyword gaps fixed in `@memberjunction/sql-dialect`. The two are independent halves of the same failure: completing the keyword list makes the upper-cased output harmless, while this makes the output stop changing in the first place — which matters for every caller whose SQL has to survive a cap, not only those using a keyword the allowlist happened to miss.

Where a trailing `LIMIT N` is provably equivalent to the AST injection — a plain `SELECT` with no existing cap, on a dialect that caps with a suffix, and with no `OFFSET` / `FETCH` / `FOR UPDATE`-style clause that must follow `LIMIT` — the cap is now appended as text and the statement is left byte-identical. Every other shape falls through to the existing AST path unchanged, so this narrows the blast radius without altering any result.

Deliberately **not** switched to the existing `outerWrap` fallback, which is also text-preserving. Wrapping puts the cap above a subquery's `ORDER BY`, where PostgreSQL does not guarantee the inner ordering survives, so a "top 100 by rank" query could return an arbitrary 100. Inline injection is the semantically correct path and stays the default.

SQL Server is unaffected: `TOP N` is a prefix that has to sit between `SELECT` and the select list, a position no append can reach, so it continues to use the AST path.
