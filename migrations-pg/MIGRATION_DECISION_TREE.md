# Decision Tree: Adding a `.pg-only.sql` Migration

**Read this BEFORE writing any new `.pg-only.sql` migration. Especially before "fixing" anything that the schema-equivalence test flags.**

This document exists because of a real process failure (Bug #15, retracted in commit `20213579`). The schema-equivalence test reported drift, we assumed test-failure ⇒ bug-exists, and wrote a `.pg-only.sql` migration that contradicted documented MJ design intent. Following the decision tree below would have prevented that mistake.

---

## When to consult this document

Whenever you're considering adding a new `migrations-pg/v5/V*__*.pg-only.sql` file. This includes:

- A schema-equivalence diff (`scripts/compare-pg-ss-snapshots.mjs` or the older `snapshot-{ss,pg}.sh` workflow) flagged a column / view / sproc as different between SS and PG.
- A user report of "this view doesn't exist on PG" or "this column has the wrong type."
- An automated test failed because PG state doesn't match expectations.
- Codegen output produced something different on PG than SS.

---

## The 5-question checklist

You **must** answer all five questions in writing (in the migration's header comment, in the PR description, or in your investigation notes) **before** the migration is written. If any answer is unclear, stop and investigate before writing code.

### Q1 — Is there a documented MJ override that explains the divergence?

**Where to check:** `packages/SQLConverter/src/rules/TypeResolver.ts` — specifically the `MJ_OVERRIDES` constant. The MJ design intent for type mappings lives there.

**What "yes" looks like:** SS `[datetime]` is divergent from PG `TIMESTAMPTZ`, but `MJ_OVERRIDES` explicitly says `DATETIME → TIMESTAMPTZ` with the comment *"MJ stores everything with timezone info"*. The divergence is intentional.

**If yes:** **STOP.** The divergence is documented MJ design. Do NOT write a `.pg-only.sql` migration to "fix" it. Instead:

1. Update the schema-equivalence test (or its normalization layer) to know about the override. The script `scripts/compare-pg-ss-snapshots.mjs` already does this for cases covered by `MJ_OVERRIDES` — extend it if a new class of override is added.
2. Update `migrations-pg/V5_30_NOTES.md` (or current equivalent) so the documented type-alias table reflects the actual MJ override, not just the dialect's default mapping.
3. If you believe the MJ override itself is wrong, that's a team-level design discussion — don't unilaterally write a migration that contradicts it.

**If no:** Proceed to Q2.

### Q2 — Does the test normalization include that override?

**Where to check:** `scripts/compare-pg-ss-snapshots.mjs` — see the `MJ_OVERRIDES` import and the `DIALECT_ALIASES` map. The script imports `MJ_OVERRIDES` from `@memberjunction/sql-converter` so it's always in sync with the converter's actual behavior.

**What "yes" looks like:** The newer comparison script already filters known overrides correctly. If you're using the older `snapshot-{ss,pg}.sh` + sed normalization workflow and seeing a "drift" that the new script wouldn't flag, the test is wrong, not the data.

**If yes (test is correct):** Proceed to Q3.
**If no (test is wrong):** Update the test/normalization first. Re-run. If the drift disappears, you have nothing to migrate. If it persists, proceed to Q3.

### Q3 — Does the original conversion **fail** (apply error) or just **diverge** (test diff)?

**How to check:** Apply the converted PG migration to a fresh PG database with `psql -f <file> -v ON_ERROR_STOP=1`. If it produces an actual error (not a warning), the converter output is broken at the SQL level.

**What "fail" looks like:**
- `relation "X" does not exist` (missing dependency)
- `operator does not exist: integer = boolean` (type mismatch in body)
- `cannot change name of view column` (semantic error)
- Any `ERROR:` line from PG

**What "diverge" looks like:**
- The migration applied cleanly with no errors, but a later schema-equivalence test reports "PG has X, SS has Y, they don't match." The DB is in a perfectly valid state — it's just *different* from SS.

**If fail:** This is a real bug. Proceed to write the `.pg-only.sql` migration. Document the original error and the fix in the migration header. Skip Q4 and Q5 — the bug is concrete.

**If diverge:** Proceed to Q4.

### Q4 — Does any production code path actually break at runtime?

**How to check:** Find what consumes the diverging schema. Examples of "real consumers":
- A Query metadata row references a non-existent view (Bug #14 — real, reproduced via "Server Installed Version History" Query)
- BaseEntity-generated CRUD sprocs fail because the column type doesn't match the expected param type
- A resolver reads from a view that doesn't exist
- A scheduled job hits the divergence and crashes

**How to verify:**
- `grep -rn "X" packages/MJServer/src packages/Angular packages/MJExplorer/src` for any reference to the diverging name
- Boot MJAPI and look at the logs for related errors
- Try the user-facing operation that depends on the schema item

**If yes (something breaks at runtime):** This is a real bug. Proceed to write the `.pg-only.sql` migration. Document the broken consumer path in the migration header.

**If no (nothing breaks at runtime):** Proceed to Q5. Be especially skeptical from here — if nothing breaks, you may not have a bug at all.

### Q5 — If only diverging (not failing), is the SS source the anomaly?

**How to check:** Look at the broader pattern in the SS migration set. Is the column / view / sproc in question consistent with the rest of the SS source, or is it the outlier?

**Example:** `ListInvitation.ExpiresAt` is the *only* column in the entire v5.0 baseline declared as bare `[datetime]`. Every other date/time column uses `[datetimeoffset]`. The SS source itself is the anomaly. The SQLConverter's MJ_OVERRIDES correctly promotes the anomalous column to TIMESTAMPTZ on PG, matching the convention. Trying to "fix" PG to match the SS anomaly is wrong-direction work.

**Verify with:** `packages/SQLConverter/src/__tests__/MJConventionEnforcement.test.ts` — this test scans SS migrations for known anti-patterns. If the anomaly isn't caught by this test, consider extending the test.

**If yes (SS is the anomaly):** **STOP.** Do not write a `.pg-only.sql` migration. The right fix path is to either:

1. Add the SS-side anomaly to the `KNOWN_VIOLATIONS` map in `MJConventionEnforcement.test.ts` if it ships in a baseline that can't be retroactively modified.
2. Open a discussion with the team about a future SS migration to bring the anomalous column / view / sproc in line with MJ convention.
3. Update the schema-equivalence comparison to recognize this is a known SS-side anomaly that's correctly handled by the converter.

**If no (SS is consistent, PG diverges from a consistent SS):** This may be a real PG-side gap. Re-evaluate Q3 and Q4 carefully. If you're confident the PG side is genuinely missing something that the SS side correctly establishes, write the migration.

---

## After answering all 5 questions

If your migration is justified (genuine apply error, runtime breakage, or PG-only gap), include the answers in the migration's header comment block:

```sql
-- =============================================================================
-- V<timestamp>__v<version>__<Description>.pg-only.sql
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS:
--   <brief summary>
--
-- DECISION TREE ANSWERS:
--   Q1 (documented MJ override?):       NO — <details>
--   Q2 (test normalization correct?):   YES — confirmed by ...
--   Q3 (apply error vs diverge?):       <APPLY ERROR | DIVERGE>
--   Q4 (runtime breakage?):             <YES — <consumer path> | NO>
--   Q5 (SS source is anomaly?):         NO — <details>
--
-- (rest of header...)
```

This makes the rationale auditable and forces honest answers. If you can't articulate any answer, you don't yet understand the problem well enough to fix it.

---

## Real worked examples

### Bug #14 — `vwFlywayVersionHistoryParsed` (kept, justified)

- Q1: NO — no MJ override for view existence
- Q2: YES — comparison script correctly reports the missing view
- Q3: APPLY-related — the view literally doesn't exist; `\d __mj.vwFlywayVersionHistoryParsed` returns nothing
- Q4: YES — Query metadata row in baseline references the view; running it from MJ Explorer errors with `relation does not exist`
- Q5: NO — SS consistently creates this view; PG consistently lacks it because the converter intentionally skipped it (`CROSS APPLY` not translatable)

**Verdict: legitimate. Write the migration.** (See `V202605031200__v5.32.x__Add_vwFlywayVersionHistoryParsed_For_PG_Parity.pg-only.sql`.)

### Bug #15 — `ListInvitation.ExpiresAt` type drift (RETRACTED)

- Q1: **YES** — `MJ_OVERRIDES` says `DATETIME → TIMESTAMPTZ` with the comment *"MJ stores everything with timezone info"*
- Q2: NO — old test normalization didn't know about MJ_OVERRIDES (this is what triggered the false positive)
- Q3: DIVERGE — original conversion applied cleanly; column accepts inserts, returns values, FKs work
- Q4: NO — no production code path breaks; both column types work fine
- Q5: **YES** — `ListInvitation.ExpiresAt` is the only column in the entire baseline declared as bare `[datetime]`; the SS source is the anomaly

**Verdict: NOT legitimate. Withdrew.** Q1=YES alone should have stopped us. Q5=YES confirmed.

---

## Where to push back if this seems too process-heavy

Yes, this is process-heavy. The reason: **PG work is owned primarily by one person at a time.** No second pair of eyes catches your mistakes by default. The decision tree is the second pair of eyes. Skipping it because "I'm pretty sure this is a real bug" is exactly how Bug #15 happened.

The five questions take maybe 5-10 minutes to answer honestly. The cost of a wrong-direction migration is much higher: writing it, testing it, reviewing it, eventually retracting it, plus the credibility hit with the team. Run the checklist.
