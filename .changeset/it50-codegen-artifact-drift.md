---
"@memberjunction/core-entities": minor
---

Ship the CodeGen output IT50 checks for: hierarchy TVFs and base-view lateral joins
for the 34 seeded hierarchy fields, the 136 EntityField rows describing those virtual
columns, and the MJ: Form Chrome Rules Entity metadata that V202608151200 assumed a
later CodeGen run would create. Removes the two hierarchy seed entries
(MJ: Employees.SupervisorID, MJ: Entities.ParentID) whose entities have
BaseViewGenerated = 0 and therefore cannot receive hierarchy columns.
