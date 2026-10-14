---
"@memberjunction/core": patch
"@memberjunction/ng-base-forms": patch
---

A record can no longer be saved with a blank name (#4683).

An entity's name field is how every other surface REFERS to the record — FK display, CodeGen's JOIN aliases, search, pickers, related-record grids. A blank one does not corrupt the row; it makes the row unidentifiable everywhere it is referenced from. `EntityField.Validate()` did not refuse it: the nullability rung only rejects `null`, and SQL Server accepts `''` in a NOT NULL column.

`BaseEntity.Validate()` now refuses a blank (trimmed, so whitespace-only counts) value in the field `EntityInfo.NameField` resolves to, with a field-named error. `MjFormFieldComponent.IsRequiredEmpty` mirrors the rule, so the form and the save agree.

Deliberately narrow, and each narrowing is load-bearing:

- **Only the RESOLVED name field**, not every field flagged `IsNameField`. 45 entities flag several (`MJ: Entity Fields` flags `Name`, `DisplayName` and `Entity`); `NameField` applies the tie-break and yields one protected field per entity, so blanking a `DisplayName` stays legal.
- **Only when that column is NOT NULL.** Where the name field is nullable the developer has said absence is legal, and `''` is absence's twin — the column's own declaration is the authority rather than a constraint invented in the application layer.
- **Not-loaded fields are exempt**, for the same reason the required check already exempts them: the save does not write them.

This completes the other half of #4359, which established that `''` is a value rather than absence for every *other* column. A blank name reports one error: the blank-name check runs first and the field's other rules (a value list, say) are skipped for it.

**Behavior change**: saving a record whose name field is blank or whitespace-only now fails validation where it previously succeeded. A scan of three instance databases found no existing rows this would refuse.

The rule lives in `BaseEntity.Validate()` because which field names a record is entity knowledge. `EntityField.Validate()` is unchanged.
