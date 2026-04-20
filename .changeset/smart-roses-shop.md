---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
---

Hot-path optimizations and a new BaseEngine observable API.

**Performance (bundled from #2397, #2405, #2406, #2417):**
- `BaseEntity.GetFieldByName` and new `GetFieldByCodeName` back Fields lookups with lazy `Map` caches — O(1) in place of O(N) `.find()` scans inside `SetMany`, setters, and serialization. Caches clear on `init()` so re-initialized entities see fresh fields.
- `Metadata.EntityByName`/`EntityByID` fall back to a lazy `Map` when the provider doesn't own the lookup. UUID keys are normalized so SQL-Server-upper-case and PostgreSQL-lower-case resolve the same entry. Invalidated on `Refresh()`.
- `BaseInfo.copyInitData` uses `hasOwnProperty` instead of scanning `Object.keys(this)`, and short-circuits the `DefaultValue` case-insensitive match with an exact-equality fast path plus a length pre-check before falling back to `toLowerCase`.
- `RunView`/`RunViews` post-cache field filtering caches per-call key-to-keep decisions so repeated keys across rows avoid re-lowercasing and re-lookup.

**BaseEngine observable properties:**
- New `BaseEngine.ObserveProperty<E>(propertyName)` returns an `Observable<E[]>` backed by a lazy `BehaviorSubject`. Unobserved properties pay zero runtime cost.
- Five mutation paths (`applyImmediateMutation` add/remove, `LoadSingleEntityConfig`, `LoadMultipleEntityConfigs`, remote-record-data handling) now emit via `emitPropertyChange` so subscribers receive array updates.
- `UserInfoEngine` exposes `UserNotifications$`, `UserFavorites$`, `UserApplications$` as convenience accessors.

Fully test-covered: 918/918 tests pass in `@memberjunction/core` including new coverage for each cache and for the observable lifecycle.
