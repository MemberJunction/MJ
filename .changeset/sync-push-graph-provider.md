---
"@memberjunction/core": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/geo-core": patch
---

Fix mixed-provider deadlocks on nested mj sync push (Action + Action Params).

`GetEntityObject` now always `BindProvider(this)` after construct so a 1-arg subclass (`MJActionEntityServer` et al.) cannot silently drop the graph instance and Save on the global host. Every `BaseEntity` instance RunView uses `ProviderToUse`. MetadataSync isolates one provider per JSON-root graph, drains it at the graph's last dependency level (commit leftover depth on success, explicit rollback on failure, always release), and fail-fasts on the first thrown record error. A non-throwing `status: 'error'` no longer commits that graph. If independent instances are unavailable, every graph in the file uses the host — never a mix. GeoCodeSyncService writes RecordGeoCode on the owning entity's provider.
