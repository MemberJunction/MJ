---
'@memberjunction/ng-conversations': patch
---

fix: the New/Edit Folder dialog reports why a save was refused instead of "Failed to save project"

`BaseEntity.Save()` returns false and records the reason on `LatestResult` — a server refusal, a constraint violation, a failed hook. The folder modal threw that reason away and raised its own generic message, so the console read `Error: Failed to save project` with nothing pointing at the cause. It now raises `LatestResult.CompleteMessage` and shows it in the failure alert, matching what every other save path in this package already does.
