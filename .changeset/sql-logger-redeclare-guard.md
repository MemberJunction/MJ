---
"@memberjunction/generic-database-provider": patch
---

Threshold-mode SQL logging (Explorer SQL logging sessions, `mj sync watch`) now emits the batch separator before any statement that would redeclare a variable already declared in the current batch. Save-call variable suffixes are deterministic per record since #4257, so an edit followed by a correction of one record produced two identical `DECLARE` lists in one batch, which SQL Server rejects on replay ("The variable name … has already been declared"). Names are compared case-insensitively and the set resets at each separator; the count-based separator and legacy per-statement mode are unchanged.
