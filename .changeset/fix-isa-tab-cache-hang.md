---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-base-forms": patch
---

Fix browser tab hang when navigating between entity records in an IS-A hierarchy (e.g. clicking the IS-A descendant badge or parent badge in the form toolbar). `ComponentCacheManager` now includes the entity discriminator in the cache key for `RecordResource` and `Records` tabs. Previously, because parent and child entities in an IS-A hierarchy share the exact same primary key (`recordId`), `ComponentCacheManager` dropped the entity discriminator and returned the detached parent component when asked for the child component. The tab container's reload check detected `existingEntity !== newEntity` and repeatedly reloaded, causing an infinite synchronous reload loop that froze the browser tab. Also adds a cycle guard to `MjFormToolbarComponent.ChildChain`.
