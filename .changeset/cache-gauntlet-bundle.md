---
"@memberjunction/testing-integration": patch
"@memberjunction/server": patch
---

Add the `cache-gauntlet` integration bundle (CG1–CG5) — live coverage of the subset-slot × mutation cell that shipped two production cache bugs.

An audit of the 61 existing cache checks found the exact bug class had **no live coverage**: `S16` tests that `MaxRows` *fingerprints* separately (slot identity), `S17` tests that a *filtered* slot invalidates on save, and `S23` tests that an *unfiltered* slot upserts in place — but nothing ever saved into a **subset** slot. Both #3195 (`totalRowCount` collapse) and #3199 (rows maintained in place) lived in that gap.

The bundle also pins the per-operation asymmetry that made #3199's delete half a *separate* bug: filtered-DELETE is legitimately maintained in place (a deleted row matches no predicate), while subset-DELETE is not (removal shrinks the slot below the caller's limit). CG3 guards the legitimate half so a future over-correction doesn't needlessly invalidate it.

Verified to actually catch the regression: with `isSubsetFingerprint` neutered, CG1/CG2/CG4/CG5 go red while CG3 correctly stays green.
