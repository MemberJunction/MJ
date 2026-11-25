---
'@memberjunction/core': patch
'@memberjunction/global': patch
'@memberjunction/redis-provider': patch
---

Fix metadata startup failure (`TypeError: Cannot assign to read only property '0' of object '[object Array]'`) on Redis two-tier L1 cache deployments (#6598):

- **`@memberjunction/core`**: Make `ProviderBase.GetAllMetadata`, `ProviderBase.PostProcessEntityMetadata`, and `EntityInfo` non-mutating on raw dataset arrays and row objects by sorting shallow array copies and constructing shallow-cloned row objects when attaching child collections.
- **`@memberjunction/redis-provider`**: Honor `providerInternalScaffolding` on `RunViewCache` slots and exempt the `MJ_Metadata` dataset in `DatasetCache` inside `TwoTierCacheStorageProvider` so L1 caching matches `LocalCacheManager`'s freeze-exemption contract.
