---
"@memberjunction/integration-engine": patch
---

An object the account cannot serve no longer fails loudly on every sync.

A vendor catalog lists record types a given account has not enabled. Asking for one returns the same
error every run, forever, and treated as a fetch failure it costs an error event and a retry ladder
per object per run — 71 such objects on one live connection produced 71 hard failures every sync,
burying the real ones.

The engine now recognises the signal as its own kind: `ObjectUnavailableError`, or any error carrying
`code === 'OBJECT_UNAVAILABLE'` so a connector can classify one without a peer version bump. The map
ends cleanly with a single warning — no retry ladder, no `FETCH_INCOMPLETE`, watermark untouched.

The verdict is deliberately NOT persisted between runs. Remembering it would save one probe per
object per run, and the object count in any real system is small enough that the trade is bad: a
stored verdict is wrong from the moment the account changes, and every scheme for noticing that — a
recheck clock, a full-sync override, a manual-run override — is another thing to keep correct.
Re-asking every run is self-healing by construction, with nothing to configure and no staleness.

It is also deliberately not modelled by disabling the entity map. `SyncEnabled`/`Status` are the
user's levers; writing to them would conflate "this account cannot serve the object" with "the user
does not want it".
