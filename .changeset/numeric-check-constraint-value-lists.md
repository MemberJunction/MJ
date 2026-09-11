---
"@memberjunction/codegen-lib": patch
"@memberjunction/core": patch
---

Capture a numeric or single-value `IN (...)` CHECK constraint as an entity field value list (#3978).

SQL Server renders a numeric or `bit` `IN (...)` CHECK with unquoted literals —
`([Level]=(3) OR [Level]=(2) OR [Level]=(1))` — where a string list comes back quoted.
`parseCheckConstraintValues` matched only the quoted form, so a numeric IN-list produced no
`EntityFieldValue` rows and no `ValueListType='List'`: the field lost its validation *and* its
dropdown in Explorer, and with AI codegen off the constraint yielded nothing at all. The same
regexes required at least two values, so a single-value list was never captured for any type.

CodeGen now matches both literal forms and single-value lists, sorts an all-numeric list
numerically, and returns no list rather than an empty one. Two field shapes are excluded after
parsing, each no broader than its reason: a `bit` field (`IN (0,1)` is vacuous and `= 1` is a
validator, not a dropdown) and a primary key carrying a *single* value (`CHECK (ID=1)` is a
single-row-table guard). A multi-value list on a natural-key primary key is still captured, as
it was before.

`@memberjunction/core` compares a numeric column's value list by numeric value rather than by
string form, so `CHECK (Price IN (0.50, 1.00))` accepts the runtime value `1`. Without it the
CodeGen change would make `Validate()` refuse values the database accepts.
