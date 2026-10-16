---
"@memberjunction/archiving-engine": minor
"@memberjunction/ng-archive-manager": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Archive configurations have a new `StorageMode` setting. `Store` (the default) works as before: each record's archive document is written to storage, then the mode changes the source row. `Purge` applies the mode (StripFields or HardDelete) without writing a copy, so no storage account is needed and cleared data cannot be restored. A Purge run writes an Archive Run Detail row only for records that fail. Before it starts, it refuses the whole run if any entity cannot be purged safely: entities in ArchiveOnly mode, entities missing from metadata, entities that track Record Changes, entities whose DriverClass is not registered or does not support purge, and (for HardDelete) entities whose delete cascade reaches an entity that tracks Record Changes. Each Archive Run records the `StorageMode` it ran with. Custom drivers opt in to purge by overriding `BaseArchiveDriver.SupportsPurge`; subclasses of `DefaultArchiveDriver` inherit purge support unless they override `SupportsPurge`. `ArchiveRecordContext.StorageDriver` is now `null` on a Purge run, and `ArchiveRecordContext` has a new required `StorageMode` field.

`ResolveArchiveDriver` returns `null` for an unregistered driver name, and a Store run with an unregistered `DriverClass` now fails at the start of that entity with a clear error.

Fix: when an archive entity's `RetentionDays` is NULL, the run now uses the configuration's `DefaultRetentionDays`. Before, it applied no age filter and selected every row. An entity with no `DateField` is now refused instead of selecting every row.

`ArchiveProcessor.ProcessEntity` now takes the generated `MJArchiveConfigurationEntityEntity` and `MJArchiveConfigurationEntity` classes and a nullable `ArchiveStorageManager`.

The PostgreSQL counterpart of the migration is generated at release time.
