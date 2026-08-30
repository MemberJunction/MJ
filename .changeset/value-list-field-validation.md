---
"@memberjunction/core": patch
---

`EntityField.Validate()` now validates value-list fields, so an `IN (…)` CHECK constraint finally has a runtime counterpart (#3969).

A field with `ValueListType = 'List'` carries an exhaustive set of legal values in `__mj.EntityFieldValue`, and MJ used it only to render a dropdown — nothing in `BaseEntity` validated against it. Because CodeGen's `ParseCheckConstraints` turns `CHECK (Status IN ('Active','Inactive'))` into a value list *instead of* a generated `Validate()` method, that class of constraint had no runtime guard at all: an out-of-list value passed every rung of the validation ladder and was refused only by the database, as a raw CHECK violation attributed to no field. The dropdown made the form path safe; `mj sync push`, GraphQL mutations, entity subclasses setting the field in code, Actions and migration-time data loads were all unguarded.

An out-of-list value now fails `Validate()` with a field-named error naming the legal values, the way nullability and MaxLength already do. The rule lives on `EntityFieldInfo.ValueIsPermittedByValueList()`, backed by a normalized set built once per field rather than once per record, since that metadata is shared by every entity instance.

Four boundaries keep it safe: `ListOrUserEntry` is never checked (that mode exists to permit free text), an empty value list never rejects anything but is reported as broken metadata, null/undefined stays the nullability check's job so one mistake yields one error, and a value whose type cannot be compared is permitted and reported rather than guessed at. `date` columns are compared on the calendar date, accepting either the UTC or the local reading of the value, because a value read back from SQL Server arrives as UTC midnight while application code building a date produces local midnight.

The comparison is case-insensitive, trimmed and string-based. Case-insensitivity is load-bearing rather than defensive: two MJ core fields (`MJ: Entity AI Actions`.TriggerEvent and .OutputType) have a SQL default that matches their own value list by case alone, so a case-sensitive comparison would fail validation on creating either record at its database default. Stringifying is required because `EntityFieldValue.Value` is always a string in metadata while a numeric list's runtime value is a number. Trimming covers leading whitespace and stray spaces on the metadata side; trailing padding on fixed-width columns is already stripped by the field's value setter before validation sees it.
