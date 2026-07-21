---
"@memberjunction/core": patch
"@memberjunction/testing-integration": patch
"@memberjunction/server": patch
---

Fix a structural defect in RunView cache maintenance classification, plus the two holes it caused.

Three shipped bugs (#3195 `totalRowCount`, #3199 rows, B38 `schemaHash`) were all symptoms of one root cause: `isFilteredFingerprint` inspected **only** fingerprint segment `[1]`, so segments appended later were silently classified as "safe to maintain in place":

- **H1** — a saved view's `WhereClause` lives on the VIEW, not in `params.ExtraFilter`, so the filter segment stays `_`. Its slot was upserted in place on save and served rows the view's own `WhereClause` excludes. Views are how users are shown a restricted row set, so this reads as a data/permission leak.
- **H3** — the per-user RLS predicate is appended as `rls:<hash>` after the filter segment is built. Same misclassification: a save by user A was upserted into user B's RLS-scoped slot, injecting a row B's predicate excludes. An RLS bypass.

`hasNarrowingSegment()` replaces the segment-`[1]` check with a **deny-by-default allowlist**: only `imr:` (which widens the set) and the connection suffix are treated as safe; everything else, *including unknown future segments*, is treated as narrowing. A new segment can now cost a cache refill, but can never silently serve wrong rows.

**H2** — aggregates were dropped by in-place maintenance, so a caller that asked for `COUNT(*)` got `Success: true` with no aggregate. The first fix attempt *carried the cached aggregate forward* and was worse: it served `rows=7` alongside `COUNT(*)=6`. A caller can detect a missing aggregate; it cannot detect a stale one. Aggregate-bearing slots (`aggHash` segment) are now invalidated on **either** mutation, since the value is not derivable in JS. The delete branch previously bypassed classification entirely and now consults it.

**H4/H5** — `ApplyDifferentialUpdate` refuses to merge into subset, narrowing, or aggregate slots, invalidating instead. It recomputed `schemaHash` (stamping today's schema onto rows fetched under the old one, masking drift) and still shrank subset slots — the third instance of #3199, previously unpinned by any test.

**H6** — `cross-server-invalidation-tests.ts` documented that run-all included it behind `RUN_CROSS_SERVER=1`; that inclusion never existed, so it had never run in the gate. Now registered behind its documented gate.

New `cache-gauntlet` checks CG7 (view slot) and CG8 (aggregate consistency) pin H1 and H2 live; the unit slot-maintenance matrix gains view/aggregate rows plus deny-by-default property tests.
