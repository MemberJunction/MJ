---
"@memberjunction/core": patch
"@memberjunction/codegen-lib": patch
---

`EntityInfo.ConfigurableAtCreationAttributes` (with the `EntityConfigurableAtCreationAttribute` type) lists the entity flags a per-table CodeGen config entry may set when the entity is first created. It is typed against `EntityInfo`, so a misspelled name fails to compile. CodeGenLib now uses it instead of its own copy.
