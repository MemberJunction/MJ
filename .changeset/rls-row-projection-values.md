---
"@memberjunction/generic-database-provider": patch
---

The row-level security Create check now renders field values the way lts/6.1 does: a numeric field must hold a number, or the save fails with "value for numeric field <name> does not parse as a number".
