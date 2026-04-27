---
"@memberjunction/cli": patch
---

Fix migration V202604260056 failure on existing databases by replacing hardcoded CHECK constraint names with dynamic lookups via sys.check_constraints
