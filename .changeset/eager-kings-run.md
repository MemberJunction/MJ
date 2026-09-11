---
"@memberjunction/core": patch
---

`ProviderBase`'s write-invalidation fan-out now re-subscribes when the `MJGlobal` event bus is replaced. Its one-time wiring guard was a boolean, which cannot detect that `MJGlobal.Reset()` (or clearing the singleton from the global object store) has swapped `_events$` for a fresh `Subject` — leaving the fan-out attached to the discarded bus for the rest of the process, so `RunView` dedup/linger entries silently stopped being invalidated after a save, with no error. The guard now keys on the bus reference, unsubscribes the stale subscription when the bus changes, and is re-checked on every call so already-registered long-lived providers re-wire as well.
