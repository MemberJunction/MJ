---
"@memberjunction/core": minor
---

Remove migration script V202603021400**v5.6.x**Optimize_RecordChange_Detection_Index because it would significantly increase database size and cause migration timeouts for AIDP upgrades (it adds an index on RecordChange that included FullRecordJSON).
