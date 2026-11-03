---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
---

Fix a race condition between background metadata reloads (`ReloadMetadata` / `GetAllMetadata`), cascade deletes on parent entities (`CascadeDeletes = true`), and dataset caching that could leave stale pre-delete row counts in `LocalCacheManager` and `DatasetCache`.
