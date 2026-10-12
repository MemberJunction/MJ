---
"@memberjunction/core": patch
---

Browser cache keys now carry the signed-in user's row-filter (`rls:`) and field-security (`fls:`) segments, as server keys already do.

- **Row filters.** The browser key had no `rls:` segment, and the browser cache outlives a session: one IndexedDB store per server URL. If a different user reached that cache without `logout()` clearing it, the currency check (latest update time and row count only) could report the previous user's cached rows as current and serve them. Explorer's `logout()` deletes the store, so this needed a session ending another way, a blocked delete while another tab held the store open, or a host other than Explorer.
- **Field security.** The allowed-field key was passed in the dataset position, so it was stored raw as `ds:<field list>` rather than hashed as `fls:`. Slots were still kept apart; the key was in the wrong segment and unbounded in length.

Users with no row filter and no field restriction keep byte-identical keys. Users with either get new keys, which costs one refetch per cached view. The server never sees these keys.
