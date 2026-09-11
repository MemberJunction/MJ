---
"@memberjunction/server": patch
"@memberjunction/generic-database-provider": patch
---

Fix Explorer view/grid search returning 0 rows — or refusing outright — for ordinary search terms (#4392).

`UserSearchString` is not a SQL clause: it is the free text a person typed into a search box. It normally never reaches SQL as a fragment — `GenericDatabaseProvider.createViewUserSearchSQL` builds every predicate itself from `IncludeInUserSearchAPI` metadata and lands the text only inside a string literal, with single quotes doubled and LIKE metacharacters escaped under an explicit `ESCAPE`. Two screens intended for genuine SQL fragments were nonetheless applied to it, and each rejected real searches:

- **`ResolverBase.screenClientViewClauses`** ran it through the GraphQL-boundary base-view AST screen, which wraps its argument as `SELECT 1 FROM x WHERE (<clause>)` and fails closed when that does not parse. `Marcus Chen` parsed as nothing and `O'Leary` as an unterminated literal, so both were refused; only terms that happened to be valid SQL survived — which made essentially every person-name search return 0 rows.
- **`GenericDatabaseProvider`** ran it through the `ValidateUserProvidedSQLClause` keyword denylist on the view and count paths. Word-boundary-matched against free text, that refused `Union Pacific`, `Update Request` and `drop shipment`, along with any term containing `;`, `--`, `/*` or `xp_` — and the error reached the grid with a null message, so the search box simply looked broken.

Both screens are removed from this one input. Every genuine clause fragment is screened exactly as before: `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` keep the boundary AST screen, and they plus the rendered WHERE clause keep the provider denylist.

**One exception, deliberately retained.** A field carrying `UserSearchParamFormatAPI` splices the term into an admin-authored format that may place `{0}` *outside* quotes (` = {0}` on a numeric field is a supported configuration). There the term is not confined to a literal, so `createViewUserSearchSQL` re-applies `ValidateUserProvidedSQLClause` — but only when such a field will actually participate in the search, which means a field excluded by field-level security does not trigger it. Entities without such a field are unaffected.

**Full-text search behavior change.** For `FullTextSearchEnabled` entities, the boolean-operator detection in the full-text branch is now word-boundary based rather than substring based. Previously `OR` matched inside "c**or**porate" and `AND` inside "st**and**ard", so ordinary two-word searches were emitted with `%` joins (`Corporate%Office`) — not valid full-text syntax. They are now joined correctly (`Corporate AND Office`). Multi-word terms only began reaching this branch once the boundary screen stopped refusing them, so without this the fix would not have applied to full-text entities. Deployments relying on the previous `%`-joined output should re-check their full-text searches.

Covered by regression tests at the GraphQL boundary (`ResolverBase.filterEscaping.test.ts`), in the generated search SQL including the custom-format and field-level-security interactions (`createViewUserSearchSQL.test.ts`), and end-to-end over the real client transport (integration check `runview-matrix.RVM19`).
