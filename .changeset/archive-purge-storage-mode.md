---
"@memberjunction/archiving-engine": minor
"@memberjunction/archiving-action": minor
"@memberjunction/ng-archive-manager": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Archive configurations have a new `StorageMode` setting. `Store` (the default) works as before: each record's archive document is written to storage, then the mode changes the source row. `Purge` applies the mode (StripFields or HardDelete) without writing a copy, so no storage account is needed and cleared data cannot be restored. A Purge run writes an Archive Run Detail row only for records that fail. Before it starts, it refuses the whole run if any entity cannot be purged safely: entities in ArchiveOnly mode, entities missing from metadata, entities that track Record Changes, entities whose driver is not registered or does not support purge, and HardDelete entities that use soft delete or whose delete cascade reaches an entity that tracks Record Changes or uses soft delete. Each Archive Run records the `StorageMode` it ran with. Custom drivers opt in to purge by overriding `BaseArchiveDriver.SupportsPurge`; subclasses of `DefaultArchiveDriver` inherit purge support unless they override `SupportsPurge`. `ArchiveRecordContext.StorageDriver` is now `null` on a Purge run, and `ArchiveRecordContext` has a new required `StorageMode` field.

`ResolveArchiveDriver` returns `null` for an unregistered driver name, and a Store run with an unregistered `DriverClass` now fails at the start of that entity with a clear error.

Fix: when an archive entity's `RetentionDays` is NULL, the run now uses the configuration's `DefaultRetentionDays`. Before, it applied no age filter and selected every row. An entity with no `DateField` is now refused instead of selecting every row.

Two CHECK constraints refuse a negative retention period: `ArchiveConfiguration.DefaultRetentionDays >= 0` and `ArchiveConfigurationEntity.RetentionDays >= 0`. The engine also refuses to select records for an entity whose resolved retention period is negative.

When a run throws after its Archive Run row exists (for example a bad FieldConfiguration or a storage initialization failure), the run is saved as `Failed` with a `CompletedAt` time, the error message in `ErrorLog`, and the counts of the entities that finished before the error, and the result carries the run's ID.

`ArchiveRunResult` has a new optional `StorageMode` field, set once the configuration loads. The Archive Data and Run All Active Archives actions say "Purged" instead of "Archived" for Purge runs, and the run viewer shows "purged" on Purge run cards and a "Purged" label in the run drawer.

`ArchiveProcessor.ProcessEntity` now takes the generated `MJArchiveConfigurationEntityEntity`, `MJArchiveConfigurationEntity` and `MJArchiveRunEntity` classes and a nullable `ArchiveStorageManager`, and the engine reads those records through their typed properties instead of `.Get()`.

With Archive Runs now named by their configuration, `MJ: Archive Run Details.ArchiveRun` holds the configuration name instead of the run's start time. Its display name changes from "Archive Run Timestamp" to "Archive Run" (through metadata, with `AutoUpdateDisplayName` turned off so CodeGen keeps it).

The PostgreSQL counterpart of the migration is generated at release time.
