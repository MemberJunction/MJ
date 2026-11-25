---
"@memberjunction/cli": patch
"@memberjunction/standards": patch
---

Add `mj doctor value-lists`, which finds rows whose value-list field holds a value outside its list (they fail validation on their next save) and can set named fields to `ListOrUserEntry`. Add the `migration-string-collation` standard, which flags new string columns in migrations that do not declare a collation.
