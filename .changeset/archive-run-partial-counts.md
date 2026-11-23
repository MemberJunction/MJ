---
"@memberjunction/archiving-engine": patch
---

An archive run that fails partway through an entity now records the records it already processed. `ArchiveProcessor.ProcessEntity` takes an optional `runTotals` and adds each page's counts to it as the page completes; `ArchiveEngine` passes its running totals, so a Failed run's `ArchivedRecords` (the only record of what a Purge run removed) includes the pages processed before the error.
