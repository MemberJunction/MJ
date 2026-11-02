---
"@memberjunction/server": patch
---

A pause that moves jobs while a paused-schedule record is already stored adds them to that record instead of leaving them out, so resume can put them back.
