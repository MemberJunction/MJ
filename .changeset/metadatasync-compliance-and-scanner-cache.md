---
"@memberjunction/metadata-sync": patch
---

fix(metadata-sync): compare entity IDs with `UUIDsEqual` in the IS-A subtype checks, and allowlist the one remaining global-provider read. `RecordProcessor.buildSubtypeExtension` and four sites in `ValidationService` compared `EntityInfo.ParentID` / `ParentEntityInfo.ID` against `EntityInfo.ID` with `===`, which is case-sensitive: SQL Server returns UUIDs uppercase and PostgreSQL lowercase, so a subtype resolved on one database could fail to resolve on the other and be reported as an unregistered or non-subtype entity. The `Metadata.Provider` read in `RecordProcessor` now carries the same `global-provider-ok` note the rest of the package uses — MetadataSync is a single-provider CLI process.
