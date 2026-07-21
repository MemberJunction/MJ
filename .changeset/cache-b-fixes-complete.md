---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
"@memberjunction/testing-integration": patch
---

Close out every open cache-audit defect (B39–B44) plus the reachable differential throw found in adversarial round 3.

- **B40** — `CacheLocal` + `Aggregates` returned no aggregates at all, even on a cold miss. Three independent drops in one pipe: the client's cache-check input map omitted `Aggregates` from the request, the resolver's coreParams map omitted them again, and the engine's `stale` reply dropped the computed results. All three now forward; the client parses values back to native types. `client-cache` is 13/13 and now registered in the deterministic gate.
- **B39** — a `ViewID`-only `RunView` failed for *every* caller (including the view's owner): the internal `MJ: User Views` lookup ran without a context user, and a miss fell through to `undefined` ("Entity undefined not found in metadata"). The user is now threaded through `EntityStatusCheck` → `GetEntityNameFromRunViewParams`, and a genuine miss throws an error naming the view and the cause.
- **B41** — the differential-merge decline path now performs a **real full fetch** (CacheLocal stripped + BypassCache, so re-entry into the smart-cache transport is structurally impossible) instead of throwing away the caller's whole batch; with that fallback in place, the `hasNarrowingSegment` guard is restored on `ApplyDifferentialUpdate`.
- **B42** — `OrderBy` (fingerprint segment [2]) joins the maintenance classifier: an in-place upsert appends out of order, so ordered slots invalidate on save (delete still removes in place — removal preserves relative order).
- **B43** — the RunQuery TTL cache-hit now checks `UserCanRun` before serving; the fingerprint carries no user segment, so user A's warmed slot was served to user B with no permission check. Deny or unresolvable metadata falls through to normal, authorized execution.
- **B44** — an every-field `Fields` list (the `entity_object` widening) now normalizes to `f:*` in the client fingerprint **only**, restoring in-place maintenance for the client's most common slot shape without touching what is fetched.

Also: the round-3 finding that the "unreachable" differential throw was in fact reachable (aggregate slots and defensive `MaxRows` caps both failed live) is fixed at the server seam — `RunViewsWithCacheCheck` no longer offers a differential for subset/aggregate-shaped params, falling back to the same full-refresh path its own validation already uses.
