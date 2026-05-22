---
"@memberjunction/core": patch
---

Fix MJAPI heap leak by eliminating per-request `SQLServerDataProvider` retention in `BaseEngine` caches. `applyImmediateMutation` now clones entities before storing them so saver providers aren't pinned via `_provider` back-refs. The engine provider-instance cache is now keyed by `IMetadataProvider.InstanceConnectionString` (promoted onto the interface) instead of by provider object identity, and `SetProvider` is first-wins so transient per-request providers can't displace persistent ones.
