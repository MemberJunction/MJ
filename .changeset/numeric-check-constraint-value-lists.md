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

**If you regenerate against a schema that has one of these constraints, the generated property
narrows.** A value list emits a literal union, so a numeric list now types the property as
`1 | 2 | 3` (and its Zod schema as `z.union([z.literal(1), ...])`) instead of `number` — which
means `entity.Level = someNumber` stops compiling until the value is a literal or the variable is
typed to the union. This is what string value lists have always done; it is newly reachable for
numeric and single-value constraints. Nothing in MJ's own generated code changes: across every
migration MJ ships there are 292 string `IN (...)` CHECKs and no numeric or single-value ones.
`ValueListType='ListOrUserEntry'` is unaffected — it keeps the widened base type.

**SQL Server only.** PostgreSQL renders these constraints differently (`ARRAY[1, 2, 3]` for a
numeric list, and spaced, cast equality such as `((one = 7))` for a single-value one), and
`parsePgArrayConstraint` still extracts quoted elements only — so on PostgreSQL a numeric or
single-value `IN (...)` CHECK continues to produce no value list. Tracked as #4713.
