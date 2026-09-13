---
'@memberjunction/metadata-sync': patch
---

`mj sync pull` now keeps the backups `pull.backupBeforeUpdate` asks for, and warns when an entity's
class isn't registered.

Backups were deleted as soon as a pull succeeded — they only ever served as rollback scratch space —
so the documented "timestamped backups before updates" never survived a successful run. Files that
only gained new records (`appendRecordsToExistingFile`) weren't backed up at all.

- Every existing file a pull rewrites — updated or appended to — is backed up once, just before
  the write, and the backup is kept.
- A backup that can't be written stops the pull instead of being skipped silently.
- Rollback restores each backup to the file it came from, so a nested `backupDirectory` works.

Pull also warns once per entity when the entity's subclass isn't registered in the process (push
already did), naming where the class should come from. Records still pull correctly — keys are read
through `Get()` — but values the class computes are missing from the files.
