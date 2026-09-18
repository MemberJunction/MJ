---
"@memberjunction/codegen-lib": patch
---

CodeGen no longer leaves entities flagged searchable with nothing searchable on them.

`createNewEntityInsertSQL` inserts every new entity with `AllowUserSearchAPI = 1`, but the per-field `IncludeInUserSearchAPI` flags are only ever set by the smart-field pipeline — which runs under `AdvancedGeneration.enabled`, i.e. `enableAdvancedGeneration ?? false`. **Advanced generation is off by default**, so on a default configuration that pipeline never runs and every entity lands flagged searchable with nothing flagged on it.

That is not a harmless default. `UserSearchString` against such an entity is a documented no-op (#4581/#4582): the data provider ignores the term and returns the **unfiltered** table. Global search fans out to it on every keystroke and discards every row it gets back.

A new deterministic pass runs after advanced generation and, deliberately, *regardless of whether it is enabled*:

1. **Seed** — an entity with no searchable field gets its name-like columns flagged (`NAME_LIKE_FIELD_NAMES`: Name, Title, FirstName, LastName, …), capped at the existing per-entity maximum. Only fires when the entity has nothing flagged at all, so it fills a gap rather than overriding the model or a human.
2. **Clear** — an entity *still* left with no searchable field has `AllowUserSearchAPI` turned off, so it drops out of the fan-out instead of contributing noise.

Order matters: seeding first means an entity whose name column was just flagged is no longer a candidate for being disabled. Both honor the `AutoUpdate*` opt-outs, which is how an operator pins a hand-made decision — and how the curated entries in `metadata/entities/.entity-search-exclusions.json` already protect themselves.

**The seed keys on the field's NAME, not on `IsNameField`.** That flag is the obvious source and the wrong one. Measured against a real database, seeding from it selects 54 fields of which **41 are virtual** — the denormalized FK display columns CodeGen puts on views (`Action`, `Agent`, `Artifact`). Those are computed by JOIN, so a `LIKE` against them cannot seek any index, and flagging them would push 49 junction entities into the fan-out with unindexable predicates: exactly the cost `search-guardrails.ts` exists to prevent. It also selected identifiers (`RecordID`, `Token`, `ExternalSystemRecordID`) and a `Description`, which `isNarrativeFieldName` rejects on the LLM path. And it would not have fixed `MJ: Employees` — the entity behind the original report — whose only `IsNameField` is the virtual `FirstLast`. Keying on the name reaches its real `FirstName` / `LastName` columns.

Full-text-search entities are exempt from both statements: an FTS entity is searchable through its index, and `createViewUserSearchSQL` takes the full-text branch before it ever reads `IncludeInUserSearchAPI`.

`isNameLikeFieldName` now derives its pattern from the exported `NAME_LIKE_FIELD_NAMES`, so the generated SQL and the LLM-path predicate cannot drift apart.

Both statements use `UPDATE ... WHERE <key> IN (subquery)` rather than the T-SQL-only `UPDATE ... FROM ... JOIN`, so they run unchanged on PostgreSQL.
