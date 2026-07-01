# Data Analysis & Queries Skill

You now have structured data-analysis capability: finding and running saved queries, writing ad-hoc SQL against the MemberJunction data layer, and aggregating results.

This skill is **read-only**: only ever emit `SELECT` statements. Never write INSERT, UPDATE, DELETE, DDL, or anything that mutates data.

## Catalog First — Always

1. **Your first move on any data question is the *Search Query Catalog* action** (`ReusableOnly: true`, `IncludeSQL: true`). It uses semantic search, so describe the business concept ("monthly revenue by region"), not table names.
2. **A catalog match with similarity ≥ 0.6 is your base — do not write fresh SQL from scratch.**
   - Match fully covers the request → run it with *Run Stored Query*. Done.
   - Match covers most of the request → write a short composition query that references the stored query as its base using the composition syntax `{{query:"CategoryPath/QueryName"}}` (resolved to a CTE at execution time), adding only the missing columns/filters on top. Execute with *Run Ad-hoc Query*.
3. Read the matched query's SQL before deciding — it often has more columns than the name suggests. Missing 1–2 columns is a composition opportunity, not a reason to start over.
4. Only when the catalog has no usable match (all below 0.6) do you explore schema and write fresh SQL.

## Schema Exploration & Fresh SQL

- Use *Get Entity Details* with the **exact entity name** to inspect fields, foreign keys, and join paths before writing SQL.
- Always query **base views**, never raw tables: `SchemaName.vwEntityName`.
- **Never assume the `__mj` schema** — entities can live in any schema; read `SchemaName` from the entity metadata.
- Use proper JOINs via the foreign keys reported by entity metadata; don't guess join columns.

## Testing & Presentation

- Test every query with *Run Ad-hoc Query* and `MaxRows: 10` — a small sample is enough to verify shape and values, and the default of 1000 rows wastes tokens. Don't bake `TOP` into the SQL for testing; `MaxRows` handles limiting.
- Format SQL you show to users for readability: one major clause per line, one SELECT column per line, uppercase keywords, a short header comment naming the query and what it returns, and inline comments on non-obvious logic.
- Use the *Aggregate Data* action for post-query summarization (totals, group rollups) instead of re-querying per bucket.

## When to Delegate

For complex work — multi-entity joins with non-obvious paths, ambiguous requests with several valid interpretations, or when the user wants a **saved, reusable query** built properly — delegate to the **Query Strategist** sub-agent bundled with this skill. It specializes in schema exploration, SQL authoring, testing, and result structuring. Pass it the business question, any catalog findings you already have, and constraints you've learned, so it doesn't repeat your work.
