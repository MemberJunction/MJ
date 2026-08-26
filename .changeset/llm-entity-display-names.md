---
"@memberjunction/codegen-lib": minor
---

Add an opt-in `EntityDisplayNames` advanced-generation feature that uses an LLM to improve `Entity.DisplayName`.

**The asymmetry this closes.** `EntityField.DisplayName` has had LLM generation since the FormLayout feature shipped — `fieldCategories[].displayName` is written wherever `EntityField.AutoUpdateDisplayName = 1`. `Entity.DisplayName` had no equivalent: it is set once at entity creation by stripping the schema's configured prefix/suffix off the entity name (`createNewEntityDisplayName`), and never revisited. The `EntityNames` feature does call an LLM, but it sets `Entity.Name` — an identifier — and only for brand-new entities.

**Scoped to where a model actually helps.** The deterministic `createDisplayName()` already splits underscores, normalizes ALL-CAPS, splits compound words and converts camelCase to spaces, so `CustomerOrder` → `Customer Order` needs no model. What it cannot do is vocabulary: `ACCT_STAT_CD` becomes `Acct Stat Cd` — correctly spaced, still unreadable — because expanding `Acct` requires knowing what it means. A new `assessDisplayNameOpacity()` heuristic spots those cases (vowel-less tokens, digits welded into tokens, short tokens outside a common-word allowlist) so clean names never reach the LLM. Set the feature's `alwaysGenerate` option to bypass the filter.

The prompt is given the entity's **field list**, which is usually the strongest evidence for what an abbreviated table name means — `ACCT_STAT_CD` alongside `StatusName`/`IsActive`/`SortOrder` is a status lookup, not accounting statistics.

**Never overwrites a human.** A new `Entity.AutoUpdateDisplayName` column (BIT NOT NULL DEFAULT 1, mirroring `EntityField.AutoUpdateDisplayName`) gates every write, re-checked in the UPDATE's own WHERE clause. Results the model marks `low` confidence are discarded rather than written, as are empty or over-255-character values. The model must report which abbreviations it expanded, so a questionable expansion can be audited from the log rather than only its result.

Like other entity-level advanced-generation features this runs for new and modified entities, or across all entities when `forceRegeneration` is enabled — which, with `forceRegeneration.entityWhereClause`, is also how an existing schema gets backfilled.

Ships **disabled**. Enabling it requires both the feature flag in `mj.config.cjs` and a database that has run the new migration.
