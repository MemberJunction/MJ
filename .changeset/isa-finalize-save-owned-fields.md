---
"@memberjunction/core": patch
---

finalizeSave hydrates from owned fields only. An IS-A child's GetAll() merges parent virtuals the child does not own (OrderHeader on Event Order Line); SetMany no longer throws Field does not exist when a clean leaf is saved after a parent-only stamp.
