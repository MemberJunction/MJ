---
"@memberjunction/server": patch
"@memberjunction/generic-database-provider": patch
---

Fix Explorer view/grid search returning 0 rows — or refusing outright — for ordinary search terms (#4392).

`UserSearchString` is not a SQL clause: it is the free text a person typed into a search box. It never reaches SQL as a fragment — `GenericDatabaseProvider.createViewUserSearchSQL` builds every predicate itself from `IncludeInUserSearchAPI` metadata and lands the text only inside a string literal, with single quotes doubled and LIKE metacharacters escaped under an explicit `ESCAPE`. Two screens intended for genuine SQL fragments were nonetheless applied to it, and each one rejected real searches:

- **`ResolverBase.screenClientViewClauses`** ran it through the GraphQL-boundary base-view AST screen, which wraps its argument as `SELECT 1 FROM x WHERE (<clause>)` and fails closed when that does not parse. `Marcus Chen` parsed as nothing and `O'Leary` as an unterminated literal, so both were refused; only terms that happened to be valid SQL survived — which made essentially every person-name search return 0 rows.
- **`GenericDatabaseProvider`** ran it through the `ValidateUserProvidedSQLClause` keyword denylist on both the view and count paths. Word-boundary-matched against free text, that refused `Union Pacific`, `Update Request` and `drop shipment`, along with any term containing `;`, `--`, `/*` or `xp_` — and the resulting error reached the grid with a null message, so the search box simply looked broken.

Both screens are removed from this one input. Every genuine clause fragment is still screened exactly as before: `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` keep the boundary AST screen, and they plus the rendered WHERE clause keep the provider denylist. Quote-doubling — not keyword matching — is the correct protection for a value that lands inside a literal, and unlike a denylist it never rejects a legitimate search.

Covered by regression tests at all three layers: the GraphQL boundary screen (`ResolverBase.filterEscaping.test.ts`), the generated search SQL (`createViewUserSearchSQL.test.ts`), and end-to-end over the real client transport (integration check `runview-matrix.RVM19`).
