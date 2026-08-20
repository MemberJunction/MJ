---
"@memberjunction/core": patch
---

`EntityField.Validate()` now validates value-list fields, so an `IN (…)` CHECK constraint finally has a runtime counterpart (#3969).

A field with `ValueListType = 'List'` carries an exhaustive set of legal values in `__mj.EntityFieldValue`, and MJ used it only to render a dropdown — nothing in `BaseEntity` validated against it. Because CodeGen's `ParseCheckConstraints` turns `CHECK (Status IN ('Active','Inactive'))` into a value list *instead of* a generated `Validate()` method, that class of constraint had no runtime guard at all: an out-of-list value passed every rung of the validation ladder and was refused only by the database, as a raw CHECK violation attributed to no field. The dropdown made the form path safe; `mj sync push`, GraphQL mutations, entity subclasses setting the field in code, Actions and migration-time data loads were all unguarded.

An out-of-list value now fails `Validate()` with a field-named error naming the legal values, the way nullability and MaxLength already do. Three boundaries keep it safe: `ListOrUserEntry` is never checked (that mode exists to permit free text), an empty value list never rejects anything (missing metadata is not a rule), and null/blank stays the nullability check's job so one mistake yields one error. The comparison is trimmed, case-insensitive and string-based on purpose — MJ's own core entities store value-list values in `char(n)` columns, so an exact comparison would reject padded values that are already in the database, and `EntityFieldValue.Value` is always a string while a numeric value list's runtime value is a number.
