---
"@memberjunction/core": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/geo-core": patch
---

Fix mixed-provider deadlocks on nested mj sync push (Action + Action Params).

`GetEntityObject` now always `BindProvider(this)` after construct so a 1-arg subclass (`MJActionEntityServer` et al.) cannot silently drop the graph instance and Save on the global host. Every `BaseEntity` instance RunView uses `ProviderToUse`. MetadataSync isolates one provider per JSON-root graph; it drains a graph when its last level finishes or when TransactionDepth is already 0 (Save settled — a fresh instance at the next level is safe). Leftover depth is committed on success and explicitly rolled back on failure; always release. Fail-fast on the first thrown record error. A non-throwing `status: 'error'` no longer commits. If the first CreateIndependentInstance in a file fails, every graph uses the host; if it fails after independents already exist, the file aborts — never a mix. GeoCodeSyncService writes RecordGeoCode on the owning entity's provider.
