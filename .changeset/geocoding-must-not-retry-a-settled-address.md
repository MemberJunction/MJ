---
"@memberjunction/geo-core": patch
"@memberjunction/core-actions": patch
---

Geocoding no longer re-attempts an address it has already determined has no location.

`ProcessMapping` skipped only on `Status === 'success'`. A row marked permanently not-geocodable — an address that genuinely has no location, like "Conference Room B" — fell through to a full re-attempt on **every pass**, even with the source hash unchanged: mark pending (a write), geocode (nothing to find), mark failed (another write). Per record, forever, for an answer already on file. On a synced entity with geo-typed columns that is three round trips per record per sync, and CodeGen enables geocoding automatically on address-like columns, so it applies to entities nobody opted in.

`UpdateNotGeocodable`'s own comment describes the intended behaviour exactly — *"Mark as not_geocodable so the retry job skips it. If the user later edits the address, the hash will change and SyncIfChanged will re-attempt."* The hash **is** the re-attempt condition; it just was not being honoured for that outcome.

- New `IsSettledGeoCode(status, retryCount)` in `geo-core`, plus a named `PERMANENT_SKIP_RETRY_COUNT` for the sentinel that was previously a bare `9999`. Settled means success **or** permanently not-geocodable; a plain `failed` is still transient and still retried, which is the retry job's purpose.
- `ExistingGeoCodeInfo` gains `RetryCount` — without it a batch caller cannot tell the two kinds of `failed` apart. The scheduled geocoding job now selects and populates it.
- The batch path decides from the map **before** loading anything, so an unchanged settled record costs zero round trips. `FindExistingGeoCode`'s comment already claimed it avoided the load when the hash was unchanged; it never checked, and loaded unconditionally.

No change for a record whose address changed, whose geocode succeeded, or whose failure was transient.
