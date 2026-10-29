---
"@memberjunction/search-engine": patch
---

Storage search permissions are now evaluated per search instead of from a startup snapshot. `StorageSearchProvider` no longer loads every `MJ: File Storage Account Permissions` row once under whichever user configured the engine first (a failed load used to open every account to every user until restart); it asks `StorageAccessEvaluator` for the searching user on every search, and reads the searchable accounts from `FileStorageEngine`'s live cache. `SearchEngine`'s late permission filter no longer passes `storage-file` results through: a storage hit is kept only when its engine-stamped `ProviderId` belongs to a `StorageSearchProvider` and its account is readable by the user now, so a `storage-file`-typed hit from any other provider is dropped, as is one that cannot be attributed or evaluated.
