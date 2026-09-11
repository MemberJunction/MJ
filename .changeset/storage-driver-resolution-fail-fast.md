---
"@memberjunction/storage": patch
"@memberjunction/server": patch
---

Storage driver resolution now fails fast and specifically instead of handing back an unusable base instance.

`ClassFactory.CreateInstance` does not return `null` for an unregistered key — it falls back to the anchor base class. Because `FileStorageBase` declares every real operation `abstract` (and `abstract` is erased at runtime), an `MJ: File Storage Providers` row whose `ServerDriverKey` resolved to nothing produced a `FileStorageBase` whose methods were all `undefined`. The misconfiguration stayed invisible until some distant subsystem called one, surfacing minutes later as `source.driver.GetObject is not a function` — a message that names neither storage, nor the provider, nor the key.

- `FileStorageBase` is now marked `@RequiresSubclass()`, so an unresolved driver key is a hard, named error at the point of resolution rather than a hollow object that fails later somewhere else. This covers every resolution site, including those outside MJStorage.
- New exported `resolveStorageDriver(providerEntity)` is the single place a `ServerDriverKey` becomes a driver. It uses `TryCreateInstance` and, on failure, throws naming the unresolved `ServerDriverKey`, the provider's name and ID, the driver keys that *are* registered, and the two things that actually fix it (import the package declaring the driver so its `@RegisterClass` runs in this process, or correct `ServerDriverKey`). All three `initializeDriver*` paths route through it.
- `GET /media/:fileId` no longer answers an unlogged 404 when a file's bytes cannot be located. Each of the three distinct causes — no `MJ: Files` row, no `ProviderKey`, no `MJ: File Storage Accounts` row for the provider — is now logged with its cause. The response stays a bare 404 so the pre-auth route still describes nothing to an unauthenticated caller.
