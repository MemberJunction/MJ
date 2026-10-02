---
'@memberjunction/core': patch
---

Metadata snapshot: `ILocalStorageProvider` gains an optional `SupportsCrossProcessPersistence`. `InMemoryLocalStorageProvider` declares it `false`, and `ProviderBase` then skips the metadata snapshot save and load for that store entirely (a full serialize/gzip/base64 of all metadata that only the same heap could ever read back). A staleness check re-reads the stored snapshot only on a cold start, and the snapshot's base64 helpers use Node's native `Buffer` when it is available. Providers that do not declare the flag (Redis, browser storage) behave as before.
