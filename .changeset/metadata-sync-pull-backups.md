---
'@memberjunction/metadata-sync': patch
---

`mj sync pull` backs up every file it rewrites, restores all of them if the pull fails, and warns
when an entity's class isn't registered.

`pull.backupBeforeUpdate` backups exist so a failed pull can put the files back. Files that only
gained new records (`appendRecordsToExistingFile`) weren't backed up at all, so a failure left them
half-written, and a backup that couldn't be written was skipped silently.

- Every existing file a pull rewrites — updated or appended to — is backed up once, just before the
  write. As before, the backups are removed once the pull succeeds.
- A backup that can't be written stops the pull instead of being skipped silently.
- Rollback restores each backup to the file it came from, so a nested `backupDirectory` works.
- A `backupDirectory` that points outside the folder of the files it backs up (`../..`) is refused.

Pull also warns once per entity when the entity's subclass isn't registered in the process (push
already did), naming where the class should come from. Records still pull correctly — keys are read
through `Get()` — but values the class computes are missing from the files.
