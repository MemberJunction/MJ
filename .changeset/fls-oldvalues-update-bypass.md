---
"@memberjunction/server": patch
"@memberjunction/core": patch
---

Fix a field-level-security bypass where an update-denied field could be written by pinning its value in `OldValues___`.

`ResolverBase.UpdateRecord` may hydrate the entity from the client's `OldValues___` instead of loading the row — an optimization for the case where nothing needs true prior state. That shortcut was unsafe on a field-level-security entity, and the condition guarding it did not account for it.

The chain: a value supplied in `OldValues___` is applied via `LoadFromData`, and the `EntityField` setter records a first set as the field's *initial* value — so the field is not dirty. `BaseEntity.CheckFieldLevelUpdatePermissions` rejects only `field.Dirty && denied`, so it never examined the field. `GenerateSaveSQL` then sent it anyway, because it skips only `NotLoaded` fields and has no dirty filter. The fabricated value reached `spUpdate` having passed every check: pinning a value in `OldValues___`, without ever naming the field in the mutation, was a write to a field the caller may not write.

The existing denied-read strip did not cover this. `StripDeniedReadFieldsFromClientInput` also forces the database load, but only when the caller has at least one denied-**read** field, and it returns early when that set is empty. The canonical FLS configuration — Read Allow + Update Deny, "you can see the salaries but you cannot change them" — leaves that set empty, so nothing forced the load.

The branch condition is now extracted as `ResolverBase.MustLoadTruthFromDatabase` and includes `entityInfo.EnableFieldLevelSecurity`. This closes the hole rather than relocating it: the entity is hydrated by `InnerLoad` from the real row, and `TestAndSetClientOldValuesToDBValues` reads the client's OldValues only to detect concurrent-edit overlap before ending in `SetMany(clientNewValues)` — it never applies them to the entity. An update-denied field can then only become dirty by being named in the mutation input, which is exactly the case the existing check catches. The flag is evaluated last in the condition, so the extra load lands only on entities with the feature enabled.

Also updates the `CheckFieldLevelUpdatePermissions` docblock, which previously named the denied-read strip as the sole premise making dirty-only checking safe server-side. That premise was incomplete and is what the gap hid behind; it now states both resolver behaviours the check depends on and why neither is redundant. `guides/FIELD_LEVEL_SECURITY_GUIDE.md` §2 gains the matching invariant so the branch condition is not "optimized" back later.

Reported by @rkihm-BC in review of #3367.
