---
"@memberjunction/sql-parser": patch
---

A template expression already inside a quoted literal (`'{{ X }}'`, `'%{{ X }}%'`) no longer gets a second pair of quotes during placeholder substitution. The doubled quotes made the SQL unparseable, so query field extraction silently returned no fields and saving such a query saved none of its fields. Backport of the SQLParser part of 5513c2a96b.
