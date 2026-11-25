---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
---

Wave 4.1a core and engine performance improvements:
- Exclude transient `BaseEntityEvent` payloads from `MJGlobal`'s 100-slot replay buffer so entity graphs and per-request providers are not retained in memory and initialization events (`LoggedIn`) are not evicted, while keeping live delivery to all subscribers.
- Drain `ProviderBase` `RunViews` coalescing via microtasks (`ProviderBase.CoalesceUseMicrotask`) so concurrent engine loads still batch together while isolated queries avoid a 10–16ms timer sleep.
- Prevent wasted server-side narrow-`Fields` `SELECT *` widening on `ExternalDataSourceID` entities, ad-hoc `UserSearchString` queries, and active write-batch windows.
- Add `GetEntityObjectOptions` (`{ SkipNewRecord: true }`) for hydration paths (`TransformSimpleObjectToEntityObject`, `BaseEngine`) so entity instantiation skips throwaway UUID generation and preserves `BaseEntity`'s lazy `_raw` storage fast path.
- Memoize `EntityInfo.GetUserPermisions(user)` per `(EntityInfo, UserInfo)` and cache normalized role IDs / deny flags on `EntityPermissionInfo`.
- Fix `BaseEngine` generic `BaseEntity` primary-key extraction fallback (`row.Get(pk)`), skip cloning on in-place cached instance saves via `WeakSet` reference tracking, and reuse `DeltaRowKeyIndex` across consecutive external `row_delta` updates in `O(Δ)`.
- Prevent `UserInfoEngine.Config(false, contextUser)` on server `Database` providers from triggering an 8-table `forceRefresh` reload when called across different request users.
