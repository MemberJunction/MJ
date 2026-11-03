---
"@memberjunction/ai-engine-base": patch
"@memberjunction/server": patch
---

Fixes the two UUID-comparison violations that have failed the Source guards check on `next` since #5878. The per-user runnable agent directory checks each permission row against a set of the user's role IDs, built once, instead of scanning the role list for every row. The task-graph continuation compares the acting and initial user IDs with `UUIDsEqual`, which ignores case.
