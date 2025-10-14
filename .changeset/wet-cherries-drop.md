---
"@memberjunction/codegen-lib": minor
"@memberjunction/metadata-sync": patch
---

Fix: Database default value handling in CodeGen and MetadataSync This changeset fixes issues with non-nullable fields that have database-defined default values. CodeGen now properly handles NULL parameters for these fields by wrapping them in ISNULL checks in stored procedures, and MetadataSync correctly applies defaults from .mj-sync.json configuration files.
