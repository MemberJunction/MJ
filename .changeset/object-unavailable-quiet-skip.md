---
"@memberjunction/integration-engine": patch
---

An object the account cannot serve is skipped quietly instead of failing every run.

A vendor catalog can list record types a particular account has not enabled. Asking for one returns
the same error on every sync, forever — a request, an error event and a retry ladder per object per
run, telling the operator nothing new after the first time. One live connection had 71 of them.

Connectors can now classify this case (`ObjectUnavailableError`, or any error carrying
`code === 'OBJECT_UNAVAILABLE'` — duck-typed so a connector needs no peer version bump). The engine
warns once, records a marker on the entity map's `Configuration` with the vendor's own message, and
ends the map cleanly: no retry ladder, no incomplete-fetch flag, and the watermark untouched. While
that marker is fresh the object is skipped with zero vendor requests; once it ages out
(`MJ_INTEGRATION_OBJECT_UNAVAILABLE_RECHECK_MS`, default 24h) the next attempt *is* the recheck, and
a fetch that succeeds clears the marker — so an account change heals itself with no operator action.

Deliberately not modelled by disabling the entity map: `SyncEnabled`/`Status` are the user's levers,
and writing to them would conflate "this account cannot serve it" with "the user does not want it".

A full sync OR a manual run overrides the marker. The recheck clock is a cost control, not a claim
that the account cannot change, so anything carrying evidence that it might have must beat it — and
in practice that is a person pressing "sync now" after enabling the record type at the vendor, which
is an ordinary incremental run. Scheduled and webhook runs still trust the marker; suppressing their
traffic is the whole point.
