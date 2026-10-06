---
"@memberjunction/codegen-lib": patch
---

Read PostgreSQL's CHECK-constraint value lists, and stop producing partial ones (#4713).

#3978 taught CodeGen to read SQL Server's unquoted numeric `IN (...)` renderings. PostgreSQL writes
the same constraints differently and none of those forms were read: a numeric list produced no
`EntityFieldValue` rows, and a single-value list produced none for any type, so the field lost its
dropdown in Explorer and its runtime validation.

Two shapes were worse than empty. PostgreSQL may quote one element of an array and parenthesize
another — `ARRAY['100000000000'::bigint, (2)::bigint]`, `ARRAY['-1.50'::numeric, 2.25]` — and the
old extractor read only the quoted ones. That produced a value list missing a legal value, so
`EntityField.Validate()` refused a value the database accepts. Element reading is now
all-or-nothing: an array containing anything it cannot read yields no list at all rather than a
partial one.

The PostgreSQL parse is now **anchored on the whole constraint** instead of searching for
`ARRAY[...]` anywhere in the definition. That matters because `(x <> ALL (ARRAY[1, 2]))` (NOT IN)
and `((x = ANY (ARRAY[1, 2])) OR (x > 100))` both contain an array whose elements are *not* the
field's legal values — the first inverts the meaning, the second is a subset. Both were previously
safe only because unquoted elements were unreadable, so reading them without anchoring would have
introduced exactly that bug.

Shapes now parsed, every one captured from a live PostgreSQL 16 via `pg_get_constraintdef()` — the
same function the `vwEntityFieldsWithCheckConstraints` PG view feeds CodeGen: multi-value numeric
(`= ANY (ARRAY[1, 2, 3])`), mixed quoting and nested casts, the nullable `(x IS NULL) OR …` form,
and single-value lists (`(one = 7)`, `((s)::text = 'OnlyOne'::text)`, uuid, text). Booleans stay
out, matching the `bit` exclusion on SQL Server: `true`/`false` are neither quoted nor numeric
literals, and `boolean`/`bool` are also named in the field-level exclusion.

SQL Server parsing is unchanged.
