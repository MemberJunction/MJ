---
"@memberjunction/server": patch
---

Saving an `MJ: Entity Permissions` row clears the row-level security filter of every verb it does not grant (`Can<Op>` false), so a row no longer keeps a filter beside a cleared flag (#4398).
