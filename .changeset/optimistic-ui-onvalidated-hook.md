---
"@memberjunction/core": minor
---

feat(core): `EntitySaveOptions.OnValidated` — optimistic-UI render hook

An optional callback on `BaseEntity.Save()` that fires after all pre-flight checks pass
(`Validate`, `ValidateAsync`, PreSave hooks) but **before** the database write — the
"render only once known-valid" moment for optimistic UI. Fires exactly once; skipped on
not-dirty, failed validation, and `ReplayOnly` (which bypasses validation); a thrown
callback is swallowed + logged so a UI bug can never abort the persist. `Save()`'s boolean
return contract is unchanged, and there is no server-side behavior change.
