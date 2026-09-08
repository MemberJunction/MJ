---
"@memberjunction/generic-database-provider": patch
---

Fix keyset (`AfterKey`) pagination returning duplicate rows and silently skipping others.

A keyset walk was ordered inconsistently across its own pages. Page 1 has no cursor yet, so `usingKeyset` is false and the query fell through to the plain row-limited path — which emitted `SELECT TOP N …` with **no `ORDER BY` at all**, letting the engine return an arbitrary N rows. Page 2 onward then forced `ORDER BY <pk>` plus the seek predicate `<pk> > @afterKey`. Because the two orderings disagreed, rows from page 1 were re-returned on page 2, and rows the arbitrary first page happened to include could be skipped by the walk entirely.

The fix gives every row-limited query the determinism that OFFSET pagination already had: when `MaxRows` (or the entity's `UserViewMaxRows`) limits the result and the caller supplied no `OrderBy`, the query now orders by the primary key. `TOP N` / `LIMIT N` without an `ORDER BY` is undefined by definition, so this is a general correctness fix rather than a keyset-specific patch — and it makes page 1 of a keyset walk agree with every page after it, since both order by the same PK.

Verified against real data: a four-page keyset walk over a 32-row universe previously duplicated 4 of the 8 rows on page 2; it now returns all 32 rows exactly once, with none missed. This is the defect behind the long-standing `IT25 - View Execution (client-first)` / `view-execution.V10` integration failure.

**Behavior note**: this changes *which* N rows an unordered `MaxRows` query returns. That set was previously undefined and could vary between runs, so no correct caller can have depended on it — but callers that were incidentally observing storage order will now see primary-key order. It also introduces a sort for entities whose primary key is not the clustered index.
