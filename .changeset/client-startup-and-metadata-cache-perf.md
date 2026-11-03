---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/ai-engine-base": patch
---

Optimize client startup and warm metadata cache initialization:
- Remove custom `priority: 15` on `PermissionEngine` so it runs synchronously (`deferred: false`) in the default `priority: 100` startup wave, coalescing `MJ: Permission Domains` into the main startup `RunViews` batch and eliminating a solo HTTP round-trip while remaining 100% loaded before `StartupManager.Startup()` returns.
- Register `InstanceConfigEngine` with `@RegisterForStartup()` so `MJ: Instance Configurations` loads in the main startup coalesce wave rather than sequentially after `StartupManager.Startup()`.
- Parallelize `AIEngineBase.Config()` dependent engine initialization (`TemplateEngineBase`, `ArtifactMetadataEngine`) with `AIEngineBase.Load()` so all 51 `AIEngineBase` entity configs coalesce into the initial startup `RunViewsWithCacheCheck` batch instead of firing a second sequential wave.
- Reuse `preResolvedCache` from `prepareSmartCacheCheckParams` inside `executeSmartCacheCheck` in `ProviderBase`, eliminating a duplicate IndexedDB transaction and `JSON.parse()` pass across all `'current'` cached views on warm loads.
- Default `BaseEnginePropertyConfig.CacheLocal` to `true` so reference/metadata engines automatically participate in `LocalCacheManager` and `RunViewsWithCacheCheck` unless explicitly opted out (`CacheLocal: false`).
- Skip `BaseEngine` entity configs cleanly when their target entity schema is not installed in `Metadata.Entities`, avoiding failing `RunViews` network requests and error stack traces for optional OpenApp engines.
- Parallelize `LocalCacheManager.Instance.Initialize()` with `LoadLocalMetadataFromStorage()` during `ProviderBase.Config()`, and parallelize `CheckToSeeIfRefreshNeeded()` with `RefreshCurrentUser()` during warm `ProviderBase.preValidateAndRefresh()`.
- Cache prototype accessor/getter descriptors per subclass in `BaseInfo` and skip redundant `null` and child-collection assignments in `EntityInfo` / `EntityFieldInfo` `copyInitData()`.
- Prevent self-deadlock in `ProviderBase.Config()` when `RefreshWithinTransaction()` runs while a background pool-based `_metadataReloadInFlight` is blocked on the caller's uncommitted transaction locks.
